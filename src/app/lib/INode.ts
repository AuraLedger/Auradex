import { ListingMessage, OfferMessage, AcceptMessage} from './AuradexApi';
import { SwapInfo, RedeemInfo, RefundInfo } from './SwapInfo';
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

    /** number of confirmations before tx is considered safe */
    confirmations: number;

    //swap actions
    initSwap(listing: ListingMessage, offer: OfferMessage, hashedSecret: string, amount: BigNumber, privateKey: string, success: (txId: string) => void, fail: (error: any) => void): void; 
    acceptSwap(listing: ListingMessage, offer: OfferMessage, acceptInfo: SwapInfo, privateKey: string, success: (txId: string) => void, fail: (error: any) => void): void; 
    redeemSwap(address: string, hashedSecret: string, secret: string, privateKey: string, success: (txId: string) => void, fail: (error: any) => void): void;
    refundSwap(address: string, hashedSecret: string, privateKey: string, success: (txId: string) => void, fail: (error: any) => void): void;

    //verify tx
    getSwapInitTx(txId: string, success: (info: SwapInfo) => void, fail: (err: any) => void): void;
    getSwapRedeemTx(txId: string, success: (info: RedeemInfo) => void, fail: (err: any) => void): void;
    getSwapRefundTx(txId: string, success: (info: RefundInfo) => void, fail: (err: any) => void): void;

    //swap checks
    getInitTimestamp(hashedSecret, success: (initTimestamp: number) => void, fail: (err: any) => void): void;
    getRefundTime(hashedSecret, success: (refundTime: number) => void, fail: (err: any) => void): void;
    getSecret(hashedSecret, success: (secret: string) => void, fail: (err: any) => void): void;
    getInitiator(hashedSecret, success: (initiator: string) => void, fail: (err: any) => void): void;
    getParticipant(hashedSecret, success: (participant: string) => void, fail: (err: any) => void): void;
    getValue(hashedSecret, success: (value: BigNumber) => void, fail: (err: any) => void): void;
    getEmptied(hashedSecret, success: (emptied: boolean) => void, fail: (err: any) => void): void;
    getState(hashedSecret, success: (state: number) => void, fail: (err: any) => void): void;
}
