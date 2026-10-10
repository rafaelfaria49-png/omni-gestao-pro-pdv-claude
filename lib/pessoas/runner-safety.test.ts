import { describe, expect, it } from "vitest"
import { safeEnvironment } from "../../scripts/pessoas/runner-environment.mjs"

describe("Pessoas: isolamento do runner oficial", () => {
  it("não herda segredos, autoridade de production nem preloads do operador", () => {
    const contaminado = {
      PATH: "synthetic-path", SystemRoot: "synthetic-windows", TEMP: "synthetic-temp",
      DATABASE_URL: "synthetic-forbidden", DIRECT_URL: "synthetic-forbidden",
      VERCEL: "1", VERCEL_ENV: "production", VERCEL_PROJECT_ID: "synthetic-forbidden",
      MIGRATION_AUTHORITY_ENABLED: "on", AWS_ACCESS_KEY_ID: "synthetic-forbidden",
      AWS_SECRET_ACCESS_KEY: "synthetic-forbidden", GOOGLE_CLIENT_SECRET: "synthetic-forbidden",
      R2_SECRET_ACCESS_KEY: "synthetic-forbidden", AUTH_SECRET: "synthetic-forbidden",
      NODE_OPTIONS: "--require synthetic-preload", NPM_TOKEN: "synthetic-forbidden",
      PESSOAS_DP_ENABLED: "on", PESSOAS_CPF_HMAC_KEY: "synthetic-forbidden",
    }
    expect(safeEnvironment(contaminado)).toEqual({
      PATH: "synthetic-path", SystemRoot: "synthetic-windows", TEMP: "synthetic-temp",
    })
  })
})
