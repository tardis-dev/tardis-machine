import http from 'node:http'
import { createRequire } from 'module'
import { clearCache, init } from 'tardis-dev'
import { healthCheck, replayHttp, replayNormalizedHttp } from './http/index.ts'
import { replayNormalizedWS, replayWS, streamNormalizedWS } from './ws/index.ts'
import { MachineWebSocketServer } from './ws/server.ts'
import { debug } from './debug.ts'

const require = createRequire(import.meta.url)
const packageJson = require('../package.json') as { version: string }

export class TardisMachine {
  private readonly _httpServer: http.Server
  private readonly _wsServer: MachineWebSocketServer
  private _eventLoopTimerId: NodeJS.Timeout | undefined = undefined

  constructor(private readonly options: Options) {
    init({
      apiKey: options.apiKey,
      cacheDir: options.cacheDir,
      _userAgent: `tardis-machine/${packageJson.version} (+https://github.com/tardis-dev/tardis-machine)`
    })

    const routes = new Map<string, http.RequestListener>([
      ['/replay', replayHttp],
      ['/replay-normalized', replayNormalizedHttp],
      ['/health-check', healthCheck]
    ])

    this._httpServer = http.createServer((req, res) => {
      const pathname = new URL(req.url ?? '/', 'http://localhost').pathname.replace(/\/$/, '') || '/'
      const route = req.method === 'GET' ? routes.get(pathname) : undefined

      if (route === undefined) {
        res.statusCode = 404
        res.end()
        return
      }

      route(req, res)
    })

    // set timeout to 0 meaning infinite http timout - streaming may take some time expecially for longer date ranges
    this._httpServer.timeout = 0

    this._wsServer = new MachineWebSocketServer({
      '/ws-replay': replayWS,
      '/ws-replay-normalized': replayNormalizedWS,
      '/ws-stream-normalized': streamNormalizedWS
    })
  }

  public async start(port: number) {
    if (this.options.clearCache) {
      await clearCache()
    }

    await new Promise<void>((resolve, reject) => {
      this._httpServer.once('error', reject)
      this._httpServer.listen(port, () => {
        this._httpServer.removeListener('error', reject)
        resolve()
      })
    })

    try {
      await this._wsServer.listen(port + 1)
    } catch (error) {
      await new Promise<void>((resolve) => this._httpServer.close(() => resolve()))
      throw error
    }

    let start = process.hrtime()
    const interval = 500

    // based on https://github.com/tj/node-blocked/blob/master/index.js
    this._eventLoopTimerId = setInterval(() => {
      const delta = process.hrtime(start)
      const nanosec = delta[0] * 1e9 + delta[1]
      const ms = nanosec / 1e6
      const n = ms - interval

      if (n > 2000) {
        debug('Tardis-machine server event loop blocked for %d ms.', Math.round(n))
      }

      start = process.hrtime()
    }, interval)
  }

  public async stop() {
    await this._wsServer.close()

    await new Promise<void>((resolve, reject) => {
      this._httpServer.close((err) => {
        err ? reject(err) : resolve()
      })
    })

    if (this._eventLoopTimerId !== undefined) {
      clearInterval(this._eventLoopTimerId)
    }
  }
}

type Options = {
  apiKey?: string
  cacheDir: string
  clearCache?: boolean
}
