/**
 * QA do OmniGestão Desktop contra a STACK REAL, isolada nesta máquina:
 * NextAuth real + `next start` (Service Worker real do PWA) + PostgreSQL DESCARTÁVEL local.
 *
 * Nenhum .env, nenhum Preview, nenhum provedor produtivo. Contas, lojas e dados são sintéticos,
 * criados aqui; as senhas existem só em memória (repassadas ao teste pelo ambiente do processo
 * filho) e são removidas de todo artefato no final.
 *
 * Pré-requisitos (na raiz do repositório):
 *   - `npm run build` concluído (AUTH_SECRET/DATABASE_URL de build fictícios);
 *   - PostgreSQL descartável em 127.0.0.1, banco `omni_desktop_qa`, papel `desktop_qa`, vazio,
 *     postmaster iniciado há menos de 3 h;
 *   - apps/desktop compilado (`npm run build` em apps/desktop).
 *
 * Uso (na raiz): DESKTOP_QA_DATABASE_URL=postgresql://desktop_qa@127.0.0.1:55473/omni_desktop_qa \
 *                node apps/desktop/tests/real-stack/run.mjs
 */
import { spawn, spawnSync } from "node:child_process"
import { randomBytes } from "node:crypto"
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import path from "node:path"
import bcrypt from "bcryptjs"
import { assertFreshDisposableDatabase } from "../../../../scripts/cadastros/disposable-db-preflight.mjs"

const database = process.env.DESKTOP_QA_DATABASE_URL ?? ""
const parsed = (() => {
  try {
    return new URL(database)
  } catch {
    return null
  }
})()
if (
  !parsed ||
  parsed.protocol !== "postgresql:" ||
  parsed.hostname !== "127.0.0.1" ||
  parsed.pathname !== "/omni_desktop_qa" ||
  parsed.username !== "desktop_qa"
) {
  throw new Error("DESKTOP_QA_LOOPBACK_DISPOSABLE_DATABASE_REQUIRED")
}
for (const name of [".env", ".env.local", ".env.production", ".env.production.local", ".env.development.local"]) {
  try {
    await readFile(name)
    throw new Error("DESKTOP_QA_ENV_FILE_FORBIDDEN " + name)
  } catch (e) {
    if (e.code !== "ENOENT") throw e
  }
}

const out = path.resolve("apps/desktop/test-results/real-stack")
await mkdir(out, { recursive: true })
const port = Number(process.env.DESKTOP_QA_PORT ?? 3005)
const origin = `http://localhost:${port}` // localhost (não 127.0.0.1): o signout do NextAuth canoniza para localhost
// Allowlist: nenhuma chave de provedor (Stripe, OpenAI, WhatsApp…) do shell chega à stack isolada.
const PASS_ENV = ["PATH", "Path", "PATHEXT", "SystemRoot", "SYSTEMROOT", "windir", "TEMP", "TMP", "USERPROFILE", "HOME",
  "APPDATA", "LOCALAPPDATA", "ProgramFiles", "ProgramFiles(x86)", "ProgramData", "COMSPEC", "NUMBER_OF_PROCESSORS",
  "PROCESSOR_ARCHITECTURE", "OS", "USERNAME", "HOMEDRIVE", "HOMEPATH", "PLAYWRIGHT_BROWSERS_PATH"]
const baseEnv = Object.fromEntries(PASS_ENV.filter((k) => process.env[k] !== undefined).map((k) => [k, process.env[k]]))
const env = { ...baseEnv, NODE_OPTIONS: "--max-old-space-size=4096", DATABASE_URL: database, DIRECT_URL: database, MIGRATION_AUTHORITY_ENABLED: "false", VERCEL: "0", VERCEL_ENV: "development" }
function run(args, extraEnv = {}, cwd = process.cwd()) {
  const r = spawnSync(process.execPath, args, { env: { ...env, ...extraEnv }, stdio: "inherit", cwd })
  if (r.error || r.status !== 0) throw new Error("DESKTOP_QA_STEP_FAILED " + args.slice(0, 2).join(" "))
}

const secret = () => "aA1!" + randomBytes(18).toString("hex")
const passwords = { adminA: secret(), operadorB: secret() }
const appSecret = secret()

const { PrismaClient } = await import("../../../../generated/prisma/index.js")
const { BASIC_MODULE_ACCESS } = await import("../../../../lib/auth/access-policy.ts").catch(() => ({ BASIC_MODULE_ACCESS: null }))
const db = new PrismaClient({ datasourceUrl: database })
try {
  await assertFreshDisposableDatabase(db, { database: "omni_desktop_qa", role: "desktop_qa" })
  run(["node_modules/prisma/build/index.js", "db", "push", "--schema", "prisma/schema.prisma", "--skip-generate"])
  const moduleAccess = BASIC_MODULE_ACCESS ? { version: 1, modules: [...BASIC_MODULE_ACCESS.modules] } : undefined
  await db.store.createMany({
    data: [
      { id: "qa-loja-a", name: "QA_LOJA_A Assistência Sintética", cnpj: "00.000.000/0001-91", phone: "11999991001", ...(moduleAccess ? { moduleAccess } : {}) },
      { id: "qa-loja-b", name: "QA_LOJA_B Comércio Sintético", cnpj: "00.000.000/0001-92", phone: "11999991002", ...(moduleAccess ? { moduleAccess } : {}) },
    ],
  })
  // Loja A: PDV Clássico. Loja B: Venda Completa ("next").
  for (const [id, branch, layout] of [["qa-loja-a", "assistencia", "classic"], ["qa-loja-b", "comercio", "next"]]) {
    await db.storeSettings.create({
      data: { storeId: id, printerConfig: { pdvMainLayout: layout, capabilities: { version: 1, business: { primaryBranch: branch } } } },
    })
  }
  // QA_ADMIN_A: ADMIN multiloja (A e B) — troca de loja. QA_OPERADOR_B: CAIXA só da loja B.
  await db.adminUser.create({
    data: {
      id: "qa-admin-a", email: "qa_admin_a@desktop-qa.invalid", name: "QA_ADMIN_A Sintético", role: "ADMIN", lojaId: "qa-loja-a",
      accessScope: "STORE", password: await bcrypt.hash(passwords.adminA, 10), mustChangePassword: false,
      adminUserStores: { create: [{ storeId: "qa-loja-a" }, { storeId: "qa-loja-b" }] },
    },
  })
  await db.adminUser.create({
    data: {
      id: "qa-operador-b", email: "qa_operador_b@desktop-qa.invalid", name: "QA_OPERADOR_B Sintético", role: "CAIXA", lojaId: "qa-loja-b",
      accessScope: "STORE", password: await bcrypt.hash(passwords.operadorB, 10), mustChangePassword: false,
      adminUserStores: { create: [{ storeId: "qa-loja-b" }] },
    },
  })
  // Marcadores privados: o teste procura estes textos em tudo que sobra no computador.
  await db.cliente.createMany({
    data: [
      { id: "qa-cliente-a", storeId: "qa-loja-a", name: "Cliente Privado QA-A-7731", phone: "11988887731", email: "privado-a@desktop-qa.invalid" },
      { id: "qa-cliente-b", storeId: "qa-loja-b", name: "Cliente Loja B QA-B-4410", phone: "11988884410", email: "cliente-b@desktop-qa.invalid" },
    ],
  })
  await db.produto.create({ data: { storeId: "qa-loja-a", name: "Produto QA-A Película", price: 25, stock: 50, barcode: "7890000000017" } }).catch(async () => {
    await db.produto.create({ data: { storeId: "qa-loja-a", name: "Produto QA-A Película", price: 25, stock: 50 } })
  })
  await db.produto.create({ data: { storeId: "qa-loja-b", name: "Produto QA-B Cabo", price: 15, stock: 50 } })
  await writeFile(path.join(out, "seed.json"), JSON.stringify({ stores: ["qa-loja-a", "qa-loja-b"], users: ["QA_ADMIN_A (ADMIN, A+B)", "QA_OPERADOR_B (CAIXA, B)"], synthetic: true, productionWrites: 0 }, null, 2))
} finally {
  await db.$disconnect()
}

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "localhost", "-p", String(port)], {
  env: { ...env, NODE_ENV: "production", AUTH_SECRET: appSecret, AUTH_TRUST_HOST: "true", NEXTAUTH_URL: origin, AUTH_URL: origin, NEXT_TELEMETRY_DISABLED: "1" },
  stdio: ["ignore", "ignore", "ignore"],
})
let status = "FAIL"
try {
  const deadline = Date.now() + 120_000
  for (;;) {
    try {
      if ((await fetch(origin + "/login")).ok) break
    } catch {
      /* subindo */
    }
    if (Date.now() > deadline || server.exitCode !== null) throw new Error("DESKTOP_QA_APP_NOT_READY")
    await new Promise((r) => setTimeout(r, 1000))
  }
  // O desktop (canal development) aponta para a stack local.
  run(["scripts/write-build-config.mjs", "--channel", "development", "--origin", origin], {}, "apps/desktop")
  run(["node_modules/@playwright/test/cli.js", "test", "--config", "tests/real-stack/playwright.real.config.ts"], {
    DESKTOP_QA_ORIGIN: origin,
    DESKTOP_QA_SERVER_PID: String(server.pid),
    DESKTOP_QA_DATABASE_URL: database,
    QA_PASSWORD_ADMIN_A: passwords.adminA,
    QA_PASSWORD_OPERADOR_B: passwords.operadorB,
  }, "apps/desktop")
  status = "PASS"
} finally {
  server.kill()
  try {
    spawnSync("taskkill", ["/F", "/T", "/PID", String(server.pid)], { stdio: "ignore" })
  } catch {
    /* já saiu */
  }
  for (const name of await readdir(out, { recursive: true })) {
    if (!/\.(json|txt|log|md)$/.test(name)) continue
    const file = path.join(out, name)
    let text = await readFile(file, "utf8")
    for (const value of [...Object.values(passwords), appSecret]) text = text.split(value).join("[REDACTED]")
    await writeFile(file, text)
  }
  await writeFile(path.join(out, "isolation.json"), JSON.stringify({ status, database: "PostgreSQL descartável local (loopback), vazio e recém-iniciado, verificado por catálogo", authentication: "NextAuth real (Credentials)", syntheticDataOnly: true, productionWrites: 0, previewUsed: false }, null, 2))
}
