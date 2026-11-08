/**
 * PADARIA-KG-F8-INTEGRACAO-SEGURA-001 — F8 (troca/devolução, #331) × venda manual KG (#335)
 * em PostgreSQL 17 REAL e descartável, com a migration KG aplicada (triggers e CHECK reais).
 *
 * Roda os handlers de PRODUÇÃO (`POST /api/ops/devolucao`, `GET …/elegibilidade`,
 * `POST /api/vendas/[id]/cancelar`) e o writer real de venda (`upsertVendaInTransaction`).
 * Só roda pelo `scripts/pdv/run-manual-kg-tests.mjs` (mesmo banco isolado das suítes KG);
 * sem a variável a suíte é pulada. Dados 100% sintéticos.
 */
import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

const SESSAO = { user: { id: "fixture-op", role: "ADMIN", name: "Operador Sintético", platformAuthority: true } }
vi.mock("@/auth", () => ({ auth: async () => SESSAO }))
vi.mock("@/lib/auth/api-enterprise-guard", async (orig) => {
  const { getEnterprisePermissions } = await import("@/lib/auth/enterprise-permissions")
  return {
    ...(await orig<typeof import("@/lib/auth/api-enterprise-guard")>()),
    apiGuardEnterpriseOrOps: async (_s: string, check: (p: unknown) => boolean, msg: string) =>
      check(getEnterprisePermissions("ADMIN") as never) ? null : new Response(JSON.stringify({ error: msg }), { status: 403 }),
  }
})
vi.mock("@/lib/auth/guard-enterprise", () => ({ requireEnterpriseWith: async () => ({ ok: true }) }))
vi.mock("@/lib/vendas/guard-estorno-venda", () => ({
  requireEstornoStepUp: async () => ({ ok: true, supervisorId: "sup-sintetico", supervisorNome: "Supervisor Sintético" }),
}))
vi.mock("@/lib/auth/enterprise-permissions", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/enterprise-permissions")>()),
  canAccessStore: () => true,
}))
vi.mock("@/lib/automation/automation-engine", () => ({ handleEvent: vi.fn() }))

import { prisma } from "@/lib/prisma"
import { applyStockMutation, type StockLedgerTx } from "@/lib/estoque/stock-ledger-service"
import { upsertVendaInTransaction, type SalePayload } from "@/lib/ops-upsert-venda"
import { MANUAL_KG_SALE, saleLineTotalCents } from "@/lib/vendas/manual-kg-contract"
import { POST as postDevolucao } from "@/app/api/ops/devolucao/route"
import { GET as getElegibilidade } from "@/app/api/ops/devolucao/elegibilidade/route"
import { POST as postCancelar } from "@/app/api/vendas/[id]/cancelar/route"
import { encaminharPendenciaDevolucao } from "@/lib/pdv/devolucao/pendencia-financeiro"

const url = "postgresql://manual_kg@127.0.0.1:55479/manual_kg_sale_isolated"
const enabled = process.env.MANUAL_KG_TEST_DATABASE_URL === url
if (process.env.MANUAL_KG_TEST_DATABASE_URL && !enabled) throw Error("MANUAL_KG_ISOLATION_REQUIRED")
const suite = enabled ? describe : describe.skip

const A = "kg-f8-a", B = "kg-f8-b"
const CPF = "52998224725" // CPF sintético válido de documentação
const NOME = "Cliente Sintético"
const KG = { comercial: { version: 1, modoVenda: "peso", unidade: "KG", basePreco: "KG" } }
const UN = { comercial: { version: 1, modoVenda: "unidade", unidade: "UN", basePreco: "UN" } }
const LIVE = { enforceStock: true, requireCaixaSession: true }
const deps = { db: prisma as unknown as { $transaction<T>(fn: (tx: StockLedgerTx) => Promise<T>): Promise<T> } }

type Linha = { id: string; name: string; quantity: number; price: number; produtoId?: string }

async function produto(input: { name: string; price: number; metadata: object; sku: string; storeId?: string; estoque: number }) {
  const storeId = input.storeId ?? A
  const p = await prisma.produto.create({
    data: { id: "kg-f8-" + randomUUID(), storeId, name: input.name, stock: 0, price: input.price, metadata: input.metadata, sku: input.sku + "-" + randomUUID().slice(0, 6) },
  })
  const r = await applyStockMutation({ storeId, principal: null, source: "kg-f8" }, { kind: "entrada", produtoId: p.id, quantidade: input.estoque, origem: "manual" }, deps)
  if (!r.ok) throw Error(r.code)
  return p
}

function venda(lines: Linha[], opts: { kg: boolean; storeId?: string; pb?: SalePayload["paymentBreakdown"] }): SalePayload {
  const storeId = opts.storeId ?? A
  const items = lines.map((l) => ({
    inventoryId: l.id, ...(l.produtoId ? { produtoId: l.produtoId } : {}), name: l.name, quantity: l.quantity, unitPrice: l.price,
    lineTotal: (opts.kg ? saleLineTotalCents(l.quantity, l.price)! : Math.round(l.quantity * l.price * 100)) / 100,
  }))
  const total = items.reduce((s, l) => s + Math.round(l.lineTotal * 100), 0) / 100
  return {
    id: "KG-F8-" + randomUUID(), ...(opts.kg ? { manualKgSale: MANUAL_KG_SALE } : {}), sessaoId: storeId + "-cash",
    at: new Date().toISOString(), total, customerCpf: CPF, customerName: NOME, lines: items, paymentBreakdown: opts.pb ?? { dinheiro: total },
  }
}
const persist = (sale: SalePayload, lojaId = A) =>
  prisma.$transaction((tx) => upsertVendaInTransaction(tx, lojaId, sale, "Operador sintético", LIVE), { timeout: 20000, maxWait: 20000 })

const headers = (loja = A) => ({ "Content-Type": "application/json", "x-assistec-loja-id": loja })
async function devolver(body: Record<string, unknown>, loja = A) {
  const res = await postDevolucao(new Request("http://localhost/api/ops/devolucao", {
    method: "POST", headers: headers(loja), body: JSON.stringify({ clienteNome: NOME, clienteDoc: CPF, sessaoId: loja + "-cash", ...body }),
  }))
  return { status: res.status, body: await res.json() }
}
async function eleg(q: string, loja = A) {
  const res = await getElegibilidade(new Request(`http://localhost/api/ops/devolucao/elegibilidade?q=${encodeURIComponent(q)}`, { headers: { "x-assistec-loja-id": loja } }))
  return { status: res.status, body: await res.json() }
}
async function cancelar(id: string, loja = A) {
  const res = await postCancelar(
    new Request(`http://localhost/api/vendas/${id}/cancelar`, { method: "POST", headers: headers(loja), body: JSON.stringify({ motivo: "teste sintético", forcar: true }) }),
    { params: Promise.resolve({ id }) },
  )
  return { status: res.status, body: await res.json() }
}

/** Texto do PostgreSQL (sem conversão para double) do saldo de produto + depósitos. */
async function saldo(id: string) {
  const [row] = await prisma.$queryRaw<Array<{ stock: string; dep: string | null }>>`
    SELECT p.stock::text AS stock, (SELECT string_agg(d.quantidade::text, ',') FROM produto_depositos d WHERE d."produtoId" = p.id) AS dep
    FROM estoque_produtos p WHERE p.id = ${id}`
  return row
}
const saldoVale = async (loja = A) =>
  (await prisma.clienteCredito.aggregate({ where: { storeId: loja, clienteDoc: CPF, status: "ativo" }, _sum: { saldoAtual: true } }))._sum.saldoAtual ?? 0

/** Tudo que uma devolução poderia alterar, lido como texto do banco. */
async function efeitos(pedidoId: string, produtos: string[], loja = A) {
  const venda = await prisma.$queryRaw<Array<{ status: string; total: string; payload: string }>>`
    SELECT status::text AS status, total::text AS total, payload::text AS payload FROM vendas WHERE "pedidoId" = ${pedidoId} AND "storeId" = ${loja}`
  const itens = await prisma.$queryRaw<Array<{ q: string | null; kg: string | null; lt: string }>>`
    SELECT i.quantidade::text AS q, i."quantidadeKg"::text AS kg, i."lineTotal"::text AS lt FROM venda_itens i JOIN vendas v ON v.id = i."vendaId"
    WHERE v."pedidoId" = ${pedidoId} AND v."storeId" = ${loja} ORDER BY i.id`
  return {
    venda, itens,
    saldos: await Promise.all(produtos.map(saldo)),
    devolucoes: await prisma.devolucaoVenda.count({ where: { storeId: loja } }),
    itensDevolucao: await prisma.itemDevolucaoVenda.count({ where: { devolucao: { storeId: loja } } }),
    creditos: await prisma.clienteCredito.count({ where: { storeId: loja } }),
    movFin: await prisma.movimentacaoFinanceira.count({ where: { storeId: loja } }),
    movEstoque: await prisma.movimentacaoEstoque.count({ where: { storeId: loja } }),
  }
}

suite("F8 × venda manual KG — integração em PostgreSQL real", () => {
  beforeAll(async () => {
    for (const [id, code] of [[A, "KFA"], [B, "KFB"]]) {
      await prisma.store.create({ data: { id, name: "Padaria F8 sintética " + code, codigoNumeracaoVenda: code } })
      await prisma.sessaoCaixa.create({ data: { id: id + "-cash", storeId: id, operador: "Operador", status: "ABERTA" } })
    }
  })
  afterAll(() => prisma.$disconnect())

  it("venda KG mista (KG + UN): troca, vale ou reembolso de qualquer linha é recusado sem alterar a venda KG confirmada", async () => {
    const pao = await produto({ name: "Pão francês", price: 18.9, metadata: KG, sku: "PAO", estoque: 5 })
    const refri = await produto({ name: "Refrigerante", price: 7.5, metadata: UN, sku: "REF", estoque: 10 })
    const sale = venda([
      { id: pao.id, name: pao.name, quantity: 0.437, price: 18.9 },
      { id: refri.id, name: refri.name, quantity: 2, price: 7.5 },
    ], { kg: true })
    await persist(sale)
    expect((await saldo(pao.id)).stock).toBe("4.563")
    const antes = await efeitos(sale.id!, [pao.id, refri.id])
    expect(antes.itens.map((i) => [i.q, i.kg === null ? null : Number(i.kg)])).toEqual(expect.arrayContaining([[null, 0.437], ["2", null]]))

    const tentativas = [
      { localId: "KGF8-UN", tipo: "vale_credito", itens: [{ inventoryId: refri.id, quantidade: 1 }] },
      { localId: "KGF8-TROCA", tipo: "troca", itens: [{ inventoryId: refri.sku, quantidade: 2 }] },
      { localId: "KGF8-ESTQ", tipo: "somente_estoque", itens: [{ inventoryId: refri.id, quantidade: 1 }] },
      { localId: "KGF8-KG", tipo: "vale_credito", itens: [{ inventoryId: pao.id, quantidade: 1 }] },
    ]
    for (const t of tentativas) {
      const r = await devolver({ ...t, vendaLocalId: sale.id })
      expect(r.status, JSON.stringify(r.body)).toBe(409)
      expect(r.body.code).toBe("DEVOLUCAO_KG_BLOQUEADA")
    }
    const dinheiro = await devolver({ localId: "KGF8-CASH", tipo: "devolucao", vendaLocalId: sale.id, itens: [{ inventoryId: refri.id, quantidade: 1 }] })
    expect(dinheiro.status).toBe(409)
    expect(dinheiro.body.code).toBe("REEMBOLSO_DINHEIRO_BLOQUEADO_POR_POLITICA")
    // Replay: o mesmo localId reenviado em paralelo (fila offline + clique) continua recusado e sem efeito.
    const replays = await Promise.all(Array.from({ length: 4 }, () => devolver({ ...tentativas[0], vendaLocalId: sale.id })))
    expect(replays.map((r) => r.body.code)).toEqual(Array(4).fill("DEVOLUCAO_KG_BLOQUEADA"))
    expect(await efeitos(sale.id!, [pao.id, refri.id])).toEqual(antes)

    // Busca do F8: a venda aparece com peso e valores exatos, e TODA linha sinaliza o bloqueio.
    const e = await eleg(sale.id!)
    expect(e.status).toBe(200)
    const lines = e.body.vendas[0].lines as Array<{ produtoId: string; quantity: number; lineTotal: number; bloqueioDevolucao?: string }>
    expect(lines).toHaveLength(2)
    for (const l of lines) expect(l.bloqueioDevolucao).toMatch(/KG/)
    const kgLine = lines.find((l) => l.produtoId === pao.id)!
    expect(kgLine.quantity).toBe(0.437)
    expect(kgLine.lineTotal).toBe(saleLineTotalCents(0.437, 18.9)! / 100)
  })

  it("defesa em profundidade: escrita direta de devolução numa venda KG é recusada pelo trigger do banco", async () => {
    const pao = await produto({ name: "Pão KG trigger", price: 20, metadata: KG, sku: "PTG", estoque: 2 })
    const sale = venda([{ id: pao.id, name: pao.name, quantity: 0.25, price: 20 }], { kg: true })
    await persist(sale)
    await expect(prisma.devolucaoVenda.create({
      data: { storeId: A, localId: "KGF8-RAW-" + randomUUID(), vendaLocalId: sale.id!, tipo: "vale_credito", valorTotal: 1, creditoEmitido: 1 },
    })).rejects.toThrow(/MANUAL_KG_PARTIAL_RETURN_BLOCKED/)
  })

  it("troca UN gera vale, nova venda KG paga com o vale; cancelar a venda KG restaura vale e estoque KG exatos", async () => {
    const pao = await produto({ name: "Queijo KG", price: 20, metadata: KG, sku: "QJ", estoque: 5 })
    const refri = await produto({ name: "Suco UN", price: 7.5, metadata: UN, sku: "SUC", estoque: 10 })
    const valeAntes = await saldoVale()
    const origem = venda([{ id: refri.sku!, name: refri.name, quantity: 2, price: 7.5 }], { kg: false })
    await persist(origem)
    expect((await saldo(refri.id)).stock).toBe("8")

    // Troca UN (#331): devolve 1 suco → vale de 7,50 e estoque UN +1.
    const troca = await devolver({ localId: "KGF8-TR-" + randomUUID(), tipo: "troca", vendaLocalId: origem.id, itens: [{ inventoryId: refri.sku, quantidade: 1 }] })
    expect(troca.status, JSON.stringify(troca.body)).toBe(200)
    expect(troca.body.creditoEmitido).toBe(7.5)
    expect((await saldo(refri.id)).stock).toBe("9")
    expect(await saldoVale()).toBe(valeAntes + 7.5)
    const origemStatus = (await prisma.venda.findFirstOrThrow({ where: { pedidoId: origem.id } })).status
    expect(origemStatus).toBe("parcialmente_devolvida")

    // Nova venda da troca é KG: 0,350 kg × R$ 20,00 = R$ 7,00 pagos com vale.
    const nova = venda([{ id: pao.id, name: pao.name, quantity: 0.35, price: 20 }], { kg: true, pb: { creditoVale: 7 } })
    await persist(nova)
    expect((await saldo(pao.id)).stock).toBe("4.65")
    expect(await saldoVale()).toBe(valeAntes + 0.5)

    // A venda KG confirmada não aceita devolução parcial; o caminho é o cancelamento integral.
    const parcial = await devolver({ localId: "KGF8-NV-" + randomUUID(), tipo: "vale_credito", vendaLocalId: nova.id, itens: [{ inventoryId: pao.id, quantidade: 1 }] })
    expect(parcial.body.code).toBe("DEVOLUCAO_KG_BLOQUEADA")
    const c = await cancelar(nova.id!)
    expect(c.status, JSON.stringify(c.body)).toBe(200)
    expect(await saldo(pao.id)).toEqual({ stock: "5", dep: "5" })
    expect(await saldoVale()).toBe(valeAntes + 7.5)
    // Venda UN de origem e a troca já gravada ficam intactas.
    expect((await prisma.venda.findFirstOrThrow({ where: { pedidoId: origem.id } })).status).toBe(origemStatus)
    expect((await saldo(refri.id)).stock).toBe("9")
    // Cancelada, a venda KG continua sem devolução possível (status precede o bloqueio KG).
    const depois = await devolver({ localId: "KGF8-POS-" + randomUUID(), tipo: "vale_credito", vendaLocalId: nova.id, itens: [{ inventoryId: pao.id, quantidade: 1 }] })
    expect(depois.status).toBe(409)
    expect(depois.body.code).toBe("VENDA_CANCELADA")
  })

  it("venda com o marcador KG e só linhas UN (produto virou UN antes do reenvio) é cancelável pelo protocolo KG", async () => {
    // Revisão substituta 2026-11-08 (P2-1): o cancelamento decidia o caminho KG só por linha KG,
    // enquanto os gatilhos do banco protegem a venda pelo marcador do payload — o update caía no
    // gatilho (writer KG exigido) e a rota respondia 503 genérico, sem saída operacional.
    const suco = await produto({ name: "Suco ex-KG", price: 6, metadata: UN, sku: "SXK", estoque: 10 })
    const sale = venda([{ id: suco.id, name: suco.name, quantity: 2, price: 6 }], { kg: true })
    await persist(sale)
    expect((await saldo(suco.id)).stock).toBe("8")
    const row = await prisma.venda.findFirstOrThrow({ where: { pedidoId: sale.id }, include: { itens: true } })
    expect((row.payload as { manualKgSale?: string }).manualKgSale).toBe(MANUAL_KG_SALE)
    expect(row.itens.every((i) => i.quantidadeKg === null && i.quantidade === 2)).toBe(true)
    // Política F8 inalterada: venda do protocolo KG não aceita devolução parcial.
    const parcial = await devolver({ localId: "KGF8-MKUN-" + randomUUID(), tipo: "vale_credito", vendaLocalId: sale.id, itens: [{ inventoryId: suco.id, quantidade: 1 }] })
    expect(parcial.body.code).toBe("DEVOLUCAO_KG_BLOQUEADA")
    const c = await cancelar(sale.id!)
    expect(c.status, JSON.stringify(c.body)).toBe(200)
    expect(await saldo(suco.id)).toEqual({ stock: "10", dep: "10" })
    expect((await prisma.venda.findFirstOrThrow({ where: { pedidoId: sale.id } })).status).toBe("cancelada")
    expect(await prisma.movimentacaoEstoque.count({ where: { storeId: A, produtoId: suco.id, origem: "cancelamento_pdv" } })).toBe(1)
    const again = await cancelar(sale.id!)
    expect(again.status).toBe(409)
    expect(await saldo(suco.id)).toEqual({ stock: "10", dep: "10" })
  })

  it("corrida: cancelamento × 5 devoluções simultâneas da venda KG — estoque reposto uma vez, nenhuma devolução gravada", async () => {
    const pao = await produto({ name: "Pão corrida", price: 18.9, metadata: KG, sku: "PCR", estoque: 3 })
    const sale = venda([{ id: pao.id, name: pao.name, quantity: 1.234, price: 18.9 }], { kg: true })
    await persist(sale)
    const [c, ...devs] = await Promise.all([
      cancelar(sale.id!),
      ...Array.from({ length: 5 }, (_, i) => devolver({ localId: `KGF8-RACE-${i}-${randomUUID()}`, tipo: "vale_credito", vendaLocalId: sale.id, itens: [{ inventoryId: pao.id, quantidade: 1 }] })),
    ])
    expect(c.status, JSON.stringify(c.body)).toBe(200)
    for (const d of devs) {
      expect(d.status).toBe(409)
      expect(["DEVOLUCAO_KG_BLOQUEADA", "VENDA_CANCELADA"]).toContain(d.body.code)
    }
    expect(await saldo(pao.id)).toEqual({ stock: "3", dep: "3" })
    expect(await prisma.devolucaoVenda.count({ where: { storeId: A, vendaLocalId: sale.id! } })).toBe(0)
    expect(await prisma.movimentacaoEstoque.count({ where: { storeId: A, produtoId: pao.id, origem: "cancelamento_pdv" } })).toBe(1)
  })

  it("SKU alterado depois da venda UN numa loja KG: o SKU antigo devolve o produto certo; o KG não é tocado", async () => {
    const pao = await produto({ name: "Pão KG vizinho", price: 18.9, metadata: KG, sku: "PVZ", estoque: 2 })
    const bolo = await produto({ name: "Bolo UN", price: 12, metadata: UN, sku: "BOLO", estoque: 4 })
    const skuAntigo = bolo.sku!
    const origem = venda([{ id: skuAntigo, name: bolo.name, quantity: 2, price: 12 }], { kg: false })
    await persist(origem)
    await prisma.produto.update({ where: { id: bolo.id }, data: { sku: "BOLO-NOVO-" + randomUUID().slice(0, 6) } })
    const r = await devolver({ localId: "KGF8-SKU-" + randomUUID(), tipo: "vale_credito", vendaLocalId: origem.id, itens: [{ inventoryId: skuAntigo, quantidade: 2 }] })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.itens[0].produtoId).toBe(bolo.id)
    expect((await saldo(bolo.id)).stock).toBe("4")
    expect(await saldo(pao.id)).toEqual({ stock: "2", dep: "2" })
  })

  it("declaração comercial inválida após a venda UN: recusa 409 sem vale nem estoque", async () => {
    const item = await produto({ name: "Item UN que virou inválido", price: 9, metadata: UN, sku: "INV", estoque: 3 })
    const origem = venda([{ id: item.id, name: item.name, quantity: 1, price: 9 }], { kg: false })
    await persist(origem)
    await prisma.produto.update({ where: { id: item.id }, data: { metadata: { comercial: { version: 2, modoVenda: "unidade", unidade: "UN", basePreco: "UN" } } } })
    const antes = await efeitos(origem.id!, [item.id])
    const r = await devolver({ localId: "KGF8-INV-" + randomUUID(), tipo: "vale_credito", vendaLocalId: origem.id, itens: [{ inventoryId: item.id, quantidade: 1 }] })
    expect(r.status).toBe(409)
    expect(r.body.code).toBe("PRODUTO_COMERCIAL_INVALIDO")
    expect(await efeitos(origem.id!, [item.id])).toEqual(antes)
    expect((await eleg(origem.id!)).body.vendas[0].lines[0].bloqueioDevolucao).toMatch(/inválida/)
  })

  it("encaminhamento ao Financeiro de devolução de venda KG: referência = valor pago da linha KG, nunca zero, sem efeito (R1 P2)", async () => {
    const queijo = await produto({ name: "Queijo pendência", price: 20, metadata: KG, sku: "QPD", estoque: 3 })
    const sale = venda([{ id: queijo.id, name: queijo.name, quantity: 1, price: 20 }], { kg: true })
    await persist(sale)
    const antes = await efeitos(sale.id!, [queijo.id])
    const r = await prisma.$transaction((tx) => encaminharPendenciaDevolucao(tx, {
      storeId: A, localId: "KGF8-PEND-" + randomUUID(), vendaLocalId: sale.id!, categoria: "VALE_EMITIDO", estado: "RECUSA_DEFINITIVA",
      valorDeclarado: 20, motivoRecusa: "DEVOLUCAO_KG_BLOQUEADA", justificativa: "Vale local emitido antes da integração", usuarioId: "fixture-op", usuarioNome: "Operador Sintético",
      itens: [{ inventoryId: queijo.id, quantidade: 1 }],
    }))
    expect(r).toMatchObject({ vendaOrigemNoServidor: true, valorReferenciaServidor: 20, valorDeclarado: 20 })
    expect(await efeitos(sale.id!, [queijo.id])).toEqual(antes)
  })

  it("isolamento entre lojas: a venda KG da loja A não é vista nem devolvida pela loja B", async () => {
    const pao = await produto({ name: "Pão loja A", price: 18.9, metadata: KG, sku: "PLA", estoque: 2 })
    const sale = venda([{ id: pao.id, name: pao.name, quantity: 0.5, price: 18.9 }], { kg: true })
    await persist(sale)
    const antesA = await efeitos(sale.id!, [pao.id])
    const antesB = await efeitos(sale.id!, [], B)
    const r = await devolver({ localId: "KGF8-ISO-" + randomUUID(), tipo: "vale_credito", vendaLocalId: sale.id, itens: [{ inventoryId: pao.id, quantidade: 1 }] }, B)
    expect(r.status).toBe(409)
    expect(r.body.code).toBe("VENDA_ORIGEM_NAO_ENCONTRADA")
    expect((await eleg(sale.id!, B)).body.vendas).toEqual([])
    expect((await eleg(pao.id, B)).body.vendas).toEqual([])
    expect(await efeitos(sale.id!, [pao.id])).toEqual(antesA)
    expect(await efeitos(sale.id!, [], B)).toEqual(antesB)
  })
})
