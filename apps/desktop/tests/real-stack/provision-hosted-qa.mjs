/**
 * Provisiona o banco de QA HOSPEDADO do OmniGestão Desktop (Preview da PR #348) com dados 100%
 * sintéticos. Roda NO TERMINAL DO OPERADOR — as senhas temporárias aparecem só ali, uma vez, e
 * as contas exigem troca de senha no primeiro acesso. Nada é gravado em arquivo ou log.
 *
 * Pré-requisitos: um projeto PostgreSQL SEPARADO da Produção (projeto Neon próprio, papel próprio,
 * sem cópia de dados), banco VAZIO. Na raiz do repositório:
 *
 *   $env:DESKTOP_QA_HOSTED_DATABASE_URL = "<url do banco de QA>"   # PowerShell
 *   node apps/desktop/tests/real-stack/provision-hosted-qa.mjs
 *
 * O script recusa: banco com tabelas, nomes de banco de Produção/candidate e URL sem TLS.
 */
import { spawnSync } from "node:child_process"
import { randomBytes } from "node:crypto"
import bcrypt from "bcryptjs"

const url = process.env.DESKTOP_QA_HOSTED_DATABASE_URL ?? ""
let parsed
try {
  parsed = new URL(url)
} catch {
  throw new Error("DESKTOP_QA_HOSTED_DATABASE_URL ausente ou inválida")
}
const dbName = parsed.pathname.replace(/^\//, "")
if (!/^postgres(ql)?:$/.test(parsed.protocol)) throw new Error("URL não é PostgreSQL")
if (/prod|candidate/i.test(dbName)) throw new Error(`banco "${dbName}" parece de Produção/candidate — recusado`)
if (!/sslmode=require|sslmode=verify/i.test(parsed.search)) throw new Error("exija TLS (sslmode=require) na URL")

const { PrismaClient } = await import("../../../../generated/prisma/index.js")
const db = new PrismaClient({ datasourceUrl: url })
const secret = () => "Qa1!" + randomBytes(12).toString("base64url")
const passwords = { adminA: secret(), operadorB: secret() }
try {
  const [row] = await db.$queryRawUnsafe(
    "SELECT current_database() AS db, (SELECT count(*)::int FROM pg_catalog.pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')) AS tables",
  )
  if (row.tables !== 0) throw new Error(`banco "${row.db}" não está vazio (${row.tables} tabelas) — recusado`)

  const push = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "push", "--schema", "prisma/schema.prisma", "--skip-generate"], {
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, DATABASE_URL: url, DIRECT_URL: url },
    stdio: "inherit",
  })
  if (push.status !== 0) throw new Error("db push falhou")

  await db.store.createMany({
    data: [
      { id: "qa-loja-a", name: "QA_LOJA_A Assistência Sintética", cnpj: "00.000.000/0001-91" },
      { id: "qa-loja-b", name: "QA_LOJA_B Comércio Sintético", cnpj: "00.000.000/0001-92" },
    ],
  })
  for (const [id, branch, layout] of [["qa-loja-a", "assistencia", "classic"], ["qa-loja-b", "comercio", "next"]]) {
    await db.storeSettings.create({ data: { storeId: id, printerConfig: { pdvMainLayout: layout, capabilities: { version: 1, business: { primaryBranch: branch } } } } })
  }
  for (const [id, email, name, role, lojaId, stores, pass] of [
    ["qa-admin-a", "qa_admin_a@desktop-qa.invalid", "QA_ADMIN_A Sintético", "ADMIN", "qa-loja-a", ["qa-loja-a", "qa-loja-b"], passwords.adminA],
    ["qa-operador-b", "qa_operador_b@desktop-qa.invalid", "QA_OPERADOR_B Sintético", "CAIXA", "qa-loja-b", ["qa-loja-b"], passwords.operadorB],
  ]) {
    await db.adminUser.create({
      data: { id, email, name, role, lojaId, accessScope: "STORE", password: await bcrypt.hash(pass, 10), mustChangePassword: true,
        adminUserStores: { create: stores.map((storeId) => ({ storeId })) } },
    })
  }
  await db.cliente.createMany({
    data: [
      { id: "qa-cliente-a", storeId: "qa-loja-a", name: "Cliente Privado QA-A-7731", phone: "11988887731" },
      { id: "qa-cliente-b", storeId: "qa-loja-b", name: "Cliente Loja B QA-B-4410", phone: "11988884410" },
    ],
  })
  await db.produto.create({ data: { storeId: "qa-loja-a", name: "Produto QA-A Película", price: 25, stock: 50, barcode: "7890000000017" } })
  await db.produto.create({ data: { storeId: "qa-loja-b", name: "Produto QA-B Cabo", price: 15, stock: 50 } })
} finally {
  await db.$disconnect()
}
// Única saída das senhas: este terminal. Troca obrigatória no 1º acesso.
process.stdout.write(
  "\nQA provisionado (dados sintéticos). Senhas temporárias — anote e feche o terminal:\n" +
    `  qa_admin_a@desktop-qa.invalid     ${passwords.adminA}\n` +
    `  qa_operador_b@desktop-qa.invalid  ${passwords.operadorB}\n`,
)
