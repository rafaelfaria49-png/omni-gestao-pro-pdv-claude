/**
 * PADARIA-KG-STACK-CONTINUIDADE-RECONCILIACAO-001 — cenários obrigatórios da reconciliação
 * com a main 09e9764 que não tinham prova explícita nas suítes anteriores.
 *
 * A) UN continua inteira · B/C) pesos 0,100/0,250/0,500/1,000/1,250 × preço/kg em centavos
 * F) reenvio não duplica venda/baixa/recebimento · G) 0,100 + 0,200 = 0,300 kg
 * H) cancelamento KG pela rota real: reversão exata em KG, idempotente
 * J) outra loja não cancela nem devolve item da loja dona
 * + junção #335 × #372: venda mista KG + aparelho por IMEI cancela pelo contrato do
 *   aparelho (fail-closed) e reverte a transação inteira.
 *
 * Handlers de PRODUÇÃO contra o banco isolado de scripts/pdv/run-manual-kg-tests.mjs;
 * sem a variável a suíte é pulada. Dados sintéticos.
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
vi.mock("@/lib/auth/guard-enterprise", () => ({ requireEnterpriseWith: async () => ({ ok: true, session: SESSAO }) }))
vi.mock("@/lib/vendas/guard-estorno-venda", () => ({
  requireEstornoStepUp: async () => ({ ok: true, supervisorId: "sup-sintetico", supervisorNome: "Supervisor Sintético" }),
}))
vi.mock("@/lib/auth/enterprise-permissions", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/enterprise-permissions")>()),
  canAccessStore: () => true,
}))
vi.mock("@/lib/automation/automation-engine", () => ({ handleEvent: vi.fn() }))

import { prisma } from "@/lib/prisma"
import { Prisma } from "@/generated/prisma"
import { applyStockMutation, type StockLedgerTx } from "@/lib/estoque/stock-ledger-service"
import { upsertVendaInTransaction, type SalePayload } from "@/lib/ops-upsert-venda"
import { MANUAL_KG_SALE, saleLineTotalCents } from "./manual-kg-contract"
import { enterManualKgTransaction } from "./manual-kg-server"
import * as aparelhos from "@/lib/aparelhos/service"
import { aparelhoPermissionsForRole } from "@/lib/aparelhos/permissions"
import { luhnCheckDigit } from "@/lib/aparelhos/imei"
import { POST as postCancelar } from "@/app/api/vendas/[id]/cancelar/route"
import { POST as postDevolucao } from "@/app/api/ops/devolucao/route"
import { GET as getElegibilidade } from "@/app/api/ops/devolucao/elegibilidade/route"

const url = "postgresql://manual_kg@127.0.0.1:55479/manual_kg_sale_isolated"
const enabled = process.env.MANUAL_KG_TEST_DATABASE_URL === url
if (process.env.MANUAL_KG_TEST_DATABASE_URL && !enabled) throw Error("MANUAL_KG_ISOLATION_REQUIRED")
const suite = enabled ? describe : describe.skip

const A = "kg-cont-a", B = "kg-cont-b"
const CPF = "52998224725" // CPF sintético válido de documentação
const NOME = "Cliente Sintético"
const KG = { comercial: { version: 1, modoVenda: "peso", unidade: "KG", basePreco: "KG" } }
const UN = { comercial: { version: 1, modoVenda: "unidade", unidade: "UN", basePreco: "UN" } }
const LIVE = { enforceStock: true, requireCaixaSession: true }
const deps = { db: prisma as unknown as { $transaction<T>(fn: (tx: StockLedgerTx) => Promise<T>): Promise<T> } }

type Linha = { id: string; name: string; quantity: number; price: number }

async function produto(input: { name: string; price: number; metadata: object; estoque: number; storeId?: string }) {
  const storeId = input.storeId ?? A
  const p = await prisma.produto.create({
    data: { id: "kg-cont-" + randomUUID(), storeId, name: input.name, stock: 0, price: input.price, metadata: input.metadata, sku: "KC-" + randomUUID().slice(0, 8) },
  })
  if (input.estoque > 0) {
    const r = await applyStockMutation({ storeId, principal: null, source: "kg-cont" }, { kind: "entrada", produtoId: p.id, quantidade: input.estoque, origem: "manual" }, deps)
    if (!r.ok) throw Error(r.code)
  }
  return p
}
const entrada = (produtoId: string, quantidade: number, storeId = A) =>
  applyStockMutation({ storeId, principal: null, source: "kg-cont" }, { kind: "entrada", produtoId, quantidade, origem: "manual" }, deps)

function venda(lines: Linha[], opts: { kg: boolean; storeId?: string }): SalePayload {
  const storeId = opts.storeId ?? A
  const items = lines.map((l) => ({
    inventoryId: l.id, produtoId: l.id, name: l.name, quantity: l.quantity, unitPrice: l.price,
    lineTotal: (opts.kg ? saleLineTotalCents(l.quantity, l.price)! : Math.round(l.quantity * l.price * 100)) / 100,
  }))
  const total = items.reduce((s, l) => s + Math.round(l.lineTotal * 100), 0) / 100
  return {
    id: "KG-CONT-" + randomUUID(), ...(opts.kg ? { manualKgSale: MANUAL_KG_SALE } : {}), sessaoId: storeId + "-cash",
    at: new Date().toISOString(), total, customerCpf: CPF, customerName: NOME, lines: items, paymentBreakdown: { dinheiro: total },
  }
}
const persist = (sale: SalePayload, lojaId = A) =>
  prisma.$transaction((tx) => upsertVendaInTransaction(tx, lojaId, sale, "Operador sintético", LIVE), { timeout: 20000, maxWait: 20000 })

const headers = (loja = A) => ({ "Content-Type": "application/json", "x-assistec-loja-id": loja })
async function cancelar(id: string, loja = A) {
  const res = await postCancelar(
    new Request(`http://localhost/api/vendas/${id}/cancelar`, { method: "POST", headers: headers(loja), body: JSON.stringify({ motivo: "teste sintético", forcar: true }) }),
    { params: Promise.resolve({ id }) },
  )
  return { status: res.status, body: await res.json() }
}
async function devolver(body: Record<string, unknown>, loja = A) {
  const res = await postDevolucao(new Request("http://localhost/api/ops/devolucao", {
    method: "POST", headers: headers(loja), body: JSON.stringify({ clienteNome: NOME, clienteDoc: CPF, sessaoId: loja + "-cash", ...body }),
  }))
  return { status: res.status, body: await res.json() }
}

/** Saldo como texto do PostgreSQL — sem passar por double do JS. */
async function saldo(id: string) {
  const [row] = await prisma.$queryRaw<Array<{ stock: string; dep: string | null }>>`
    SELECT p.stock::text AS stock, (SELECT string_agg(d.quantidade::text, ',') FROM produto_depositos d WHERE d."produtoId" = p.id) AS dep
    FROM estoque_produtos p WHERE p.id = ${id}`
  return row
}
const livro = (id: string) => prisma.$queryRaw<Array<{ tipo: string; origem: string; q: string; d: string }>>`
  SELECT tipo::text AS tipo, origem, quantidade::text AS q, "estoqueDepois"::text AS d
  FROM movimentacoes_estoque WHERE "produtoId" = ${id} ORDER BY "createdAt", id`
/** Tudo que um cancelamento/devolução poderia alterar, lido do banco. */
async function efeitos(pedidoId: string, produtos: string[], loja = A) {
  const v = await prisma.venda.findFirst({ where: { pedidoId }, select: { status: true, storeId: true } })
  return {
    venda: v,
    saldos: await Promise.all(produtos.map(saldo)),
    movsEstoque: await prisma.movimentacaoEstoque.count({ where: { documento: pedidoId } }),
    movsFin: await prisma.movimentacaoFinanceira.count({ where: { referenciaId: pedidoId } }),
    devolucoes: await prisma.devolucaoVenda.count({ where: { vendaLocalId: pedidoId } }),
    valeLojaB: await prisma.clienteCredito.count({ where: { storeId: B, clienteDoc: CPF } }),
    loja,
  }
}

suite("KG continuidade — reconciliação com a main 09e9764 (PostgreSQL real)", () => {
  beforeAll(async () => {
    for (const [id, code] of [[A, "KCA"], [B, "KCB"]] as const) {
      await prisma.store.upsert({ where: { id }, create: { id, name: "Padaria continuidade sintética " + code, codigoNumeracaoVenda: code }, update: {} })
      if (!(await prisma.sessaoCaixa.findFirst({ where: { id: id + "-cash" }, select: { id: true } }))) {
        await prisma.sessaoCaixa.create({ data: { id: id + "-cash", storeId: id, operador: "Operador", status: "ABERTA" } })
      }
    }
  })
  afterAll(() => prisma.$disconnect())

  it("A) produto por unidade: 10 UN continuam 10 UN (venda comum e venda com marcador KG)", async () => {
    const refri = await produto({ name: "Refrigerante UN", price: 6.5, metadata: UN, estoque: 30 })
    const comum = venda([{ id: refri.id, name: refri.name, quantity: 10, price: 6.5 }], { kg: false })
    await persist(comum)
    const pao = await produto({ name: "Pão KG p/ marcador", price: 18.9, metadata: KG, estoque: 5 })
    const mista = venda([{ id: refri.id, name: refri.name, quantity: 10, price: 6.5 }, { id: pao.id, name: pao.name, quantity: 0.5, price: 18.9 }], { kg: true })
    await persist(mista)
    expect(await saldo(refri.id)).toEqual({ stock: "10", dep: "10" })
    for (const pedidoId of [comum.id!, mista.id!]) {
      const row = await prisma.venda.findUniqueOrThrow({ where: { pedidoId }, include: { itens: true } })
      const un = row.itens.find((i) => i.inventoryId === refri.id)!
      expect(un.quantidade).toBe(10)
      expect(un.quantidadeKg).toBeNull()
    }
    expect((await livro(refri.id)).filter((m) => m.tipo === "saida").map((m) => m.q)).toEqual(["-10", "-10"])
  })

  it("B/C) 0,100 · 0,250 · 0,500 · 1,000 · 1,250 kg × R$ 18,90/kg: total em centavos e baixa exata", async () => {
    const pao = await produto({ name: "Pão francês sintético", price: 18.9, metadata: KG, estoque: 10 })
    const esperado: Array<[number, number, string]> = [
      [0.1, 1.89, "9.9"], [0.25, 4.73, "9.65"], [0.5, 9.45, "9.15"], [1, 18.9, "8.15"], [1.25, 23.63, "6.9"],
    ]
    for (const [peso, total, saldoDepois] of esperado) {
      const sale = venda([{ id: pao.id, name: pao.name, quantity: peso, price: 18.9 }], { kg: true })
      expect(sale.total).toBe(total)
      await persist(sale)
      const row = await prisma.venda.findUniqueOrThrow({ where: { pedidoId: sale.id! }, include: { itens: true } })
      expect(row.total).toBe(total)
      expect(Number(row.itens[0].quantidadeKg)).toBe(peso)
      expect(row.itens[0].lineTotal).toBe(total)
      expect(await saldo(pao.id)).toEqual({ stock: saldoDepois, dep: saldoDepois })
    }
  })

  it("F) reenvio da venda confirmada: uma venda, uma baixa e um recebimento", async () => {
    const pao = await produto({ name: "Pão reenvio", price: 20, metadata: KG, estoque: 3 })
    const sale = venda([{ id: pao.id, name: pao.name, quantity: 0.35, price: 20 }], { kg: true })
    expect((await persist(sale)).replayed).toBe(false)
    const antes = await efeitos(sale.id!, [pao.id])
    for (let i = 0; i < 3; i += 1) expect((await persist(sale)).replayed).toBe(true)
    expect(await efeitos(sale.id!, [pao.id])).toEqual(antes)
    expect(await prisma.venda.count({ where: { pedidoId: sale.id! } })).toBe(1)
    expect((await livro(pao.id)).filter((m) => m.tipo === "saida")).toHaveLength(1)
    expect(await saldo(pao.id)).toEqual({ stock: "2.65", dep: "2.65" })
  })

  it("G) estoque 0,100 + 0,200 = 0,300 kg exato (sem 0,30000000000000004)", async () => {
    const pao = await produto({ name: "Pão soma", price: 20, metadata: KG, estoque: 0 })
    expect(await entrada(pao.id, 0.1)).toMatchObject({ ok: true })
    expect(await entrada(pao.id, 0.2)).toMatchObject({ ok: true })
    expect(await saldo(pao.id)).toEqual({ stock: "0.3", dep: "0.3" })
    expect((await livro(pao.id)).map((m) => [m.q, m.d])).toEqual([["0.1", "0.1"], ["0.2", "0.3"]])
  })

  it("H) cancelamento KG pela rota: estoque volta em KG exato, um estorno, replay recusado sem efeito", async () => {
    const pao = await produto({ name: "Pão cancelamento", price: 18.9, metadata: KG, estoque: 2 })
    const refri = await produto({ name: "Refri cancelamento", price: 6.5, metadata: UN, estoque: 5 })
    const sale = venda([{ id: pao.id, name: pao.name, quantity: 0.35, price: 18.9 }, { id: refri.id, name: refri.name, quantity: 2, price: 6.5 }], { kg: true })
    await persist(sale)
    expect(await saldo(pao.id)).toEqual({ stock: "1.65", dep: "1.65" })
    const c = await cancelar(sale.id!)
    expect(c.status, JSON.stringify(c.body)).toBe(200)
    expect(c.body.estoqueReposto).toBe(2)
    expect(await saldo(pao.id)).toEqual({ stock: "2", dep: "2" })
    expect(await saldo(refri.id)).toEqual({ stock: "5", dep: "5" })
    // KG entra como 0.35 (não 350 nem 1 unidade); UN entra como 2.
    expect((await livro(pao.id)).filter((m) => m.origem === "cancelamento_pdv").map((m) => m.q)).toEqual(["0.35"])
    expect((await livro(refri.id)).filter((m) => m.origem === "cancelamento_pdv").map((m) => m.q)).toEqual(["2"])
    const estornos = await prisma.movimentacaoFinanceira.findMany({ where: { storeId: A, referenciaId: sale.id!, origem: "cancelamento_pdv" }, select: { valor: true } })
    expect(estornos.map((e) => e.valor)).toEqual([sale.total])
    const antes = await efeitos(sale.id!, [pao.id, refri.id])
    const replay = await cancelar(sale.id!)
    expect(replay.status).toBe(409)
    expect(await efeitos(sale.id!, [pao.id, refri.id])).toEqual(antes)
  })

  it("J) outra loja não cancela, não consulta e não devolve item da loja dona", async () => {
    const pao = await produto({ name: "Pão da loja A", price: 20, metadata: KG, estoque: 2 })
    const sale = venda([{ id: pao.id, name: pao.name, quantity: 0.5, price: 20 }], { kg: true })
    await persist(sale)
    const antes = await efeitos(sale.id!, [pao.id])
    const c = await cancelar(sale.id!, B)
    expect(c.status).toBe(404)
    const eleg = await getElegibilidade(new Request(`http://localhost/api/ops/devolucao/elegibilidade?q=${encodeURIComponent(sale.id!)}`, { headers: { "x-assistec-loja-id": B } }))
    const elegBody = await eleg.json()
    expect(JSON.stringify(elegBody)).not.toContain(pao.id)
    const d = await devolver({ localId: "KC-" + randomUUID(), tipo: "vale_credito", vendaLocalId: sale.id, itens: [{ inventoryId: pao.id, quantidadeKg: "0.100", condicao: "apto_revenda" }] }, B)
    // A venda não existe para a loja B: recusa sem gravar.
    expect(d.status, JSON.stringify(d.body)).toBe(409)
    expect(d.body.code).toBe("VENDA_ORIGEM_NAO_ENCONTRADA")
    // Venda de B não baixa o produto de A.
    await expect(persist(venda([{ id: pao.id, name: pao.name, quantity: 0.1, price: 20 }], { kg: true, storeId: B }), B)).rejects.toThrow()
    expect(await efeitos(sale.id!, [pao.id])).toEqual(antes)
  })

  it("junção #335 × #372: venda mista KG + aparelho cancela pelo contrato do aparelho e reverte tudo", async () => {
    const pao = await produto({ name: "Pão mista aparelho", price: 20, metadata: KG, estoque: 2 })
    const cel = await produto({ name: "Celular mista", price: 900, metadata: UN, estoque: 2 })
    const sale = venda([{ id: pao.id, name: pao.name, quantity: 0.5, price: 20 }, { id: cel.id, name: cel.name, quantity: 1, price: 900 }], { kg: true })
    await persist(sale)
    // Marca a linha UN como unidade física sem vínculo válido: o contrato do aparelho deve recusar.
    const v = await prisma.venda.findFirstOrThrow({ where: { pedidoId: sale.id, storeId: A }, select: { id: true, payload: true } })
    const payload = v.payload as { lines: Array<Record<string, unknown>> }
    payload.lines = payload.lines.map((l) => (l.inventoryId === cel.id ? { ...l, deviceSale: { aparelhoId: "apar-sintetico-mista" } } : l))
    // Venda KG é protegida por gatilho: a fixture grava pelo mesmo modo de escritor KG.
    await prisma.$transaction(async (tx) => {
      await enterManualKgTransaction(tx)
      await tx.venda.update({ where: { id: v.id }, data: { payload: payload as never } })
    })
    const antes = await efeitos(sale.id!, [pao.id, cel.id])
    const c = await cancelar(sale.id!)
    expect(c.status, JSON.stringify(c.body)).toBe(409)
    expect(c.body.code).toBe("APARELHO_CANCELAMENTO_BLOQUEADO")
    expect(await efeitos(sale.id!, [pao.id, cel.id])).toEqual(antes)
  })

  it("junção #335 × #372 (sucesso): mista KG + aparelho real — KG volta exato, IMEI vai a revisão sem saldo, um estorno", async () => {
    await prisma.storeSettings.upsert({ where: { storeId: A }, create: { storeId: A, printerConfig: { capabilities: { version: 1, overrides: { "catalog.serializedDevices": true } } } },
      update: { printerConfig: { capabilities: { version: 1, overrides: { "catalog.serializedDevices": true } } } } })
    // Loja sintética com todos os módulos (como em test/aparelhos): deviceCatalog liberado.
    await prisma.store.update({ where: { id: A }, data: { moduleAccess: Prisma.DbNull } })
    const ctx: aparelhos.AparelhoCtx = { storeId: A, actorId: "dono-cont", actorLabel: "Dono sintético", perms: aparelhoPermissionsForRole("ADMIN") }
    const corpo = "3567891" + String(Date.now() % 10_000_000).padStart(7, "0")
    const cad = await aparelhos.cadastrarAparelho(ctx, { marca: "Apple", modelo: "iPhone sintético", armazenamento: "128 GB", cor: "Preto", condicao: "seminovo",
      imei1: corpo + String(luhnCheckDigit(corpo)), custoAquisicao: 3000, despesas: 0, precoVenda: 900, garantiaContratualDias: 90,
      checklist: { liga: "PASS", tela: "PASS", touch: "PASS" }, acessorios: {} })
    if (!cad.ok) throw Error(cad.code)
    const conf = await aparelhos.registrarConferenciaRestricao(ctx, cad.aparelho.id, { resultado: "sem_restricao", fonte: "Consulta sintética" })
    if (!conf.ok) throw Error(conf.code)
    const lib = await aparelhos.liberarParaVenda(ctx, cad.aparelho.id)
    if (!lib.ok) throw Error(lib.code)
    const unit = await prisma.aparelhoFisico.findUniqueOrThrow({ where: { id: cad.aparelho.id } })
    const cliente = await prisma.cliente.create({ data: { storeId: A, name: NOME, document: CPF } })
    const pao = await produto({ name: "Pão mista real", price: 20, metadata: KG, estoque: 2 })
    const saldoModeloAntes = await saldo(unit.produtoId)
    const total = 10 + 900
    const sale = {
      id: "KG-CONT-APA-" + randomUUID(), manualKgSale: MANUAL_KG_SALE, sessaoId: A + "-cash", at: new Date().toISOString(), total,
      clienteId: cliente.id, customerName: NOME, customerCpf: CPF, paymentBreakdown: { dinheiro: total },
      lines: [
        { inventoryId: pao.id, produtoId: pao.id, name: pao.name, quantity: 0.5, unitPrice: 20, lineTotal: 10 },
        { inventoryId: unit.produtoId, produtoId: unit.produtoId, name: "iPhone sintético", quantity: 1, unitPrice: 900, lineTotal: 900,
          deviceSale: { version: 1, aparelhoId: unit.id, contratualDias: 90 } },
      ],
    } as SalePayload
    await persist(sale)
    expect(await saldo(pao.id)).toEqual({ stock: "1.5", dep: "1.5" })
    expect((await prisma.aparelhoFisico.findUniqueOrThrow({ where: { id: unit.id } })).status).toBe("vendido")
    const c = await cancelar(sale.id!)
    expect(c.status, JSON.stringify(c.body)).toBe(200)
    expect(await saldo(pao.id)).toEqual({ stock: "2", dep: "2" })
    expect((await livro(pao.id)).filter((m) => m.origem === "cancelamento_pdv").map((m) => m.q)).toEqual(["0.5"])
    // Unidade física volta a revisão; o saldo comercial do modelo NÃO é reposto pelo cancelamento.
    expect((await prisma.aparelhoFisico.findUniqueOrThrow({ where: { id: unit.id } })).status).toBe("em_revisao")
    expect((await prisma.aparelhoVenda.findFirstOrThrow({ where: { storeId: A, aparelhoId: unit.id } })).status).toBe("cancelada")
    expect((await livro(unit.produtoId)).filter((m) => m.origem === "cancelamento_pdv")).toHaveLength(0)
    expect((await saldo(unit.produtoId)).stock).toBe(String(Number(saldoModeloAntes.stock) - 1))
    const estornos = await prisma.movimentacaoFinanceira.findMany({ where: { storeId: A, referenciaId: sale.id!, origem: "cancelamento_pdv" }, select: { valor: true } })
    expect(estornos.map((e) => e.valor)).toEqual([total])
    expect((await cancelar(sale.id!)).status).toBe(409)
  })
})
