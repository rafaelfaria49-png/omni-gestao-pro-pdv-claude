/** NextAuth real + Next production + PostgreSQL fresco. Nenhum .env/provedor produtivo. */
import { spawn, spawnSync } from "node:child_process"
import { randomBytes, randomInt, createHmac } from "node:crypto"
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import path from "node:path"
import bcrypt from "bcryptjs"
import { assertFreshDisposableDatabase } from "../cadastros/disposable-db-preflight.mjs"

const database = "postgresql://platform_pilot:isolated_ci_only@127.0.0.1:5432/platform_pilot_isolated"
if (process.env.CI !== "true" || process.env.PLATFORM_PILOT_DISPOSABLE_DB !== "true" ||
    process.env.MIGRATION_AUTHORITY_ENABLED !== "false" || process.env.DATABASE_URL !== database || process.env.DIRECT_URL !== database) {
  throw new Error("PILOT_FRESH_CI_DATABASE_REQUIRED")
}
for (const name of [".env", ".env.local", ".env.production", ".env.production.local"]) {
  try { await readFile(name); throw new Error("PILOT_ENV_FILE_FORBIDDEN") } catch (e) { if (e.code !== "ENOENT") throw e }
}
const out = "test-results/platform-pilot"
await mkdir(out, { recursive: true })
function run(args, env = process.env) {
  const r = spawnSync(process.execPath, args, { env, stdio: "inherit" })
  if (r.error || r.status !== 0) throw new Error("PILOT_STEP_FAILED")
}
const secret = () => "aA1!" + randomBytes(24).toString("hex")
const passwords = Object.fromEntries(["owner", "adminA", "managerA", "adminB", "multi", "cashier", "seller", "temporary", "legacy", "onboardingMulti"].map((k) => [k, secret()]))
passwords.supervisor = String(randomInt(10_000_000, 100_000_000))
const appSecret = secret()
const { PrismaClient } = await import("../../generated/prisma/index.js")
const db = new PrismaClient({ datasourceUrl: database })
try {
  await assertFreshDisposableDatabase(db, { database: "platform_pilot_isolated", role: "platform_pilot" })
  // O schema anterior é derivado removendo SOMENTE os quatro campos aditivos.
  let before = await readFile("prisma/schema.prisma", "utf8")
  for (const field of ["moduleAccess", "accessScope", "mustChangePassword", "sessionVersion"]) {
    const regex = new RegExp("^\\s*" + field + "\\s+.*$", "gm")
    if ([...before.matchAll(regex)].length !== 1) throw new Error("PILOT_SCHEMA_BASELINE_MISMATCH")
    before = before.replace(regex, "")
  }
  const oldSchema = path.join(out, "schema-before.prisma")
  await writeFile(oldSchema, before)
  run(["node_modules/prisma/build/index.js", "db", "push", "--schema", oldSchema, "--skip-generate"])
  const legacyHash = await bcrypt.hash(passwords.owner, 10)
  await db.$executeRaw`INSERT INTO stores (id, name, cnpj, "updatedAt") VALUES ('pilot-legacy', 'Loja Legada Sintética', '00.000.000/0001-00', now())`
  await db.$executeRaw`INSERT INTO admin_users (id, name, email, password, role, "updatedAt") VALUES ('pilot-owner', 'Responsável Interno Sintético', 'owner@pilot.invalid', ${legacyHash}, 'ADMIN'::"UserRole", now())`
  run(["node_modules/prisma/build/index.js", "db", "execute", "--schema", "prisma/schema.prisma", "--file", "prisma/migrations/20261022120000_platform_pilot_access/migration.sql"])
  const oldUser = await db.adminUser.findUniqueOrThrow({ where: { id: "pilot-owner" } })
  const oldStore = await db.store.findUniqueOrThrow({ where: { id: "pilot-legacy" } })
  const legacyChecks = { scopeNull: oldUser.accessScope === null, versionZero: oldUser.sessionVersion === 0, passwordPreserved: oldUser.password === legacyHash, modulesNull: oldStore.moduleAccess === null }
  if (Object.values(legacyChecks).some((ok) => !ok)) throw new Error("PILOT_LEGACY_MIGRATION_CHANGED_AUTHORITY " + JSON.stringify(legacyChecks))
  await writeFile(path.join(out, "migration.json"), JSON.stringify({ applied: true, target: "fresh disposable CI PostgreSQL", legacyAuthorityPreserved: true, accountsReclassified: 0, passwordsChanged: 0, productionWrites: 0 }, null, 2))
  await db.store.createMany({ data: [
    { id: "pilot-a", name: "Padaria Piloto A" }, { id: "pilot-b", name: "Comércio Piloto B" },
    { id: "pilot-initial-a", name: "Padaria Inicial A", phone: "11999990011", logoUrl: "/synthetic-logo.svg", address: { rua: "Rua Sintética A", numero: 42, complemento: "Fundos A", cadastroExtra: "preservado" } },
    { id: "pilot-initial-b", name: "Padaria Inicial B", phone: "11999990022", logoUrl: "/synthetic-logo-b.svg", address: { rua: "Rua Sintética B" } },
  ] })
  for (const [id, branch] of [["pilot-a", "padaria"], ["pilot-b", "comercio"], ["pilot-legacy", "assistencia"], ["pilot-initial-a", "padaria"], ["pilot-initial-b", "padaria"]]) {
    await db.storeSettings.create({ data: { storeId: id, ...(id.startsWith("pilot-initial-") ? { contactEmail: `${id}@pilot.invalid`, contactWhatsapp: "11999990033", contactWhatsappDono: "11999990044" } : {}), printerConfig: { pdvMainLayout: "classic", untouched: "preservado", capabilities: { version: 1, business: { primaryBranch: branch } } } } })
  }
  const users = [
    ["adminA", "ADMIN", "pilot-a", ["pilot-a"], false], ["managerA", "GERENTE", "pilot-a", ["pilot-a"], false],
    ["adminB", "ADMIN", "pilot-b", ["pilot-b"], false], ["multi", "GERENTE", "pilot-a", ["pilot-a", "pilot-b"], false],
    ["cashier", "CAIXA", "pilot-a", ["pilot-a"], false], ["seller", "VENDEDOR", "pilot-a", ["pilot-a"], false],
    ["temporary", "VENDEDOR", "pilot-a", ["pilot-a"], true], ["legacy", "OPERADOR", "pilot-legacy", ["pilot-legacy"], false],
    ["onboardingMulti", "ADMIN", "pilot-initial-a", ["pilot-initial-a", "pilot-initial-b"], false],
  ]
  for (const [id, role, lojaId, stores, mustChangePassword] of users) {
    await db.adminUser.create({ data: { id: `pilot-${id}`, email: `${id.toLowerCase()}@pilot.invalid`, name: `Sintético ${id}`, role,
      lojaId, accessScope: id === "legacy" ? null : "STORE", password: await bcrypt.hash(passwords[id], 10), mustChangePassword,
      adminUserStores: { create: stores.map((storeId) => ({ storeId })) },
    } })
  }
  await db.cliente.createMany({ data: [
    { id: "pilot-client-a", storeId: "pilot-a", name: "Cliente Sintético A", phone: "11999990001", email: "private-a@pilot.invalid" },
    { id: "pilot-client-b", storeId: "pilot-b", name: "Cliente Sintético B", phone: "11999990002", email: "private-b@pilot.invalid" },
  ] })
  await db.contaReceberTitulo.createMany({ data: [
    { storeId: "pilot-a", cliente: "Financeiro Privado A", valor: 71, status: "pago", vencimento: "2026-10-22" },
    { storeId: "pilot-b", cliente: "Financeiro Privado B", valor: 999123, status: "pago", vencimento: "2026-10-22" },
  ] })
  await db.carteiraFinanceira.create({ data: { id: "pilot-wallet-b", storeId: "pilot-b", nome: "Carteira Privada B" } })
  await db.conciliacaoFinanceira.create({ data: { id: "pilot-reconciliation-b", storeId: "pilot-b", carteiraId: "pilot-wallet-b", dataReferencia: "2026-10-22", status: "conciliado", observacao: "Observação Privada B" } })
  await db.user.create({ data: { name: "Supervisor Sintético", role: "ADMIN", pin: "x:" + randomBytes(16).toString("hex"), pinHash: await bcrypt.hash(createHmac("sha256", appSecret).update(passwords.supervisor, "utf8").digest("hex"), 10) } })
  await db.pdvTerminal.create({ data: { id: "pilot-terminal-b", storeId: "pilot-b", code: "PDV1", name: "Terminal Privado B", status: "ACTIVE" } })
  await db.sessaoCaixa.create({ data: { id: "pilot-cash-b", storeId: "pilot-b", operador: "Operador Privado B", status: "ABERTA", saldoInicial: 0 } })
} finally { await db.$disconnect() }

// NextURL canonicalizes loopback IPs to localhost. Use the same browser/server
// origin so the existing password endpoint's same-origin check remains effective.
const origin = "http://localhost:3000"
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "localhost", "-p", "3000"], {
  env: { ...process.env, NODE_ENV: "production", AUTH_SECRET: appSecret, AUTH_TRUST_HOST: "true", NEXTAUTH_URL: origin, NEXT_TELEMETRY_DISABLED: "1" },
  stdio: ["ignore", "inherit", "inherit"],
})
let status = "FAIL"
try {
  const deadline = Date.now() + 120_000
  for (;;) {
    try { if ((await fetch(origin + "/login")).ok) break } catch { /* starting */ }
    if (Date.now() > deadline || server.exitCode !== null) throw new Error("PILOT_APP_NOT_READY")
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  run(["node_modules/@playwright/test/cli.js", "test", "--config", "e2e/platform-pilot.playwright.config.ts"], {
    ...process.env, PILOT_BASE_URL: origin, PILOT_TEST_DATABASE_URL: database,
    ...Object.fromEntries(Object.entries(passwords).map(([k, v]) => [`PILOT_PASSWORD_${k.toUpperCase()}`, v])),
  })
  status = "PASS"
} finally {
  server.kill("SIGTERM")
  for (const name of await readdir(out, { recursive: true })) {
    if (!/\.(json|txt|log|md)$/.test(name)) continue
    const file = path.join(out, name)
    let text = await readFile(file, "utf8")
    for (const value of Object.values(passwords)) text = text.split(value).join("[REDACTED]")
    await writeFile(file, text)
  }
  await writeFile(path.join(out, "isolation.json"), JSON.stringify({ status, database: "fresh CI PostgreSQL with catalog identity and emptiness verified", authentication: "real NextAuth Credentials", syntheticDataOnly: true, productionWrites: 0, migrationAuthorityEnabled: false }, null, 2))
}
