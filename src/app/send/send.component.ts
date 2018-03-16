import { Component, Inject, EventEmitter} from '@angular/core';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material';
import { Buffer } from 'buffer';
import { BigNumber } from 'bignumber.js';

import { UserService } from '../user.service';


@Component({
    selector: 'app-send',
    templateUrl: './send.component.html',
    styleUrls: ['./send.component.scss']
})
export class SendComponent {

    dest: string;
    amount: number;
    gas: number;
    gasLimit = 200000;
    password: string;
    fee: number;
    hide: boolean = true;

    constructor(   
        public dialogRef: MatDialogRef<SendComponent >,
        @Inject(MAT_DIALOG_DATA) public data: any,
        public userService: UserService) 
    { 
        var sets = this.userService.getSettings();
        if(this.data.coin.node.type == 'Ether')
        {
            if(!sets.gas)
                sets.gas = {};
            if(!sets.gasLimit)
                sets.gasLimit = {};

            this.gas = sets.gas[this.data.coin.name] || 1;
            sets.gas[this.data.coin.name] = this.gas;

            this.gasLimit = sets.gasLimit[this.data.coin.name] || 200000;
            sets.gasLimit[this.data.coin.name] = this.gasLimit;
        }

        this.userService.setSettings(sets);
    }

    send() {
        var that = this;
        var pass = this.password;
        this.dest = this.dest.trim();
        this.password = '';
        var privkey = this.userService.decryptPrivateKey(this.data.coin.name, pass);
        var config: any = {};
        if(this.data.coin.node.type == 'Ether') {
            config.gasPrice = new BigNumber(this.gas);
            config.gasLimit = this.gasLimit;
        } else {
            config.fee = new BigNumber(this.fee);
        }
        this.data.coin.node.send(new BigNumber(this.amount), this.userService.getAccount()[this.data.coin.name].address, this.dest, privkey, config, (txId) => {
            that.userService.showSuccess("Transaction sent " + txId);

            if(that.data.coin.node.type == 'Ether')
            {
                var sts = that.userService.getSettings()
                sts.gas[that.data.coin.name] = that.gas;
                sts.gasLimit[that.data.coin.name] = that.gasLimit;
                that.userService.setSettings(sts);
            }

            var successTx = {
                coin: that.data.coin.name,
                from: that.data.account[that.data.coin.name].address,
                to: that.dest,
                amount: new BigNumber(that.amount),
                txHash: txId 
            };

            that.userService.addTransaction(successTx);
            that.dialogRef.close(successTx);
        }, (err) => {
            this.userService.handleError(err);
        });
    }
}
