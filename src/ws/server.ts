import http from 'node:http'
import WebSocket, { WebSocketServer } from 'ws'

const IDLE_TIMEOUT_MS = 60_000
const HEARTBEAT_INTERVAL_MS = IDLE_TIMEOUT_MS / 2
const MAX_HEADER_BYTES = 20_000
const MAX_PAYLOAD_BYTES = 512 * 1024
const MAX_BACKPRESSURE_BYTES = 5 * 1024 * 1024
const MAX_CLOSE_REASON_BYTES = 123
const EMPTY_BUFFER = Buffer.alloc(0)

export type MachineWebSocket = {
  readonly closed: boolean
  onmessage?: (message: Buffer) => void
  send(message: string | ArrayBuffer | Buffer): boolean
  getBufferedAmount(): number
  drain(timeoutMs?: number): Promise<boolean>
  end(code?: number, reason?: string): void
}

export type MachineWebSocketRoute = (socket: MachineWebSocket, query: string) => void | Promise<void>

export class MachineWebSocketServer {
  private readonly httpServer = http.createServer({ maxHeaderSize: MAX_HEADER_BYTES }, (_, response) => {
    response.writeHead(426).end()
  })
  private readonly server = new WebSocketServer({
    server: this.httpServer,
    // Keep compression off: drain() relies on ws writing frames directly to rawSocket without queuing in Sender.
    perMessageDeflate: false,
    maxPayload: MAX_PAYLOAD_BYTES
  })
  private readonly connections = new Set<MachineWebSocketConnection>()
  private heartbeatTimer: NodeJS.Timeout | undefined

  constructor(private readonly routes: Record<string, MachineWebSocketRoute>) {
    // `ws` re-emits errors from the supplied HTTP server; `listen` reports the same error to its caller.
    this.server.on('error', () => {})
    this.server.on('connection', (webSocket, request) => this.connect(webSocket, request))
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

  private connect(webSocket: WebSocket, request: http.IncomingMessage) {
    const connection = new MachineWebSocketConnection(webSocket, request.socket, () => this.connections.delete(connection))
    this.connections.add(connection)

    let url: URL
    try {
      url = new URL(request.url ?? '/', 'http://localhost')
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
  public onmessage: ((message: Buffer) => void) | undefined
  private receivedHeartbeat = true
  private readonly drainWaiters = new Set<() => void>()

  constructor(
    private readonly socket: WebSocket,
    private readonly rawSocket: http.IncomingMessage['socket'],
    private readonly remove: () => void
  ) {
    socket.on('message', (message) => {
      this.receivedHeartbeat = true
      this.onmessage?.(Buffer.isBuffer(message) ? message : Buffer.from(message as ArrayBuffer))
    })
    socket.on('pong', () => (this.receivedHeartbeat = true))
    // `ws` transitions to CLOSING on protocol/transport errors; wake drain waiters now and finish cleanup in `close`.
    socket.on('error', () => this.resolveDrainWaiters())
    socket.on('close', () => {
      this.resolveDrainWaiters()
      this.remove()
    })
  }

  public get closed() {
    return this.socket.readyState !== WebSocket.OPEN
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

    const bufferedAmount = this.socket.bufferedAmount
    if (bufferedAmount > MAX_BACKPRESSURE_BYTES) {
      this.end(1008, 'Too much backpressure')
      return false
    }

    return bufferedAmount === 0
  }

  public getBufferedAmount() {
    return this.socket.bufferedAmount
  }

  public drain(timeoutMs?: number): Promise<boolean> {
    if (this.closed || !this.rawSocket.writable) return Promise.resolve(false)
    if (this.socket.bufferedAmount === 0) return Promise.resolve(true)

    return new Promise<boolean>((resolve) => {
      let settled = false
      let timer: NodeJS.Timeout | undefined

      const finish = (drained: boolean) => {
        if (settled) return
        settled = true
        if (timer !== undefined) clearTimeout(timer)
        this.drainWaiters.delete(onClosed)
        resolve(drained)
      }

      const onClosed = () => finish(false)
      this.drainWaiters.add(onClosed)
      if (timeoutMs !== undefined) timer = setTimeout(() => finish(false), timeoutMs)

      // A zero-byte write emits nothing on the wire and completes once all earlier queued writes flush.
      this.rawSocket.write(EMPTY_BUFFER, (error) => {
        if (settled) return
        if (error != null) this.terminate()
        finish(error == null && !this.closed)
      })
    })
  }

  public end(code = 1000, reason = '') {
    if (this.socket.readyState !== WebSocket.OPEN) return

    try {
      this.socket.close(code, truncateCloseReason(reason))
    } catch {
      this.terminate()
    }
    this.resolveDrainWaiters()
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

  private resolveDrainWaiters() {
    for (const waiter of this.drainWaiters) waiter()
  }
}

function truncateCloseReason(reason: string) {
  const encodedReason = Buffer.from(reason)
  if (encodedReason.length <= MAX_CLOSE_REASON_BYTES) return reason

  // Leave room for the UTF-8 replacement character if truncation splits a code point.
  return encodedReason.subarray(0, MAX_CLOSE_REASON_BYTES - 3).toString()
}
