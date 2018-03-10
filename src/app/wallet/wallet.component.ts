import { Component } from '@angular/core';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material';
import { AddwalletComponent } from '../addwallet/addwallet.component'
import { SendComponent } from '../send/send.component'

import { CoinService } from '../coin.service'
import { UserService } from '../user.service'

@Component({
  selector: 'app-wallet',
  templateUrl: './wallet.component.html',
  styleUrls: ['./wallet.component.scss'],
})
export class WalletComponent {

  account;
  accounts;
  coins;
  balances = {};

  constructor(
    public dialog: MatDialog, 
    public userService: UserService, 
    public coinService: CoinService) 
  { 
    this.coins = this.coinService.coins || [];
    this.setAccounts();
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
    var that = this;

    if(this.account && this.account.accountName) {
      for(var j = 0; j < this.coins.length; j++) {
        var coin = this.coins[j];
        (function(coin) {
            if(that.userService.getSettings().useTestCoins || !coin.test) {
                that.userService.getBalance(coin.name, function(b) {
                    that.balances[coin.name] = b;
                });
            }
        })(coin);
      }
    }
  }

  send(coin) {
    let dialogRef = this.dialog.open(SendComponent, {
      data: {
        coin: coin,
        account: this.account,
        node: this.coinService.coind[coin.name].node,
        balance: this.balances[coin.name]
      },
      width: "600px"
    });

    var that = this;
    dialogRef.afterClosed().subscribe(result => {
      that.balances[coin.name] = that.balances[coin.name] - result.amount;
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
