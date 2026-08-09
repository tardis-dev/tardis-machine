import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }

test('prints the package version without starting the server', () => {
  const result = spawnSync(process.execPath, ['bin/tardis-machine.js', '--version'], { encoding: 'utf8' })

  expect(result.status).toBe(0)
  expect(result.stdout.trim()).toBe(packageJson.version)
})

test('prints native CLI help', () => {
  const result = spawnSync(process.execPath, ['bin/tardis-machine.js', '--help'], { encoding: 'utf8' })

  expect(result.status).toBe(0)
  expect(result.stdout).toContain('Usage: tardis-machine [options]')
  expect(result.stdout).toContain('--cache-dir <path>')
  expect(result.stdout).toContain('TM_API_KEY')
})

test('rejects unknown options and invalid ports', () => {
  const unknown = spawnSync(process.execPath, ['bin/tardis-machine.js', '--unknown'], { encoding: 'utf8' })
  const invalidPort = spawnSync(process.execPath, ['bin/tardis-machine.js', '--port=70000'], { encoding: 'utf8' })

  expect(unknown.status).toBe(1)
  expect(unknown.stderr).toContain('Unknown option')
  expect(invalidPort.status).toBe(1)
  expect(invalidPort.stderr).toContain('Invalid HTTP port')
})
