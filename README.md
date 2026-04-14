# Tardis Machine Server

[![Version](https://img.shields.io/npm/v/tardis-machine.svg)](https://www.npmjs.org/package/tardis-machine)

[Tardis Machine](https://docs.tardis.dev/tardis-machine/quickstart) is a locally runnable server with built-in data caching that uses the [Tardis.dev HTTP API](https://docs.tardis.dev/api/http-api-reference) under the hood. It provides both **tick-level historical** and **consolidated real-time cryptocurrency market data** via HTTP and WebSocket APIs. Available via [npm and Docker](https://docs.tardis.dev/tardis-machine/quickstart#installation).

<br/>

## Features

- efficient data replay API endpoints returning historical market data for entire time periods

- [exchange-native market data APIs](https://docs.tardis.dev/tardis-machine/replaying-historical-data#exchange-native-market-data-apis) — tick-by-tick historical replay in exchange-native format via HTTP and WebSocket endpoints. The WebSocket API replays data with the same format and subscribe logic as real-time exchange APIs — existing exchange WebSocket clients can connect to this endpoint.

- [normalized market data APIs](https://docs.tardis.dev/tardis-machine/replaying-historical-data#normalized-market-data-apis) — consistent format across all exchanges via HTTP and WebSocket endpoints. Includes synchronized multi-exchange replay, real-time streaming, customizable order book snapshots and trade bars.

- [seamless switching](https://docs.tardis.dev/tardis-machine/replaying-historical-data#normalized-market-data-apis) between real-time streaming and historical replay

- transparent local data caching (compressed on disk, decompressed on demand)

- support for many cryptocurrency exchanges — see [docs.tardis.dev](https://docs.tardis.dev) for the full list

<br/>

## Documentation

### [See official docs](https://docs.tardis.dev/tardis-machine/quickstart).

<br/>
