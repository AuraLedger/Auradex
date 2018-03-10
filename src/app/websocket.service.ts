import { Injectable } from '@angular/core';
import { Market } from './market';
import { UserService } from './user.service';
import { EntryMessage, NonceMessage, DexUtils, CancelMessage } from './lib/libauradex';

@Injectable()
export class WebsocketService {

    socks: any = {};

    constructor(private userService: UserService) { }

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
                    case 'trade': market.addTrade(json); break; 
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
            var entry = DexUtils.removeFromBook(market.bids, obj);  
            market.base.subBookBalance(entry.address, entry.price * entry.amount + market.base.node.getInitFee());
            market.coin.subBookBalance(entry.redeemAddress, market.coin.node.getRedeemFee());
        }
        else if (obj.entryType == 'ask')
        {
            var entry = DexUtils.removeFromBook(market.asks, obj);  
            market.coin.subBookBalance(entry.address, entry.amount + market.coin.node.getInitFee());
            market.base.subBookBalance(entry.redeemAddress, market.base.node.getRedeemFee());
        }
        else
            this.userService.showError("Unknown cancel entry type: " + obj.entryType);
    }

    setFeeRates(obj, market) {
        market.coin.node.setFeeRate(obj.coinFeeRate);
        market.base.node.setFeeRate(obj.baseFeeRate);
    }

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
}
