import { Coin, CoinConfig } from './coin';
import * as SortedArray from 'sorted-array';
import { BigNumber } from 'bignumber.js';

import { ListingMessage, OfferMessage, AcceptMessage, CancelMessage, DexUtils, StoredArrayMap, ArrayMap, OneToMany, INode } from './lib/libauradex';

interface SwapTx {
    txId: string;
    blockNumber: number;
};

interface Trade {
    listing: ListingMessage;
    offer: OfferMessage;
    accept: AcceptMessage;
    mine: boolean; //listing and accept are mine
    hash: string; //usually the accept hash
};

export class Market {

    webSocketServerURL: string;
    id: string;

    bid: SortedArray = SortedArray.comparing(x => { return -x.price; }, []);
    ask: SortedArray = SortedArray.comparing(x => { return x.price; }, []);

    bidSum: number;
    askSum: number;

    peers: number = 0;

    listings: StoredArrayMap;
    offers: StoredArrayMap;
    accepts: StoredArrayMap;

    myListings: ArrayMap = new ArrayMap('hash');
    myOffers: ArrayMap = new ArrayMap('hash');
    myAccepts: ArrayMap = new ArrayMap('hash');

    offerAccept: any = {}; // offer hash to accept object
    
    listingOffers = new OneToMany();
    listingAccepts = new OneToMany();

    //if offers or accepts arrive before a listing, they are place here
    //TODO: periodically clean these out
    offerQueue = [];
    acceptQueue = [];
    cancelQueue = [];

    cancelling: any = {};
    matched: any = {};

    //TODO: these are based on currect active account, need to refresh them on account switch (might not be necessary if multiple accounts are disabled)
    coinBalance: BigNumber = new BigNumber(0);
    baseBalance: BigNumber = new BigNumber(0);
    coinAvailable: BigNumber = new BigNumber(0);
    baseAvailable: BigNumber = new BigNumber(0);

    connected: boolean = false;

    //TODO: get this from historical blockchain analyzer
    price: number = 1;
    change: number = 0.1;

    mySortProperty: string = 'timestamp';
    mySortDir: boolean = false;

    myOfferSortProperty: string = 'timestamp';
    myOfferSortDir: boolean = false;

    myAccSortProperty: string = 'timestamp';
    myAccSortDir: boolean = false;

    tradeHandle: any;

    constructor(
        readonly config: MarketConfig, 
        public coin: Coin, 
        public base: Coin,
    ) { 
        this.webSocketServerURL = this.config.webSocketServerURL;
        this.id = this.config.id || this.coin.ticker + '-' + this.base.ticker;

        this.listings = new StoredArrayMap(this.id, 'hash');
        this.offers = new StoredArrayMap(this.id, 'hash');
        this.accepts = new StoredArrayMap(this.id, 'hash');
    }

    addListing(listing: ListingMessage): boolean {
        if(this.listings.add(listing)) {
            if(listing.act == 'bid') {
                this.bid.insert(listing);
                this.calcSum(this.bid.array);
            }
            else {
                this.ask.insert(listing);
                this.calcSum(this.ask.array);
            }
            console.log(listing);
            return true;
        }
        return false;       
    }

    addOffer(offer: OfferMessage): boolean {
        if(this.offers.add(offer)) {
            this.listingOffers.add(offer.listing, offer);
            console.log(offer);
            return true;
        }
        return false;

    }

    addMyOffer(offer: OfferMessage): boolean {
        if(!this.listings.has(offer.listing))
            throw 'Cannot find listing for my offer'

        if(this.addOffer(offer)) {
            this.myOffers.add(offer);
            this.sortMyOffers();
        }
        return false;
    }

    addMyAccept(accept: AcceptMessage): boolean {
        if(!this.offers.has(accept.offer))
            throw 'Cannot find offer for my accept';
        if(!this.listings.has(this.offers.get(accept.offer).listing))
            throw 'Cannot find listing for accept';

        if(this.addAccept(accept)) {
            this.myAccepts.add(accept);
            this.sortMyAccepts();
            return true;
        }
        return false;
    }

    finishMyAccept(accept: AcceptMessage) {
        var listing = this.listings.get(this.offers.get(accept.offer).listing);
        var remaining = this.getListingRemaining(listing);

        if(remaining < listing.min) {
            if(listing.act == 'bid') {
                DexUtils.removeFromBook(this.bid, listing.hash);
            }
            if(listing.act == 'ask') {
                DexUtils.removeFromBook(this.ask, listing.hash)
            }
            this.myListings.remove(listing.hash);
        }
    }

    getCoinBookBalance(): BigNumber {
        var that = this;
        var fee = this.coin.node.getInitFee();
        var sum: BigNumber = new BigNumber(0);

        this.myListings.array.forEach(l => {
            if(l.act == 'ask') {
                sum = sum.plus(that.getListingRemaining(l)).plus(fee);
            }
        });

        this.myOffers.array.forEach(o => {
            if(!o.txId || o.txId.length == 0) {
                var l = that.listings.get(o.listing);
                if(l.act == 'bid') {
                    var amount = o.amount;
                    if(that.offerAccept.hasOwnProperty(o.hash))
                        amount = that.offerAccept[o.hash].amount;
                    sum = sum.plus(amount).plus(fee);
                }
            }
        });

        return sum;
    }

    getBaseBookBalance(): BigNumber {
        var that = this;
        var fee = this.base.node.getInitFee();
        var sum: BigNumber = new BigNumber(0);

        this.myListings.array.forEach(l => {
            if(l.act == 'bid') {
                sum = sum.plus(that.getListingRemaining(l).times(l.price)).plus(fee);
            }
        });

        this.myOffers.array.forEach(o => {
            if(!o.txId || o.txId.length == 0) {
                var l = that.listings.get(o.listing);
                if(l.act == 'ask') {
                    var amount = o.amount;
                    if(that.offerAccept.hasOwnProperty(o.hash))
                        amount = that.offerAccept[o.hash].amount;
                    sum = sum.plus(amount.times(l.price)).plus(fee);
                }
            }
        });

        return sum;
    }

    //TODO: retore listings/offers/accepts/initTransactions on load from localStorage
    //TODO: maybe request books from another user
    //TODO: when restoring from localStorage, manually call addMy* methods
    addMyListing(listing: ListingMessage) {
        if(this.addListing(listing)) {
            this.myListings.add(listing);
            this.sortMyListings();
        }
    }

    sortMyListings() {
        this.sortMyList(this.myListings.array, this.mySortProperty, this.mySortDir);
    }

    //TODO: wrap all messages in new objects with more properties for client side handling
    sortMyOffers() {
        this.sortMyList(this.myOffers.array, this.myOfferSortProperty, this.myOfferSortDir);
    }

    sortMyAccepts() {
        this.sortMyList(this.myAccepts.array, this.myAccSortProperty, this.myAccSortDir);
    }

    sortMyList(arr: any[], property: string, direction: boolean) {
        if(property == 'size')
            arr.sort((a,b) => { return (a.amount * a.price - b.amount * b.price) * (direction ? -1: 1); });
        else {
            this.myListings.array.sort((a, b) => {
                var result = 0;
                if(a[property] > b[property])
                    result = 1;
                else if (b[property] > a[property])
                    result = -1;
                if(direction)
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
        this.sortMyListings();
    }

    myOffSort(prop: string) {
        if(prop == this.myOfferSortProperty)
            this.myOfferSortDir = !this.myOfferSortDir;
        else
            this.myOfferSortProperty = prop;
        this.sortMyOffers();
    }

    myAccSort(prop: string) {
        if(prop == this.myAccSortProperty)
            this.myAccSortDir = !this.myAccSortDir;
        else
            this.myAccSortProperty = prop;
        this.sortMyAccepts();
    }

    getListingCoin(listing: ListingMessage): Coin {
        return this.getActCoin(listing.act);
    }

    getActCoin(act: string): Coin {
        if(act == 'bid') return this.base;
        if(act == 'ask') return this.coin;
        throw 'invlid act ' + act;
    }

    getOfferCoin(offer): Coin {
        return this.getActCoin(DexUtils.other(this.listings.get(offer.listing).act));
    }

    cancel(message: CancelMessage) {
        //TODO: don't remove from storage, just set cancel property when this is wrapped with a client object
        //TODO: don't cancel if it's been accepted already
        var listing = this.listings.get(message.listing);
        if(listing.act == 'bid') {
            DexUtils.removeFromBook(this.bid, message.listing); 
        }
        if(listing.act == 'ask') {
            DexUtils.removeFromBook(this.ask, message.listing);
        }
        
        this.myListings.remove(message.listing);
        (this.listingOffers.get(listing.hash) || []).forEach(o => this.cancelOffer(o));
    }

    cancelOffer(offer: OfferMessage) {
        //TODO: set canelled status on new offer object (when implemented) but check for accept and swap status first
        //TODO: if there is an accept, do not cancel
    }

    getPotentialAcceptAmount(offer) {
        var listing = this.listings.get(offer.listing);
        var remaining = this.getListingRemaining(listing);
        if(remaining.isGreaterThan(listing.min) && remaining.isGreaterThan(offer.min))
            return BigNumber.minimum(offer.amount, remaining);
        return 0;
    }

    getListingRemaining (listing: ListingMessage): BigNumber {
        var accepts = this.listingAccepts.get(listing.hash) || [];
        var accepted = new BigNumber(accepts.reduce((sum: BigNumber, accept: AcceptMessage) => {
            sum = sum.plus(accept.amount);
            return sum;
        }, new BigNumber(0)) || new BigNumber(0));
        return listing.amount.minus(accepted);
    }

    addAccept(accept: AcceptMessage): boolean {
        if(this.accepts.add(accept)) {
            this.offerAccept[accept.offer] = accept;
            var offer = this.offers.get(accept.offer);
            this.listingAccepts.add(offer.listing, accept);
            console.log(accept);
            return true;
        }
        return false;
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
