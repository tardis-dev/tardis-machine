#!/usr/bin/env node

const yargs = require('yargs')
const os = require('os')
const path = require('path')

const { TardisMachine } = require('../dist')

const DEFAULT_PORT = 8000
const argv = yargs
  .scriptName('tardis-machine')
  .env('TM_')
  .strict()

  .option('api-key', {
    type: 'string',
    describe: 'API key for tardis.dev API access'
  })
  .option('cache-dir', {
    type: 'string',
    describe: 'Local cache dir path ',
    default: path.join(os.tmpdir(), '.tardis-cache')
  })
  .option('clear-cache', {
    type: 'boolean',
    describe: 'Clear cache dir on startup',
    default: false
  })
  .option('port', {
    type: 'number',
    describe: 'Port to bind server on',
    default: DEFAULT_PORT
  })

  .help()
  .version()
  .usage('$0 [options]')
  .example('$0 --api-key=YOUR_API_KEY')
  .epilogue('See https://docs.tardis.dev/api/tardis-machine for more information.')
  .detectLocale(false).argv

// if port ENV is defined use it otherwise use provided options
const portToListenTo = process.env.PORT ? +process.env.PORT : argv['port']

new TardisMachine({
  apiKey: argv['api-key'],
  cacheDir: argv['cache-dir'],
  clearCache: argv['clear-cache']
}).run(portToListenTo)
