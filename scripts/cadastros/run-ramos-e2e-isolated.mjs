/**
 * E2E autenticado isolado de Ramos e Cadastros: app Next real (build de
 * produção) + PostgreSQL descartável do job + login NextAuth real.
 * Somente o serviço de CI aprovado pelo guard; sem .env, migrations, seed
 * produtivo, rota de bypass ou cookie forjado. Usuários/lojas são sintéticos
 * e as senhas nascem aleatórias neste processo, sem ir para log ou evidência.
 */
import { spawn, spawnSync } from "node:child_process"
import { randomBytes } from "node:crypto"
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import path from "node:path"
import bcrypt from "bcryptjs"
import { assertIsolatedCadastrosDatabase } from "./isolated-postgres-guard.mjs"
import { assertFreshDisposableDatabase } from "./disposable-db-preflight.mjs"

const EXPECTED_DB = "cad_r2_021_isolated"
const EXPECTED_ROLE = "cad_r2_021"
const ORIGIN = "http://127.0.0.1:3000"
const evidence = path.join(process.cwd(), "test-results/cadastros-ramos-e2e")
const database = assertIsolatedCadastrosDatabase(process.env)

function run(args, env = process.env) {
  const result = spawnSync(process.execPath, args, { env, stdio: "inherit" })
  if (result.error || result.status !== 0) throw new Error("RAMOS_E2E_STEP_FAILED")
}

const { PrismaClient } = await import("../../generated/prisma/index.js")
const db = new PrismaClient({ datasourceUrl: database })
const secret = () => randomBytes(18).toString("base64url")
const passwords = { admin: secret(), operador: secret(), caixa: secret() }
try {
  // Identidade e vacuidade por catálogo ANTES do primeiro comando de escrita (DDL incluído).
  await assertFreshDisposableDatabase(db, { database: EXPECTED_DB, role: EXPECTED_ROLE })
  // Materializa o schema inalterado no banco vazio deste job (sem migrations).
  run(["node_modules/prisma/build/index.js", "db", "push", "--skip-generate"])
  if (await db.store.count() || await db.produto.count() || await db.adminUser.count() || await db.storeSettings.count()) {
    throw new Error("RAMOS_E2E_DATABASE_MUST_BE_EMPTY")
  }
  const store = (id, name, profile) => ({ id, name, profile, cnpj: "00.000.000/0000-00", phone: "(00) 0000-0000" })
  await db.store.createMany({ data: [
    store("e2e-a-padaria", "Padaria Sintética A", "ASSISTENCIA"),
    store("e2e-b-variedades", "Variedades Sintética B", "VARIEDADES"),
    store("e2e-c-assistencia", "Assistência Sintética C", "ASSISTENCIA"),
    store("e2e-d-acessorios", "Acessórios Sintéticos D", "VARIEDADES"),
  ] })
  // Loja mista já configurada antes da jornada (preferências não operacionais da PDV preservadas).
  await db.storeSettings.create({ data: { storeId: "e2e-b-variedades", printerConfig: {
    pdvMainLayout: "classic", pdvParams: { pdvClassicLayout: "lovable", atalhosRapidos: [] },
    capabilities: { version: 1, business: { primaryBranch: "variedades" } },
  } } })
  const legacyMetadata = (model) => ({
    catalogoAparelhos: { version: 1, deviceModelKeys: [model], deviceAliases: [], compatibilityStatus: "nao_confirmado",
      compatibilityTypes: [], reviewRequired: true, source: "manual", notes: "" },
    acessorios: { version: 1, tipo: "capinha", exigeModelo: true, exigeCor: true, usaCoresPadrao: true, coresPermitidas: null },
    atributos: { descricao: "Descrição sintética original", tags: ["sintetico"], modeloCompativel: "Modelo Sintético X" },
    fiscal: { ncm: "39269090" },
    chaveNaoEnviada: { origem: "fixture" },
  })
  await db.produto.createMany({ data: [
    { id: "e2e-b-legado", storeId: "e2e-b-variedades", name: "Capa sintética legado B", sku: "E2E-B-LEG", price: 30, precoCusto: 12,
      stock: 7, warrantyDays: 90, category: "Sintéticos", metadata: { ...legacyMetadata("modelo-sintetico-x"), cadastroRecursos: { compatibilidade: true, acessorios: false } } },
    { id: "e2e-c-legado", storeId: "e2e-c-assistencia", name: "Capa sintética legado C", sku: "E2E-C-LEG", price: 40, precoCusto: 15,
      stock: 3, warrantyDays: 90, category: "Sintéticos", metadata: legacyMetadata("modelo-sintetico-y") },
    { id: "e2e-d-legado", storeId: "e2e-d-acessorios", name: "Película sintética legado D", sku: "E2E-D-LEG", price: 20, precoCusto: 5,
      stock: 0, warrantyDays: 30, category: "Sintéticos", metadata: { atributos: { modeloCompativel: "Modelo Sintético Z" }, fiscal: { ncm: "39199090" } } },
  ] })
  const user = async (email, name, password, role, lojaId) => db.adminUser.create({ data: {
    email, name, role, lojaId, password: await bcrypt.hash(password, 10),
    ...(lojaId ? { adminUserStores: { create: { storeId: lojaId } } } : {}),
  } })
  await user("admin@e2e-cadastros.invalid", "Admin Sintético", passwords.admin, "ADMIN", null)
  await user("operador@e2e-cadastros.invalid", "Operador Sintético", passwords.operador, "OPERADOR", "e2e-b-variedades")
  await user("caixa@e2e-cadastros.invalid", "Caixa Sintético", passwords.caixa, "CAIXA", "e2e-b-variedades")
} finally { await db.$disconnect() }

await mkdir(evidence, { recursive: true })
const appEnv = {
  ...process.env, NODE_ENV: "production", PORT: "3000", HOSTNAME: "127.0.0.1",
  AUTH_SECRET: secret(), AUTH_TRUST_HOST: "true", NEXTAUTH_URL: ORIGIN, NEXT_TELEMETRY_DISABLED: "1",
}
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", "3000"], {
  env: appEnv, stdio: ["ignore", "inherit", "inherit"],
})
let status = "FAIL"
try {
  const deadline = Date.now() + 120_000
  for (;;) {
    try { if ((await fetch(`${ORIGIN}/login`)).ok) break } catch { /* ainda subindo */ }
    if (Date.now() > deadline || server.exitCode !== null) throw new Error("RAMOS_E2E_SERVER_NOT_READY")
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  run(["node_modules/@playwright/test/cli.js", "test", "--config", "e2e/cadastros-ramos.playwright.config.ts"], {
    ...process.env, RAMOS_E2E_BASE_URL: ORIGIN, RAMOS_E2E_DATABASE_URL: database,
    RAMOS_E2E_ADMIN_PASSWORD: passwords.admin, RAMOS_E2E_OPERADOR_PASSWORD: passwords.operador,
    RAMOS_E2E_CAIXA_PASSWORD: passwords.caixa,
  })
  status = "PASS"
} finally {
  server.kill("SIGTERM")
  // Rede de segurança: nenhuma senha sintética sai nos artifacts, mesmo de uma falha.
  let credentialRedactions = 0
  for (const name of await readdir(evidence, { recursive: true })) {
    if (!/\.(json|md|txt|log)$/.test(name)) continue
    const file = path.join(evidence, name)
    const text = await readFile(file, "utf8")
    let clean = text
    for (const value of Object.values(passwords)) clean = clean.split(value).join("[REDACTED]")
    if (clean !== text) { credentialRedactions += 1; await writeFile(file, clean) }
  }
  await writeFile(path.join(evidence, "isolation.json"), JSON.stringify({
    status, credentialRedactions, app: "next start (build de produção) em 127.0.0.1", database: "PostgreSQL descartável do job, identidade conferida",
    auth: "NextAuth Credentials real; usuários sintéticos com senha aleatória por execução (não registrada)",
    schemaChanged: false, schemaMaterialization: "prisma db push em banco vazio", migrationsExecuted: false, productionWrites: 0,
  }, null, 2) + "\n")
}
