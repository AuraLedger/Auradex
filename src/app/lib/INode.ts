import { ListingMessage, OfferMessage, AcceptMessage, SwapInfo } from './AuradexApi';
import { BigNumber } from 'bignumber.js';

export interface INode {
    getBalance(address: string, handler: (err: any, balance: BigNumber) => void): void;
    recover(msg: string, sig: string): string;
    applyUserSettings(settings: any): void;
    signMessage(msg: string, privateKey: string): string;
    setFeeRate(fee: BigNumber): void;
    getInitFee(): BigNumber;
    getRedeemFee(): BigNumber;

    send(amount: BigNumber, from: string, to: string, privateKey: string, options: any, success: (txId: string) => void, fail: (err: any) => void): void;

    confirmTime: number;

    //swap actions
    initSwap(listing: ListingMessage, offer: OfferMessage, accept: AcceptMessage, privateKey: string, success: (txId: string) => void, fail: (error: any) => void): void; 
    acceptSwap(listing: ListingMessage, offer: OfferMessage, accept: AcceptMessage, privateKey: string, success: (txId: string) => void, fail: (error: any) => void): void; 
    redeemSwap(address: string, hashedSecret: string, secret: string, privateKey: string, success: (txId: string) => void, fail: (error: any) => void): void;

    //swap checks
    getSwapInfo(hashedSecret, success: (info: SwapInfo) => void, fail: (err: any) => void): void; 
}
