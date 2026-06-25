import { subscriptionsMappers } from '../src/ws/subscriptionsmappers.ts'

describe('subscriptions mappers', () => {
  test('maps Hyperliquid fast book subscriptions', () => {
    const mapper = subscriptionsMappers.hyperliquid
    const date = new Date()

    expect(mapper.map({ method: 'subscribe', subscription: { type: 'l2Book', coin: 'BTC' } }, date)).toEqual([
      { channel: 'l2Book', symbols: ['BTC'] }
    ])
    expect(mapper.map({ method: 'subscribe', subscription: { type: 'l2Book', coin: 'BTC', fast: true } }, date)).toEqual([
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

    expect(mapper.canHandle(message, date)).toBe(true)
    expect(mapper.map(message, date)).toEqual([
      { channel: 'spot@public.aggre.deals.v3.api.pb@10ms', symbols: ['BTCUSDT'] },
      { channel: 'spot@public.aggre.depth.v3.api.pb@10ms', symbols: ['ETHUSDT'] }
    ])
  })

  test('maps MEXC futures subscriptions', () => {
    const mapper = subscriptionsMappers['mexc-futures']
    const date = new Date()

    expect(mapper.canHandle({ method: 'sub.depth', param: { symbol: 'BTC_USDT' }, gzip: false }, date)).toBe(true)
    expect(mapper.map({ method: 'sub.depth', param: { symbol: 'BTC_USDT' }, gzip: false }, date)).toEqual([
      { channel: 'push.depth', symbols: ['BTC_USDT'] }
    ])
    expect(mapper.map({ method: 'sub.contract' }, date)).toEqual([{ channel: 'push.contract', symbols: [] }])
  })

  test('maps lighter symbol-scoped subscriptions', () => {
    const mapper = subscriptionsMappers.lighter

    expect(mapper.canHandle({ type: 'subscribe', channel: 'order_book/0' }, new Date())).toBe(true)
    expect(mapper.map({ type: 'subscribe', channel: 'order_book/0' }, new Date())).toEqual([{ channel: 'order_book', symbols: ['0'] }])
    expect(mapper.map({ type: 'subscribe', channel: 'trade/1' }, new Date())).toEqual([{ channel: 'trade', symbols: ['1'] }])
    expect(mapper.map({ type: 'subscribe', channel: 'ticker/2048' }, new Date())).toEqual([{ channel: 'ticker', symbols: ['2048'] }])
  })

  test('maps lighter all-market stats subscriptions', () => {
    const mapper = subscriptionsMappers.lighter

    expect(mapper.map({ type: 'subscribe', channel: 'market_stats/all' }, new Date())).toEqual([{ channel: 'market_stats', symbols: [] }])
    expect(mapper.map({ type: 'subscribe', channel: 'spot_market_stats/all' }, new Date())).toEqual([
      { channel: 'spot_market_stats', symbols: [] }
    ])
  })

  test('maps bullish market data subscriptions', () => {
    const mapper = subscriptionsMappers.bullish
    const date = new Date()

    expect(
      mapper.canHandle(
        {
          jsonrpc: '2.0',
          type: 'command',
          method: 'subscribe',
          params: { topic: 'l2Orderbook', symbol: 'BTCUSDC' }
        },
        date
      )
    ).toBe(true)
    expect(mapper.map({ method: 'subscribe', params: { topic: 'l2Orderbook', symbol: 'BTCUSDC' } }, date)).toEqual([
      { channel: 'V1TALevel2', symbols: ['BTCUSDC'] }
    ])
    expect(mapper.map({ method: 'subscribe', params: { topic: 'l1Orderbook', symbol: 'BTCUSDC' } }, date)).toEqual([
      { channel: 'V1TALevel1', symbols: ['BTCUSDC'] }
    ])
    expect(mapper.map({ method: 'subscribe', params: { topic: 'anonymousTrades', symbol: 'BTCUSDC' } }, date)).toEqual([
      { channel: 'V1TAAnonymousTradeUpdate', symbols: ['BTCUSDC'] }
    ])
    expect(mapper.map({ method: 'subscribe', params: { topic: 'tick', symbol: 'BTC-USDC-PERP' } }, date)).toEqual([
      { channel: 'V1TATickerResponse', symbols: ['BTC-USDC-PERP'] }
    ])
    expect(mapper.map({ method: 'subscribe', params: { topic: 'indexPrice', assetSymbol: 'BTC' } }, date)).toEqual([
      { channel: 'V1TAIndexPrice', symbols: ['BTC'] }
    ])
  })

  test('maps Polymarket market subscriptions', () => {
    const mapper = subscriptionsMappers.polymarket
    const date = new Date()
    const message = { type: 'market', assets_ids: ['2174101397', '713210352'] }

    expect(mapper.canHandle(message, date)).toBe(true)
    expect(mapper.map(message, date)).toEqual([
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

    expect(mapper.map(message, date)).toEqual([
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

    expect(mapper.map(message, date)).toEqual([
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
