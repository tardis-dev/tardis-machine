import net from 'node:net'
import { describe, test } from 'node:test'
import WebSocket from 'ws'
import { MachineWebSocketServer, type MachineWebSocket } from '../dist/ws/server.js'
import { assert } from './assertions.ts'

async function getFreePort() {
  const server = net.createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, () => {
      server.removeListener('error', reject)
      resolve()
    })
  })
  const { port } = server.address() as net.AddressInfo
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  return port
}

function waitForStart(ws: MachineWebSocket) {
  return new Promise<void>((resolve) => {
    ws.onmessage = () => {
      ws.onmessage = undefined
      resolve()
    }
  })
}

/**
 * Sends chunks until `ws.drain()` stays parked for `parkMs` ms, proving both the
 * server send buffer and the paused client's kernel TCP receive window are full,
 * then returns the actual boolean resolved by that parked `drain()` call.
 */
async function saturateUntilParked(ws: MachineWebSocket, payload: Buffer, parkMs: number, onParked: () => void) {
  while (!ws.closed) {
    if (!ws.send(payload)) {
      let didPark = false
      const parkedTimer = setTimeout(() => {
        didPark = true
        onParked()
      }, parkMs)
      const drained = await ws.drain()
      clearTimeout(parkedTimer)
      if (didPark) return { parked: true, drained }
      if (!drained) return { parked: false, drained }
    }
  }
  return { parked: false, drained: false }
}

describe('WebSocket backpressure', () => {
  test('pauses on TCP backpressure and delivers all messages in order once the client resumes', { timeout: 15_000 }, async () => {
    const port = await getFreePort()
    const chunk = 'x'.repeat(64 * 1024)
    const totalMessages = 320 // 20 MiB > Linux/macOS loopback TCP send + receive buffers
    let backpressureWaits = 0
    let sentCount = 0
    let sentCountBeforeResume = 0

    const parked = Promise.withResolvers<void>()
    let signaledParked = false

    const server = new MachineWebSocketServer({
      '/stream': async (ws) => {
        await waitForStart(ws)

        try {
          for (let i = 0; i < totalMessages; i++) {
            if (ws.closed) return
            const payload = Buffer.from(`${i}:${chunk}`)
            if (!ws.send(payload)) {
              backpressureWaits++
              const parkedTimer = signaledParked
                ? undefined
                : setTimeout(() => {
                    signaledParked = true
                    parked.resolve()
                  }, 40)
              const drained = await ws.drain()
              if (parkedTimer !== undefined) clearTimeout(parkedTimer)
              if (!drained) return
            }
            sentCount++
          }
          await ws.drain()
          ws.end(1000, 'done')
        } finally {
          parked.resolve()
        }
      }
    })

    await server.listen(port)

    try {
      const receivedIndices: number[] = []
      const closed = await new Promise<{ code: number; reason: string }>((resolve, reject) => {
        const client = new WebSocket(`ws://localhost:${port}/stream`)
        client.once('error', reject)
        client.once('open', async () => {
          client.pause()
          client.send('start')
          await parked.promise
          sentCountBeforeResume = sentCount
          client.resume()
        })
        client.on('message', (data) => {
          const text = data.toString()
          const index = Number(text.slice(0, text.indexOf(':')))
          receivedIndices.push(index)
        })
        client.once('close', (code, reason) => {
          resolve({ code, reason: reason.toString() })
        })
      })

      assert.ok(backpressureWaits > 0, 'expected send() to observe real TCP backpressure')
      assert.ok(
        sentCountBeforeResume < totalMessages,
        `expected producer to block while client was paused, but sent ${sentCountBeforeResume}/${totalMessages}`
      )
      assert.equal(closed.code, 1000)
      assert.equal(closed.reason, 'done')
      assert.equal(receivedIndices.length, totalMessages)
      for (let i = 0; i < totalMessages; i++) {
        assert.equal(receivedIndices[i], i)
      }
    } finally {
      await server.close()
    }
  })

  test('unblocks drain promptly when the client disconnects abruptly mid-backpressure', { timeout: 15_000 }, async () => {
    const port = await getFreePort()
    const payload = Buffer.alloc(64 * 1024, 0x61)

    const parked = Promise.withResolvers<void>()
    const routeDone = Promise.withResolvers<{ parked: boolean; drained: boolean; closed: boolean }>()

    const server = new MachineWebSocketServer({
      '/disconnect': async (ws) => {
        await waitForStart(ws)
        const result = await saturateUntilParked(ws, payload, 40, () => parked.resolve())
        routeDone.resolve({ ...result, closed: ws.closed })
      }
    })

    await server.listen(port)

    try {
      const client = new WebSocket(`ws://localhost:${port}/disconnect`)
      client.on('error', () => {})
      await new Promise<void>((resolve, reject) => {
        client.once('open', () => {
          client.pause()
          client.send('start')
          resolve()
        })
        client.once('error', reject)
      })

      await parked.promise
      const terminatedAt = Date.now()
      client.terminate()

      const result = await routeDone.promise
      const unblockLatencyMs = Date.now() - terminatedAt
      assert.equal(result.parked, true)
      assert.equal(result.drained, false)
      assert.equal(result.closed, true)
      assert.ok(unblockLatencyMs < 2000, `drain took too long after disconnect: ${unblockLatencyMs}ms`)
    } finally {
      await server.close()
    }
  })

  test('unblocks drain immediately when the server closes a backpressured socket with end()', { timeout: 15_000 }, async () => {
    const port = await getFreePort()
    const payload = Buffer.alloc(64 * 1024, 0x64)

    let serverSocket: MachineWebSocket | undefined
    const parked = Promise.withResolvers<void>()
    const routeDone = Promise.withResolvers<{ parked: boolean; drained: boolean; closed: boolean }>()

    const server = new MachineWebSocketServer({
      '/server-end': async (ws) => {
        serverSocket = ws
        await waitForStart(ws)
        const result = await saturateUntilParked(ws, payload, 40, () => parked.resolve())
        routeDone.resolve({ ...result, closed: ws.closed })
      }
    })

    await server.listen(port)

    try {
      const client = new WebSocket(`ws://localhost:${port}/server-end`)
      const closed = new Promise<{ code: number; reason: string }>((resolve, reject) => {
        client.once('error', reject)
        client.on('message', () => {})
        client.once('close', (code, reason) => {
          resolve({ code, reason: reason.toString() })
        })
      })

      await new Promise<void>((resolve, reject) => {
        client.once('open', () => {
          client.pause()
          client.send('start')
          resolve()
        })
        client.once('error', reject)
      })

      await parked.promise
      const endedAt = Date.now()
      serverSocket!.end(1000, 'server-closed')
      const result = await routeDone.promise
      const unblockLatencyMs = Date.now() - endedAt
      client.resume()

      assert.equal(result.parked, true)
      assert.equal(result.drained, false)
      assert.equal(result.closed, true)
      assert.ok(unblockLatencyMs < 1000, `end() did not unblock drain immediately: ${unblockLatencyMs}ms`)

      const closeResult = await closed
      assert.equal(closeResult.code, 1000)
      assert.equal(closeResult.reason, 'server-closed')
    } finally {
      await server.close()
    }
  })

  test('times out drain(timeoutMs) on a stalled client without closing prematurely', { timeout: 15_000 }, async () => {
    const port = await getFreePort()
    const payload = Buffer.alloc(64 * 1024, 0x62)

    let timedOutWhileOpen = false
    const timedOut = Promise.withResolvers<void>()

    const server = new MachineWebSocketServer({
      '/timeout': async (ws) => {
        await waitForStart(ws)

        while (!ws.closed) {
          if (!ws.send(payload)) {
            const drained = await ws.drain(60)
            if (ws.closed) return
            if (!drained) {
              timedOutWhileOpen = true
              ws.end(1008, 'Too much backpressure')
              timedOut.resolve()
              return
            }
          }
        }
      }
    })

    await server.listen(port)

    try {
      const closed = await new Promise<{ code: number; reason: string }>((resolve, reject) => {
        const client = new WebSocket(`ws://localhost:${port}/timeout`)
        client.once('error', reject)
        client.once('open', async () => {
          client.pause()
          client.send('start')
          await timedOut.promise
          client.resume()
        })
        client.on('message', () => {})
        client.once('close', (code, reason) => {
          resolve({ code, reason: reason.toString() })
        })
      })

      assert.equal(timedOutWhileOpen, true)
      assert.equal(closed.code, 1008)
      assert.equal(closed.reason, 'Too much backpressure')
    } finally {
      await server.close()
    }
  })

  test('closes with 1008 when bufferedAmount exceeds MAX_BACKPRESSURE_BYTES', { timeout: 15_000 }, async () => {
    const port = await getFreePort()
    const payload = Buffer.alloc(512 * 1024, 0x63)
    const maxChunks = 64 // 32 MiB ceiling so a regression fails fast instead of spinning forever

    let routeResult: { sendReturned: boolean; closed: boolean; drained: boolean } | undefined
    const closedByServer = Promise.withResolvers<void>()

    const server = new MachineWebSocketServer({
      '/oversized': async (ws) => {
        await waitForStart(ws)

        // Send without awaiting drain so bufferedAmount is guaranteed to exceed MAX_BACKPRESSURE_BYTES (5 MiB)
        // regardless of OS loopback kernel buffer sizes.
        let sendReturned = true
        for (let i = 0; i < maxChunks && !ws.closed; i++) {
          sendReturned = ws.send(payload)
        }
        const closed = ws.closed
        const drained = closed ? await ws.drain() : true
        routeResult = { sendReturned, closed, drained }
        if (!closed) ws.end(1000, 'unexpected-open')
        closedByServer.resolve()
      }
    })

    await server.listen(port)

    try {
      const closed = await new Promise<{ code: number; reason: string }>((resolve, reject) => {
        const client = new WebSocket(`ws://localhost:${port}/oversized`)
        client.once('error', reject)
        client.once('open', async () => {
          client.pause()
          client.send('start')
          await closedByServer.promise
          client.resume()
        })
        client.on('message', () => {})
        client.once('close', (code, reason) => {
          resolve({ code, reason: reason.toString() })
        })
      })

      assert.deepEqual(routeResult, { sendReturned: false, closed: true, drained: false })
      assert.equal(closed.code, 1008)
      assert.equal(closed.reason, 'Too much backpressure')
    } finally {
      await server.close()
    }
  })
})
