import { Injectable } from '@angular/core';
import * as CryptoJS from 'crypto-js';


@Injectable()
export class CryptoService {

    private passwords: string[] = [];
    private tradePasswords: string[] = [];

    constructor() { }

    public isUnlocked(accountName: string) {
        return this.passwords.hasOwnProperty(accountName);
    }

    public getUnlockedPrivKey(account, coin) {
        return this.decryptPrivateKey(account, coin, this.passwords[account.accountName]);
    }

    public getTradePrivateKey(account, coin) {
        return this.decryptPrivateKey(account, coin, this.tradePasswords[account.accountName]);
    }

    public isTradeUnlocked(coin) {
        return this.tradePasswords.hasOwnProperty(coin);
    }

    public lock(coin: string) {
        delete this.passwords[coin];
    }

    public decryptPrivateKey(account, coin: string, pass: string, unlock?: boolean) {
        var privkey;
        try {
            privkey = CryptoJS.AES.decrypt(account[coin].encprivkey, pass).toString(CryptoJS.enc.Utf8);
        } catch(error) {
            if(error.message === 'Malformed UTF-8 data')
                throw "Invalid password.";
            throw error;
        }

        if(CryptoJS.SHA256(privkey) != account[coin].shaprivkey)
            throw "Invalid password.";

        this.tradePasswords[account.accountName] = pass;
        if(unlock)
            this.passwords[account.accountName] = pass;

        return privkey;
    }
}
