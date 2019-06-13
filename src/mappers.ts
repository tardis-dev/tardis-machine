import { Filter, Exchange } from 'tardis-client'

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

    return message.channels.map((channel: any) => {
      if (typeof channel == 'string') {
        return {
          channel,
          symbols: topLevelSymbols
        }
      }
      return {
        channel: channel.name,
        symbols: channel.product_ids
      }
    })
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

export const subscriptionsMappers: { [key in Exchange]?: SubscriptionMapper } = {
  bitmex: bitmexMapper,
  coinbase: coinbaseMaper,
  deribit: deribitMapper,
  cryptofacilities: cryptofacilitiesMapper,
  bitstamp: bitstampMapper,
  okex: okexMapper
}

export type SubscriptionMapper = {
  canHandle: (message: object) => boolean
  map: (message: object) => Filter<any>[]
}
