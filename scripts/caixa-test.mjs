/**
 * Sprint 1 — Validação do fluxo de Caixa (loja de teste isolada).
 *
 * Modos:
 *   node --env-file=.env scripts/caixa-test.mjs setup     → cria a loja de teste (1 linha em `stores`)
 *   node --env-file=.env scripts/caixa-test.mjs check      → SOMENTE LEITURA: snapshot do caixa (padrão)
 *   node --env-file=.env scripts/caixa-test.mjs stores     → SOMENTE LEITURA: lista lojas + contagens
 *   CONFIRM=1 node --env-file=.env scripts/caixa-test.mjs cleanup → apaga SÓ os dados de teste da loja de teste
 *
 * storeId da loja de teste: env TEST_STORE_ID (padrão "loja-teste-caixa").
 * NUNCA escreve em dados reais — setup cria só a loja; cleanup só apaga a loja de teste (exige CONFIRM=1).
 */
import { PrismaClient } from "../generated/prisma/index.js"

const prisma = new PrismaClient()
const STORE_ID = process.env.TEST_STORE_ID || "loja-teste-caixa"
const mode = (process.argv[2] || "check").toLowerCase()
const brl = (n) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n) || 0)
const iso = (d) => (d instanceof Date ? d.toISOString() : d || "—")
const obj = (p) => (p && typeof p === "object" && !Array.isArray(p) ? p : {})

async function setup() {
  if (STORE_ID === "loja-1") throw new Error("Recusado: não use loja-1 como loja de teste.")
  const store = await prisma.store.upsert({
    where: { id: STORE_ID },
    update: {},
    create: { id: STORE_ID, name: "🧪 LOJA TESTE CAIXA", profile: "ASSISTENCIA" },
    select: { id: true, name: true, profile: true, subscriptionPlan: true, createdAt: true },
  })
  console.log("[caixa-test] loja de teste pronta:", store)
  console.log("[caixa-test] No app: troque a unidade ativa para esta loja antes de testar.")
}

async function listStores() {
  const stores = await prisma.store.findMany({
    select: {
      id: true,
      name: true,
      profile: true,
      _count: { select: { vendas: true, sessoesCaixa: true, movimentacoes: true } },
    },
    orderBy: { id: "asc" },
  })
  console.log("════════ LOJAS ════════")
  for (const s of stores) {
    console.log(
      `  - ${s.id}  "${s.name}" [${s.profile}]  vendas=${s._count.vendas} sessoes=${s._count.sessoesCaixa} movs=${s._count.movimentacoes}`,
    )
  }
}

async function check() {
  const aberta = await prisma.sessaoCaixa.findFirst({
    where: { storeId: STORE_ID, status: "ABERTA" },
    orderBy: { abertaEm: "desc" },
  })
  const sessoes = await prisma.sessaoCaixa.findMany({
    where: { storeId: STORE_ID },
    orderBy: { abertaEm: "desc" },
    take: 5,
    select: {
      id: true, status: true, saldoInicial: true, saldoFinal: true, saldoContado: true,
      abertaEm: true, fechadaEm: true, terminalId: true, payload: true,
      _count: { select: { operacoes: true } },
    },
  })
  const vendas = await prisma.venda.findMany({
    where: { storeId: STORE_ID },
    orderBy: { at: "desc" },
    take: 8,
    select: { pedidoId: true, total: true, status: true, at: true, payload: true },
  })
  const ops = await prisma.caixaOperacao.findMany({
    where: { storeId: STORE_ID },
    orderBy: { at: "desc" },
    take: 8,
    select: { tipo: true, valor: true, motivo: true, at: true, sessaoId: true },
  })
  const desde = aberta?.abertaEm
  const origens = ["venda", "sangria_pdv", "suprimento_pdv", "cancelamento_pdv", "devolucao_pdv"]
  const movs = {}
  for (const origem of origens) {
    const agg = await prisma.movimentacaoFinanceira.aggregate({
      where: { storeId: STORE_ID, origem, ...(desde ? { createdAt: { gte: desde } } : {}) },
      _sum: { valor: true },
      _count: true,
    })
    movs[origem] = { count: agg._count, sum: agg._sum.valor || 0 }
  }

  console.log(`════════ CAIXA — store: ${STORE_ID} ════════`)
  console.log(
    "\n● Sessão ABERTA:",
    aberta
      ? { id: aberta.id, saldoInicial: brl(aberta.saldoInicial), abertaEm: iso(aberta.abertaEm), terminalId: aberta.terminalId || "—" }
      : "(nenhuma) — caixa fechado no servidor",
  )
  console.log("\n● Últimas sessões:")
  if (sessoes.length === 0) console.log("  (nenhuma)")
  for (const s of sessoes) {
    const tv = obj(s.payload).totalVendasServer
    const tvc = obj(s.payload).totalVendasCount
    console.log(
      `  - [${s.status}] ini=${brl(s.saldoInicial)} fim=${s.saldoFinal != null ? brl(s.saldoFinal) : "—"} contado=${s.saldoContado != null ? brl(s.saldoContado) : "—"} ops=${s._count.operacoes} totVendasServer=${tv != null ? brl(tv) : "—"}(${tvc ?? "—"}) abre=${iso(s.abertaEm)} fecha=${s.fechadaEm ? iso(s.fechadaEm) : "—"} id=${s.id}`,
    )
  }
  console.log(`\n● Movimentações financeiras ${desde ? "(desde abertura da sessão)" : "(todas)"}:`)
  for (const o of origens) console.log(`  - ${o}: ${movs[o].count}x = ${brl(movs[o].sum)}`)
  console.log("\n● Últimas vendas:")
  if (vendas.length === 0) console.log("  (nenhuma)")
  for (const v of vendas) {
    const pl = obj(v.payload)
    const desc = pl.discountReais != null ? brl(pl.discountReais) : pl.discountPercent != null ? `${pl.discountPercent}%` : "—"
    console.log(`  - ${v.pedidoId} ${brl(v.total)} [${v.status}] sessaoId=${pl.sessaoId || "—"} desconto=${desc} at=${iso(v.at)}`)
  }
  console.log("\n● Operações de caixa (sangria/suprimento):")
  if (ops.length === 0) console.log("  (nenhuma)")
  for (const op of ops) console.log(`  - ${op.tipo} ${brl(op.valor)} "${op.motivo}" sessaoId=${op.sessaoId} at=${iso(op.at)}`)
  console.log("\n════════ fim ════════")
}

async function cleanup() {
  if (STORE_ID === "loja-1") throw new Error("Recusado: cleanup bloqueado para loja-1.")
  if (process.env.CONFIRM !== "1") {
    console.log("[caixa-test] cleanup exige CONFIRM=1. Nada foi apagado.")
    return
  }
  const tables = [
    ["usoCreditoCliente", () => prisma.usoCreditoCliente.deleteMany({ where: { storeId: STORE_ID } })],
    ["clienteCredito", () => prisma.clienteCredito.deleteMany({ where: { storeId: STORE_ID } })],
    ["movimentacaoEstoque", () => prisma.movimentacaoEstoque.deleteMany({ where: { storeId: STORE_ID } })],
    ["movimentacaoFinanceira", () => prisma.movimentacaoFinanceira.deleteMany({ where: { storeId: STORE_ID } })],
    ["devolucaoVenda", () => prisma.devolucaoVenda.deleteMany({ where: { storeId: STORE_ID } })],
    ["venda", () => prisma.venda.deleteMany({ where: { storeId: STORE_ID } })],
    ["caixaOperacao", () => prisma.caixaOperacao.deleteMany({ where: { storeId: STORE_ID } })],
    ["sessaoCaixa", () => prisma.sessaoCaixa.deleteMany({ where: { storeId: STORE_ID } })],
  ]
  for (const [name, fn] of tables) {
    try {
      const r = await fn()
      console.log(`[caixa-test] cleanup ${name}: ${r.count} apagados`)
    } catch (e) {
      console.warn(`[caixa-test] cleanup ${name} falhou:`, e instanceof Error ? e.message : e)
    }
  }
  console.log(`[caixa-test] loja de teste "${STORE_ID}" mantida (só os dados de teste foram apagados).`)
}

try {
  if (mode === "setup") await setup()
  else if (mode === "stores") await listStores()
  else if (mode === "cleanup") await cleanup()
  else await check()
  process.exit(0)
} catch (e) {
  console.error("[caixa-test] FALHA:", e)
  process.exit(1)
} finally {
  await prisma.$disconnect()
}
