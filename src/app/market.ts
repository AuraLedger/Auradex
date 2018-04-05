import { Coin, CoinConfig } from './coin';
import * as SortedArray from 'sorted-array';
import { BigNumber } from 'bignumber.js';

import { ListingMessage, OfferMessage, AcceptMessage, CancelMessage, ParticipateMessage, RedeemMessage, DexUtils, StoredArrayMap, ArrayMap, OneToMany, INode, Listing, Offer, Trade } from './lib/libauradex';

export class Market {

    webSocketServerURL: string;
    id: string;

    bid: SortedArray = SortedArray.comparing(x => { return -x.message.price; }, []);
    ask: SortedArray = SortedArray.comparing(x => { return x.message.price; }, []);

    bidSum: BigNumber;
    askSum: BigNumber;

    peers: number = 0;

    listings: any = {};
    offers: any = {};
    accepts: any = {};
    participations: any = {};
    
    stagedAccepts: StoredArrayMap;

    myListings: Listing[]; 
    myOffers: Trade[];
    myTrades: Trade[];
    
    //cancelling: any = {};
    //matched: any = {};

    //TODO: these are based on currect active account, need to refresh them on account switch (might not be necessary if multiple accounts are disabled)
    coinBalance: BigNumber = new BigNumber(0);
    baseBalance: BigNumber = new BigNumber(0);
    coinAvailable: BigNumber = new BigNumber(0);
    baseAvailable: BigNumber = new BigNumber(0);
    coinAddress: string;
    baseAddress: string;

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
        this.stagedAccepts = new StoredArrayMap(this.id, 'hash'); //TODO: restore these on load
    }

    addListing(msg: ListingMessage): boolean {
        if(!this.listings.hasOwnProperty(msg.hash)) {

            if(msg.marketId != this.id)
                return false;

            var listing = new Listing(msg);

            this.listings[msg.hash] = listing;

            if(msg.act == 'bid') {
                this.bid.insert(listing);
                this.bidSum = this.calcSum(this.bid.array);
            } else if (msg.act == 'ask') {
                this.ask.insert(listing);
                this.askSum = this.calcSum(this.ask.array);
            } else {
                return false;
            }


            if(this.addressIsMine(msg.address))
                this.myListings.push(listing);

            return true;
        }

        return false;       
    }

    addressIsMine(address: string): boolean {
        return address == this.coinAddress || address == this.baseAddress;
    }

    addOffer(msg: OfferMessage, listing: Listing): boolean {
        if(!this.offers.hasOwnProperty(msg.hash)) {
            var offer = new Offer(msg);
            listing.offers.push(offer);
            this.offers[msg.hash] = offer;
            if(this.addressIsMine(msg.address))
                this.myOffers.push(new Trade(listing, offer, this.coinAddress, this.baseAddress));
            return true;
        }

        return false;
    }

    addAccept(msg: AcceptMessage, offer: Offer, listing: Listing): boolean {
        if(!this.accepts.hasOwnProperty(msg.hash)) {
            offer.accept = msg;
            this.accepts[msg.hash] = msg;
            if(this.addressIsMine(listing.message.address))
                this.myTrades.push(new Trade(listing, offer, this.coinAddress, this.baseAddress));
            this.updateListing(listing);
            //TODO: move myOffers to myTrades in the process trade cycle, and call setVals on trade again
            return true;
        }

        return false;
    }

    unaccept(msg: AcceptMessage, offer: Offer, listing: Listing): void {
        offer.accept = null;
        offer.acceptInfo = null;
        this.updateListing(listing);
    }

    addParticipate(msg: ParticipateMessage, accept: AcceptMessage, offer: Offer): boolean {
        if(!this.participations.hasOwnProperty(msg.hash)) {
            offer.participate = msg;
            this.participations[msg.hash] = msg;
            return true;
        }

        return false;
    }

    addRedeem(msg: RedeemMessage, offer: Offer) {
        if(msg.participate == offer.participate.hash)
        {
            offer.redeem = msg;
            return true;
        }

        return false;
    }

    //TODO: reduce listing amount on books after accept has been made
    updateListing(listing: Listing) {
        var accepted = listing.offers.reduce((sum, o) => sum.plus(o.accept ? o.accept.amount : 0), new BigNumber(0));
        var prev = listing.remaining;
        listing.remaining = listing.message.amount.minus(accepted);

        if(listing.remaining.isLessThan(listing.message.min)) {
            if(prev.isGreaterThanOrEqualTo(listing.message.min)) {
                if(listing.message.act == 'bid') { 
                    DexUtils.removeFromBook(this.bid, listing.message.hash);
                }
                if(listing.message.act == 'ask') {
                    DexUtils.removeFromBook(this.ask, listing.message.hash)
                }
                if(this.addressIsMine(listing.message.address)) {
                    this.removeArrayHash(this.myListings, listing.message.hash);
                } 
            }
        } else if (prev.isLessThan(listing.message.min)) {
            if(listing.message.act == 'bid') { 
                this.bid.insert(listing);
            }
            if(listing.message.act == 'ask') {
                this.ask.insert(listing);
            }
            if(this.addressIsMine(listing.message.address)) {
                this.myListings.push(listing);
            }
        }

        if(prev != listing.remaining) {
            if(listing.message.act == 'bid') { 
                this.bidSum = this.calcSum(this.bid.array);
            }
            if(listing.message.act == 'ask') { 
                this.askSum = this.calcSum(this.ask.array);
            }
        }
    }

    getCoinBookBalance(): BigNumber {
        var that = this;
        var fee = this.coin.node.getInitFee();
        var sum: BigNumber = new BigNumber(0);

        this.myListings.forEach(l => {
            if(l.message.act == 'ask') {
                sum = sum.plus(l.remaining).plus(fee);
            }
        });

        this.myOffers.forEach(o => {
            if(o.listing.message.act == 'bid') {
                var amount = o.offer.message.amount;
                sum = sum.plus(amount).plus(fee);
            }
        });

        this.myTrades.forEach(o => {
            if(that.addressIsMine(o.listing.message.address) && o.listing.message.act == 'ask') {
                sum = sum.plus(o.offer.accept.amount);
            } else if (that.addressIsMine(o.offer.message.address) && o.listing.message.act == 'bid') {
                sum = sum.plus(o.offer.accept.amount);
            }
        });

        return sum;
    }

    getBaseBookBalance(): BigNumber {
        var that = this;
        var fee = this.base.node.getInitFee();
        var sum: BigNumber = new BigNumber(0);

        this.myListings.forEach(l => {
            if(l.message.act == 'bid') {
                sum = sum.plus(l.remaining.times(l.message.price)).plus(fee);
            }
        });

        this.myOffers.forEach(o => {
            if(o.listing.message.act == 'ask') {
                var amount = o.offer.message.amount.times(o.listing.message.price);
                sum = sum.plus(amount).plus(fee);
            }
        });

        this.myTrades.forEach(o => {
            if(that.addressIsMine(o.listing.message.address) && o.listing.message.act == 'bid') {
                sum = sum.plus(o.offer.accept.amount.times(o.listing.message.price));
            } else if (that.addressIsMine(o.offer.message.address) && o.listing.message.act == 'ask') {
                sum = sum.plus(o.offer.accept.amount.times(o.listing.message.price));
            }
        });

        return sum;
    }

    //TODO: retore listings/offers/accepts/initTransactions on load from localStorage
    //TODO: maybe request books from another user
    sortMyListings() {
        this.sortMyList(this.myListings, this.mySortProperty, this.mySortDir);
    }

    //TODO: maybe? wrap all messages in new objects with more properties for client side handling // or atleast clean messsages upon receipt
    sortMyOffers() {
        this.sortMyList(this.myOffers, this.myOfferSortProperty, this.myOfferSortDir);
    }

    sortMyAccepts() {
        this.sortMyList(this.myTrades, this.myAccSortProperty, this.myAccSortDir);
    }

    sortMyList(arr: any[], property: string, direction: boolean) {
        arr.sort((a, b) => {
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

    getOfferCoin(offer: OfferMessage): Coin {
        return this.getActCoin(DexUtils.other(this.listings[offer.listing].message.act));
    }

    cancel(message: CancelMessage) {
        var listing: Listing = this.listings[message.listing];
        listing.cancel = message;

        if(listing.message.act == 'bid') {
            DexUtils.removeFromBook(this.bid, message.listing); 
        }

        if(listing.message.act == 'ask') {
            DexUtils.removeFromBook(this.ask, message.listing);
        }

        if(this.addressIsMine(listing.message.address)) {
            this.removeArrayHash(this.myListings, listing.message.hash);
        }

        return true;
    }

    removeArrayHash(array, hash) {
        for(var i = 0; i < array.length; i++) {
            if(array[i].message.hash == hash) {
                array.splice(i, 1);
                return;
            }
        }
    }

    getPotentialAcceptAmount(offer: OfferMessage): BigNumber {
        var listing: Listing = this.listings[offer.listing];
        this.updateListing(listing);
        if(listing.remaining.isGreaterThanOrEqualTo(listing.message.min) && listing.remaining.isGreaterThanOrEqualTo(offer.min))
            return BigNumber.minimum(offer.amount, listing.remaining);
        return new BigNumber(0);
    }

    calcSum(entries: Listing[]): BigNumber {
        var sum = new BigNumber(0);
        for(var i = 0; i < entries.length; i++) {
            sum = sum.plus(entries[i].message.price.times(entries[i].remaining));
            entries[i].sum = sum;
        }
        return sum;
    }
}

export class MarketConfig {
    coin: string;
    base: string;
    webSocketServerURL: string;
    id?: string;
}
