import { Listing } from './Listing'
import { Offer } from './Offer'

export class Trade {
    tradeType: string;
    amount: BigNumber;
    price: BigNumber;
    size: BigNumber;
    time: Date;

    status: string = 'New';

    constructor(public listing: Listing, public offer: Offer, coinAddress: string, baseAddress: string) {
        if(listing.message.address == coinAddress || offer.message.address == coinAddress)
            this.tradeType = 'Sell';
        else if (listing.message.address == baseAddress || offer.message.address == baseAddress)
            this.tradeType = 'Buy';
        else
            this.tradeType = 'Other';

        this.time = new Date(listing.message.timestamp * 1000);
        this.price = this.listing.message.price;
        this.setValues();
    }

    setValues() {
        this.amount = this.offer.accept ? this.offer.accept.amount : this.offer.message.amount;
        this.size = this.amount.times(this.price);
    }

    setStatus() {
        if(this.offer.finish)
            this.status = 'Finished';
        else if (this.offer.refundInfo) {
            if(this.offer.refundInfo.confirmations
        }

    }
}
