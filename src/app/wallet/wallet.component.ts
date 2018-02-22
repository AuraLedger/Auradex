import { Component, OnInit } from '@angular/core';
import { LocalStorageService } from 'angular-2-local-storage';

@Component({
  selector: 'app-wallet',
  templateUrl: './wallet.component.html',
  styleUrls: ['./wallet.component.scss']
})
export class WalletComponent implements OnInit {

  accountName;
  account;
  accounts;
  coins = [];

  constructor(private localStorageService: LocalStorageService) { 
    this.accounts = localStorageService.get('accounts') || []; 
    this.accountName = localStorageService.get('accountName');
    if(this.accounts.hasOwnProperty(this.accountName))
      this.account = this.accounts[this.accountName];
  }

  ngOnInit() {
  }

}
