import http, { OutgoingMessage, IncomingMessage } from 'http'
import { once } from 'events'
import url from 'url'
import dbg from 'debug'
import findMyWay from 'find-my-way'
import isDocker from 'is-docker'
import { WebSocketServer, WebSocket } from '@clusterws/cws'
import { TardisClient, ReplayOptions, Exchange } from 'tardis-client'
import { ReplaySession, WebsocketConnection } from './replaysession'

const debug = dbg('tardis-machine')

export class TardisMachine {
  private readonly _tardisClient: TardisClient
  private readonly _httpServer: http.Server
  private readonly _replaySessionsMeta: { sessionKey: string; session: ReplaySession }[] = []

  constructor(private readonly options: Options) {
    this._tardisClient = new TardisClient({
      apiKey: options.apiKey,
      cacheDir: options.cacheDir
    })

    const router = findMyWay({ ignoreTrailingSlash: true })
    this._httpServer = http.createServer((req, res) => {
      router.lookup(req, res)
    })

    // setup /replay streaming http route
    router.on('GET', '/replay', async (req, res) => {
      try {
        const startTimestamp = new Date().getTime()
        const parsedQuery = url.parse(req.url!, true).query
        const filtersQuery = parsedQuery['filters'] as string

        const replayOptions: ReplayOptions<any> = {
          exchange: parsedQuery['exchange'] as string,
          from: parsedQuery['from'] as string,
          to: parsedQuery['to'] as string,
          filters: filtersQuery ? JSON.parse(filtersQuery) : undefined
        }

        debug('GET /replay request started, options: %o', replayOptions)

        const streamedMessagesCount = await this._writeDataFeedMessagesToResponse(res, replayOptions)
        const endTimestamp = new Date().getTime()

        debug(
          'GET /replay request finished, options: %o, time: %d seconds, total messages count:%d',
          replayOptions,
          (endTimestamp - startTimestamp) / 1000,
          streamedMessagesCount
        )
      } catch (e) {
        const errorInfo = {
          responseText: e.responseText,
          message: e.message,
          url: e.url
        }

        debug('GET /replay request error: %o', e)
        console.error('GET /replay request error:', e)

        if (!res.finished) {
          res.statusCode = e.status || 500
          res.end(JSON.stringify(errorInfo))
        }
      }
    })

    // set timeout to 0 meaning infinite http timout - streaming may take some time expecially for longer date ranges
    this._httpServer.timeout = 0

    // setup websocket server for /ws-replay path
    const websocketServer = new WebSocketServer({
      server: this._httpServer,
      path: '/ws-replay'
    })

    websocketServer.on('connection', this._addToOrCreateNewReplaySession.bind(this))
  }

  private async _addToOrCreateNewReplaySession(ws: WebSocket, upgReq: IncomingMessage) {
    const parsedQuery = url.parse(upgReq.url!, true).query
    const from = parsedQuery['from'] as string
    const to = parsedQuery['to'] as string
    const replaySessionKey = `${from}-${to}`

    // if there are multiple separate ws connections being made for the same date ranges
    // in short time frame (5 seconds)
    // consolidate them in single replay session that will make sure that messages being send via websockets connections
    // are be synchronized by local timestamp

    const matchingReplaySessionMeta = this._replaySessionsMeta.find(s => s.sessionKey == replaySessionKey && s.session.hasStarted == false)

    if (matchingReplaySessionMeta) {
      matchingReplaySessionMeta.session.addToSession(new WebsocketConnection(ws, this._tardisClient, parsedQuery))
    } else {
      const newReplaySession = new ReplaySession()
      const meta = {
        sessionKey: replaySessionKey,
        session: newReplaySession
      }

      this._replaySessionsMeta.push(meta)

      newReplaySession.addToSession(new WebsocketConnection(ws, this._tardisClient, parsedQuery))

      newReplaySession.onClose(() => {
        const toRemove = this._replaySessionsMeta.indexOf(meta)
        this._replaySessionsMeta.splice(toRemove, 1)
      })
    }
  }

  private async _writeDataFeedMessagesToResponse<T extends Exchange>(res: OutgoingMessage, options: ReplayOptions<T>) {
    const responsePrefixBuffer = Buffer.from('{"localTimestamp":"')
    const responseMiddleBuffer = Buffer.from('","message":')
    const responseSuffixBuffer = Buffer.from('}\n')
    const BATCH_SIZE = 32

    // not 100% sure that's necessary since we're returning ndjson in fact, not json
    res.setHeader('Content-Type', 'text/json; charset=utf-8')

    let buffers: Buffer[] = []
    let totalMessagesCount = 0

    const dataFeedMessages = this._tardisClient.replayRaw(options)
    for await (let { message, localTimestamp } of dataFeedMessages) {
      totalMessagesCount++
      // instead of writing each message directly to response,
      // let's batch them and send in BATCH_SIZE  batches (each message is 5 buffers: prefix etc)
      // also instead of converting messages to string or parsing them let's manually stich together desired json response using buffers which is faster
      buffers.push(...[responsePrefixBuffer, localTimestamp, responseMiddleBuffer, message, responseSuffixBuffer])

      if (buffers.length == BATCH_SIZE * 5) {
        const ok = res.write(Buffer.concat(buffers))
        buffers = []
        // let's handle backpressure - https://nodejs.org/api/http.html#http_request_write_chunk_encoding_callback
        if (!ok) {
          await once(res, 'drain')
        }
      }
    }

    // write remaining buffers to response
    if (buffers.length > 0) {
      res.write(Buffer.concat(buffers))
      buffers = []
    }

    res.end('')

    return totalMessagesCount
  }

  public async run(port: number) {
    if (this.options.clearCache) {
      await this._tardisClient.clearCache()
    }

    await new Promise((resolve, reject) => {
      try {
        this._httpServer.on('error', reject)
        this._httpServer.listen(port, resolve)
      } catch (e) {
        reject(e)
      }
    })

    if (isDocker()) {
      console.log(`TardisMachine is running inside Docker container...`)
    } else {
      console.log(`TardisMachine is running...`)
      console.log(`--> HTTP endpoint: http://localhost:${port}/replay`)
      console.log(`--> WebSocket endpoint: http://localhost:${port}/ws-replay`)
    }

    console.log(`Check out https://tardis.dev for help or more information.`)
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
