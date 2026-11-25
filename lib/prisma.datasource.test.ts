import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocked = vi.hoisted(() => ({
  construct: vi.fn(),
  connect: vi.fn(async () => {}),
  raw: vi.fn(async () => ["synthetic"]),
  transaction: vi.fn(async () => "synthetic transaction"),
}))

vi.mock("@/generated/prisma", () => ({
  PrismaClient: class {
    constructor(options: object) {
      mocked.construct(options)
    }
    $connect = mocked.connect
    $queryRaw = mocked.raw
    $transaction = mocked.transaction
  },
}))

const qa = "postgresql://test@127.0.0.1:55432/omni_ci"
const blocked = "postgresql://neondb_owner:synthetic@ep-summer-tooth-acltc6wi.sa-east-1.aws.neon.tech/omnigestao_prod?sslmode=require"

describe("Prisma datasource boundary", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    for (const key of ["DATABASE_URL", "DIRECT_URL", "VERCEL", "VERCEL_ENV", "VERCEL_TARGET_ENV",
      "VERCEL_PROJECT_ID", "VERCEL_DEPLOYMENT_ID"]) vi.stubEnv(key, undefined)
  })

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "omniRuntimePrisma")
    vi.unstubAllEnvs()
  })

  it("allows importing during a database-free build", async () => {
    vi.stubEnv("NODE_ENV", "production")
    await import("./prisma")
    expect(mocked.construct).not.toHaveBeenCalled()
  })

  it("blocks both explicit connection and delegate lookup before the client exists", async () => {
    vi.stubEnv("DATABASE_URL", qa)
    vi.stubEnv("DIRECT_URL", blocked)
    const { prisma, prismaEnsureConnected } = await import("./prisma")
    await expect(prismaEnsureConnected()).rejects.toThrow("ISOLATION_SCOPE_BLOCKED: DIRECT_URL")
    expect(() => prisma.store.findMany({})).toThrow("ISOLATION_SCOPE_BLOCKED: DIRECT_URL")
    expect(() => prisma.$queryRaw`SELECT 1`).toThrow("ISOLATION_SCOPE_BLOCKED: DIRECT_URL")
    expect(mocked.construct).not.toHaveBeenCalled()
    expect(mocked.connect).not.toHaveBeenCalled()
    expect(mocked.raw).not.toHaveBeenCalled()
  })

  it("pins the validated datasource and keeps a single runtime client", async () => {
    vi.stubEnv("DATABASE_URL", qa)
    const { prisma } = await import("./prisma")
    await prisma.$connect()
    vi.stubEnv("DATABASE_URL", blocked)
    await expect(prisma.$queryRaw`SELECT 1`).resolves.toEqual(["synthetic"])
    await expect(prisma.$transaction([])).resolves.toBe("synthetic transaction")
    expect(mocked.construct).toHaveBeenCalledExactlyOnceWith({ datasourceUrl: qa, log: [] })
  })

  it("keeps the existing constructor options on Vercel Production", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("VERCEL", "1")
    vi.stubEnv("VERCEL_ENV", "production")
    vi.stubEnv("VERCEL_PROJECT_ID", "prj_wjkHKw2jFQfY8regMYtkYXwgavuz")
    vi.stubEnv("VERCEL_DEPLOYMENT_ID", "dpl_SyntheticBuild")
    const { prisma } = await import("./prisma")
    await prisma.$connect()
    expect(mocked.construct).toHaveBeenCalledExactlyOnceWith({ log: [] })
  })
})
