const Parse = require('./src/Parser');
const log = require('simple-node-logger').createSimpleLogger();
const Query = require('./src/Query');
const Trace = require('./src/Trace');
const fs = require('fs');
const assert = require('assert');

const api = async ({
    har,
    output,
    database,
    trace = true,
    loglevel = 'info',
    reserves = {},
    traceOptions: { maxTTL = 36, protocol = 'ICMP', timeout = 60000 } = {},
    collectCodes = false,
} = {}) => {
    assert(har && har.log, 'Invalid HAR file');
    log.setLevel(loglevel);
    database = database || Query.create(log);
    const tracer = trace && Trace.create(database, log, { maxTTL, protocol, timeout });
    const parser = Parse.create(database, tracer, log);
    const result = await parser.run(har, reserves, collectCodes);
    output && fs.writeFileSync(output, JSON.stringify(result));
    return result;
}

const trace = async ({
    ip,
    database,
    loglevel = 'info',
    traceOptions: { maxTTL = 36, protocol = 'ICMP', timeout = 60000 } = {},
} = {}) => {
    assert(ip, 'IP not given');
    log.setLevel(loglevel);
    database = database || Query.create(log);
    const tracer = trace && Trace.create(database, log, { maxTTL, protocol, timeout });
    return tracer.parse([ip]);
}

module.exports = api;
module.exports.trace = trace;
module.exports.Parser = Parse.Parser;