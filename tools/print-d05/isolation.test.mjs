import { test } from 'node:test'
import assert from 'node:assert/strict'
import { D05_TARGET, d05IsolationErrors } from '../../lib/printing/direct/homologation.mjs'
import { main } from './build-preview.mjs'
import { sanitized } from './environment.mjs'
import path from 'node:path'
import { privatePathOutsideRepository } from './private-path.mjs'
import { prismaResolveUrl } from '../print-d02/d02.mjs'

const valid = () => ({ NODE_ENV: 'production', VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_TARGET_ENV: 'preview',
  VERCEL_PROJECT_ID: D05_TARGET.projectId, VERCEL_GIT_COMMIT_REF: D05_TARGET.branch, OMNI_PRINT_D05_ENVIRONMENT: '1',
  MIGRATION_AUTHORITY_ENABLED: 'false', OMNI_PRINT_RETENTION_ENABLED: '0',
  DATABASE_URL: `postgresql://${D05_TARGET.role}:synthetic@${D05_TARGET.host}/${D05_TARGET.database}?sslmode=require&sslaccept=strict`,
  DIRECT_URL: `postgresql://${D05_TARGET.role}:synthetic@${D05_TARGET.host}/${D05_TARGET.database}?sslmode=require&sslaccept=strict` })

test('D05 build accepts only the reviewed Preview and never runs a step before isolation', () => {
  let called = 0
  assert.equal(main({ env: valid(), run: () => { called++; return 0 }, log: () => {} }), 0)
  assert.equal(called, 1)
  for (const [key, value] of Object.entries({ VERCEL_ENV: 'production', VERCEL_TARGET_ENV: 'production', VERCEL_PROJECT_ID: 'another-project', VERCEL_GIT_COMMIT_REF: 'main', VERCEL: '0', OMNI_PRINT_D05_ENVIRONMENT: '0', MIGRATION_AUTHORITY_ENABLED: 'true', OMNI_PRINT_RETENTION_ENABLED: '1' })) {
    let count = 0; const env = { ...valid(), [key]: value }
    assert.equal(main({ env, run: () => { count++; return 0 }, log: () => {} }), 1, key)
    assert.equal(count, 0, key)
  }
})
test('foreign database, role, database name, missing TLS and pooled DIRECT_URL fail closed', () => {
  for (const name of ['DATABASE_URL', 'DIRECT_URL']) for (const value of [
    valid()[name].replace(D05_TARGET.host, 'another.invalid'), valid()[name].replace(D05_TARGET.database, 'another_database'),
    valid()[name].replace(D05_TARGET.role, 'another_role'), valid()[name].replace('sslmode=require', 'sslmode=disable'),
    valid()[name].replace('&sslaccept=strict', ''), valid()[name].replace('sslaccept=strict', 'sslaccept=accept_invalid_certs'),
    valid()[name].replace('sslmode=require', 'sslmode=verify-full'),
    valid()[name] + '&sslaccept=accept_invalid_certs', valid()[name] + '&host=another.invalid', valid()[name] + '&sslmode=disable',
    valid()[name] + '&schema=another', valid()[name] + '&connection_limit=999', 'not-a-url',
  ]) assert.ok(d05IsolationErrors({ ...valid(), [name]: value }).length)
  assert.ok(d05IsolationErrors({ ...valid(), DIRECT_URL: valid().DIRECT_URL.replace(D05_TARGET.host, D05_TARGET.pooledHost) }).length)
})
test('private state rejects the repository itself and descendants before IO, allowing a sibling', () => {
  const repo = path.resolve('synthetic-repo')
  for (const target of [repo, path.join(repo, '.'), path.join(repo, 'private'), path.join(repo, 'child', '..')]) {
    assert.throws(() => privatePathOutsideRepository(target, repo), /PRIVATE_STATE_OUTSIDE_REPOSITORY_REQUIRED/)
  }
  if (process.platform === 'win32') assert.throws(() => privatePathOutsideRepository(repo.toUpperCase(), repo))
  const sibling = repo + '-private'
  assert.equal(privatePathOutsideRepository(sibling, repo), sibling)
})
test('D02 resolve preserves strict libpq TLS in the Prisma URL and retains previous modes', () => {
  for (const mode of ['verify-full', 'verify-ca', 'require', 'disable', undefined]) {
    const u = new URL(prismaResolveUrl({ user: 'synthetic', host: 'example.invalid', port: '5432', db: 'test', env: { PGPASSWORD: 'fake!pass', PGSSLMODE: mode, PGSSLROOTCERT: 'C:/synthetic public/root.pem' } }))
    assert.equal(decodeURIComponent(u.password), 'fake!pass')
    const strict = ['verify-full', 'verify-ca'].includes(mode)
    assert.equal(u.searchParams.get('sslmode'), strict ? 'require' : mode ?? null)
    assert.equal(u.searchParams.get('sslaccept'), strict ? 'strict' : null)
    assert.equal(u.searchParams.get('sslcert'), strict ? 'C:/synthetic public/root.pem' : null)
  }
})
test('operator diagnostics redact full URLs, encoded passwords and independent secrets', () => {
  const values = { DATABASE_URL: 'postgresql://test:private%21password@invalid.invalid/db', DIRECT_URL: 'postgresql://test:private%21password@invalid.invalid/db', AUTH_SECRET: 'synthetic-auth-secret', OMNI_PRINT_RETENTION_DATABASE_URL: 'postgresql://retention:separate%21password@invalid.invalid/db' }
  const log = sanitized(`${values.DATABASE_URL} private!password private%21password separate!password separate%21password ${values.AUTH_SECRET}`, values)
  assert.ok(!log.includes('password')); assert.ok(!log.includes('synthetic-auth-secret')); assert.ok(!log.includes('postgresql://'))
})
