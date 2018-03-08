import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'coinFilter',
  pure: false
})
export class CoinFilterPipe implements PipeTransform {

  transform(items: any[], searchString: any): any {
    if(!items) return [];
    if(!searchString) return items;

    searchString = searchString.toLower();

    items.filter( it => {
      return it.ticker.toLowerCase().includes(searchString) || it.name.toLowerCase().includes(searchString);
    });
  }

}
