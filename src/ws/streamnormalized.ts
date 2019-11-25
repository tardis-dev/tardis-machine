import { IncomingMessage } from 'http'
import stream from 'stream'
import { combine, compute, streamNormalized } from 'tardis-dev'
import url from 'url'
import { promisify } from 'util'
import WebSocket from 'ws'
import { debug } from '../debug'
import {
  constructDataTypeFilter,
  FilterAndStringifyStream,
  getComputables,
  getNormalizers,
  StreamNormalizedRequestOptions
} from '../helpers'

const pipeline = promisify(stream.pipeline)

export async function streamNormalizedWS(ws: WebSocket, req: IncomingMessage) {
  let messages: AsyncIterableIterator<any> | undefined

  try {
    const startTimestamp = new Date().getTime()
    const parsedQuery = url.parse(req.url!, true).query
    const optionsString = parsedQuery['options'] as string
    const streamNormalizedOptions = JSON.parse(optionsString) as StreamNormalizedRequestOptions

    debug('WebSocket /ws-stream-normalized started, options: %o', streamNormalizedOptions)

    const options = Array.isArray(streamNormalizedOptions) ? streamNormalizedOptions : [streamNormalizedOptions]

    const messagesIterables = options.map(option => {
      // let's map from provided options to options and normalizers that needs to be added for dataTypes provided in options
      const messages = streamNormalized(option, ...getNormalizers(option.dataTypes))
      // separately check if any computables are needed for given dataTypes
      const computables = getComputables(option.dataTypes)

      if (computables.length > 0) {
        return compute(messages, ...computables)
      }

      return messages
    })

    const filterByDataType = constructDataTypeFilter(options)
    messages = messagesIterables.length === 1 ? messagesIterables[0] : combine(...messagesIterables)

    // pipe streamed messages through transform stream that filters those if needed and stringifies and then finally trough WebSocket stream
    const webSocketStream = (WebSocket as any).createWebSocketStream(ws, { decodeStrings: false })

    await pipeline(stream.Readable.from(messages), new FilterAndStringifyStream(filterByDataType), webSocketStream)

    const endTimestamp = new Date().getTime()

    debug(
      'WebSocket /ws-stream-normalized finished, options: %o, time: %d seconds',
      streamNormalizedOptions,
      (endTimestamp - startTimestamp) / 1000
    )
  } catch (e) {
    // this will underlying open WS connections
    if (messages !== undefined) {
      messages!.return!()
    }

    ws.close(1011, e.toString())

    debug('WebSocket /ws-stream-normalized  error: %o', e)
    console.error('WebSocket /ws-stream-normalized error:', e)
  }
}
