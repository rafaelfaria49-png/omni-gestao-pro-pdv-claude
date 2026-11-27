import { readFileSync } from 'node:fs'
import { parse } from 'dotenv'
import { nonproductionDatasource } from '../lib/db/datasource-policy.mjs'

// Match Prisma's ordinary root dotenv fallback without loading those values
// globally. An explicit environment binding keeps precedence.
export function scriptDatasource() {
  let file = {}
  try {
    file = parse(readFileSync(new URL('../.env', import.meta.url)))
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('ISOLATION_ENV_FILE_BLOCKED')
  }
  return nonproductionDatasource({ ...file, ...process.env })
}
