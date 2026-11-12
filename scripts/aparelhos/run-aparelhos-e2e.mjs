#!/usr/bin/env node
/**
 * OMNI-APARELHOS-ENDTOEND-001 — E2E autenticado isolado.
 * App real (build de produção, `next start`) + PostgreSQL DESCARTÁVEL preparado com a
 * migration aditiva + login NextAuth real. Usuários/loja sintéticos, senhas aleatórias por
 * execução (nunca logadas). Sem .env, sem cookie forjado, sem rota de bypass.
 *
 * Uso: APARELHOS_TEST_DATABASE_URL=postgresql://user@127.0.0.1:55471/aparelhos_e2e node scripts/aparelhos/run-aparelhos-e2e.mjs
 * Pré-requisito: `npm run build` desta árvore.
 */
import { spawn, spawnSync } from "node:child_process"
import { randomBytes } from "node:crypto"
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import path from "node:path"
import bcrypt from "bcryptjs"

const database = (process.env.APARELHOS_TEST_DATABASE_URL ?? "").trim()
if (!database) throw new Error("BLOQUEIO_EXPLICITO_PG: defina APARELHOS_TEST_DATABASE_URL.")
const url = new URL(database)
if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname) || !url.pathname.includes("aparelhos_e2e")) {
  throw new Error("BLOQUEIO_EXPLICITO_PG: somente banco loopback cujo nome contém aparelhos_e2e.")
}
const PORT = process.env.APARELHOS_E2E_PORT || "3107"
const ORIGIN = `http://127.0.0.1:${PORT}`
const evidence = path.join(process.cwd(), "test-results/aparelhos-e2e")

function run(cmd, args, env = process.env) {
  const r = spawnSync(cmd, args, { env, stdio: "inherit" })
  if (r.error || r.status !== 0) throw new Error(`APARELHOS_E2E_STEP_FAILED: ${args.slice(0, 2).join(" ")}`)
}

// 1. Banco: reset + baseline da main + migration aditiva + drift zero.
run(process.execPath, ["scripts/aparelhos/prepare-pg.mjs"], { ...process.env, APARELHOS_TEST_DATABASE_URL: database })

// 2. Massa sintética.
const { PrismaClient, Prisma } = await import("../../generated/prisma/index.js")
const db = new PrismaClient({ datasourceUrl: database })
const secret = () => randomBytes(18).toString("base64url")
const passwords = { dono: secret(), gerente: secret(), vendedor: secret(), caixa: secret() }
const STORE = "e2e-apa-loja"
const STORE_OFF = "e2e-apa-sem-recurso"
try {
  await db.store.createMany({ data: [
    { id: STORE, name: "Loja Aparelhos E2E", profile: "ASSISTENCIA", moduleAccess: Prisma.DbNull, cnpj: "00.000.000/0001-91", phone: "(11) 4000-0000" },
    { id: STORE_OFF, name: "Loja Sem Aparelhos E2E", profile: "ASSISTENCIA", moduleAccess: Prisma.DbNull, cnpj: "00.000.000/0002-72", phone: "(11) 4000-0001" },
  ] })
  await db.storeSettings.create({ data: { storeId: STORE, printerConfig: {
    pdvMainLayout: "classic",
    capabilities: { version: 1, business: { primaryBranch: "assistencia" }, overrides: { "catalog.serializedDevices": true } },
  } } })
  await db.storeSettings.create({ data: { storeId: STORE_OFF, printerConfig: { capabilities: { version: 1, business: { primaryBranch: "assistencia" } } } } })
  await db.cliente.create({ data: { id: "e2e-apa-cliente", storeId: STORE, name: "Cliente Aparelho E2E", document: "52998224725", documentKey: "52998224725", phone: "11999990000" } })
  const user = async (email, name, password, role) => db.adminUser.create({ data: {
    email, name, role, lojaId: STORE, accessScope: "STORE", password: await bcrypt.hash(password, 10),
    adminUserStores: { create: [{ storeId: STORE }, { storeId: STORE_OFF }] },
  } })
  await user("dono@e2e-aparelhos.invalid", "Dono Sintético", passwords.dono, "ADMIN")
  await user("gerente@e2e-aparelhos.invalid", "Gerente Sintético", passwords.gerente, "GERENTE")
  await user("vendedor@e2e-aparelhos.invalid", "Vendedor Sintético", passwords.vendedor, "VENDEDOR")
  await user("caixa@e2e-aparelhos.invalid", "Caixa Sintético", passwords.caixa, "CAIXA")
} finally { await db.$disconnect() }

// 3. App real.
await mkdir(evidence, { recursive: true })
const appEnv = {
  ...process.env, NODE_ENV: "production", PORT, HOSTNAME: "127.0.0.1", DATABASE_URL: database, DIRECT_URL: database,
  AUTH_SECRET: secret(), AUTH_TRUST_HOST: "true", NEXTAUTH_URL: ORIGIN, AUTH_URL: ORIGIN, NEXT_TELEMETRY_DISABLED: "1",
  VERCEL_ENV: "development", MIGRATION_AUTHORITY_ENABLED: "false",
}
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", PORT], { env: appEnv, stdio: ["ignore", "inherit", "inherit"] })
let status = "FAIL"
try {
  const deadline = Date.now() + 120_000
  for (;;) {
    try { if ((await fetch(`${ORIGIN}/login`)).ok) break } catch { /* subindo */ }
    if (Date.now() > deadline || server.exitCode !== null) throw new Error("APARELHOS_E2E_SERVER_NOT_READY")
    await new Promise((r) => setTimeout(r, 1000))
  }
  run(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "--config", "e2e/aparelhos.playwright.config.ts", ...process.argv.slice(2)], {
    ...process.env, APARELHOS_E2E_BASE_URL: ORIGIN, APARELHOS_E2E_DATABASE_URL: database,
    APARELHOS_E2E_PW_DONO: passwords.dono, APARELHOS_E2E_PW_GERENTE: passwords.gerente,
    APARELHOS_E2E_PW_VENDEDOR: passwords.vendedor, APARELHOS_E2E_PW_CAIXA: passwords.caixa,
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
    database: "PostgreSQL descartável loopback (baseline main + migration aditiva + drift zero)",
    auth: "NextAuth Credentials real; usuários sintéticos com senha aleatória por execução",
    productionWrites: 0,
  }, null, 2) + "\n")
}
