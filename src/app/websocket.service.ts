import { Injectable } from '@angular/core';
import { Coin } from './coin';
import { Market } from './market';
import { UserService } from './user.service';
import { CoinService } from './coin.service';
import { ListingMessage, DexUtils, CancelMessage, OfferMessage, AcceptMessage, SwapInfo, RedeemInfo, RefundInfo, INode, ParticipateMessage, RedeemMessage, FinishMessage, OneToMany, Listing, Offer, Trade, MAX_MESSAGE_LENGTH } from './lib/libauradex';
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

    getMarket(json: any): Market {
        return this.getListingMarket(this.getBaseListingMessage(json));
    }

    getBaseListingMessage(json: any) {
        if(!json)
            return null;
        switch(json.act) {
            case 'bid': //fall through
            case 'ask': return json; 
            case 'cancel': return this.messages[json.listing];
            case 'offer': return this.messages[json.listing];
            case 'accept': return this.getBaseListingMessage(this.messages[json.offer]);
            case 'participate': return this.getBaseListingMessage(this.messages[json.accept]);
            case 'redeem': return this.getBaseListingMessage(this.messages[json.participate]);
            case 'finish':return this.getBaseListingMessage(this.messages[json.redeem]);
            case 'staged':return this.getBaseListingMessage(this.messages[json.offer]);
            default: return null;
        }
    }

    private getListingMarket(listing: ListingMessage): Market {
        if(listing)
            return this.coinService.marketd[listing.marketId];
    }

    processOrphans(json: any, market: Market) {
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

                if(json.act == 'staged') //ignore staged messages, should only be used locally
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

    private finish(msg: FinishMessage, market: Market): boolean {
        var redeem = market.redeems[msg.redeem];
        if(!redeem) {
            this.orphans[msg.redeem] = msg;
        } else {
            var offer = market.offers[market.accepts[market.participations[redeem.participate].accept].offer];
            var listing = market.listings[offer.message.listing];
            var node = market.getOfferCoin(offer.message).node;
            if(node.recover(msg.hash, msg.sig) == offer.message.redeemAddress)
                offer.finish = msg;
            else {
                console.log('invalid finish sig');
                return false;
            }
        }
        return true;
    }

    private staged(msg: AcceptMessage, market: Market): boolean {
        var offer = market.offers[msg.offer];
        if(!offer) {
            this.orphans[msg.offer] = msg;
        } else {
            var listing = market.listings[offer.message.listing];
            offer.accept = msg;
            //TODO: look for transaction?
        }
        return true;
    }

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
                    } else if (offer.acceptInfo.refundTime + offer.acceptInfo.timestamp < DexUtils.UTCTimestamp()) {
                        //TODO: get a refund
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
                        var error = DexUtils.verifyRedeemInfo(info, offer, listing);
                        if(!error) {
                            if(iAmParticipator || info.confirmations >= partCoin.node.confirmations)
                                offer.redeemInfo = info;
                        }
                        else {
                            that.userService.handleError(error);
                            //TODO: retry redeem if you own it?
                        }
                    }, (err) => {
                        that.userService.handleError(err);
                    });

                } else if(!offer.finish) {
                    if(iAmParticipator)
                    {
                        that.userService.getTradePrivateKey(initCoin.name, function(key) {
                            initCoin.node.redeemSwap(offer.message.redeemAddress, offer.acceptInfo.hashedSecret, offer.redeemInfo.secret, key, (txId: string) => {
                                var msg = {
                                    act: 'finish',
                                    redeem: offer.redeem.hash,
                                    hash: txId,
                                    sig: initCoin.node.signMessage(txId, key) 
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
                                    that.userService.handleError('error finishing swap'); 
                            }, (err) => {
                                that.userService.handleError(err);
                            });
                        });
                    } else if (offer.acceptInfo.refundTime + offer.acceptInfo.timestamp < DexUtils.UTCTimestamp()) {
                        //TODO: if they never broadcasted a finish, get a refund and manually send them the funds, minus tx fee
                    }
                } else {
                    market.completedTrades.push(market.myTrades.splice(i, 1)[0]); 
                }
            } catch(error) {
                that.userService.handleError(error);
            }
        }

        //remove stale messages
        //listings after 2 days if no accepts, otherwise after 4 days 
        //all else after 4 days
        var expire2 = DexUtils.UTCTimestamp() - 60 * 60 * 24 * 2;
        var expire4 = DexUtils.UTCTimestamp() - 60 * 60 * 24 * 4;
        for(var key in market.listings) {
            if(market.listings.hasOwnProperty(key)) {
                var listing: Listing = market.listings[key];
                var l: any = listing.message;
                if(l.timestamp < expire4 || (l.receivedon && l.receivedon < expire4)) {
                    that.purgeListing(market, l);
                } else if(l.timestamp < expire2 || (l.receivedon && l.receivedon < expire2)) {
                    var accepts = listing.offers.filter(o => o.accept);
                    if(!accepts || accepts.length == 0) //only remove after 2 days if there are no offers 
                        that.purgeListing(market, l);
                }
            }
        }

        for(var key in this.messages) {
            if(this.messages.hasOwnProperty(key)) {
                var o = this.messages[key];
                if((o.timestamp && o.timestamp < expire4) || (o.receivedon && o.receivedon < expire4)) {
                    this.deleteMessage(o);
                }
            }
        }
    }

    //removes listing and associated offers and accepts from storage objects
    private purgeListing(market: Market, listing: Listing) {
        var l = listing.message;
        delete market.listings[l.hash];
        this.deleteMessage(l.hash);
        market.deleteListing(listing);
        if(listing.cancel) {
            this.deleteMessage(listing.cancel);
        }
        listing.offers.forEach(o => {
            delete market.offers[o.message.hash];
            this.deleteMessage(o.message.hash);
            if(o.accept) {
                delete market.accepts[o.accept.hash];
                this.deleteMessage(o.accept);
            }
            if(o.participate) {
                delete market.participations[o.participate.hash];
                this.deleteMessage(o.participate);
            }
            if(o.redeem) {
                delete market.redeems[o.redeem.hash];
                this.deleteMessage(o.redeem);
            }
            if(o.refund) {
                delete market.refunds[o.refund.hash];
                this.deleteMessage(o.refund);
            }
            if(o.finish) {
                this.deleteMessage(o.finish);
            }
            if(market.addressIsMine(o.message.address))
                market.removeArrayHash(market.myOffers, o.message.hash);
        });
    }

    private deleteMessage(msg: any) {
        delete this.messages[msg.hash];
        localStorage.removeItem(msg.hash);
    }
}
