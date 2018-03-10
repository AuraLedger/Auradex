import { INode } from './INode';
import { EtherConfig } from './NodeConfig';

declare var require: any
const Web3 = require('web3');

export class EtherNode implements INode {
    web3: any;
    gasGwei: number = 20;

    constructor(config: EtherConfig) {
        this.web3 = new Web3(new Web3.providers.HttpProvider(config.rpcUrl));
    }

    getBalance(address: string, handler: any) {
        var that = this;
        this.web3.eth.getBalance(address, function(err: any, r: any) {
            if(err)
                handler(err);
            else
                handler(null, that.web3.utils.fromWei(r, 'ether'));
        });
    }

    recover(msg: string, sig: string): string {
        return this.web3.eth.accounts.recover(msg, sig);
    }

    applyUserSettings(settings: any) {
        if(settings.nodeUrl)
            this.web3 = new Web3(new Web3.providers.HttpProvider(settings.rpcUrl));
    }

    signMessage(msg: string, privateKey: string): string {
        return this.web3.eth.accounts.sign(msg, privateKey).signature;
    }

    //for ether based chains, this expect a gas price in gwei
    setFeeRate(gwei: number): void {
        this.gasGwei = gwei;
    }

    private fromGwei(gwei: number) {
        return Web3.utils.fromWei(Web3.utils.toWei(Web3.utils.toBN(gwei), 'gwei'), 'ether');
    }

    //TODO: find gasLimit for swap transacitons init
    getInitFee(): number{
        return Number(this.fromGwei(this.gasGwei * 200000));
    }

    //TODO: find gas limit for swap redeem
    getRedeemFee(): number {
        return Number(this.fromGwei(this.gasGwei * 150000));
    }

    //TODO:these
    initSwap(){}
    acceptSwap(){}
    redeemSwap(){}
    checkStatus() {}
}
