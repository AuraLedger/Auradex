//interfaces for messages that are sent via websockets

export interface MessageBase {
    act: string; // message action
}

//act: register
export interface RegisterMessage extends MessageBase {
    coinAddress: string;
    baseAddress: string;
    coinSig: string;
    baseSig: string;
}

//act: bid | ask
export interface EntryMessage extends MessageBase {
    address: string; //address (coin for ask, base for bid),
    redeemAddress: string; //address to receive coins of swap
    amount: number; //amount of coin buying/selling,
    price: number; //price in base,
    min: number; //minimum base amount to match this trade
    nonce: number; //incremental number to prevent replay attacks
    sig?: string; //signature proving legitimacy of offer

    state?: string;
    online?: number;
    tradeAmount?: number;
    timestamp?: Date;
    _id?: string;
}

//act: nonce
export interface NonceMessage extends MessageBase {
    entryType: string; //bid or ask
    val: number; //the nonce
}

//act: keyval
//used to update a value of an entry
export interface KeyValMessage extends MessageBase {
    entryType: string; //bid, ask, or trade
    _id: string;
    key: string;
    val: string;
}

//act: cancel
//used to cancel a book entry
export interface CancelMessage extends MessageBase {
    entryType: string;
    _id: string;
    price: number;
}

//act: trade
//represents a match of two entries
export interface TradeMessage extends MessageBase {
    cause: string; // 'bid' or 'ask' - action that initiated the match
    id1: string; // bid or ask _id of trade initiator 
    id2: string; // ask or bid _id of trade receiver 
    state: string; // status 'active', 'complete', 'cancel'
    step: number; // 0-3
    timestamp: Date; // timestamp
    amount: number; // trade amount of market coin
    txIds: string[]; // the transactions ids for each step of the swap
    hashedSecret: string; 
    _id: string; //db id
}
