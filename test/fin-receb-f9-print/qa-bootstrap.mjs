/**
 * OMNI-GESTAO-FINANCEIRO-RECEBIMENTOS-F9-PRINT-001 — massa QA SINTÉTICA para o E2E local.
 *
 * Cria (idempotente) a loja QA e o usuário QA no PostgreSQL LOCAL DESCARTÁVEL. Recusa
 * qualquer banco que não seja loopback + `fin_receb_f9_qa*`. Lê só o `.env` local
 * (gitignorado); nenhum segredo é impresso nem versionado.
 *
 *   node test/fin-receb-f9-print/qa-bootstrap.mjs
 */
import { existsSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
const require = createRequire(import.meta.url)
const { parse } = require("dotenv")
const bcrypt = require("bcryptjs")

export const LOJA_QA_ID = "000-qa-fin-f9"

function env() {
  const arquivo = resolve(root, ".env")
  const local = existsSync(arquivo) ? parse(readFileSync(arquivo)) : {}
  return { ...local, ...process.env }
}

function exigirBancoQA(e) {
  const urls = [e.DATABASE_URL, e.DIRECT_URL].map((v) => (v ?? "").trim())
  if (urls.some((v) => !v)) throw new Error("BLOQUEIO_QA: DATABASE_URL e DIRECT_URL ausentes.")
  const parsed = urls.map((v) => new URL(v))
  if (parsed.some((u) => !["127.0.0.1", "localhost", "::1", "[::1]"].includes(u.hostname))) throw new Error("BLOQUEIO_QA: só loopback.")
  if (!parsed[0].pathname.replace(/^\//, "").startsWith("fin_receb_f9_qa") || parsed[0].href !== parsed[1].href) {
    throw new Error("BLOQUEIO_QA: alvo precisa ser o banco descartável fin_receb_f9_qa* (DATABASE_URL = DIRECT_URL).")
  }
  return urls[0]
}

async function main() {
  const e = env()
  const url = exigirBancoQA(e)
  const email = (e.PLAYWRIGHT_E2E_EMAIL ?? "").trim()
  const senha = (e.PLAYWRIGHT_E2E_PASSWORD ?? "").trim()
  if (!email.endsWith(".test") || senha.length < 12) throw new Error("BLOQUEIO_QA: e-mail sintético (*.test) e senha QA aleatória (≥ 12).")
  const { PrismaClient } = require(resolve(root, "generated/prisma"))
  const prisma = new PrismaClient({ datasourceUrl: url })
  try {
    const [{ db }] = await prisma.$queryRawUnsafe("SELECT current_database() AS db")
    if (!String(db).startsWith("fin_receb_f9_qa")) throw new Error(`BLOQUEIO_QA: conectado em ${db}.`)
    // Loja com o módulo Financeiro contratado (o default do schema não inclui `finance`).
    const moduleAccess = { version: 1, modules: ["home", "pdv", "sales", "cash", "catalog", "stock", "reports", "settings", "finance"] }
    await prisma.store.upsert({
      where: { id: LOJA_QA_ID },
      update: { moduleAccess },
      create: { id: LOJA_QA_ID, name: "Loja QA Recebimentos F9", moduleAccess },
    })
    const hash = await bcrypt.hash(senha, 10)
    await prisma.adminUser.upsert({
      where: { email },
      update: { password: hash, role: "ADMIN", active: true },
      create: { email, name: "Operador QA F9", password: hash, role: "ADMIN", lojaId: LOJA_QA_ID },
    })
    console.log(`QA pronto em ${db}: loja ${LOJA_QA_ID} + usuário sintético (credenciais só no .env local).`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
