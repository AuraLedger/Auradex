import { INode, NodeFactory, NodeConfig } from './lib/libauradex';

export class Coin {
    name: string;
    ticker: string;
    test: boolean;
    balances: any = {};
    balanceTimes: any = {};
    node: INode;
    blockHeight: number;

    constructor(readonly config: CoinConfig) { 
        this.name = config.name;
        this.ticker = config.ticker ;
        this.test = config.test;
        this.node = NodeFactory.Create(config.node); 
        this.blockHeight = Number(localStorage.getItem(this.name + 'blockHeight') || 1);
    }

    setBlockHeight(num: number): void {
        this.blockHeight = num;
        localStorage.setItem(this.name + 'blockHeight', ''+num);
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
    website: string;
    ANN: string;
    twitter: string;
    facebook: string;
    reddit: string;
    telegram: string;
    discord: string;
    slack: string;
}
