import WebSocket from 'ws'
import { after, before, describe, test } from 'node:test'
import { EXCHANGES, type FilterForExchange, getExchangeDetails } from 'tardis-dev'
import type { TardisMachine as TardisMachineType } from '../dist/index.js'
import { assert, snapshot } from './assertions.ts'

const PORT = 8072
const HTTP_REPLAY_DATA_FEEDS_URL = `http://localhost:${PORT}/replay`
const HTTP_REPLAY_NORMALIZED_URL = `http://localhost:${PORT}/replay-normalized`
const WS_REPLAY_NORMALIZED_URL = `ws://localhost:${PORT + 1}/ws-replay-normalized`
const WS_REPLAY_URL = `ws://localhost:${PORT + 1}/ws-replay`

const serializeOptions = (options: any) => {
  return encodeURIComponent(JSON.stringify(options))
}

async function* responseLines(response: Response) {
  assert.ok(response.body)

  const decoder = new TextDecoder()
  let buffered = ''

  for await (const chunk of response.body) {
    buffered += decoder.decode(chunk, { stream: true })

    let newlineIndex
    while ((newlineIndex = buffered.indexOf('\n')) !== -1) {
      const line = buffered.slice(0, newlineIndex)
      buffered = buffered.slice(newlineIndex + 1)
      if (line !== '') yield line
    }
  }

  buffered += decoder.decode()
  if (buffered !== '') yield buffered
}

describe('tardis-machine', () => {
  let tardisMachine: TardisMachineType

  before(async () => {
    process.env.UWS_HTTP_MAX_HEADERS_SIZE = '20000'
    const { TardisMachine } = await import('../dist/index.js')
    tardisMachine = new TardisMachine({ cacheDir: './.cache' })
    await tardisMachine.start(PORT) // start server
  })

  after(async () => {
    await tardisMachine.stop()
  })

  test('routes health checks with or without a trailing slash', async () => {
    for (const path of ['/health-check', '/health-check/']) {
      const response = await fetch(`http://localhost:${PORT}${path}`)
      const body = (await response.json()) as { status: string }

      assert.equal(response.status, 200)
      assert.equal(body.status, 'Healthy')
    }
  })

  test('returns 404 for unknown routes and unsupported methods', async () => {
    const unknownRoute = await fetch(`http://localhost:${PORT}/unknown`)
    const unsupportedMethod = await fetch(`http://localhost:${PORT}/health-check`, { method: 'POST' })

    assert.equal(unknownRoute.status, 404)
    assert.equal(unsupportedMethod.status, 404)
  })

  describe('HTTP GET /replay-normalized', () => {
    test('replays Bitmex ETHUSD trades and order book changes', { timeout: 1000 * 60 * 10 }, async (context) => {
      const options = {
        exchange: 'bitmex',
        symbols: ['ETHUSD'],
        from: '2019-06-01',
        to: '2019-06-01 00:01',
        dataTypes: ['trade', 'book_change']
      }

      const response = await fetch(`${HTTP_REPLAY_NORMALIZED_URL}?options=${serializeOptions(options)}`)

      assert.equal(response.status, 200)

      const messagesStream = responseLines(response)

      const messages = []
      for await (let line of messagesStream) {
        const message = JSON.parse(line)

        messages.push(JSON.stringify(message))
      }

      snapshot(context, messages)
    })

    test(
      'replays Bitmex ETHUSD order book real time quotes and 6 second 5 levels snapshots',
      { timeout: 1000 * 60 * 10 },
      async (context) => {
        const options = {
          exchange: 'bitmex',
          symbols: ['ETHUSD'],
          from: '2019-06-01',
          to: '2019-06-01 00:01',
          dataTypes: ['quote', 'book_snapshot_5_6s']
        }

        const response = await fetch(`${HTTP_REPLAY_NORMALIZED_URL}?options=${serializeOptions(options)}`)

        assert.equal(response.status, 200)

        const messagesStream = responseLines(response)

        const messages = []
        for await (let line of messagesStream) {
          const message = JSON.parse(line)

          messages.push(JSON.stringify(message))
        }

        snapshot(context, messages)
      }
    )

    test('replays Bitmex XBTUSD and Deribit BTC-PERPETUAL trade 1 second bars', { timeout: 1000 * 60 * 10 }, async (context) => {
      const options = [
        {
          exchange: 'bitmex',
          symbols: ['ETHUSD'],
          from: '2019-06-01',
          to: '2019-06-01 00:01',
          dataTypes: ['trade_bar_1s']
        },
        {
          exchange: 'deribit',
          symbols: ['BTC-PERPETUAL'],
          from: '2019-06-01',
          to: '2019-06-01 00:01',
          dataTypes: ['trade_bar_1s']
        }
      ]

      const response = await fetch(`${HTTP_REPLAY_NORMALIZED_URL}?options=${serializeOptions(options)}`)

      assert.equal(response.status, 200)

      const messagesStream = responseLines(response)

      const messages = []
      for await (let line of messagesStream) {
        const message = JSON.parse(line)

        messages.push(JSON.stringify(message))
      }

      snapshot(context, messages)
    })
  })

  describe('HTTP GET /replay', () => {
    test('invalid params', async () => {
      let response = await fetch(
        `${HTTP_REPLAY_DATA_FEEDS_URL}?options=${serializeOptions({
          exchange: 'binance',
          from: 'sdf',
          to: 'ssd'
        })}`
      )
      assert.equal(response.status, 500)

      response = await fetch(
        `${HTTP_REPLAY_DATA_FEEDS_URL}?options=${serializeOptions({
          exchange: 'binance',
          from: '2019-06-05 00:00Z',
          to: '2019-05-05 00:05Z'
        })}`
      )

      assert.equal(response.status, 500)
    })

    test('replays five minutes of Bitmex ETHUSD trades and order book updates', { timeout: 1000 * 60 * 10 }, async () => {
      const filters: FilterForExchange['bitmex'][] = [
        {
          channel: 'trade',
          symbols: ['ETHUSD']
        },
        {
          channel: 'orderBookL2',
          symbols: ['ETHUSD']
        }
      ]

      const options = {
        exchange: 'bitmex',
        from: '2019-05-01',
        to: '2019-05-01T00:05:00Z',
        filters
      }

      const response = await fetch(`${HTTP_REPLAY_DATA_FEEDS_URL}?options=${serializeOptions(options)}`)

      assert.equal(response.status, 200)

      const ethTradeMessages = responseLines(response)

      let receivedTradesCount = 0
      let receivedOrderBookUpdatesCount = 0

      for await (let line of ethTradeMessages) {
        const { message } = JSON.parse(line)

        if (message.table == 'trade') {
          receivedTradesCount++
        }

        if (message.table == 'orderBookL2') {
          receivedOrderBookUpdatesCount++
        }
      }

      assert.equal(receivedTradesCount, 164)
      assert.equal(receivedOrderBookUpdatesCount, 5375)
    })

    test(
      'returns the upstream authorization error for restricted data',
      { timeout: 30 * 1000, skip: process.env.RUN_LIVE_TESTS !== '1' },
      async () => {
        const options = {
          exchange: 'bitmex',
          from: '2019-05-02',
          to: '2019-05-02T00:01:00Z'
        }

        const response = await fetch(`${HTTP_REPLAY_DATA_FEEDS_URL}?options=${serializeOptions(options)}`)

        assert.equal(response.status, 401)
      }
    )
  })

  describe('WS /ws-replay', { concurrency: true }, () => {
    test('subscribes to five minutes of historical Coinbase ZEC-USDC trades', { timeout: 10 * 60 * 1000 }, async (context) => {
      let messages: string[] = []
      const simpleCoinbaseClient = new SimpleWebsocketClient(
        `${WS_REPLAY_URL}?exchange=coinbase&from=2019-06-01&to=2019-06-01T00:05:00Z`,
        (message) => {
          messages.push(message as string)
        },
        () => {
          simpleCoinbaseClient.send({
            type: 'subscribe',
            channels: [
              {
                name: 'matches',
                product_ids: ['ZEC-USDC']
              }
            ]
          })
        }
      )

      await simpleCoinbaseClient.closed()
      snapshot(context, messages)
    })

    test('subscribes to five minutes of historical Crypto Facilities PI_XBTUSD trades', { timeout: 10 * 60 * 1000 }, async (context) => {
      let messages: string[] = []
      const simpleCFClient = new SimpleWebsocketClient(
        `${WS_REPLAY_URL}?exchange=cryptofacilities&from=2019-06-01&to=2019-06-01T00:05:00Z`,
        (message) => {
          messages.push(message as string)
        },
        () => {
          simpleCFClient.send({
            event: 'subscribe',
            feed: 'trade',
            product_ids: ['PI_XBTUSD']
          })
        }
      )

      await simpleCFClient.closed()
      snapshot(context, messages)
    })

    test('subscribes to five minutes of historical Bitstamp LTCUSD trades', { timeout: 10 * 60 * 1000 }, async (context) => {
      let messages: string[] = []
      const simpleBitstampClient = new SimpleWebsocketClient(
        `${WS_REPLAY_URL}?exchange=bitstamp&from=2019-06-01&to=2019-06-01T00:05:00Z`,
        (message) => {
          messages.push(message as string)
        },
        () => {
          simpleBitstampClient.send({
            event: 'bts:subscribe',
            data: {
              channel: 'live_trades_ltcusd'
            }
          })
        }
      )

      await simpleBitstampClient.closed()
      snapshot(context, messages)
    })

    test('subscribes to five minutes of historical OKEX BTC-USDT trades', { timeout: 10 * 60 * 1000 }, async (context) => {
      let messages: string[] = []
      const simpleOkexClient = new SimpleWebsocketClient(
        `${WS_REPLAY_URL}?exchange=okex&from=2019-06-01&to=2019-06-01T00:05:00Z`,
        (message) => {
          messages.push(message as string)
        },
        () => {
          simpleOkexClient.send({ op: 'subscribe', args: ['spot/trade:BTC-USDT'] })
        }
      )

      await simpleOkexClient.closed()
      snapshot(context, messages)
    })

    test('subscribes to five minutes of historical BitMEX ADAM19 trades', { timeout: 10 * 60 * 1000 }, async (context) => {
      let trades: string[] = []
      const wsURL = `${WS_REPLAY_URL}?exchange=bitmex&from=2019-06-01&to=2019-06-01T00:05:00Z`
      const simpleBitmexWSClient = new SimpleWebsocketClient(
        wsURL,
        (message) => {
          const parsedMessage = JSON.parse(message)
          if (parsedMessage.action != 'insert') return

          parsedMessage.data.forEach((trade: any) => {
            if (trade.symbol != 'ADAM19') return

            trades.push(JSON.stringify(trade))
          })
        },
        () => {
          simpleBitmexWSClient.send({
            op: 'subscribe',
            args: ['trade:ADAM19']
          })
        }
      )

      await simpleBitmexWSClient.closed()
      snapshot(context, trades)
    })

    test('keeps five-minute BitMEX and Deribit replay sessions synchronized', { timeout: 5 * 60 * 1000 }, async (context) => {
      const bitmexMessages: string[] = []
      const deribitMessages: string[] = []

      const simpleBitmexWSClient = new SimpleWebsocketClient(
        `${WS_REPLAY_URL}?exchange=bitmex&from=2019-06-01&to=2019-06-01T00:05:00Z&session=common`,
        (message) => {
          bitmexMessages.push(message)
        },
        () => {
          simpleBitmexWSClient.send({
            op: 'subscribe',
            args: ['trade:XBTUSD', 'orderBookL2:XBTUSD']
          })
        }
      )

      const simpleDeribitWSClient = new SimpleWebsocketClient(
        `${WS_REPLAY_URL}?exchange=deribit&from=2019-06-01&to=2019-06-01T00:05:00Z&session=common`,
        (message) => {
          deribitMessages.push(message)
        },
        () => {
          simpleDeribitWSClient.send({
            jsonrpc: '2.0',
            method: 'public/subscribe',
            params: {
              channels: ['book.BTC-PERPETUAL.raw']
            }
          })

          simpleDeribitWSClient.send({
            jsonrpc: '2.0',
            method: 'public/subscribe',
            params: {
              channels: ['trades.BTC-PERPETUAL.raw']
            }
          })
        }
      )

      await simpleBitmexWSClient.closed()

      const timestamp = new Date().getTime()

      await simpleDeribitWSClient.closed()
      // both clients should close in the same moment basically
      assert.ok(new Date().getTime() - timestamp < 100)

      snapshot(context, bitmexMessages)
      snapshot(context, deribitMessages)
    })

    test('subscribes to five minutes of historical Binance btcusdt trades', { timeout: 10 * 60 * 1000 }, async (context) => {
      let messages: string[] = []
      const simpleBinanceClient = new SimpleWebsocketClient(
        `${WS_REPLAY_URL}?exchange=binance&from=2019-07-01&to=2019-07-01T00:05:00Z`,
        (message) => {
          messages.push(message as string)
        },
        () => {
          simpleBinanceClient.send({ method: 'SUBSCRIBE', params: ['btcusdt@trade'] })
        }
      )

      await simpleBinanceClient.closed()
      snapshot(context, messages)
    })
  })

  describe('WS /ws-replay-normalized', () => {
    test('replays Bitmex XBTUSD and Deribit BTC-PERPETUAL trade 1 second bars', { timeout: 1000 * 60 * 10 }, async (context) => {
      const options = [
        {
          exchange: 'bitmex',
          symbols: ['ETHUSD'],
          from: '2019-06-01',
          to: '2019-06-01T00:01Z',
          dataTypes: ['trade_bar_1s']
        },
        {
          exchange: 'deribit',
          symbols: ['BTC-PERPETUAL'],
          from: '2019-06-01',
          to: '2019-06-01T00:01Z',
          dataTypes: ['trade_bar_1s']
        }
      ]

      let messages: string[] = []

      const simpleWSClient = new SimpleWebsocketClient(`${WS_REPLAY_NORMALIZED_URL}?options=${serializeOptions(options)}`, (message) => {
        messages.push(message)
      })

      await simpleWSClient.closed()

      snapshot(context, messages)
    })
  })

  describe('WS /ws-stream-normalized', () => {
    test(
      'streams normalized real-time messages for each supported exchange as single consolidated stream',
      { timeout: 1000 * 60 * 4, skip: process.env.RUN_LIVE_TESTS !== '1' },
      async () => {
        const exchangesWithDerivativeInfo = [
          'bitmex',
          'binance-futures',
          'bitfinex-derivatives',
          'cryptofacilities',
          'deribit',
          'okex-futures',
          'okex-swap',
          'bybit',
          'phemex',
          'ftx',
          'delta',
          'binance-delivery',
          'huobi-dm',
          'huobi-dm-swap',
          'huobi-dm-linear-swap',
          'gate-io-futures',
          'coinflex'
        ]
        const excludedExchanges = new Set([
          'binance-dex',
          'binance-jersey',
          'coinbase-international',
          'coinflex',
          'dydx',
          'ftx',
          'ftx-us',
          'huobi-dm-options',
          'mango',
          'okex-spreads',
          'okcoin',
          'serum',
          'star-atlas'
        ])

        const options = (
          await Promise.all(
            EXCHANGES.filter((exchange) => excludedExchanges.has(exchange) === false).map(async (exchange) => {
              const exchangeDetails = await getExchangeDetails(exchange)
              const dataTypes: any[] = ['trade', 'trade_bar_10ms', 'book_change', 'book_snapshot_3_0ms']

              if (exchangesWithDerivativeInfo.includes(exchange)) {
                dataTypes.push('derivative_ticker')
              }

              var symbols = exchangeDetails.availableSymbols
                .filter((s) => s.id !== undefined)
                .filter((s) => s.availableTo === undefined || new Date(s.availableTo).valueOf() > new Date().valueOf())
                .slice(0, 2)
                .map((s) => s.id)

              return {
                exchange,
                symbols,
                withDisconnectMessages: true,
                withErrorMessages: true,
                timeoutIntervalMS: 30 * 1000,
                dataTypes: dataTypes
              }
            })
          )
        ).filter((option) => option.symbols.length > 0)

        let count = 0
        const countsByExchange: Record<string, number> = {}
        const errorCountsByExchange: Record<string, number> = {}
        const lastErrorByExchange: Record<string, string> = {}

        await new Promise<void>((resolve, reject) => {
          let settled = false

          const summarize = () => {
            const exchangesWithNoMessages = options
              .map((option) => option.exchange)
              .filter((exchange) => (countsByExchange[exchange] ?? 0) === 0)

            const exchangesWithErrors = Object.entries(errorCountsByExchange)
              .sort((left, right) => right[1] - left[1])
              .map(([exchange, errorCount]) => ({
                exchange,
                errorCount,
                lastError: lastErrorByExchange[exchange]
              }))

            return {
              totalMessages: count,
              exchangesWithNoMessages,
              exchangesWithErrors
            }
          }

          const ws = new SimpleWebsocketClient(
            `ws://localhost:${PORT + 1}/ws-stream-normalized?options=${serializeOptions(options)}`,
            (message) => {
              const parsedMessage = JSON.parse(message)

              if (parsedMessage.type === 'error') {
                errorCountsByExchange[parsedMessage.exchange] = (errorCountsByExchange[parsedMessage.exchange] ?? 0) + 1
                lastErrorByExchange[parsedMessage.exchange] = parsedMessage.details
                return
              }

              count++
              countsByExchange[parsedMessage.exchange] = (countsByExchange[parsedMessage.exchange] ?? 0) + 1

              if (count > 20000 && !settled) {
                settled = true
                clearInterval(progressInterval)
                clearTimeout(diagnosticTimeout)
                ws.close()
                resolve()
              }
            },
            () => {},
            (error) => {
              if (settled) {
                return
              }

              settled = true
              clearInterval(progressInterval)
              clearTimeout(diagnosticTimeout)
              reject(error)
            }
          )

          const progressInterval = setInterval(() => {
            console.log('WS /ws-stream-normalized progress', summarize())
          }, 30 * 1000)

          const diagnosticTimeout = setTimeout(
            () => {
              if (settled) {
                return
              }

              settled = true
              clearInterval(progressInterval)
              ws.close()
              reject(new Error(`WS /ws-stream-normalized diagnostic timeout: ${JSON.stringify(summarize())}`))
            },
            1000 * 60 * 3 + 30 * 1000
          )
        })
      }
    )
  })
})

class SimpleWebsocketClient {
  private readonly _socket: WebSocket
  private isClosed = false
  constructor(
    url: string,
    onMessageCB: (message: string) => void,
    onOpen: () => void = () => {},
    onError: (error: Error) => void = () => {}
  ) {
    this._socket = new WebSocket(url)
    this._socket.on('message', function (message: Buffer) {
      onMessageCB(message.toString())
    })
    this._socket.on('open', onOpen)
    this._socket.on('error', (err) => {
      console.log('SimpleWebsocketClient Error', err)
      onError(err)
    })
    this._socket.on('close', () => (this.isClosed = true))
  }

  public send(payload: any) {
    this._socket.send(JSON.stringify(payload))
  }

  public close() {
    this._socket.close()
  }

  public async closed() {
    while (!this.isClosed) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  }
}
