import { ArrayMap } from './ArrayMap';

if (typeof localStorage === 'undefined' || localStorage === null) {
  var LocalStorage = require('node-localstorage').LocalStorage;
  localStorage = new LocalStorage('./AuradexLocalStorage');
}

/**
 * should only be used with unique listings/offers/accepts
 */
export class StoredArrayMap extends ArrayMap {

    add(item: any, overwrite?: boolean): boolean {
        if(super.add(item, overwrite)) {
            localStorage.setItem(this.keyFunc(item), JSON.stringify(item));
            return true;
        }
        return false;
    }

    remove(key: string, ensure?: boolean) {
        var item = super.remove(key, ensure);
        if(item)
            localStorage.removeItem(this.keyFunc(item));
    }
}
