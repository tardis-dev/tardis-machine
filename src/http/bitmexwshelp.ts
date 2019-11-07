import { IncomingMessage, ServerResponse } from 'http'

// based on https://www.bitmex.com/api/v1/schema/websocketHelp
const bitmexWSHelpResponse = JSON.stringify({
  info: 'See https://www.bitmex.com/app/wsAPI and https://www.bitmex.com/explorer for more documentation.',
  usage: 'Send a message in the format: {"op": string, "args": Array<string>}',
  ops: ['authKey', 'authKeyExpires', 'cancelAllAfter', 'subscribe', 'unsubscribe'],
  subscribe: 'To subscribe, send: {"op": "subscribe", "args": [subscriptionTopic, ...]}.',
  subscriptionSubjects: {
    authenticationRequired: [],
    public: [
      'announcement',
      'connected',
      'chat',
      'publicNotifications',
      'instrument',
      'settlement',
      'funding',
      'insurance',
      'liquidation',
      'orderBookL2',
      'orderBookL2_25',
      'quote',
      'trade',
      'quoteBin1m',
      'quoteBin5m',
      'quoteBin1h',
      'quoteBin1d',
      'tradeBin1m',
      'tradeBin5m',
      'tradeBin1h',
      'tradeBin1d'
    ]
  }
})

export const bitmexWsHelp = async (_: IncomingMessage, res: ServerResponse) => {
  res.setHeader('Content-Type', 'application/json')
  res.end(bitmexWSHelpResponse)
}
