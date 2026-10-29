/** Starts only this worktree's built app against the proven local synthetic database. */
import { spawn, spawnSync } from "node:child_process"
import { randomBytes, randomInt, createHmac } from "node:crypto"
import { mkdir, open } from "node:fs/promises"
import bcrypt from "bcryptjs"
import { PrismaClient } from "../../generated/prisma/index.js"
const database = "postgresql://manual_kg@127.0.0.1:55479/manual_kg_sale_isolated"
if (process.env.DATABASE_URL !== database || process.env.DIRECT_URL !== database || process.env.MIGRATION_AUTHORITY_ENABLED !== "false") throw Error("MANUAL_KG_LOCAL_E2E_DATABASE_REQUIRED")
const origin = "http://localhost:31479"
const run = randomBytes(3).toString("hex")
const store = "kg-e2e-" + run
const secret = () => "aA1!" + randomBytes(24).toString("hex")
const password = secret(), appSecret = secret(), pin = String(randomInt(10000000, 99999999))
const db = new PrismaClient({ datasourceUrl: database })
try {
 const [identity] = await db.$queryRawUnsafe("SELECT current_database() AS db, current_user AS role, host(inet_server_addr()) AS host, inet_server_port() AS port")
 if (identity.db !== "manual_kg_sale_isolated" || identity.role !== "manual_kg" || identity.host !== "127.0.0.1" || identity.port !== 55479) throw Error("DATABASE_IDENTITY_MISMATCH")
 if (await db.store.count({ where: { id: { startsWith: "kg-e2e-" } } })) throw Error("FRESH_MANUAL_KG_E2E_DATABASE_REQUIRED: repeat the fresh integration setup before another E2E run")
 await db.store.create({ data: { id: store, name: "Padaria sintética KG E2E", codigoNumeracaoVenda: "K" + run.slice(0, 6).toUpperCase(), moduleAccess: { version: 1, modules: ["home", "pdv", "sales", "cash", "catalog", "stock", "reports", "settings"] } } })
 await db.storeSettings.create({ data: { storeId: store, printerConfig: { pdvMainLayout: "classic", pdvParams: { pdvClassicLayout: "lovable" }, capabilities: { version: 1, business: { primaryBranch: "padaria" } }, impressao: { autoImprimirAposVenda: false } } } })
 for (const [actor, role, scope] of [["a01", "ADMIN", null], ["admin", "ADMIN", "STORE"], ["cashier", "CAIXA", "STORE"]]) {
  await db.adminUser.create({ data: { id: store + "-" + actor, email: actor + "-" + run + "@kg.invalid", name: "Sintético " + actor, role, accessScope: scope, lojaId: store, password: await bcrypt.hash(password, 10), mustChangePassword: false, adminUserStores: { create: [{ storeId: store }] } } })
 }
 await db.user.create({ data: { id: store + "-supervisor", name: "Supervisor sintético", role: "ADMIN", pin: "x:" + randomBytes(16).toString("hex"), pinHash: await bcrypt.hash(createHmac("sha256", appSecret).update(pin, "utf8").digest("hex"), 10) } })
 await db.sessaoCaixa.create({ data: { id: store + "-cash", storeId: store, operador: "Sintético", status: "ABERTA", saldoInicial: 0 } })
 await db.produto.create({ data: { id: store + "-other", storeId: "kg-sale-b", name: "Outro estabelecimento", price: 20, stock: 10, metadata: { comercial: { version: 1, modoVenda: "peso", unidade: "KG", basePreco: "KG" } } } })
} finally { await db.$disconnect() }
await mkdir("test-results/manual-kg", { recursive: true })
const log = await open("test-results/manual-kg/next-server.log", "w")
const env = { ...process.env, NODE_ENV: "production", AUTH_SECRET: appSecret, AUTH_TRUST_HOST: "true", NEXTAUTH_URL: origin,
 NEXT_TELEMETRY_DISABLED: "1", PDV_MANUAL_KG_RELEASE: "PDV-PADARIA-VENDA-MANUAL-KG-MVP-001", PDV_MANUAL_KG_STORES: store }
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "localhost", "-p", "31479"], { env, stdio: ["ignore", log.fd, log.fd], windowsHide: true })
try {
 const deadline = Date.now() + 90000
 for (;;) {
  try { if ((await fetch(origin + "/login")).ok) break } catch { /* starting */ }
  if (Date.now() > deadline || server.exitCode !== null) throw Error("MANUAL_KG_APP_NOT_READY")
  await new Promise((resolve) => setTimeout(resolve, 500))
 }
 const result = spawnSync(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "--config", "e2e/manual-kg.playwright.config.ts", ...process.argv.slice(2)], { env: { ...env, MANUAL_KG_E2E_ORIGIN: origin, MANUAL_KG_E2E_STORE: store, MANUAL_KG_E2E_RUN: run, MANUAL_KG_E2E_PASSWORD: password, MANUAL_KG_E2E_PIN: pin }, stdio: "inherit", windowsHide: true })
 if (result.error || result.status !== 0) process.exitCode = 1
} finally { server.kill(); await log.close() }
