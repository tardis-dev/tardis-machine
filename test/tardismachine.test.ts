import fetch from 'node-fetch'
import split2 from 'split2'
import WebSocket from 'ws'
import { FilterForExchange } from 'tardis-client'
import { TardisMachine } from '../src'

const BitMEXClient = require('bitmex-realtime-api')

const PORT = 8072
const HTTP_REPLAY_DATA_FEEDS_URL = `http://localhost:${PORT}/replay`
const WS_REPLAY_URL = `ws://localhost:${PORT}/ws-replay`

describe('tardis-machine', () => {
  let tardisMachine: TardisMachine
  beforeAll(async () => {
    tardisMachine = new TardisMachine({ cacheDir: './.cache' })
    await tardisMachine.run(PORT) // start server
  })

  afterAll(async () => {
    await tardisMachine.stop()
  })

  describe('HTTP GET /replay', () => {
    test('invalid params', async () => {
      let response = await fetch(`${HTTP_REPLAY_DATA_FEEDS_URL}?exchange=binance&from=sdf&to=dsd`)
      expect(response.status).toBe(500)

      response = await fetch(`${HTTP_REPLAY_DATA_FEEDS_URL}?exchange=binance&from=2019-06-05 00:00Z&to=2019-05-05 00:05Z`)
      expect(response.status).toBe(500)
    })

    test(
      'replays Bitmex ETHUSD trades and order book updates for first of April 2019',
      async () => {
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

        let response = await fetch(
          `${HTTP_REPLAY_DATA_FEEDS_URL}?exchange=bitmex&from=2019-05-01&to=2019-05-02&filters=${encodeURIComponent(
            JSON.stringify(filters)
          )}`
        )

        expect(response.status).toBe(200)

        const ethTradeMessages = response.body.pipe(split2()) // split response body by new lines

        let receivedTradesCount = 0
        let receivedOrderBookUpdatesCount = 0

        for await (let line of ethTradeMessages) {
          const { message, localTimestamp } = JSON.parse(line)

          if (message.table == 'trade') {
            receivedTradesCount++
          }

          if (message.table == 'orderBookL2') {
            receivedOrderBookUpdatesCount++
          }
        }

        expect(receivedTradesCount).toBe(28629)
        expect(receivedOrderBookUpdatesCount).toBe(1328937)
      },
      1000 * 60 * 10
    )

    test('unauthorizedAccess', async () => {
      let response = await fetch(`${HTTP_REPLAY_DATA_FEEDS_URL}?exchange=bitmex&from=2019-05-02&to=2019-05-03`)

      expect(response.status).toBe(401)
    })
  })

  describe('WS /ws-replay', () => {
    test(
      'subcribes to and replays historical Coinbase data feed of 1st of Jun 2019 (ZEC-USDC trades)',
      async () => {
        let messages: string[] = []
        const simpleCoinbaseClient = new SimpleWebsocketClient(
          `${WS_REPLAY_URL}?exchange=coinbase&from=2019-06-01&to=2019-06-02`,
          message => {
            messages.push(message as string)
          }
        )

        await simpleCoinbaseClient.send({
          type: 'subscribe',
          channels: [
            {
              name: 'match',
              product_ids: ['ZEC-USDC']
            }
          ]
        })

        await simpleCoinbaseClient.closed()
        expect(messages).toMatchSnapshot()
      },
      10 * 60 * 1000
    )

    test(
      'subcribes to and replays historical Cryptofacilities data feed of 1st of Jun 2019 (PI_XBTUSD trades)',
      async () => {
        let messages: string[] = []
        const simpleCFClient = new SimpleWebsocketClient(
          `${WS_REPLAY_URL}?exchange=cryptofacilities&from=2019-06-01&to=2019-06-02`,
          message => {
            messages.push(message as string)
          }
        )

        await simpleCFClient.send({
          event: 'subscribe',
          feed: 'trade',
          product_ids: ['PI_XBTUSD']
        })

        await simpleCFClient.closed()
        expect(messages).toMatchSnapshot()
      },
      10 * 60 * 1000
    )

    test(
      'subcribes to and replays historical Bitstamp data feed of 1st of Jun 2019 (LTCUSD trades)',
      async () => {
        let messages: string[] = []
        const simpleBitstampClient = new SimpleWebsocketClient(
          `${WS_REPLAY_URL}?exchange=bitstamp&from=2019-06-01&to=2019-06-02`,
          message => {
            messages.push(message as string)
          }
        )

        await simpleBitstampClient.send({
          event: 'bts:subscribe',
          data: {
            channel: 'live_trades_ltcusd'
          }
        })

        await simpleBitstampClient.closed()
        expect(messages).toMatchSnapshot()
      },
      10 * 60 * 1000
    )

    test(
      'subcribes to and replays historical OKEX data feed of 1st of Jun 2019 (LTC-USD-SWAP trades)',
      async () => {
        let messages: string[] = []
        const simpleOkexClient = new SimpleWebsocketClient(`${WS_REPLAY_URL}?exchange=okex&from=2019-06-01&to=2019-06-02`, message => {
          messages.push(message as string)
        })

        await simpleOkexClient.send({ op: 'subscribe', args: ['swap/trade:LTC-USD-SWAP'] })

        await simpleOkexClient.closed()
        expect(messages).toMatchSnapshot()
      },
      10 * 60 * 1000
    )

    test(
      'subcribes to and replays historical BitMEX data feed of 1st of Jun 2019 (ADAM19 trades) using simple and official BitMEX clients',
      async end => {
        let trades: string[] = []
        let wsURL = `${WS_REPLAY_URL}?exchange=bitmex&from=2019-06-01&to=2019-06-02`
        const simpleBitmexWSClient = new SimpleWebsocketClient(wsURL, message => {
          const parsedMessage = JSON.parse(message)
          if (parsedMessage.action != 'insert') return

          parsedMessage.data.forEach((trade: any) => {
            if (trade.symbol != 'ADAM19') return

            trades.push(JSON.stringify(trade))
          })
        })

        await simpleBitmexWSClient.send({
          op: 'subscribe',
          args: ['trade:ADAM19']
        })

        await simpleBitmexWSClient.closed()
        expect(trades).toMatchSnapshot('ADAM19Trades')

        let officialClientTrades: string[] = []

        const officialBitMEXClient = new BitMEXClient({ endpoint: wsURL, maxTableLen: 20000 })

        officialBitMEXClient.addStream('ADAM19', 'trade', function(data: any) {
          if (!data.length) return

          const trades = data.slice(officialClientTrades.length, data.length).map((t: any) => JSON.stringify(t))
          officialClientTrades.push(...trades)
        })

        officialBitMEXClient.on('end', () => {
          expect(officialClientTrades).toMatchSnapshot('ADAM19Trades')
          end()
        })
      },
      10 * 60 * 1000
    )

    test(
      'subcribes to and replays historical BitMEX data feed of 1st of Jun 2019 (XBTUSD trades and  orderBookL2 updates)',
      async () => {
        const startTimestamp = new Date().getTime()
        let messagesCount = 0
        let lastBitmexMessage

        const simpleBitmexWSClient = new SimpleWebsocketClient(
          `${WS_REPLAY_URL}?exchange=bitmex&from=2019-06-01&to=2019-06-02`,
          message => {
            messagesCount++
            lastBitmexMessage = message
          }
        )

        await simpleBitmexWSClient.send({
          op: 'subscribe',
          args: ['trade:XBTUSD', 'orderBookL2:XBTUSD']
        })

        await simpleBitmexWSClient.closed()
        console.log(`WS received  for BitMEX ${messagesCount} in ${(new Date().getTime() - startTimestamp) / 1000} seconds`)
        expect(lastBitmexMessage).toMatchSnapshot()
        expect(messagesCount).toBe(7690673)
      },
      10 * 60 * 1000
    )

    test(
      'subcribes to and replays historical BitMEX and Deribit data feed of 1st of Jun 2019 (XBTUSD trades and book updates)',
      async () => {
        const startTimestamp = new Date().getTime()
        let bitmexMessagesCount = 0
        let deribitMessagesCount = 0
        let lastBitmexMessage
        let lastDeribitMessage

        const simpleBitmexWSClient = new SimpleWebsocketClient(
          `${WS_REPLAY_URL}?exchange=bitmex&from=2019-06-01&to=2019-06-02`,
          message => {
            lastBitmexMessage = message
            bitmexMessagesCount++
          }
        )

        const simpleDeribitWSClient = new SimpleWebsocketClient(
          `${WS_REPLAY_URL}?exchange=deribit&from=2019-06-01&to=2019-06-02`,
          message => {
            lastDeribitMessage = message
            deribitMessagesCount++
          }
        )

        await simpleBitmexWSClient.send({
          op: 'subscribe',
          args: ['trade:XBTUSD', 'orderBookL2:XBTUSD']
        })

        await simpleDeribitWSClient.send({
          jsonrpc: '2.0',
          method: 'public/subscribe',
          params: {
            channels: ['book.BTC-PERPETUAL.raw']
          }
        })

        await simpleDeribitWSClient.send({
          jsonrpc: '2.0',
          method: 'public/subscribe',
          params: {
            channels: ['trades.BTC-PERPETUAL.raw']
          }
        })

        await simpleBitmexWSClient.closed()

        const timestamp = new Date().getTime()

        await simpleDeribitWSClient.closed()
        // both clients should close in the same moment basically
        expect(new Date().getTime() - timestamp < 100).toBeTruthy

        console.log(
          `WS received for BitMEX ${bitmexMessagesCount} messages, for Deribit ${deribitMessagesCount} messages in ${(new Date().getTime() -
            startTimestamp) /
            1000} seconds`
        )

        expect(bitmexMessagesCount).toBe(7690673)
        expect(deribitMessagesCount).toBe(7029393)

        expect(lastBitmexMessage).toMatchSnapshot()
        expect(lastDeribitMessage).toMatchSnapshot()
      },
      20 * 60 * 1000
    )

    test(
      'subcribes to and replays historical BitMEX and Deribit data feed of first 5 minutes of 1st of April 2019 (XBTUSD trades and book updates)',
      async () => {
        let bitmexMessages: string[] = []
        let deribitMessages: string[] = []

        const simpleBitmexWSClient = new SimpleWebsocketClient(
          `${WS_REPLAY_URL}?exchange=bitmex&from=2019-06-01&to=2019-06-01 00:05`,
          message => {
            bitmexMessages.push(message)
          }
        )

        const simpleDeribitWSClient = new SimpleWebsocketClient(
          `${WS_REPLAY_URL}?exchange=deribit&from=2019-06-01&to=2019-06-01 00:05`,
          message => {
            deribitMessages.push(message)
          }
        )

        await simpleBitmexWSClient.send({
          op: 'subscribe',
          args: ['trade:XBTUSD', 'orderBookL2:XBTUSD']
        })

        await simpleDeribitWSClient.send({
          jsonrpc: '2.0',
          method: 'public/subscribe',
          params: {
            channels: ['book.BTC-PERPETUAL.raw']
          }
        })

        await simpleDeribitWSClient.send({
          jsonrpc: '2.0',
          method: 'public/subscribe',
          params: {
            channels: ['trades.BTC-PERPETUAL.raw']
          }
        })

        await simpleBitmexWSClient.closed()

        const timestamp = new Date().getTime()

        await simpleDeribitWSClient.closed()
        // both clients should close in the same moment basically
        expect(new Date().getTime() - timestamp < 100).toBeTruthy

        expect(bitmexMessages).toMatchSnapshot()
        expect(deribitMessages).toMatchSnapshot()
      },
      20 * 60 * 1000
    )
  })
})

class SimpleWebsocketClient {
  private readonly _socket: WebSocket
  constructor(url: string, onMessageCB: (message: string) => void) {
    this._socket = new WebSocket(url)
    this._socket.on('message', onMessageCB)
    this._socket.on('error', err => {
      console.log('SimpleWebsocketClient Error', err)
    })
  }

  public async send(payload: any) {
    if (this._socket.readyState != WebSocket.OPEN) {
      await new Promise(resolve => {
        this._socket.once('open', resolve)
      })
    }

    this._socket.send(JSON.stringify(payload))
  }

  public async closed() {
    if (this._socket.readyState != WebSocket.OPEN) {
      return
    }
    await new Promise(resolve => {
      this._socket.on('close', () => {
        resolve()
      })
    })
  }
}
