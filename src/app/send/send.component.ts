import { Component, Inject, EventEmitter} from '@angular/core';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material';
import { Buffer } from 'buffer';

import { UserService } from '../user.service';

import * as EthTx from'ethereumjs-tx';

@Component({
  selector: 'app-send',
  templateUrl: './send.component.html',
  styleUrls: ['./send.component.scss']
})
export class SendComponent {

  dest;
  amount;
  gas;
  gasLimit = 200000;
  password;
  nonce;
  hide = true;

  constructor(   
    public dialogRef: MatDialogRef<SendComponent >,
    @Inject(MAT_DIALOG_DATA) public data: any,
    public userService: UserService) 
  { 
    var sets = this.userService.getSettings();
    if(!sets.gas)
      sets.gas = {};
    if(!sets.gasLimit)
      sets.gasLimit = {};

    this.gas = sets.gas[this.data.coin.name] || 1;
    sets.gas[this.data.coin.name] = this.gas;

    this.gasLimit = sets.gasLimit[this.data.coin.name] || 200000;
    sets.gasLimit[this.data.coin.name] = this.gasLimit;

    this.userService.setSettings(sets);

      //TODO: make this generic, let node handle most of the funcionality
    var that = this;
    this.data.node.eth.getTransactionCount(this.data.account[this.data.coin.name].address, function(err, result) {
      if(err){
        that.userService.showError(err);
        console.error(err);
        that.dialogRef.close();
      }
      else
        that.nonce = result;
    });
  }

  send() {
    var pass = this.password;
    this.password = '';
    if(this.nonce || this.nonce === 0)
    {
      var w3 = this.data.w3;

      if(!w3.isAddress(this.dest)) {
        this.userService.showError("Invalid destination address " + this.dest);
        return;
      }

      var txConfig = {
        nonce: w3.toHex(this.nonce),
        gasPrice: w3.toHex(w3.toWei(this.gas, 'gwei')),
        gasLimit: w3.toHex(this.gasLimit),
        to: this.dest,
        value: w3.toHex(w3.toWei(this.amount, 'ether')),
        data: null, //should be Buffer if needed 
        chainId: this.data.coin.chainId
      }
      var privkey = this.userService.decryptPrivateKey(this.data.coin.name, pass);

      if (privkey.startsWith('0x'))
        privkey = privkey.substring(2);
      var privbuf = new Buffer(privkey, 'hex');
      privkey = '';

      var tx = new EthTx(txConfig);
      tx.sign(privbuf);
      var serializedTx = tx.serialize();
      var that = this;
      this.data.w3.eth.sendRawTransaction('0x' + serializedTx.toString('hex'), function(err, result) {
        if(err)
          that.userService.showError(err);
        else { 
          that.userService.showSuccess(result);
          var sts = that.userService.getSettings()
          sts.gas[that.data.coin.name] = that.gas;
          sts.gasLimit[that.data.coin.name] = that.gasLimit;
          that.userService.setSettings(sts);

          var successTx = {
            coin: that.data.coin.name,
            from: that.data.account[that.data.coin.name].address,
            to: that.dest,
            amount: that.amount,
            txHash: result
          };

          that.userService.addTransaction(successTx);
          that.dialogRef.close(successTx);
        }
      });

    } else {
      this.userService.showError("Unabled to get transaction nonce");
      that.dialogRef.close();
    }
  }
}
