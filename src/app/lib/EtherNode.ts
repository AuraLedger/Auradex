import { INode } from './INode';
import { EtherConfig } from './NodeConfig';
import { EntryMessage, TradeMessage } from './AuradexApi';
import { EthAtomicSwap } from './EthAtomicSwap';

declare var require: any
const Web3 = require('web3');

export class EtherNode implements INode {
    web3: any;
    gasGwei: number = 20;
    requiredConfirmations: number = 12;
    contractAddress: string;
    type: string;
    chainId: number;

    constructor(config: EtherConfig) {
        this.web3 = new Web3(new Web3.providers.HttpProvider(config.rpcUrl));
        this.contractAddress = config.contractAddress;
        this.type = config.type;
        this.chainId = config.chainId;
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

    //TODO:these
    initSwap(){}

    acceptSwap(receiver: EntryMessage, initiator: EntryMessage, trade: TradeMessage, success: (txId: string) => void, fail: (error: any) => void): void {
        var contract = new this.web3.eth.Contract(EthAtomicSwap.ContractABI, this.contractAddress, {
            from: initiator.address,
            gasPrice: Web3.utils.toWei(Web3.utils.toBN(this.gasGwei), 'gwei')
        });


        var refundTime = Math.floor((new Date()).getTime() / 1000) + 60 * 60 * 24; //add 24 hours
        var hashedSecret = Web3.utils.hexToBytes(trade.hashedSecret);

        var participateMethod = contract.methods.participate(refundTime, hashedSecret, receiver.redeemAddress);

        var that = this;
        participateMethod.estimateGas({from: initiator.address, gas: 300000}, function(err, gas) {
            if(err)
                fail(err);
            else {
                that.web3.eth.accounts.signTransaction( {
                    to: that.contractAddress,
                    value: Web3.utils.toWei(Web3.toBN(trade.amount), 'ether'),
                    gas: gas,
                    gasPrice: Web3.utils.toWei(Web3.utils.toBN(that.gasGwei), 'gwei'),
                    chainId: that.chainId 
                }, function (err, signedTx) {
                    if(err)
                        fail(err);
                    else {
                        that.web3.eth.sendTransaction({to: that.contractAddress, from: initiator.address, data: participateMethod.encodeABI()});
                    }
                });
            }
        });
    }

    redeemSwap(){}
    checkStatus() {}
}
