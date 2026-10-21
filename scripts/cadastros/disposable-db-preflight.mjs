/**
 * Identidade positiva e banco vazio, lidos do próprio servidor por catálogo,
 * ANTES de qualquer escrita — inclusive o DDL do `db push`. Complementa o guard
 * de variáveis (`isolated-postgres-guard.mjs`); não o substitui.
 */
export async function assertFreshDisposableDatabase(db, { database, role }) {
  const [row] = await db.$queryRawUnsafe(
    "SELECT current_database() AS db, current_user AS role, " +
      "(now() - pg_postmaster_start_time()) < interval '3 hours' AS fresh, " +
      "(SELECT count(*)::int FROM pg_catalog.pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema')) AS tables",
  )
  if (row?.db !== database || row?.role !== role || row?.fresh !== true) {
    throw new Error("RAMOS_E2E_DATABASE_IDENTITY_MISMATCH")
  }
  if (row.tables !== 0) throw new Error("RAMOS_E2E_DATABASE_MUST_BE_EMPTY")
}
