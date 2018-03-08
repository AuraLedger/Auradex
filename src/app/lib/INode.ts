export interface INode {
    getBalance(address: string, handler: any): void;
    recover(msg: string, sig: string): string;
    applyUserSettings(settings: any): void;
    signMessage(msg: string, privateKey: string): string;
    getFee(handler: (err: any, fee: number) => void): void;
}
