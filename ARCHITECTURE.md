# Architecture

tardis-machine is a local server that wraps `tardis-dev` library functionality in HTTP and WebSocket APIs.

## Dual-Server Design

The server runs two listeners: HTTP on port N and WebSocket on port N+1.

- **HTTP** — Node.js `http` module with `find-my-way` router. Endpoints for historical replay (exchange-native and normalized) and health check. Responses are streamed with batched buffering for throughput.
- **WebSocket** — `uWebSockets.js` for high-performance WebSocket handling with built-in backpressure. Endpoints for historical replay and real-time streaming (exchange-native and normalized).

## Key Concepts

**Replay sessions** — WebSocket replay supports multiple synchronized connections via session keys. Multiple clients can share a replay session and receive synchronized data.

**Subscription mapping** (`src/ws/subscriptionsmappers.ts`) — Translates exchange-native WebSocket subscribe messages into tardis-dev filter format. This enables existing exchange WebSocket clients to connect to tardis-machine and receive historical data as if it were the live exchange.

**Backpressure** — WebSocket paths monitor send buffer pressure and pause data production when a client can't keep up. This prevents memory growth from slow consumers.

**Caching** — Data is cached locally on disk in compressed format via tardis-dev. Subsequent requests for the same data range hit the cache.

## Design Decisions

- **Separate HTTP and WS ports** — Avoids complexity of protocol upgrade handling; uWebSockets.js runs its own event loop
- **Backpressure-first WS design** — Slow consumers don't cause memory growth; production pauses when send buffer fills
- **Exchange-native WS compatibility** — Subscription mappers allow existing exchange clients to work against historical data unchanged
