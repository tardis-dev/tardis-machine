import { Exchange, Filter } from 'tardis-dev'

// https://www.bitmex.com/app/wsAPI
const bitmexMapper: SubscriptionMapper = {
  canHandle: (message: any) => {
    return message.op === 'subscribe'
  },

  map: (message: any) => {
    const args = typeof message.args === 'string' ? [message.args] : message.args

    return args.map((arg: string) => {
      const channelSymbols = arg.split(':')
      if (channelSymbols.length == 1) {
        return {
          channel: channelSymbols[0]
        }
      }
      return {
        channel: channelSymbols[0],
        symbols: [channelSymbols[1]]
      }
    })
  }
}

// https://docs.pro.coinbase.com/#protocol-overview
const coinbaseMaper: SubscriptionMapper = {
  canHandle: (message: any) => {
    return message.type === 'subscribe'
  },

  map: (message: any) => {
    const topLevelSymbols = message.product_ids
    const finalChannels: Filter<any>[] = []

    const channelMappings = {
      full: ['received', 'open', 'done', 'match', 'change'],
      level2: ['snapshot', 'l2update'],
      matches: ['match', 'last_match'],
      ticker: ['ticker']
    }

    message.channels.forEach((channel: any) => {
      const channelName = typeof channel == 'string' ? channel : channel.name
      const symbols = typeof channel == 'string' ? topLevelSymbols : channel.product_ids
      const mappedChannels = (channelMappings as any)[channelName]

      mappedChannels.forEach((channel: string) => {
        finalChannels.push({
          channel,
          symbols
        })
      })
    })

    return finalChannels
  }
}

// https://docs.deribit.com/v2/#subscription-management
const deribitMapper: SubscriptionMapper = {
  canHandle: (message: any) => {
    return message.method === 'public/subscribe'
  },

  map: (message: any) => {
    return message.params.channels.map((channel: string) => {
      const lastSeparator = channel.lastIndexOf('.')
      const firstSeparator = channel.indexOf('.')

      return {
        channel: channel.slice(0, firstSeparator),
        // handle both
        // "deribit_price_ranking.btc_usd" and "book.ETH-PERPETUAL.100.1.100ms" cases
        // we need to extract channel name and symbols out of such strings
        symbols: [channel.slice(firstSeparator + 1, lastSeparator == firstSeparator ? undefined : lastSeparator)]
      }
    })
  }
}

// https://www.cryptofacilities.com/resources/hc/en-us/sections/360000120914-Websocket-API-Public
const cryptofacilitiesMapper: SubscriptionMapper = {
  canHandle: (message: any) => {
    return message.event == 'subscribe'
  },

  map: (message: any) => {
    return [
      {
        channel: message.feed,
        symbols: message.product_ids
      }
    ]
  }
}

// https://www.bitstamp.net/websocket/v2/
const bitstampMapper: SubscriptionMapper = {
  canHandle: (message: any) => {
    return message.event == 'bts:subscribe'
  },

  map: (message: any) => {
    const separator = message.data.channel.lastIndexOf('_')
    return [
      {
        channel: message.data.channel.slice(0, separator),
        symbols: [message.data.channel.slice(separator + 1)]
      }
    ]
  }
}

// https://www.okex.com/docs/en/#spot_ws-sub
const okexMapper: SubscriptionMapper = {
  canHandle: (message: any) => {
    return message.op == 'subscribe'
  },

  map: (message: any) => {
    return message.args.map((arg: string) => {
      const separator = arg.indexOf(':')
      return {
        channel: arg.slice(0, separator),
        symbols: [arg.slice(separator + 1)]
      }
    })
  }
}
// https://docs.ftx.com/#request-format
const ftxMapper: SubscriptionMapper = {
  canHandle: (message: any) => {
    return message.op === 'subscribe'
  },

  map: (message: any) => {
    return [
      {
        channel: message.channel,
        symbols: [message.market]
      }
    ]
  }
}

// https://www.kraken.com/features/websocket-api#message-subscribe
const krakenMapper: SubscriptionMapper = {
  canHandle: (message: any) => {
    return message.event === 'subscribe'
  },

  map: (message: any) => {
    return [
      {
        channel: message.subscription.name,
        symbols: message.pair
      }
    ]
  }
}
// https://lightning.bitflyer.com/docs?lang=en#json-rpc-2.0-over-websocket
const bitflyerMapper: SubscriptionMapper = {
  canHandle: (message: any) => {
    return message.method === 'subscribe'
  },

  map: (message: any) => {
    const availableChannels = ['lightning_board_snapshot', 'lightning_board', 'lightning_ticker', 'lightning_executions']
    const inputChannel = message.params.channel as string
    const channel = availableChannels.find((c) => inputChannel.startsWith(c))!
    const symbol = inputChannel.slice(channel.length + 1)

    return [
      {
        channel,
        symbols: [symbol]
      }
    ]
  }
}

// https://docs.gemini.com/websocket-api/#market-data-version-2
const geminiMapper: SubscriptionMapper = {
  canHandle: (message: any) => {
    return message.type === 'subscribe'
  },

  map: (message: any) => {
    const finalChannels: Filter<any>[] = []

    const channelMappings = {
      l2: ['trade', 'l2_updates', 'auction_open', 'auction_indicative', 'auction_result']
    }

    message.subscriptions.forEach((sub: any) => {
      const matchingChannels = (channelMappings as any)[sub.name]

      matchingChannels.forEach((channel: string) => {
        finalChannels.push({
          channel,
          symbols: sub.symbols
        })
      })
    })

    return finalChannels
  }
}

// https://binance-docs.github.io/apidocs/futures/en/#live-subscribing-unsubscribing-to-streams
const binanceMapper: SubscriptionMapper = {
  canHandle: (message: any) => {
    return message.method === 'SUBSCRIBE'
  },

  map: (message: any) => {
    return (message.params as string[]).map((param) => {
      const lastSeparator = param.lastIndexOf('@')
      const firstSeparator = param.indexOf('@')

      return {
        channel: param.slice(firstSeparator + 1, lastSeparator == firstSeparator ? undefined : lastSeparator),
        symbols: [param.slice(0, firstSeparator)]
      }
    })
  }
}

// https://docs.binance.org/api-reference/dex-api/ws-connection.html
const binanceDEXMapper: SubscriptionMapper = {
  canHandle: (message: any) => {
    return message.method === 'subscribe'
  },

  map: (message: any) => {
    return [
      {
        channel: message.topic,
        symbols: message.symbols
      }
    ]
  }
}

// https://huobiapi.github.io/docs/spot/v1/en/#websocket-market-data
const huobiMapper: SubscriptionMapper = {
  canHandle: (message: any) => {
    return message.sub !== undefined
  },

  map: (message: any) => {
    const pieces = message.sub.split('.')
    return [
      {
        channel: pieces[1],
        symbols: [pieces[2]]
      }
    ]
  }
}

// https://github.com/bybit-exchange/bybit-official-api-docs/blob/master/en/websocket.md
const bybitMapper: SubscriptionMapper = {
  canHandle: (message: any) => {
    return message.op === 'subscribe'
  },

  map: (message: any) => {
    return (message.args as string[]).map((arg) => {
      const pieces = arg.split('.')

      return {
        channel: pieces[0],
        symbols: [pieces[pieces.length - 1]]
      }
    })
  }
}

// https://api.hitbtc.com/#subscribe-to-trades
const hitBtcMapper: SubscriptionMapper = {
  canHandle: (message: any) => {
    return message.method !== undefined
  },

  map: (message: any) => {
    const channelMappings = {
      subscribeTrades: ['snapshotTrades', 'updateTrades'],
      subscribeOrderbook: ['snapshotOrderbook', 'updateOrderbook']
    } as any

    return channelMappings[message.method].map((channel: string) => {
      return {
        channel,
        symbols: [message.params.symbol]
      }
    })
  }
}

const bitfinexMapper: SubscriptionMapper = {
  canHandle: () => true,
  map: () => []
}

const coinflexMapper: SubscriptionMapper = {
  canHandle: (message: any) => {
    return message.op === 'subscribe'
  },

  map: (message: any) => {
    return message.args.map((arg: string) => {
      const split = arg.split(':')
      return {
        channel: split[0],
        symbols: [split[1]]
      }
    })
  }
}

const phemexMapper: SubscriptionMapper = {
  canHandle: (message: any) => {
    return message.method !== undefined
  },

  map: (message: any) => {
    const channelsMapping = {
      'orderbook.subscribe': 'book',
      'trade.subscribe': 'trades',
      'market24h.subscribe': 'market24h'
    } as any

    return [
      {
        channel: channelsMapping[message.method],
        symbols: message.params
      }
    ]
  }
}

const deltaMapper: SubscriptionMapper = {
  canHandle: (message: any) => {
    return message.type === 'subscribe'
  },

  map: (message: any) => {
    return message.payload.channels.map((channel: any) => {
      return {
        channel: channel.name,
        symbols:
          channel.symbols !== undefined && channel.name === 'mark_price' ? channel.symbols.map((s: any) => `MARK:${s}`) : channel.symbols
      }
    })
  }
}

const gateIOMapper: SubscriptionMapper = {
  canHandle: (message: any) => {
    return message.method !== undefined && message.method.endsWith('.subscribe')
  },

  map: (message: any) => {
    return [
      {
        channel: message.method.split('.')[0],
        symbols: message.params.map((s: any) => {
          if (typeof s === 'string') {
            return s
          }
          return s[0] as string
        })
      }
    ]
  }
}

const gateIOFuturesMapper: SubscriptionMapper = {
  canHandle: (message: any) => {
    return message.event === 'subscribe'
  },

  map: (message: any) => {
    return [
      {
        channel: message.channel.split('.')[1],
        symbols: message.payload.map((s: any) => {
          if (typeof s === 'string') {
            return s
          }
          return s[0] as string
        })
      }
    ]
  }
}

const poloniexMapper: SubscriptionMapper = {
  canHandle: (message: any) => {
    return message.command === 'subscribe'
  },

  map: (message: any) => {
    return [
      {
        channel: 'price_aggregated_book',
        symbols: [message.channel]
      }
    ]
  }
}

const ascendexMapper: SubscriptionMapper = {
  canHandle: (message: any) => {
    return message.op === 'sub' || message.op === 'req'
  },

  map: (message: any) => {
    const channel = message.action || message.ch.split(':')[0]
    const symbol = (message.args && message.args.symbol) || message.ch.split(':')[1]
    return [
      {
        channel,
        symbols: symbol ? [symbol] : []
      }
    ]
  }
}

const dydxMapper: SubscriptionMapper = {
  canHandle: (message: any) => {
    return message.type === 'subscribe'
  },

  map: (message: any) => {
    return [
      {
        channel: message.channel,
        symbols: message.id ? [message.id] : []
      }
    ]
  }
}

const upbitMapper: SubscriptionMapper = {
  canHandle: (message: any) => {
    return Array.isArray(message)
  },

  map: (message: any) => {
    return message
      .filter((m: any) => {
        return m.type !== undefined
      })
      .map((m: any) => {
        return {
          channel: m.type,
          symbols: m.codes
        }
      })
  }
}

const serumMaper: SubscriptionMapper = {
  canHandle: (message: any) => {
    return message.op === 'subscribe'
  },

  map: (message: any) => {
    const finalChannels: Filter<any>[] = []

    const channelMappings = {
      trades: ['recent_trades', 'trade'],
      level1: ['quote'],
      level2: ['l2snapshot', 'l2update'],
      level3: ['l3snapshot', 'open', 'fill', 'change', 'done']
    }

    const symbols = message.markets
    const mappedChannels = (channelMappings as any)[message.channel]

    mappedChannels.forEach((channel: string) => {
      finalChannels.push({
        channel,
        symbols
      })
    })

    return finalChannels
  }
}

export const subscriptionsMappers: { [key in Exchange]: SubscriptionMapper } = {
  bitmex: bitmexMapper,
  coinbase: coinbaseMaper,
  deribit: deribitMapper,
  cryptofacilities: cryptofacilitiesMapper,
  bitstamp: bitstampMapper,
  okex: okexMapper,
  'okex-futures': okexMapper,
  'okex-swap': okexMapper,
  'okex-options': okexMapper,
  ftx: ftxMapper,
  'ftx-us': ftxMapper,
  kraken: krakenMapper,
  bitflyer: bitflyerMapper,
  gemini: geminiMapper,
  binance: binanceMapper,
  'binance-futures': binanceMapper,
  'binance-delivery': binanceMapper,
  'binance-jersey': binanceMapper,
  'binance-us': binanceMapper,
  'binance-dex': binanceDEXMapper,
  huobi: huobiMapper,
  'huobi-dm': huobiMapper,
  'huobi-dm-swap': huobiMapper,
  'huobi-dm-linear-swap': huobiMapper,
  bybit: bybitMapper,
  bitfinex: bitfinexMapper,
  'bitfinex-derivatives': bitfinexMapper,
  okcoin: okexMapper,
  hitbtc: hitBtcMapper,
  coinflex: coinflexMapper,
  phemex: phemexMapper,
  delta: deltaMapper,
  'gate-io': gateIOMapper,
  'gate-io-futures': gateIOFuturesMapper,
  poloniex: poloniexMapper,
  ascendex: ascendexMapper,
  dydx: dydxMapper,
  'huobi-dm-options': huobiMapper,
  'binance-options': binanceMapper,
  upbit: upbitMapper,
  serum: serumMaper
}

export type SubscriptionMapper = {
  canHandle: (message: object) => boolean
  map: (message: object) => Filter<string>[]
}
