import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { MatSidenavModule, MatToolbarModule, MatButtonModule, MatCheckboxModule } from '@angular/material';
import { MatListModule } from '@angular/material/list';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatChipsModule } from '@angular/material/chips';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialogModule } from '@angular/material/dialog';
import { MatSnackBarModule } from "@angular/material";

import { FlexLayoutModule } from "@angular/flex-layout";

import { LocalStorageModule } from 'angular-2-local-storage';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { TradeComponent } from './trade/trade.component';
import { WalletComponent } from './wallet/wallet.component';
import { AddwalletComponent } from './addwallet/addwallet.component';

import { CoinService } from './coin.service';
import { UserService } from './user.service';
import { CoinTestPipe } from './coin-test.pipe';
import { SendComponent } from './send/send.component';


@NgModule({
  declarations: [
    AppComponent,
    TradeComponent,
    WalletComponent,
    AddwalletComponent,
    CoinTestPipe,
    SendComponent
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    FormsModule,

    AppRoutingModule,
    FlexLayoutModule,

    MatButtonModule, 
    MatSidenavModule,
    MatToolbarModule,
    MatCheckboxModule,
    MatInputModule,
    MatIconModule,
    MatFormFieldModule,
    MatListModule,
    MatExpansionModule,
    MatCardModule,
    MatChipsModule, 
    MatTableModule,
    MatDividerModule, 
    MatProgressSpinnerModule,
    MatDialogModule,
    MatSnackBarModule,

    LocalStorageModule.withConfig({
      prefix: 'auradex',
      storageType: 'localStorage'
    })
  ],
  providers: [ CoinService, UserService ],
  entryComponents: [ AddwalletComponent  ],
  bootstrap: [ AppComponent ]
})
export class AppModule { }
