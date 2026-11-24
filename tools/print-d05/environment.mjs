/** Narrow D05 operator CLI. Reuses the approved D02 tool; never accepts an arbitrary database URL or SQL. */
import { spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { rootCertificates } from 'node:tls'
import { D05_TARGET, d05IsolationErrors } from '../../lib/printing/direct/homologation.mjs'
import { privatePathOutsideRepository } from './private-path.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const powershell = path.join(process.env.SystemRoot || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe')
export function privateEnvironment(privateRoot) {
  const resolved = privatePathOutsideRepository(privateRoot, root)
  const r = spawnSync(powershell, ['-NoProfile', '-NonInteractive', '-File', path.join(root, 'tools/print-d05/private-state.ps1'), '-Mode', 'Read', '-PrivateRoot', resolved, '-InternalPipe'], { encoding: 'utf8', windowsHide: true, timeout: 30000 })
  if (r.status !== 0 || r.error) throw new Error('PRIVATE_STATE_UNAVAILABLE')
  const values = JSON.parse(r.stdout)
  const errors = d05IsolationErrors({ ...values, VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_TARGET_ENV: 'preview', VERCEL_PROJECT_ID: D05_TARGET.projectId, VERCEL_GIT_COMMIT_REF: D05_TARGET.branch })
  if (errors.length || values.OMNI_PRINT_CONTENT_KEY === values.OMNI_PRINT_SIGNING_KEY) throw new Error('PRIVATE_STATE_TARGET_REFUSED')
  return values
}

export function savePrivateEnvironment(privateRoot, values) {
  const resolved = privatePathOutsideRepository(privateRoot, root)
  const errors = d05IsolationErrors({ ...values, VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_TARGET_ENV: 'preview', VERCEL_PROJECT_ID: D05_TARGET.projectId, VERCEL_GIT_COMMIT_REF: D05_TARGET.branch })
  if (errors.length) throw new Error('PRIVATE_STATE_TARGET_REFUSED')
  const r = spawnSync(powershell, ['-NoProfile', '-NonInteractive', '-File', path.join(root, 'tools/print-d05/private-state.ps1'), '-Mode', 'Update', '-PrivateRoot', resolved, '-InternalPipe'], { input: JSON.stringify(values), encoding: 'utf8', windowsHide: true, timeout: 30000 })
  if (r.status !== 0 || r.error) throw new Error('PRIVATE_STATE_UPDATE_FAILED')
}

export function sanitized(text, values) {
  let output = String(text ?? '')
  const secrets = Object.entries(values).filter(([k, v]) => /URL|KEY|SECRET|PASSWORD|TOKEN|PIN/.test(k) && typeof v === 'string' && v.length > 5).map(([, v]) => v)
  for (const raw of Object.entries(values).filter(([k, v]) => k.endsWith('URL') && typeof v === 'string').map(([, v]) => v)) {
    try { const u = new URL(raw); secrets.push(decodeURIComponent(u.password), u.password) } catch { /* already rejected */ }
  }
  for (const secret of secrets.sort((a, b) => b.length - a.length)) if (secret) output = output.split(secret).join('[REDACTED]')
  return output.replace(/\r\n/g, '\n')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [operation, privateRoot] = process.argv.slice(2)
    if (!['baseline', 'd02-apply', 'd02-register', 'd02-verify', 'retention-prepare', 'verify-private'].includes(operation) || !privateRoot) throw new Error('D05_OPERATION_REQUIRED')
    const values = privateEnvironment(privateRoot), u = new URL(values.DIRECT_URL)
    if (operation === 'verify-private') { console.log('D05_PRIVATE_TARGET_VERIFIED'); process.exit(0) }
    // libpq and Prisma use different TLS parameters. Both must validate the server certificate.
    const certificate = path.join(privatePathOutsideRepository(privateRoot, root), 'trusted-ca.pem')
    writeFileSync(certificate, rootCertificates.join('\n') + '\n')
    const libpq = new URL(values.DIRECT_URL)
    libpq.searchParams.delete('sslaccept'); libpq.searchParams.set('sslmode', 'verify-full')
    const out = path.join(root, 'docs/print-004c-e2e/evidence/d05/authorized-environment', new Date().toISOString().replaceAll(/[:.]/g, '-'))
    mkdirSync(out, { recursive: true })
    const env = { ...process.env, ...values, PATH: path.dirname(process.execPath) + path.delimiter + process.env.PATH, D02_DATABASE_URL: libpq.toString(),
      VERCEL: '0', VERCEL_ENV: 'development', PGPASSWORD: decodeURIComponent(u.password), PGSSLMODE: 'verify-full', PGSSLROOTCERT: certificate, PGCONNECT_TIMEOUT: '30', PGCHANNELBINDING: 'require', PGAPPNAME: 'omni-print-d05-setup' }
    delete env.PGOPTIONS
    const summary = { operation, at: new Date().toISOString(), projectId: 'super-credit-72834107', branchId: 'br-billowing-cake-b627zsxv', database: D05_TARGET.database, source: 'NEW_EMPTY_TEST_PROJECT', productionAccess: false, physicalHomologation: 'PENDING', steps: [] }
    function run(name, command, args, options = {}) {
      const r = spawnSync(command, args, { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20, windowsHide: true, timeout: 300000, env, ...options })
      const log = sanitized((r.stdout ?? '') + (r.stderr ?? ''), values) + `\nexit=${r.status}\n`
      writeFileSync(path.join(out, name + '.log'), log)
      summary.steps.push({ step: name, exit: r.status, status: r.status === 0 && !r.error ? 'PASS' : 'FAIL', sha256: createHash('sha256').update(log).digest('hex') })
      writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2) + '\n')
      if (r.status !== 0 || r.error) throw new Error('D05_STEP_FAILED_' + name)
      return r.stdout
    }
    const psql = path.join(process.env.PG_BIN || 'C:/Program Files/PostgreSQL/17/bin', 'psql.exe')
    const pg = ['-h', D05_TARGET.host, '-p', '5432', '-U', D05_TARGET.role, '-d', D05_TARGET.database, '-w', '-X', '-v', 'ON_ERROR_STOP=1']
    const d02 = (name, args) => run(name, process.execPath, ['tools/print-d02/d02.mjs', ...args, '--expect-host', D05_TARGET.host, '--expect-db', D05_TARGET.database])
    if (operation === 'baseline') {
      const identity = run('empty-target', psql, [...pg, '-At', '-F', '|', '-c', "SELECT current_database(),current_user,pg_is_in_recovery(),(SELECT count(*) FROM pg_tables WHERE schemaname='public')"])
      if (identity.trim() !== `${D05_TARGET.database}|${D05_TARGET.role}|f|0`) throw new Error('EMPTY_D05_DATABASE_REQUIRED')
      const bootstrap = path.join(path.resolve(privateRoot), 'bootstrap'); mkdirSync(bootstrap, { recursive: true })
      const source = spawnSync('git', ['show', '37acc3b7e71d20dcbe623e6a2f87347e54f49ee6:prisma/schema.prisma'], { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 64 << 20 })
      if (source.status !== 0) throw new Error('VERSIONED_BASELINE_UNAVAILABLE')
      const schema = path.join(bootstrap, 'schema.prisma'), sql = path.join(bootstrap, 'baseline.sql')
      writeFileSync(schema, source.stdout)
      const generated = run('generate-baseline', process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', schema, '--script'])
      writeFileSync(sql, generated)
      run('apply-baseline', psql, [...pg, '-1', '-f', sql])
      run('d02-generator', process.execPath, ['tools/print-d02/generate.mjs', '--check'])
      d02('d02-baseline-status', ['status'])
    } else if (operation === 'd02-apply') {
      d02('status-before', ['status']); d02('indexes', ['apply-indexes']); d02('core', ['apply-core', '--attempts', '3', '--spacing-s', '60']); d02('verify', ['verify'])
    } else if (operation === 'd02-register') {
      const mirror = path.join(path.resolve(privateRoot), 'migration-mirror'); mkdirSync(mirror, { recursive: true })
      const schema = path.join(mirror, 'schema.prisma'); writeFileSync(schema, readFileSync(path.join(root, 'prisma/schema.prisma')))
      d02('mirror-only', ['promote', '--migrations-dir', path.join(mirror, 'migrations')])
      d02('register', ['resolve', '--schema', schema]); d02('verify-prisma', ['verify', '--prisma'])
    } else if (operation === 'retention-prepare') {
      const name = 'omni_print_retention'
      const exists = run('retention-role-exists', psql, [...pg, '-At', '-c', `SELECT count(*) FROM pg_roles WHERE rolname='${name}'`]).trim() === '1'
      if (exists && !values.OMNI_PRINT_RETENTION_DATABASE_URL) throw new Error('D05_EXISTING_RETENTION_ROLE_REQUIRES_REVIEW')
      if (!exists) {
        const password = randomBytes(32).toString('hex'), url = new URL(values.DIRECT_URL)
        url.username = name; url.password = password; values.OMNI_PRINT_RETENTION_DATABASE_URL = url.toString()
        savePrivateEnvironment(privateRoot, values)
        run('retention-create-role', psql, [...pg, '-q'], { input: `CREATE ROLE ${name} LOGIN PASSWORD '${password}' NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT CONNECT ON DATABASE ${D05_TARGET.database} TO ${name};` })
      }
      run('retention-grants', psql, [...pg, '-q', '-f', 'tools/print-d03/least-privilege.sql'])
      const attrs = run('retention-role-attributes', psql, [...pg, '-At', '-F', '|', '-c', `SELECT rolsuper,rolcreatedb,rolcreaterole,rolbypassrls,rolinherit,(SELECT count(*) FROM pg_auth_members m WHERE m.member=r.oid) FROM pg_roles r WHERE rolname='${name}'`])
      if (attrs.trim() !== 'f|f|f|f|f|0') throw new Error('D05_RETENTION_ROLE_OVERPRIVILEGED')
      const retention = new URL(values.OMNI_PRINT_RETENTION_DATABASE_URL)
      const permissions = run('retention-permissions', psql, ['-h', D05_TARGET.host, '-p', '5432', '-U', name, '-d', D05_TARGET.database, '-w', '-X', '-At', '-F', '|', '-c', "SELECT has_table_privilege(current_user,'public.vendas','SELECT'),has_table_privilege(current_user,'public.print_events','DELETE'),has_table_privilege(current_user,'public.print_documents','SELECT')"], { env: { ...env, PGPASSWORD: decodeURIComponent(retention.password) } })
      if (permissions.trim() !== 'f|f|t') throw new Error('D05_RETENTION_GRANTS_INVALID')
    } else d02('verify-prisma', ['verify', '--prisma'])
    console.log('D05_' + operation.toUpperCase().replaceAll('-', '_') + '_PASS')
  } catch (error) { console.error(error instanceof Error && /^D05_|^PRIVATE_|^EMPTY_|^VERSIONED_/.test(error.message) ? error.message : 'D05_ENVIRONMENT_OPERATION_FAILED'); process.exitCode = 1 }
}
