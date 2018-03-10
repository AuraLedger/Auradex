import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FlexLayoutModule } from "@angular/flex-layout";

import { MatSidenavModule, MatToolbarModule, MatButtonModule, MatCheckboxModule } from '@angular/material';
import { MatListModule } from '@angular/material/list';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatChipsModule } from '@angular/material/chips';
import { MatCardModule } from '@angular/material/card';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTableModule } from '@angular/material/table';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialogModule } from '@angular/material/dialog';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBarModule } from "@angular/material";
import { MatSliderModule } from '@angular/material/slider';

import { LocalStorageModule } from 'angular-2-local-storage';
import * as hs from 'highcharts/highstock';
import { ChartModule }             from 'angular2-highcharts'; 

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { TradeComponent } from './trade/trade.component';
import { WalletComponent } from './wallet/wallet.component';
import { AddwalletComponent } from './addwallet/addwallet.component';
import { SendComponent } from './send/send.component';

import { CoinService } from './coin.service';
import { UserService } from './user.service';
import { WebsocketService } from './websocket.service';
import { NodeService } from './node.service';
import { CryptoService } from './crypto.service';

import { CoinTestPipe } from './coin-test.pipe';
import { FilterPipe } from './filter.pipe';
import { CoinFilterPipe } from './coin-filter.pipe';
import { CoinTestFilterPipe } from './coin-test-filter.pipe';
import { FocusDirective } from './focus.directive';
import { SettingsComponent } from './settings/settings.component';
import { ManageAccountComponent } from './manage-account/manage-account.component';
import { DeleteComponent } from './delete/delete.component';
import { PasswordComponent } from './password/password.component';
import { AreYouSureComponent } from './are-you-sure/are-you-sure.component';

declare var require: any

@NgModule({
    declarations: [
        AppComponent,
        TradeComponent,
        WalletComponent,
        AddwalletComponent,
        SendComponent,
        CoinTestPipe,
        FilterPipe,
        CoinFilterPipe,
        CoinTestFilterPipe,
        FocusDirective,
        SettingsComponent,
        ManageAccountComponent,
        DeleteComponent,
        PasswordComponent,
        AreYouSureComponent,
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
        MatSlideToggleModule,
        MatSliderModule, 
        MatTooltipModule,

        ChartModule.forRoot(require('highcharts/highstock')),

        LocalStorageModule.withConfig({
            prefix: 'auradex',
            storageType: 'localStorage'
        })
    ],
    providers: [ CoinService, UserService, WebsocketService, NodeService, CryptoService ],
    entryComponents: [ AddwalletComponent, SendComponent, DeleteComponent, PasswordComponent, AreYouSureComponent ],
    bootstrap: [ AppComponent ]
})
export class AppModule { }
