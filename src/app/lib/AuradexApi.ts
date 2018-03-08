export interface MessageBase {
    act: string; // message action
}

export interface RegisterMessage extends MessageBase {
    coinAddress: string;
    baseAddress: string;
    coinSig: string;
    baseSig: string;
}

export interface EntryMessage extends MessageBase {
    address: string; //address (coin for ask, base for bid),
    amount: number; //amount of coin buying/selling,
    price: number; //price in base,
    min: number; //minimum base amount to match this trade
    nonce: number; //incremental number to prevent replay attacks
    sig?: string; //signature proving legitimacy of offer

    state?: string;
    online?: number;
    tradeAmount?: number;
    timestamp?: Date;
    _id?: number;
}

export interface NonceMessage extends MessageBase {
    entryType: string; //bid or ask
    val: number; //the nonce
}
