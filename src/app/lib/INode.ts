import { EntryMessage, TradeMessage } from './AuradexApi';

export interface INode {
    getBalance(address: string, handler: any): void;
    recover(msg: string, sig: string): string;
    applyUserSettings(settings: any): void;
    signMessage(msg: string, privateKey: string): string;
    setFeeRate(fee: number): void;
    getInitFee(): number;
    getRedeemFee(): number;

    getConfirmationCount(txId: string, success: (count: number) => void, fail: (error: any) => void): void;
    requiredConfirmations: number;

    //swap actions
    initSwap(receiver: EntryMessage, initiator: EntryMessage, trade: TradeMessage, privateKey: string, success: (txId: string) => void, fail: (error: any) => void): void; 
    acceptSwap(receiver: EntryMessage, initiator: EntryMessage, trade: TradeMessage, privateKey: string, success: (txId: string) => void, fail: (error: any) => void): void; 
    redeemSwap();
    checkStatus();
}
