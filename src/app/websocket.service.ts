import { Injectable } from '@angular/core';
import { Coin } from './coin';
import { Market } from './market';
import { UserService } from './user.service';
import { CoinService } from './coin.service';
import { ListingMessage, DexUtils, CancelMessage, OfferMessage, AcceptMessage, SwapInfo, INode } from './lib/libauradex';
import { BigNumber } from 'bignumber.js';

import { LocalStorageService } from 'angular-2-local-storage';
import { CryptoService } from './crypto.service';
import * as RIPEMD160 from 'ripemd160';
import * as randombytes from 'randombytes';

@Injectable()
export class WebsocketService {

    socks: any = {};

    constructor(
        private userService: UserService,
        private coinService: CoinService,
        private storage: LocalStorageService,
        private cryptoService: CryptoService
    ) { }

    disconnectAll() {
        Object.keys(this.socks).filter(k => this.socks.hasOwnProperty(k)).forEach(k => {
            this.socks[k].send('{"act":"disconnect"}');
            this.socks[k].close();
            this.socks[k].terminate();
        });        
        this.socks = {};
    }

    connect(market: Market, cb?) {
        if(!this.socks.hasOwnProperty(market.id))
        {
            var ws = this.socks[market.id] = new WebSocket(market.webSocketServerURL);
            var coinAddress, baseAddress, account = this.userService.getAccount();

            //TODO: reconnect after creating/changing account
            if(account) {
                coinAddress = this.userService.getAccount()[market.coin.name].address;
                baseAddress = this.userService.getAccount()[market.base.name].address;

                this.updateBookBalances(market.coin.name);
                this.updateBookBalances(market.base.name);

                //restore localStorage objects
                for(var i = 0; i < localStorage.length; i++)
                {
                    var json = JSON.parse(localStorage.getItem(localStorage.key(i)));
                    var mine = false;
                    if(json.address == coinAddress || json.address == baseAddress) {
                        mine = true;
                    }
                    if(json.act == 'offer') {
                        market.offerQueue.push(json);
                        continue;
                    }
                    if(json.act == 'accept') {
                        market.acceptQueue.push(json);
                        continue
                    }
                    this.processMessage(market, json, mine);
                }

                this.reevalOfferQueue(market);
                this.reevalAcceptQueue(market);
            }

            var that = this;
            ws.onmessage = function(evt) {
                var json = JSON.parse(evt.data);

                //TODO: add some indicator that your message has been recieved by the server
                if(json.address == coinAddress || json.address == baseAddress)
                    return; // ignore your own messages if they are sent back to you

                that.setNumbers(json);

                that.processMessage(market, json);
            };

            if(cb)
                cb(ws);
        }
    }

    private processMessage(market, json, mine?: boolean) {
        var that = this;
        that.setNumbers(json);

        switch(json.act) {
            case 'bid': mine ? market.addMyListing(json) : that.addListing(json, market); break; 
            case 'ask': mine ? market.addMyListing(json) : that.addListing(json, market); break; 
            case 'cancel': that.cancel(json, market); break;
            case 'offer': mine ? market.addMyOffer(json) : that.addOffer(json, market); break;
            case 'accept': mine ? market.addMyAccept(json) : that.addAccept(json, market); break;

                //TODO: need really good fee estimation
            case 'setFeeRates': that.setFeeRates(json, market); break;
            case 'peers': market.peers = json.peers;
            case 'err': that.userService.handleError(json.err); break; //should only come from server
        }
    }

    /**
     * Converts strings to BigNumbers on incoming AuradexApi messages
     */
    private setNumbers(json: any): void {
        this.setAttributeNumber(json, 'amount');
        this.setAttributeNumber(json, 'min');
        this.setAttributeNumber(json, 'price');
        this.setAttributeNumber(json, 'coinFeeRate');
        this.setAttributeNumber(json, 'baseFeeRate');
    }

    private setAttributeNumber(json: any, attr: string) {
        try {
            if(json.hasOwnProperty(attr))
                json[attr] = new BigNumber(json[attr]);
        } catch(error) {
            //log but don't prevent other conversions
            console.log('error convering attribute ' + attr + ' on act ' + json.act + ' with value ' + json[attr]);
            console.log(error);
        }
    }

    //TODO: attempt to restore listings/offers when reconnecting, but factor in current book balances and coin balances
    updateBookBalances(coin: string) {
        var that = this;
        var marketIds = Object.keys(this.socks).filter(k => that.socks.hasOwnProperty(k));
        var sum = new BigNumber(0);

        marketIds.forEach(id => {
            var market = that.coinService.marketd[id];
            if(market.coin.name == coin)
                sum = sum.plus(market.getCoinBookBalance());
            else if (market.base.name == coin)
                sum = sum.plus(market.getBaseBookBalance());
        });

        marketIds.forEach(id => {
            var market = that.coinService.marketd[id];
            if(market.coin.name == coin)
                market.coinAvailable = BigNumber.maximum(market.coinBalance.minus(sum), 0);
            else if (market.base.name == coin)
                market.baseAvailable = BigNumber.maximum(market.baseBalance.minus(sum), 0);
        });
    }

    cancel(obj: CancelMessage, market) {
        var listing = market.listings.get(obj.listing);
        if(!listing)
            market.cancelQueue.push(obj);
        else {
            DexUtils.verifyCancelSig(obj, market.getListingCoin(listing).node, listing.address, () => {
                market.cancel(obj);
            }, (error) => {
                //log but don't show
                console.log(error);
            });
        }
    }

    setFeeRates(obj, market) {
        market.coin.node.setFeeRate(obj.coinFeeRate);
        market.base.node.setFeeRate(obj.baseFeeRate);
    }

    //TODO: check connection state, and try to reconnect, or throw/show error
    getSocket(market: Market, cb) {
        if(this.socks.hasOwnProperty(market.id))
            cb(this.socks[market.id]);
        else
            this.connect(market, cb);
    }

    private addListing(listing: ListingMessage, market: Market)
    {
        if(market.listings.has(listing.hash))
            return;
        var that = this;
        DexUtils.verifyListing(listing, market.getListingCoin(listing).node, function() {
            market.addListing(listing);
            that.reevalOfferQueue(market);
            that.reevalCancelQueue(market);
        }, function(err) {
            //log but don't show
            console.log(err);
        });
    }

    private reevalCancelQueue(market: Market) {
        var temp = market.cancelQueue;
        market.cancelQueue = [];
        temp.forEach(cncl => this.cancel(cncl, market));
    }

    private reevalOfferQueue(market: Market) {
        var temp = market.offerQueue;
        market.offerQueue = [];
        temp.forEach(offer => this.addOffer(offer, market));
    }

    private addOffer(offer: OfferMessage, market: Market): void {
        if(market.offers.has(offer.hash)) {
            return;
        }
        var that = this;
        DexUtils.verifyOfferSig(offer, market.base.node, offer.address, () => {
            var listing = market.listings.get(offer.listing);
            if(!listing) {
                market.offerQueue.push(offer)
            }
            else {
                market.addOffer(offer);
                var potentialAmount = market.getPotentialAcceptAmount(offer);
                if(market.myListings.has(offer.listing) && potentialAmount > 0)
                {
                    DexUtils.verifyOffer(offer, listing, market.getOfferCoin(offer).node, () => {
                        //accept offer
                        //TODO: make sure previous verification is thorough
                        // you are the lister of the market trade, initiate HTLC swap 
                        // Generate random 32byte secret and create RIPEMD160 hash from it 
                        var myCoin = market.getListingCoin(listing);
                        randombytes.getRandomBytes(32, function(err, buffer) {
                            if(err)
                                that.userService.handleError(err);
                            else {
                                var secret = buffer.toString('hex');
                                var hashedSecret = new RIPEMD160().update(buffer).digest('hex');
                                that.storage.set(hashedSecret, secret);
                                //initiate HTLC swap
                                var accept: any = {
                                    act: 'accept', 
                                    offer: offer.hash,
                                    amount: potentialAmount,
                                    timestamp: DexUtils.UTCTimestamp(),
                                    hashedSecret: hashedSecret
                                };
                                that.userService.getTradePrivateKey(myCoin.name, function(key) {
                                    market.addMyAccept(accept); //save now incase there are issues when broadcasting tx
                                    myCoin.node.initSwap(listing, offer, accept, key, (txId) => {
                                        //TODO: need a way for users to manually input a transaction id to continue the swap in case the initial transaction is mined but this methed fails to return
                                        accept.txId = txId;
                                        market.accepts.add(accept, true); // save with txId, just in case
                                        var msg = DexUtils.getAcceptSigMessage(accept);
                                        accept.hash = DexUtils.sha3(msg);
                                        accept.sig = myCoin.node.signMessage(msg, key);
                                        market.accepts.add(accept, true); // save again
                                        market.finishMyAccept(accept);
                                        that.getSocket(market, function(ws) {
                                            ws.send(JSON.stringify(accept));
                                        });
                                        that.updateBookBalances(myCoin.name);
                                    }, (error) => {
                                        that.userService.handleError(error);
                                    });
                                }, accept);
                            }
                        });
                    }, (err) => {
                        console.log(err);
                    });
                };
                //reevaluate accept queue
                that.reevalAcceptQueue(market);
            }
        }, (err) => {
            console.log(err);
        });
    }

    private reevalAcceptQueue(market: Market) {
        var temp = market.acceptQueue;
        market.acceptQueue = [];
        temp.forEach(accept => this.addAccept(accept, market));
    }

    private addAccept(accept: AcceptMessage, market: Market): void {
        if(market.accepts.has(accept.hash)) {
            return;
        }
        var offer = market.offers.get(accept.offer);
        if(!offer) {
            market.acceptQueue.push(accept);
        } else {
            var listing = market.listings.get(offer.listing);
            DexUtils.verifyAccept(accept, offer, listing, market.getListingCoin(listing).node, function() {
                market.addAccept(accept);
            }, function(err) {
                //log but don't show
                console.log(err);
            });
        }
    }

    private abortAccept(market, accept: AcceptMessage, reason?: string) {
        market.aborted.add(accept);
        market.myAccepts.remove(accept);
        this.userService.showError(reason);
    }

    private finishAccept(market, accept) {
        market.finished.add(accept);
        market.myAccepts.remove(accept);
    }
    private abortOffer(market, offer, reason?: string) {
        market.aborted.add(offer);
        market.myOffers.remove(offer);
        this.userService.showError(reason);
    }

    private finishOffer(market, offer) {
        market.finished.add(offer);
        market.myOffers.remove(offer);
    }

    //TODO: should be called periodically, probably every 30 seconds is sufficient
    //might need to increase frequency when lightning/plasma/raiden is implemented
    //or switch to an event based model and subscribe to nodes connected via websockets
    processTrades(market: Market) {
        var that = this;
        market.myAccepts.array.forEach(accept => {
            try { //run all in try/catch so that one error doesn't hose the rest
                var offer = market.offers.get(accept.offer);
                var listing = market.myListings.get(offer.listing);
                var theirCoin = market.getOfferCoin(offer);
                theirCoin.node.getSwapInfo(accept.hashedSecret, (swap: SwapInfo) => {
                    if(swap.state == 0) {
                        //they haven't participated, keep waiting
                    } else if (DexUtils.UTCTimestamp() - swap.initTimestamp < theirCoin.node.confirmTime) {
                        //hasn't been confirmed long enough, keep wiating
                    } else {
                        var amount = accept.amount;
                        if(listing.act == 'ask')
                            amount = amount * listing.price;

                        if(amount != swap.value) {
                            that.abortAccept(market, accept, 'swap participated with wrong amount, got ' + swap.value + ' was expeting ' + amount);
                            //TODO: use bignumber everywhere to minimize rounding errors
                        } else if (swap.initiator != listing.redeemAddress) {
                            that.abortAccept(market, accept, 'swap was sent to wrong address, got ' + swap.initiator + ' instead of ' + listing.redeemAddress);
                        } else if (swap.emptied) {
                            that.abortAccept(market, accept, 'swap has already been completed for hashedSecret ' + accept.hashedSecret);
                        } else if (swap.state == 1)
                        {
                            that.abortAccept(market, accept, 'swap was initiated, was expecting participated, hashedSecret ' + accept.hashedSecret);
                        } else if (swap.state != 2) {
                            that.abortAccept(market, accept, 'invalid swap state ' + swap.state + ', hashedSecret ' + accept.hashedSecret);
                        } else {
                            if (swap.initTimestamp + swap.refundTime < DexUtils.UTCTimestamp()) {
                                //trade has expired TODO: try to refund your initiation -- may have to wait until yours unlocks
                            } //attempt to redeem anyway incase local timestamp is off

                            //participation appears valid redeem
                            that.userService.getTradePrivateKey(theirCoin.name, function(key) {
                                theirCoin.node.redeemSwap(listing.redeemAddress, accept.hashedSecret, that.storage.get(accept.hashedSecret), key, (txId: string): void => {
                                    that.finishAccept(market, accept);
                                    that.userService.showSuccess('Swap complete tx: ' + txId);
                                }, (err) => {
                                    that.userService.handleError(err);
                                }); 
                            });
                        }
                    }

                }, (error) => {
                    that.userService.handleError(error);
                });
            } catch(error) {
                that.userService.handleError(error);
            }
        });

        market.myOffers.array.forEach(offer => {
            try { //run all in try/catch so that one error doesn't hose the rest

                //see if they've accepted
                if(market.offerAccept.hasOwnProperty(offer.hash))
                {
                    var accept = market.offerAccept[offer.hash];
                    var myCoin = market.getOfferCoin(offer);
                    //check participate
                    myCoin.node.getSwapInfo(accept.hashedSecret, (swap: SwapInfo) => {
                        if(swap.state == 0) {
                            //participate
                            if(!offer.txId) {
                                //validate intiation
                                var listing = market.listings.get(offer.listing);
                                var theirCoin = market.getListingCoin(listing);
                                //check initiate
                                theirCoin.node.getSwapInfo(accept.hashedSecret, (swap: SwapInfo) => {
                                    if(swap.state == 0) {
                                        //they haven't initated, keep waiting
                                    } else if (DexUtils.UTCTimestamp() - swap.initTimestamp < theirCoin.node.confirmTime) {
                                        //hasn't been confirmed long enough, keep wiating
                                    } else {
                                        var amount = accept.amount;
                                        if(listing.act == 'bid')
                                            amount = amount * listing.price;

                                        if(amount != swap.value) {
                                            that.abortOffer(market, offer, 'swap initiated with wrong amount, got ' + swap.value + ' was expeting ' + amount);
                                            //TODO: use bignumber everywhere to minimize rounding errors
                                        } else if (swap.participant != offer.redeemAddress) {
                                            that.abortOffer(market, offer, 'swap was sent to wrong address, got ' + swap.participant + ' instead of ' + offer.redeemAddress);
                                        } else if (swap.emptied) {
                                            that.abortOffer(market, offer, 'swap has already been completed for hashedSecret ' + accept.hashedSecret);
                                        } else if (swap.state == 2)
                                        {
                                            that.abortOffer(market, offer, 'swap was participated, was expecting initiated, hashedSecret ' + accept.hashedSecret);
                                        } else if (swap.state != 1) {

                                            that.abortOffer(market, offer, 'invalide swap state ' + swap.state + ', hashedSecret ' + accept.hashedSecret);
                                        } else if (swap.initTimestamp + swap.refundTime < DexUtils.UTCTimestamp() + 60 * 60 * 30) {
                                            //TODO: make time spans dynamic, maybe base on user settings
                                            //there is less than 30hrs left on their initiation, don't participate, abort
                                            that.abortOffer(market, offer, 'swap has less than 30 hours left: hashedSecret: ' + accept.hashedSecret);
                                        } 
                                        else {
                                            //initiation appears valid participate
                                            that.userService.getTradePrivateKey(myCoin.name, function(key) {
                                                myCoin.node.acceptSwap(accept, offer, listing, key, (txId: string) => {
                                                    offer.txId = txId;
                                                    market.offers.add(offer, true); // save
                                                }, (error) => {
                                                    that.userService.handleError(error);
                                                });
                                            });
                                        }
                                    }
                                }, (err) => {
                                    that.userService.handleError(err);
                                });
                            } else {
                                //we have a participate txId, wait for it to be mined
                            }
                        } else { 
                            if (swap.state == 1) {
                                that.userService.handleError('Was expecting participated state, got initiated: hashedSecret ' + accept.hashedSecret);
                            } else if (swap.state != 2) {
                                that.userService.handleError('invalid swap state ' + swap.state + ' : hashedSecret ' + accept.hashedSecret);
                            }

                            //if there is a valid secret, try to redeem with it
                            if(swap.secret && !swap.emptied)
                            {
                                that.userService.getTradePrivateKey(myCoin.name, function(key) {
                                    theirCoin.node.redeemSwap(offer.redeemAddress, accept.hashedSecret, swap.secret, key, (txId: string) => {
                                        that.finishOffer(market, offer);
                                        that.userService.showSuccess('Swap complete tx: ' + txId);
                                    }, (error) => {
                                        that.userService.handleError(error); 
                                    });
                                });
                            } else if (swap.emptied) {
                                that.abortOffer(market, offer, 'swap with hashedSecret ' + accept.hashedSecret + ' has already been emptied');
                            }
                        }
                    }, (err) => {
                        that.userService.handleError(err);
                    });
                }
            } catch(error) {
                that.userService.handleError(error);
            }
        });
        //TODO: remove offers for listings that accepted other offers, and remove those listings (after 48 hours)
        //TODO: don't accept listings/offers/accepts more than 5 minutes past their timestamp unless they are specifically asked for (on startup)
    }
}
