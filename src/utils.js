const path = require('path');
const fs = require('fs');

const extractSuffix = (hostname, suflen) => {
    try {
        return hostname.split('.').slice(-suflen).join('.');
    } catch (_) {
        return hostname;
    }
}

const extractReg = (raw, reg, flags) => {
    if (!raw || !reg) return {};
    try {
        const regex = new RegExp(reg, flags);
        return regex.exec(raw).groups || {};
    } catch (_) {
        return {};
    }
}

const loadData = (dir) => {
    try {
        return dir && JSON.parse(
            fs.readFileSync(path.join(__dirname, '..', dir), 'utf-8')
        );
    } catch (e) { }
}

function* execAll(str, reg) {
    try {
        const regExp = new RegExp(reg, 'ig');
        let match;
        while (match = regExp.exec(str)) {
            yield match.groups || {};
        }
    } catch (exc) {
        return {};
    }
}

const reverseIPv4 = (ip) => {
    return [...ip.split('.').reverse(), 'in-addr.arpa'].join('.');
}

const reverseIPv6 = (ip) => {
    const fields = ip.split(':');
    const filler = '0000'.repeat(8 - fields.length);
    return Array.from(fields.map((fld) => {
        return '0'.repeat(4 - fld.length) + fld + (fld.length ? '' : filler);
    }).join('')).reverse().join('.') + '.ip6.arpa';
}

const logError = ({ log, func, exc, ret, level = 'warn' } = {}) => {
    log[level](`${func.name}: ${exc}`);
    return ret;
}

const retrieve = (source, key) => {
    try {
        if (!key || !source) return {};
        return source[key] || {};
    } catch (_) {
        return {};
    }
}

module.exports = {
    extractSuffix,
    extractReg,
    loadData,
    execAll,
    logError,
    reverseIPv4,
    reverseIPv6,
    retrieve,
}