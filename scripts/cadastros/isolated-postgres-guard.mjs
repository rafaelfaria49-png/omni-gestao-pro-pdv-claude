/** Refuse every target except the disposable service owned by this CI job. */
export function assertIsolatedCadastrosDatabase(env) {
  const expected = "postgresql://cad_r2_021:isolated_ci_only@127.0.0.1:5432/cad_r2_021_isolated"
  if (env.CI !== "true" || env.GITHUB_ACTIONS !== "true" || env.CAD_R2_021_DISPOSABLE_DB !== "true" ||
      env.DATABASE_URL !== expected || env.DIRECT_URL !== expected || env.MIGRATION_AUTHORITY_ENABLED !== "false") {
    throw new Error("CAD_R2_021_ISOLATED_DATABASE_REQUIRED")
  }
  return expected
}
