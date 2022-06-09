class BaseModel {
    constructor(key) {
        this.key = key;
    }

    update(data = {}) {
        Object.entries(data).forEach(([prop, val]) => {
            if (!this.hasOwnProperty(prop)) {
                throw new TypeError(`${this.key} has no ${prop} property`);
            }
            else if (this[prop] instanceof Set) {
                val && this[prop].add(val);
            }
            else if (!this[prop]) {
                this[prop] = val;
            }
        });
    }

    get(prop) {
        if (!this.hasOwnProperty(prop)) {
            throw new TypeError(`${this.key} has no ${prop} property`);
        }
        return this[prop];
    }

    toJSON() {
        const result = {};
        Object.getOwnPropertyNames(this).forEach((name) => {
            result[name] = this[name] instanceof Set ? (
                this[name].size ? Array.from(this[name]) : undefined
            ) : (this[name] instanceof Array ? (
                this[name].length ? this[name] : undefined
            ) : (
                this[name] === null ? undefined : this[name]
            ));
        });
        return result;
    }
}

class Hostdata extends BaseModel {
    constructor(name) {
        super(name);
        this.ip = null;
        this.host = null;
        this.cname = null;
        this.asn = null;
        this.organization = null;
        this.cdn = null;
        this.route = null;
        this.provider = new Set();
        this.resources = new Array();
    }

    addResource(url) {
        const newResource = new Resourcedata(url);
        this.resources.push(newResource);
        return newResource;
    }
}

class Resourcedata extends BaseModel {
    constructor(url) {
        super(url);
        this.cacheControl = null;
        this.cacheStatus = new Set();
        this.location = new Set();
        this.pop = new Set();
        this.reserves = new Array();
    }

    located() {
        return this.location.size > 0;
    }

    addReserve(data) {
        if (!Object.keys(data).length) return;
        this.reserves.push(data);
        return data;
    }
}

module.exports = {
    Hostdata,
};