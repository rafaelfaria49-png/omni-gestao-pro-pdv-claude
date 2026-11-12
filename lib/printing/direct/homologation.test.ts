import { describe, expect, it } from "vitest"
import { APPROVED_RELEASE, directPrintRuntimeFromEnv } from "./activation"
import { D05_TARGET } from "./homologation.mjs"

const environment = () => ({ NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "preview", VERCEL_TARGET_ENV: "preview",
  VERCEL_PROJECT_ID: D05_TARGET.projectId, VERCEL_GIT_COMMIT_REF: D05_TARGET.branch, OMNI_PRINT_D05_ENVIRONMENT: "1",
  MIGRATION_AUTHORITY_ENABLED: "false", OMNI_PRINT_RETENTION_ENABLED: "0", OMNI_PRINT_DIRECT_ENABLED: "1", OMNI_PRINT_DIRECT_RELEASE: D05_TARGET.release,
  DATABASE_URL: `postgresql://${D05_TARGET.role}:synthetic@${D05_TARGET.host}/${D05_TARGET.database}?sslmode=require&sslaccept=strict`,
  DIRECT_URL: `postgresql://${D05_TARGET.role}:synthetic@${D05_TARGET.host}/${D05_TARGET.database}?sslmode=require&sslaccept=strict`,
  OMNI_PRINT_CONTENT_KEY: Buffer.alloc(32, 21).toString("base64url"), OMNI_PRINT_SIGNING_KEY: Buffer.alloc(32, 22).toString("base64url") })

describe("owner-authorized D05 Preview activation", () => {
  it("enables only HOMOLOGATION and leaves the production release null", () => {
    expect(APPROVED_RELEASE).toBeNull()
    expect(directPrintRuntimeFromEnv(environment())).toMatchObject({ enabled: true, mode: "HOMOLOGATION" })
  })
  it.each(["VERCEL_ENV", "VERCEL_TARGET_ENV"] as const)("production in %s refuses even valid D05 keys and flags", key => {
    expect(directPrintRuntimeFromEnv({ ...environment(), [key]: "production" }).enabled).toBe(false)
  })
  it.each(["VERCEL_PROJECT_ID", "VERCEL_GIT_COMMIT_REF", "OMNI_PRINT_DIRECT_RELEASE", "DIRECT_URL", "DATABASE_URL"] as const)("wrong %s refuses D05", key => {
    expect(directPrintRuntimeFromEnv({ ...environment(), [key]: "wrong" }).enabled).toBe(false)
  })
  it("no keys, equal keys or disabled direct-print flag remain closed", () => {
    expect(directPrintRuntimeFromEnv({ ...environment(), OMNI_PRINT_CONTENT_KEY: "" }).enabled).toBe(false)
    const env = environment()
    expect(directPrintRuntimeFromEnv({ ...env, OMNI_PRINT_SIGNING_KEY: env.OMNI_PRINT_CONTENT_KEY }).enabled).toBe(false)
    expect(directPrintRuntimeFromEnv({ ...env, OMNI_PRINT_DIRECT_ENABLED: "0" }).enabled).toBe(false)
  })
})

describe("D05 auth origin (Preview probe ADMIN_CSRF 500)", () => {
  it("empty AUTH_URL/NEXTAUTH_URL overrides keep the runtime closed; the branch alias or unset is accepted", () => {
    for (const key of ["AUTH_URL", "NEXTAUTH_URL"] as const) {
      expect(directPrintRuntimeFromEnv({ ...environment(), [key]: "" }).enabled).toBe(false)
      expect(directPrintRuntimeFromEnv({ ...environment(), [key]: D05_TARGET.origin })).toMatchObject({ enabled: true, mode: "HOMOLOGATION" })
    }
  })
})
