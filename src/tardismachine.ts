import findMyWay from 'find-my-way'
import http from 'http'
import { clearCache, init } from 'tardis-dev'
import { App, DISABLED, TemplatedApp, WebSocket } from 'uWebSockets.js'
import { replayHttp, replayNormalizedHttp, healthCheck } from './http'
import { replayNormalizedWS, replayWS, streamNormalizedWS } from './ws'
import { debug } from './debug'

const pkg = require('../package.json')

export class TardisMachine {
  private readonly _httpServer: http.Server
  private readonly _wsServer: TemplatedApp
  private _eventLoopTimerId: NodeJS.Timer | undefined = undefined

  constructor(private readonly options: Options) {
    init({
      apiKey: options.apiKey,
      cacheDir: options.cacheDir,
      _userAgent: `tardis-machine/${pkg.version} (+https://github.com/tardis-dev/tardis-machine)`
    })

    const router = findMyWay({ ignoreTrailingSlash: true })

    this._httpServer = http.createServer((req, res) => {
      router.lookup(req, res)
    })

    // set timeout to 0 meaning infinite http timout - streaming may take some time expecially for longer date ranges
    this._httpServer.timeout = 0

    router.on('GET', '/replay', replayHttp)
    router.on('GET', '/replay-normalized', replayNormalizedHttp)
    router.on('GET', '/health-check', healthCheck)

    const wsRoutes = {
      '/ws-replay': replayWS,
      '/ws-replay-normalized': replayNormalizedWS,
      '/ws-stream-normalized': streamNormalizedWS
    } as any

    this._wsServer = App().ws('/*', {
      compression: DISABLED,
      maxPayloadLength: 512 * 1024,
      idleTimeout: 60,
      maxBackpressure: 5 * 1024 * 1024,
      closeOnBackpressureLimit: true,
      upgrade: (res: any, req: any, context: any) => {
        res.upgrade(
          { req },
          req.getHeader('sec-websocket-key'),
          req.getHeader('sec-websocket-protocol'),
          req.getHeader('sec-websocket-extensions'),
          context
        )
      },
      open: (ws: WebSocket) => {
        const path = ws.req.getUrl().toLocaleLowerCase()
        ws.closed = false
        const matchingRoute = wsRoutes[path]

        if (matchingRoute !== undefined) {
          matchingRoute(ws, ws.req)
        } else {
          ws.end(1008)
        }
      },

      message: (ws: WebSocket, message: ArrayBuffer) => {
        if (ws.onmessage !== undefined) {
          ws.onmessage(message)
        }
      },

      close: (ws: WebSocket) => {
        ws.closed = true
        if (ws.onclose !== undefined) {
          ws.onclose()
        }
      }
    } as any)
  }

  public async start(port: number) {
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

    if (this.options.clearCache) {
      await clearCache()
    }

    await new Promise<void>((resolve, reject) => {
      try {
        this._httpServer.on('error', reject)
        this._httpServer.listen(port, () => {
          this._wsServer.listen(port + 1, (listenSocket) => {
            if (listenSocket) {
              resolve()
            } else {
              reject(new Error('ws server did not start'))
            }
          })
        })
      } catch (e) {
        reject(e)
      }
    })
  }

  public async stop() {
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
