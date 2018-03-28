import { INode } from './INode';
import { EtherConfig } from './NodeConfig';
import { ListingMessage, OfferMessage, AcceptMessage, SwapInfo } from './AuradexApi';
import { DexUtils } from './DexUtils';
import { EthAtomicSwap } from './EthAtomicSwap';
import * as EthTx from'ethereumjs-tx';
import { Buffer } from 'buffer';
import { BigNumber } from 'bignumber.js';

declare var require: any
const Web3 = require('web3');

export class EtherNode implements INode {
    web3: any;
    gasGwei: BigNumber = new BigNumber(20);
    confirmTime: number = 60 * 3; // 3 minutes
    contractAddress: string;
    type: string;
    chainId: number;

    constructor(config: EtherConfig) {
        this.web3 = new Web3(new Web3.providers.HttpProvider(config.rpcUrl));
        this.contractAddress = config.contractAddress;
        this.type = config.type;
        this.chainId = config.chainId;
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
            this.confirmTime = settings.confirmTime;
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

    //TODO: find gasLimit for swap transacitons init
    getInitFee(): BigNumber {
        return this.fromGwei(this.gasGwei.times(200000));
    }

    //TODO: find gas limit for swap redeem
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
                        gasLimit: Web3.utils.toHex(options.gasLimit || 20000),
                        from: from,
                        to: to,
                        value: Web3.utils.toHex(Web3.utils.toWei(amount.toString(10), 'ether')),
                        data: null, //should be Buffer if needed 
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

    //TODO:these
    initSwap(listing: ListingMessage, offer: OfferMessage, accept: AcceptMessage, privateKey: string, success: (txId: string) => void, fail: (error: any) => void): void {
        var contract = new this.web3.eth.Contract(EthAtomicSwap.ContractABI, this.contractAddress, {
            from: listing.address,
            gasPrice: Web3.utils.toWei(this.gasGwei.toString(10), 'gwei')
        });

        var refundTime = DexUtils.UTCTimestamp() + 60 * 60 * 48; //add 48 hours
        var hashedSecret = this._hexString(accept.hashedSecret);

        var amount: BigNumber = new BigNumber(0);
        if(listing.act == 'bid') {
            amount = accept.amount.times(listing.price);
        } else {
            amount = accept.amount;
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
                    value: Web3.utils.toWei(amount.toString(10), 'ether'),
                    gas: gas,
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

    acceptSwap(listing: ListingMessage, offer: OfferMessage, accept: AcceptMessage, privateKey: string, success: (txId: string) => void, fail: (error: any) => void): void {
        var contract = new this.web3.eth.Contract(EthAtomicSwap.ContractABI, this.contractAddress, {
            from: offer.address,
            gasPrice: Web3.utils.toWei(this.gasGwei.toString(10), 'gwei')
        });

        //TODO: make sure there is atleast 30 hours remaining on the initiate swap
        var refundTime = Math.floor((new Date()).getTime() / 1000) + 60 * 60 * 24; //add 24 hours
        var hashedSecret = this._hexString(accept.hashedSecret);

        var participateMethod = contract.methods.participate(refundTime, hashedSecret, listing.redeemAddress);

        var amount = new BigNumber(0);
        if(listing.act == 'ask') {
            amount = accept.amount.times(listing.price);
        } else {
            amount = accept.amount;
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
                    gas: gas,
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

        //TODO: make sure there is atleast 30 hours remaining on the initiate swap
        var refundTime = Math.floor((new Date()).getTime() / 1000) + 60 * 60 * 24; //add 24 hours
        var _hashedSecret = this._hexString(hashedSecret);
        var _secret = this._hexString(secret);

        var redeemMethod = contract.methods.redeem(secret, hashedSecret);

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
                    gas: gas,
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

    private increaseHexByOne(hex) {
        let x = Web3.utils.toBN(hex);
        let sum = x.add(1);
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

    getSwapInfo(hashedSecret, success: (info: SwapInfo) => void, fail: (err: any) => void): void {
        var index = Web3.utils.padleft('0', 64);
        var key = Web3.utils.padleft(hashedSecret, 64);
        key =  this.web3.utils.sha3(key + index, {"encoding":"hex"});
        var that = this;
        this.web3.eth.getStorageAt(this.contractAddress, key, function(err, initTimestamp) {
            if(err) { fail(err); return; }
            key = that.increaseHexByOne(key);
            that.web3.eth.getStorageAt(that.contractAddress, key, function(err, refundTime) {
                if(err) { fail(err); return; }
                key = that.increaseHexByOne(key);
                that.web3.eth.getStorageAt(that.contractAddress, key, function(err, _hashedSecret) {
                    if(err) { fail(err); return; }
                    key = that.increaseHexByOne(key);
                    that.web3.eth.getStorageAt(that.contractAddress, key, function(err, secret) {
                        if(err) { fail(err); return; }
                        key = that.increaseHexByOne(key);
                        that.web3.eth.getStorageAt(that.contractAddress, key, function(err, initiator) {
                            if(err) { fail(err); return; }
                            key = that.increaseHexByOne(key);
                            that.web3.eth.getStorageAt(that.contractAddress, key, function(err, participant) {
                                if(err) { fail(err); return; }
                                key = that.increaseHexByOne(key);
                                that.web3.eth.getStorageAt(that.contractAddress, key, function(err, value) {
                                    if(err) { fail(err); return; }
                                    key = that.increaseHexByOne(key);
                                    that.web3.eth.getStorageAt(that.contractAddress, key, function(err, emptied) {
                                        if(err) { fail(err); return; }
                                        key = that.increaseHexByOne(key);
                                        that.web3.eth.getStorageAt(that.contractAddress, key, function(err, state) {
                                            if(err) { fail(err); return; }
                                            success({
                                                initTimestamp: initTimestamp,
                                                refundTime: refundTime,
                                                hashedSecret: _hashedSecret,
                                                secret: secret,
                                                initiator: initiator,
                                                participant: participant,
                                                value: Web3.utils.fromWei(value, 'ether'),
                                                emptied: emptied,
                                                state: state
                                            });
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    }
}
