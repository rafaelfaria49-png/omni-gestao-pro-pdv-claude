#!/usr/bin/env node
/**
 * Next.js compilado + NextAuth real + PostgreSQL descartável. Somente o provedor externo usa fixture.
 * Uso: MELI_E2E_DATABASE_URL=postgresql://meli_qa:...@127.0.0.1:5432/omni_meli_e2e node scripts/marketplace/run-meli-e2e.mjs
 */
import { spawn, spawnSync } from "node:child_process"
import { randomBytes } from "node:crypto"
import { createWriteStream } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { request as httpRequest } from "node:http"
import { createServer } from "node:https"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import bcrypt from "bcryptjs"
import forge from "node-forge"
import { Prisma, PrismaClient } from "../../generated/prisma/index.js"

const database = process.env.MELI_E2E_DATABASE_URL ?? ""
const url = new URL(database)
if (url.protocol !== "postgresql:" || url.hostname !== "127.0.0.1" || url.username !== "meli_qa" ||
  !/^\/omni_meli_e2e(?:_[a-z0-9]{1,20})?$/.test(url.pathname) || url.search || url.hash) {
  throw new Error("Use um banco PostgreSQL descartável no loopback para o E2E Mercado Livre.")
}
const httpsPort = Number(process.env.MELI_E2E_HTTPS_PORT ?? 3119)
const appPort = Number(process.env.MELI_E2E_APP_PORT ?? 3120)
const origin = `https://127.0.0.1:${httpsPort}`
const evidence = path.resolve("test-results/marketplace-meli")
const events = path.join(evidence, "provider-events.log")
const password = randomBytes(24).toString("base64url")
const secret = () => randomBytes(32).toString("base64url")
const localEnv = {
  ...process.env, DATABASE_URL: database, DIRECT_URL: database, CHECKPOINT_DISABLE: "1",
  VERCEL: "0", VERCEL_ENV: "development", MIGRATION_AUTHORITY_ENABLED: "false",
}

function run(args, env = localEnv, input) {
  const result = spawnSync(process.execPath, args, {
    env, input, encoding: "utf8",
    stdio: input ? ["pipe", "inherit", "inherit"] : "inherit",
  })
  if (result.error || result.status !== 0) throw new Error(`Etapa de QA falhou: ${args.slice(0, 3).join(" ")}`)
}

await mkdir(evidence, { recursive: true })
await writeFile(events, "")
const db = new PrismaClient({ datasourceUrl: database })
try {
  const [existing] = await db.$queryRaw`SELECT count(*)::int AS total FROM pg_tables WHERE schemaname = 'public'`
  if (existing.total !== 0) throw new Error("O banco descartável de QA deve estar vazio.")
  // DDL derivado do schema versionado. Não roda migrate deploy, db push nem histórico de migrations.
  const ddl = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "diff",
    "--from-empty", "--to-schema-datamodel", "prisma/schema.prisma", "--script"], { env: localEnv, encoding: "utf8" })
  if (ddl.error || ddl.status !== 0 || !ddl.stdout.includes("CREATE TABLE")) throw new Error("Não foi possível preparar o schema descartável.")
  run(["node_modules/prisma/build/index.js", "db", "execute", "--stdin", "--schema", "prisma/schema.prisma"], localEnv, ddl.stdout)

  const stores = ["meli-qa-a", "meli-qa-b", "meli-qa-off", "meli-qa-no-module"]
  await db.store.createMany({ data: stores.map((id) => ({
    id, name: id, moduleAccess: id === "meli-qa-no-module" ? { version: 1, modules: ["home"] } : Prisma.DbNull,
  })) })
  const users = [
    ["manager-a", ["meli-qa-a", "meli-qa-off", "meli-qa-no-module"]],
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
const proxy = createServer({ key: forge.pki.privateKeyToPem(keys.privateKey), cert: forge.pki.certificateToPem(cert) }, (req, res) => {
  const upstream = httpRequest({
    hostname: "127.0.0.1", port: appPort, path: req.url, method: req.method,
    headers: { ...req.headers, "x-forwarded-proto": "https", "x-forwarded-host": new URL(origin).host },
  }, (response) => {
    res.writeHead(response.statusCode ?? 502, response.headers)
    response.pipe(res)
  })
  upstream.on("error", () => {
    res.writeHead(502)
    res.end()
  })
  req.pipe(upstream)
})
await new Promise((resolve, reject) => {
  proxy.once("error", reject)
  proxy.listen(httpsPort, "127.0.0.1", resolve)
})
const serverOutput = createWriteStream(path.join(evidence, "next.log"))
const app = spawn(process.execPath, [
  "--import", "./scripts/marketplace/meli-provider-fixture.mjs",
  "node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(appPort),
], {
  env: {
    ...localEnv, NODE_ENV: "production", AUTH_URL: origin, NEXTAUTH_URL: origin, AUTH_TRUST_HOST: "true", AUTH_SECRET: secret(),
    NEXT_TELEMETRY_DISABLED: "1", MELI_OAUTH_ENABLED: "1", MELI_OAUTH_STORE_ALLOWLIST: "meli-qa-a,meli-qa-b,meli-qa-no-module",
    MELI_OAUTH_CLIENT_ID: "99990001", MELI_OAUTH_CLIENT_SECRET: secret(), MELI_OAUTH_ENCRYPTION_KEY: secret(),
    MELI_OAUTH_REDIRECT_URI: origin + "/api/marketplace/mercado-livre/callback", MELI_E2E_PROVIDER_EVENTS: events,
  },
  stdio: ["ignore", "pipe", "pipe"],
})
app.stdout.pipe(serverOutput, { end: false })
app.stderr.pipe(serverOutput, { end: false })
try {
  const deadline = Date.now() + 120_000
  for (;;) {
    try {
      if ((await fetch(`http://127.0.0.1:${appPort}/login`)).ok) break
    } catch { /* Aguardando o app compilado. */ }
    if (app.exitCode !== null || Date.now() > deadline) throw new Error("Next.js de QA indisponível. Consulte o log local de testes.")
    await delay(1_000)
  }
  run(["node_modules/@playwright/test/cli.js", "test", "--config", "e2e/marketplace-meli.playwright.config.ts", ...process.argv.slice(2)], {
    ...localEnv, MELI_E2E_BASE_URL: origin, MELI_E2E_PASSWORD: password, MELI_E2E_PROVIDER_EVENTS: events,
  })
} finally {
  app.kill()
  proxy.close()
  serverOutput.end()
}
