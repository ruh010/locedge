const { resolve, reverse } = require('./resolver');
const { Hostdata } = require('./ResultModel');
const CNAMERules = require('../data/rules/cname.json');
const ASNRules = require('../data/rules/asn.json');
const HTTPRules = require('../data/rules/http.json');
const DNSRules = require('../data/rules/dns.json');
const { extractSuffix, logError, execAll, extractReg, retrieve } = require('./utils');
const locate = require('./locate');

class Parser {
    constructor(database, tracer, logger) {
        this.database = database;
        this.tracer = tracer;
        this.log = logger;
    }

    async run(har, reserves) {
        const { log: { entries } } = har;
        const result = {};
        const destinations = this.tracer && new Set();

        for (const entry of entries) {
            await this.gather(entry, result, reserves);
            this.tracer && destinations.add(entry.serverIPAddress);
        }
        const traceroute = this.tracer && await this.tracer.parse(Array.from(destinations));

        await Promise.all(Object.values(result).map(async (hostdata) => {
            const ip = hostdata.get('ip');
            const resources = hostdata.get('resources');
            const route = retrieve(traceroute, ip);
            const { location, pop } = await this.inferFromHost(ip, hostdata);
            const { city, source } = (route && locate({
                route: route.networkPath
            })) || await this.database.get(ip, 'Geo') || {};

            return Promise.all(Object.values(resources).map(async (resourcedata) => {
                resourcedata.update({ location, pop });
                if (
                    (source !== 'geolite2' && city) ||
                    !resourcedata.located()
                ) resourcedata.update({ location: city });
            }));
        }));

        return result;
    }

    async gather(entry, result, {
        fields = [],
        responseFields = [],
        responseHeaders = []
    } = {}) {
        const {
            request: { url },
            response,
            serverIPAddress
        } = entry;
        if (response.redirectURL != "") return;
        const { hostname } = new URL(url);

        return this.gatherHost(
            result, hostname, serverIPAddress
        ).then((hostdata) => {
            hostdata.update({ ip: serverIPAddress });
            return this.gatherResource(
                result, hostname, url, response.headers, responseHeaders
            );
        }).then((resourcedata) => {
            fields.forEach((ety) => resourcedata.addReserve({
                name: ety, value: entry[ety], aggr: false,
            }));
            responseFields.forEach((ety) => resourcedata.addReserve({
                name: ety, value: response[ety], aggr: false,
            }));
        }).catch((exc) => logError({
            log: this.log, func: this.gather, exc
        }));
    }

    async gatherHost(result, host, ip) {
        if (host in result) return result[host];
        const hostdata = new Hostdata(host);

        await this.inferFromCNAME(hostdata, host).then(() => (
            this.inferFromAS(hostdata, ip)
        )).catch((exc) => logError({
            log: this.log, func: this.gatherHost, exc
        })).finally(() => {
            result[host] = hostdata;
        });

        return hostdata;
    }

    async inferFromHost(ip, hostdata) {
        if (!ip) return {};
        return reverse(ip, this.log).then(({ value }) => {
            const { cdn, provider, reg } = retrieve(DNSRules, extractSuffix(value, 2));
            const { iata, pop } = extractReg(value, reg, 'i');
            const location = value && locate({ host: value, iata });
            hostdata.update({ provider, cdn, host: value });
            return { location, pop: pop || iata };
        }).catch((exc) => logError({
            log: this.log, func: this.inferFromHost, exc
        }));
    }

    async inferFromCNAME(hostdata, domain) {
        return resolve(domain, this.log).then((chain) => {
            if (!chain) return;
            hostdata.update({ cname: chain });
            chain.forEach(({ value }) => (
                value && hostdata.update(CNAMERules[value])
            ));
        }).catch((exc) => logError({
            log: this.log, func: this.inferFromCNAME, exc
        }));
    }

    async inferFromAS(hostdata, ip) {
        return this.database.get(ip, 'ASN').then((result) => {
            if (!result) return;
            hostdata.update(result);
            result.asn && hostdata.update(ASNRules[result.asn]);
        }).catch((exc) => logError({
            log: this.log, func: this.inferFromAS, exc
        }));
    }

    async gatherResource(result, host, url, headers, reserveHeaders) {
        const hostdata = result[host];
        const resourcedata = hostdata.addResource(url);
        for (const { name, value } of headers) {
            const key = name.toLowerCase();
            if (reserveHeaders.includes(key)) resourcedata.addReserve({ name, value, aggr: true });
            try {
                const { geo, cache, feature } = retrieve(HTTPRules, key);

                geo && this.applyRule(value, geo, hostdata, (
                    { pop, iata, code }, { dir }
                ) => {
                    const location = locate({ iata, code, dir });
                    resourcedata.update({ location, pop: pop || code });
                });

                cache && this.applyRule(value, cache, hostdata, (
                    { cache, hit, miss, expired }
                ) => {
                    if (cache) {
                        resourcedata.update({ cacheStatus: cache });
                        return;
                    }
                    const curCacheStatus = resourcedata.get('cacheStatus');
                    let cacheStatus;
                    if (curCacheStatus === 'HIT') return;
                    else if (hit) cacheStatus = 'HIT';
                    else if (expired) cacheStatus = 'EXPIRED';
                    else if (miss && curCacheStatus !== 'EXPIRED') {
                        cacheStatus = 'MISS';
                    }
                    resourcedata.update({ cacheStatus });
                });

                feature && this.applyRule(value, feature, hostdata, (
                    { provider }
                ) => {
                    hostdata.update({ provider });
                });

                key === 'cache-control' && resourcedata.update({
                    cacheControl: value
                });
            } catch (exc) {
                logError({ log: this.log, func: this.gatherResource, exc });
            }
        }
        return resourcedata;
    };

    applyRule(value, rules, hostdata, callback) {
        for (const { reg, cdn, provider, ...rest } of rules) {
            try {
                if (reg && !(new RegExp(reg, 'i')).test(value)) return;
                hostdata.update({ cdn, provider });
                if (!reg) return;
                const matches = execAll(value, reg);
                for (const data of matches) {
                    callback(data, rest);
                }
            } catch (exc) {
                logError({ log: this.log, func: this.applyRule, exc });
            }
        }
    }
}

module.exports = {
    Parser, create: (database, tracer, logger) => {
        return new Parser(database, tracer, logger);
    }
}
