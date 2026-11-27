import { PrismaClient } from "../../generated/prisma/index.js"
import { nonproductionDatasource } from "../../lib/db/datasource-policy.mjs"

// Contrato do papel para o HUB M01. O UPDATE de uma coluna permite FOR KEY SHARE no PostgreSQL.
export const marketplaceQaGrants = [
  ["admin_users", ["SELECT"]],
  ["admin_user_stores", ["SELECT"]],
  ["stores", ["SELECT"]],
  ["admin_sessions", ["SELECT", "INSERT", "UPDATE", "DELETE"]],
  ["marketplace_connections", ["SELECT", "INSERT", "UPDATE"]],
  ["marketplace_sync_logs", ["SELECT"]],
  ["marketplace_product_links", ["SELECT"]],
  ["estoque_produtos", ["SELECT"]],
  ["logs_auditoria", ["SELECT", "INSERT"]],
]
export const marketplaceStoreLockColumn = "updatedAt"

export async function attestMarketplaceQaDatasource(env) {
  if (env.VERCEL_ENV !== "preview" || env.VERCEL === "1" || !env.DIRECT_URL) {
    throw new Error("O QA Marketplace exige um par de conexões no escopo Preview.")
  }
  nonproductionDatasource(env)
  const tableChecks = marketplaceQaGrants.flatMap(([table, grants]) => grants.map((grant) =>
    `coalesce(has_table_privilege(to_regclass('public.${table}'), '${grant}'), false)`,
  ))
  for (const binding of ["DATABASE_URL", "DIRECT_URL"]) {
    const raw = env[binding]
    const expected = new URL(raw)
    const client = new PrismaClient({ datasourceUrl: raw })
    try {
      const [actual] = await client.$queryRawUnsafe(`
        SELECT current_database() AS database, session_user AS login, current_user AS role,
          EXISTS (
            SELECT FROM pg_catalog.pg_roles AS r
            WHERE pg_has_role(r.oid, 'MEMBER')
              AND (r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication)
          ) OR has_schema_privilege('public', 'CREATE')
            OR has_database_privilege(current_database(), 'CREATE') AS elevated,
          (${tableChecks.join(" AND ")}
            AND coalesce(has_column_privilege(to_regclass('public.stores'), '${marketplaceStoreLockColumn}', 'UPDATE'), false)
            AND NOT has_table_privilege(to_regclass('public.stores'), 'UPDATE')
            AND NOT has_table_privilege(to_regclass('public.marketplace_connections'), 'DELETE')
            AND NOT has_table_privilege(to_regclass('public.logs_auditoria'), 'UPDATE')
            AND NOT has_table_privilege(to_regclass('public.logs_auditoria'), 'DELETE')
            AND NOT has_table_privilege(to_regclass('public.estoque_produtos'), 'UPDATE')
          ) AS permissions
      `)
      const role = decodeURIComponent(expected.username)
      if (!actual || actual.database !== decodeURIComponent(expected.pathname.slice(1)) ||
          actual.role !== role || actual.login !== role || actual.elevated || actual.permissions !== true) {
        throw new Error("Identidade ou privilégios divergentes.")
      }
    } catch {
      throw new Error(`Identidade ou privilégios de QA não atestados em ${binding}.`)
    } finally {
      await client.$disconnect()
    }
  }
}
