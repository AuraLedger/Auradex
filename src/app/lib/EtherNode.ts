import { INode } from './INode';
import { EtherConfig } from './NodeConfig';

import Web3 from 'web3';

export class EtherNode implements INode {
    web3: any;

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

    //TODO: find gasLimit for swap transacitons init
    getFee(handler: (err: any, fee: number) => void): void {
        var gasLimit = 200000;
        var trans = [];
        var that = this;
        this.web3.eth.getBlockNumber(function(err, num) {
            if(err)
                handler(err, null);
            else {
                var getTrans = function() {
                    //recursevely get blocks until we have 30 transacitons
                    if(trans.length < 30) {
                        that.web3.eth.getBlock(num, function(errr, block) {
                            if (errr)
                                handler(errr, null);
                            else
                            {
                                trans.concat(block.transactions);
                                num++;
                                getTrans();
                            }
                        });
                    } else {
                        var gasPrice = trans.reduce((a,b) => { return a + b.gasPrice; }, 0) / trans.length;
                        handler(null, that.web3.utils.fromGwei(gasPrice * gasLimit, 'ether'));
                    }
                }
            }
        });
    }
}
