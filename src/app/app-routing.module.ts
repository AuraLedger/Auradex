import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { TradeComponent } from './trade/trade.component';
import { WalletComponent } from './wallet/wallet.component';

const routes: Routes = [
  {path: '', redirectTo: 'trade', pathMatch: 'full' }, 
  {path: 'trade', component: TradeComponent }, 
  {path: 'wallet', component: WalletComponent }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
