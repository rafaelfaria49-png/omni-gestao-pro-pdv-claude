/**
 * OMNI-GESTAO-FINANCEIRO-RECEBIMENTOS-F9-PRINT-001 / OMNI-FINANCEIRO-F9-HUB-HOMOLOGACAO-FINAL-001
 * Massa QA SINTÉTICA para o E2E local.
 *
 * Cria (idempotente) no PostgreSQL LOCAL DESCARTÁVEL:
 *  - loja QA com cadastro básico completo (nome + CNPJ sintético) — é o critério real do
 *    assistente "Boas-vindas" (`cadastroBasicoIncompleto`), então a loja de teste fica no
 *    mesmo estado de uma loja já configurada, sem desligar o onboarding;
 *  - módulos da loja: Financeiro (`finance`), Assistência (`service`) e `experiments`
 *    (o runtime só entrega o layout Supermercado com esse módulo — `vendas-pdv.tsx`);
 *  - terminal sintético "PDV QA 1" (o PDV pede terminal por computador; o teste escolhe
 *    pelo fluxo real "Usar");
 *  - uma SEGUNDA loja com cliente homônimo e título em aberto (isolamento por loja);
 *  - usuário ADMIN da loja QA e usuário TÉCNICO (sem permissão financeira nem de caixa).
 *
 * Recusa qualquer banco que não seja loopback + `fin_receb_f9_qa*`. Lê só o `.env` local
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
export const LOJA_QA_OUTRA_ID = "000-qa-fin-f9-outra"
/** CNPJ sintético com DV válido (exemplo didático; não pertence à RAFACELL). */
const CNPJ_QA = "11.222.333/0001-81"

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

/** printerConfig com o PDV no layout padrão (Clássico) e bobina 80 mm, preservando o resto. */
export function layoutPadrao(pc) {
  const base = pc && typeof pc === "object" ? pc : {}
  return {
    ...base,
    pdvMainLayout: "classic",
    v3PdvSectionCard: "classic",
    pdvParams: { ...(base.pdvParams ?? {}), pdvClassicLayout: "lovable" },
    impressao: { ...(base.impressao ?? {}), bobinaTamanho: "80mm" },
  }
}

/** E-mail do técnico derivado do e-mail QA (`a@b.test` → `a+tecnico@b.test`). */
export function emailTecnico(email) {
  return email.replace("@", "+tecnico@")
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
    // O default do schema não inclui `finance`, `service` nem `experiments`.
    const moduleAccess = {
      version: 1,
      modules: ["home", "pdv", "sales", "cash", "catalog", "stock", "reports", "settings", "finance", "service", "experiments"],
    }
    const loja = { name: "Loja QA Recebimentos F9", cnpj: CNPJ_QA, moduleAccess }
    await prisma.store.upsert({ where: { id: LOJA_QA_ID }, update: loja, create: { id: LOJA_QA_ID, ...loja } })
    await prisma.pdvTerminal.upsert({
      where: { storeId_code: { storeId: LOJA_QA_ID, code: "PDV1" } },
      update: { name: "PDV QA 1", status: "ACTIVE" },
      create: { storeId: LOJA_QA_ID, code: "PDV1", name: "PDV QA 1", status: "ACTIVE" },
    })

    // Estado de PDV controlado: layout padrão (Clássico) e bobina 80 mm. Os E2E de
    // layout trocam isso e restauram ao final; o bootstrap garante o ponto de partida.
    const cfg = await prisma.storeSettings.findUnique({ where: { storeId: LOJA_QA_ID } })
    const pc = cfg?.printerConfig && typeof cfg.printerConfig === "object" ? cfg.printerConfig : {}
    const printerConfig = layoutPadrao(pc)
    await prisma.storeSettings.upsert({ where: { storeId: LOJA_QA_ID }, update: { printerConfig }, create: { storeId: LOJA_QA_ID, printerConfig } })

    // Outra loja: o usuário QA NÃO tem acesso. Cliente com o MESMO nome usado no E2E.
    const outra = { name: "Loja QA Outra Unidade", cnpj: "", moduleAccess }
    await prisma.store.upsert({ where: { id: LOJA_QA_OUTRA_ID }, update: outra, create: { id: LOJA_QA_OUTRA_ID, ...outra } })
    const cliOutra =
      (await prisma.cliente.findFirst({ where: { storeId: LOJA_QA_OUTRA_ID, name: "Cliente Outra Loja QA" } })) ??
      (await prisma.cliente.create({ data: { storeId: LOJA_QA_OUTRA_ID, name: "Cliente Outra Loja QA", phone: "11955554444" } }))
    await prisma.contaReceberTitulo.upsert({
      where: { storeId_localKey: { storeId: LOJA_QA_OUTRA_ID, localKey: "receber:qa-outra:1" } },
      update: {},
      create: {
        storeId: LOJA_QA_OUTRA_ID, localKey: "receber:qa-outra:1", descricao: "Crediário outra loja QA",
        cliente: cliOutra.name, valor: 99, vencimento: "2026-12-20", status: "pendente",
        payload: { clienteId: cliOutra.id, historico: [] },
      },
    })

    const hash = await bcrypt.hash(senha, 10)
    await prisma.adminUser.upsert({
      where: { email },
      update: { password: hash, role: "ADMIN", active: true, lojaId: LOJA_QA_ID },
      create: { email, name: "Operador QA F9", password: hash, role: "ADMIN", lojaId: LOJA_QA_ID },
    })
    const tecnico = emailTecnico(email)
    await prisma.adminUser.upsert({
      where: { email: tecnico },
      update: { password: hash, role: "TECNICO", active: true, lojaId: LOJA_QA_ID },
      create: { email: tecnico, name: "Técnico QA F9", password: hash, role: "TECNICO", lojaId: LOJA_QA_ID },
    })
    console.log(`QA pronto em ${db}: lojas ${LOJA_QA_ID} + ${LOJA_QA_OUTRA_ID}, terminal PDV1, usuários sintéticos ADMIN/TECNICO (credenciais só no .env local).`)
  } finally {
    await prisma.$disconnect()
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
