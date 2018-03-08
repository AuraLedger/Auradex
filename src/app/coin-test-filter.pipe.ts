import { Pipe, PipeTransform } from '@angular/core';
import { UserService } from './user.service';

@Pipe({
  name: 'coinTestFilter',
  pure: false
})
export class CoinTestFilterPipe implements PipeTransform {

  constructor(private userService: UserService) { }

  transform(coins: any[], searchString?: string): any[] {
    if(!coins) return [];
    var test = this.userService.getSettings().useTestCoins;

    if(!searchString) {
      if(test)
        return coins;
      else
        return coins.filter(c => { return (!c.test); });
    }

    function filterFunc(coin) {
      var ctl = coin.ticker.toLowerCase();
      var ct = ctl.includes(searchString);
      var cnl = coin.name.toLowerCase();
      var cn = cnl.includes(searchString);
      var a = (ct || cn);
      var b = (!coin.test || test);
      var r = a && b;
      return r;
    }

    searchString = searchString.toLowerCase();
    return coins.filter(filterFunc);
  }
}
