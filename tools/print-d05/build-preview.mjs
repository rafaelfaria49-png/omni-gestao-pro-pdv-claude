/** This branch's Vercel build refuses every target except the authorized isolated D05 Preview. */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { d05IsolationErrors } from '../../lib/printing/direct/homologation.mjs'
import { main as build } from '../../scripts/vercel-build.mjs'

export function main({ env = process.env, run = build, log = console.log } = {}) {
  if (d05IsolationErrors(env).length !== 0) { log('D05_ISOLATION_BLOCKED'); return 1 }
  log('D05_ISOLATION_VERIFIED')
  return run({ env, log })
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main())
