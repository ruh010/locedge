const dig = require('node-dig-dns');
const { reverseIPv4, reverseIPv6 } = require('./utils');

/**
 * Resolve a given domain and follow the CNAME chain
 * @param {string} address Domain to dig
 * @param {Object} log Logger
 * @returns {Promise<Array>}
 */
const resolve = async (address, log) => {
    log.info(`Digging ${address}`);
    return dig([address]).then(async ({ answer }) => {
        return answer && Promise.all(answer.map(async ({ domain, type, value }) => {
            domain = stem(domain);
            value = stem(value);
            type = stem(type);
            if (type === 'CNAME') {
                return { domain, value };
            }
        })).then((result) => {
            return result.filter((res) => res);
        }).catch((exc) => {
            log.warn(`resolver.js - Error when looping through \`dig\` answers: ${exc}`);
            return [];
        });
    }).catch((exc) => {
        log.warn(`resolver.js - Error when digging ${address}: ${exc}`);
        return [];
    });
}

/**
 * Perform DNS reverse lookup.
 * @param {string} ip IP address
 * @returns {Promise<{domain, ttl, value, type}>}
 */
const reverse = async (ip, log) => {
    log.info(`Reversing ${ip}`);
    const reversedIP = ip.includes('.') ? reverseIPv4(ip) : reverseIPv6(ip);
    return dig([reversedIP, 'PTR']).then(({ answer }) => {
        answer && Object.entries(answer[0]).forEach(([key, val]) => {
            answer[0][key] = stem(val);
        });
        return answer ? answer[0] : {};
    }).catch((exc) => {
        log.warn(`resolver.js - reverse, ip ${ip}: ${exc}`);
        return {};
    });
}

const stem = (str) => {
    if (str && str.endsWith('.')) {
        str = str.slice(0, -1);
    }
    return str;
}

module.exports = {
    resolve,
    reverse
};
