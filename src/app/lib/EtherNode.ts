import { INode } from './INode';
import { EtherConfig } from './NodeConfig';
import { ListingMessage, OfferMessage, AcceptMessage} from './AuradexApi';
import { SwapInfo, RedeemInfo, RefundInfo } from './SwapInfo';
import { DexUtils } from './DexUtils';
import { EthAtomicSwap } from './EthAtomicSwap';
import * as EthTx from'ethereumjs-tx';
import { Buffer } from 'buffer';
import { BigNumber } from 'bignumber.js';

declare var require: any
const Web3 = require('web3');

export class EtherNode implements INode {
    web3: any;
    gasGwei: BigNumber = new BigNumber(20); //proper fee estimation
    confirmations: number = 12;
    contractAddress: string;
    type: string;
    chainId: number;

    encodedInitiate: string;
    encodedParticipate: string;
    encodedRedeem: string;
    encodedRefund: string;

    constructor(config: EtherConfig) {
        this.web3 = new Web3(new Web3.providers.HttpProvider(config.rpcUrl));
        this.contractAddress = config.contractAddress;
        this.type = config.type;
        this.chainId = config.chainId;

        this.encodedInitiate = this.web3.eth.abi.encodeFunctionSignature('initiate(uint256,bytes20,address)');
        this.encodedParticipate = this.web3.eth.abi.encodeFunctionSignature('participate(uint256,bytes20,address)');
        this.encodedRedeem = this.web3.eth.abi.encodeFunctionSignature('redeem(bytes32,bytes20)');
        this.encodedRefund = this.web3.eth.abi.encodeFunctionSignature('refund(bytes20)');
    }

    getBalance(address: string, handler: (err: any, bal: BigNumber) => void):void {
        var that = this;
        this.web3.eth.getBalance(address, function(err: any, r: BigNumber) {
            if(err)
                handler(err, null);
            else
                handler(null, new BigNumber(that.web3.utils.fromWei(r, 'ether')));
        });
    }

    recover(msg: string, sig: string): string {
        return this.web3.eth.accounts.recover(msg, sig);
    }

    applyUserSettings(settings: any) {
        if(settings.nodeUrl)
            this.web3 = new Web3(new Web3.providers.HttpProvider(settings.rpcUrl));
        if(settings.requiredConfirmations)
            this.confirmations = settings.requiredConfirmations;
    }

    signMessage(msg: string, privateKey: string): string {
        return this.web3.eth.accounts.sign(msg, privateKey).signature;
    }

    //for ether based chains, this expect a gas price in gwei
    setFeeRate(gwei: BigNumber): void {
        this.gasGwei = new BigNumber(gwei);
    }

    private fromGwei(gwei: BigNumber): BigNumber {
        return new BigNumber(Web3.utils.fromWei(Web3.utils.toWei(gwei.toString(10), 'gwei'), 'ether'));
    }

    getInitFee(): BigNumber {
        return this.fromGwei(this.gasGwei.times(200000));
    }

    getRedeemFee(): BigNumber{
        return this.fromGwei(this.gasGwei.times(150000));
    }

    send(amount: BigNumber, from: string, to: string, privkey: string, options: any, success: (txId: string) => void, fail: (err: any) => void): void {
        var that = this;
        this.web3.eth.getTransactionCount(from, function(err, nonce) {
            if(err){
                fail(err);
            }
            else {
                if(nonce || nonce === 0)
                {
                    if(!Web3.utils.isAddress(to)) {
                        fail("Invalid destination address " + to);
                        return;
                    }

                    options.gasPrice = new BigNumber(options.gasPrice || 20);

                    var txConfig = {
                        nonce: Web3.utils.toHex(nonce),
                        gasPrice: Web3.utils.toHex(Web3.utils.toWei(options.gasPrice.toString(10) , 'gwei')),
                        gasLimit: Web3.utils.toHex(options.gasLimit || 21000),
                        from: from,
                        to: to,
                        value: Web3.utils.toHex(Web3.utils.toWei(amount.toString(10), 'ether')),
                        chainId: that.chainId
                    }

                    if (privkey.startsWith('0x'))
                        privkey = privkey.substring(2);
                    var privbuf = new Buffer(privkey, 'hex');
                    privkey = '';

                    var tx = new EthTx(txConfig);
                    tx.sign(privbuf);
                    var serializedTx = tx.serialize();
                    that.web3.eth.sendSignedTransaction('0x' + serializedTx.toString('hex'), function(err, result) {
                        if(err)
                            fail(err);
                        else { 
                            success(result);
                        }
                    });

                } else {
                    fail("Unabled to get transaction nonce");
                }


            }
        });
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

    initSwap(listing: ListingMessage, offer: OfferMessage, hashedSecret: string, amount: BigNumber, privateKey: string, success: (txId: string) => void, fail: (error: any) => void) { 
        var contract = new this.web3.eth.Contract(EthAtomicSwap.ContractABI, this.contractAddress, {
            from: listing.address,
            gasPrice: Web3.utils.toWei(this.gasGwei.toString(10), 'gwei')
        });

        var refundTime = DexUtils.UTCTimestamp() + 60 * 60 * 48; //add 48 hours
        var hashedSecret = this._hexString(hashedSecret);

        var value: BigNumber = amount;
        if(listing.act == 'bid') {
            value = amount.times(listing.price);
        }

        var initiateMethod = contract.methods.initiate(refundTime, hashedSecret, offer.redeemAddress);

        var that = this;
        initiateMethod.estimateGas({from: listing.address, gas: 300000}, function(err, gas) {
            if(err)
                fail(err);
            else {
                that.web3.eth.accounts.signTransaction( {
                    from: listing.address,
                    to: that.contractAddress,
                    value: Web3.utils.toWei(value.toString(10), 'ether'),
                    gas: (new BigNumber(gas.toString())).times('1.2').toFixed(0),
                    gasPrice: Web3.utils.toWei(that.gasGwei.toString(10), 'gwei'),
                    chainId: that.chainId, 
                    data: initiateMethod.encodeABI()
                }, privateKey, function (err, signedTx) {
                    if(err)
                        fail(err);
                    else {
                        that.web3.eth.sendSignedTransaction(signedTx.rawTransaction, function(err, txId) {
                            if(err)
                                fail(err);
                            else
                                success(txId);

                        });
                    }
                });
            }
        });
    }

    acceptSwap(listing: ListingMessage, offer: OfferMessage, acceptInfo: SwapInfo, privateKey: string, success: (txId: string) => void, fail: (error: any) => void): void { 
        var contract = new this.web3.eth.Contract(EthAtomicSwap.ContractABI, this.contractAddress, {
            from: offer.address,
            gasPrice: Web3.utils.toWei(this.gasGwei.toString(10), 'gwei')
        });

        //TODO: make sure there is atleast 30 hours remaining on the initiate swap
        var refundTime = DexUtils.UTCTimestamp() + 60 * 60 * 24; //add 24 hours
        var hashedSecret = this._hexString(acceptInfo.hashedSecret);

        var participateMethod = contract.methods.participate(refundTime, hashedSecret, listing.redeemAddress);

        var amount: BigNumber;
        if(listing.act == 'ask') {
            amount = acceptInfo.value.times(listing.price);
        } else {
            amount = acceptInfo.value;
        }

        var that = this;
        participateMethod.estimateGas({from: offer.address, gas: 300000}, function(err, gas) {
            if(err)
                fail(err);
            else {
                that.web3.eth.accounts.signTransaction( {
                    from: offer.address,
                    to: that.contractAddress,
                    value: Web3.utils.toWei(amount.toString(10), 'ether'),
                    gas: (new BigNumber(gas.toString())).times('1.2').toFixed(0),
                    gasPrice: Web3.utils.toWei(that.gasGwei.toString(10), 'gwei'),
                    chainId: that.chainId, 
                    data: participateMethod.encodeABI()
                }, privateKey, function (err, signedTx) {
                    if(err)
                        fail(err);
                    else {
                        that.web3.eth.sendSignedTransaction(signedTx.rawTransaction, function(err, txId) {
                            if(err)
                                fail(err);
                            else
                                success(txId);

                        });
                    }
                });
            }
        });
    }

    redeemSwap(address: string, hashedSecret: string, secret: string, privateKey: string, success: (txId: string) => void, fail: (error: any) => void): void {
        var contract = new this.web3.eth.Contract(EthAtomicSwap.ContractABI, this.contractAddress, {
            from: address,
            gasPrice: Web3.utils.toWei(this.gasGwei.toString(10), 'gwei')
        });

        var _hashedSecret = this._hexString(hashedSecret);
        var _secret = this._hexString(secret);

        var redeemMethod = contract.methods.redeem(_secret, _hashedSecret);

        var amount = 0;
        var that = this;
        redeemMethod.estimateGas({from: address, gas: 300000}, function(err, gas) {
            if(err)
                fail(err);
            else {
                that.web3.eth.accounts.signTransaction( {
                    from: address,
                    to: that.contractAddress,
                    value: Web3.utils.toBN(0),
                    gas: (new BigNumber(gas.toString())).times('1.2').toFixed(0),
                    gasPrice: Web3.utils.toWei(that.gasGwei.toString(10), 'gwei'),
                    chainId: that.chainId, 
                    data: redeemMethod.encodeABI()
                }, privateKey, function (err, signedTx) {
                    if(err)
                        fail(err);
                    else {
                        that.web3.eth.sendSignedTransaction(signedTx.rawTransaction, function(err, txId) {
                            if(err)
                                fail(err);
                            else
                                success(txId);
                        });
                    }
                });
            }
        });
    }

    refundSwap(address: string, hashedSecret: string, privateKey: string, success: (txId: string) => void, fail: (error: any) => void): void {
        var contract = new this.web3.eth.Contract(EthAtomicSwap.ContractABI, this.contractAddress, {
            from: address,
            gasPrice: Web3.utils.toWei(this.gasGwei.toString(10), 'gwei')
        });

        var _hashedSecret = this._hexString(hashedSecret);
        var refundMethod = contract.methods.refund(_hashedSecret);

        var amount = 0;
        var that = this;
        refundMethod.estimateGas({from: address, gas: 300000}, function(err, gas) {
            if(err)
                fail(err);
            else {
                that.web3.eth.accounts.signTransaction( {
                    from: address,
                    to: that.contractAddress,
                    value: Web3.utils.toBN(0),
                    gas: (new BigNumber(gas.toString())).times('1.2').toFixed(0),
                    gasPrice: Web3.utils.toWei(that.gasGwei.toString(10), 'gwei'),
                    chainId: that.chainId, 
                    data: refundMethod.encodeABI()
                }, privateKey, function (err, signedTx) {
                    if(err)
                        fail(err);
                    else {
                        that.web3.eth.sendSignedTransaction(signedTx.rawTransaction, function(err, txId) {
                            if(err)
                                fail(err);
                            else
                                success(txId);
                        });
                    }
                });
            }
        });
    }

    getTxData(txId: string, success: (tx, txReceipt, blockNum, block) => void, fail: (err: any) => void) {
        var that = this;
        this.web3.eth.getTransaction(txId, (err, tx) => {
            if(err)
                fail(err);
            else {
                that.web3.eth.getTransactionReceipt(txId, (err, txReceipt) => {
                    if(err)
                        fail(err);
                    else {
                        that.web3.eth.getBlockNumber((err, blockNum) => {
                            if(err)
                                fail(err);
                            else {
                                that.web3.eth.getBlock(txReceipt.blockHash, false, (err, block) => {
                                    if(err)
                                        fail(err);
                                    else {
                                        success(tx, txReceipt, blockNum, block);
                                    }
                                });
                            }
                        });
                    }
                });
            }
        });
    }

    getSwapInitTx(txId: string, success: (info: SwapInfo) => void, fail: (err: any) => void): void {
        var that = this;
        this.getTxData(txId, (tx, txReceipt, blockNum, block) => {
            var txRawData;
            if(tx.input.startsWith(that.encodedInitiate)) {
                txRawData = '0x' + tx.input.substr(that.encodedInitiate.length);
            } else if (tx.input.startsWith(that.encodedParticipate)) {
                txRawData = '0x' + tx.input.substr(that.encodedParticipate);
            } else {
                fail('invalid tx data, does not start with encoded initiate or participate function');
            }

            var txParams = that.web3.eth.abi.decodeParameters(['uint256','bytes20','address'], txRawData);

            that.getEmptied(txParams['1'], (emptied: boolean) => {
                success({
                    success: txReceipt.status == 1,
                    confirmations: blockNum - txReceipt.blockNumber,
                    value: Web3.fromWei(tx.value, 'ether'),
                    recipient: txParams['2'],
                    timestamp: block.timestamp,
                    refundTime: Web3.utils.hexToNumber(txParams['0']) - block.timestamp,
                    spent: emptied,
                    hashedSecret: txParams['1'],
                });
            }, (err) => {
                fail(err);
            });
        }, (err) => {
            fail(err);
        });
    }

    getSwapRedeemTx(txId: string, success: (info: RedeemInfo) => void, fail: (err: any) => void): void {
        var that = this;
        this.getTxData(txId, (tx, txReceipt, blockNum, block) => {
            var txRawData;
            if(tx.input.startsWith(that.encodedRedeem)) {
                txRawData = '0x' + tx.input.substr(that.encodedRedeem.length);
            } else {
                fail('invalid tx data, does not start with encoded redeem function');
            }

            var txParams = that.web3.eth.abi.decodeParameters(['bytes32','bytes20'], txRawData);

            success({
                success: txReceipt.status == 1,
                confirmations: blockNum - txReceipt.blockNumber,
                recipient: tx.from,
                value: Web3.fromWei(tx.value, 'ether'),
                secret: txParams['0'],
                hashedSecret: txParams['1'],
            });
        }, (err) => {
            fail(err);
        });
    }

    getSwapRefundTx(txId: string, success: (info: RefundInfo) => void, fail: (err: any) => void): void {
        var that = this;
        this.getTxData(txId, (tx, txReceipt, blockNum, block) => {
            var txRawData;
            if(tx.input.startsWith(that.encodedRefund)) {
                txRawData = '0x' + tx.input.substr(that.encodedRefund.length);
            } else {
                fail('invalid tx data, does not start with encoded refund function');
            }

            var txParams = that.web3.eth.abi.decodeParameters(['bytes20'], txRawData);

            success({
                success: txReceipt.status == 1,
                confirmations: blockNum - txReceipt.blockNumber,
                recipient: tx.from,
                value: Web3.fromWei(tx.value, 'ether'),
                hashedSecret: txParams['0'],
            });
        }, (err) => {
            fail(err);
        });
    }

    private increaseHexByOne(hex) {
        let x = Web3.utils.toBN(hex);
        let sum = x.add(Web3.utils.toBN(1));
        let result = '0x' + sum.toString(16);
        return result;
    }

    private _hexToBytes(hex: string) {
        return Web3.utils.hexToBytes(this._hexString(hex));
    }

    private _hexString(hex: string) {
        if(!hex.startsWith('0x'))
            return '0x' + hex;
        return hex;
    }

    getInitTimestamp(hashedSecret, success: (initTimestamp: number) => void, fail: (err: any) => void): void {
        var contract = new this.web3.eth.Contract(EthAtomicSwap.ContractABI, this.contractAddress);
        contract.methods.getInitTimestamp(this._hexString(hashedSecret)).call(function(err: any, result: string) {
            if(err)
                fail(err)
            else
                success(Number(result));
        });
    }

    getRefundTime(hashedSecret, success: (refundTime: number) => void, fail: (err: any) => void): void {
        var contract = new this.web3.eth.Contract(EthAtomicSwap.ContractABI, this.contractAddress);
        contract.methods.getRefundTime(this._hexString(hashedSecret)).call(function(err: any, result: string) {
            if(err)
                fail(err)
            else
                success(Number(result));
        });
    }

    getSecret(hashedSecret, success: (secret: string) => void, fail: (err: any) => void): void {
        var contract = new this.web3.eth.Contract(EthAtomicSwap.ContractABI, this.contractAddress);
        contract.methods.getSecret(this._hexString(hashedSecret)).call(function(err: any, result: string) {
            if(err)
                fail(err)
            else
                success(result.startsWith('0x') ? result.substr(2) : result);
        });
    }

    getInitiator(hashedSecret, success: (initiator: string) => void, fail: (err: any) => void): void {
        var contract = new this.web3.eth.Contract(EthAtomicSwap.ContractABI, this.contractAddress);
        contract.methods.getInitiator(this._hexString(hashedSecret)).call(function(err: any, result: string) {
            if(err)
                fail(err)
            else
                success(result);
        });
    }

    getParticipant(hashedSecret, success: (participant: string) => void, fail: (err: any) => void): void {
        var contract = new this.web3.eth.Contract(EthAtomicSwap.ContractABI, this.contractAddress);
        contract.methods.getParticipant(this._hexString(hashedSecret)).call(function(err: any, result: string) {
            if(err)
                fail(err)
            else
                success(result);
        });
    }

    getValue(hashedSecret, success: (value: BigNumber) => void, fail: (err: any) => void): void {
        var contract = new this.web3.eth.Contract(EthAtomicSwap.ContractABI, this.contractAddress);
        contract.methods.getValue(this._hexString(hashedSecret)).call(function(err: any, result: any) {
            if(err)
                fail(err)
            else
                success(new BigNumber(Web3.utils.fromWei(result, 'ether')));
        });
    }

    getEmptied(hashedSecret, success: (emptied: boolean) => void, fail: (err: any) => void): void {
        var contract = new this.web3.eth.Contract(EthAtomicSwap.ContractABI, this.contractAddress);
        contract.methods.getEmptied(this._hexString(hashedSecret)).call(function(err: any, result: boolean) {
            if(err)
                fail(err)
            else
                success(result);
        });
    }

    getState(hashedSecret, success: (state: number) => void, fail: (err: any) => void): void {
        var contract = new this.web3.eth.Contract(EthAtomicSwap.ContractABI, this.contractAddress);
        contract.methods.getState(this._hexString(hashedSecret)).call(function(err: any, result: string) {
            if(err)
                fail(err)
            else
                success(Number(result));
        });
    }
}
