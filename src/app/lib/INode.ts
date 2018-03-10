export interface INode {
    getBalance(address: string, handler: any): void;
    recover(msg: string, sig: string): string;
    applyUserSettings(settings: any): void;
    signMessage(msg: string, privateKey: string): string;
    setFeeRate(fee: number): void;
    getInitFee(): number;
    getRedeemFee(): number;

    //swap actions
    initSwap();
    acceptSwap();
    redeemSwap();
    checkStatus();

}
