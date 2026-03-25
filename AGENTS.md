# tardis-machine

Public npm package and Docker image. Locally runnable server providing HTTP and WebSocket APIs for tick-level historical market data replay and consolidated real-time cryptocurrency market data streaming. Uses `tardis-dev` under the hood.

## Build & Test

```bash
npm run build          # tsc
npm test               # build + jest
npm run check-format   # prettier check
```

## Editing Rules

- Keep API behavior compatible with public docs — this is a published npm package
- Preserve backpressure handling in WebSocket paths
- Maintain mapper correctness in `src/ws/subscriptionsmappers.ts`
- Avoid heavy synchronous logic on request paths
- **Format after every edit** — run `npx prettier --write` on modified files after each change

## Validation

- `npm run build && npm test`
- `npm run check-format`

## Operational Docs

- [ARCHITECTURE.md](ARCHITECTURE.md) — dual-server design, HTTP/WS routing, session management

## Publishing

Published via GitHub Actions (`publish.yaml`). Do not publish manually unless explicitly requested.

## Keeping Docs Current

When you change code, check if any docs in this repo become stale as a result — if so, update them. When following a workflow doc, if the steps don't match reality, fix the doc so the next run is better.
