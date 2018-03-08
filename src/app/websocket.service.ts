import { Injectable } from '@angular/core';
import { Market } from './market';
import { UserService } from './user.service';
import { EntryMessage, DexUtils } from './lib/libauradex';

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
                    case 'bid': market.bid.insert(json); break; //TODO: verify bid
                    case 'ask': market.ask.insert(json); break; 
                    case 'nonce': that.nonce(json, market); break; 
                    case 'trade': market.addTrade(json); break; 
                    case 'register': that.register(json, ws, market); break;
                } 
            };

            if(cb)
                cb(ws);
        }
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
        DexUtils.verifyEntry(entry, market.base.node, market.base.fee, function() {
            market.addBid(entry);
        }, function(err) {
            that.userService.showError(err);
        });
    }

    private nonce(json, market) {
        if(json.type == 'ask')
            market.coin.askNonce[this.userService.activeAccount] = json.val + 1;
        if(json.type == 'bid')
            market.base.bidNonce[this.userService.activeAccount] = json.val + 1;
    }

    private register(json, ws, market) {
        //sign two messages and send them to the service
        var that = this;
        this.userService.getPrivateKey(market.coin.name, function(key) {
            var coinSig = market.coin.node.signMessage(json.challenge, key);
            that.userService.getPrivateKey(market.base.name, function(bkey) {
                var baseSig = market.base.node.signMessage(json.challenge, bkey);
                var payload = {
                    act: 'register',
                    coinSig: coinSig,
                    baseSig: baseSig,
                    coinAddress: that.userService.getAccount()[market.coin.name].address,
                    baseAddress: that.userService.getAccount()[market.base.name].address
                };
                ws.send(JSON.stringify(payload)); 
            });
        });
    }
}
