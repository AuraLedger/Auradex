import { INode, NodeFactory, NodeConfig } from './lib/libauradex';

export class Coin {
    name: string;
    ticker: string;
    test: boolean;
    balances: any = {};
    balanceTimes: any = {};
    nonces: any = {};
    fee: number;
    node: INode;

    constructor(readonly config: CoinConfig) { 
        this.name = config.name;
        this.ticker = config.ticker ;
        this.test = config.test;
        this.fee = Number(window.localStorage.getItem(config.name + 'fee'));
        this.node = NodeFactory.Create(config.node); 

        var that = this;
        this.node.getFee(function (err, fee) {
            if(err)
                throw err;
            else {
                that.fee = fee;
                window.localStorage.setItem(that.name + 'fee', fee+'');
            }
        });
    }

    setBalance(accountName: string, balance: number) {
        this.balances[accountName] = balance;
        this.balanceTimes[accountName] = new Date();
    }

    getBalance(accountName: string): number {
        return this.balances[accountName];
    }

    getBalanceTime(accountName: string): Date {
        return this.balanceTimes[accountName];
    }

    setNonce(accountName: string, nonce: number) {
        this.nonces[accountName] = nonce; 
    }

    nextNonce(accountName: string) {
        this.nonces[accountName] = this.nonces[accountName] + 1;
        return this.nonces[accountName];
    }

    setNodeUrl(url: string) {
        this.node.applyUserSettings({rpcUrl: url});
    }
}

export class CoinConfig {
    name: string;
    test: boolean;
    unit: string;
    ticker: string;
    hdPath: number;
    node: NodeConfig;
    chainId: number;
    website: string;
    ANN: string;
    twitter: string;
    facebook: string;
    reddit: string;
    telegram: string;
    discord: string;
    slack: string;
}
