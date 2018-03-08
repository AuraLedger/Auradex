import { Injectable } from '@angular/core';
import { Coin, CoinConfig } from './coin';
import { Market, MarketConfig } from './market';
import { INode, NodeFactory, EtherConfig } from './lib/libauradex';
import * as Web3 from 'web3';



@Injectable()
export class CoinService {
    coind = {};
    marketd = {};

    constructor() {
        for(var i = 0; i < this.coins.length; i++){
            var coin = new Coin(this.coins[i]);
            this.coind[coin.name] = coin;
        }

        for(var i = 0; i < this.markets.length; i++) {
            var mConfig = this.markets[i];
            var mark = new Market(mConfig, this.coind[mConfig.coin], this.coind[mConfig.base]);
            if(this.marketd.hasOwnProperty(mark.id))
                throw "Multiple markets found with id " + mark.id;
            this.marketd[mark.id] = mark;
        }
    }

    markets: MarketConfig[] = [
        {
            coin: 'Aura',
            base: 'Ethereum',
            //webSocketServerURL: 'wss://ara-eth.auradex.net',
            webSocketServerURL: 'ws://localhost:8999',
        }
    ];

    coins: CoinConfig[] = [
        {
            name: 'Aura',
            test: false,
            unit: 'aura',
            ticker: 'ARA',
            hdPath: 312,
            node: <EtherConfig>{
              type: 'Ether',
              rpcUrl: 'https://pool.auraledger.com'
            },
            chainId: 312,
            website: 'https://auraledger.com',
            ANN: 'https://bitcointalk.org/index.php?topic=2818598',
            twitter: '',
            facebook: '',
            reddit: '',
            telegram: '',
            discord: '',
            slack: ''
        },
        {
            name: 'Ethereum',
            test: false,
            unit: 'ether',
            ticker: 'ETH',
            hdPath: 60,
            node: <EtherConfig>{
              type: 'Ether',
              rpcUrl: 'https://mainnet.infura.io/CQE6ZkyB1BOEZx4cOkAl'
            },
            chainId: 1,
            website: 'https://ethereum.org',
            ANN: '',
            twitter: '',
            facebook: '',
            reddit: '',
            telegram: '',
            discord: '',
            slack: ''
        },
        {
            name: 'Ropsten',
            test: true,
            unit: 'rop',
            ticker: 'ROP',
            hdPath: 2837466,
            node: <EtherConfig>{
              type: 'Ether',
              rpcUrl: 'https://ropsten.infura.io/CQE6ZkyB1BOEZx4cOkAl'
            },
            chainId: 3,
            website: 'https://ethereum.org',
            ANN: '', 
            twitter: '',
            facebook: '',
            reddit: '',
            telegram: '',
            discord: '', 
            slack: ''
        },
        {
            name: 'Rinkeby',
            test: true,
            unit: 'rnk',
            ticker: 'RNK',
            hdPath: 2837467,
            node: <EtherConfig>{
              type: 'Ether',
              rpcUrl: 'https://rinkeby.infura.io/CQE6ZkyB1BOEZx4cOkAl'
            },
            chainId: 4,
            website: 'https://ethereum.org',
            ANN: '', 
            twitter: '',
            facebook: '',
            reddit: '',
            telegram: '',
            discord: '', 
            slack: ''
        }
    ];
}
