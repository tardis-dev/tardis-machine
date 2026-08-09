#!/usr/bin/env node
process.env.UWS_HTTP_MAX_HEADERS_SIZE = '20000'
import { createRequire } from 'node:module'
import { parseArgs } from 'node:util'
import os from 'node:os'
import path from 'node:path'
import cluster from 'node:cluster'

const require = createRequire(import.meta.url)
const numCPUs = os.cpus().length
const pkg = require('../package.json')

const DEFAULT_PORT = 8000
const HELP = `Usage: tardis-machine [options]

Options:
  --api-key <key>       API key for tardis.dev API access
  --cache-dir <path>    Local cache directory
  --clear-cache         Clear cache directory on startup
  --port <number>       HTTP port (WebSocket uses port + 1)
  --cluster-mode        Run as a cluster of Node.js processes
  --debug               Enable debug logs
  -h, --help            Show help
  -v, --version         Show version

Environment variables use the TM_ prefix, for example TM_API_KEY and TM_CACHE_DIR.
See https://docs.tardis.dev/api/tardis-machine for more information.`

let values
try {
  values = parseArgs({
    options: {
      'api-key': { type: 'string' },
      'cache-dir': { type: 'string' },
      'clear-cache': { type: 'boolean' },
      port: { type: 'string' },
      'cluster-mode': { type: 'boolean' },
      debug: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' }
    },
    strict: true
  }).values
} catch (error) {
  console.error(error.message)
  process.exit(1)
}

if (values.help) {
  console.log(HELP)
  process.exit(0)
}

if (values.version) {
  console.log(pkg.version)
  process.exit(0)
}

const envBoolean = (name) => process.env[name] === 'true'
const apiKey = values['api-key'] ?? process.env.TM_API_KEY
const cacheDir = values['cache-dir'] ?? process.env.TM_CACHE_DIR ?? path.join(os.tmpdir(), '.tardis-cache')
const clearCache = values['clear-cache'] ?? envBoolean('TM_CLEAR_CACHE')
const clusterMode = values['cluster-mode'] ?? envBoolean('TM_CLUSTER_MODE')
const debugEnabled = values.debug ?? envBoolean('TM_DEBUG')
const port = Number(process.env.PORT ?? values.port ?? process.env.TM_PORT ?? DEFAULT_PORT)

if (!Number.isInteger(port) || port < 1 || port > 65534) {
  console.error(`Invalid HTTP port: ${port}`)
  process.exit(1)
}

if (debugEnabled) {
  process.env.DEBUG = 'tardis-dev:machine*,tardis-dev:realtime*'
}

const { TardisMachine } = await import('../dist/index.js')

async function start() {
  const machine = new TardisMachine({
    apiKey,
    cacheDir,
    clearCache
  })
  let suffix = ''

  const runAsCluster = clusterMode
  if (runAsCluster) {
    cluster.schedulingPolicy = cluster.SCHED_RR

    suffix = '(cluster mode)'
    if (cluster.isPrimary) {
      for (let i = 0; i < numCPUs; i++) {
        cluster.fork()
      }
    } else {
      await machine.start(port)
    }
  } else {
    await machine.start(port)
  }

  if (!cluster.isPrimary) {
    return
  }

  console.log(`tardis-machine server v${pkg.version} is running ${suffix}`)
  console.log(`HTTP port: ${port}`)
  console.log(`WS port: ${port + 1}`)

  console.log(`See https://docs.tardis.dev/api/tardis-machine for more information.`)
}

start()

process
  .on('unhandledRejection', (reason, p) => {
    console.error('Unhandled Rejection at Promise', reason, p)
  })
  .on('uncaughtException', (err) => {
    console.error('Uncaught Exception thrown', err)
    process.exit(1)
  })
