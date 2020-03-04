const fetch = require('node-fetch')
const split2 = require('split2')
const { WebSocket } = require('@clusterws/cws')

const serialize = options => {
  return encodeURIComponent(JSON.stringify(options))
}

class SimpleWebsocketClient {
  constructor(url, onMessageCB, onOpen) {
    this._socket = new WebSocket(url)
    this._socket.on('open', onOpen)
    this._socket.on('message', onMessageCB)
    this._socket.on('error', err => {
      console.log('SimpleWebsocketClient error', err)
    })
  }

  send(payload) {
    this._socket.send(JSON.stringify(payload))
  }

  async closed() {
    await new Promise(resolve => {
      this._socket.on('close', () => {
        resolve()
      })
    })
  }
}

const EXCHANGE = 'bitmex'
const SYMBOL = 'XBTUSD'

const TRADES_AND_BOOK_FILTERS = [
  {
    channel: 'trade',
    symbols: [SYMBOL]
  },
  {
    channel: 'orderBookL2',
    symbols: [SYMBOL]
  }
]
const TRADES_AND_BOOK_SUBSCRIPTION_MESSAGES = [
  {
    op: 'subscribe',
    args: [`trade:${SYMBOL}`, `orderBookL2:${SYMBOL}`]
  }
]

const FROM_DATE = '2020-02-01'
const TO_DATE = '2020-02-02'

async function httpReplayBenchmark({ JSONParseResponse }) {
  const options = {
    exchange: EXCHANGE,
    filters: TRADES_AND_BOOK_FILTERS,
    from: FROM_DATE,
    to: TO_DATE
  }

  const response = await fetch(`http://localhost:8000/replay?options=${serialize(options)}`)
  const messagesStream = response.body.pipe(split2())

  let messagesCount = 0
  let startTime = new Date()
  for await (let line of messagesStream) {
    if (JSONParseResponse) {
      JSON.parse(line)
    }

    messagesCount++
  }

  const elapsedSeconds = (new Date() - startTime) / 1000
  const messagesPerSecond = Math.round(messagesCount / elapsedSeconds)

  console.log('HTTP /replay finished', {
    JSONParseResponse,
    messagesPerSecond,
    messagesCount,
    elapsedSeconds
  })
}

async function httpReplayNormalizedBenchmark({ computeTBTBookSnapshots }) {
  const options = {
    exchange: EXCHANGE,
    symbols: [SYMBOL],
    from: FROM_DATE,
    to: TO_DATE,
    dataTypes: ['trade', 'book_change']
  }
  if (computeTBTBookSnapshots) {
    options.dataTypes.push('book_snapshot_50_0ms')
  }

  const response = await fetch(`http://localhost:8000/replay-normalized?options=${serialize(options)}`)
  const messagesStream = response.body.pipe(split2())

  let messagesCount = 0
  let startTime = new Date()
  for await (let line of messagesStream) {
    messagesCount++
  }

  const elapsedSeconds = (new Date() - startTime) / 1000
  const messagesPerSecond = Math.round(messagesCount / elapsedSeconds)

  console.log('HTTP /replay-normalized finished', {
    computeTBTBookSnapshots,
    messagesPerSecond,
    messagesCount,
    elapsedSeconds
  })
}

async function wsReplayBenchmark({ JSONParseResponse }) {
  let messagesCount = 0
  let startTime
  const simpleBitmexWSClient = new SimpleWebsocketClient(
    `ws://localhost:8001/ws-replay?exchange=${EXCHANGE}&from=${FROM_DATE}&to=${TO_DATE}`,
    message => {
      if (!startTime) {
        startTime = new Date()
      }
      if (JSONParseResponse) {
        JSON.parse(message)
      }
      messagesCount++
    },
    () => {
      for (const sub of TRADES_AND_BOOK_SUBSCRIPTION_MESSAGES) {
        simpleBitmexWSClient.send(sub)
      }
    }
  )

  await simpleBitmexWSClient.closed()

  const elapsedSeconds = (new Date() - startTime) / 1000
  const messagesPerSecond = Math.round(messagesCount / elapsedSeconds)

  console.log('WS /ws-replay finished', {
    JSONParseResponse,
    messagesPerSecond,
    messagesCount,
    elapsedSeconds
  })
}

async function wsReplayNormalizedBenchmark({ computeTBTBookSnapshots }) {
  const options = {
    exchange: EXCHANGE,
    symbols: [SYMBOL],
    from: FROM_DATE,
    to: TO_DATE,
    dataTypes: ['trade', 'book_change']
  }
  if (computeTBTBookSnapshots) {
    options.dataTypes.push('book_snapshot_50_0ms')
  }

  let messagesCount = 0
  let startTime

  const simpleBitmexWSClient = new SimpleWebsocketClient(
    `ws://localhost:8001/ws-replay-normalized?options=${serialize(options)}`,
    message => {
      if (!startTime) {
        startTime = new Date()
      }
      messagesCount++
    },
    () => {}
  )

  await simpleBitmexWSClient.closed()

  const elapsedSeconds = (new Date() - startTime) / 1000
  const messagesPerSecond = Math.round(messagesCount / elapsedSeconds)

  console.log('WS /ws-replay-normalized finished', {
    computeTBTBookSnapshots,
    messagesPerSecond,
    messagesCount,
    elapsedSeconds
  })
}

async function runBenchmarks() {
  console.log(`tardis-machine benchmark for ${EXCHANGE} from ${FROM_DATE} to ${TO_DATE}`)
  console.log('\n')

  await httpReplayBenchmark({ JSONParseResponse: false })
  await wsReplayBenchmark({ JSONParseResponse: false })

  await httpReplayBenchmark({ JSONParseResponse: true })
  await wsReplayBenchmark({ JSONParseResponse: true })

  await httpReplayNormalizedBenchmark({ computeTBTBookSnapshots: false })
  await httpReplayNormalizedBenchmark({ computeTBTBookSnapshots: true })

  await wsReplayNormalizedBenchmark({ computeTBTBookSnapshots: false })
  await wsReplayNormalizedBenchmark({ computeTBTBookSnapshots: true })
}

// assumes tardis-machine server is running
runBenchmarks()
