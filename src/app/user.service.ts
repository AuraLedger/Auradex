import { Injectable } from '@angular/core';
import { LocalStorageService } from 'angular-2-local-storage';
import { MatSnackBar } from '@angular/material';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material';
import * as CryptoJS from 'crypto-js';
import { CryptoService } from './crypto.service'
import { CoinService } from './coin.service'
import { CoreService } from './core.service'
import { PasswordComponent } from './password/password.component'
import { AreYouSureComponent } from './are-you-sure/are-you-sure.component';
import { BigNumber } from 'bignumber.js';

@Injectable()
export class UserService {

    private settings;
    private storage;

    accounts;
    activeAccount;
    transactions;
    passwordOpen: boolean;
    //trades;

    constructor(
        private localStorageService: LocalStorageService, 
        public snackBar: MatSnackBar,
        public dialog: MatDialog,
        private cryptoService: CryptoService,
        private coinService: CoinService,
        private coreService: CoreService
    ) { 
        this.storage = this.localStorageService;
        this.settings = this.storage.get('settings');
        if(!this.settings)
            this.setSettings({
                useTestCoins: true,
                gas: {},
                nodeUrl: {},
                marketUrl: {},
                customCoins: []
            });

        //backwards compatibility
        if(!this.settings.nodeUrl)
            this.settings.nodeUrl = {};

        if(!this.settings.marketUrl)
            this.settings.marketUrl = {};

        if(!this.settings.customCoins)
            this.settings.customCoins = [];

        this.setSettings(this.settings);

        this.accounts = this.storage.get('accounts') || {};
        this.activeAccount = this.storage.get('activeAccount') || '';
        this.transactions = this.storage.get('transactions ') || [];
        //this.trades = this.storage.get('trades') || {};

        for(var i = 0; i < this.settings.customCoins.length; i++)
            this.coinService.coins.push(this.settings.customCoins[i]);

        for(var i = 0; i < this.coinService.coins.length; i++) {
            var cname = this.coinService.coins[i].name;
            if(this.settings.nodeUrl[cname])
                this.coinService.coind[cname].setNodeUrl(this.settings.nodeUrl[cname]);
        }
    }

    public getBalance(coin: string, cb: (b: BigNumber) => void): void {
        var b = this.coinService.coind[coin].getBalance(this.activeAccount);
        var t = this.coinService.coind[coin].getBalanceTime(this.activeAccount);
        var n = new Date();
        if(!b && b !== 0)
            this._getBalance(coin, cb);
        else if ((<any>n - t) > 60000)
        {
            cb(b);
            this._getBalance(coin, cb);
        }
        else
            cb(b);
    }

    private _getBalance(coin: string, cb: (b: BigNumber) => void): void {
        var that = this;
        var node = this.coinService.coind[coin].node; 
        node.getBalance(this.getAccount()[coin].address, function (err, result) {
            if(err) {
                that.showError(err);
            } else {
                var bal = result;
                that.coinService.coind[coin].setBalance(bal);
                cb(bal);
            }
        });
    }

    public getAccount(name?: string) {
        name = name || this.activeAccount;
        return this.accounts[name];
    }

    public handleError(error: any) {
        console.error(error);
        var msg: string = "";
        if(typeof error === 'string')
            msg = error;
        else if (error)
        {
            if(error.msg)
                msg = error.msg;
            else if(error.message)
                msg = error.message;
            else if(error.name)
                msg = 'Error ' + error.name;
            else
                msg = error;
        }
        this.showError(msg);
    }

    public showError(message) {
        this.snackBar.open(message, 'Error', {
            duration: 3500,
            panelClass: 'error',
        });
    }

    public showSuccess(message) {
        this.snackBar.open(message, 'Success', {
            duration: 3500,
            panelClass: 'success',
        });
    }

    public addTransaction(tx) {
        this.transactions.push(tx);
        this.storage.set('transactions', this.transactions);
    }

    public selectAccount(name) {
        this.activeAccount = name;
    }

    public save() {
        this.storage.set('accounts', this.accounts);
        this.storage.set('activeAccount', this.activeAccount);
    }

    public setSettings(sets) {
        this.storage.set('settings', sets);
        this.settings = sets;
    }

    public getSettings() {
        return this.settings;
    }

    public getTradePrivateKey(coin, cb, trade?) {
        if (this.cryptoService.isUnlocked(this.activeAccount)) {
            var priv = this.cryptoService.getUnlockedPrivKey(this.getAccount(), coin);
            cb(priv);
        }
        else {
            this.getPrivateKey(coin, cb, trade);
        }

    }

    public areYouSure(title, msg, yes: () => void, no?: () => void) {
        title = title || "Are you sure?";
        let dialogRef = this.dialog.open(AreYouSureComponent, {
            data: {
                title: title,
                msg: msg
            }
        });

        dialogRef.afterClosed().subscribe(result => {
            if(result)
                yes();
            else if (no)
                no();
        });   
    }

    public getPrivateKey(coin: string, cb: (key: string) => void, trade?: any) {
        if (this.cryptoService.isUnlocked(this.activeAccount)) {
            var priv = this.cryptoService.getUnlockedPrivKey(this.getAccount(), coin);
            cb(priv);
        }
        else {
            if(this.passwordOpen) {
                cb(null);
                return;
            }
            this.passwordOpen = true;
            let dialogRef = this.dialog.open(PasswordComponent, {
                data: {
                    account: this.getAccount(),
                    coin: this.coinService.coind[coin],
                    trade: trade,
                    userService: this
                }
            });

            dialogRef.afterClosed().subscribe(result => {
                this.passwordOpen = false;
                cb(result);
            });
        }
    }

    public decryptPrivateKey(coin, pass) {
        var privkey;
        try {
            privkey = this.cryptoService.decryptPrivateKey(this.getAccount(), coin, pass);
        } catch(error) {
            if(error.message === 'Invalid password.') {
                this.showError("Invalid password.");
                return;
            }
            else
                this.showError(error.message);
            throw error;
        }

        return privkey;
    }
}
