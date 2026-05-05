import { subscriptionsMappers } from '../src/ws/subscriptionsmappers.ts'

describe('subscriptions mappers', () => {
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
})
