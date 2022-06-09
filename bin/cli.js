#!/usr/bin/env node
'use strict';

const api = require('../index');
const fs = require('fs');

const args = require('yargs')
    .positional('path', { describe: 'Path to the HAR file.' })
    .options('o', { alias: 'output', describe: 'Path to write results.' })
    .options('t', { alias: 'trace', describe: 'Whether to perform traceroute.', default: true, type: 'boolean' })
    .options('l', { alias: 'level', describe: 'Specify log level.', default: 'info' })
    .options('r', { alias: 'reserve', describe: 'Path to file describing the field and headers to be reserved.' })
    .options('m', { alias: 'maxTTL', describe: 'Specify the maximum number of hops to probe.' })
    .options('p', { alias: 'protocol', describe: 'Speficy the protocol for traceroute.' })
    .options('T', { alias: 'timeout', describe: 'Specify the maximum wait time for traceroute to finish.' })
    .demandCommand(1, '')
    .argv;

const cli = async () => {
    const har = JSON.parse(fs.readFileSync(args._[0], 'utf-8'));
    const reserves = args.r && JSON.parse(fs.readFileSync(args.r, 'utf-8'));
    return api({ har, output: args.o, trace: args.t, loglevel: args.l, reserves, traceOptions: { maxTTL: args.m, protocol: args.p, timeout: args.T } });
}

cli().then((result) => {
    !args.o && process.stdout.write(JSON.stringify(result) + '\n');
});