import { Injectable } from '@angular/core';

@Injectable()
export class CoinService {
  coind = {};

  constructor() {
    for(var i = 0; i < this.coins.length; i++)
      this.coind[this.coins[i].name] = this.coins[i];
  }

  pairs = [
    ['Aura', 'Ethereum'],
    ['Ropsten', 'Rinkeby'],
  ];

  coins = [
    {
      name: 'Aura',
      test: false,
      unit: 'aura',
      ticker: 'ARA',
      hdPath: 312,
      nodeUrl: 'https://pool.auraledger.com',
      chainType: 'Ethereum',
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
      nodeUrl: 'https://mainnet.infura.io/CQE6ZkyB1BOEZx4cOkAl',
      chainType: 'Ethereum',
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
      nodeUrl: 'https://ropsten.infura.io/CQE6ZkyB1BOEZx4cOkAl',
      chainType: 'Ethereum',
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
      nodeUrl: 'https://rinkeby.infura.io/CQE6ZkyB1BOEZx4cOkAl',
      chainType: 'Ethereum',
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
