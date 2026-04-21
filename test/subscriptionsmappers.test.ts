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
})
