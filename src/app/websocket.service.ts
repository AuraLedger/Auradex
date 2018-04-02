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
            //TODO: restore or check local storage on start up, and auto connect to markets with active trades/listings
            if(account) {
                this.updateBookBalances(market.coin.name);
                this.updateBookBalances(market.base.name);

                coinAddress = account[market.coin.name].address;
                baseAddress = account[market.base.name].address;

                market.offers.array.forEach(o => that.considerOffer(market, o, market.listings.get(o.listing)));

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
                json.receivedon = DexUtils.UTCTimestamp();

                //TODO: add some indicator that your message has been recieved by the server
                if(json.address == coinAddress || json.address == baseAddress)
                    return; // ignore your own messages if they are sent back to you

                that.processMessage(market, json);
            };

            if(cb)
                cb(ws);
        }
    }

    public processMessage(market, json, mine?: boolean, restore?: boolean) {
        var that = this;
        that.setNumbers(json);

        switch(json.act) {
            case 'bid': //fall through
            case 'ask': mine ? market.addMyListing(json) : that.addListing(json, market, restore); break; 
            case 'cancel': that.cancel(json, market); break;
            case 'offer': mine ? market.addMyOffer(json) : that.addOffer(json, market, restore); break;
            case 'accept': mine ? market.addMyAccept(json) : that.addAccept(json, market, restore); break;

                //TODO: need really good fee estimation
            case 'peers': market.peers = json.peers; break;
            case 'err': that.userService.handleError(json.err); break; //should only come from server
        }
    }

    /**
     * Converts strings to BigNumbers on incoming AuradexApi messages
     */
    setNumbers(json: any): void {
        this.setAttributeNumber(json, 'amount');
        this.setAttributeNumber(json, 'min');
        this.setAttributeNumber(json, 'price');
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
        DexUtils.verifyListingFull(listing, market.getListingCoin(listing).node, new BigNumber('1e100'), false, function() {
            listing.remaining = listing.amount;
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

    reevalCancelQueue(market: Market) {
        var temp = market.cancelQueue;
        market.cancelQueue = [];
        temp.forEach(cncl => this.cancel(cncl, market));
    }

    reevalOfferQueue(market: Market, restore?: boolean) {
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
                if(restore) {
                    if(that.isMine(offer, market))
                        market.myOffers.add(offer);
                    return;
                }

                that.considerOffer(market, offer, listing);
                that.reevalAcceptQueue(market);
            }
        }, (err) => {
            console.log(err);
        });
    }

    //TODO: add newtwork timestamp check on startup, and prompt user to resync/update computer clock time if it varies too much from the rest of network
    private considerOffer(market: Market, offer: OfferMessage, listing: ListingMessage) {
        var that = this;
        var potentialAmount = market.getPotentialAcceptAmount(offer);
        var expire = offer.timestamp + (60 * 5); //5 minutes TODO: reconsider this limitation

        if(market.myListings.has(offer.listing) && potentialAmount.isGreaterThan(0) && DexUtils.UTCTimestamp() < expire && !market.offerAccept.hasOwnProperty(offer.hash))
        {
            DexUtils.verifyOffer(offer, listing, false, market.getOfferCoin(offer).node, () => {
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
                        var stagedAccept: AcceptMessage = {
                            act: 'accept', 
                            offer: offer.hash,
                            amount: potentialAmount,
                            timestamp: DexUtils.UTCTimestamp(),
                            hashedSecret: hashedSecret,
                            txId: null  
                        };
                        that.userService.getTradePrivateKey(myCoin.name, function(key) {
                            var tmpmsg = DexUtils.getAcceptSigMessage(stagedAccept);
                            stagedAccept.hash = 'staged' + hashedSecret; // temp hash
                            market.stagedAccepts.add(stagedAccept); //save now incase there are issues when broadcasting tx
                            market.offerAccept[offer.hash] = stagedAccept; // TODO: add view of staged offers with options to re-init and recheck the blockchain for hashedsecret
                            myCoin.node.initSwap(listing, offer, stagedAccept, key, (txId) => {
                                //TODO: need a way for users to manually input a hashedSecret or choose from staged accepts to continue the swap in case the initial transaction is mined but this methed fails to return
                                //TODO: don't assume complete until we have checked for reciept && confirm time
                                stagedAccept.txId = txId;
                                market.stagedAccepts.add(stagedAccept, true); // save with txId, just in case

                                var accept: AcceptMessage = <any>{};
                                Object.assign(accept, stagedAccept); //copy to new object
                                var msg = DexUtils.getAcceptSigMessage(accept);

                                accept.hash = DexUtils.sha3(msg);
                                accept.sig = myCoin.node.signMessage(msg, key);

                                //save new hash
                                market.accepts.add(accept); 
                                market.myAccepts.add(accept);
                                market.offerAccept[offer.hash] = accept;

                                //remove staged accept 
                                market.stagedAccepts.remove(stagedAccept.hash);

                                market.finishMyAccept(accept);
                                that.getSocket(market, function(ws) {
                                    ws.send(JSON.stringify(accept));
                                });
                                that.updateBookBalances(myCoin.name);
                            }, (error) => {
                                that.userService.handleError(error);
                            });
                        }, stagedAccept);
                    }
                });
            }, (err) => {
                console.log(err);
            });
        };
    }

    reevalAcceptQueue(market: Market, restore?: boolean) {
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

    //TODO: check timestamps on all messages, ignore after 4 days
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
                if(this.isMine(listing, market) && !accept.finished)
                    market.myAccepts.add(accept);
                else if (this.isMine(offer, market) && accept.finished)
                    market.myOffers.remove(offer.hash);
                market.finishMyAccept(accept);
            } else {
                var that = this;
                DexUtils.verifyAcceptSig(accept, market.getListingCoin(listing).node, listing.address, function() {
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

    private abortAccept(market: Market, accept: AcceptMessage, reason?: string) {
        market.myAccepts.remove(accept.hash);
        this.userService.showError(reason);
    }

    //TODO: wrap messages in client side object to prevent recieving fake data
    //TODO: check for txId on offer to determine finished state
    private finishAccept(market: Market, accept: AcceptMessage) {
        market.myAccepts.remove(accept.hash);
        accept.finished = true;
        market.accepts.add(accept, true); //save + overwrite
    }

    private abortOffer(market: Market, offer: OfferMessage, reason?: string) {
        market.myOffers.remove(offer.hash);
        this.userService.showError(reason);
    }

    //TODO: check for txId on accept to determine finished state
    private finishOffer(market: Market, offer: OfferMessage, accept: AcceptMessage) {
        market.myOffers.remove(offer.hash);
        accept.finished = true;
        market.accepts.add(accept, true); //save + overwrite
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
                that.finishAccept(market, accept);
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

                    if(!amount.eq(value)) {
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
                that.finishAccept(market, accept);
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

                    if(!amount.eq(value)) {
                        that.abortAccept(market, accept, 'swap initiated with wrong amount, got ' + value + ' was expeting ' + amount);
                        return;
                    } else {
                        //initiation appears valid participate 
                        var myCoin = market.getOfferCoin(offer);
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

    //TODO: check message timestamps first before refund checks
    private redeemOffer(offer: OfferMessage, market: Market, theirCoin: Coin, accept: AcceptMessage, myCoin: Coin) {
        var that = this;
        //TODO: check for emptied first
        myCoin.node.getEmptied(accept.hashedSecret, (emptied: boolean) => {
            if(emptied) {
                that.abortOffer(market, offer, 'swap has already been completed for hashedSecret ' + accept.hashedSecret);
                that.finishOffer(market, offer, accept);
                return;
            }
        myCoin.node.getSecret(accept.hashedSecret, (secret: string) => { // if we get a valid secret, it means they have redeemed so we can now redeem 
            if(secret && secret.length == 64 && secret != DexUtils.BAD_SECRET) {
                //participation appears valid redeem
                that.userService.getTradePrivateKey(theirCoin.name, function(key) {
                    if(key) {
                        theirCoin.node.redeemSwap(offer.redeemAddress, accept.hashedSecret, secret, key, (txId: string): void => {
                            //TODO: store redeem transaction on accept object, in a new field
                            market.accepts.add(accept, true);
                            //TODO: don't assume complete until we have check for reciept && confirm time
                            that.finishOffer(market, offer, accept);
                            that.userService.showSuccess('Swap complete tx: ' + txId);
                        }, (err) => {
                            that.userService.handleError(err);
                        }); 
                    } else {
                        that.userService.showError('unable to unlock account to complete a swap');
                    }
                });
            } else { //see if we need to do a refund
                myCoin.node.getInitTimestamp(accept.hashedSecret, (initTimestamp: number) => {
                    myCoin.node.getRefundTime(accept.hashedSecret, (refundTime: number) => {
                        if (initTimestamp + refundTime < DexUtils.UTCTimestamp()) { //times up, get refund
                            that.userService.getTradePrivateKey(myCoin.name, function(key) {
                                if(key) {
                                    myCoin.node.refundSwap(offer.address, accept.hashedSecret, key, (txId: string): void => {
                                        //TODO: don't assume complete until we have checked for reciept && confirm time
                                        that.finishOffer(market, offer, accept);
                                        that.userService.showSuccess('Swap refunded tx: ' + txId);
                                    }, (err) => {
                                        that.userService.handleError(err);
                                    }); 
                                } else {
                                    that.userService.showError('unable to unlock account to complete a swap');
                                }
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
        }, (err) => {
            that.userService.handleError(err);
        }); 
    }

    //TODO: should be called periodically, probably every 30 seconds is sufficient
    //might need to increase frequency when lightning/plasma/raiden is implemented
    //or switch to an event based model and subscribe to nodes connected via websockets
    processTrades(market: Market) {
        var that = this;
        market.myAccepts.array.slice().forEach(accept => {
            try { //run all in try/catch so that one error doesn't hose the rest
                if(accept.finished) {
                    that.finishAccept(market, accept);
                }

                var offer = market.offers.get(accept.offer);
                var listing = market.listings.get(offer.listing);
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

        market.myOffers.array.slice().forEach(offer => {
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

        //remove stale messages
        //listings after 2 days if no accepts, otherwise after 4 days 
        //all else after 4 days
        var expire2 = DexUtils.UTCTimestamp() - 60 * 60 * 24 * 2;
        var expire4 = DexUtils.UTCTimestamp() - 60 * 60 * 24 * 4;
        market.listings.array.slice().forEach(l => {
            if(l.timestamp < expire4 || (l.receivedon && l.receivedon < expire4)) {
                that.purgeListing(market, l);
            } else if(l.timestamp < expire2 || (l.receivedon && l.receivedon < expire2)) {
                var accepts = market.listingAccepts.get(l.hash);
                if(!accepts || accepts.length == 0) //only remove after 2 days if there are no accepts
                    that.purgeListing(market, l);
            }
        });
        market.listings.getItTogether();
        market.myListings.getItTogether();

        market.offers.array.forEach(o => {
            if(o.timestamp < expire4 || (o.receivedon && o.receivedon < expire4)) {
                market.offers.removeMap(o.hash);
                market.myOffers.removeMap(o.hash);
            } 
        });
        market.offers.getItTogether();
        market.myOffers.getItTogether();

        market.accepts.array.forEach(a => {
            if(a.timestamp < expire4 || (a.receivedon && a.receivedon < expire4)) {
                market.accepts.removeMap(a.hash);
                market.myAccepts.removeMap(a.hash);
            } 
        });
        market.accepts.getItTogether();
        market.myAccepts.getItTogether();

        market.cancels.array.forEach(c => {
            if(c.timestamp < expire4 || (c.receivedon && c.receivedon < expire4)) {
                market.cancels.removeMap(c.hash);
            } 
        });
        market.cancels.getItTogether();
    }

    //removes listing and associated offers and accepts from storage objects
    //only removes from the map 
    private purgeListing(market: Market, l: ListingMessage) {
        market.listings.removeMap(l.hash);
        market.myListings.removeMap(l.hash);
        (market.listingOffers.get(l.hash) || []).slice().forEach(o => {
            market.offers.removeMap(o.hash);
            market.myOffers.removeMap(o.hash);
        });
        //TODO: store my completed swaps in another permanent place
        (market.listingAccepts.get(l.hash) || []).slice().forEach(a => {
            market.accepts.removeMap(a.hash);
            market.myAccepts.removeMap(a.hash);
        });
    }
}
