import { INode } from './INode';
import { EtherConfig } from './NodeConfig';
import { EntryMessage, TradeMessage } from './AuradexApi';

declare var require: any
const Web3 = require('web3');

export class EtherNode implements INode {
    web3: any;
    gasGwei: number = 20;
    requiredConfirmations: number = 12;
    contractAddress: string;
    type: string;


    constructor(config: EtherConfig) {
        this.web3 = new Web3(new Web3.providers.HttpProvider(config.rpcUrl));
        this.contractAddress = config.contractAddress;
        this.type = config.type;
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
        if(settings.requiredConfirmations)
            this.requiredConfirmations = settings.requiredConfirmations;
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

    getConfirmationCount(txId: string, success: (count: number) => void, fail: (error: any) => void): void {
        this.web3.eth.getTransactionReceipt(txId, (err, tran) => {
            if(err)
                fail(err);
            else if (tran) {
                this.web3.eth.getBlockNumber((err, num) => {
                    if(err)
                        fail(err);
                    else
                        success(num - tran.blockNumber);
                });
            } else 
                success(0);
        });
    }

    atomicswapContractABI = [{"constant":false,"inputs":[{"name":"_refundTime","type":"uint256"},{"name":"_hashedSecret","type":"bytes20"},{"name":"_initiator","type":"address"}],"name":"participate","outputs":[],"payable":true,"stateMutability":"payable","type":"function"},{"constant":false,"inputs":[{"name":"_hashedSecret","type":"bytes20"}],"name":"refund","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"_secret","type":"bytes32"},{"name":"_hashedSecret","type":"bytes20"}],"name":"redeem","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"_refundTime","type":"uint256"},{"name":"_hashedSecret","type":"bytes20"},{"name":"_participant","type":"address"}],"name":"initiate","outputs":[],"payable":true,"stateMutability":"payable","type":"function"},{"constant":true,"inputs":[{"name":"","type":"bytes20"}],"name":"swaps","outputs":[{"name":"initTimestamp","type":"uint256"},{"name":"refundTime","type":"uint256"},{"name":"hashedSecret","type":"bytes20"},{"name":"secret","type":"bytes32"},{"name":"initiator","type":"address"},{"name":"participant","type":"address"},{"name":"value","type":"uint256"},{"name":"emptied","type":"bool"},{"name":"state","type":"uint8"}],"payable":false,"stateMutability":"view","type":"function"},{"inputs":[],"payable":false,"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":false,"name":"_refundTime","type":"uint256"}],"name":"Refunded","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"_redeemTime","type":"uint256"}],"name":"Redeemed","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"_initiator","type":"address"},{"indexed":false,"name":"_participator","type":"address"},{"indexed":false,"name":"_hashedSecret","type":"bytes20"},{"indexed":false,"name":"_value","type":"uint256"}],"name":"Participated","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"name":"_initTimestamp","type":"uint256"},{"indexed":false,"name":"_refundTime","type":"uint256"},{"indexed":false,"name":"_hashedSecret","type":"bytes20"},{"indexed":false,"name":"_participant","type":"address"},{"indexed":false,"name":"_initiator","type":"address"},{"indexed":false,"name":"_funds","type":"uint256"}],"name":"Initiated","type":"event"}];

    //TODO:these
    initSwap(){}

    acceptSwap(receiver: EntryMessage, initiator: EntryMessage, trade: TradeMessage, success: (txId: string) => void, fail: (error: any) => void): void {
        var contract = this.web3.eth.contrace(this.atomicswapContractABI);
        //this.web3.
    }

    redeemSwap(){}
    checkStatus() {}
}
