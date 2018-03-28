import { Component, Inject, EventEmitter } from '@angular/core';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material';
import { CryptoService } from '../crypto.service';

import * as CryptoJS from 'crypto-js';

@Component({
    selector: 'app-password',
    templateUrl: './password.component.html',
    styleUrls: ['./password.component.scss']
})
export class PasswordComponent {

    hide: boolean = true;
    unlock: boolean = false;
    password: string;

    constructor(
        public dialogRef: MatDialogRef<PasswordComponent >,
        @Inject(MAT_DIALOG_DATA) public data: any,
        private cryptoService: CryptoService
    ) { }


    ok() {
        //check password and return privatekey
        try {
            var privkey = this.cryptoService.decryptPrivateKey(this.data.account, this.data.coin.name, this.password, this.unlock);
            this.dialogRef.close(privkey);
        } catch(error) {
           this.data.userService.handleError(error); 
        }
    }
}
