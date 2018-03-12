import { Coin, CoinConfig } from './coin';
import { LocalStorageService } from 'angular-2-local-storage';
import * as Web3 from 'web3';

import * as SortedArray from 'sorted-array';

import { EntryMessage, TradeMessage, INode } from './lib/libauradex';

export class Market {

    webSocketServerURL: string;
    id: string;

    bid: SortedArray = SortedArray.comparing(x => { return -x.price; }, []);
    ask: SortedArray = SortedArray.comparing(x => { return x.price; }, []);
    mine: EntryMessage[] = [];
    trades = [];
    myTrades = [];
    recentTrades = [];
    tradeQeueu = [];

    private _mySecrets = {};

    myMap = {
        bid: {},
        ask: {}
    };
    fullMap = {
        bid: {},
        ask: {}
    };

    //TODO: these are based on currect active account, need to refresh them on account switch (might not be necessary if multiple accounts are disabled)
    coinBalance: number;
    baseBalance: number;
    coinAvailable: number;
    baseAvailable: number;

    connected: boolean = false;

    price: number;
    change: number;

    mySortProperty: string = 'timestamp';
    mySortDir: boolean = false;

    constructor(
        readonly config: MarketConfig, 
        public coin: Coin, 
        public base: Coin
    ) { 
        this.webSocketServerURL = this.config.webSocketServerURL;
        this.id = this.config.id || this.coin.ticker + '-' + this.base.ticker;
    }

    addMine(entry: EntryMessage): void {
        this.mine.push(entry);
        this.myMap[entry.act][entry._id] = entry;
        this.sortMyList();
    }

    removeMine(entry: EntryMessage): void {
        delete this.myMap[entry.act][entry._id];
        for(var i = 0; i < this.mine.length; i++)
        {
            if(this.mine[i]._id == entry._id) {
                this.mine.splice(i, 1);
                return;
            }
        }
    }

    sortMyList() {
        var that = this;
        if(this.mySortProperty == 'size')
            this.mine.sort((a,b) => { return (a.amount * a.price - b.amount * b.price) * (that.mySortDir ? -1: 1); });
        else {
            this.mine.sort((a, b) => {
                var result = 0;
                if(a[that.mySortProperty] > b[that.mySortProperty])
                    result = 1;
                else if (b[that.mySortProperty] > a[that.mySortProperty])
                    result = -1;
                if(that.mySortDir)
                    result = result * -1;
                return result;
            });
        }
    }

    mySort(prop: string) {
        if(prop == this.mySortProperty)
            this.mySortDir = !this.mySortDir;
        else
            this.mySortProperty = prop;
        this.sortMyList();
    }

    setAvailableBalances(coinAddress: string, baseAddress: string) {
        var cb = this.coin.getBookBalance(coinAddress);
        var cf = this.coin.node.getInitFee();
        var bb = this.base.getBookBalance(baseAddress);
        var bf = this.base.node.getInitFee();
        this.coinAvailable = Math.max(this.coinBalance - cb - cf, 0);
        this.baseAvailable = Math.max(this.baseBalance - bb - bf, 0);
    }

    addTrade(trade: TradeMessage) {
        var bidderId = trade.cause == 'bid' ? trade.id1 : trade.id2;
        var askerId = trade.cause == 'bid' ? trade.id2 : trade.id1;

        //if we got the trade before the ask/bid, put this in the queue and wait for the next ask/bid to try and process the trade
        //TODO: request specific entry from websocket server
        if(!this.fullMap.bid.hasOwnProperty(bidderId) || !this.fullMap.ask.hasOwnProperty(askerId)) {
            this.tradeQeueu.push(trade);
            return; 
        }

        if(this.myMap.ask.hasOwnProperty(askerId) || this.myMap.bid.hasOwnProperty(bidderId)) {
            if(this.myMap.ask.hasOwnProperty(askerId) && this.myMap.bid.hasOwnProperty(bidderId)) {
                //TODO: move the showError method to a separate service that has no other dependencies
                //this.userService.showError("Sorry, you cannot trade with yourself :)");
                return;
            }

            //you're part of this trade, if you are the receiver, verify inititiator still has enough funds, create the hashed secret, and make the initial transaction
            //TODO: give the receiver a 60 second window to cancel the trade before anything happens on chain, in case they were about to cancel it when this pops up
            this.myTrades.push(trade);
            this.processTrades();
        }
        this.trades.push(trade);
    }

    private addSecret(tradeId: string, secret: string) {
        if(this._mySecrets.hasOwnProperty(tradeId)) {
            //TODO: show error
            throw 'The secret for tradeID ' + tradeId + ' already exists.';
        }
        this._mySecrets[tradeId] = secret;

    }

    //should be called periodically, probably every 30 seconds is sufficient
    //might need to increase frequency when lightning/plasma/raider is implemented
    //or (woke) switch to an event based model and subscribe to nodes connected via websockets
    processTrades() {
                    var that = this;
        for(var i = 0; i < this.myTrades.length; i++)
        {
            var trade: TradeMessage = this.myTrades[i];
            if(trade.step == 0 && (this.myMap.bid.hasOwnProperty(trade.id2) || this.myMap.ask.hasOwnProperty(trade.id2))) { 
                // you are the receivier of the market trade, initiate HTLC swap 

            } else if (trade.step == 1 && (this.myMap.bid.hasOwnProperty(trade.id1) || this.myMap.ask.hasOwnProperty(trade.id1))) {
                // you are intitiator of the market trade, check for confirmations, participate in HTLC swap
                if(trade.txIds.length == 1 && trade.hashedSecret && trade.hashedSecret.length == 32) {
                    var theirNode: INode = trade.cause == 'bid' ? this.coin.node : this.base.node;
                    var myNode: INode = trade.cause == 'bid' ? this.base.node : this.coin.node;
                    var receiver = trade.cause == 'bid' ? this.myMap.ask[trade.id2] : this.myMap.bid[trade.id2];
                    var initiator = trade.cause == 'bid' ? this.myMap.bid[trade.id1] : this.myMap.ask[trade.id1];
                    theirNode.getConfirmationCount(trade.txIds[0], (count) => {
                        if(count >= theirNode.requiredConfirmations) {
                            myNode.acceptSwap(receiver, initiator, trade, (txId) => {
                                trade.txIds.push(txId);
                                trade.step = 2;
                            }, (error) => {
                            
                            }); 
                        }
                    }, (error) => {
                        //TODO: show error 
                        console.log(error);
                    });
                }
            }
        }
    }

    addBid(entry: EntryMessage) {
        if(entry.act != 'bid')
            throw 'Tried to add non-bid entry ' + entry.act + ' to bid list'; 
        this.bid.insert(entry);
        this.fullMap.bid[entry._id] = entry;
        this.calcSum(this.bid.array);
    }

    addAsk(entry: EntryMessage) {
        if(entry.act != 'ask')
            throw 'Tried to add non-ask entry ' + entry.act + ' to ask list'; 
        this.ask.insert(entry);
        this.fullMap.ask[entry._id] = entry;
        this.calcSum(this.ask.array);
    }

    calcSum(entries: any[]): void {
        var sum = 0;
        for(var i = 0; i < entries.length; i++) {
            sum = sum + (entries[i].price * entries[i].amount); 
            entries[i].sum = sum;
        }
    }
}

export class MarketConfig {
    coin: string;
    base: string;
    webSocketServerURL: string;
    id?: string;
}
