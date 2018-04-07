import { ListingMessage, CancelMessage, OfferMessage, AcceptMessage, ParticipateMessage, RedeemMessage } from './AuradexApi'
import { Offer } from './Offer';
import { BigNumber } from 'bignumber.js';

export class Listing {
    message: ListingMessage;
    offers: Offer[];
    remaining: BigNumber;
    cancel: CancelMessage;

    cancelling: boolean = false;
    sum: BigNumber = new BigNumber(0);
    size: BigNumber;
    mine: boolean;

    constructor(msg: ListingMessage, _mine: boolean) {
        this.message = msg;
        this.offers = [];
        this.remaining = msg.amount
        this.size = msg.amount.times(msg.price);
        this.mine = _mine;
    }
}
