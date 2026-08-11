import http from 'node:http'
import WebSocket, { WebSocketServer } from 'ws'

const IDLE_TIMEOUT_MS = 60_000
const HEARTBEAT_INTERVAL_MS = IDLE_TIMEOUT_MS / 2
const MAX_HEADER_BYTES = 20_000
const MAX_PAYLOAD_BYTES = 512 * 1024
const MAX_BACKPRESSURE_BYTES = 5 * 1024 * 1024
const MAX_CLOSE_REASON_BYTES = 123

export type MachineWebSocket = {
  closed: boolean
  onmessage?: (message: Buffer) => void
  send(message: string | ArrayBuffer | Buffer): boolean
  getBufferedAmount(): number
  end(code?: number, reason?: string): void
}

export type MachineWebSocketRoute = (socket: MachineWebSocket, query: string) => void | Promise<void>

export class MachineWebSocketServer {
  private readonly httpServer = http.createServer({ maxHeaderSize: MAX_HEADER_BYTES }, (_, response) => {
    response.writeHead(426).end()
  })
  private readonly server = new WebSocketServer({
    server: this.httpServer,
    perMessageDeflate: false,
    maxPayload: MAX_PAYLOAD_BYTES
  })
  private readonly connections = new Set<MachineWebSocketConnection>()
  private heartbeatTimer: NodeJS.Timeout | undefined

  constructor(private readonly routes: Record<string, MachineWebSocketRoute>) {
    // `ws` re-emits errors from the supplied HTTP server; `listen` reports the same error to its caller.
    this.server.on('error', () => {})
    this.server.on('connection', (webSocket, request) => this.connect(webSocket, request.url))
  }

  public async listen(port: number) {
    await new Promise<void>((resolve, reject) => {
      this.httpServer.once('error', reject)
      this.httpServer.listen(port, () => {
        this.httpServer.removeListener('error', reject)
        resolve()
      })
    })

    this.heartbeatTimer = setInterval(() => {
      for (const connection of this.connections) connection.checkHeartbeat()
    }, HEARTBEAT_INTERVAL_MS)
  }

  public async close() {
    if (this.heartbeatTimer !== undefined) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = undefined
    }
    for (const connection of this.connections) connection.terminate()

    await Promise.all([
      new Promise<void>((resolve, reject) => {
        this.server.close((error) => (error === undefined ? resolve() : reject(error)))
      }),
      new Promise<void>((resolve, reject) => {
        this.httpServer.close((error) => (error === undefined ? resolve() : reject(error)))
      })
    ])
  }

  private connect(webSocket: WebSocket, requestUrl: string | undefined) {
    const connection = new MachineWebSocketConnection(webSocket, () => this.connections.delete(connection))
    this.connections.add(connection)

    let url: URL
    try {
      url = new URL(requestUrl ?? '/', 'http://localhost')
    } catch {
      connection.end(1008)
      return
    }

    const route = this.routes[url.pathname.toLowerCase()]
    if (route === undefined) {
      connection.end(1008)
      return
    }

    try {
      const result = route(connection, url.search.slice(1))
      if (result !== undefined) void result.catch((error) => connection.end(1011, String(error)))
    } catch (error) {
      connection.end(1011, String(error))
    }
  }
}

class MachineWebSocketConnection implements MachineWebSocket {
  public closed = false
  public onmessage: ((message: Buffer) => void) | undefined
  private receivedHeartbeat = true

  constructor(
    private readonly socket: WebSocket,
    private readonly remove: () => void
  ) {
    socket.on('message', (message) => {
      this.receivedHeartbeat = true
      this.onmessage?.(Buffer.isBuffer(message) ? message : Buffer.from(message as ArrayBuffer))
    })
    socket.on('pong', () => (this.receivedHeartbeat = true))
    // `ws` closes the connection after protocol and transport errors; cleanup happens in `close`.
    socket.on('error', () => {})
    socket.on('close', () => {
      this.closed = true
      this.remove()
    })
  }

  public send(message: string | ArrayBuffer | Buffer) {
    if (this.socket.readyState !== WebSocket.OPEN) return false

    try {
      // uWebSockets.js sent replay payload buffers as text frames by default.
      this.socket.send(message, { binary: false, compress: false })
    } catch {
      this.terminate()
      return false
    }

    if (this.socket.bufferedAmount > MAX_BACKPRESSURE_BYTES) {
      this.end(1008, 'Too much backpressure')
      return false
    }

    return this.socket.bufferedAmount === 0
  }

  public getBufferedAmount() {
    return this.socket.bufferedAmount
  }

  public end(code = 1000, reason = '') {
    if (this.socket.readyState !== WebSocket.OPEN) return

    try {
      this.socket.close(code, truncateCloseReason(reason))
    } catch {
      this.terminate()
    }
  }

  public checkHeartbeat() {
    if (!this.receivedHeartbeat) {
      this.terminate()
      return
    }

    this.receivedHeartbeat = false
    if (this.socket.readyState === WebSocket.OPEN) this.socket.ping()
  }

  public terminate() {
    if (this.socket.readyState !== WebSocket.CLOSED) this.socket.terminate()
  }
}

function truncateCloseReason(reason: string) {
  const encodedReason = Buffer.from(reason)
  if (encodedReason.length <= MAX_CLOSE_REASON_BYTES) return reason

  // Leave room for the UTF-8 replacement character if truncation splits a code point.
  return encodedReason.subarray(0, MAX_CLOSE_REASON_BYTES - 3).toString()
}
