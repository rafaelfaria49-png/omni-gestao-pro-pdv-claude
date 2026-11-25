// Endpoint, database and role tuples attested in the isolation audits. These
// entries authorize a non-production target, not a particular feature or session.
const profiles = [
  profile('development', 'ep-round-fire-bb21qrlp', 'c-15.us-east-1', 'omni_dev_synthetic', 'omni_dev_runtime'),
  profile('preview', 'ep-purple-morning-b6ajdsfk', 'c-2.sa-east-1', 'omnigestao_preview', 'preview_runtime'),
  profile('preview', 'ep-red-wave-b6bbj667', 'c-2.sa-east-1', 'omnigestao_preview', 'preview_runtime'),
  profile('preview', 'ep-curly-lake-bchf3a4k', 'c-16.us-east-1', 'omni_preview_cert', 'omni005_preview_runtime'),
  profile('preview', 'ep-nameless-boat-b6y438an', 'c-2.sa-east-1', 'omni_print_d05', 'omni_print_d05_app'),
  profile('preview', 'ep-wandering-shape-b66wj763', 'c-2.sa-east-1', 'omni_desktop_qa', 'omni_desktop_qa_owner'),
]
const developmentDdl = profile(
  'development', 'ep-round-fire-bb21qrlp', 'c-15.us-east-1', 'omni_dev_synthetic', 'omni_dev_bootstrap',
)
const productionProjects = new Set([
  'prj_wjkHKw2jFQfY8regMYtkYXwgavuz', // omni-gestao-pro
  'prj_IbJi32rh4TsQwWFYYVVjs133fw3H', // existing legacy project
])
const loopback = new Set(['127.0.0.1', 'localhost', '[::1]'])
const identifier = /^[A-Za-z_][A-Za-z0-9_-]{0,62}$/
const localProductionNames = new Set(['omnigestao_prod', 'omnigestao_prod_candidate', 'neondb_owner'])
const tlsModes = new Set(['require', 'verify-full'])
const numericOptions = new Set(['connect_timeout', 'pool_timeout', 'connection_limit', 'statement_cache_size', 'socket_timeout'])
const testDatasource = /(?:^|_)(?:DATABASE_URL|DIRECT_URL|DB_URL|PG_URL|PG_TEST_URL)$/

function profile(environment, endpoint, region, database, role) {
  const regions = new Set([region, region.replace(/^c-\d+\./, '')])
  const hosts = new Set()
  for (const name of regions) {
    hosts.add(`${endpoint}.${name}.aws.neon.tech`)
    hosts.add(`${endpoint}-pooler.${name}.aws.neon.tech`)
  }
  return { environment, hosts, database, role }
}

class DatasourcePolicyError extends Error {
  /** @param {'DATABASE_URL' | 'DIRECT_URL' | 'TEST_DATASOURCE' | 'AUDIT_DATASOURCE' | 'RUNTIME_CONTEXT'} binding */
  constructor(binding) {
    super(`ISOLATION_SCOPE_BLOCKED: ${binding}`)
    this.name = 'DatasourcePolicyError'
  }
}

/** @param {string} key @param {string} value @param {boolean} local */
function safeOption(key, value, local) {
  if (key === 'sslmode') return tlsModes.has(value) || (local && ['disable', 'prefer'].includes(value))
  if (key === 'sslaccept') return value === 'strict'
  if (key === 'channel_binding') return value === 'require' || value === 'prefer'
  if (key === 'pgbouncer') return value === 'true' || value === 'false'
  if (key === 'schema') return identifier.test(value)
  return numericOptions.has(key) && /^\d{1,6}$/.test(value)
}

/** @param {string | undefined} value */
function parse(value) {
  if (!value || /[\s\x00-\x1f\x7f#]/.test(value)) return undefined
  try {
    const url = new URL(value)
    const role = decodeURIComponent(url.username)
    const database = decodeURIComponent(url.pathname.slice(1))
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname ||
      !identifier.test(role) || !identifier.test(database)
    ) return undefined

    const local = loopback.has(url.hostname)
    const seen = new Set()
    for (const [key, option] of url.searchParams) {
      if (seen.has(key) || !safeOption(key, option, local)) return undefined
      seen.add(key)
    }
    if (!local && (!url.password || !tlsModes.has(url.searchParams.get('sslmode') ?? ''))) return undefined
    return {
      local, host: url.hostname, port: url.port || '5432', database, role,
      schema: url.searchParams.get('schema') || 'public',
    }
  } catch {
    return undefined
  }
}

/** @param {ReturnType<typeof parse>} binding @param {typeof profiles} allowed @param {boolean} localAllowed */
function identity(binding, allowed, localAllowed) {
  if (!binding) return undefined
  if (binding.local) {
    if (!localAllowed || localProductionNames.has(binding.role.toLowerCase()) ||
      localProductionNames.has(binding.database.toLowerCase())) return undefined
    return `loopback:${binding.host}:${binding.port}/${binding.database}:${binding.role}`
  }
  const matched = allowed.find((p) => binding.port === '5432' &&
    p.hosts.has(binding.host) && p.database === binding.database && p.role === binding.role)
  return matched
}

/** @param {NodeJS.ProcessEnv} env @param {typeof profiles} allowed @param {boolean} localAllowed */
function verifyPair(env, allowed, localAllowed) {
  const database = parse(env.DATABASE_URL)
  const key = identity(database, allowed, localAllowed)
  if (!key) throw new DatasourcePolicyError('DATABASE_URL')

  // Runtime fixtures have historically used one loopback URL. A supplied
  // DIRECT_URL (including an empty string) is always checked.
  if (env.DIRECT_URL === undefined && database?.local) return env.DATABASE_URL
  const direct = parse(env.DIRECT_URL)
  if (identity(direct, allowed, localAllowed) !== key || direct?.schema !== database?.schema) {
    throw new DatasourcePolicyError('DIRECT_URL')
  }
  return env.DATABASE_URL
}

/** @param {NodeJS.ProcessEnv} env */
function vercelProduction(env) {
  return env.VERCEL === '1' && env.VERCEL_ENV === 'production' &&
    (env.VERCEL_TARGET_ENV === undefined || env.VERCEL_TARGET_ENV === 'production') &&
    productionProjects.has(env.VERCEL_PROJECT_ID ?? '') &&
    /^dpl_[A-Za-z0-9]+$/.test(env.VERCEL_DEPLOYMENT_ID ?? '')
}

/** The production result leaves Prisma's existing datasource resolution intact. */
export function runtimeDatasource(env = process.env) {
  if (env.VERCEL_ENV === 'production') {
    if (!vercelProduction(env)) throw new DatasourcePolicyError('RUNTIME_CONTEXT')
    return { kind: 'vercel-production' }
  }
  return { kind: 'nonproduction', url: nonproductionDatasource(env) }
}

/** For runtime-like tools that have no authority to access Production. */
export function nonproductionDatasource(env = process.env) {
  const context = env.VERCEL_ENV ?? 'development'
  if (context !== 'development' && context !== 'preview') throw new DatasourcePolicyError('RUNTIME_CONTEXT')
  return verifyPair(env, profiles.filter((p) => p.environment === context), env.VERCEL !== '1')
}

/** Local CLI authority. The separate Vercel migration runner is unchanged. */
export function localMigrationDatasource(env = process.env) {
  if (env.VERCEL === '1' || (env.VERCEL_ENV !== undefined && env.VERCEL_ENV !== 'development')) {
    throw new DatasourcePolicyError('RUNTIME_CONTEXT')
  }
  const url = verifyPair(env, [developmentDdl], true)
  const direct = parse(env.DIRECT_URL)
  if (direct?.host.includes('-pooler.')) {
    throw new DatasourcePolicyError('DIRECT_URL')
  }
  return url
}

/** @param {string | undefined} url */
export function localFixtureDatasource(url) {
  if (!identity(parse(url), [], true)) throw new DatasourcePolicyError('TEST_DATASOURCE')
  return url
}

/** Only the dedicated Windows Preview endpoint can be provisioned by its host QA tool. */
export function desktopQaProvisioningDatasource(url = process.env.DESKTOP_QA_HOSTED_DATABASE_URL) {
  const binding = parse(url)
  const desktop = profiles.filter((entry) => entry.database === 'omni_desktop_qa')
  if (!identity(binding, desktop, false) || binding?.host.includes('-pooler.')) {
    throw new DatasourcePolicyError('TEST_DATASOURCE')
  }
  return url
}

/** Explicit test runner bindings do not acquire the application Production exception. */
export function verifyTestDatasources(env = process.env) {
  for (const [key, value] of Object.entries(env)) {
    if (testDatasource.test(key) && value !== undefined && value !== '' &&
      !identity(parse(value), profiles, true)) {
      throw new DatasourcePolicyError('TEST_DATASOURCE')
    }
  }
  if (env.DATABASE_URL && env.DIRECT_URL !== undefined) verifyPair(env, profiles, true)
}

/** Explicit, dedicated read-only audit credential. Never inherited by the application. */
export function productionAuditDatasource(url = process.env.OMNI_AUDIT_DATABASE_URL) {
  const audit = profile('production', 'ep-summer-tooth-acltc6wi', 'c-2.sa-east-1', 'omnigestao_prod', 'omni_prod_auditor')
  if (!identity(parse(url), [audit], false)) throw new DatasourcePolicyError('AUDIT_DATASOURCE')
  return url
}
