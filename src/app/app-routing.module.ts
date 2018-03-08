import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { TradeComponent } from './trade/trade.component';
import { WalletComponent } from './wallet/wallet.component';
import { ManageAccountComponent } from './manage-account/manage-account.component';

const routes: Routes = [
  { path: '', redirectTo: 'trade/ARA-ETH', pathMatch: 'full' }, 
  { path: 'trade/:id', component: TradeComponent }, 
  { path: 'wallet', component: WalletComponent },
  { path: 'manage', component: ManageAccountComponent },
  { path: '**', redirectTo: 'trade/ARA-ETH', pathMatch: 'full' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
