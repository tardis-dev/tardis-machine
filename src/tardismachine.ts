import findMyWay from 'find-my-way'
import http from 'http'
import isDocker from 'is-docker'
import { clearCache, init } from 'tardis-dev'
import url from 'url'
import WebSocket from 'ws'
import { bitmexWsHelp, replayHttp, replayNormalizedHttp } from './http'
import { replayNormalizedWS, replayWS, streamNormalizedWS } from './ws'

const pkg = require('../package.json')

export class TardisMachine {
  private readonly _httpServer: http.Server

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
    router.on('GET', '/api/v1/schema/websocketHelp', bitmexWsHelp)

    this._initWebSocketServer()
  }

  private _initWebSocketServer() {
    const websocketServer = new WebSocket.Server({ server: this._httpServer })

    // super simple routing for websocket routes
    const routes = {
      '/ws-replay': replayWS,
      '/ws-replay-normalized': replayNormalizedWS,
      '/ws-stream-normalized': streamNormalizedWS
    } as any

    websocketServer.on('connection', async (ws, request) => {
      const path = url
        .parse(request.url!)
        .pathname!.replace(/\/$/, '')
        .toLocaleLowerCase()

      const matchingRoute = routes[path]

      if (matchingRoute !== undefined) {
        matchingRoute(ws, request)
      } else {
        ws.close(1008)
      }
    })
  }

  public async run(port: number) {
    if (this.options.clearCache) {
      await clearCache()
    }

    await new Promise((resolve, reject) => {
      try {
        this._httpServer.on('error', reject)
        this._httpServer.listen(port, resolve)
      } catch (e) {
        reject(e)
      }
    })

    if (isDocker() && !process.env.RUNKIT_HOST) {
      console.log(`tardis-machine v${pkg.version} is running inside Docker container...`)
    } else {
      console.log(`tardis-machine v${pkg.version} is running on ${port} port...`)
    }

    console.log(`See https://docs.tardis.dev/api/tardis-machine for more information.`)
  }

  public async stop() {
    await new Promise((resolve, reject) => {
      this._httpServer.close(err => {
        err ? reject(err) : resolve()
      })
    })
  }
}

type Options = {
  apiKey?: string
  cacheDir: string
  clearCache?: boolean
}
