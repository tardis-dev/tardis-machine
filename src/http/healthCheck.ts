import { IncomingMessage, ServerResponse } from 'http'
const BYTES_IN_MB = 1024 * 1024

export const healthCheck = (_: IncomingMessage, res: ServerResponse) => {
  res.setHeader('Content-Type', 'application/json')

  try {
    const memUsage = process.memoryUsage()

    const message = {
      status: 'Healthy',
      uptimeHours: Number((process.uptime() / (60 * 60)).toFixed(2)),
      timestampMs: Date.now(),
      memoryInfo: {
        rssMB: Number((memUsage.rss / BYTES_IN_MB).toFixed(1)),
        heapTotalMB: Number((memUsage.heapTotal / BYTES_IN_MB).toFixed(1)),
        heapUsedMB: Number((memUsage.heapUsed / BYTES_IN_MB).toFixed(1)),
        externalMB: Number((memUsage.external / BYTES_IN_MB).toFixed(1))
      }
    }

    res.end(JSON.stringify(message))
  } catch {
    if (!res.finished) {
      res.statusCode = 500

      res.end(
        JSON.stringify({
          message: 'Unhealthy'
        })
      )
    }
  }
}
