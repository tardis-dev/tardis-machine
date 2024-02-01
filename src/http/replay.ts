import { once } from 'events'
import { IncomingMessage, OutgoingMessage, ServerResponse } from 'http'
import { replay, ReplayOptions } from 'tardis-dev'
import url from 'url'
import { debug } from '../debug'

export const replayHttp = async (req: IncomingMessage, res: ServerResponse) => {
  try {
    const startTimestamp = new Date().getTime()
    const parsedQuery = url.parse(req.url!, true).query
    const optionsString = parsedQuery['options'] as string
    const replayOptions = JSON.parse(optionsString) as ReplayOptions<any, any, any>

    debug('GET /replay request started, options: %o', replayOptions)

    const streamedMessagesCount = await writeMessagesToResponse(res, replayOptions)
    const endTimestamp = new Date().getTime()

    debug(
      'GET /replay request finished, options: %o, time: %d seconds, total messages count:%d',
      replayOptions,
      (endTimestamp - startTimestamp) / 1000,
      streamedMessagesCount
    )
  } catch (e: any) {
    const errorInfo = {
      responseText: e.responseText,
      message: e.message,
      url: e.url
    }

    debug('GET /replay request error: %o', e)
    console.error('GET /replay request error:', e)

    if (!res.finished) {
      res.statusCode = e.status || 500
      res.end(JSON.stringify(errorInfo))
    }
  }
}

async function writeMessagesToResponse(res: OutgoingMessage, replayOptions: ReplayOptions<any, any, any>) {
  const responsePrefixBuffer = Buffer.from('{"localTimestamp":"')
  const responseMiddleBuffer = Buffer.from('","message":')
  const responseSuffixBuffer = Buffer.from('}\n')
  const newLineBuffer = Buffer.from('\n')
  const BATCH_SIZE = 32

  // not 100% sure that's necessary since we're returning ndjson in fact, not json
  res.setHeader('Content-Type', 'application/x-json-stream')

  let buffers: Buffer[] = []
  let totalMessagesCount = 0

  const messages = replay({ ...replayOptions, skipDecoding: true })

  for await (let messageWithTimestamp of messages) {
    totalMessagesCount++

    if (messageWithTimestamp === undefined) {
      // if received message is undefined  (disconnect)
      // return it as new line
      buffers.push(newLineBuffer)
    } else {
      // instead of writing each message directly to response,
      // let's batch them and send in BATCH_SIZE  batches (each message is 5 buffers: prefix etc)
      // also instead of converting messages to string or parsing them let's manually stich together desired json response using buffers which is faster
      buffers.push(
        responsePrefixBuffer,
        messageWithTimestamp.localTimestamp,
        responseMiddleBuffer,
        messageWithTimestamp.message,
        responseSuffixBuffer
      )

      if (buffers.length >= BATCH_SIZE * 5) {
        const ok = res.write(Buffer.concat(buffers))
        buffers = []

        if (!ok) {
          await once(res, 'drain')
        }
      }
    }
  }

  if (buffers.length > 0) {
    res.write(Buffer.concat(buffers))
    buffers = []
  }

  res.end('')

  return totalMessagesCount
}
