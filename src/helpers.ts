import {
  ComputableFactory,
  computeBookSnapshots,
  computeTradeBars,
  Disconnect,
  MapperFactory,
  normalizeBookChanges,
  NormalizedData,
  normalizeDerivativeTickers,
  normalizeLiquidations,
  normalizeTrades,
  normalizeOptionsSummary,
  ReplayNormalizedOptions,
  StreamNormalizedOptions
} from 'tardis-dev'

export type WithDataType = {
  dataTypes: string[]
}

export type ReplayNormalizedOptionsWithDataType = ReplayNormalizedOptions<any, any> & WithDataType

export type ReplayNormalizedRequestOptions = ReplayNormalizedOptionsWithDataType | ReplayNormalizedOptionsWithDataType[]

export type StreamNormalizedOptionsWithDataType = StreamNormalizedOptions<any, any> & WithDataType

export type StreamNormalizedRequestOptions = StreamNormalizedOptionsWithDataType | StreamNormalizedOptionsWithDataType[]

export function* getNormalizers(dataTypes: string[]): IterableIterator<MapperFactory<any, any>> {
  if (dataTypes.includes('trade') || dataTypes.some((dataType) => dataType.startsWith('trade_bar_'))) {
    yield normalizeTrades
  }
  if (
    dataTypes.includes('book_change') ||
    dataTypes.some((dataType) => dataType.startsWith('book_snapshot_')) ||
    dataTypes.some((dataType) => dataType.startsWith('quote'))
  ) {
    yield normalizeBookChanges
  }

  if (dataTypes.includes('derivative_ticker')) {
    yield normalizeDerivativeTickers
  }

  if (dataTypes.includes('liquidation')) {
    yield normalizeLiquidations
  }
  if (dataTypes.includes('option_summary')) {
    yield normalizeOptionsSummary
  }
}

function getRequestedDataTypes(options: ReplayNormalizedOptionsWithDataType | StreamNormalizedOptionsWithDataType) {
  return options.dataTypes.map((dataType) => {
    if (dataType.startsWith('trade_bar_')) {
      return 'trade_bar'
    }
    if (dataType.startsWith('book_snapshot_')) {
      return 'book_snapshot'
    }

    if (dataType.startsWith('quote')) {
      return 'book_snapshot'
    }

    return dataType
  })
}

export function constructDataTypeFilter(options: (ReplayNormalizedOptionsWithDataType | StreamNormalizedOptionsWithDataType)[]) {
  const requestedDataTypesPerExchange = options.reduce((prev, current) => {
    if (prev[current.exchange] !== undefined) {
      prev[current.exchange] = [...prev[current.exchange], ...getRequestedDataTypes(current)]
    } else {
      prev[current.exchange] = getRequestedDataTypes(current)
    }

    return prev
  }, {} as any)

  return (message: NormalizedData | Disconnect) => {
    if (message.type === 'disconnect') {
      return true
    }

    return requestedDataTypesPerExchange[message.exchange].includes(message.type)
  }
}

const tradeBarSuffixToKindMap = {
  ticks: {
    kind: 'tick',
    multiplier: 1
  },
  ms: {
    kind: 'time',
    multiplier: 1
  },
  s: {
    kind: 'time',
    multiplier: 1000
  },
  m: {
    kind: 'time',
    multiplier: 60 * 1000
  },

  vol: {
    kind: 'volume',
    multiplier: 1
  }
} as const

const bookSnapshotsToIntervalMultiplierMap = {
  ms: {
    multiplier: 1
  },
  s: {
    multiplier: 1000
  },
  m: {
    multiplier: 60 * 1000
  }
} as const

const getKeys = <T extends {}>(o: T): Array<keyof T> => <Array<keyof T>>Object.keys(o)

export function getComputables(dataTypes: string[]): ComputableFactory<any>[] {
  const computables = []

  for (const dataType of dataTypes) {
    if (dataType.startsWith('trade_bar')) {
      computables.push(parseAsTradeBarComputable(dataType))
    }

    if (dataType.startsWith('book_snapshot')) {
      computables.push(parseAsBookSnapshotComputable(dataType))
    }

    if (dataType.startsWith('quote')) {
      computables.push(parseAsQuoteComputable(dataType))
    }
  }

  return computables
}

function parseAsTradeBarComputable(dataType: string) {
  for (const suffix of getKeys(tradeBarSuffixToKindMap)) {
    if (dataType.endsWith(suffix) === false) {
      continue
    }

    const intervalString = dataType.replace('trade_bar_', '').replace(suffix, '')
    const interval = Number(intervalString)
    if (interval === NaN) {
      throw new Error(`invalid interval: ${intervalString}, data type: ${dataType}`)
    }

    return computeTradeBars({
      interval: tradeBarSuffixToKindMap[suffix].multiplier * interval,
      kind: tradeBarSuffixToKindMap[suffix].kind,
      name: dataType
    })
  }

  throw new Error(`invalid data type: ${dataType}`)
}

function parseAsBookSnapshotComputable(dataType: string) {
  for (const suffix of getKeys(bookSnapshotsToIntervalMultiplierMap)) {
    if (dataType.endsWith(suffix) === false) {
      continue
    }

    const parts = dataType.split('_')

    const depthString = parts[2]
    const depth = Number(parts[2])
    if (depth === NaN) {
      throw new Error(`invalid depth: ${depthString}, data type: ${dataType}`)
    }
    const intervalString = parts[parts.length - 1].replace(suffix, '')

    const interval = Number(intervalString)
    if (interval === NaN) {
      throw new Error(`invalid interval: ${intervalString}, data type: ${dataType}`)
    }

    const isGrouped = parts.length === 5

    let grouping
    if (isGrouped) {
      const groupingString = parts[3].replace('grouped', '')

      grouping = Number(groupingString)
      if (grouping === NaN) {
        throw new Error(`invalid interval: ${groupingString}, data type: ${dataType}`)
      }
    }

    return computeBookSnapshots({
      interval: bookSnapshotsToIntervalMultiplierMap[suffix].multiplier * interval,
      grouping,
      depth,
      name: dataType
    })
  }

  throw new Error(`invalid data type: ${dataType}`)
}

function parseAsQuoteComputable(dataType: string) {
  if (dataType === 'quote') {
    return computeBookSnapshots({
      interval: 0,
      depth: 1,
      name: dataType
    })
  }

  for (const suffix of getKeys(bookSnapshotsToIntervalMultiplierMap)) {
    if (dataType.endsWith(suffix) === false) {
      continue
    }
    const intervalString = dataType.replace('quote_', '').replace(suffix, '')
    const interval = Number(intervalString)
    if (interval === NaN) {
      throw new Error(`invalid interval: ${intervalString}, data type: ${dataType}`)
    }

    return computeBookSnapshots({
      interval: bookSnapshotsToIntervalMultiplierMap[suffix].multiplier * interval,
      depth: 1,
      name: dataType
    })
  }

  throw new Error(`invalid data type: ${dataType}`)
}

export const wait = (delayMS: number) => new Promise((resolve) => setTimeout(resolve, delayMS))
