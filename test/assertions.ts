import assert from 'node:assert/strict'
import path from 'node:path'
import { snapshot as snapshotConfiguration, type TestContext } from 'node:test'

export { assert }

snapshotConfiguration.setDefaultSnapshotSerializers([serializeSnapshot])

snapshotConfiguration.setResolveSnapshotPath((testFilePath) => {
  if (testFilePath === undefined) {
    throw new Error('Cannot resolve snapshot path without a test file path')
  }

  const testName = path.basename(testFilePath, '.ts')
  return path.join(process.cwd(), 'test', '__snapshots__', `${testName}.ts.snap`)
})

export function snapshot(context: TestContext, value: unknown) {
  context.assert.snapshot(value)
}

function serializeSnapshot(value: unknown) {
  if (typeof value === 'string') {
    return `"${value}"`
  }

  if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) {
    return `[\n${value.map((entry) => `  "${entry}",`).join('\n')}\n]`
  }

  return JSON.stringify(value, undefined, 2)
}
