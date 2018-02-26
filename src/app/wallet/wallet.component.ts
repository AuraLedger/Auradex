import { Component } from '@angular/core';
import { LocalStorageService } from 'angular-2-local-storage';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material';
import { AddwalletComponent } from '../addwallet/addwallet.component'
import { SendComponent } from '../send/send.component'

import * as Web3 from 'web3';

import { CoinService } from '../coin.service'
import { UserService } from '../user.service'

@Component({
  selector: 'app-wallet',
  templateUrl: './wallet.component.html',
  styleUrls: ['./wallet.component.scss'],
  entryComponents: [ AddwalletComponent ]
})
export class WalletComponent {

  account;
  accounts;
  coins;
  balances = {};
  web3s = {};

  constructor(
    private localStorageService: LocalStorageService, 
    public dialog: MatDialog, 
    public userService: UserService, 
    public coinService: CoinService) 
  { 
    this.coins = this.coinService.coins || [];
    this.setAccounts();

    this.userService.showError('test');
  }

  goTo(acc) {
    this.userService.selectAccount(acc.accountName);
    this.userService.save();
    this.setAccounts();
  }

  getClass(acc) {
    var cls = 'mat-elevation-z2 clickable';
    if(acc == this.account)
      cls = cls + ' selected';
    return cls;
  }

  setAccounts() {
    this.accounts = [];
    var keys = Object.keys(this.userService.accounts);
    for(var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var acc = this.userService.accounts[key];
      acc.accountName = key;
      this.accounts.push(acc);
    }
    this.account = this.userService.getAccount();
    this.balances = {};
    this.web3s = {};
    var that = this;
    for(var j = 0; j < this.coins.length; j++)
    {
      var coin = this.coins[j];
      (function(coin) {
        if(that.userService.getSettings().useTestCoins || !coin.test) {
          var w3 = new Web3(new Web3.providers.HttpProvider(coin.nodeUrl));
          that.web3s[coin.name] = w3;
          w3.eth.getBalance(that.account[coin.name].address, function (err, result) {
            if(err) {
              that.balances[coin.name] = "network error";
              that.userService.showError(err);
            }
            else
              that.balances[coin.name] = w3.fromWei(result, 'ether');
          });
        }
      })(coin);
    }
  }

  send(coin) {
    let dialogRef = this.dialog.open(SendComponent, {
      data: {
        coin: coin,
        account: this.account,
        w3: this.web3s[coin.name]
      }
    });

    var that = this;
    dialogRef.afterClosed().subscribe(result => {
      that.web3s[coin.name].eth.getBalance(that.account[coin.name].address, function(err, result){
        if(err) {
          that.balances[coin.name] = "network error";
          that.userService.showError(err);
        }
        else
          that.balances[coin.name] = that.web3s[coin.name].fromWei(result, 'ether');
      });
    });
  }

  openDialog(): void {
    let dialogRef = this.dialog.open(AddwalletComponent, {
      disableClose: true
    });

    dialogRef.afterClosed().subscribe(result => {
      this.setAccounts();
    });
  }

  newAccount(): void {
    this.openDialog();
  }
}
