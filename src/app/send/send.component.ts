import { Component, Inject } from '@angular/core';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material';
import { Buffer } from 'buffer';

import { UserService } from '../user.service';

import * as CryptoJS from 'crypto-js';
import * as EthTx from'ethereumjs-tx'

@Component({
  selector: 'app-send',
  templateUrl: './send.component.html',
  styleUrls: ['./send.component.scss']
})
export class SendComponent {

  dest;
  amount;
  gas;
  gasLimit;
  password;
  nonce;

  constructor(   
    public dialogRef: MatDialogRef<SendComponent >,
    @Inject(MAT_DIALOG_DATA) public data: any,
    public userService: UserService) 
  { 
    var sets = this.userService.getSettings();
    if(!sets.gas)
      sets.gas = {};
    this.gas = sets.gas[this.data.coin.name] || 1;
    data.w3.eth.getTransactionCount(data.address, function(err, result) {
      if(err)
        this.userService.showError(err);
      else
        this.nonce = result;
    });
  }

  send() {
    if(this.nonce || this.nonce === 0)
    {
      var txConfig = {
        nonce: this.nonce,
        gasPrice: this.gas,
        gasLimit: this.gasLimit,
        to: this.dest,
        value: this.data.w3.fromEther(this.amount, 'wei'),
        data: '0x00'
      }

      var privkey = CryptoJS.AES.decrypt(this.data.encprivkey, this.password).toString(CryptoJS.enc.Utf8);
      var privbuf = new Buffer(privkey, 'hex');

      var tx = new EthTx(txConfig);
      tx.sign(privbuf);
      var serializedTx = tx.serialize();

      this.data.w3.eth.sendRawTransaction('0x' + serializedTx.toString('hex'), function(err, result) {
        if(err)
          this.userService.showError(err);
        else { 
          this.userService.showSuccess(result);
          this.userService.addTransaction({
            coin: this.data.coin.name,
            from: this.data.account[this.data.coin.name],
            to: this.dest,
            amount: this.amount,
            txHash: result
          });
        }
      });

    } else
      this.userService.showError("Unabled to get transaction nonce");
  }
}
