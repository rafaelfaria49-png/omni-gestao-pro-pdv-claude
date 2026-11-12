/** Owner-authorized D05 Preview only. No secret or production release is embedded here. */
export const D05_TARGET = Object.freeze({
  release: 'OMNI-PRINT-D05-HOMOLOGACAO-1',
  branch: 'codex/omni-print-d05-homologacao-fisica-001',
  projectId: 'prj_wjkHKw2jFQfY8regMYtkYXwgavuz',
  database: 'omni_print_d05',
  role: 'omni_print_d05_app',
  host: 'ep-nameless-boat-b6y438an.c-2.sa-east-1.aws.neon.tech',
  pooledHost: 'ep-nameless-boat-b6y438an-pooler.c-2.sa-east-1.aws.neon.tech',
  // Stable Vercel branch alias of the D05 Preview (vercel inspect). Auth.js treats AUTH_URL="" as "not trusted host".
  origin: 'https://omni-gestao-pro-git-codex-o-ab41e6-rafaelfaria49-4373s-projects.vercel.app',
})

/** @param {string | undefined} raw @param {boolean} direct */
function databaseMatches(raw, direct) {
  try {
    const u = new URL(raw ?? '')
    const parameters = [...u.searchParams.keys()]
    const allowed = ['sslmode', 'sslaccept', 'channel_binding', 'connection_limit', 'pool_timeout', 'connect_timeout', 'schema']
    if (u.hash || new Set(parameters).size !== parameters.length || parameters.some(k => !allowed.includes(k))) return false
    if (u.searchParams.has('schema') && u.searchParams.get('schema') !== 'public') return false
    if (u.searchParams.has('channel_binding') && u.searchParams.get('channel_binding') !== 'require') return false
    for (const key of ['connection_limit', 'pool_timeout', 'connect_timeout']) {
      if (!u.searchParams.has(key)) continue
      const value = u.searchParams.get(key) ?? ''
      if (!/^[1-9][0-9]*$/.test(value) || Number(value) > (key === 'connection_limit' ? 5 : 30)) return false
    }
    return ['postgres:', 'postgresql:'].includes(u.protocol) &&
      (u.hostname === D05_TARGET.host || (!direct && u.hostname === D05_TARGET.pooledHost)) &&
      (!u.port || u.port === '5432') && decodeURIComponent(u.pathname.slice(1)) === D05_TARGET.database &&
      decodeURIComponent(u.username) === D05_TARGET.role && u.password.length > 0 &&
      u.searchParams.get('sslmode') === 'require' && u.searchParams.get('sslaccept') === 'strict'
  } catch { return false }
}

/** Constant error codes only; never return URLs, usernames or environment values. @param {Readonly<Record<string, string | undefined>>} env */
export function d05IsolationErrors(env) {
  const errors = []
  if (env.VERCEL !== '1' || env.NODE_ENV !== 'production' || env.VERCEL_ENV !== 'preview' || env.VERCEL_TARGET_ENV !== 'preview') errors.push('D05_PREVIEW_REQUIRED')
  if (env.VERCEL_PROJECT_ID !== D05_TARGET.projectId || env.VERCEL_GIT_COMMIT_REF !== D05_TARGET.branch) errors.push('D05_PROJECT_BRANCH_MISMATCH')
  if (env.OMNI_PRINT_D05_ENVIRONMENT !== '1') errors.push('D05_ENVIRONMENT_REQUIRED')
  if (!databaseMatches(env.DATABASE_URL, false) || !databaseMatches(env.DIRECT_URL, true)) errors.push('D05_DATABASE_MISMATCH')
  if (env.MIGRATION_AUTHORITY_ENABLED !== 'false' || env.OMNI_PRINT_RETENTION_ENABLED === '1') errors.push('D05_AUTOMATIC_DATABASE_WRITES_FORBIDDEN')
  // Unset keeps Auth.js host detection (VERCEL). An empty override makes trustHost false (UntrustedHost, HTTP 500 on
  // /api/auth/*); any other origin would send logins/callbacks away from the isolated Preview.
  if (['AUTH_URL', 'NEXTAUTH_URL'].some(k => env[k] !== undefined && env[k] !== D05_TARGET.origin)) errors.push('D05_AUTH_ORIGIN_MISMATCH')
  return errors
}
