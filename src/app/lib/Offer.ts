import { ListingMessage, CancelMessage, OfferMessage, AcceptMessage, ParticipateMessage, RedeemMessage} from './AuradexApi'
import { SwapInfo, RedeemInfo, RefundInfo } from './SwapInfo'

export class Offer {
    message: OfferMessage; //TODO: support counterOffer so offeror can initiate swap
    accept: AcceptMessage;
    acceptInfo: SwapInfo;
    participate: ParticipateMessage;
    participateInfo: SwapInfo;
    redeem: RedeemMessage;
    redeemInfo: RedeemInfo;
    refund: any; //refund message
    refundInfo: RefundInfo;
    finish: any; //finish message

    constructor(msg: OfferMessage) {
        this.message = msg;
    }
}
