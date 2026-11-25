import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  desktopQaProvisioningDatasource, localFixtureDatasource, localMigrationDatasource, nonproductionDatasource,
  productionAuditDatasource, runtimeDatasource, verifyTestDatasources,
} from './datasource-policy.mjs'

const fakePassword = 'synthetic-password'
const devHost = 'ep-round-fire-bb21qrlp.c-15.us-east-1.aws.neon.tech'
const prodHost = 'ep-summer-tooth-acltc6wi.sa-east-1.aws.neon.tech'
const remote = (host, db, role) => `postgresql://${role}:${fakePassword}@${host}/${db}?sslmode=require`
const dev = remote(devHost, 'omni_dev_synthetic', 'omni_dev_runtime')
const prod = remote(prodHost, 'omnigestao_prod', 'neondb_owner')
const local = 'postgresql://postgres@127.0.0.1:55432/omni_test?connect_timeout=1'
const pair = (url, direct = url) => ({ DATABASE_URL: url, DIRECT_URL: direct })

const previewProfiles = [
  ['generic / SaaS / Marketplace', 'ep-purple-morning-b6ajdsfk.c-2.sa-east-1', 'omnigestao_preview', 'preview_runtime'],
  ['Padaria', 'ep-red-wave-b6bbj667.c-2.sa-east-1', 'omnigestao_preview', 'preview_runtime'],
  ['canary', 'ep-curly-lake-bchf3a4k.c-16.us-east-1', 'omni_preview_cert', 'omni005_preview_runtime'],
  ['Omni Print', 'ep-nameless-boat-b6y438an.c-2.sa-east-1', 'omni_print_d05', 'omni_print_d05_app'],
  ['Windows', 'ep-wandering-shape-b66wj763.c-2.sa-east-1', 'omni_desktop_qa', 'omni_desktop_qa_owner'],
]

test('certified Development and local single-URL fixtures are accepted', () => {
  assert.deepEqual(runtimeDatasource(pair(dev)), { kind: 'nonproduction', url: dev })
  assert.deepEqual(runtimeDatasource({ DATABASE_URL: local, NODE_ENV: 'production' }), {
    kind: 'nonproduction', url: local,
  })
})

for (const [title, endpoint, db, role] of previewProfiles) {
  test(`isolated Preview profile is accepted: ${title}`, () => {
    const direct = remote(endpoint + '.aws.neon.tech', db, role)
    const pooler = remote(endpoint.replace('.', '-pooler.') + '.aws.neon.tech', db, role) + '&pgbouncer=true'
    assert.deepEqual(runtimeDatasource({ ...pair(pooler, direct), VERCEL: '1', VERCEL_ENV: 'preview' }), {
      kind: 'nonproduction', url: pooler,
    })
  })
}

const rejected = [
  ['missing pair', {}],
  ['remote DIRECT_URL missing', { DATABASE_URL: dev }],
  ['explicit empty direct', pair(local, '')],
  ['Production at runtime in Development', pair(prod)],
  ['Production pooler in Preview', { ...pair(prod.replace('.sa-east-1', '-pooler.sa-east-1')), VERCEL_ENV: 'preview' }],
  ['Production DIRECT_URL only', pair(dev, prod)],
  ['cloned name on unknown host', pair(dev.replace(devHost, 'copy.example.invalid'))],
  ['copied Production candidate name', pair(prod.replace('omnigestao_prod', 'omnigestao_prod_candidate'))],
  ['DDL role in runtime', pair(dev.replace('omni_dev_runtime', 'omni_dev_bootstrap'))],
  ['local Production owner', pair(local.replace('postgres@', 'neondb_owner@'))],
  ['local Production database', pair(local.replace('omni_test', 'omnigestao_prod'))],
  ['different local port', pair(local, local.replace('55432', '55433'))],
  ['different schema', pair(dev, dev + '&schema=other')],
  ['host override', pair(dev + '&host=production.invalid')],
  ['repeated option', pair(dev + '&sslmode=require')],
  ['without TLS', pair(dev.replace('require', 'disable'))],
  ['insecure TLS option', pair(dev + '&sslaccept=accept_invalid_certs')],
  ['whitespace in host', pair(dev.replace(devHost, '\n' + devHost))],
  ['unapproved custom profile', { ...pair(dev), VERCEL_ENV: 'ambiguous' }],
  ['Environment flag alone', { ...pair(prod), NODE_ENV: 'production', VERCEL_ENV: 'production' }],
  ['Preview cannot silently use loopback service', { ...pair(local), VERCEL: '1', VERCEL_ENV: 'preview' }],
]

for (const [title, environment] of rejected) {
  test(`fail closed: ${title}`, () => {
    assert.throws(() => runtimeDatasource(environment), {
      name: 'DatasourcePolicyError',
      message: /^ISOLATION_SCOPE_BLOCKED: (DATABASE_URL|DIRECT_URL|RUNTIME_CONTEXT)$/,
    })
  })
}

test('only the two established Vercel Production project contexts preserve the existing Prisma source', () => {
  const env = { ...pair(prod), NODE_ENV: 'production', VERCEL: '1', VERCEL_ENV: 'production', VERCEL_TARGET_ENV: 'production',
    VERCEL_DEPLOYMENT_ID: 'dpl_SyntheticExample', VERCEL_PROJECT_ID: 'prj_wjkHKw2jFQfY8regMYtkYXwgavuz' }
  assert.deepEqual(runtimeDatasource(env), { kind: 'vercel-production' })
  assert.deepEqual(runtimeDatasource({ ...env, VERCEL_PROJECT_ID: 'prj_IbJi32rh4TsQwWFYYVVjs133fw3H' }), {
    kind: 'vercel-production',
  })
  assert.throws(() => runtimeDatasource({ ...env, VERCEL_PROJECT_ID: 'prj_Unknown' }), /RUNTIME_CONTEXT/)
  assert.throws(() => runtimeDatasource({ ...env, VERCEL_DEPLOYMENT_ID: '' }), /RUNTIME_CONTEXT/)
  assert.throws(() => runtimeDatasource({ ...env, VERCEL_TARGET_ENV: 'staging' }), /RUNTIME_CONTEXT/)
  assert.throws(() => runtimeDatasource({ ...env, NODE_ENV: 'development' }), /RUNTIME_CONTEXT/)
  assert.throws(() => nonproductionDatasource(env), /RUNTIME_CONTEXT/)
  assert.throws(() => verifyTestDatasources(env), /TEST_DATASOURCE/)
})

test('local CLI migration authority uses its own registered administration role', () => {
  const ddl = dev.replace('omni_dev_runtime', 'omni_dev_bootstrap')
  assert.equal(localMigrationDatasource(pair(ddl)), ddl)
  assert.equal(localMigrationDatasource(pair(local)), local)
  assert.throws(() => localMigrationDatasource(pair(dev)), /DATABASE_URL/)
  assert.throws(() => localMigrationDatasource(pair(ddl, ddl.replace('.c-15', '-pooler.c-15'))), /DIRECT_URL/)
  assert.throws(() => localMigrationDatasource({ ...pair(ddl), VERCEL: '1', VERCEL_ENV: 'preview' }), /RUNTIME_CONTEXT/)
  assert.throws(() => localMigrationDatasource(pair(prod)), /DATABASE_URL/)
})

test('disposable QA and integration bindings fail closed before orchestration', () => {
  assert.equal(localFixtureDatasource(local), local)
  assert.throws(() => localFixtureDatasource(local + '&options=host%3Dremote'), /TEST_DATASOURCE/)
  assert.throws(() => localFixtureDatasource(prod), /TEST_DATASOURCE/)
  verifyTestDatasources({
    VESTUARIO_P03_TEST_DATABASE_URL: local, MELI_E2E_DATABASE_URL: local, DIRECT_URL: local,
  })
  verifyTestDatasources({})
  assert.throws(() => verifyTestDatasources({ REPORTS_QA_DATABASE_URL: prod }), /TEST_DATASOURCE/)
  assert.throws(() => verifyTestDatasources({ HISTORICO_PAGAMENTO_PG_URL: prod }), /TEST_DATASOURCE/)
  assert.throws(() => verifyTestDatasources({ PG_ADMIN_URL: prod }), /TEST_DATASOURCE/)
  assert.throws(() => verifyTestDatasources(pair(local, dev)), /DIRECT_URL/)
})

test('Windows hosted provisioning requires the dedicated direct endpoint', () => {
  const url = remote('ep-wandering-shape-b66wj763.c-2.sa-east-1.aws.neon.tech', 'omni_desktop_qa', 'omni_desktop_qa_owner')
  assert.equal(desktopQaProvisioningDatasource(url), url)
  assert.throws(() => desktopQaProvisioningDatasource(url.replace('.c-2', '-pooler.c-2')), /TEST_DATASOURCE/)
  assert.throws(() => desktopQaProvisioningDatasource(prod.replace('omnigestao_prod', 'omni_desktop_qa')), /TEST_DATASOURCE/)
})

test('Production audit requires its own role and never falls back to the runtime owner', () => {
  const audit = remote(prodHost, 'omnigestao_prod', 'omni_prod_auditor')
  assert.equal(productionAuditDatasource(audit), audit)
  assert.throws(() => productionAuditDatasource(prod), /AUDIT_DATASOURCE/)
  assert.throws(() => productionAuditDatasource(''), /AUDIT_DATASOURCE/)
  assert.throws(() => nonproductionDatasource(pair(audit)), /DATABASE_URL/)
})

test('root PostgreSQL runner rejects an alternate host before launching its tools', () => {
  const runner = fileURLToPath(new URL('../../scripts/ci/run-root-pg-suites.mjs', import.meta.url))
  const result = spawnSync(process.execPath, [runner], {
    env: {
      ...process.env,
      PG_ADMIN_URL: 'postgresql://qa:synthetic-password@127.0.0.1:55432/postgres?host=foreign.invalid',
    },
    encoding: 'utf8',
    timeout: 5000,
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /ISOLATION_SCOPE_BLOCKED: TEST_DATASOURCE/)
  assert.doesNotMatch(result.stderr, /synthetic-password|foreign\.invalid/)
  assert.equal(result.stdout, '')
})
