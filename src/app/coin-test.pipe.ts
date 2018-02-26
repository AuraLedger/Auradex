import { Pipe, PipeTransform } from '@angular/core';
import { UserService } from './user.service';

@Pipe({
  name: 'coinTest',
  pure: false
})
export class CoinTestPipe implements PipeTransform {

  constructor(private userService: UserService) { }

  transform(value: any[], args?: any): any[] {
    if(this.userService.getSettings().useTestCoins)
      return value;
    else
      return value.filter(v => !v.test);
  }

}
