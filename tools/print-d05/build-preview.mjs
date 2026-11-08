/**
 * The D05 branch (or any build carrying the D05 marker) refuses every target except the authorized isolated D05 Preview.
 * Every other build — main, #327, other previews — is the unchanged project build: this file must never stop Production.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { D05_TARGET, d05IsolationErrors } from '../../lib/printing/direct/homologation.mjs'
import { main as build } from '../../scripts/vercel-build.mjs'

export function main({ env = process.env, run = build, log = console.log } = {}) {
  if (env.VERCEL_GIT_COMMIT_REF !== D05_TARGET.branch && env.OMNI_PRINT_D05_ENVIRONMENT !== '1') return run({ env, log })
  if (d05IsolationErrors(env).length !== 0) { log('D05_ISOLATION_BLOCKED'); return 1 }
  log('D05_ISOLATION_VERIFIED')
  return run({ env, log })
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main())
