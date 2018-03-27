import { ArrayMap } from './ArrayMap';
declare var require: any
declare var global: any

if (typeof localStorage === 'undefined' || localStorage === null) {
    var LocalStorage = require('node-localstorage').LocalStorage;
    (<any>global).localStorage = new LocalStorage('./AuradexLocalStorage');
}

/**
 * should only be used with unique listings/offers/accepts
 */
export class StoredArrayMap extends ArrayMap {

    private marketId: string;

    constructor(marketId: string, keyProp: string, keyFunc?: (item: any) => string) {
        super(keyProp, keyFunc);
        this.marketId = marketId;
    }

    add(item: any, overwrite?: boolean): boolean {
        if(super.add(item, overwrite)) {
            localStorage.setItem(this.marketId + this.keyFunc(item), JSON.stringify(item));
            return true;
        }
        return false;
    }

    remove(key: string, ensure?: boolean) {
        var item = super.remove(key, ensure);
        if(item)
            localStorage.removeItem(this.marketId + this.keyFunc(item));
    }
}
