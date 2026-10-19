import { describe, expect, it } from "vitest"
import { assertIsolatedCadastrosDatabase } from "../../scripts/cadastros/isolated-postgres-guard.mjs"

const url = "postgresql://cad_r2_021:isolated_ci_only@127.0.0.1:5432/cad_r2_021_isolated"
const isolated = { CI: "true", GITHUB_ACTIONS: "true", CAD_R2_021_DISPOSABLE_DB: "true", DATABASE_URL: url, DIRECT_URL: url, MIGRATION_AUTHORITY_ENABLED: "false" }
describe("disposable PostgreSQL test runner boundary", () => {
  it("accepts only its explicit isolated CI service", () => expect(assertIsolatedCadastrosDatabase(isolated)).toBe(url))
  it.each(Object.keys(isolated))("fails closed if %s is absent", (key) => {
    expect(() => assertIsolatedCadastrosDatabase({ ...isolated, [key]: undefined })).toThrow("CAD_R2_021_ISOLATED_DATABASE_REQUIRED")
  })
  it.each([
    "postgresql://user:secret@production.neon.tech/production",
    "postgresql://cad_r2_021:isolated_ci_only@127.0.0.1:5432/postgres",
    `${url}?host=production.example.invalid`,
    "postgresql://127.0.0.1@production.example.invalid/cad_r2_021_isolated",
  ])("refuses alternate URLs without echoing credentials: %s", (candidate) => {
    expect(() => assertIsolatedCadastrosDatabase({ ...isolated, DATABASE_URL: candidate, DIRECT_URL: candidate }))
      .toThrow(/^CAD_R2_021_ISOLATED_DATABASE_REQUIRED$/)
  })
})
