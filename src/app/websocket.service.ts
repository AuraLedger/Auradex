import { Injectable } from '@angular/core';
import { Market } from './market';
import { UserService } from './user.service';
import { EntryMessage, NonceMessage, DexUtils } from './lib/libauradex';

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

                    case 'setFeeRates': that.setFeeRates(json, market); break;
                    case 'err': that.userService.showError(json.err); break;
                } 
            };

            if(cb)
                cb(ws);
        }
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
        DexUtils.verifyEntry(entry, market.base.node, function() {
            if(entry.address == that.userService.getAccount()[market.base.name].address)
                market.base.setNonce(that.userService.activeAccount, entry.nonce + 1);
            market.addBid(entry);
        }, function(err) {
            that.userService.showError(err);
        });
    }


    private addAsk(entry: EntryMessage, market: Market)
    {
        var that = this;
        DexUtils.verifyEntry(entry, market.coin.node, function() {
            if(entry.address == that.userService.getAccount()[market.coin.name].address)
                market.coin.setNonce(that.userService.activeAccount, entry.nonce + 1);
            market.addAsk(entry);
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
            var coinSig = market.coin.node.signMessage(json.challenge, key);
            if(!coinSig)
                that.userService.showError('failed to connect');
            else {
                that.userService.getPrivateKey(market.base.name, function(bkey) {
                    var baseSig = market.base.node.signMessage(json.challenge, bkey);

                    if(!baseSig)
                        that.userService.showError('failed to connect');
                    else {
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
