#!/usr/bin/env node
/**
 * OMNI-VESTUARIO-P02 — E2E autenticado ISOLADO do cadastro de grades.
 * App real (build de produção, `next start`) + PostgreSQL DESCARTÁVEL (baseline main + migration P02 +
 * drift zero) + login NextAuth real. Lojas/usuários sintéticos, senhas aleatórias por execução (nunca
 * logadas). Catálogo habilitado SÓ nas lojas da allowlist desta execução; estoque/venda nunca.
 *
 * Uso: VESTUARIO_P02_TEST_DATABASE_URL=postgresql://user@127.0.0.1:55457/vest_p02_e2e node scripts/vestuario/run-vestuario-p02-e2e.mjs
 * Pré-requisito: `npm run build` desta árvore.
 */
import { spawn, spawnSync } from "node:child_process"
import { randomBytes } from "node:crypto"
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import path from "node:path"
import bcrypt from "bcryptjs"

const database = (process.env.VESTUARIO_P02_TEST_DATABASE_URL ?? "").trim()
if (!database) throw new Error("BLOQUEIO_EXPLICITO_PG: defina VESTUARIO_P02_TEST_DATABASE_URL.")
const url = new URL(database)
if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname) || !url.pathname.includes("vest_p02_e2e")) {
  throw new Error("BLOQUEIO_EXPLICITO_PG: somente banco loopback cujo nome contém vest_p02_e2e.")
}
const PORT = process.env.VESTUARIO_P02_E2E_PORT || "3117"
const ORIGIN = `http://localhost:${PORT}`
const phase = process.env.VESTUARIO_E2E_PHASE === "p03" ? "p03" : "p02"
const evidence = path.join(process.cwd(), `test-results/vestuario-${phase}-e2e`)

function run(cmd, args, env = process.env) {
  const r = spawnSync(cmd, args, { env, stdio: "inherit" })
  if (r.error || r.status !== 0) throw new Error(`VESTUARIO_E2E_STEP_FAILED: ${args.slice(0, 2).join(" ")}`)
}

// 1. Banco: reset + baseline da main + migration P02 + drift zero.
run(process.execPath, ["scripts/vestuario/prepare-pg.mjs"], { ...process.env, VESTUARIO_P02_TEST_DATABASE_URL: database })

// 2. Massa sintética.
const { PrismaClient, Prisma } = await import("../../generated/prisma/index.js")
const db = new PrismaClient({ datasourceUrl: database })
const secret = () => randomBytes(18).toString("base64url")
const passwords = { dono: secret(), lojaB: secret() }
const STORE_A = "e2e-vest-a"
const STORE_B = "e2e-vest-b"
const STORE_OFF = "e2e-vest-off"
try {
  await db.store.createMany({ data: [
    { id: STORE_A, name: "Moda E2E A", profile: "VARIEDADES", moduleAccess: Prisma.DbNull, cnpj: "00.000.000/0001-91", phone: "(11) 4000-0000" },
    { id: STORE_B, name: "Moda E2E B", profile: "VARIEDADES", moduleAccess: Prisma.DbNull, cnpj: "00.000.000/0002-72", phone: "(11) 4000-0001" },
    { id: STORE_OFF, name: "Loja Sem Grade E2E", profile: "VARIEDADES", moduleAccess: Prisma.DbNull, cnpj: "00.000.000/0003-53", phone: "(11) 4000-0002" },
  ] })
  for (const storeId of [STORE_A, STORE_B, STORE_OFF]) {
    await db.storeSettings.create({ data: { storeId, printerConfig: { capabilities: { version: 1, business: { primaryBranch: "moda" } } } } })
  }
  // Produto legado simples (com metadata livre) que precisa continuar intocado.
  await db.produto.create({ data: { id: "e2e-vest-legado", storeId: STORE_A, name: "Camiseta legada E2E", sku: "LEGADO-E2E", stock: 4, price: 30, metadata: { vestuario: "camiseta", atributos: { cor: "Azul", tamanho: "M" } } } })
  const user = async (email, name, password, role, stores) => db.adminUser.create({ data: {
    email, name, role, lojaId: stores[0], accessScope: "STORE", password: await bcrypt.hash(password, 10),
    adminUserStores: { create: stores.map((storeId) => ({ storeId })) },
  } })
  await user("dono@e2e-vestuario.invalid", "Dono Sintético", passwords.dono, "ADMIN", [STORE_A, STORE_B, STORE_OFF])
  await user("gerente-b@e2e-vestuario.invalid", "Gerente Loja B", passwords.lojaB, "GERENTE", [STORE_B])
  if (phase === "p03") {
    const { seedP03E2E } = await import("./p03-e2e-fixture.mjs")
    await seedP03E2E(db, STORE_A, STORE_B)
  }
} finally { await db.$disconnect() }

// 3. App real com o catálogo habilitado só para A e B (QA). Estoque/venda solicitados para provar que seguem off.
await mkdir(evidence, { recursive: true })
const appEnv = {
  ...process.env, NODE_ENV: "production", PORT, HOSTNAME: "localhost", DATABASE_URL: database, DIRECT_URL: database,
  AUTH_SECRET: secret(), AUTH_TRUST_HOST: "true", NEXTAUTH_URL: ORIGIN, AUTH_URL: ORIGIN, NEXT_TELEMETRY_DISABLED: "1",
  VERCEL_ENV: "development", MIGRATION_AUTHORITY_ENABLED: "false",
  VESTUARIO_CATALOG_ENABLED: "1", VESTUARIO_STOCK_ENABLED: "1", VESTUARIO_SALE_ENABLED: "1",
  VESTUARIO_STORE_ALLOWLIST: `${STORE_A},${STORE_B}`,
  VESTUARIO_P03_ENABLED: phase === "p03" ? "1" : "0",
  VESTUARIO_P03_STORE_ALLOWLIST: phase === "p03" ? `${STORE_A},${STORE_B}` : "",
}
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "localhost", "-p", PORT], { env: appEnv, stdio: ["ignore", "inherit", "inherit"] })
let status = "FAIL"
try {
  const deadline = Date.now() + 120_000
  for (;;) {
    try { if ((await fetch(`${ORIGIN}/login`)).ok) break } catch { /* subindo */ }
    if (Date.now() > deadline || server.exitCode !== null) throw new Error("VESTUARIO_E2E_SERVER_NOT_READY")
    await new Promise((r) => setTimeout(r, 1000))
  }
  run(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "--config", `e2e/vestuario-${phase}.playwright.config.ts`, ...process.argv.slice(2)], {
    ...process.env, VESTUARIO_P02_E2E_BASE_URL: ORIGIN, VESTUARIO_P02_E2E_DATABASE_URL: database,
    VESTUARIO_P02_E2E_PW_DONO: passwords.dono, VESTUARIO_P02_E2E_PW_LOJA_B: passwords.lojaB,
  })
  status = "PASS"
} finally {
  server.kill("SIGTERM")
  let redactions = 0
  for (const name of await readdir(evidence, { recursive: true }).catch(() => [])) {
    if (!/\.(json|md|txt|log)$/.test(name)) continue
    const file = path.join(evidence, name)
    const text = await readFile(file, "utf8")
    let clean = text
    for (const v of Object.values(passwords)) clean = clean.split(v).join("[REDACTED]")
    if (clean !== text) { redactions += 1; await writeFile(file, clean) }
  }
  await writeFile(path.join(evidence, "isolation.json"), JSON.stringify({
    status, credentialRedactions: redactions, app: `next start (build de produção) em ${ORIGIN}`,
    database: "PostgreSQL descartável loopback (baseline main + migration P02 + drift zero)",
    auth: "NextAuth Credentials real; usuários sintéticos com senha aleatória por execução",
    flags: { catalogAllowlist: [STORE_A, STORE_B], stockAndSaleRequestedButForcedOff: true },
    phase, productionWrites: 0, physicalHomologation: "NOT_EXECUTED",
  }, null, 2) + "\n")
}
