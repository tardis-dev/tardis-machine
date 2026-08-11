import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { assert } from './assertions.ts'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }

test('prints the package version without starting the server', () => {
  const result = spawnSync(process.execPath, ['bin/tardis-machine.js', '--version'], { encoding: 'utf8' })

  assert.equal(result.status, 0)
  assert.equal(result.stdout.trim(), packageJson.version)
})

test('prints native CLI help', () => {
  const result = spawnSync(process.execPath, ['bin/tardis-machine.js', '--help'], { encoding: 'utf8' })

  assert.equal(result.status, 0)
  assert.match(result.stdout, /Usage: tardis-machine \[options\]/)
  assert.match(result.stdout, /--cache-dir <path>/)
  assert.match(result.stdout, /TM_API_KEY/)
})

test('rejects unknown options and invalid ports', () => {
  const unknown = spawnSync(process.execPath, ['bin/tardis-machine.js', '--unknown'], { encoding: 'utf8' })
  const invalidPort = spawnSync(process.execPath, ['bin/tardis-machine.js', '--port=70000'], { encoding: 'utf8' })

  assert.equal(unknown.status, 1)
  assert.match(unknown.stderr, /Unknown option/)
  assert.equal(invalidPort.status, 1)
  assert.match(invalidPort.stderr, /Invalid HTTP port/)
})
