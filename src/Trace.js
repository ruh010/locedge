const spawn = require('child_process').spawn;
const locate = require('./locate');
const { reverse } = require('./resolver');
const readline = require('readline');

class Traceroute {
    constructor(logger, { maxTTL = 36, protocol = 'ICMP' } = {}) {
        this.maxTTL = maxTTL;
        this.protocol = protocol;
        this.log = logger;
    }

    cancel() {
        this.trprocess.removeAllListeners('close');
        this.trprocess.kill();
    }

    async trace(ip) {
        this.log.info(`Tracing to ${ip} using ${this.protocol}.`);
        const hops = [];
        const args = ['-q', 1, '-m', this.maxTTL, '-n'];
        switch (this.protocol.toUpperCase()) {
            case 'ICMP': {
                args.push('-I');
                break;
            }
            case 'TCP': {
                args.push('-T');
                break;
            }
        }
        return new Promise((resolve, _) => {
            this.trprocess = spawn('traceroute', [...args, ip]);
            this.trprocess.on('close', (code) => {
                code && this.log.info(`Traceroute return non-zero code: ${code}.`);
                (!code) && this.log.info(`${ip} done.`);
                resolve(hops);
            });
            readline.createInterface({
                input: this.trprocess.stdout,
                terminal: false
            }).on('line', (line) => {
                if (!line.trim().match(/^[0-9]+.*$/)) {
                    return;
                }
                const hop = this.parseHop(line);
                hop && hops.push(hop);
            });
        }).catch((exc) => {
            this.log.error(`${exc} error when tracing path to ${ip}.`);
            return hops;
        });
    }

    parseHop(hopData) {
        const regex = /^\s*(\d+)\s+(?:([a-zA-Z0-9:.]+)\s+([0-9.]+\s+ms)|(\*))/;
        const parsedData = new RegExp(regex, 'i').exec(hopData);
        let result = null;
        if (parsedData !== null) {
            if (parsedData[4] === undefined) {
                result = {
                    hop: parseInt(parsedData[1], 10),
                    ip: parsedData[2],
                    rtt1: parsedData[3]
                };
            }
            else {
                result = {
                    hop: parseInt(parsedData[1], 10),
                    ip: parsedData[4],
                    rtt1: parsedData[4]
                };
            }
        }
        return result;
    }
}

class Route {
    constructor(database, logger, { maxTTL, protocol, timeout = 60000 } = {}) {
        this.database = database;
        this.traceOptions = { maxTTL, protocol };
        this.timeout = timeout;
        this.log = logger;
    }

    async gather(destinations) {
        return Promise.all(destinations.map(async (dest) => {
            let timer;
            const tracer = new Traceroute(this.log, this.traceOptions);
            const hops = await Promise.race([
                tracer.trace(dest).then((data) => {
                    clearTimeout(timer);
                    return data.filter((hop) => hop.ip !== '*');
                }),
                new Promise((resolve, _) => {
                    timer = setTimeout(() => {
                        tracer.cancel();
                        resolve([]);
                    }, this.timeout);
                })
            ]);
            return hops;
        }));
    }

    async aggregate(destinations) {
        const routes = await this.gather(destinations);
        await Promise.all(routes.map(async (route, idx) => {
            const parsedRoutes = await Promise.all(route.map(async ({ ip, rtt1: rtt }) => {
                let [{ value: host }, { asn, organization }] = await Promise.all([
                    reverse(ip, this.log),
                    this.database.get(ip, 'ASN')
                ]);
                if (!asn) {
                    return {};
                }
                return { asn, organization, ip, host, rtt, location: locate({ host }) };
            })).then((parsedRoutes) => {
                const aggr = [];
                parsedRoutes.forEach(({ asn, organization, ip, host, rtt, location: { country, city, source } = {} }) => {
                    if (!asn) {
                        return;
                    }
                    if (!aggr.length || aggr[aggr.length - 1].asn !== asn) {
                        aggr.push({ asn, organization, hops: [] });
                    }
                    aggr[aggr.length - 1].hops.push({ ip, host, location: { country, city, source }, rtt });
                });
                return aggr;
            });
            routes[idx] = parsedRoutes;
        }));
        return routes;
    }

    async parse(destinations) {
        const aggregatedData = await this.aggregate(destinations);
        const parsedData = {};
        aggregatedData.forEach((aggregate, idx) => {
            if (!aggregate) {
                return;
            }
            const dest = destinations[idx];
            parsedData[dest] = { networkPath: aggregate };
            const route = [];
            aggregate.forEach((aggr) => {
                for (const { location: { country, continent } } of aggr.hops) {
                    if (!route.length || (country && route[route.length - 1][0] !== country)) {
                        route.push([country, continent]);
                    }
                }
            });
        });
        return parsedData;
    }
}

module.exports = {
    Route, create: (database, logger, options) => {
        return new Route(database, logger, options);
    }
}
