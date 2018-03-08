import { Component, Inject } from '@angular/core';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material';

import { CoinService } from '../coin.service';
import { UserService } from '../user.service';

import * as CryptoJS from 'crypto-js';

@Component({
  selector: 'app-addwallet',
  templateUrl: './addwallet.component.html',
  styleUrls: ['./addwallet.component.scss'],
})

export class AddwalletComponent {

  seedWords = "";
  hide = true;
  pwd1;
  pwd2;
  agree1;
  agree2;
  bip39 = (<any>window).bip39js; 
  accountName = "Account 1";

  constructor(    
    public dialogRef: MatDialogRef<AddwalletComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    public coinService: CoinService,
    public userService: UserService
  ) { 
    this.generateSeedWords(); 
    var counter = 2;
    while(userService.accounts.hasOwnProperty(this.accountName)) {
      this.accountName = "Account " + counter;
      counter = counter + 1;
    }
  }

  public generateSeedWords() {
    this.seedWords = this.bip39.generateRandomPhrase();
    var errors = this.bip39.findPhraseErrors(this.seedWords);
    if(errors) {
      this.userService.showError(errors);
      this.dialogRef.close();
    }
  }

  invalidAccountName() {
    return this.userService.accounts.hasOwnProperty(this.accountName);
  }

  public create() {
    if(!this.agree1 || !this.agree2 || !this.pwd1 || this.pwd1.length == 0 || this.pwd1 !== this.pwd2 || this.invalidAccountName()) {
      return;
    }
    else {
      // create account
      var coins = this.coinService.coins;
      var account = {};
      var root = this.bip39.calcBip32RootKeyFromSeed(this.seedWords).toBase58();
      var encrootkey = CryptoJS.AES.encrypt(root, this.pwd1).toString();
      var sharootkey = CryptoJS.SHA256(root).toString();
      account['encrootkey'] = encrootkey;
      account['sharootkey'] = sharootkey;
      account['accountName'] = this.accountName;
      for(var i = 0; i < coins.length; i++)
      {
        var coin = coins[i];
        var activeNet = this.bip39.getNetworkDict()[coin.ticker + ' - ' + coin.name];
        activeNet.onSelect();
        this.bip39.setActiveNetwork(activeNet);
        var dPath = this.bip39.getBip44DerivationPath();
        var errors = this.bip39.findDerivationPathErrors(dPath);
        if(errors) {
          this.userService.showError(errors);
          this.dialogRef.close();
          return;
        }
        var ext = this.bip39.calcBip32ExtendedKey(dPath).toBase58();
        var data = this.bip39.deriveAddress(0);

        var encprivkey = CryptoJS.AES.encrypt(data.privkey, this.pwd1).toString();
        var encextkey = CryptoJS.AES.encrypt(ext, this.pwd1).toString();
        var shaprivkey = CryptoJS.SHA256(data.privkey).toString();
        var shaextkey = CryptoJS.SHA256(shaextkey).toString();

        account[coin.name] = {
          address: data.address,
          pubkey: data.pubkey,
          encprivkey: encprivkey,
          encextkey: encextkey,
          shaprivkey: shaprivkey,
          shaextkey: shaextkey,
        }
      }
      this.userService.accounts[this.accountName] = account;
      this.userService.selectAccount(this.accountName);
      this.userService.save();
      this.dialogRef.close(); 
    }
  }
}
