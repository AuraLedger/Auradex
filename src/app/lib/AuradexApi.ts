//interfaces for messages that are sent via websockets
import { BigNumber } from 'bignumber.js';

//serialized messages longer than this will be ignored
export const MAX_MESSAGE_LENGTH = 500;

export interface MessageBase {
    /**  message action */
    act: string; 
}

/** act: bid | ask 
 * enter a listing into the books
 */
export interface ListingMessage extends MessageBase {
    /** address (coin for ask, base for bid), */
    address: string; 

    /** address to receive coins of swap */
    redeemAddress: string; 

    /** amount of COIN buying/selling, */
    amount: BigNumber; 

    /** minimum COIN amount to match this trade */
    min: BigNumber; 

    /** price in BASE, */
    price: BigNumber; 

    /** id of market*/
    marketId: string; 

    /**  UTC timestamp */
    timestamp: number; 

    /** hash of message (minus the sig, JSON stringified) */
    hash?: string; 

    /** signature of message  */
    sig?: string; 
}

/** act: cancel 
 * used to cancel a book listing 
 */
export interface CancelMessage extends MessageBase {
    /** hash of your listing you want to cancel */
    listing: string; 

    /**  UTC timestamp */
    timestamp: number; 

    /** hash of message (minus the sig, JSON stringified) */
    hash?: string; 

    /** signature of message (use listing address to verify) */
    sig?: string; 

}

/** act: offer 
 * offer to swap with a listing on the books, if accepted, trading can begin 
 */
export interface OfferMessage extends MessageBase {
    /**  hash of listing  */
    listing: string; 

    /**  your sending address  */
    address: string; 

    /**  your receiving address  */
    redeemAddress: string; 

    /**  UTC timestamp */
    timestamp: number; 

    /**  number of seconds the offer is valid, typically 5 minutes, enough time for the lister to recieve and respond */
    duration: number; 

    /**  trade amount of COIN, must be greater than the listers set minimum */
    amount: BigNumber; 

    /**  minimum trade amount of COIN, lister can accept partial amount if they have multiple offers */
    min: BigNumber;

    /** hash of message (JSON stringified) */
    hash?: string; 

    /**  signature of message  */
    sig?: string; 
}

/** act: accept 
 * lister accepts the offer, swapping can begin 
 */
export interface AcceptMessage extends MessageBase {
    /** hash of offer */
    offer: string; 

    /** amount of COIN accepted */
    amount: BigNumber; 

    /** hash is transaction id of swap initiation */
    hash: string;

    /** signature of hash */
    sig?: string;
}

/** act: participate
 * offeror participated  
 */
export interface ParticipateMessage extends MessageBase {
    /**  hash of accept*/
    accept: string; 

    /** hash is transaction id of swap participation */
    hash: string;

    /** signature of hash */
    sig?: string;
}

/** act: redeem 
 * initiator redeemed participation 
 */
export interface RedeemMessage extends MessageBase {
    /** hash of participation */
    participate: string;

    /** txId of redeem */
    hash: string;

    /** signature of hash */
    sig?: string;
}

/** act: finish 
 * participator redeemed initiation 
 */
export interface FinishMessage extends MessageBase {
    /** hash of redeem */
    redeem: string;

    /** txId of redeem/refund/sumartian */
    hash: string;

    /** signature of hash */
    sig?: string;
}

/** act: refund 
 * participator redeemed initiation 
 */
export interface RefundMessage extends MessageBase {
    /** hash of accept */
    accept: string;

    /** txId of refund*/
    hash: string;

    /** signature of hash */
    sig?: string;
}
