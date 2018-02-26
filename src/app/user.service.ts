import { Injectable } from '@angular/core';
import { LocalStorageService } from 'angular-2-local-storage';
import { MatSnackBar } from '@angular/material';

@Injectable()
export class UserService {

  private settings;
  private storage;

  accounts;
  activeAccount;
  transactions;
  trades;

  constructor(private localStorageService: LocalStorageService, public snackBar: MatSnackBar) { 
    this.storage = this.localStorageService;
    this.settings = this.storage.get('settings');
    if(!this.settings)
      this.setSettings({
        useTestCoins: true,
        gas: {}
      });

    this.accounts = this.storage.get('accounts') || {};
    this.activeAccount = this.storage.get('activeAccount');
    this.transactions = this.storage.get('transactions ') || {};
    this.trades = this.storage.get('trades') || {};
  }

  public getAccount(name?: string) {
    name = name || this.activeAccount;
    return this.accounts[name];
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
}
