export class OneToMany {
    map: {}

    constructor() {}

    add(key, value): void {
        if(!this.map.hasOwnProperty(key))
            this.map[key] = [];
        this.map[key].push(value);
    }

    get(key): any[] {
        return this.map[key];
    }
}
