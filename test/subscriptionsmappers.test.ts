import { describe, test } from 'node:test'
import { subscriptionsMappers } from '../src/ws/subscriptionsmappers.ts'
import { assert } from './assertions.ts'

describe('subscriptions mappers', () => {
  test('maps Hyperliquid fast book subscriptions', () => {
    const mapper = subscriptionsMappers.hyperliquid
    const date = new Date()

    assert.deepEqual(mapper.map({ method: 'subscribe', subscription: { type: 'l2Book', coin: 'BTC' } }, date), [
      { channel: 'l2Book', symbols: ['BTC'] }
    ])
    assert.deepEqual(mapper.map({ method: 'subscribe', subscription: { type: 'l2Book', coin: 'BTC', fast: true } }, date), [
      { channel: 'fastBook', symbols: ['BTC'] }
    ])
  })

  test('maps MEXC spot subscriptions', () => {
    const mapper = subscriptionsMappers.mexc
    const date = new Date()
    const message = {
      method: 'SUBSCRIPTION',
      params: ['spot@public.aggre.deals.v3.api.pb@10ms@BTCUSDT', 'spot@public.aggre.depth.v3.api.pb@10ms@ETHUSDT']
    }

    assert.equal(mapper.canHandle(message, date), true)
    assert.deepEqual(mapper.map(message, date), [
      { channel: 'spot@public.aggre.deals.v3.api.pb@10ms', symbols: ['BTCUSDT'] },
      { channel: 'spot@public.aggre.depth.v3.api.pb@10ms', symbols: ['ETHUSDT'] }
    ])
  })

  test('maps MEXC futures subscriptions', () => {
    const mapper = subscriptionsMappers['mexc-futures']
    const date = new Date()

    assert.equal(mapper.canHandle({ method: 'sub.depth', param: { symbol: 'BTC_USDT' }, gzip: false }, date), true)
    assert.deepEqual(mapper.map({ method: 'sub.depth', param: { symbol: 'BTC_USDT' }, gzip: false }, date), [
      { channel: 'push.depth', symbols: ['BTC_USDT'] }
    ])
    assert.deepEqual(mapper.map({ method: 'sub.contract' }, date), [{ channel: 'push.contract', symbols: [] }])
  })

  test('maps WOO X v2 and v3 subscriptions', () => {
    const mapper = subscriptionsMappers['woo-x']
    const date = new Date()

    const v2Message = { event: 'subscribe', topic: 'PERP_BTC_USDT@orderbookupdate' }
    assert.equal(mapper.canHandle(v2Message, date), true)
    assert.deepEqual(mapper.map(v2Message, date), [{ channel: 'orderbookupdate', symbols: 'PERP_BTC_USDT' }])

    const v3Message = {
      cmd: 'SUBSCRIBE',
      success: true,
      data: ['trade@PERP_BTC_USDT', 'orderbookupdate@PERP_BTC_USDT@50']
    }
    assert.equal(mapper.canHandle(v3Message, date), true)
    assert.deepEqual(mapper.map(v3Message, date), [
      { channel: 'trade', symbols: 'PERP_BTC_USDT' },
      { channel: 'orderbookupdate', symbols: 'PERP_BTC_USDT' }
    ])
  })

  test('maps lighter symbol-scoped subscriptions', () => {
    const mapper = subscriptionsMappers.lighter

    assert.equal(mapper.canHandle({ type: 'subscribe', channel: 'order_book/0' }, new Date()), true)
    assert.deepEqual(mapper.map({ type: 'subscribe', channel: 'order_book/0' }, new Date()), [{ channel: 'order_book', symbols: ['0'] }])
    assert.deepEqual(mapper.map({ type: 'subscribe', channel: 'trade/1' }, new Date()), [{ channel: 'trade', symbols: ['1'] }])
    assert.deepEqual(mapper.map({ type: 'subscribe', channel: 'ticker/2048' }, new Date()), [{ channel: 'ticker', symbols: ['2048'] }])
  })

  test('maps lighter all-market stats subscriptions', () => {
    const mapper = subscriptionsMappers.lighter

    assert.deepEqual(mapper.map({ type: 'subscribe', channel: 'market_stats/all' }, new Date()), [{ channel: 'market_stats', symbols: [] }])
    assert.deepEqual(mapper.map({ type: 'subscribe', channel: 'spot_market_stats/all' }, new Date()), [
      { channel: 'spot_market_stats', symbols: [] }
    ])
  })

  test('maps bullish market data subscriptions', () => {
    const mapper = subscriptionsMappers.bullish
    const date = new Date()

    assert.equal(
      mapper.canHandle(
        {
          jsonrpc: '2.0',
          type: 'command',
          method: 'subscribe',
          params: { topic: 'l2Orderbook', symbol: 'BTCUSDC' }
        },
        date
      ),
      true
    )
    assert.deepEqual(mapper.map({ method: 'subscribe', params: { topic: 'l2Orderbook', symbol: 'BTCUSDC' } }, date), [
      { channel: 'V1TALevel2', symbols: ['BTCUSDC'] }
    ])
    assert.deepEqual(mapper.map({ method: 'subscribe', params: { topic: 'l1Orderbook', symbol: 'BTCUSDC' } }, date), [
      { channel: 'V1TALevel1', symbols: ['BTCUSDC'] }
    ])
    assert.deepEqual(mapper.map({ method: 'subscribe', params: { topic: 'anonymousTrades', symbol: 'BTCUSDC' } }, date), [
      { channel: 'V1TAAnonymousTradeUpdate', symbols: ['BTCUSDC'] }
    ])
    assert.deepEqual(mapper.map({ method: 'subscribe', params: { topic: 'tick', symbol: 'BTC-USDC-PERP' } }, date), [
      { channel: 'V1TATickerResponse', symbols: ['BTC-USDC-PERP'] }
    ])
    assert.deepEqual(mapper.map({ method: 'subscribe', params: { topic: 'indexPrice', assetSymbol: 'BTC' } }, date), [
      { channel: 'V1TAIndexPrice', symbols: ['BTC'] }
    ])
  })

  test('maps Polymarket market subscriptions', () => {
    const mapper = subscriptionsMappers.polymarket
    const date = new Date()
    const message = { type: 'market', assets_ids: ['2174101397', '713210352'] }

    assert.equal(mapper.canHandle(message, date), true)
    assert.deepEqual(mapper.map(message, date), [
      { channel: 'book', symbols: ['2174101397', '713210352'] },
      { channel: 'price_change', symbols: ['2174101397', '713210352'] },
      { channel: 'last_trade_price', symbols: ['2174101397', '713210352'] },
      { channel: 'tick_size_change', symbols: ['2174101397', '713210352'] }
    ])
  })

  test('maps Polymarket custom market subscriptions', () => {
    const mapper = subscriptionsMappers.polymarket
    const date = new Date()
    const message = { type: 'market', assets_ids: ['2174101397'], custom_feature_enabled: true }

    assert.deepEqual(mapper.map(message, date), [
      { channel: 'book', symbols: ['2174101397'] },
      { channel: 'price_change', symbols: ['2174101397'] },
      { channel: 'last_trade_price', symbols: ['2174101397'] },
      { channel: 'tick_size_change', symbols: ['2174101397'] },
      { channel: 'best_bid_ask', symbols: ['2174101397'] },
      { channel: 'new_market', symbols: ['2174101397'] },
      { channel: 'market_resolved', symbols: ['2174101397'] }
    ])
  })

  test('maps Polymarket empty asset subscriptions', () => {
    const mapper = subscriptionsMappers.polymarket
    const date = new Date()
    const message = { type: 'market', assets_ids: [], custom_feature_enabled: true }

    assert.deepEqual(mapper.map(message, date), [
      { channel: 'book', symbols: [] },
      { channel: 'price_change', symbols: [] },
      { channel: 'last_trade_price', symbols: [] },
      { channel: 'tick_size_change', symbols: [] },
      { channel: 'best_bid_ask', symbols: [] },
      { channel: 'new_market', symbols: [] },
      { channel: 'market_resolved', symbols: [] }
    ])
  })
})
