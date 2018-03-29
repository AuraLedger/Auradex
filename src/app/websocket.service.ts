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
import * as randomBytes from 'randombytes';

//declare var require: any
//const randombytes = require('randombytes');

@Injectable()
export class WebsocketService {

    socks: any = {};

    constructor(
        private userService: UserService,
        private coinService: CoinService,
        private storage: LocalStorageService,
        private cryptoService: CryptoService
    ) { 

        //test init swap 
        /*
        var that = this;
        var market = this.coinService.marketd['ROP-RNK'];
        var myCoin = market.coin;
        var offer = {
            hash: '1234',
            address: this.userService.getAccount()['Ropsten'].address,
            redeemAddress: this.userService.getAccount()['Rinkeby'].address
        };
        var listing = {
            address: this.userService.getAccount()['Ropsten'].address,
            redeemAddress: this.userService.getAccount()['Rinkeby'].address
        };
        randomBytes(32, function(err, buffer) {
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
                    amount: new BigNumber(0.1),
                    timestamp: DexUtils.UTCTimestamp(),
                    hashedSecret: hashedSecret
                };
                that.userService.getTradePrivateKey(myCoin.name, function(key) {
                    myCoin.node.initSwap(listing, offer, accept, key, (txId) => {
                        that.userService.showSuccess('initSwap completed');
                    }, (error) => {
                        that.userService.handleError(error);
                    });
                }, accept);
            }
        });
        //*/
    }

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
            var that = this;
            var coinAddress, baseAddress, account = this.userService.getAccount();

            //TODO: reconnect after creating/changing account
            //TODO: prompt wallet unlock on startup!!!
            if(account) {
                coinAddress = this.userService.getAccount()[market.coin.name].address;
                baseAddress = this.userService.getAccount()[market.base.name].address;

                this.updateBookBalances(market.coin.name);
                this.updateBookBalances(market.base.name);

                //restore localStorage objects
                for(var i = 0; i < localStorage.length; i++)
                {
                    var key = localStorage.key(i);
                    if(!key.startsWith(market.id))
                        continue;
                    var json = JSON.parse(localStorage.getItem(localStorage.key(i)));
                    this.setNumbers(json);
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
                    this.processMessage(market, json, mine, true);
                }

                this.reevalOfferQueue(market, true);
                this.reevalAcceptQueue(market, true);

                if(market.tradeHandle || market.tradeHandle == 0) {
                    clearInterval(market.tradeHandle);
                    market.tradeHandle = null;
                }
                market.tradeHandle = setInterval(function(){that.processTrades(market);}, 30000);
                this.processTrades(market);
            }

            var ws = this.socks[market.id] = new WebSocket(market.webSocketServerURL);
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

    private processMessage(market, json, mine?: boolean, restore?: boolean) {
        var that = this;
        that.setNumbers(json);

        switch(json.act) {
            case 'bid': mine ? market.addMyListing(json) : that.addListing(json, market, restore); break; 
            case 'ask': mine ? market.addMyListing(json) : that.addListing(json, market, restore); break; 
            case 'cancel': that.cancel(json, market); break;
            case 'offer': mine ? market.addMyOffer(json) : that.addOffer(json, market, restore); break;
            case 'accept': mine ? market.addMyAccept(json) : that.addAccept(json, market, restore); break;

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

    private addListing(listing: ListingMessage, market: Market, restore?: boolean)
    {
        if(market.listings.has(listing.hash))
            return;
        var that = this;
        DexUtils.verifyListing(listing, market.getListingCoin(listing).node, function() {
            market.addListing(listing);
            if(!restore) {
                that.reevalOfferQueue(market);
                that.reevalCancelQueue(market);
            }
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

    private reevalOfferQueue(market: Market, restore?: boolean) {
        var temp = market.offerQueue;
        market.offerQueue = [];
        temp.forEach(offer => this.addOffer(offer, market, restore));
    }

    private addOffer(offer: OfferMessage, market: Market, restore?: boolean): void {
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
                that.considerOffer(market, offer, listing);
                if(restore)
                    return;
                //reevaluate accept queue
                that.reevalAcceptQueue(market);
            }
        }, (err) => {
            console.log(err);
        });
    }

    private considerOffer(market: Market, offer: OfferMessage, listing: ListingMessage) {
        var that = this;
        var potentialAmount = market.getPotentialAcceptAmount(offer);
        var expire = offer.timestamp + (60 * 5); //5 minutes

        if(market.myListings.has(offer.listing) && potentialAmount > 0 && DexUtils.UTCTimestamp() < expire)
        {
            DexUtils.verifyOffer(offer, listing, market.getOfferCoin(offer).node, () => {
                //accept offer
                //TODO: make sure previous verification is thorough
                // you are the lister of the market trade, initiate HTLC swap 
                // Generate random 32byte secret and create RIPEMD160 hash from it 
                var myCoin = market.getListingCoin(listing);
                randomBytes(32, function(err, buffer) {
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
                            var tmpmsg = DexUtils.getAcceptSigMessage(accept);
                            accept.hash = DexUtils.sha3(tmpmsg); // temp hash
                            market.myAccepts.add(accept); //save now incase there are issues when broadcasting tx
                            myCoin.node.initSwap(listing, offer, accept, key, (txId) => {
                                //TODO: need a way for users to manually input a hashedSecret or choose from list to continue the swap in case the initial transaction is mined but this methed fails to return
                                accept.txId = txId;
                                market.accepts.add(accept, true); // save with txId, just in case

                                var msg = DexUtils.getAcceptSigMessage(accept);
                                var tmpHash = accept.hash;

                                accept.hash = DexUtils.sha3(msg);
                                accept.sig = myCoin.node.signMessage(msg, key);

                                //save with new hash
                                market.accepts.add(accept); 
                                market.myAccepts.add(accept); 

                                //remove old hash
                                market.accepts.remove(tmpHash);
                                market.myAccepts.remove(tmpHash);

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
    }

    private reevalAcceptQueue(market: Market, restore?: boolean) {
        var temp = market.acceptQueue;
        market.acceptQueue = [];
        temp.forEach(accept => this.addAccept(accept, market, restore));
    }

    private isMine(msg: any, market: Market): boolean {
        var account = this.userService.getAccount();
        if(account) {
            if(msg.address == account[market.coin.name].address)
                return true;
            if(msg.address == account[market.base.name].address)
                return true;
        }
        return false;
    }

    private addAccept(accept: AcceptMessage, market: Market, restore?: boolean): void {
        if(market.accepts.has(accept.hash)) {
            return;
        }
        var offer = market.offers.get(accept.offer);
        if(!offer) {
            market.acceptQueue.push(accept);
        } else {
            var listing = market.listings.get(offer.listing);

            if(restore) { // don't need to re-verify on restore
                market.addAccept(accept);
                if( this.isMine(listing, market))
                    market.myAccepts.add(accept);
                market.finishMyAccept(accept);
            } else {
                var that = this;
                DexUtils.verifyAccept(accept, offer, listing, market.getListingCoin(listing).node, function() {
                    market.addAccept(accept);
                    if(that.isMine(offer, market))
                        market.myOffers.add(offer); // try to re-add, incase accept comes in after 5 minutes
                }, function(err) {
                    //log but don't show
                    console.log(err);
                });
            }
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

    private proccessAcceptTime(market, accept, offer, listing, theirCoin, fromInitiator: boolean) {
        var that = this;
        var bufferTime = fromInitiator ? 0 : 60 * 60 * 36; // do not participate if more than 12 hours have already passed (less than 36 hour remaining)
        theirCoin.node.getInitTimestamp(accept.hashedSecret, (initTimestamp: number) => {
            if (DexUtils.UTCTimestamp() - initTimestamp > theirCoin.node.confirmTime) { //ensure enough time has passed
                theirCoin.node.getRefundTime(accept.hashedSecret, (refundTime: number) => {
                    if (initTimestamp + refundTime - theirCoin.node.confirmTime - bufferTime < DexUtils.UTCTimestamp()) { //times up, wait for your own refund
                        //TODO: wait 24 hours for your own refund 
                        //or if bufferTime > 0, do nothing (do not participate)
                    } else {
                        if(fromInitiator)
                            that.proccessAcceptParticipation(market, accept, offer, listing, theirCoin);
                        else
                            that.proccessAcceptInitiation(market, accept, offer, listing, theirCoin);
                    }
                }, (err: any) => {
                    that.userService.handleError(err);
                });
            }
        }, (err: any) => {
            that.userService.handleError(err);
        });
    }

    private proccessAcceptParticipation(market: Market, accept: AcceptMessage, offer: OfferMessage, listing: ListingMessage, theirCoin: Coin) {
        var that = this;
        theirCoin.node.getEmptied(accept.hashedSecret, (emptied: boolean) => {
            if(emptied) {
                that.abortAccept(market, accept, 'swap has already been completed for hashedSecret ' + accept.hashedSecret);
                return;
            }
            theirCoin.node.getInitiator(accept.hashedSecret, (initiator: string) => {
                if (initiator != listing.redeemAddress) {
                    that.abortAccept(market, accept, 'swap was sent to wrong address, got ' + initiator + ' instead of ' + listing.redeemAddress);
                    return;
                }
                theirCoin.node.getValue(accept.hashedSecret, (value: BigNumber) => {
                    var amount = accept.amount;
                    if(listing.act == 'ask')
                        amount = amount.times(listing.price);

                    if(amount != value) {
                        that.abortAccept(market, accept, 'swap participated with wrong amount, got ' + value + ' was expeting ' + amount);
                        return;
                    } else {
                        //participation appears valid redeem
                        that.userService.getTradePrivateKey(theirCoin.name, function(key) {
                            theirCoin.node.redeemSwap(listing.redeemAddress, accept.hashedSecret, that.storage.get(accept.hashedSecret), key, (txId: string): void => {
                                offer.txId = txId;
                                market.offers.add(offer, true);
                                //TODO: don't assume complete until we have checked for reciept && confirm time
                                that.finishAccept(market, accept);
                                that.userService.showSuccess('Swap complete tx: ' + txId);
                            }, (err) => {
                                that.userService.handleError(err);
                            }); 
                        });
                    }
                }, (err: any) => {
                    that.userService.handleError(err);
                });
            }, (err: any) => {
                that.userService.handleError(err);
            });
        }, (err: any) => {
            that.userService.handleError(err);
        });
    }

    private proccessAcceptInitiation(market: Market, accept: AcceptMessage, offer: OfferMessage, listing: ListingMessage, theirCoin: Coin) {
        var that = this;
        theirCoin.node.getEmptied(accept.hashedSecret, (emptied: boolean) => {
            if(emptied) {
                that.abortAccept(market, accept, 'swap has already been completed for hashedSecret ' + accept.hashedSecret);
                return;
            }
            theirCoin.node.getParticipant(accept.hashedSecret, (participant: string) => {
                if (participant != offer.redeemAddress) {
                    that.abortAccept(market, accept, 'swap was sent to wrong address, got ' + participant + ' instead of ' + offer.redeemAddress);
                    return;
                }
                theirCoin.node.getValue(accept.hashedSecret, (value: BigNumber) => {
                    var amount = accept.amount;
                    if(listing.act == 'bid')
                        amount = amount.times(listing.price);

                    if(amount != value) {
                        that.abortAccept(market, accept, 'swap initiated with wrong amount, got ' + value + ' was expeting ' + amount);
                        return;
                    } else {
                        //initiation appears valid participate 
                        var myCoin = market.getListingCoin(listing);
                        that.userService.getTradePrivateKey(myCoin.name, function(key) {
                            myCoin.node.acceptSwap(listing, offer, accept, key, (txId: string): void => {
                                offer.txId = txId;
                                market.offers.add(offer, true); //save
                                that.userService.showSuccess('Swap participated: ' + txId);
                            }, (err) => {
                                that.userService.handleError(err);
                            }); 
                        });
                    }
                }, (err: any) => {
                    that.userService.handleError(err);
                });
            }, (err: any) => {
                that.userService.handleError(err);
            });
        }, (err: any) => {
            that.userService.handleError(err);
        });
    }

    private redeemOffer(offer: OfferMessage, market: Market, theirCoin: Coin, accept: AcceptMessage, myCoin: Coin) {
        var that = this;
        //TODO: check for emptied first
        myCoin.node.getSecret(accept.hashedSecret, (secret: string) => {
            if(secret && secret.length == 64) {
                //participation appears valid redeem
                that.userService.getTradePrivateKey(theirCoin.name, function(key) {
                    theirCoin.node.redeemSwap(offer.redeemAddress, accept.hashedSecret, secret, key, (txId: string): void => {
                        accept.txId = txId;
                        market.accepts.add(accept, true);
                        //TODO: don't assume complete until we have check for reciept && confirm time
                        that.finishOffer(market, offer);
                        that.userService.showSuccess('Swap complete tx: ' + txId);
                    }, (err) => {
                        that.userService.handleError(err);
                    }); 
                });
            } else {
                myCoin.node.getInitTimestamp(accept.hashedSecret, (initTimestamp: number) => {
                    myCoin.node.getRefundTime(accept.hashedSecret, (refundTime: number) => {
                        if (initTimestamp + refundTime < DexUtils.UTCTimestamp()) { //times up, get refund
                            that.userService.getTradePrivateKey(myCoin.name, function(key) {
                                myCoin.node.refundSwap(offer.address, accept.hashedSecret, key, (txId: string): void => {
                                    //TODO: don't assume complete until we have check for reciept && confirm time
                                    that.finishOffer(market, offer);
                                    that.userService.showSuccess('Swap refunded tx: ' + txId);
                                }, (err) => {
                                    that.userService.handleError(err);
                                }); 
                            });
                        }             
                    }, (err: any) => {
                        that.userService.handleError(err);
                    });
                }, (err: any) => {
                    that.userService.handleError(err);
                });
            }
        }, (err) => {
            that.userService.handleError(err);
        }); 
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

                //TODO: make sure my accept went through, check tx reciept
                //myCoin.node.validateTx(accept.txId);

                theirCoin.node.getState(accept.hashedSecret, (state: number) => {
                    switch(state) {
                        case 0: //they haven't participated, keep waiting
                            //TODO: if 48 hours pass, get refund
                            break;
                        case 1:
                            that.abortAccept(market, accept, 'swap was initiated, was expecting participated, hashedSecret ' + accept.hashedSecret);
                            //TODO: wait 48 hours to get refund
                            break;
                        case 2:
                            that.proccessAcceptTime(market, accept, offer, listing, theirCoin, true);
                            break;
                        default:
                            that.abortAccept(market, accept, 'invalid swap state ' + state + ', hashedSecret ' + accept.hashedSecret);
                            console.log('invalid swap state ' + state);
                            console.log(accept);
                            console.log(offer);
                            console.log(listing);
                            break;
                    }
                }, (err: any) => {
                    that.userService.handleError(err);
                });
            } catch(error) {
                that.userService.handleError(error);
            }
        });

        market.myOffers.array.forEach(offer => {
            try { //run all in try/catch so that one error doesn't hose the rest 
                if(market.offerAccept.hasOwnProperty(offer.hash))
                {
                    var accept = market.offerAccept[offer.hash];
                    var listing = market.listings.get(offer.listing);
                    var myCoin = market.getOfferCoin(offer);
                    var theirCoin = market.getListingCoin(listing);

                    if(offer.txId){ //we've participated, wait for secret to get our funds, or refund
                        that.redeemOffer(offer, market, theirCoin, accept, myCoin);
                        return;
                    }

                    myCoin.node.getState(accept.hashedSecret, (state: number) => {
                        switch(state) {
                            case 0: //we haven't participated, verify their initiation
                                theirCoin.node.getState(accept.hashedSecret, (state: number) => {
                                    switch(state) {
                                        case 0: //they haven't initiated, keep waiting
                                            //TODO: if 1 hours pass, abort since they should have completed the tx before sending the accept message 
                                            that.abortAccept(market, accept, 'swap was participated, was expecting initiated, hashedSecret ' + accept.hashedSecret);
                                            //TODO: abort offer too?
                                            break;
                                        case 1:
                                            that.proccessAcceptTime(market, accept, offer, listing, theirCoin, false);
                                            break;
                                        case 2:
                                            that.abortAccept(market, accept, 'swap was participated, was expecting initiated, hashedSecret ' + accept.hashedSecret);
                                            break;
                                        default:
                                            that.abortAccept(market, accept, 'invalid swap state ' + state + ', hashedSecret ' + accept.hashedSecret);
                                            console.log('invalid swap state ' + state);
                                            console.log(accept);
                                            console.log(offer);
                                            console.log(listing);
                                            break;
                                    }
                                }, (err: any) => {
                                    that.userService.handleError(err);
                                });
                                break;
                            case 1:
                                that.abortAccept(market, accept, 'swap was initiated, was expecting participated, hashedSecret ' + accept.hashedSecret);
                                //TODO: wait 48 hours to get refund
                                break;
                            case 2:
                                //TODO: why wasn't txId saved on offer?
                                //we've participated, wait for secret to get our funds, or refund
                                that.redeemOffer(offer, market, theirCoin, accept, myCoin);
                                break;
                            default:
                                that.abortAccept(market, accept, 'invalid swap state ' + state + ', hashedSecret ' + accept.hashedSecret);
                                console.log('invalid swap state ' + state);
                                console.log(accept);
                                console.log(offer);
                                console.log(listing);
                                break;
                        }
                    }, (err: any) => {
                        that.userService.handleError(err);
                    });

                } else { //no accept, remove from myOffers after 5 minutes, TODO: put back in on acceptance
                    var expire = offer.timestamp + (60 * 5); //5 minutes
                    if(DexUtils.UTCTimestamp() > expire)
                    {
                        market.myOffers.remove(offer.hash);
                    }
                }
            } catch(error) {
                that.userService.handleError(error);
            }
        });
        //TODO: remove offers for listings that accepted other offers, and remove those listings (after 48 hours)
        //TODO: don't accept listings/offers/accepts more than 5 minutes past their timestamp unless they are specifically asked for (on startup)
    }
}
