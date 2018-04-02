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

        //restore market orders
    }

    markets: MarketConfig[] = [
        /*{
            coin: 'Aura',
            base: 'Ethereum',
            //webSocketServerURL: 'wss://ara-eth.auradex.net',
            webSocketServerURL: 'ws://localhost:8999',
        },*/
        {
            coin: 'Ropsten',
            base: 'Rinkeby',
            webSocketServerURL: 'wss://rop-rnk.auradex.net',
            //webSocketServerURL: 'ws://localhost:8998',
        },
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
                chainId: 312,
                rpcUrl: 'https://pool.auraledger.com'
            },
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
                chainId: 1,
                rpcUrl: 'https://mainnet.infura.io/CQE6ZkyB1BOEZx4cOkAl'
            },
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
                chainId: 3,
                rpcUrl: 'https://ropsten.infura.io/CQE6ZkyB1BOEZx4cOkAl',
                contractAddress: '0x5bF0591D2fC2C694700203157dBb77e5b3738bCC',
                confirmTime: 1, // 1 second
            },
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
                chainId: 4,
                rpcUrl: 'https://rinkeby.infura.io/CQE6ZkyB1BOEZx4cOkAl',
                contractAddress: '0xf9D150355c4967aec3EaE3469aFc17bb327D1a2b',
                confirmTime: 1, // 1 second
            },
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
