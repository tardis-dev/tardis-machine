# Adding a New Exchange

Tardis Machine consumes exchange support from `tardis-dev`. Its native `/ws-replay` mapper is exhaustive over `Exchange`, so every new exchange also requires an entry in this repo.

## Workflow

1. Update `tardis-dev` to a released version containing the exchange, channels, and mappers. Do not copy exchange clients or normalized mappers into Tardis Machine.

2. Add the exchange to `subscriptionsMappers` in `src/ws/subscriptionsmappers.ts`.

   Reuse a mapper only when the native subscription payload and channel/symbol semantics are identical. Otherwise add the smallest mapper that converts the real subscribe message to replay filters.

   For a new channel on an existing exchange, update `tardis-dev` when Machine exposes its normalized or real-time support. Change this mapping only when it does not already recognize the native subscription variant.

3. Add focused cases to `test/subscriptionsmappers.test.ts` for each distinct subscription variant.

4. Run [repo validation](AGENTS.md) and use the workspace [package publishing workflow](../docs/PUBLISHING_PACKAGES.md) for release.

## Upgrading an Existing Exchange API

Update to the released `tardis-dev` version before Machine must replay the new stored format. Change `subscriptionsMappers` only when the native subscription contract changes.

The workspace local end-to-end workflow does not cover Tardis Machine.
