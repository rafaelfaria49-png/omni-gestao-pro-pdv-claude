import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { localMigrationDatasource } from '../lib/db/datasource-policy.mjs'

const cwd = fileURLToPath(new URL('../', import.meta.url))
const envFile = fileURLToPath(new URL('../.env', import.meta.url))
const prisma = fileURLToPath(new URL('../node_modules/prisma/build/index.js', import.meta.url))
const pushFlags = new Set(['--accept-data-loss', '--force-reset', '--skip-generate'])
const migrateFlags = new Set(['--create-only', '--skip-generate', '--skip-seed'])

function argumentsFor(argv) {
  const migrate = argv[0] === 'migrate-dev'
  const flags = migrate ? argv.slice(1) : argv
  for (let index = 0; index < flags.length; index++) {
    const flag = flags[index]
    if (migrate && flag === '--name' && /^[\w-]{1,80}$/.test(flags[index + 1] ?? '')) {
      index++
      continue
    }
    if (!(migrate ? migrateFlags : pushFlags).has(flag)) throw new Error('ISOLATION_CLI_ARGUMENT_BLOCKED')
  }
  return [...(migrate ? ['migrate', 'dev'] : ['db', 'push']), ...flags]
}

try {
  const args = argumentsFor(process.argv.slice(2))
  if (existsSync(envFile)) process.loadEnvFile(envFile)
  const databaseUrl = localMigrationDatasource()
  const result = spawnSync(process.execPath, [prisma, ...args, '--schema', 'prisma/schema.prisma'], {
    cwd,
    // Supply both validated variables explicitly so Prisma's dotenv discovery
    // cannot select a different target after the preflight.
    env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: process.env.DIRECT_URL ?? databaseUrl },
    stdio: 'inherit',
  })
  process.exitCode = result.status ?? 1
} catch (error) {
  console.error(error.name === 'DatasourcePolicyError' ? error.message : 'ISOLATION_CLI_BLOCKED')
  process.exitCode = 1
}
