const { openBuffer } = require('@maxmind/geoip2-node').Reader;
const { readFileSync, createWriteStream, fstat, existsSync } = require('fs');
const promisify = require('util').promisify;
const pipeline = require('stream').pipeline;
const fetch = require('node-fetch');
const path = require('path');
const databases = require('../package.json').databases;

/**
 * Class for IP-to-ASN and IP-to-Geolocation lookup.
 * The default database to use is MaxMind's [GeoLite2]{@link https://dev.maxmind.com/geoip/geolite2-free-geolocation-data}.
 */
class Query {
    constructor(consoleLog) {
        this.log = consoleLog;
        this.databases = databases;
        databases.forEach(({ path: rp, name }) => {
            const dbpath = path.join(__dirname, '..', rp);
            if (!existsSync(dbpath)) return;
            this[`${name}Reader`] = openBuffer(
                readFileSync(dbpath)
            );
        });
    }

    /**
     * Get IP information.
     * @param {string} ip
     * @param {string} category <code>ASN</code> for IP-to-ASN lookup, <code>Geo</code> for IP-to-Geolocation lookup.
     * @returns {Promise<Object>}
     */
    async get(ip, category) {
        switch (category) {
            case 'ASN': {
                try {
                    const {
                        autonomousSystemOrganization: org,
                        autonomousSystemNumber: asn
                    } = await this.asnReader.asn(ip);
                    return { organization: org ? org.toLowerCase() : undefined, asn };
                } catch (exc) {
                    this.log.debug(`$ Error when querying ASN for ${ip}:\n${exc}\n`);
                }
                break;
            }
            case 'Geo': {
                if (!this.cityReader) break;
                try {
                    const { city, country, continent, location } = await this.cityReader.city(ip);
                    return {
                        city: city ? city.names.en.toLowerCase() : undefined,
                        country: country ? country.isoCode : undefined,
                        continent: continent ? continent.code : undefined,
                        latitude: location ? location.latitude : undefined,
                        longitude: location ? location.longitude : undefined,
                        source: 'geolite2',
                    };
                } catch (exc) {
                    this.log.debug(`$ Error when querying Geolocation for ${ip}:\n${exc}\n`);
                }
                break;
            }
            default: {
                this.log.error(`$ Unsupported query ${category}.`);
            }
        }
        return {};
    }

    /**
     * Update all databases.
     * @returns {Promise}
     */
    async update() {
        return Promise.allSettled(this.databases.map(async (db) => {
            return this.updateDatabase(db);
        }));
    }

    async updateDatabase(db) {
        const fetchAbort = new AbortController();
        const fetchTimer = setTimeout(() => fetchAbort.abort(), 60000);
        const local = `${this.directory}/${db.path}`;
        this.log.error(`Updating ${db.name} database. Please wait up to 60 seconds.`);
        return fetch(db.url, { signal: fetchAbort.signal })
            .then(resp => {
                if (!resp.ok) throw new Error();
                const streamPipe = promisify(pipeline);
                return streamPipe(resp.body, createWriteStream(local));
            })
            .then(() => {
                this[`${db.name}Reader`] = openBuffer(readFileSync(local));
                this.log.info(`${db.name} updated successfully.`);
            })
            .catch(exc => {
                this.log.error(`$ ${db.name} update failed.`);
                if (exc.name == 'AbortError') {
                    this.log.info(`ERR_TIMED_OUT: ${db.url}\n`);
                }
                else {
                    this.log.info(exc);
                }
            })
            .finally(() => clearTimeout(fetchTimer));
    }
}

const create = (log) => {
    return new Query(log);
}

module.exports = { create, Query };