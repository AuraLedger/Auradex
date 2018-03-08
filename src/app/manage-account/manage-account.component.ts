import { Component } from '@angular/core';
import { UserService } from '../user.service';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material';
import { AddwalletComponent } from '../addwallet/addwallet.component';
import { DeleteComponent } from '../delete/delete.component';

@Component({
  selector: 'app-manage-account',
  templateUrl: './manage-account.component.html',
  styleUrls: ['./manage-account.component.scss']
})
export class ManageAccountComponent {
  public testCoins: boolean;

  account;
  accounts;

  constructor(
    public dialog: MatDialog,
    public userService: UserService
  ) {
    this.testCoins = userService.getSettings().useTestCoins;
    this.setAccounts();
  }

  goTo(acc) {
    this.userService.selectAccount(acc.accountName);
    this.userService.save();
    this.account = acc;
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
  }

  saveTest() {
    var sets = this.userService.getSettings()
    sets.useTestCoins = this.testCoins;
    this.userService.setSettings(sets);
  }

  deleteAccount() {
    let dialogRef = this.dialog.open(DeleteComponent, {
      data: this.account 
    });

    dialogRef.afterClosed().subscribe(result => {
      this.setAccounts();
    });
  }

  unlock() {

  }

  recover() {

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
