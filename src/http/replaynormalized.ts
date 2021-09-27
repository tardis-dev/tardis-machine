import { once } from 'events'
import { IncomingMessage, OutgoingMessage, ServerResponse } from 'http'
import { combine, compute, replayNormalized } from 'tardis-dev'
import url from 'url'
import { debug } from '../debug'
import { constructDataTypeFilter, getComputables, getNormalizers, ReplayNormalizedRequestOptions } from '../helpers'

export const replayNormalizedHttp = async (req: IncomingMessage, res: ServerResponse) => {
  try {
    const startTimestamp = new Date().getTime()
    const parsedQuery = url.parse(req.url!, true).query
    const optionsString = parsedQuery['options'] as string
    const replayNormalizedOptions = JSON.parse(optionsString) as ReplayNormalizedRequestOptions

    debug('GET /replay-normalized request started, options: %o', replayNormalizedOptions)

    const streamedMessagesCount = await writeMessagesToResponse(res, replayNormalizedOptions)
    const endTimestamp = new Date().getTime()

    debug(
      'GET /replay-normalized request finished, options: %o, time: %d seconds, total messages count: %d',
      replayNormalizedOptions,
      (endTimestamp - startTimestamp) / 1000,
      streamedMessagesCount
    )
  } catch (e: any) {
    const errorInfo = {
      responseText: e.responseText,
      message: e.message,
      url: e.url
    }

    debug('GET /replay-normalized request error: %o', e)
    console.error('GET /replay-normalized request error:', e)

    if (!res.finished) {
      res.statusCode = e.status || 500
      res.end(JSON.stringify(errorInfo))
    }
  }
}

async function writeMessagesToResponse(res: OutgoingMessage, options: ReplayNormalizedRequestOptions) {
  const BATCH_SIZE = 32

  res.setHeader('Content-Type', 'application/json')

  let buffers: string[] = []
  let totalMessagesCount = 0

  const replayNormalizedOptions = Array.isArray(options) ? options : [options]

  const messagesIterables = replayNormalizedOptions.map((option) => {
    // let's map from provided options to options and normalizers that needs to be added for dataTypes provided in options
    const messages = replayNormalized(option, ...getNormalizers(option.dataTypes))
    // separately check if any computables are needed for given dataTypes
    const computables = getComputables(option.dataTypes)

    if (computables.length > 0) {
      return compute(messages, ...computables)
    }

    return messages
  })

  const filterByDataType = constructDataTypeFilter(replayNormalizedOptions)

  const messages = messagesIterables.length === 1 ? messagesIterables[0] : combine(...messagesIterables)

  for await (const message of messages) {
    // filter out messages not explicitly requested via options.dataTypes
    // eg.: return only book_snapshots when someone asked only for those
    // as by default also book_changes are returned as well
    if (filterByDataType(message) === false) {
      continue
    }

    totalMessagesCount++

    buffers.push(JSON.stringify(message))

    if (buffers.length === BATCH_SIZE) {
      const ok = res.write(`${buffers.join('\n')}\n`)
      buffers = []

      if (!ok) {
        await once(res, 'drain')
      }
    }
  }

  if (buffers.length > 0) {
    res.write(`${buffers.join('\n')}\n`)
    buffers = []
  }

  res.end('')

  return totalMessagesCount
}
