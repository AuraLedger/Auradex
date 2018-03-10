import { Coin, CoinConfig } from './coin';
import * as Web3 from 'web3';

import * as SortedArray from 'sorted-array';

import { EntryMessage } from './lib/libauradex';

export class Market {

    webSocketServerURL: string;
    id: string;

    bid: SortedArray = SortedArray.comparing(x => { return -x.price; }, []);
    ask: SortedArray = SortedArray.comparing(x => { return x.price; }, []);
    mine: EntryMessage[] = [];
    trades = [];
    recentTrades = [];

    //TODO: these are based on currect active account, need to refresh them on account switch
    coinBalance: number;
    baseBalance: number;
    coinAvailable: number;
    baseAvailable: number;

    connected: boolean = false;

    price: number;
    change: number;

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
    }
    

    setAvailableBalances(coinAddress: string, baseAddress: string) {
        var cb = this.coin.getBookBalance(coinAddress);
        var cf = this.coin.node.getInitFee();
        var bb = this.base.getBookBalance(baseAddress);
        var bf = this.base.node.getInitFee();
        this.coinAvailable = this.coinBalance - cb - cf;
        this.baseAvailable = this.baseBalance - bb - bf;
    }

    addTrade(trade) {
        this.trades.push(trade);
    }

    addBid(entry: EntryMessage) {
        if(entry.act != 'bid')
            throw 'Tried to add non-bid entry ' + entry.act + ' to bid list'; 
        this.bid.insert(entry);
        this.calcSum(this.bid.array);
    }

    addAsk(entry: EntryMessage) {
        if(entry.act != 'ask')
            throw 'Tried to add non-ask entry ' + entry.act + ' to ask list'; 
        this.ask.insert(entry);
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
