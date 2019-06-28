# tardis-machine

[tardis.dev](https://tardis.dev) API client with built-in local caching providing on-demand tick-level market data replay from any point in time in exchange's Websocket data format.

[![Version](https://img.shields.io/npm/v/tardis-machine.svg)](https://www.npmjs.org/package/tardis-machine)
[![Try on RunKit](https://badge.runkitcdn.com/tardis-machine.svg)](https://runkit.com/npm/tardis-machine)

Check out [`tardis-client`](https://github.com/tardis-dev/node-client) as well if you're using Node.js.

## HTTP endpoint

Accessible via **`/replay?exchange=<EXCHANGE>&from=<FROM_DATE>&to=<TO_DATE>&filters=<FILTERS>`**

Allows replaying historical crypto exchange WebSocket data feed via streaming HTTP response (new line delimited JSON).
Returns up to 400 000 messages per second (depending on the machine set-up and local cache ratio).

#### Example requests:

- `http://localhost:8000/replay?exchange=bitmex&from=2019-05-01&to=2019-05-02&filters=[{"channel":"trade"}]` - returns all trades that happened on BitMEX on 1st of May 2019 in [ndjson format](http://ndjson.org/).
- `http://localhost:8000/replay?exchange=bitmex&from=2019-04-01&to=2019-04-02&filters=[{"channel":"trade","symbols":["XBTUSD","ETHUSD"]},{"channel":"orderBookL2","symbols":["XBTUSD"]}]` - returns all trades that happened on BitMEX on 1st of April 2019 for `XBTUSD` and `ETHUSD` as well as `orderbookL2` snapshot and updates for `XBTUSD` in [ndjson format](http://ndjson.org/).

#### Available query string params params:

| name                 | type                                                                            | default value | description                                                                                                                                                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `exchange`           | `string`                                                                        | -             | requested exchange name. Check out [allowed echanges](https://github.com/tardis-dev/node-client/blob/master/src/consts.ts)                                                                                                                                                         |
| `from`               | `string`                                                                        | -             | replay period start date (UTC) - eg: `2019-04-05` or `2019-05-05T00:00:00.000Z`                                                                                                                                                                                                    |
| `to`                 | `string`                                                                        | -             | replay period end date (UTC) - eg: `2019-04-05` or `2019-05-05T00:00:00.000Z`                                                                                                                                                                                                      |
| `filters` (optional) | `Url encoded JSON string with {channel:string, symbols?: string[]}[] structure` | undefined     | optional filters for requested data feed. Check out [allowed channels](https://github.com/tardis-dev/node-client/blob/master/src/consts.ts) for each exchange, up to date list of accepted symbols can be found via `https://tardis.dev/api/v1/exchanges/<EXCHANGE_NAME>` API call |

#### Example response snippet:

```js
{"localTimestamp":"2019-05-01T00:09:42.2760012Z","message":{"table":"orderBookL2","action":"update","data":[{"symbol":"XBTUSD","id":8799473750,"side":"Buy","size":2333935}]}}
{"localTimestamp":"2019-05-01T00:09:42.2932826Z","message":{"table":"orderBookL2","action":"update","data":[{"symbol":"XBTUSD","id":8799474250,"side":"Buy","size":227485}]}}
{"localTimestamp":"2019-05-01T00:09:42.4249304Z","message":{"table":"trade","action":"insert","data":[{"timestamp":"2019-05-01T00:09:42.407Z","symbol":"XBTUSD","side":"Buy","size":1500,"price":5263,"tickDirection":"ZeroPlusTick","trdMatchID":"29d7de7f-27b6-9574-48d1-3ee9874831cc","grossValue":28501500,"homeNotional":0.285015,"foreignNotional":1500}]}}
{"localTimestamp":"2019-05-01T00:09:42.4249403Z","message":{"table":"orderBookL2","action":"update","data":[{"symbol":"XBTUSD","id":8799473700,"side":"Sell","size":454261}]}}
{"localTimestamp":"2019-05-01T00:09:42.4583155Z","message":{"table":"orderBookL2","action":"update","data":[{"symbol":"XBTUSD","id":8799473750,"side":"Buy","size":2333838},{"symbol":"XBTUSD","id":8799473800,"side":"Buy","size":547746}]}}
```

#### Response structure (single line):

`localTimestamp` is a date when message has been received in ISO 8601 format with 100 nano second resolution.

`message` is and JSON object/array with exactly the same structure as provided by particular exchange.

**Check out [tests](https://github.com/tardis-dev/tardis-machine/blob/master/test/tardismachine.test.ts#L56) to see how such messages stream can be easily consumed using Node.js streams and async iterators.**

## WebSocket endpoint

Accessible via **`/ws-replay/?exchange=<EXCHANGE>&from=<FROM_DATE>&to=<TO_DATE>`**

Exchanges & various 3rd party data providers WebSocket APIs allows subscribing only to real-time data feeds and there is no way to subscribe to and **"replay"** market from any point in the past. By using `tardis-machine` that is now possible.

#### Example:

Example below shows how to subscribe to BitMEX historical data feed (from 2019-06-01 to 2019-06-02) to `trade:XBTUSD` and `orderBookL2:XBTUSD` channels and replay such stream as if it was a real-time one. `Subscribe` request messages format as well as received messages format is exactly the same as in native exchanges WebSocket APIs.

```js
const ws = new WebSocket('ws://localhost:8000/ws-replay?exchange=bitmex&from=2019-06-01&to=2019-06-02')

ws.onmessage = message => {
  console.log(message)
}

ws.onopen = () => {
  const subscribePayload = {
    op: 'subscribe',
    args: ['trade:XBTUSD', 'orderBookL2:XBTUSD']
  }

  ws.send(JSON.stringify(subscribePayload))
}
```

In many cases such websocket historical data feeds can be consumed using already available WebSocket clients for various exchanges as in example below.

**That opens the possibility of having single data pipeline for real-time trading and backtesting.**

```js
// tardis machine can be run as CLI or inside Docker container - https://github.com/tardis-dev/tardis-machine
// example below starts it from code
const { TardisMachine } = require('tardis-machine')
const BitMEXClient = require('bitmex-realtime-api')
const PORT = 8072
const WS_REPLAY_URL = `ws://localhost:${PORT}/ws-replay?exchange=bitmex&from=2019-06-01&to=2019-06-01 02:00`
const tardisMachine = new TardisMachine({ cacheDir: './.cache' })

async function runTardisMachineWithBitMEXOfficialClient() {
  await tardisMachine.run(PORT)
  // only change required for BitMEX client is to point it to tardis-machine 'replay' endpoint
  const officialBitMEXClient = new BitMEXClient({ endpoint: WS_REPLAY_URL })

  officialBitMEXClient.addStream('ADAM19', 'trade', function(data, symbol, tableName) {
    if (!data.length) return

    const trade = data[data.length - 1] // the last data element is the newest trade
    console.log(trade, symbol, tableName)
  })

  await new Promise(resolve => officialBitMEXClient.on('end', resolve))
  await tardisMachine.stop()
}

await runTardisMachineWithBitMEXOfficialClient()
```

Check out [tests](https://github.com/tardis-dev/tardis-machine/blob/master/test/tardismachine.test.ts#L81) for more examples.

#### Available query string params:

In contrast to HTTP API for WebSocket API filters aren't provided explicitly as those are created based on `subscribe` messages over WebSocket received in first 5 seconds of the connection.

| name       | type     | default value | description                                                                                                 |
| ---------- | -------- | ------------- | ----------------------------------------------------------------------------------------------------------- |
| `exchange` | `string` | -             | requested exchange name. Currently supported: `bitmex, coinbase, deribit, cryptofacilities, bitstamp, okex` |
| `from`     | `string` | -             | replay period start date (UTC) - eg: `2019-04-05` or `2019-05-05T00:00:00.000Z`                             |
| `to`       | `string` | -             | replay period start date (UTC) - eg: `2019-04-05` or `2019-05-05T00:00:00.000Z`                             |

## Installation

- ### `npx` <sub>(requires Node.js v12 installed on host machine)</sub>

  That will start tardis-machine server running on port `8000` by default (port can be changes `--port`)

  ```sh
  npx tardis-machine --api-key=YOUR_API_KEY
  ```

  If you'd like to test it out on sample data (first full day of each month) simply run the command without `--api-key` option.

  ```sh
  npx tardis-machine
  ```

  Run `npx tardis-machine --help` to see all available options (setting custom cache dir etc.)

- ### `npm` <sub>(requires Node.js v12 installed on host machine)</sub>

  Installs `tardis-machine` globally.

  ```sh
  npm install -g tardis-machine

  tardis-machine --api-key=YOUR_API_KEY

  ```

  If you'd like to test it out on sample data (first full day of each month) simply run the command without `--api-key` option.

  ```sh
  tardis-machine
  ```

  Run `tardis-machine --help` to see all available options (setting custom cache dir etc.)

- ### Docker

  ```sh
  docker run -v ./host-cache-dir:/.cache -p 8000:8000 -e "TM_API-KEY=YOUR_API_KEY" -d tardisdev/tardis-machine
  ```

  Command above will pull and run latest version of [`tardisdev/tardis-machine` image](https://hub.docker.com/r/tardisdev/tardis-machine). Local proxy will be available on host via `8000` port (eg `http://localhost:8000/replay/...`).
  It will also pass `YOUR_API_KEY` for accessing the data (otherwise only first day of each month is accessible).
  Finally it will use `./host-cache-dir` as persistent volume ([bind mount](https://docs.docker.com/storage/bind-mounts/)) cache dir (otherwise each docker restart will result in loosing local cache)

  In order to debug issues/see detailed logs one can run:

  ```sh
  docker run -v ./host-cache-dir:/.cache -p 8000:8000 -e "TM_API-KEY=YOUR_API_KEY" -e="DEBUG=tardis*" -d tardisdev/tardis-machine
  ```

  Setting `DEBUG=tardis*` wil cause to print various useful debug logs to stdout.

  If using volumes causes issues (Windows?) it's perfectly fine to run docker without it (with the caveat of potentially poor local cache ratio after container restart)

  ```sh
  ### running without persitent local cache
  docker run -p 8000:8000 -e "TM_API-KEY=YOUR_API_KEY" -d tardisdev/tardis-machine
  ```

  [`tardisdev/tardis-machine` docker image](https://hub.docker.com/r/tardisdev/tardis-machine) can be used in K8S setup as well (just set up proper env variables and persisten volumes in analogue way).

## FAQ

#### Order book snapshots

Order book snapshots are always available at the beginning of the day ( 00:00 UTC) and/or when websocket connection is restarted by Exchange.

#### How to debug it if something went wrong?

This lib uses [debug](https://github.com/visionmedia/debug) package for verbose logging and debugging purposes that can be enabled via `DEBUG` environment variable set to `tardis*`.

## License

MPL-2.0
