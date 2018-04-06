import { ListingMessage, CancelMessage, OfferMessage, AcceptMessage} from './AuradexApi';
import { INode } from './INode';
import { SwapInfo, RedeemInfo, RefundInfo } from './SwapInfo';
import { Listing } from './Listing';
import { Offer } from './Offer';
import { BigNumber } from 'bignumber.js';
import { Buffer } from 'buffer';
import * as SortedArray from 'sorted-array';
import * as CryptoJS from 'crypto-js';
import * as RIPEMD160 from 'ripemd160';

declare var require: any
const Web3 = require('web3');


export class DexUtils {
    static verifyListingBalance(entry: ListingMessage, node: INode, checkFee: boolean, success: () => void, fail: (err: any) => void) {
        node.getBalance(entry.address, function(err, bal: BigNumber) {
            if(err)
                fail(err);
            else{        
                var checkAmount: BigNumber;
                if(entry.act == 'bid') {
                    checkAmount = entry.amount.times(entry.price);
                } else if (entry.act == 'ask') {
                    checkAmount = entry.amount;
                } else {
                    fail('unknown entry type ' + entry.act);
                    return;
                }

                if(checkFee) {
                    checkAmount = checkAmount.plus(node.getInitFee());
                }

                if(checkAmount.isGreaterThan(bal)) {
                    fail('lister is short on funds');
                    return;
                }
            }
        });
    }

    static BAD_SECRET = '0000000000000000000000000000000000000000000000000000000000000000';
    static BAD_SECRET_HASHED = new RIPEMD160().update(new Buffer(DexUtils.BAD_SECRET, "hex")).digest('hex'); 

    static verifyListing(entry: ListingMessage, node: INode): string {

        //verify min
        if(entry.min.isGreaterThan(entry.amount)) {
            return 'min ' + entry.min + ' is > than amount ' + entry.amount
        }

        //verify simple amounts
        if(entry.amount.isLessThanOrEqualTo(0)) {
            return 'amount must be greater than 0';
        }

        if(entry.price.isLessThanOrEqualTo(0)) {
            return 'price must be greater than 0'
        }

        //verify sig
        return DexUtils.verifyListingSig(entry, node, entry.address);
    }

    static verifyOfferBalance(offer: OfferMessage, listing: ListingMessage, checkFee: boolean, node: INode, success: () => void, fail: (err: any) => void) {
        node.getBalance(offer.address, function(err, bal: BigNumber) {
            if(err)
                fail(err);
            else {
                var checkAmount: BigNumber;
                if(listing.act == 'ask') {
                    checkAmount = offer.amount.times(listing.price);
                } else if (listing.act == 'bid') {
                    checkAmount = offer.amount;
                } else {
                    fail('unknown entry type ' + listing.act);
                    return;
                }

                if(checkFee) {
                    checkAmount = checkAmount.plus(node.getInitFee());
                }

                if(checkAmount.isGreaterThan(bal)) {
                    fail('offeror is short on funds');
                    return;
                } else {
                    success();
                }
            }
        });
    }

    static verifyOffer(offer: OfferMessage, listing: ListingMessage, node: INode): string {

        //verify min
        if(offer.min.isGreaterThan(offer.amount)) {
            fail('min ' + listing.min + ' is > than offer amount ' + offer.amount );
            return;
        }

        if(offer.amount.isGreaterThan(listing.amount)) {
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
        return DexUtils.verifyOfferSig(offer, node, offer.address); 
    }

    static verifyAcceptInfo(info: SwapInfo, offer: Offer, listing: Listing): string {
        var offerMin: BigNumber = offer.message.min;
        var offerAmount: BigNumber = offer.message.amount;
        if(listing.message.act == 'bid') {
            offerMin = offerMin.times(listing.message.price);
            offerAmount = offerAmount.times(listing.message.price);
        }

        if(info.value.isLessThan(offerMin))
            return 'init swap amount ' + info.value + ' is less than offer min ' + offerMin;

        if(info.value.isGreaterThan(offerAmount))
            return 'init swap amount ' + info.value + ' is greater than offered amount' + offerAmount;

        if(info.recipient != offer.message.redeemAddress)
            return 'init swap transaction recipient ' + info.recipient + ' does not match offer redeem address ' + offer.message.redeemAddress;

        if(info.timestamp + info.refundTime - DexUtils.UTCTimestamp() < 60 * 60 * 36) // require atleast 36 hours remaining to participate
            return 'times up - less than 36 hours remain on init refund';

        if(!info.success)
            return 'transaction failed';

        if(info.spent)
            return 'transaction has already been spent';
        
        return null;
    }

    static verifyParticipateInfo(info: SwapInfo, offer: Offer, listing: Listing): string {
        if(listing.message.act == 'bid' && !info.value.times(listing.message.price).eq(offer.acceptInfo.value))
                return 'participate value ' + info.value + ' times price ' + listing.message.price + ' does not equal initiate amount ' + offer.acceptInfo.value;

        if (listing.message.act == 'ask' && !offer.acceptInfo.value.times(listing.message.price).eq(info.value))
            return 'participate value ' + info.value + ' does not equal initiate amount ' + offer.acceptInfo.value + ' times price ' + listing.message.price;

        if(info.recipient != listing.message.redeemAddress)
            return 'init swap transaction recipient ' + info.recipient + ' does not match listing redeem address ' + listing.message.redeemAddress;

        if(info.timestamp + info.refundTime - DexUtils.UTCTimestamp() < 60 * 60 * 12) // require atleast 12 hours remaining to participate
            return 'times up - less than 12 hours remain on participate refund';

        if(!info.success)
            return 'transaction failed';

        if(info.spent)
            return 'transaction has already been spent';

        return null;
    }

    static verifyRedeemInfo(info: RedeemInfo, offer: Offer, listing: Listing): string {
        if(!info.success)
            return 'transaction failed';

        if(info.hashedSecret != offer.acceptInfo.hashedSecret)
            return 'redeem did not use same hashedSecret';

        return null;
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
            + '"marketId": "' + listing.marketId+ '",'
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

    static verifyCancelSig(cancel: CancelMessage, node: INode, address: string): string {
        return DexUtils.verifyGenSig(DexUtils.getCancelSigMessage(cancel), cancel.hash, cancel.sig, address, node);
    }

    static verifyListingSig(listing: ListingMessage, node: INode, address: string): string {
        return DexUtils.verifyGenSig(DexUtils.getListingSigMessage(listing), listing.hash, listing.sig, address, node);
    }

    static verifyOfferSig(offer: OfferMessage, node: INode, address: string): string {
        return DexUtils.verifyGenSig(DexUtils.getOfferSigMessage(offer), offer.hash, offer.sig, address, node);
    }

    private static verifyGenSig(msg: string, hash: string | undefined, sig: string | undefined, address: string, node: INode): string {
        try {
            var hsh = DexUtils.sha3(msg);
            if(hsh != hash)
                return 'hash did not match message';
            else if(address != node.recover(msg, sig || ''))
                return 'invalid signature';
            else
                return null;
        } catch(err) {
            return err.message;
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

    static removeFromBook(book: SortedArray, hash: string): Listing | null {
        for(var i = 0; i < book.array.length; i++) {
            if(book.array[i].message.hash == hash) {
                return book.array.splice(i, 1)[0];
            }
        }
        return null;
    }

    static findMatches(listings: ListingMessage[], offer: ListingMessage, isBid: boolean): OfferMessage[] {
        var compareBids = (a,b) => a.isLessThanOrEqualTo(b);
        var compareAsks = (a,b) => b.isLessThanOrEqualTo(a);
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
                if(listing.amount.isGreaterThanOrEqualTo(offer.min) && offer.amount.isGreaterThanOrEqualTo(listing.min))
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
                    if(offer.amount.isLessThan(offer.min))
                        return matches;
                }
            }
            else
                break; //no more listings match this price
        }

        return matches; 
    }
}
