import { ListingMessage, CancelMessage, OfferMessage, AcceptMessage, ParticipateMessage, RedeemMessage } from './AuradexApi'
import { Offer } from './Offer';

export class Listing {
    message: ListingMessage;
    offers: Offer[];
    remaining: BigNumber;
    cancel: CancelMessage;

    cancelling: boolean = false;
    sum: BigNumber = new BigNumber(0);

    constructor(msg: ListingMessage) {
        this.message = msg;
        this.offers = [];
        this.remaining = msg.amount
    }
}
