export class ArrayMap {
    array = [];
    map = {};

    constructor(protected keyProp: string | null, protected keyFunc?: (item: any) => string) {
        if(!this.keyFunc)
            this.keyFunc = (item) => item[this.keyProp];
    }

    static fromArray(arr: any[], keyProp: string | null, keyFunc?: (item: any) => string): ArrayMap {
        var result = new ArrayMap(keyProp, keyFunc);
        arr.forEach(a => result.add(a));
        return result;
    }

    static fromMap(mp: any, keyProp: string | null, keyFunc?: (item: any) => string): ArrayMap {
        var result = new ArrayMap(keyProp, keyFunc);
        Object.keys(mp).forEach(k => result.add(mp[k]));
        return result;
    }

    has(key: string): boolean {
        return this.map.hasOwnProperty(key);
    }

    add(item: any, overwrite?: boolean): boolean {
        var key = this.keyFunc(item);
        if(this.has(key)) {
            if(overwrite) {
                this.remove(key);
            } else {
                return false;
            }
        }
        this.array.push(item);
        this.map[key] = item;
        return true;
    }

    get(key: string) {
        return this.map[key];
    }

    remove(key: string, ensure?: boolean): any {
        var item = this.get(key);
        if(item) {
            delete this.map[key];
            for(var i = this.array.length - 1; i >= 0 ; i--)
            {
                if(this.keyFunc(this.array[i]) == key)
                {
                    this.array.splice(i, 1);
                    if(!ensure)
                        break;
                }
            }
            return item;
        }
        return null;
    }
}
