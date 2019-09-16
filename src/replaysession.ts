import { ParsedUrlQuery } from 'querystring'
import dbg from 'debug'
import WebSocket from 'ws'
import { TardisClient, Exchange, ReplayOptions } from 'tardis-client'
import { subscriptionsMappers, SubscriptionMapper } from './mappers'

const debug = dbg('tardis-machine')

const wait = (delayMS: number) => new Promise(resolve => setTimeout(resolve, delayMS))

export class ReplaySession {
  private readonly _connections: WebsocketConnection[] = []
  private _hasStarted: boolean = false

  constructor() {
    const SESSION_START_DELAY_MS = 5000

    debug('creating new ReplaySession')

    setTimeout(async () => {
      try {
        await this._start()
      } catch (e) {
        debug('received error in ReplaySession, %o', e)
        await this._closeAllConnections(e)
      }
      // always run onCloseCallback
      this._onCloseCallback()
    }, SESSION_START_DELAY_MS)
  }

  public addToSession(websocketConnection: WebsocketConnection) {
    if (this._hasStarted) {
      throw new Error('Replay session already started')
    }

    this._connections.push(websocketConnection)
    debug('added new connection to ReplaySession, %s', websocketConnection)
  }

  public get hasStarted() {
    return this._hasStarted
  }

  private _onCloseCallback: () => void = () => {}

  private async _start() {
    debug('starting ReplaySession, %s', this._connections.join(', '))
    this._hasStarted = true

    this._connections.forEach(c => c.startReplayingDataFeed())

    if (this._connections.length == 1) {
      // if there is only single WS connection for given replay session
      // simply send all it's requested data feed via that connection
      debug('started ReplaySession with single connection, %s', this._connections.map(c => c.toString()))
      await this._connections[0].sendAll()
    } else {
      debug('started ReplaySession with %d connections, %s', this._connections.length, this._connections.map(c => c.toString()))
      // in case there are multiple active websocket connections for given ReplaySession (same requested date range)
      // synchronize sending messages so first connection is primary one
      // and we send one message for it first and then let remaining connections to 'catch up' to it (based on it's local timestamp)
      // it's not strict synchronization as we're not in control of TCP buffering, slow client etc, but rough approximation that will
      // handle issues like one slow one fast replaying feed for different connections/exchanges eg:
      // subscribe to many messages of coinbase that will take time to replay
      // and only to trades on binance that will be very fast to replay

      let lastProcessedTimestamp
      const primaryConnection = this._connections[0]

      while ((lastProcessedTimestamp = await primaryConnection.sendNext())) {
        // little optimization for case when there are only 2 connections
        if (this._connections.length == 2) {
          await this._connections[1].sendUntil(lastProcessedTimestamp)
        } else {
          let sendUntilPromises = []
          for (let i = 1; i < this._connections.length; i++) {
            sendUntilPromises.push(this._connections[i].sendUntil(lastProcessedTimestamp))
          }
          await Promise.all(sendUntilPromises)
        }
      }
    }

    await this._closeAllConnections()
    debug('finished ReplaySession with %d connections, %s', this._connections.length, this._connections.map(c => c.toString()))
  }

  private async _closeAllConnections(error: Error | undefined = undefined) {
    for (let i = 0; i < this._connections.length; i++) {
      const connection = this._connections[i]

      // let's wait until buffer is empty before closing normal connections
      while (!error && connection.bufferedAmount > 0) {
        await wait(100)
      }

      connection.close(error)
    }
  }

  public onClose(onCloseCallback: () => void) {
    this._onCloseCallback = onCloseCallback
  }
}

export class WebsocketConnection {
  private readonly _replayOptions: ReplayOptions<any>
  private readonly _subscriptionsMapper: SubscriptionMapper
  private _subscriptionsCount = 0
  private _startedReplayingDataFeed = false
  private _sendMessageAsyncIterator?: AsyncIterableIterator<number>
  private _socketError?: Error

  constructor(private readonly _websocket: WebSocket, private readonly _tardisClient: TardisClient, queryString: ParsedUrlQuery) {
    const exchange = queryString['exchange'] as Exchange
    this._replayOptions = {
      exchange,
      from: queryString['from'] as string,
      to: queryString['to'] as string,
      filters: []
    }
    if (!subscriptionsMappers[exchange]) {
      throw new Error(`Exchange ${exchange} is not supported via Websocket API, please use HTTP streaming API instead.`)
    }

    this._subscriptionsMapper = subscriptionsMappers[exchange]!
    this._websocket.on('message', this._convertSubscribeRequestToFilter.bind(this))

    this._websocket.on('error', e => {
      this._socketError = e
    })
  }

  public get bufferedAmount() {
    return this._websocket.bufferedAmount
  }

  public close(error: Error | undefined = undefined) {
    if (this._websocket.readyState == this._websocket.CLOSED) {
      debug('Websocket connection closed already %s', this)
      return
    }
    if (error) {
      this._websocket.close(1011, error.toString())
    } else {
      this._websocket.close(1000, 'WS replay finished')
    }

    debug('Closed websocket connection %s, %o', this, error)
  }

  public startReplayingDataFeed() {
    if (this._subscriptionsCount === 0) {
      throw new Error(
        `No subscriptions received for websocket connection, exchange ${this._replayOptions.exchange}, from ${this._replayOptions.from}, to ${this._replayOptions.to}`
      )
    }

    this._checkConnection()

    this._startedReplayingDataFeed = true

    this._sendMessageAsyncIterator = this._sendDataFeedIterable()
  }

  public async sendUntil(untilTimestamp: number) {
    let result = await this._sendMessageAsyncIterator!.next()
    // this will actually send one message with date larger than 'until'
    // and then stop, but should be fine for now
    while (!result.done && result.value <= untilTimestamp) {
      result = await this._sendMessageAsyncIterator!.next()
    }
  }

  public async sendNext() {
    const result = await this._sendMessageAsyncIterator!.next()
    if (result.done) {
      return
    }

    return result.value
  }

  public async sendAll() {
    // optimized sendAll method that tries to send  all data feed messages as fast as possible without synchronization etc
    const dataFeedMessages = this._tardisClient.replayRaw(this._replayOptions)
    let buffered: Buffer[] = []

    for await (let { message } of dataFeedMessages) {
      buffered.push(message)
      if (buffered.length == 10) {
        await this._sendBatch(buffered)
        buffered = []
      }
    }

    if (buffered.length > 0) {
      await this._sendBatch(buffered)
    }
  }

  public toString() {
    return `${JSON.stringify(this._replayOptions)}`
  }

  private async _sendBatch(batch: Buffer[]) {
    this._checkConnection()
    await this._waitForEmptyBuffer()

    for (let i = 0; i < batch.length; i++) {
      this._websocket.send(batch[i], {
        binary: false
      })
    }
  }

  private async _waitForEmptyBuffer() {
    // wait until  buffer is empty
    // sometimes slow clients can't keep up with messages arrival rate so we need to throttle
    // https://nodejs.org/api/net.html#net_socket_buffersize
    while (this.bufferedAmount > 0) {
      await wait(30)
    }
  }

  private _checkConnection() {
    if (this._websocket.readyState != this._websocket.OPEN) {
      throw new Error(`Trying to send via closed WS connection ${this}`)
    }

    if (this._socketError) {
      throw this._socketError
    }
  }
  private async *_sendDataFeedIterable() {
    const dataFeedMessages = this._tardisClient.replayRaw(this._replayOptions)

    for await (let { message, localTimestamp } of dataFeedMessages) {
      this._checkConnection()
      await this._waitForEmptyBuffer()

      this._websocket.send(message, {
        binary: false
      })

      yield Date.parse(localTimestamp as any)
    }
  }

  private _convertSubscribeRequestToFilter(message: string) {
    try {
      const messageDeserialized = JSON.parse(message)

      if (this._subscriptionsMapper.canHandle(messageDeserialized) && !this._startedReplayingDataFeed) {
        // if there is a subscribe message let's map it to filters and add those to replay options
        const filters = this._subscriptionsMapper.map(messageDeserialized)
        debug('Received subscribe websocket message: %s, mapped filters: %o', message, filters)
        this._replayOptions.filters!.push(...filters)
        this._subscriptionsCount++
      } else {
        debug('Ignored websocket message %s', message)
      }
    } catch (e) {
      console.error('_convertSubscribeRequestToFilter Error', e)
      debug('Ignored websocket message %s, error %o', message, e)
    }
  }
}
