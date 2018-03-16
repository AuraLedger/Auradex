import { ListingMessage, OfferMessage, AcceptMessage, SwapInfo } from './AuradexApi';

export interface INode {
    getBalance(address: string, handler: any): void;
    recover(msg: string, sig: string): string;
    applyUserSettings(settings: any): void;
    signMessage(msg: string, privateKey: string): string;
    setFeeRate(fee: number): void;
    getInitFee(): number;
    getRedeemFee(): number;

    confirmTime: number;

    //swap actions
    initSwap(listing: ListingMessage, offer: OfferMessage, accept: AcceptMessage, privateKey: string, success: (txId: string) => void, fail: (error: any) => void): void; 
    acceptSwap(listing: ListingMessage, offer: OfferMessage, accept: AcceptMessage, privateKey: string, success: (txId: string) => void, fail: (error: any) => void): void; 
    redeemSwap(address: string, hashedSecret: string, secret: string, privateKey: string, success: (txId: string) => void, fail: (error: any) => void): void;

    //swap checks
    getSwapInfo(hashedSecret, success: (info: SwapInfo) => void, fail: (err: any) => void): void; 
}
