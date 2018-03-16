import { INode } from './INode';
import { EtherConfig } from './NodeConfig';
import { ListingMessage, OfferMessage, AcceptMessage, SwapInfo } from './AuradexApi';
import { DexUtils } from './DexUtils';
import { EthAtomicSwap } from './EthAtomicSwap';

declare var require: any
const Web3 = require('web3');

export class EtherNode implements INode {
    web3: any;
    gasGwei: number = 20;
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
            this.confirmTime = settings.confirmTime;
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
    initSwap(listing: ListingMessage, offer: OfferMessage, accept: AcceptMessage, privateKey: string, success: (txId: string) => void, fail: (error: any) => void): void {
        var contract = new this.web3.eth.Contract(EthAtomicSwap.ContractABI, this.contractAddress, {
            from: listing.address,
            gasPrice: Web3.utils.toWei(Web3.utils.toBN(this.gasGwei), 'gwei')
        });

        var refundTime = DexUtils.UTCTimestamp() + 60 * 60 * 48; //add 48 hours
        var hashedSecret = Web3.utils.hexToBytes(accept.hashedSecret);

        var amount = 0;
        if(listing.act == 'bid') {
            amount = accept.amount * listing.price;
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
                    to: that.contractAddress,
                    value: Web3.utils.toWei(Web3.toBN(amount), 'ether'),
                    gas: gas,
                    gasPrice: Web3.utils.toWei(Web3.utils.toBN(that.gasGwei), 'gwei'),
                    chainId: that.chainId, 
                    data: initiateMethod.encodeABI()
                }, privateKey, function (err, signedTx) {
                    if(err)
                        fail(err);
                    else {
                        that.web3.eth.sendSignedTransaction(signedTx, function(err, txId) {
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
            gasPrice: Web3.utils.toWei(Web3.utils.toBN(this.gasGwei), 'gwei')
        });

        //TODO: make sure there is atleast 30 hours remaining on the initiate swap
        var refundTime = Math.floor((new Date()).getTime() / 1000) + 60 * 60 * 24; //add 24 hours
        var hashedSecret = Web3.utils.hexToBytes(accept.hashedSecret);

        var participateMethod = contract.methods.participate(refundTime, hashedSecret, listing.redeemAddress);

        var amount = 0;
        if(listing.act == 'ask') {
            amount = accept.amount * listing.price;
        } else {
            amount = accept.amount;
        }

        var that = this;
        participateMethod.estimateGas({from: offer.address, gas: 300000}, function(err, gas) {
            if(err)
                fail(err);
            else {
                that.web3.eth.accounts.signTransaction( {
                    to: that.contractAddress,
                    value: Web3.utils.toWei(Web3.toBN(amount), 'ether'),
                    gas: gas,
                    gasPrice: Web3.utils.toWei(Web3.utils.toBN(that.gasGwei), 'gwei'),
                    chainId: that.chainId, 
                    data: participateMethod.encodeABI()
                }, privateKey, function (err, signedTx) {
                    if(err)
                        fail(err);
                    else {
                        that.web3.eth.sendSignedTransaction(signedTx, function(err, txId) {
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
            gasPrice: Web3.utils.toWei(Web3.utils.toBN(this.gasGwei), 'gwei')
        });

        //TODO: make sure there is atleast 30 hours remaining on the initiate swap
        var refundTime = Math.floor((new Date()).getTime() / 1000) + 60 * 60 * 24; //add 24 hours
        var _hashedSecret = Web3.utils.hexToBytes(hashedSecret);
        var _secret = Web3.utils.hexToBytes(secret);

        var redeemMethod = contract.methods.redeem(secret, hashedSecret);

        var amount = 0;
        var that = this;
        redeemMethod.estimateGas({from: address, gas: 300000}, function(err, gas) {
            if(err)
                fail(err);
            else {
                that.web3.eth.accounts.signTransaction( {
                    to: that.contractAddress,
                    value: Web3.toBN(0),
                    gas: gas,
                    gasPrice: Web3.utils.toWei(Web3.utils.toBN(that.gasGwei), 'gwei'),
                    chainId: that.chainId, 
                    data: redeemMethod.encodeABI()
                }, privateKey, function (err, signedTx) {
                    if(err)
                        fail(err);
                    else {
                        that.web3.eth.sendSignedTransaction(signedTx, function(err, txId) {
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

    getSwapInfo(hashedSecret, success: (info: SwapInfo) => void, fail: (err: any) => void): void {
        var index = Web3.utils.padleft('0', 64);
        var key = Web3.utils.padleft(hashedSecret, 64);
        key =  this.web3.utils.sha3(key + index, {"encoding":"hex"});
        var that = this;
        this.web3.eth.getStorageAt(this.contractAddress, key, function(err, initTimestamp) {
            if(err) { fail(err); return; }
            var key = that.increaseHexByOne(key);
            this.web3.eth.getStorageAt(this.contractAddress, key, function(err, refundTime) {
                if(err) { fail(err); return; }
                var key = that.increaseHexByOne(key);
                this.web3.eth.getStorageAt(this.contractAddress, key, function(err, _hashedSecret) {
                    if(err) { fail(err); return; }
                    var key = that.increaseHexByOne(key);
                    this.web3.eth.getStorageAt(this.contractAddress, key, function(err, secret) {
                        if(err) { fail(err); return; }
                        var key = that.increaseHexByOne(key);
                        this.web3.eth.getStorageAt(this.contractAddress, key, function(err, initiator) {
                            if(err) { fail(err); return; }
                            var key = that.increaseHexByOne(key);
                            this.web3.eth.getStorageAt(this.contractAddress, key, function(err, participant) {
                                if(err) { fail(err); return; }
                                var key = that.increaseHexByOne(key);
                                this.web3.eth.getStorageAt(this.contractAddress, key, function(err, value) {
                                    if(err) { fail(err); return; }
                                    var key = that.increaseHexByOne(key);
                                    this.web3.eth.getStorageAt(this.contractAddress, key, function(err, emptied) {
                                        if(err) { fail(err); return; }
                                        var key = that.increaseHexByOne(key);
                                        this.web3.eth.getStorageAt(this.contractAddress, key, function(err, state) {
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
