import { Injectable } from '@angular/core';
import { Coin } from './coin';
import { Market } from './market';
import { UserService } from './user.service';
import { CoinService } from './coin.service';
import { ListingMessage, DexUtils, CancelMessage, OfferMessage, AcceptMessage, SwapInfo, RedeemInfo, RefundInfo, INode, ParticipateMessage, RedeemMessage, OneToMany, Listing, Offer, Trade, MAX_MESSAGE_LENGTH } from './lib/libauradex';
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
    messages: any = {};
    orphans: OneToMany = new OneToMany();
    connected: boolean = false;

    constructor(
        private userService: UserService,
        private coinService: CoinService,
        private storage: LocalStorageService,
        private cryptoService: CryptoService
    ) { }

    disconnectAll() {
        Object.keys(this.socks).filter(k => this.socks.hasOwnProperty(k)).forEach(k => {
            this.socks[k].close();
            this.socks[k].terminate();
        });        
        this.socks = {};
    }

    private getMarket(json: any): Market {
        switch(json.act) {
            case 'bid': //fall through
            case 'ask': return this.getListingMarket(json); 
            case 'cancel': return this.getMarket(this.messages[json.listing]);
            case 'offer': return this.getMarket(this.messages[json.listing]);
            case 'accept': return this.getMarket(this.messages[json.offer]);
            case 'participate': return this.getMarket(this.messages[json.accept]);
            case 'redeem': return this.getMarket(this.messages[json.participate]);
            case 'finish':return this.getMarket(this.messages[json.redeem]);
            case 'staged':return this.getMarket(this.messages[json.offer]);
            default: return null;
        }
    }

    private getListingMarket(listing: ListingMessage): Market {
        return this.coinService.marketd[listing.marketId];
    }

    private processOrphans(json: any, market: Market) {
        var that = this;
        this.orphans.take(json.hash).forEach(o => { //take clears orphans, and they are readded if parent still not found when reprocessed 
            that.processMessage(market, o);
            that.processOrphans(market, o);
        }); 
    }

    private saveMessage(json: any)
    {
        this.messages[json.hash] = json;
        localStorage.setItem(json.hash, JSON.stringify(json));
    }

    connect(market: Market, cb?) {
        if(!this.connected)
        {
            //TODO: restore messages on first market connect
            var expire = DexUtils.UTCTimestamp() - 60 * 60 * 24 * 4; // 4 days
            var keys: string[] = [];
            for(var i = 0; i < localStorage.length; i++)
            {
                var key = localStorage.key(i);
                if(!key.startsWith('auradex')) {
                    var json = JSON.parse(localStorage.getItem(key));
                    if(json.receivedon < expire) {
                        localStorage.removeItem(key); 
                    } else if(json.timestamp && json.timestamp < expire) {
                        localStorage.removeItem(key); 
                    } else {
                        this.messages[json.hash] = json;
                        keys.push[key];
                    }
                }
            }

            var that = this;
            keys.forEach(key => {
                var json = that.messages[key];
                var market = that.getMarket(json);
                if(market) {
                    that.processMessage(json, market);
                    that.processOrphans(json, market);
                }
            });

            this.connected = true; 
        }

        if(!this.socks.hasOwnProperty(market.id))
        {
            var that = this;
            var account = this.userService.getAccount();

            //TODO: reconnect after creating/changing account
            //TODO: prompt wallet unlock on startup!!!
            //TODO: restore or check local storage on start up, and auto connect to markets with active trades/listings
            if(account) {
                this.updateBookBalances(market.coin.name);
                this.updateBookBalances(market.base.name);

                market.coinAddress = account[market.coin.name].address;
                market.baseAddress = account[market.base.name].address;

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
                if(evt.data.length > MAX_MESSAGE_LENGTH)
                    return;
                var json = JSON.parse(evt.data);

                if(json.act == 'finish' || json.act == 'staged') //ignore finish messages, should only be used locally
                    return;

                json.receivedon = DexUtils.UTCTimestamp();
                if(json.hash && !that.messages.hasOwnProperty(json.hash))
                {
                    if(that.processMessage(market, json)) {
                        that.saveMessage(json);
                    }
                }
            };

            if(cb)
                cb(ws);
        }
    }

    public processMessage(market: Market, json: any): boolean{
        var that = this;
        that.setNumbers(json);

        switch(json.act) {
            case 'bid': //fall through
            case 'ask': return that.listing(json, market); 
            case 'cancel': return that.cancel(json, market);
            case 'offer': return that.offer(json, market);
            case 'accept': return that.accept(json, market);
            case 'participate': return that.participate(json, market);
            case 'redeem': return that.redeem(json, market);
            case 'finish': return that.finish(json, market); 
            case 'staged': return that.staged(json, market); //restore staged message

                //TODO: need really good fee estimation
            case 'peers': market.peers = json.peers; break;
            case 'err': that.userService.handleError(json.err); break; //should only come from server
        }

        return false;
    }

    //TODO: if you recieve a listing that overlaps one of your listings, send an offer, and, if accepted, cancel and recreate a new listing subtracting offered amount -- maybe
    listing(msg: ListingMessage, market: Market): boolean {
        var error = DexUtils.verifyListing(msg, market.getListingCoin(msg).node);
        if(!error || error.trim() == '') {
            return market.addListing(msg);
        } else {
            console.log(error);
            return false;
        }
    }

    cancel(msg: CancelMessage, market: Market): boolean {
        if(market.listings.hasOwnProperty(msg.listing)) {
            var listing: Listing = market.listings[msg.listing];
            var error = DexUtils.verifyCancelSig(msg, market.getListingCoin(listing.message).node, listing.message.address);
            if(!error || error.trim() == '') {
                return market.cancel(msg);
            } else {
                console.log(error);
                return false;
            }
        } else {
            this.orphans.add(msg.listing, msg);
            return true;
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

    //TODO: check connection state, and try to reconnect, or throw/show error
    getSocket(market: Market, cb) {
        if(this.socks.hasOwnProperty(market.id))
            cb(this.socks[market.id]);
        else
            this.connect(market, cb);
    }

    private offer(offer: OfferMessage, market: Market): boolean {
        if(market.offers.has(offer.hash)) {
            return false;
        }

        var listing: Listing = market.listings[offer.listing];
        if(!listing || listing.cancelling) {
            this.orphans[offer.listing] = offer;
            return true;
        } else {
            var error = DexUtils.verifyOffer(offer, listing.message, market.getOfferCoin(offer).node); 
            if (!error) {

                if(market.addOffer(offer, listing)) {
                    if(this.connected) {
                        this.considerOffer(market, offer, listing);
                    }
                    return true; 
                } else {
                    return false;
                }
            } else {
                console.log(error);
                return false;
            }
        }
    }

    //TODO: add newtwork timestamp check on startup, and prompt user to resync/update computer clock time if it varies too much from the rest of network
    private considerOffer(market: Market, msg: OfferMessage, listing: Listing) {
        var that = this;
        var potentialAmount = market.getPotentialAcceptAmount(msg);
        var expire = msg.timestamp + (60 * 5); //5 minutes TODO: reconsider this limitation
        var offer: Offer = market.offers[msg.hash];

        if(market.addressIsMine(listing.message.address) && potentialAmount.isGreaterThan(0) && DexUtils.UTCTimestamp() < expire && !offer.accept)
        {
            DexUtils.verifyOfferBalance(msg, listing.message, false, market.getOfferCoin(msg).node, () => {
                // accept offer
                // you are the lister of the market trade, initiate HTLC swap 
                // Generate random 32byte secret and create RIPEMD160 hash from it 
                var myCoin = market.getListingCoin(listing.message);
                randomBytes(32, function(err, buffer) {
                    if(err)
                        that.userService.handleError(err);
                    else {
                        var secret = buffer.toString('hex');
                        var hashedSecret = new RIPEMD160().update(buffer).digest('hex');
                        that.storage.set('secret' + hashedSecret, secret);
                        //initiate HTLC swap
                        var accept: AcceptMessage = {
                            act: 'staged', 
                            offer: msg.hash,
                            amount: potentialAmount,
                            hash: 'staged' + hashedSecret
                        };
                        that.userService.getTradePrivateKey(myCoin.name, function(key) {
                            market.stagedAccepts.add(accept); //save now incase there are issues when broadcasting tx
                            offer.accept = accept; // TODO: add view of staged offers with options to re-init and recheck the blockchain for hashedsecret
                            myCoin.node.initSwap(listing.message, msg, hashedSecret, potentialAmount, key, (txId) => {
                                //TODO: need a way for users to manually input a hashedSecret or choose from staged accepts to continue the swap in case the initial transaction is mined but this methed fails to return
                                //TODO: don't assume complete until we have checked for reciept && confirm time // do it when processing trades
                                market.stagedAccepts.remove(accept.hash);
                                accept.act = 'accept';
                                accept.hash = txId;
                                accept.sig = myCoin.node.signMessage(txId, key);

                                var acceptString = JSON.stringify(accept);
                                localStorage.setItem(accept.hash, acceptString);

                                if(that.processMessage(market, accept))
                                {
                                    that.messages[accept.hash] = accept;
                                    that.getSocket(market, function(ws) {
                                        ws.send(acceptString);
                                    });
                                    that.updateBookBalances(myCoin.name);
                                }
                                else
                                    that.userService.handleError('error initiating swap');
                                
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
    private accept(accept: AcceptMessage, market: Market): boolean {
        if(market.accepts.has(accept.hash)) {
            return false;
        }
        var offer: Offer = market.offers[accept.offer];
        if(!offer) {
            this.orphans[accept.offer] = accept;
        } else {
            var listing: Listing = market.listings[offer.message.listing];
            var node = market.getListingCoin(listing.message).node;
            if(node.recover(accept.hash, accept.sig) == listing.message.address)
                return market.addAccept(accept, offer, listing);
            else {
                console.log('invalid accept sig');
                return false;
            }
        }
        return true;
    }

    private participate(msg: ParticipateMessage, market: Market): boolean {
        if(market.participations.has(msg.hash)) {
            return false;
        }
        var accept = market.accepts[msg.accept];
        if(!accept) {
            this.orphans[msg.accept] = msg;
        } else {
            var offer = market.offers[accept.offer];
            var node = market.getOfferCoin(offer.message).node;
            if(node.recover(msg.hash, msg.sig) == offer.message.address)
                return market.addParticipate(msg, accept, offer);
            else {
                console.log('invalid particiapte sig');
                return false;
            }
        }
        return true;
    }

    private redeem(msg: RedeemMessage, market: Market): boolean {
        var partic = market.participations[msg.participate];
        if(!partic) {
            this.orphans[msg.participate] = msg;
        } else {
            var offer = market.offers[market.accepts[partic.accept].offer];
            var listing = market.listings[offer.message.listing];
            var node = market.getOfferCoin(offer.message).node;
            if(node.recover(msg.hash, msg.sig) == listing.message.redeemAddress)
                offer.redeem = msg;
            else {
                console.log('invalid redeem sig');
                return false;
            }
        }
        return true;
    }
        /*
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

    */

    processTrades(market: Market) {
        var that = this;
        for(var i = market.myTrades.length-1; i >= 0; i--)
        {
            try { //run all in try/catch so that one error doesn't hose the rest
                var trade = market.myTrades[i];
                var accept: AcceptMessage = trade.offer.accept;
                var offer: Offer = trade.offer;
                var listing: Listing = trade.listing;

                var initCoin = market.getListingCoin(listing.message);
                var partCoin = market.getOfferCoin(offer.message);

                var iAmInitiator = market.addressIsMine(listing.message.address);
                var iAmParticipator = market.addressIsMine(offer.message.address);

                if(!offer.acceptInfo) {
                    initCoin.node.getSwapInitTx(accept.hash, (info: SwapInfo) => {
                        var error = DexUtils.verifyAcceptInfo(info, offer, listing);
                        if(!error) {
                            if(info.confirmations >= initCoin.node.confirmations)
                                offer.acceptInfo = info;
                        }
                        else {
                            market.unaccept(accept, offer, listing);
                            that.userService.handleError(error);
                        }
                        //TODO: retry accept if you own it?
                    }, (err) => {
                        that.userService.handleError(err);
                    });
                } else if (!offer.participate) {
                    if(iAmParticipator) {
                        that.userService.getTradePrivateKey(partCoin.name, function(key) {
                            partCoin.node.acceptSwap(listing.message, offer.message, offer.acceptInfo, key, (txId: string) => {
                                var msg = {
                                    act: 'participate',
                                    accept: offer.accept.hash,
                                    hash: txId,
                                    sig: partCoin.node.signMessage(txId, key)
                                };
                                var msgStr = JSON.stringify(msg);
                                localStorage.setItem(txId, msgStr);

                                if(that.processMessage(market, msg))
                                {
                                    that.messages[txId] = msg;
                                    that.getSocket(market, function(ws) {
                                        ws.send(msgStr);
                                    });
                                }
                                else
                                    that.userService.handleError('error participating swap');
                            }, (err) => {
                                that.userService.handleError(err);
                            });
                        });
                    }
                    //else, wait for participator to send message
                } else if (!offer.participateInfo) {
                    partCoin.node.getSwapInitTx(offer.participate.hash, (info: SwapInfo) => {
                        var error = DexUtils.verifyParticipateInfo(info, offer, listing);
                        if(!error) {
                            if(info.confirmations >= partCoin.node.confirmations)
                                offer.participateInfo = info;
                        }
                        else {
                            that.userService.handleError(error);
                            //TODO: retry participate if you own it?
                        }
                    }, (err) => {
                        that.userService.handleError(err);
                    });
                } else if (!offer.redeem) {
                    if(iAmInitiator) {
                        that.userService.getTradePrivateKey(partCoin.name, function(key) {
                            partCoin.node.redeemSwap(listing.message.redeemAddress, offer.acceptInfo.hashedSecret, that.storage.get(offer.acceptInfo.hashedSecret), key, (txId: string) => {
                                var msg = {
                                    act: 'redeem',
                                    participate: offer.participate.hash,
                                    hash: txId,
                                    sig: partCoin.node.signMessage(txId, key) //TODO: make sure sig check compares with listing redeem address
                                };
                                var msgStr = JSON.stringify(msg);
                                localStorage.setItem(txId, msgStr);

                                if(that.processMessage(market, msg))
                                {
                                    that.messages[txId] = msg;
                                    that.getSocket(market, function(ws) {
                                        ws.send(msgStr);
                                    });
                                }
                                else
                                    that.userService.handleError('error redeeming swap'); 
                            }, (err) => {
                                that.userService.handleError(err);
                            });
                        });
                    } else if (offer.participateInfo.refundTime + offer.participateInfo.timestamp < DexUtils.UTCTimestamp()) {
                        //TODO: try to find redeem transaction in case they didn't broadcast it
                        //if it cannot be found, try to refund.
                        //if refund fails, try again next cycle
                    }
                } else if(!offer.redeemInfo) {
                    partCoin.node.getSwapRedeemTx(offer.redeem.hash, (info: RedeemInfo) => {

                    }, (err) => {
                        that.userService.handleError(err);
                    });

                } else if(!offer.finish) {
                    if(iAmInitiator)
                    {
                        offer.finish = true;
                    }
                }
            } catch(error) {
                that.userService.handleError(error);
            }
        }

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
