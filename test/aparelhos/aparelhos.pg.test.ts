// @vitest-environment node
//
// OMNI-APARELHOS-ENDTOEND-001 — integração em PostgreSQL REAL e descartável.
// Serviço real + motor canônico de venda (`upsertVendaInTransaction`) real.
// Sem ambiente = BLOQUEIO_EXPLICITO_PG (nunca skip). Prepare com scripts/aparelhos/prepare-pg.mjs.
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PrismaClient } from "@/generated/prisma"

function exigirBancoLocal(): string {
  const url = (process.env.APARELHOS_TEST_DATABASE_URL ?? "").trim()
  if (!url) throw new Error("BLOQUEIO_EXPLICITO_PG: defina APARELHOS_TEST_DATABASE_URL (PostgreSQL descartável preparado).")
  if (!["127.0.0.1", "localhost", "::1"].includes(new URL(url).hostname)) throw new Error("BLOQUEIO_EXPLICITO_PG: somente loopback.")
  for (const k of ["DATABASE_URL", "DIRECT_URL"]) {
    if ((process.env[k] ?? "").trim() !== url) throw new Error(`BLOQUEIO_EXPLICITO_PG: ${k} deve ser igual a APARELHOS_TEST_DATABASE_URL.`)
  }
  return url
}

const db = new PrismaClient({ datasourceUrl: exigirBancoLocal() })
type Db = Parameters<typeof import("@/lib/aparelhos/service").listarAparelhos>[2]

import * as svc from "@/lib/aparelhos/service"
import { documentoDaVenda, previaTermo } from "@/lib/aparelhos/documents-service"
import { aparelhoPermissionsForRole } from "@/lib/aparelhos/permissions"
import { luhnCheckDigit } from "@/lib/aparelhos/imei"
import { addDaysKey, localDateKey } from "@/lib/aparelhos/warranty"
import { upsertVendaInTransaction, type SalePayload } from "@/lib/ops-upsert-venda"

const D = db as unknown as Db
const sufixo = Date.now().toString(36)
const LOJA_A = `loja-apa-a-${sufixo}`
const LOJA_B = `loja-apa-b-${sufixo}`
let imeiSeq = 100000
const imei = () => { const body = `3567891${String(imeiSeq++).padStart(7, "0")}`; return body + String(luhnCheckDigit(body)) }

const ctx = (storeId: string, role: string, actorId = `${role}-1`): svc.AparelhoCtx => ({ storeId, actorId, actorLabel: `QA ${role}`, perms: aparelhoPermissionsForRole(role) })
const ADMIN_A = ctx(LOJA_A, "ADMIN", "dono-a")
const GERENTE_A = ctx(LOJA_A, "GERENTE", "gerente-a")
const VENDEDOR_A = ctx(LOJA_A, "VENDEDOR", "vendedor-a")
const CAIXA_A = ctx(LOJA_A, "CAIXA", "caixa-a")

let clienteA = ""
let sessaoA = ""
let pedidoSeq = 0

function ok<T extends { ok: boolean }>(r: T | svc.Fail): T {
  if (!r.ok) throw new Error(`esperava ok, veio ${(r as svc.Fail).code}: ${(r as svc.Fail).message}`)
  return r as T
}

function device(input: Partial<Record<string, unknown>> = {}) {
  return {
    marca: "Apple", modelo: "iPhone 14", armazenamento: "128 GB", cor: "Preto", condicao: "seminovo",
    imei1: imei(), custoAquisicao: 3200, despesas: 100, precoVenda: 4999, garantiaContratualDias: 90,
    checklist: { liga: "PASS", tela: "PASS", touch: "NAO_TESTADO" }, acessorios: { cabo: true }, ...input,
  }
}

async function cadastrarLiberado(c: svc.AparelhoCtx, input: Partial<Record<string, unknown>> = {}) {
  const r = ok(await svc.cadastrarAparelho(c, device(input), D))
  ok(await svc.registrarConferenciaRestricao(c, r.aparelho.id, { resultado: "sem_restricao", fonte: "Consulta manual QA" }, D))
  ok(await svc.liberarParaVenda(c, r.aparelho.id, D))
  return db.aparelhoFisico.findUniqueOrThrow({ where: { id: r.aparelho.id } })
}

function saleFor(unit: { id: string; produtoId: string; precoVenda: number }, opts: { clienteId?: string | null; contratualDias?: number; pedidoId?: string; reservaToken?: string; dataEntrega?: string } = {}): SalePayload {
  const pedidoId = opts.pedidoId ?? `VDA-APA-${sufixo}-${++pedidoSeq}`
  return {
    id: pedidoId,
    at: new Date().toISOString(),
    total: unit.precoVenda,
    ...(opts.clienteId === null ? {} : { clienteId: opts.clienteId ?? clienteA, customerName: "Cliente QA" }),
    sessaoId: sessaoA,
    paymentBreakdown: { pix: unit.precoVenda },
    lines: [{
      inventoryId: unit.produtoId, produtoId: unit.produtoId, name: "iPhone 14", quantity: 1, unitPrice: unit.precoVenda, lineTotal: unit.precoVenda,
      deviceSale: { version: 1, aparelhoId: unit.id, contratualDias: opts.contratualDias ?? 90, ...(opts.reservaToken ? { reservaToken: opts.reservaToken } : {}), ...(opts.dataEntrega ? { dataEntrega: opts.dataEntrega } : {}) },
    }],
  } as SalePayload
}

async function vender(storeId: string, sale: SalePayload) {
  return db.$transaction((tx) => upsertVendaInTransaction(tx, storeId, sale, "Operador QA", { enforceStock: true, requireCaixaSession: true }), { timeout: 20_000 })
}

async function erroDe(p: Promise<unknown>): Promise<string> {
  try { await p; return "SEM_ERRO" } catch (e) { return String((e as { deviceCode?: string; code?: string }).deviceCode ?? (e as { code?: string }).code ?? (e as Error).message) }
}

beforeAll(async () => {
  for (const id of [LOJA_A, LOJA_B]) await db.store.create({ data: { id, name: `Loja QA ${id}`, cnpj: "00.000.000/0001-00" } })
  clienteA = (await db.cliente.create({ data: { storeId: LOJA_A, name: "João QA", document: "12345678909" } })).id
  sessaoA = (await db.sessaoCaixa.create({ data: { storeId: LOJA_A, operador: "Caixa QA" } })).id
  await db.sessaoCaixa.create({ data: { storeId: LOJA_B, operador: "Caixa QA B" } })
}, 30_000)

afterAll(async () => { await db.$disconnect() })

describe("Cadastro e identidade (01–07, 44)", () => {
  it("01/02/03: novo e usado, IMEI 1 e IMEI 2", async () => {
    const novo = ok(await svc.cadastrarAparelho(ADMIN_A, device({ condicao: "novo_lacrado", imei2: imei() }), D))
    const usado = ok(await svc.cadastrarAparelho(ADMIN_A, device({ condicao: "usado" }), D))
    const n = await db.aparelhoFisico.findUniqueOrThrow({ where: { id: novo.aparelho.id } })
    expect(n.imei2).toMatch(/^\d{15}$/)
    expect(await db.aparelhoIdentificador.count({ where: { aparelhoId: n.id } })).toBe(2)
    expect(n.produtoId).not.toBe((await db.aparelhoFisico.findUniqueOrThrow({ where: { id: usado.aparelho.id } })).produtoId)
    expect(n.status).toBe("aguardando_conferencia")
  })
  it("04: IMEI com dígito errado é recusado", async () => {
    const valido = imei()
    const bad = valido.slice(0, 14) + String((Number(valido[14]) + 1) % 10)
    expect(await svc.cadastrarAparelho(ADMIN_A, device({ imei1: bad }), D)).toMatchObject({ ok: false, code: "IMEI_INVALIDO", field: "imei1" })
    expect(await svc.cadastrarAparelho(ADMIN_A, device({ imei1: "", serial: "" }), D)).toMatchObject({ ok: false, code: "IDENTIFICADOR_OBRIGATORIO" })
  })
  it("05: IMEI duplicado (inclusive IMEI 2 igual ao IMEI 1 de outro) é recusado", async () => {
    const i = imei()
    ok(await svc.cadastrarAparelho(ADMIN_A, device({ imei1: i }), D))
    expect(await svc.cadastrarAparelho(ADMIN_A, device({ imei1: i }), D)).toMatchObject({ ok: false, code: "IMEI_DUPLICADO" })
    expect(await svc.cadastrarAparelho(ADMIN_A, device({ imei1: imei(), imei2: i }), D)).toMatchObject({ ok: false, code: "IMEI_DUPLICADO" })
    // mesmo IMEI em OUTRA loja é outra unidade (isolamento)
    ok(await svc.cadastrarAparelho(ctx(LOJA_B, "ADMIN"), device({ imei1: i }), D))
  })
  it("06/07: dois aparelhos do mesmo modelo dividem o produto, com custos diferentes", async () => {
    const a = await cadastrarLiberado(ADMIN_A, { modelo: "Galaxy S22", marca: "Samsung", custoAquisicao: 2000 })
    const b = await cadastrarLiberado(ADMIN_A, { modelo: "Galaxy S22", marca: "Samsung", custoAquisicao: 2300 })
    expect(a.produtoId).toBe(b.produtoId)
    expect([a.custoTotal, b.custoTotal]).toEqual([2100, 2400])
    const produto = await db.produto.findUniqueOrThrow({ where: { id: a.produtoId } })
    expect(produto.stock).toBe(2)
    expect(await db.movimentacaoEstoque.count({ where: { produtoId: a.produtoId, origem: "aparelho", tipo: "entrada" } })).toBe(2)
  })
  it("44: busca por IMEI completo e por final; caixa vê IMEI mascarado e sem custo (43)", async () => {
    const u = await cadastrarLiberado(ADMIN_A, { modelo: "Moto G84", marca: "Motorola" })
    const full = ok(await svc.listarAparelhos(ADMIN_A, { q: u.imei1! }, D))
    expect(full.itens.map((x) => x.id)).toContain(u.id)
    const fim = ok(await svc.buscarParaVenda(CAIXA_A, u.imei1!.slice(-6), D))
    const item = fim.itens.find((x) => x.id === u.id)!
    expect(item.custoTotal).toBeNull()
    expect(item.imei1).not.toBe(u.imei1)
    expect(item.imei1?.endsWith(u.imei1!.slice(-5))).toBe(true)
  })
})

describe("Estoque e ciclo de vida (11, 12, 13, 14, 15, 16)", () => {
  it("14/15: liberar credita 1 unidade só uma vez", async () => {
    const r = ok(await svc.cadastrarAparelho(ADMIN_A, device({ modelo: "iPhone 13" }), D))
    ok(await svc.registrarConferenciaRestricao(ADMIN_A, r.aparelho.id, { resultado: "sem_restricao", fonte: "QA" }, D))
    ok(await svc.liberarParaVenda(ADMIN_A, r.aparelho.id, D))
    const again = ok(await svc.liberarParaVenda(ADMIN_A, r.aparelho.id, D))
    expect((again as { replay?: boolean }).replay).toBe(true)
    const u = await db.aparelhoFisico.findUniqueOrThrow({ where: { id: r.aparelho.id } })
    expect(await db.movimentacaoEstoque.count({ where: { storeId: LOJA_A, documento: u.codigoInterno, tipo: "entrada" } })).toBe(1)
  })
  it("liberação exige conferência de restrição para usado", async () => {
    const r = ok(await svc.cadastrarAparelho(ADMIN_A, device(), D))
    expect(await svc.liberarParaVenda(ADMIN_A, r.aparelho.id, D)).toMatchObject({ ok: false, code: "CONFERENCIA_PENDENTE" })
  })
  it("11: restrição conhecida bloqueia, tira do estoque e impede liberar", async () => {
    const u = await cadastrarLiberado(ADMIN_A, { modelo: "iPhone 12" })
    const antes = (await db.produto.findUniqueOrThrow({ where: { id: u.produtoId } })).stock
    ok(await svc.registrarConferenciaRestricao(ADMIN_A, u.id, { resultado: "restricao_conhecida", fonte: "Consulta manual" }, D))
    const b = await db.aparelhoFisico.findUniqueOrThrow({ where: { id: u.id } })
    expect(b.status).toBe("bloqueado")
    expect((await db.produto.findUniqueOrThrow({ where: { id: u.produtoId } })).stock).toBe(antes - 1)
    expect(await svc.alterarStatus(ADMIN_A, u.id, { para: "disponivel" }, D)).toMatchObject({ ok: false })
  })
  it("12: checklist com falha exige observação; não testado não bloqueia nem aprova", async () => {
    const r = ok(await svc.cadastrarAparelho(ADMIN_A, device({ checklist: { tela: "FAIL", touch: "NAO_TESTADO" }, observacoes: "" }), D))
    ok(await svc.registrarConferenciaRestricao(ADMIN_A, r.aparelho.id, { resultado: "sem_restricao", fonte: "QA" }, D))
    expect(await svc.liberarParaVenda(ADMIN_A, r.aparelho.id, D)).toMatchObject({ ok: false, code: "CHECKLIST_COM_FALHA" })
    const ev = await db.aparelhoEvento.findFirstOrThrow({ where: { aparelhoId: r.aparelho.id, tipo: "cadastro" } })
    expect((ev.dados as { checklist: { aprovados: number; naoTestados: number } }).checklist.aprovados).toBe(0)
  })
  it("13: fotos são gravadas e limitadas", async () => {
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    const r = ok(await svc.cadastrarAparelho(ADMIN_A, device({ fotos: [{ dataUrl: png, legenda: "frente" }] }), D))
    expect(await db.aparelhoFoto.count({ where: { aparelhoId: r.aparelho.id } })).toBe(1)
    expect(await svc.cadastrarAparelho(ADMIN_A, device({ fotos: [{ dataUrl: "data:text/html;base64,AAAA" }] }), D)).toMatchObject({ ok: false })
  })
  it("16: reserva por um atendimento bloqueia venda de outro", async () => {
    const u = await cadastrarLiberado(ADMIN_A, { modelo: "iPhone 11" })
    ok(await svc.reservarAparelho(CAIXA_A, u.id, { token: "tok-1" }, D))
    expect(await svc.reservarAparelho(VENDEDOR_A, u.id, { token: "tok-2" }, D)).toMatchObject({ ok: false, code: "APARELHO_RESERVADO" })
    expect(await erroDe(vender(LOJA_A, saleFor(u, { reservaToken: "tok-2" })))).toBe("APARELHO_RESERVADO")
    const v = await vender(LOJA_A, saleFor(u, { reservaToken: "tok-1" }))
    expect(v).toBeTruthy()
    expect((await db.aparelhoFisico.findUniqueOrThrow({ where: { id: u.id } })).status).toBe("vendido")
  })
})

describe("Aquisição de cliente (08, 09, 10, 40)", () => {
  const compra = (over: Record<string, unknown> = {}) => ({
    tipo: "compra_cliente", vendedorNome: "Maria Vendedora", vendedorDocumento: "529.982.247-25",
    documentoOrigemTipo: "declaracao_procedencia", formaPagamento: "pix", pagamentoStatus: "pago", valorTotal: 1500,
    aparelhos: [device({ custoAquisicao: 0, despesas: 0, precoVenda: 2200 })], ...over,
  })
  it("10: sem documento de origem é recusada", async () => {
    expect(await svc.criarAquisicao(VENDEDOR_A, compra({ documentoOrigemTipo: "" }), D)).toMatchObject({ ok: false, code: "ORIGEM_SEM_DOCUMENTO" })
    expect(await svc.criarAquisicao(VENDEDOR_A, compra({ vendedorDocumento: "" }), D)).toMatchObject({ ok: false, code: "DOCUMENTO_VENDEDOR" })
  })
  it("08: registrar → aprovar (outro gerente) → conferir → liberar; estoque só no fim", async () => {
    const aq = ok(await svc.criarAquisicao(GERENTE_A, compra(), D))
    const id = aq.aparelhos[0]!.id
    let u = await db.aparelhoFisico.findUniqueOrThrow({ where: { id } })
    expect([u.status, u.propriedade, u.custoAquisicao]).toEqual(["em_avaliacao", "aguardando_aquisicao", 1500])
    expect((await db.aparelhoAquisicao.findUniqueOrThrow({ where: { id: aq.aquisicao.id } })).vendedorDocMascarado).toBe("***.982.247-**")
    // 40: antes da confirmação não entra no estoque comercial
    ok(await svc.registrarConferenciaRestricao(GERENTE_A, id, { resultado: "sem_restricao", fonte: "QA" }, D))
    expect(await svc.liberarParaVenda(GERENTE_A, id, D)).toMatchObject({ ok: false, code: "ORIGEM_PENDENTE" })
    // segregação: o próprio gerente não aprova
    expect(await svc.decidirAquisicao(GERENTE_A, aq.aquisicao.id, { decisao: "aprovar" }, D)).toMatchObject({ ok: false, code: "SEGREGACAO_FUNCOES" })
    expect(await svc.decidirAquisicao(VENDEDOR_A, aq.aquisicao.id, { decisao: "aprovar" }, D)).toMatchObject({ ok: false, code: "SEGREGACAO_FUNCOES" })
    ok(await svc.decidirAquisicao(ADMIN_A, aq.aquisicao.id, { decisao: "aprovar" }, D))
    ok(await svc.liberarParaVenda(GERENTE_A, id, D))
    u = await db.aparelhoFisico.findUniqueOrThrow({ where: { id } })
    expect([u.status, u.propriedade]).toEqual(["disponivel", "loja"])
    // DB CHECK: unidade de terceiro nunca vira estoque vendável
    await expect(db.aparelhoFisico.update({ where: { id }, data: { propriedade: "aguardando_aquisicao" } })).rejects.toThrow()
  })
  it("09: recusada não vira estoque e libera o IMEI", async () => {
    const i = imei()
    const aq = ok(await svc.criarAquisicao(VENDEDOR_A, compra({ aparelhos: [device({ imei1: i, custoAquisicao: 0, despesas: 0 })] }), D))
    expect(await svc.decidirAquisicao(GERENTE_A, aq.aquisicao.id, { decisao: "recusar" }, D)).toMatchObject({ ok: false })
    ok(await svc.decidirAquisicao(GERENTE_A, aq.aquisicao.id, { decisao: "recusar", motivo: "Procedência duvidosa" }, D))
    const u = await db.aparelhoFisico.findUniqueOrThrow({ where: { id: aq.aparelhos[0]!.id } })
    expect(u.status).toBe("baixado")
    expect(await db.movimentacaoEstoque.count({ where: { storeId: LOJA_A, documento: u.codigoInterno } })).toBe(0)
    ok(await svc.criarAquisicao(VENDEDOR_A, compra({ aparelhos: [device({ imei1: i, custoAquisicao: 0, despesas: 0 })] }), D))
  })
  it("40: aparelho de cliente em OS não aparece no estoque; 39: ficha mostra a OS anterior", async () => {
    const u = await cadastrarLiberado(ADMIN_A, { modelo: "Redmi Note 12", marca: "Xiaomi" })
    await db.ordemServico.create({ data: { storeId: LOJA_A, numero: `OS-APA-${sufixo}`, clienteId: clienteA, payload: { equipamento: { imei: u.imei1 } } } as never })
    const d = ok(await svc.detalheAparelho(ADMIN_A, u.id, D))
    expect(d.ordensServico.map((o) => o.numero)).toContain(`OS-APA-${sufixo}`)
    const os2 = imei()
    await db.ordemServico.create({ data: { storeId: LOJA_A, numero: `OS-APA2-${sufixo}`, clienteId: clienteA, payload: { equipamento: { imei: os2 } } } as never })
    expect(ok(await svc.listarAparelhos(ADMIN_A, { q: os2 }, D)).total).toBe(0)
  })
})

describe("Venda pelo motor canônico (17–24)", () => {
  it("17/18: venda vincula a unidade exata, baixa 1 do produto e emite garantia", async () => {
    const u = await cadastrarLiberado(ADMIN_A, { modelo: "iPhone 14 Pro" })
    const stock0 = (await db.produto.findUniqueOrThrow({ where: { id: u.produtoId } })).stock
    const sale = saleFor(u, { contratualDias: 180 })
    await vender(LOJA_A, sale)
    const av = await db.aparelhoVenda.findFirstOrThrow({ where: { aparelhoId: u.id } })
    expect(av).toMatchObject({ status: "ativa", legalDias: 90, contratualDias: 180, pedidoId: sale.id, clienteId: clienteA })
    expect(av.numeroGarantia).toMatch(/^GAR-\d{4}-\d{5}$/)
    expect((await db.produto.findUniqueOrThrow({ where: { id: u.produtoId } })).stock).toBe(stock0 - 1)
    expect((await db.aparelhoFisico.findUniqueOrThrow({ where: { id: u.id } })).status).toBe("vendido")
    expect(await db.movimentacaoFinanceira.count({ where: { storeId: LOJA_A, referenciaId: sale.id } })).toBe(1)
  })
  it("19: sem cliente é bloqueada sem efeito; 20: venda comum sem cliente segue", async () => {
    const u = await cadastrarLiberado(ADMIN_A, { modelo: "iPhone SE" })
    const sale = saleFor(u, { clienteId: null })
    expect(await erroDe(vender(LOJA_A, sale))).toBe("APARELHO_CLIENTE_OBRIGATORIO")
    expect(await db.venda.count({ where: { pedidoId: sale.id } })).toBe(0)
    const comum = await db.produto.create({ data: { storeId: LOJA_A, name: "Capinha QA", stock: 5, price: 30 } })
    const pid = `VDA-COMUM-${sufixo}`
    await vender(LOJA_A, { id: pid, at: new Date().toISOString(), total: 30, sessaoId: sessaoA, paymentBreakdown: { dinheiro: 30 }, lines: [{ inventoryId: comum.id, produtoId: comum.id, name: "Capinha", quantity: 1, unitPrice: 30, lineTotal: 30 }] } as SalePayload)
    expect(await db.venda.count({ where: { pedidoId: pid, clienteId: null } })).toBe(1)
  })
  it("modelo serializado nunca sai sem IMEI (PDV ao vivo)", async () => {
    const u = await cadastrarLiberado(ADMIN_A, { modelo: "Galaxy A54", marca: "Samsung" })
    const sale = saleFor(u)
    delete (sale.lines![0] as { deviceSale?: unknown }).deviceSale
    expect(await erroDe(vender(LOJA_A, sale))).toBe("APARELHO_IMEI_OBRIGATORIO")
  })
  it("21: duas vendas concorrentes do mesmo IMEI → exatamente uma", async () => {
    const u = await cadastrarLiberado(ADMIN_A, { modelo: "iPhone 15" })
    const res = await Promise.allSettled([vender(LOJA_A, saleFor(u)), vender(LOJA_A, saleFor(u))])
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    expect(await db.aparelhoVenda.count({ where: { aparelhoId: u.id } })).toBe(1)
    expect((await db.produto.findUniqueOrThrow({ where: { id: u.produtoId } })).stock).toBeGreaterThanOrEqual(0)
  })
  it("22/23: duplo clique e retry com o mesmo pedido não duplicam nada", async () => {
    const u = await cadastrarLiberado(ADMIN_A, { modelo: "iPhone 15 Plus" })
    const sale = saleFor(u)
    const res = await Promise.allSettled([vender(LOJA_A, sale), vender(LOJA_A, { ...sale })])
    expect(res.some((r) => r.status === "fulfilled")).toBe(true)
    await vender(LOJA_A, { ...sale }) // retry após "perda de resposta"
    expect(await db.venda.count({ where: { pedidoId: sale.id } })).toBe(1)
    expect(await db.aparelhoVenda.count({ where: { aparelhoId: u.id } })).toBe(1)
    expect(await db.movimentacaoEstoque.count({ where: { storeId: LOJA_A, documento: sale.id } })).toBe(1)
  })
  it("24/36: falha depois da baixa (pagamento inválido) reverte tudo — sem termo, sem venda", async () => {
    const u = await cadastrarLiberado(ADMIN_A, { modelo: "iPhone 13 Mini" })
    const stock0 = (await db.produto.findUniqueOrThrow({ where: { id: u.produtoId } })).stock
    const sale = { ...saleFor(u), paymentBreakdown: { creditoVale: u.precoVenda }, customerCpf: "12345678909" } as SalePayload
    expect(await erroDe(vender(LOJA_A, sale))).not.toBe("SEM_ERRO")
    expect(await db.aparelhoVenda.count({ where: { aparelhoId: u.id } })).toBe(0)
    expect((await db.aparelhoFisico.findUniqueOrThrow({ where: { id: u.id } })).status).toBe("disponivel")
    expect((await db.produto.findUniqueOrThrow({ where: { id: u.produtoId } })).stock).toBe(stock0)
  })
  it("41: loja B não vende nem enxerga unidade da loja A", async () => {
    const u = await cadastrarLiberado(ADMIN_A, { modelo: "Pixel 8", marca: "Google" })
    expect(await svc.detalheAparelho(ctx(LOJA_B, "ADMIN"), u.id, D)).toMatchObject({ ok: false, status: 404 })
    expect(ok(await svc.listarAparelhos(ctx(LOJA_B, "ADMIN"), { q: u.imei1! }, D)).total).toBe(0)
    const sale = saleFor(u, { clienteId: null })
    expect(await erroDe(db.$transaction((tx) => upsertVendaInTransaction(tx, LOJA_B, sale, "Op B", { enforceStock: true }), { timeout: 20_000 }))).not.toBe("SEM_ERRO")
  })
})

describe("Garantias e documentos (25–37)", () => {
  it("25–30: legal 90 + contratual 0/30/90/180/365/personalizada", async () => {
    for (const dias of [0, 30, 90, 180, 365, 45]) {
      const u = await cadastrarLiberado(ADMIN_A, { modelo: `iPhone G${dias}` })
      await vender(LOJA_A, saleFor(u, { contratualDias: dias }))
      const av = await db.aparelhoVenda.findFirstOrThrow({ where: { aparelhoId: u.id } })
      const entrega = av.dataEntrega.toISOString().slice(0, 10)
      expect(entrega).toBe(localDateKey(new Date()))
      expect(av.legalDias).toBe(90)
      expect(av.contratualDias).toBe(dias)
      expect(av.coberturaFim.toISOString().slice(0, 10)).toBe(addDaysKey(entrega, dias + 90))
    }
  })
  it("31: banco recusa garantia legal abaixo de 90 e contratual acima do limite", async () => {
    const av = await db.aparelhoVenda.findFirstOrThrow({ where: { storeId: LOJA_A } })
    await expect(db.aparelhoVenda.update({ where: { id: av.id }, data: { legalDias: 30 } })).rejects.toThrow()
    const u = await cadastrarLiberado(ADMIN_A, { modelo: "iPhone Limite" })
    expect(await erroDe(vender(LOJA_A, saleFor(u, { contratualDias: 5000 })))).toBe("CONTRATUAL_ACIMA_DO_LIMITE")
  })
  it("32: alterar a política depois não muda garantia emitida", async () => {
    const u = await cadastrarLiberado(ADMIN_A, { modelo: "iPhone Pol" })
    await vender(LOJA_A, saleFor(u, { contratualDias: 90 }))
    const antes = await db.aparelhoVenda.findFirstOrThrow({ where: { aparelhoId: u.id } })
    expect(await svc.salvarPolitica(GERENTE_A, { contratualMaxDias: 30, contratualPadraoDias: 0 }, D)).toMatchObject({ ok: false, code: "SEM_PERMISSAO" })
    ok(await svc.salvarPolitica(ADMIN_A, { contratualMaxDias: 365, contratualPadraoDias: 30, presetsContratuaisDias: [0, 30], condicoesTermo: "Nova regra QA." }, D))
    const depois = await db.aparelhoVenda.findFirstOrThrow({ where: { aparelhoId: u.id } })
    expect(depois.snapshotHash).toBe(antes.snapshotHash)
    expect(depois.contratualDias).toBe(90)
    expect(JSON.stringify(depois.snapshot)).not.toContain("Nova regra QA.")
  })
  it("33/34/37: A4 e 80mm reimprimem a mesma versão e só contam emissões", async () => {
    const av = await db.aparelhoVenda.findFirstOrThrow({ where: { storeId: LOJA_A }, orderBy: { createdAt: "desc" } })
    const vendas0 = await db.venda.count({ where: { storeId: LOJA_A } })
    const movs0 = await db.movimentacaoEstoque.count({ where: { storeId: LOJA_A } })
    const a = ok(await documentoDaVenda(CAIXA_A, av.id, "termo_garantia", "a4", D))
    const b = ok(await documentoDaVenda(CAIXA_A, av.id, "termo_garantia", "a4", D))
    const t = ok(await documentoDaVenda(CAIXA_A, av.id, "comprovante_venda", "80mm", D))
    expect(a.html).toBe(b.html)
    expect([a.emissoes, b.emissoes]).toEqual([1, 2])
    expect(t.html).not.toMatch(/size:\s*80mm\s+auto/)
    expect(await db.venda.count({ where: { storeId: LOJA_A } })).toBe(vendas0)
    expect(await db.movimentacaoEstoque.count({ where: { storeId: LOJA_A } })).toBe(movs0)
    expect(await documentoDaVenda(ctx(LOJA_B, "ADMIN"), av.id, "termo_garantia", "a4", D)).toMatchObject({ ok: false, status: 404 })
  })
  it("35: prévia antes da venda é RASCUNHO e não grava", async () => {
    const u = await cadastrarLiberado(ADMIN_A, { modelo: "iPhone Previa" })
    const docs0 = await db.aparelhoDocumento.count({ where: { storeId: LOJA_A } })
    const p = ok(await previaTermo(CAIXA_A, { aparelhoId: u.id, clienteId: clienteA, contratualDias: 30 }, D))
    expect(p.html).toContain("RASCUNHO")
    expect(await db.aparelhoDocumento.count({ where: { storeId: LOJA_A } })).toBe(docs0)
    expect(await db.aparelhoVenda.count({ where: { aparelhoId: u.id } })).toBe(0)
  })
  it("38: histórico do cliente lista as garantias", async () => {
    const g = ok(await svc.listarGarantias(ADMIN_A, { q: "João QA" }, D))
    expect(g.total).toBeGreaterThan(3)
    expect(g.itens.every((x) => x.cliente === "João QA")).toBe(true)
  })
  it("invariante: Produto.stock == unidades disponíveis+reservadas por modelo", async () => {
    const rows = await db.$queryRaw<Array<{ produtoId: string; stock: number; unidades: bigint }>>`
      SELECT p."id" AS "produtoId", p."stock", COUNT(a."id") FILTER (WHERE a."status" IN ('disponivel','reservado')) AS unidades
      FROM "estoque_produtos" p JOIN "aparelhos_fisicos" a ON a."produtoId" = p."id"
      WHERE p."storeId" = ${LOJA_A} GROUP BY p."id", p."stock"`
    for (const r of rows) expect(r.stock).toBe(Number(r.unidades))
  })
})
