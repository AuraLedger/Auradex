import { ListingMessage, CancelMessage, OfferMessage, AcceptMessage} from './AuradexApi';
import { INode } from './INode';
import { BigNumber } from 'bignumber.js';
import * as SortedArray from 'sorted-array';
import * as CryptoJS from 'crypto-js';

declare var require: any
const Web3 = require('web3');


export class DexUtils {
    static verifyListing(listing: ListingMessage, node: INode, success: () => void, fail: (err: any) => void) {
        node.getBalance(listing.address, function(err, bal: BigNumber) {
            if(err)
                fail(err);
            else
                DexUtils.verifyListingFull(listing, node, bal, success, fail);
        });
    }

    static verifyListingFull(entry: ListingMessage, node: INode, bal: BigNumber, 
        success: () => void, fail: (err: any) => void) {

        //verify min
        if(entry.min > entry.amount) {
            fail('min ' + entry.min + ' is > than amount ' + entry.amount );
            return;
        }

        //verify simple amounts
        if(entry.amount.isLessThanOrEqualTo(0)) {
            fail('amount must be greater than 0');
        }

        if(entry.price.isLessThanOrEqualTo(0)) {
            fail('price must be greater than 0');
        }

        //verify sig
        DexUtils.verifyListingSig(entry, node, entry.address, () => {
            //verify bidder/asker has enough funds
            if(entry.act == 'bid') {
                if (entry.amount.times(entry.price).plus(node.getInitFee()).isGreaterThan(bal))
                    fail('bidder is short on available funds')
                else
                    success();
            } else if (entry.act == 'ask') {
                if (entry.amount.plus(node.getInitFee()).isGreaterThan(bal))
                    fail('asker is short on available funds')
                else
                    success();
            } else
                fail('unknown entry type ' + entry.act);
        }, fail);
    }

    static verifyOffer(offer: OfferMessage, listing: ListingMessage, node: INode, success: () => void, fail: (err: any) => void) {
        node.getBalance(offer.address, function(err, bal: BigNumber) {
            if(err)
                fail(err);
            else
                DexUtils.verifyOfferFull(offer, listing, node, bal, success, fail);
        });
    }

    static verifyOfferFull(offer: OfferMessage, listing: ListingMessage, node: INode, bal: BigNumber, 
        success: () => void, fail: (err: any) => void) {

        //verify min
        if(offer.min > offer.amount) {
            fail('min ' + listing.min + ' is > than offer amount ' + offer.amount );
            return;
        }

        if(offer.amount > listing.amount) {
            fail('offer amount is greater than listing amount');
            return;
        }

        //verify simple amounts
        if(offer.amount.isLessThanOrEqualTo(0)) {
            fail('amount must be greater than 0');
            return;
        }

        if(listing.price.isLessThanOrEqualTo(0)) {
            fail('price must be greater than 0');
            return;
        }

        //verify sig
        DexUtils.verifyOfferSig(offer, node, offer.address, () => {
            //verify bidder/asker has enough funds
            if(listing.act == 'ask') {
                if ((offer.amount.times(listing.price)).plus(node.getInitFee()).isGreaterThan(bal))
                    fail('bidder is short on available funds')
                else
                    success();
            } else if (listing.act == 'bid') {
                if (offer.amount.plus(node.getInitFee()).isGreaterThan(bal))
                    fail('asker is short on available funds')
                else
                    success();
            } else
                fail('unknown listing type ' + listing.act);
        }, fail);
    }

    static verifyAccept(accept: AcceptMessage, offer: OfferMessage, listing: ListingMessage, node: INode, success: () => void, fail: (err: any) => void) {
        node.getBalance(listing.address, function(err, bal: BigNumber) {
            if(err)
                fail(err);
            else
                DexUtils.verifyAcceptFull(accept, offer, listing, node, bal, success, fail);
        });
    }

    static verifyAcceptFull(accept: AcceptMessage, offer: OfferMessage, listing: ListingMessage, node: INode, bal: BigNumber, 
        success: () => void, fail: (err: any) => void) {

        if(accept.amount > offer.amount) {
            fail('accept amount is greater than offer amount');
            return;
        }
        if(accept.amount < offer.min) {
            fail('accept amount is below offer min');
            return;
        }

        //verify simple amounts
        if(offer.amount.isLessThanOrEqualTo(0)) {
            fail('amount must be greater than 0');
        }

        if(listing.price.isLessThanOrEqualTo(0)) {
            fail('price must be greater than 0');
        }

        //verify sig
        DexUtils.verifyOfferSig(offer, node, offer.address, () => {
            //verify bidder/asker has enough funds
            if(listing.act == 'bid') {
                if (accept.amount.times(listing.price).plus(node.getInitFee()).isGreaterThan(bal))
                    fail('bidder is short on available funds')
                else
                    success();
            } else if (listing.act == 'ask') {
                if (accept.amount.plus(node.getInitFee()).isGreaterThan(bal))
                    fail('asker is short on available funds')
                else
                    success();
            } else
                fail('unknown listing type ' + listing.act);
        }, fail);
    }



    static sha3(message: string): string {
        return Web3.utils.sha3(message);
    }

    static getListingSigMessage(listing: ListingMessage): string {
        return '{'
            + '"act": "' + listing.act + '",'
            + '"address": "' + listing.address + '",'
            + '"redeemAddress": "' + listing.redeemAddress + '",'
            + '"amount": "' + listing.amount + '",'
            + '"min": "' + listing.min + '",'
            + '"price": "' + listing.price + '",'
            + '"timestamp": ' + listing.timestamp
            + '}';
    }

    static getCancelSigMessage(cancel: CancelMessage): string {
        return '{'
            + '"act": "' + cancel.act + '",'
            + '"listing": "' + cancel.listing + '",'
            + '"timestamp": ' + cancel.timestamp
            + '}';
    }

    static getOfferSigMessage(offer: OfferMessage): string {
        return '{'
            + '"act": "' + offer.act + '",'
            + '"listing": "' + offer.listing+ '",'
            + '"address": "' + offer.address + '",'
            + '"redeemAddress": "' + offer.redeemAddress + '",'
            + '"timestamp": ' + offer.timestamp + ','
            + '"duration": ' + offer.duration + ','
            + '"amount": "' + offer.amount + '",'
            + '"min": "' + offer.min + '",'
            + '}';
    }

    static getAcceptSigMessage(accept: AcceptMessage): string {
        return '{'
            + '"act": "' + accept.act + '",'
            + '"offer": "' + accept.offer + '"'
            + '"amount": "' + accept.amount + '",'
            + '"hashedSecret": "' + accept.hashedSecret + '",'
            + '"timestamp": ' + accept.timestamp + ','
            + '"txId": "' + accept.txId + '"'
            + '}';
    }

    static verifyCancelSig(cancel: CancelMessage, node: INode, address: string, success: () => void, fail: (err) => void) {
        DexUtils.verifyGenSig(DexUtils.getCancelSigMessage(cancel), cancel.hash, cancel.sig, address, node, success, fail);
    }

    static verifyListingSig(listing: ListingMessage, node: INode, address: string, success: () => void, fail: (err) => void) {
        DexUtils.verifyGenSig(DexUtils.getListingSigMessage(listing), listing.hash, listing.sig, address, node, success, fail);
    }

    static verifyOfferSig(offer: OfferMessage, node: INode, address: string, success: () => void, fail: (err) => void) {
        DexUtils.verifyGenSig(DexUtils.getOfferSigMessage(offer), offer.hash, offer.sig, address, node, success, fail);
    }

    static verifyAcceptSig(accept: AcceptMessage, node: INode, address: string, success: () => void, fail: (err) => void) {
        DexUtils.verifyGenSig(DexUtils.getAcceptSigMessage(accept), accept.hash, accept.sig, address, node, success, fail);
    }

    private static verifyGenSig(msg: string, hash: string | undefined, sig: string | undefined, address: string, node: INode, success: () => void, fail: (err) => void) {
        try {
            var hsh = DexUtils.sha3(msg);
            if(hsh != hash)
                fail('hash did not match message')
            else if(address != node.recover(msg, sig || ''))
                fail('invalid signature')
            else
                success();
        } catch(err) {
            fail(err);
        }
    }

    static other(act: string): string {
        if (act == 'bid') return 'ask';
        if (act == 'ask') return 'bid';
        throw 'invalid act ' + act;
    }

    static verifySimpleOffer(offer: OfferMessage, node: INode, success: () => void, fail: (err) => void) {
        try {
            if(offer.address != node.recover(offer.hash || '', offer.sig || ''))
                fail('invalid signature');
            else if (DexUtils.UTCTimestamp() - offer.timestamp > offer.duration)
                fail('offer expired');
            else
                success();
        } catch(err) {
            fail(err);
        }
    }

    static validateBeforeSend(message: any): string | null {
        if(!message.hash || message.hash.length == 0)
            return 'hash is missing on message';
        if(!message.sig || message.sig.length == 0)
            return 'sig is missing on message';
        return null;
    }

    static UTCTimestamp() {
        return Math.floor((new Date()).getTime() / 1000);
    }

    static removeFromBook(book: SortedArray, obj: CancelMessage): ListingMessage | null {
        for(var i = 0; i < book.array.length; i++) {
            if(book.array[i].hash == obj.listing) {
                return book.array.splice(i, 1)[0];
            }
        }
        return null;
    }

    static findMatches(listings: ListingMessage[], offer: ListingMessage, isBid: boolean): OfferMessage[] {
        var compareBids = (a,b) => a <= b;
        var compareAsks = (a,b) => b <= a;
        var compare = (isBid ? compareBids : compareAsks);
        var matches: OfferMessage[] = [];
        for(var i = 0; i < listings.length; i++) {
            var listing = listings[i];
            if(compare(listing.price, offer.price))
            {
                if(listing.redeemAddress == offer.address) //if you run into your own order, stop searching
                    return matches;

                var listingSize = listing.amount.times(listing.price);
                var offerSize = offer.amount.times(offer.price);
                if(listing.amount >= offer.min && offer.amount >= listing.min)
                {
                    //add match
                    var tradeAmount = BigNumber.minimum(offer.amount, listing.amount);
                    var newMin = BigNumber.maximum(offer.min, listing.min);
                    offer.amount = offer.amount.minus(tradeAmount);
                    matches.push({
                        act: 'offer',
                        listing: listing.hash || '',
                        address: offer.address,
                        redeemAddress: offer.redeemAddress,
                        amount: tradeAmount,
                        min: newMin,
                        timestamp: DexUtils.UTCTimestamp(),
                        duration: 60 * 5, // 5 min TODO: get from settings
                    });
                    if(offer.amount < offer.min)
                        return matches;
                }
            }
            else
                break; //no more listings match this price
        }

        return matches; 
    }
}
