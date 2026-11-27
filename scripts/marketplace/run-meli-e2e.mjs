#!/usr/bin/env node
/**
 * Next.js compilado + NextAuth real + PostgreSQL descartável. Somente o provedor externo usa fixture.
 * Use MELI_E2E_BOOTSTRAP_DATABASE_URL e MELI_E2E_DATABASE_URL no mesmo banco local descartável.
 */
import { localFixtureDatasource } from "../../lib/db/datasource-policy.mjs"
import { spawn, spawnSync } from "node:child_process"
import { randomBytes } from "node:crypto"
import { once } from "node:events"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import bcrypt from "bcryptjs"
import forge from "node-forge"
import { Prisma, PrismaClient } from "../../generated/prisma/index.js"
import { createMarketplaceQaIngress, waitForQaNext } from "./qa-ingress.mjs"
import { attestMarketplaceQaDatasource, marketplaceQaGrants, marketplaceStoreLockColumn } from "./qa-datasource.mjs"

const database = process.env.MELI_E2E_DATABASE_URL ?? ""
const bootstrap = process.env.MELI_E2E_BOOTSTRAP_DATABASE_URL ?? ""
localFixtureDatasource(database)
localFixtureDatasource(bootstrap)
const url = new URL(database)
const adminUrl = new URL(bootstrap)
if (url.protocol !== "postgresql:" || url.hostname !== "127.0.0.1" || url.username !== "meli_qa" ||
  !/^\/omni_meli_e2e(?:_[a-z0-9]{1,20})?$/.test(url.pathname) || url.search || url.hash ||
  !/^[A-Za-z0-9_-]{12,96}$/.test(url.password) ||
  adminUrl.protocol !== url.protocol || adminUrl.host !== url.host || adminUrl.pathname !== url.pathname ||
  adminUrl.username !== "meli_qa_bootstrap" || adminUrl.search || adminUrl.hash || adminUrl.password === url.password) {
  throw new Error("Use um banco PostgreSQL descartável no loopback para o E2E Mercado Livre.")
}
const httpsPort = Number(process.env.MELI_E2E_HTTPS_PORT ?? 3119)
const appPort = Number(process.env.MELI_E2E_APP_PORT ?? 3120)
const origin = `https://127.0.0.1:${httpsPort}`
const evidence = path.resolve("test-results/marketplace-meli")
const events = path.join(evidence, "provider-events.log")
const ingressEvents = []
const password = randomBytes(24).toString("base64url")
const secret = () => randomBytes(32).toString("base64url")
const authSecret = secret()
const clientSecret = secret()
const encryptionKey = secret()
const localEnv = {
  ...process.env, DATABASE_URL: database, DIRECT_URL: database, CHECKPOINT_DISABLE: "1",
  VERCEL: "0", VERCEL_ENV: "development", MIGRATION_AUTHORITY_ENABLED: "false",
}
delete localEnv.MELI_E2E_BOOTSTRAP_DATABASE_URL

function run(args, env = localEnv, input) {
  const result = spawnSync(process.execPath, args, {
    env, input, encoding: "utf8",
    stdio: input ? ["pipe", "inherit", "inherit"] : "inherit",
  })
  if (result.error || result.status !== 0) throw new Error(`Etapa de QA falhou: ${args.slice(0, 3).join(" ")}`)
}

await mkdir(evidence, { recursive: true })
await writeFile(events, "")
const db = new PrismaClient({ datasourceUrl: bootstrap })
try {
  const [existing] = await db.$queryRaw`SELECT count(*)::int AS total FROM pg_tables WHERE schemaname = 'public'`
  if (existing.total !== 0) throw new Error("O banco descartável de QA deve estar vazio.")
  // DDL derivado do schema versionado. Não roda migrate deploy, db push nem histórico de migrations.
  const bootstrapEnv = { ...localEnv, DATABASE_URL: bootstrap, DIRECT_URL: bootstrap }
  const ddl = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "diff",
    "--from-empty", "--to-schema-datamodel", "prisma/schema.prisma", "--script"], { env: bootstrapEnv, encoding: "utf8" })
  if (ddl.error || ddl.status !== 0 || !ddl.stdout.includes("CREATE TABLE")) throw new Error("Não foi possível preparar o schema descartável.")
  run(["node_modules/prisma/build/index.js", "db", "execute", "--stdin", "--schema", "prisma/schema.prisma"], bootstrapEnv, ddl.stdout)
  await db.$executeRawUnsafe(`CREATE ROLE meli_qa LOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB NOREPLICATION NOBYPASSRLS PASSWORD '${url.password}'`)
  await db.$executeRawUnsafe("GRANT USAGE ON SCHEMA public TO meli_qa")
  for (const [table, grants] of marketplaceQaGrants) {
    await db.$executeRawUnsafe(`GRANT ${grants.join(", ")} ON TABLE public.${table} TO meli_qa`)
  }
  await db.$executeRawUnsafe(`GRANT UPDATE ("${marketplaceStoreLockColumn}") ON TABLE public.stores TO meli_qa`)

  const stores = [
    { id: "meli-qa-a", cnpj: "00.000.000/0001-91" },
    { id: "meli-qa-b", cnpj: "00.000.000/0002-72" },
    { id: "meli-qa-off", cnpj: "00.000.000/0003-53" },
    { id: "meli-qa-no-module", cnpj: "00.000.000/0004-34" },
    { id: "meli-qa-new", cnpj: "00.000.000/0005-15" },
  ]
  await db.store.createMany({ data: stores.map((store) => ({
    ...store, name: store.id, moduleAccess: store.id === "meli-qa-no-module" ? { version: 1, modules: ["home"] } : Prisma.DbNull,
  })) })
  const users = [
    ["manager-a", ["meli-qa-a", "meli-qa-off", "meli-qa-no-module", "meli-qa-new"]],
    ["manager-b", ["meli-qa-b"]],
    ["second-a", ["meli-qa-a"]],
  ]
  const passwordHash = await bcrypt.hash(password, 10)
  for (const [name, units] of users) await db.adminUser.create({ data: {
    email: `${name}@marketplace-qa.invalid`, name, lojaId: units[0], role: "ADMIN", accessScope: "STORE", password: passwordHash,
    adminUserStores: { create: units.map((storeId) => ({ storeId })) },
  } })
  await db.marketplaceConnection.create({ data: {
    id: "meli-qa-legacy", storeId: "meli-qa-a", provider: "MERCADO_LIVRE", accountName: "Conta simulada QA",
    status: "CONNECTED", accessToken: "[encrypted:placeholder]",
    syncLogs: { create: { storeId: "meli-qa-a", message: "Pedidos importados" } },
  } })
  await db.produto.create({ data: { id: "meli-qa-item", storeId: "meli-qa-a", name: "Produto interno QA", sku: "INT-QA", price: 10.25, stock: 19 } })
} finally {
  await db.$disconnect()
}

const keys = forge.pki.rsa.generateKeyPair(2048)
const cert = forge.pki.createCertificate()
cert.publicKey = keys.publicKey
cert.serialNumber = "01"
cert.validity.notBefore = new Date(Date.now() - 60_000)
cert.validity.notAfter = new Date(Date.now() + 86_400_000)
const commonName = [{ name: "commonName", value: "Mercado Livre QA localhost" }]
cert.setSubject(commonName)
cert.setIssuer(commonName)
cert.setExtensions([{ name: "subjectAltName", altNames: [{ type: 7, ip: "127.0.0.1" }] }])
cert.sign(keys.privateKey, forge.md.sha256.create())
const runtimeEnv = {
  ...localEnv, NODE_ENV: "production", AUTH_URL: origin, NEXTAUTH_URL: origin, AUTH_TRUST_HOST: "true",
  AUTH_SECRET: authSecret, AUTH_SESSION_REVOCATION: "on", NEXT_TELEMETRY_DISABLED: "1",
  OTEL_SDK_DISABLED: "true", OTEL_TRACES_EXPORTER: "none", VERCEL_ENV: "preview", MELI_OAUTH_ENABLED: "1",
  MELI_OAUTH_STORE_ALLOWLIST: "meli-qa-a,meli-qa-b,meli-qa-no-module,meli-qa-new",
  MELI_OAUTH_CLIENT_ID: "99990001", MELI_OAUTH_CLIENT_SECRET: clientSecret, MELI_OAUTH_ENCRYPTION_KEY: encryptionKey,
  MELI_OAUTH_REDIRECT_URI: origin + "/api/marketplace/mercado-livre/callback", MELI_E2E_PROVIDER_EVENTS: events,
}
for (const variable of ["NEXTAUTH_SECRET", "AUTH_SECRET_1", "AUTH_SECRET_2", "AUTH_SECRET_3", "NODE_DEBUG", "NODE_OPTIONS"]) {
  delete runtimeEnv[variable]
}
await attestMarketplaceQaDatasource(runtimeEnv)
const proxy = createMarketplaceQaIngress({
  origin, upstreamPort: appPort,
  tls: { key: forge.pki.privateKeyToPem(keys.privateKey), cert: forge.pki.certificateToPem(cert) },
  record: (event) => ingressEvents.push(event),
})
const app = spawn(process.execPath, [
  "--import", "./scripts/marketplace/meli-provider-fixture.mjs",
  "node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(appPort),
], {
  env: runtimeEnv,
  stdio: ["ignore", "pipe", "pipe"],
})
// O conteúdo obtido do runtime é verificado em memória e nunca gravado como log bruto.
let appOutput = ""
let outputLimitExceeded = false
function capture(chunk) {
  if (appOutput.length + chunk.length > 1_000_000) {
    outputLimitExceeded = true
    return
  }
  appOutput += chunk
}
app.stdout.setEncoding("utf8").on("data", capture)
app.stderr.setEncoding("utf8").on("data", capture)
try {
  await waitForQaNext(app)
  proxy.listen(httpsPort, "127.0.0.1")
  await once(proxy, "listening")
  // O proxy HTTPS roda neste processo e precisa manter o event loop livre durante o Playwright.
  const browser = spawn(process.execPath, [
    "node_modules/@playwright/test/cli.js", "test", "--config", "e2e/marketplace-meli.playwright.config.ts", ...process.argv.slice(2),
  ], {
    env: {
      ...localEnv, MELI_E2E_BASE_URL: origin, MELI_E2E_PASSWORD: password, MELI_E2E_PROVIDER_EVENTS: events,
      MELI_E2E_BOOTSTRAP_DATABASE_URL: bootstrap, MELI_E2E_AUTH_SECRET: authSecret,
    },
    stdio: "inherit",
  })
  const [status] = await once(browser, "exit")
  if (status !== 0) throw new Error("O Playwright reprovou o E2E do Marketplace.")
  if (outputLimitExceeded || [password, authSecret, clientSecret, encryptionKey].some((value) => appOutput.includes(value)) ||
      /qa-(access|refresh|ingress)-|(?:__Host-omni-meli-oauth|authjs\.session-token)=[\w.-]+|\/mercado-livre\/callback[^\s]*[?&](code|state)=/i.test(appOutput)) {
    throw new Error("A saída em memória do app falhou na revisão de dados sintéticos.")
  }
  if (!ingressEvents.some(({ route, status }) => route.endsWith("/callback") && status === 303) ||
      /qa-(access|refresh|ingress)-|[?&](code|state)=/i.test(JSON.stringify(ingressEvents)) ||
      (await readFile(events, "utf8")).split("\n").some((line) => !["", "exchange", "refresh", "identity", "search", "multiget"].includes(line))) {
    throw new Error("A evidência de ingresso ou provedor de QA falhou na validação.")
  }
  await writeFile(path.join(evidence, "ingress-events.jsonl"), ingressEvents.map((event) => JSON.stringify(event)).join("\n") + "\n")
  console.log("QA OAuth: par de banco atestado, registros do ingresso e saída do app verificados.")
} finally {
  app.kill()
  proxy.close()
}
