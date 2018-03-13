import { Injectable } from '@angular/core';
import { Coin } from './coin';
import { Market } from './market';
import { UserService } from './user.service';
import { EntryMessage, NonceMessage, DexUtils, CancelMessage, TradeMessage, StepMessage, INode } from './lib/libauradex';

import { LocalStorageService } from 'angular-2-local-storage';
import { CryptoService } from './crypto.service';
import * as RIPEMD160 from 'ripemd160';
import * as randombytes from 'randombytes';

@Injectable()
export class WebsocketService {

    socks: any = {};

    constructor(
        private userService: UserService,
        private storage: LocalStorageService,
        private cryptoService: CryptoService
    ) { }

    connect(market: Market, cb?) {
        if(!this.socks.hasOwnProperty(market.id))
        {
            var ws = this.socks[market.id] = new WebSocket(market.webSocketServerURL);

            var that = this;
            ws.onmessage = function(evt) {
                var json = JSON.parse(evt.data);

                switch(json.act) {
                    case 'bid': that.addBid(json, market); break; //TODO: verify bid
                    case 'ask': that.addAsk(json, market); break; 
                    case 'nonce': that.nonce(json, market); break; 
                    case 'trade': that.addTrade(json, market); break; 
                    case 'register': that.register(json, ws, market); break;
                    case 'cancel': that.cancel(json, market); break;

                    case 'setFeeRates': that.setFeeRates(json, market); break;
                    case 'err': that.userService.showError(json.err); break;
                } 
            };

            if(cb)
                cb(ws);
        }
    }

    cancel(obj: CancelMessage, market) {
        if(obj.entryType == 'bid')
        {
            var entry = DexUtils.removeFromBook(market.bid, obj);  
            market.base.subBookBalance(entry.address, entry.price * entry.amount + market.base.node.getInitFee());
            market.coin.subBookBalance(entry.redeemAddress, market.coin.node.getRedeemFee());
            delete market.fullMap.bid[obj._id];
            if(entry.address == this.userService.getAccount()[market.base.name].address) {
                market.removeMine(entry);
                market.setAvailableBalances(entry.redeemAddress, entry.address);
            }
        }
        else if (obj.entryType == 'ask')
        {
            var entry = DexUtils.removeFromBook(market.ask, obj);  
            market.coin.subBookBalance(entry.address, entry.amount + market.coin.node.getInitFee());
            market.base.subBookBalance(entry.redeemAddress, market.base.node.getRedeemFee());
            delete market.fullMap.ask[obj._id];
            if(entry.address == this.userService.getAccount()[market.coin.name].address) {
                market.removeMine(entry);
                market.setAvailableBalances(entry.address, entry.redeemAddress);
            }
        }
        else
            this.userService.showError("Unknown cancel entry type: " + obj.entryType);
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

    private addBid(entry: EntryMessage, market: Market)
    {
        var that = this;
        DexUtils.verifyEntry(entry, market.base.node, market.base.getBookBalance(entry.address), function() {
            market.addBid(entry);
            market.base.addBookBalance(entry.address, entry.price * entry.amount + market.base.node.getInitFee());
            market.coin.addBookBalance(entry.redeemAddress, market.coin.node.getRedeemFee());
            if(entry.address == that.userService.getAccount()[market.base.name].address) {
                market.addMine(entry);
                market.base.setNonce(that.userService.activeAccount, entry.nonce + 1);
                market.setAvailableBalances(entry.redeemAddress, entry.address);
            }
        }, function(err) {
            that.userService.showError(err);
        });
    }

    //TODO: subtract from book balance when entries are removed
    private addAsk(entry: EntryMessage, market: Market)
    {
        var that = this;
        DexUtils.verifyEntry(entry, market.coin.node, market.coin.getBookBalance(entry.address), function() {
            market.addAsk(entry);
            market.coin.addBookBalance(entry.address, entry.amount + market.coin.node.getInitFee());
            market.base.addBookBalance(entry.redeemAddress, market.base.node.getRedeemFee());
            if(entry.address == that.userService.getAccount()[market.coin.name].address) {
                market.addMine(entry);
                market.coin.setNonce(that.userService.activeAccount, entry.nonce + 1);
                market.setAvailableBalances(entry.address, entry.redeemAddress);
            }
        }, function(err) {
            that.userService.showError(err);
        });
    }

    private nonce(json: NonceMessage, market) {
        if(json.entryType == 'ask')
            market.coin.setNonce(this.userService.activeAccount, json.val + 1);
        if(json.entryType == 'bid')
            market.base.setNonce(this.userService.activeAccount, json.val + 1);
    }

    private register(json, ws, market) {
        //sign two messages and send them to the service
        var that = this;
        this.userService.getPrivateKey(market.coin.name, function(key) {
            if(!key)
                that.userService.showError('failed to connect');
            else {
                var coinSig = market.coin.node.signMessage(json.challenge, key);
                that.userService.getPrivateKey(market.base.name, function(bkey) {
                    if(!bkey)
                        that.userService.showError('failed to connect');
                    else {
                    var baseSig = market.base.node.signMessage(json.challenge, bkey);
                        var payload = {
                            act: 'register',
                            coinSig: coinSig,
                            baseSig: baseSig,
                            coinAddress: that.userService.getAccount()[market.coin.name].address,
                            baseAddress: that.userService.getAccount()[market.base.name].address
                        };
                        ws.send(JSON.stringify(payload)); 
                    }
                });
            }
        });
    }

    private addTrade(trade: TradeMessage, market: Market): void {
        if(market.addTrade(trade))
            this.processTrades(market);
    }
   
    //TODO: should be called periodically, probably every 30 seconds is sufficient
    //might need to increase frequency when lightning/plasma/raiden is implemented
    //or switch to an event based model and subscribe to nodes connected via websockets
    processTrades(market: Market) {
        var that = this;
        for(var i = 0; i < market.myTrades.length; i++)
        {
            var trade: TradeMessage = market.myTrades[i];
            var isReceiver: boolean = market.myMap.bid.hasOwnProperty(trade.id2) || market.myMap.ask.hasOwnProperty(trade.id2);
            if(!isReceiver && !(market.myMap.bid.hasOwnProperty(trade.id1) || market.myMap.ask.hasOwnProperty(trade.id1))) {
                that.userService.handleError("Your entry not found");
                continue;
            }
            var myCoin, theirCoin, receiver, initiator;

            //determine who is on which side of the trade, and which coin needs to be sent/received
            if(isReceiver) {
                if(trade.cause == 'bid') {
                    myCoin = market.coin;
                    theirCoin = market.base;
                    receiver = market.myMap.ask[trade.id2];
                    initiator = market.fullMap.bid[trade.id1];
                } else {
                    myCoin = market.base;
                    theirCoin = market.coin;
                    receiver = market.myMap.bid[trade.id2];
                    initiator = market.fullMap.ask[trade.id1];
                }
            } else {
                if(trade.cause == 'bid') {
                    myCoin = market.base;
                    theirCoin = market.coin;
                    receiver = market.fullMap.ask[trade.id2];
                    initiator = market.myMap.bid[trade.id1];
                } else {
                    myCoin = market.coin;
                    theirCoin = market.base;
                    receiver = market.fullMap.bid[trade.id2];
                    initiator = market.myMap.ask[trade.id1];
                } 
            }


            if(trade.step == 0 && isReceiver) { 
                // you are the receivier of the market trade, initiate HTLC swap 
                // Generate random 32byte secret and create RIPEMD160 hash from it 
                randombytes.getRandomBytes(32, function(err, buffer) {
                    var secret = buffer.toString('hex');
                    var hashedSecret = new RIPEMD160().update(buffer).digest('hex');
                    that.storage.set(hashedSecret, secret);
                    //initiate HTLC swap
                    trade.hashedSecret = hashedSecret;
                    that.userService.getTradePrivateKey(myCoin.name, function(key) {
                        myCoin.node.initSwap(receiver, initiator, trade, key, (txId) => {
                            //TODO: need a way for users to manually input a transaction id to continue the swap in case the initial transaction is mined but this methed fails to return
                            trade.txIds.push(txId);
                            trade.step = 1; 
                            that.getSocket(market, function(ws) {
                                var step: StepMessage = {
                                    act: 'step',
                                    _id: trade._id,
                                    step: 1,
                                    txId: txId,
                                    hashedSecret: hashedSecret
                                };
                                ws.send(JSON.stringify(step));
                            });
                        }, (error) => {
                            that.userService.handleError(error);
                        });
                    }, trade);
                });

            } else if (trade.step == 1 && !isReceiver) {
                // you are intitiator of the market trade, check for confirmations, participate in HTLC swap
                if(trade.txIds.length == 1 && trade.hashedSecret && trade.hashedSecret.length == 32) {
                    theirCoin.node.getConfirmationCount(trade.txIds[0], (count) => {
                        if(count >= theirCoin.node.requiredConfirmations) {
                            //TODO: verify transaction data (amount, recipient, refundTime, hashedSecret, initiator) 
                            that.userService.getTradePrivateKey(myCoin.name, function(key) {
                                myCoin.node.acceptSwap(receiver, initiator, trade, key, (txId) => {
                                    trade.txIds.push(txId);
                                    trade.step = 2; 
                                    that.getSocket(market, function(ws) {
                                        var step: StepMessage = {
                                            act: 'step',
                                            _id: trade._id,
                                            step: 3,
                                            txId: txId
                                        };
                                        ws.send(JSON.stringify(step));
                                    });
                                }, (error) => {
                                    that.userService.showError(error);
                                    console.log(error);
                                }); 
                            });
                        }
                    }, (error) => {
                        that.userService.showError(error);
                        console.log(error);
                    });
                }
            } else if(trade.step == 2) {
                if(isReceiver) { 
                    // you are the receivier of the market trade, redeem HTLC swap with your secret
                    var secret = this.storage.get(trade.hashedSecret);
                    //redeem HTLC swap
                    //TODO: verify transaction data (amount, recipient, refundTime, hashedSecret, initiator) 
                    that.userService.getTradePrivateKey(myCoin.name, function(key) {
                        myCoin.node.redeemSwap(receiver, initiator, trade, key, (txId) => {
                            //TODO: need a way for users to manually input a transaction id to continue the swap in case the initial transaction is mined but this methed fails to return
                            trade.txIds.push(txId);
                            trade.step = 3; 
                            that.getSocket(market, function(ws) {
                                var step: StepMessage = {
                                    act: 'step',
                                    _id: trade._id,
                                    step: 4,
                                    txId: txId
                                };
                                ws.send(JSON.stringify(step));
                            });
                        }, (error) => {
                            that.userService.handleError(error);
                        });
                    }, trade);
                } else {
                    //you are the initiator, check their transaction for the secret and finalize the swap
                    
                }
            } else if (trade.step == 3 && isReceiver) {
                //TODO: verify that you are done with the trade, and remove
                market.myTrades.splice(i, 1);
                i--;
            } else if (trade.step == 4) {
                //TODO: verify that you are done with the trade, and remove
                market.myTrades.splice(i, 1);
                i--;
            }
        }
    }

}
