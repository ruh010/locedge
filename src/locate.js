const { loadData, extractSuffix, extractReg, execAll } = require('./utils');
const iata = require('../data/iata.json');
const dnsRules = require('../data/rules/dns.json');
const log = require('simple-node-logger').createSimpleLogger();
const h4 = require('../data/caida/ipv4-geo.json');
const h6 = require('../data/caida/ipv6-geo.json');

/**
 * Geolocating an IP address based on the given hints.
 * @param {Object} hints Hints for geolocating
 * @param {string|undefined} hints.host DNS hostname of an IP address
 * @param {string|undefined} hints.iata Extracted IATA code
 * @param {string|undefined} hints.code Extracted geocode
 * @param {string|undefined} hints.dir Directory of a geocode database
 * @param {Array|undefined} hints.route Path to an IP address
 * @param {number|undefined} hints.thld Threshold for maximum number of back tracing to find a location
 * @returns {Object}
 */
const locate = ({ host, iata, code, dir, route, thld = 2 }) => {
    return (
        (iata && locateByIATA(iata)) ||
        (code && locateByCode(code, dir)) ||
        (host && locateByHost(host, 2)) ||
        (host && locateByHost(host, 3)) ||
        (host && locateByHoiho(host, 2)) ||
        (host && locateByHoiho(host, 3)) ||
        (route && locateByRoute(route, thld))
    );
}

const locateByIATA = (code) => {
    try {
        const iataRes = iata[code.toUpperCase()];
        if (iataRes) {
            return iataRes.city;
        }
    } catch (e) { }
}

const locateByCode = (code, dir) => {
    try {
        code = code.toLowerCase();
        const dataset = dir && loadData(dir);
        const codeRes = code && (
            (dataset && dataset[code]) ||
            (code.length === 3 && locateByIATA(code))
        );
        !codeRes && code && log.debug(`Code: ${code} not supported.`);
        return codeRes;
    } catch (e) { }
}

const locateByHost = (host, suf) => {
    try {
        host = host.toLowerCase();
        const { reg, dir } = dnsRules[extractSuffix(host, suf)];
        const { iata, code } = extractReg(host, reg, 'i');
        return locate({ iata, code, dir });
    } catch (e) { }
}

const locateByHoiho = (host, suf) => {
    try {
        host = host.toLowerCase();
        const record = h4[extractSuffix(host, suf)] || h6[extractSuffix(host, suf)];
        for (const reg of record.regs) {
            const tokens = (new RegExp(reg, 'i')).exec(host);
            for (const token of tokens) {
                const tokenRes = token && record.hints[token.toLowerCase()];
                if (tokenRes) {
                    return tokenRes;
                }
            }
        }
    } catch (e) { }
}

const locateByRoute = (route, thld = 3) => {
    try {
        let count = 0, level = route.length - 1;
        while (count < thld && level >= 0) {
            for (const { location } of route[level].hops.slice().reverse()) {
                if (location && location.country && !location.source) {
                    return location;
                }
            }
            level -= 1;
            count += 1;
        }
    } catch (e) { }
}

module.exports = locate;