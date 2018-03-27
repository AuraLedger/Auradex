//interfaces for messages that are sent via websockets
import { BigNumber } from 'bignumber.js';

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

    /** txId of swap participate, NOT PART OF HASH, is not sent with original message, used to track swap progress if this is accepted */
    txId?: string;

}

/** act: accept 
 * lister accepts the offer, swapping can begin 
 */
export interface AcceptMessage extends MessageBase {
    /**  hash of offer  */
    offer: string; 

    /**  trade amount of COIN, must be greater than the offers set minimum */
    amount: BigNumber; 
    
    /**  20 byte ripemd hash of 32 byte secret */
    hashedSecret: string; 

    /**  UTC timestamp */
    timestamp: number; 

    /** transaction of swap initiation */
    txId: string;

    /**  hash of message */
    hash?: string; 

    /**  signature of message */
    sig?: string; 

}

/** act: setFeeRates
 * fee rates from the relay server
 */
export interface FeeRateMessage extends MessageBase {
    coinFeeRate: BigNumber;
    baseFeeRate: BigNumber;
}

export interface SwapInfo {
    initTimestamp: number;
    refundTime: number;
    hashedSecret: string;
    secret: string;
    initiator: string;
    participant: string;
    value: BigNumber;
    emptied: boolean;
    state: number; // 0, 1, 2 = empty, initiated, participated
}
