// @vitest-environment node
//
// OMNI-COMMERCIAL-ENTERPRISE-EVOLUTION-001 — integração em PostgreSQL REAL e descartável.
// Serviços reais (aparelhos + custos comerciais + implantação) e motor canônico de venda real.
// Sem ambiente = BLOQUEIO_EXPLICITO_PG (nunca skip). Prepare com scripts/aparelhos/prepare-pg.mjs
// (aplica a migration de aparelhos e TODAS as posteriores da branch, inclusive a comercial).
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { Prisma, PrismaClient } from "@/generated/prisma"

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

import * as apa from "@/lib/aparelhos/service"
import { aparelhoPermissionsForRole } from "@/lib/aparelhos/permissions"
import { luhnCheckDigit } from "@/lib/aparelhos/imei"
import * as custos from "@/lib/comercial/custos/service"
import { registrarSaldoInicial } from "@/lib/comercial/implantacao"
import { validarComercialVenda } from "@/lib/comercial/venda/contrato"
import { upsertVendaInTransaction, type SalePayload } from "@/lib/ops-upsert-venda"
import { applyStockMutationTx, type StockLedgerTx } from "@/lib/estoque/stock-ledger-service"

type Db = Parameters<typeof apa.listarAparelhos>[2]
const D = db as unknown as Db
const sufixo = Date.now().toString(36)
const LOJA_A = `loja-com-a-${sufixo}`
const LOJA_B = `loja-com-b-${sufixo}`
let imeiSeq = 200000
const imei = () => { const body = `3567892${String(imeiSeq++).padStart(7, "0")}`; return body + String(luhnCheckDigit(body)) }
let opSeq = 0
const op = () => `op_${sufixo}_${++opSeq}_qa`

const ctx = (storeId: string, role: string, actorId = `${role}-1`): apa.AparelhoCtx => ({ storeId, actorId, actorLabel: `QA ${role}`, perms: aparelhoPermissionsForRole(role) })
const ADMIN_A = ctx(LOJA_A, "ADMIN", "dono-a")
const GERENTE_A = ctx(LOJA_A, "GERENTE", "gerente-a")
const VENDEDOR_A = ctx(LOJA_A, "VENDEDOR", "vendedor-a")
const TECNICO_A = ctx(LOJA_A, "TECNICO", "tecnico-a")
const ADMIN_B = ctx(LOJA_B, "ADMIN", "dono-b")

// Permissão financeira do papel enterprise (gerente/proprietário têm Financeiro; técnico/vendedor não).
const finDe = (c: apa.AparelhoCtx): custos.FinanceiroAcesso => (c.perms.definirCusto ? { view: true, edit: true } : { view: false, edit: false })
const lancar = (c: apa.AparelhoCtx, id: string, body: unknown, _db?: unknown, fin: custos.FinanceiroAcesso = finDe(c)) => custos.lancarCusto(c, id, body, fin, D)
const ratear = (c: apa.AparelhoCtx, body: unknown, _db?: unknown) => custos.lancarCustoRateado(c, body, finDe(c), D)

let clienteA = ""
let sessaoA = ""

function ok<T extends { ok: boolean }>(r: T | apa.Fail): T {
  if (!r.ok) throw new Error(`esperava ok, veio ${(r as apa.Fail).code}: ${(r as apa.Fail).message}`)
  return r as T
}

async function cadastrar(c: apa.AparelhoCtx, input: Partial<Record<string, unknown>> = {}) {
  const r = ok(await apa.cadastrarAparelho(c, {
    marca: "Apple", modelo: "iPhone 11", armazenamento: "64 GB", condicao: "usado", imei1: imei(),
    custoAquisicao: 30, despesas: 0, precoVenda: 0, checklist: { liga: "FAIL", tela: "FAIL" }, observacoes: "Tela quebrada, não liga.",
    ...input,
  }, D))
  return r.aparelho.id as string
}

async function produtoComSaldo(storeId: string, nome: string, qtd: number, custoReais: number) {
  const p = await db.produto.create({ data: { storeId, name: `${nome} ${sufixo}`, sku: `SKU-${nome}-${sufixo}-${opSeq++}`, stock: 0, price: custoReais * 2 } })
  if (qtd > 0) {
    await db.$transaction(async (tx) => {
      const r = await applyStockMutationTx(tx as unknown as StockLedgerTx, { storeId, principal: null, source: "estoque-actions", operatorLabel: "QA" },
        { kind: "entrada", produtoId: p.id, quantidade: qtd, custoUnitario: custoReais, origem: "manual", idempotencyKey: `qa-entrada:${p.id}` })
      if (!r.ok) throw new Error(r.code)
    })
  }
  return p.id
}

const contagens = async (storeId: string) => ({
  titulos: await db.contaPagarTitulo.count({ where: { storeId } }),
  movFin: await db.movimentacaoFinanceira.count({ where: { storeId } }),
})

async function sqlErro(p: Promise<unknown>): Promise<string> {
  try { await p; return "SEM_ERRO" } catch (e) { return String((e as Error).message) }
}

beforeAll(async () => {
  const caps = {
    version: 1,
    overrides: {
      "catalog.serializedDevices": true, "commercial.refurbishment": true, "commercial.historicalCost": true,
      "commercial.implantationMode": true, "sales.gifts": true, "sales.retroactive": { enabled: true, limiteDias: 30 },
    },
  }
  for (const id of [LOJA_A, LOJA_B]) {
    await db.store.create({ data: { id, name: `Loja QA ${id}`, cnpj: "00.000.000/0001-00", moduleAccess: Prisma.DbNull } })
    await db.storeSettings.create({ data: { storeId: id, printerConfig: { capabilities: caps } } })
  }
  clienteA = (await db.cliente.create({ data: { storeId: LOJA_A, name: "Cliente QA", document: "12345678909" } })).id
  sessaoA = (await db.sessaoCaixa.create({ data: { storeId: LOJA_A, operador: "Caixa QA" } })).id
}, 60_000)

afterAll(async () => { await db.$disconnect() })

describe("VC-04 — aquisição de danificado e preparação (cenários 5, 6, 15, 16, 18)", () => {
  it("celular quebrado comprado por R$ 30 + tela antiga R$ 100 + conector do estoque R$ 30 = R$ 160, sem nova saída", async () => {
    const id = await cadastrar(ADMIN_A)
    const antes = await contagens(LOJA_A)
    ok(await custos.moverPreparacao(TECNICO_A, id, { etapa: "em_preparacao" }, D))
    expect((await db.aparelhoFisico.findUniqueOrThrow({ where: { id } })).status).toBe("em_revisao")
    // Unidade em preparação não pode ser liberada (fora do estoque vendável), mesmo com conferência,
    // preço e observações completos — só a trava de preparação segura.
    await db.aparelhoFisico.update({ where: { id }, data: { precoVenda: 500 } })
    ok(await apa.registrarConferenciaRestricao(GERENTE_A, id, { resultado: "sem_restricao", fonte: "Consulta manual QA" }, D))
    expect(await apa.liberarParaVenda(GERENTE_A, id, D)).toMatchObject({ ok: false, code: "PREPARACAO_PENDENTE" })

    ok(await lancar(GERENTE_A, id, {
      operationId: op(), origem: "preexistente", categoria: "peca", descricao: "Tela original antiga", valorCentavos: 10000,
      justificativa: "Comprada em 2025 antes da implantação, já paga",
    }, D))
    const conector = await produtoComSaldo(LOJA_A, "Conector", 3, 30)
    const lc = ok(await lancar(TECNICO_A, id, { operationId: op(), origem: "estoque", categoria: "peca", produtoId: conector }, D))
    expect(lc.lancamento.valorCentavos).toBeNull() // técnico não vê custo
    expect((await db.produto.findUniqueOrThrow({ where: { id: conector } })).stock).toBe(2)
    const p = ok(await custos.obterProntuario(GERENTE_A, id, {}, D))
    expect(p.composicao).toMatchObject({ totalCentavos: 16000, completo: true })
    expect(await contagens(LOJA_A)).toEqual(antes) // nenhuma obrigação nem movimento financeiro novo

    // Reversão de peça aplicada: material volta ao estoque; custo sai da unidade.
    const conectorLanc = await db.comercialCustoLancamento.findFirstOrThrow({ where: { aparelhoId: id, origem: "estoque" } })
    ok(await custos.estornarCusto(GERENTE_A, conectorLanc.id, { motivo: "Peça com defeito" }, D))
    expect((await db.produto.findUniqueOrThrow({ where: { id: conector } })).stock).toBe(3)
    expect(ok(await custos.estornarCusto(GERENTE_A, conectorLanc.id, { motivo: "Peça com defeito" }, D)).replay).toBe(true)
    expect(ok(await custos.obterProntuario(GERENTE_A, id, {}, D)).composicao?.totalCentavos).toBe(13000)

    // Testes → concluída → avaliação → precificação e liberação pelo gerente.
    ok(await custos.moverPreparacao(TECNICO_A, id, { etapa: "em_testes" }, D))
    expect(await apa.liberarParaVenda(GERENTE_A, id, D)).toMatchObject({ ok: false, code: "PREPARACAO_PENDENTE" })
    ok(await custos.moverPreparacao(TECNICO_A, id, { etapa: "concluida" }, D))
    expect((await db.aparelhoFisico.findUniqueOrThrow({ where: { id } })).status).toBe("em_avaliacao")
    ok(await apa.liberarParaVenda(GERENTE_A, id, D))
    expect((await db.aparelhoFisico.findUniqueOrThrow({ where: { id } })).status).toBe("disponivel")
  })

  it("aparelho ainda de terceiro (aquisição pendente) não recebe custo de preparação", async () => {
    const aq = ok(await apa.criarAquisicao(VENDEDOR_A, {
      tipo: "compra_cliente", vendedorNome: "Fulano", vendedorDocumento: "529.982.247-25", documentoOrigemTipo: "declaracao_procedencia",
      formaPagamento: "pix", valorTotal: 300,
      aparelhos: [{ marca: "Apple", modelo: "iPhone 8", condicao: "usado", imei1: imei(), custoAquisicao: 0, despesas: 0, precoVenda: 0 }],
    }, D))
    const unitId = aq.aparelhos[0]!.id
    expect(await lancar(GERENTE_A, unitId, { operationId: op(), origem: "gerencial", descricao: "Avaliação", valorCentavos: 1000 }, D))
      .toMatchObject({ ok: false, code: "PROPRIEDADE_PENDENTE" })
    expect(await custos.moverPreparacao(TECNICO_A, unitId, { etapa: "em_preparacao" }, D)).toMatchObject({ ok: false, code: "PROPRIEDADE_PENDENTE" })
  })
})

describe("VC-01 — origens de custo sem dupla contagem (cenários 9–14, 17, 33)", () => {
  it("material preexistente que está no estoque com saldo é recusado (dupla apropriação)", async () => {
    const id = await cadastrar(ADMIN_A)
    const tela = await produtoComSaldo(LOJA_A, "TelaEstoque", 2, 80)
    expect(await lancar(GERENTE_A, id, {
      operationId: op(), origem: "preexistente", categoria: "peca", produtoId: tela, descricao: "Tela", valorCentavos: 8000, justificativa: "Tela antiga já paga",
    }, D)).toMatchObject({ ok: false, code: "PREEXISTENTE_EM_ESTOQUE" })
  })

  it("compra já registrada (5 telas por R$ 500) é rateada entre aparelhos sem segundo título; acima da capacidade é recusado", async () => {
    const titulo = await db.contaPagarTitulo.create({ data: { storeId: LOJA_A, localKey: `pagar:manual:${LOJA_A}:qa-telas`, descricao: "5 telas", valor: 500, vencimento: "2026-11-20", status: "pago" } })
    const ids = await Promise.all([1, 2, 3, 4, 5, 6].map(() => cadastrar(ADMIN_A)))
    const antes = await contagens(LOJA_A)
    const link = (id: string, extra: Record<string, unknown> = {}) => lancar(GERENTE_A, id, {
      operationId: op(), origem: "vinculo_financeiro", categoria: "peca", descricao: "Tela",
      origemFinanceira: { tipo: "conta_pagar", referenciaId: titulo.id, quantidadeTotal: 5 }, ...extra,
    }, D)
    for (const id of ids.slice(0, 4)) expect(ok(await link(id)).lancamento.valorCentavos).toBe(10000)
    // Concorrência entre terminais pela ÚLTIMA unidade da compra: só uma apropria.
    const [r5, r6] = await Promise.all([link(ids[4]), link(ids[5])])
    expect([r5.ok, r6.ok].filter(Boolean)).toHaveLength(1)
    expect([r5, r6].find((r) => !r.ok)).toMatchObject({ code: "APROPRIACAO_EXCEDE_ORIGEM" })
    const soma = await db.comercialCustoLancamento.aggregate({ where: { storeId: LOJA_A, origemFinanceira: { referenciaId: titulo.id }, status: "ativo" }, _sum: { valorCentavos: true } })
    expect(soma._sum.valorCentavos).toBe(50000)
    expect(await contagens(LOJA_A)).toEqual(antes)
  })

  it("título da compra do próprio aparelho não pode ser rateado como peça", async () => {
    const id = await cadastrar(ADMIN_A)
    const t = await db.contaPagarTitulo.create({ data: { storeId: LOJA_A, localKey: `pagar:manual:${LOJA_A}:qa-aq`, descricao: "Compra aparelho", valor: 900, status: "pendente", payload: { metadata: { aparelhoAquisicaoId: "x" } } } })
    expect(await lancar(GERENTE_A, id, {
      operationId: op(), origem: "vinculo_financeiro", categoria: "peca", origemFinanceira: { tipo: "conta_pagar", referenciaId: t.id, quantidadeTotal: 1 },
    }, D)).toMatchObject({ ok: false, code: "TITULO_E_AQUISICAO" })
  })

  it("nova compra à vista e a prazo: uma obrigação pendente cada, nenhuma saída de dinheiro; replay não duplica", async () => {
    const id = await cadastrar(ADMIN_A)
    const antes = await contagens(LOJA_A)
    const opVista = op()
    const vista = { operationId: opVista, origem: "nova_compra", categoria: "peca", descricao: "Bateria nova", valorCentavos: 9000 }
    const r1 = ok(await lancar(GERENTE_A, id, vista, D))
    const r2 = ok(await lancar(GERENTE_A, id, vista, D)) // duplo clique / reenvio
    expect(r2.replay).toBe(true)
    expect(r2.lancamento.id).toBe(r1.lancamento.id)
    expect(await lancar(GERENTE_A, id, { ...vista, valorCentavos: 9100 }, D)).toMatchObject({ ok: false, code: "OPERACAO_REUTILIZADA" })
    ok(await lancar(GERENTE_A, id, {
      operationId: op(), origem: "nova_compra", categoria: "servico_terceirizado", descricao: "Troca de placa (terceiro)", valorCentavos: 15000,
      novaCompra: { condicao: "a_prazo", vencimento: "2099-01-10", fornecedorNome: "Lab QA" },
    }, D))
    const depois = await contagens(LOJA_A)
    expect(depois.titulos - antes.titulos).toBe(2)
    expect(depois.movFin).toBe(antes.movFin)
    const titulo = await db.contaPagarTitulo.findUniqueOrThrow({ where: { id: r1.lancamento.contaPagarTituloId! } })
    expect(titulo).toMatchObject({ status: "pendente", valor: 90 })
    // Título criado aqui não pode ser rateado de novo como "compra já registrada".
    expect(await lancar(GERENTE_A, id, {
      operationId: op(), origem: "vinculo_financeiro", categoria: "peca", origemFinanceira: { tipo: "conta_pagar", referenciaId: titulo.id, quantidadeTotal: 1 },
    }, D)).toMatchObject({ ok: false, code: "TITULO_JA_APROPRIADO" })
  })

  it("mão de obra interna é gerencial: sem título; vendedor não lança custo com valor", async () => {
    const id = await cadastrar(ADMIN_A)
    const antes = await contagens(LOJA_A)
    ok(await lancar(GERENTE_A, id, { operationId: op(), origem: "gerencial", descricao: "Troca de tela (bancada)", valorCentavos: 4000, custoStatus: "estimado" }, D))
    expect(await contagens(LOJA_A)).toEqual(antes)
    expect(await lancar(VENDEDOR_A, id, { operationId: op(), origem: "gerencial", descricao: "x", valorCentavos: 1 }, D)).toMatchObject({ ok: false, status: 403 })
  })

  it("rateio de frete de R$ 50 entre 3 unidades: 16,67 + 16,67 + 16,66 e um único título", async () => {
    const ids = await Promise.all([1, 2, 3].map(() => cadastrar(ADMIN_A)))
    const antes = await contagens(LOJA_A)
    const r = ok(await ratear(GERENTE_A, {
      aparelhoIds: ids, operationId: op(), origem: "nova_compra", categoria: "frete", descricao: "Frete do lote", valorCentavos: 5000,
    }, D))
    expect(r.lancamentos.map((l) => l.valorCentavos).sort()).toEqual([1666, 1667, 1667])
    expect((await contagens(LOJA_A)).titulos - antes.titulos).toBe(1)
  })

  it("custo desconhecido não vira zero: margem não é calculada", async () => {
    const id = await cadastrar(ADMIN_A, { custoAquisicao: 0 })
    ok(await custos.atualizarPerfil(GERENTE_A, id, { custoAquisicaoStatus: "desconhecido", custoAquisicaoJustificativa: "Aparelho herdado sem nota de compra" }, { implantacaoAtiva: true }, D))
    const p = ok(await custos.obterProntuario(GERENTE_A, id, {}, D))
    expect(p.composicao).toMatchObject({ aquisicaoCentavos: null, totalCentavos: null, completo: false })
    expect(p.indicadores?.margemBrutaCentavos).toBeNull()
  })

  it("lançamento é imutável no banco: UPDATE de valor e DELETE são recusados pelo trigger", async () => {
    const l = await db.comercialCustoLancamento.findFirstOrThrow({ where: { storeId: LOJA_A, status: "ativo" } })
    expect(await sqlErro(db.$executeRaw`UPDATE "comercial_custos_lancamentos" SET "valorCentavos" = 1 WHERE "id" = ${l.id}`)).toMatch(/COMERCIAL_CUSTO_IMUTAVEL/)
    expect(await sqlErro(db.$executeRaw`DELETE FROM "comercial_custos_lancamentos" WHERE "id" = ${l.id}`)).toMatch(/COMERCIAL_CUSTO_IMUTAVEL/)
    expect(await sqlErro(db.$executeRaw`UPDATE "comercial_custos_lancamentos" SET "origem" = 'nova_compra' WHERE "id" = ${l.id}`)).not.toBe("SEM_ERRO")
    expect(await sqlErro(db.$executeRaw`UPDATE "comercial_custos_lancamentos" SET "justificativa" = 'reescrita' WHERE "id" = ${l.id}`)).toMatch(/COMERCIAL_CUSTO_IMUTAVEL/)
    expect(await sqlErro(db.$executeRaw`UPDATE "comercial_custos_lancamentos" SET "operador" = 'outro' WHERE "id" = ${l.id}`)).toMatch(/COMERCIAL_CUSTO_IMUTAVEL/)
  })
})

describe("Custo histórico congelado na venda (cenários 26, 32, 40)", () => {
  it("venda congela o custo; alterar custo depois não muda o histórico; estorno pós-venda é recusado", async () => {
    const id = await cadastrar(ADMIN_A, { custoAquisicao: 1000, precoVenda: 2500, checklist: { liga: "PASS" }, observacoes: "" })
    ok(await lancar(GERENTE_A, id, { operationId: op(), origem: "gerencial", descricao: "Higienização", valorCentavos: 5000 }, D))
    ok(await apa.registrarConferenciaRestricao(GERENTE_A, id, { resultado: "sem_restricao", fonte: "Consulta manual QA" }, D))
    ok(await apa.liberarParaVenda(GERENTE_A, id, D))
    const unit = await db.aparelhoFisico.findUniqueOrThrow({ where: { id } })
    const sale = {
      id: `VDA-COM-${sufixo}-1`, at: new Date().toISOString(), total: 2500, clienteId: clienteA, customerName: "Cliente QA", sessaoId: sessaoA,
      paymentBreakdown: { dinheiro: 1000, aPrazo: 1500 }, aPrazoConfig: { parcelas: 3, intervalDias: 30 },
      lines: [{ inventoryId: unit.produtoId, produtoId: unit.produtoId, name: "iPhone 11", quantity: 1, unitPrice: 2500, lineTotal: 2500,
        deviceSale: { version: 1, aparelhoId: id, contratualDias: 90 } }],
      // Cliente tentando injetar dados comerciais: descartados pelo motor.
      comercial: { retroativa: { modo: "pagamento_hoje", dataEfetivaVenda: "2000-01-01" } },
    } as unknown as SalePayload
    const r = await db.$transaction((tx) => upsertVendaInTransaction(tx, LOJA_A, sale, "Operador QA", { enforceStock: true, requireCaixaSession: true }), { timeout: 30_000 })
    const venda = await db.venda.findUniqueOrThrow({ where: { id: r.venda.id } })
    expect((venda.payload as Record<string, unknown>).comercial).toBeUndefined()
    const congelado = await db.comercialVendaCusto.findFirstOrThrow({ where: { vendaId: venda.id } })
    expect(congelado).toMatchObject({ precoVendaCentavos: 250000, custoAquisicaoCentavos: 100000, custoAplicadoCentavos: 5000, custoTotalCentavos: 105000, completo: true })
    // Venda a prazo E com garantia ao mesmo tempo (características não exclusivas).
    expect(await db.contaReceberTitulo.count({ where: { storeId: LOJA_A, localKey: { startsWith: `pdv-aprazo-${venda.pedidoId}` } } })).toBeGreaterThan(0)
    expect(await db.aparelhoVenda.count({ where: { vendaId: venda.id, status: "ativa" } })).toBe(1)
    // Custo atual muda; histórico não.
    await db.aparelhoFisico.update({ where: { id }, data: { custoAquisicao: 9999, custoTotal: 9999 } })
    expect((await db.comercialVendaCusto.findFirstOrThrow({ where: { vendaId: venda.id } })).custoTotalCentavos).toBe(105000)
    expect(await sqlErro(db.$executeRaw`UPDATE "comercial_vendas_custos" SET "custoTotalCentavos" = 1 WHERE "vendaId" = ${venda.id}`)).toMatch(/COMERCIAL_APPEND_ONLY/)
    const l = await db.comercialCustoLancamento.findFirstOrThrow({ where: { aparelhoId: id } })
    expect(await custos.estornarCusto(GERENTE_A, l.id, { motivo: "teste pós-venda" }, D)).toMatchObject({ ok: false, code: "CUSTO_JA_CONGELADO" })
    expect(await lancar(GERENTE_A, id, { operationId: op(), origem: "gerencial", descricao: "x", valorCentavos: 1 }, D)).toMatchObject({ ok: false, code: "UNIDADE_SEM_NOVO_CUSTO" })
  })
})

describe("Brindes e venda retroativa no motor real (cenários 19, 20, 22)", () => {
  it("brinde: linha de preço zero baixa o estoque pelo custo médio, sem receita; comercial validado é gravado", async () => {
    const pelicula = await produtoComSaldo(LOJA_A, "Pelicula", 5, 4)
    const capa = await produtoComSaldo(LOJA_A, "Capa", 5, 10)
    const raw = {
      id: `VDA-COM-${sufixo}-2`, at: new Date().toISOString(), total: 50, sessaoId: sessaoA, paymentBreakdown: { pix: 50 },
      lines: [
        { inventoryId: capa, produtoId: capa, name: "Capa", quantity: 1, unitPrice: 50, lineTotal: 50 },
        { inventoryId: pelicula, produtoId: pelicula, name: "Película", quantity: 1, unitPrice: 0, lineTotal: 0 },
      ],
      comercial: { brindes: [{ lineIndex: 1, motivo: "Cortesia na compra da capa" }] },
    }
    const v = validarComercialVenda(raw, { agora: new Date(), operador: "QA", recursos: { retroativa: true, brindes: true }, limiteDias: 30, podeRetroativa: true, sessao: null })
    if (!v.ok) throw new Error(v.code)
    const r = await db.$transaction((tx) => upsertVendaInTransaction(tx, LOJA_A, raw as unknown as SalePayload, "QA", { enforceStock: true, requireCaixaSession: true, comercial: v.comercial }), { timeout: 30_000 })
    const venda = await db.venda.findUniqueOrThrow({ where: { id: r.venda.id } })
    expect((venda.payload as { comercial?: { brindes?: unknown[] } }).comercial?.brindes).toHaveLength(1)
    expect(venda.total).toBe(50)
    const mov = await db.movimentacaoEstoque.findFirstOrThrow({ where: { storeId: LOJA_A, produtoId: pelicula, tipo: "saida", origem: "pdv" } })
    expect(mov.custoUnitario).toBe(4)
    expect((await db.produto.findUniqueOrThrow({ where: { id: pelicula } })).stock).toBe(4)
  })

  it("regularização: venda e pagamento de ontem lançados na sessão ORIGINAL fechada, sem tocar o caixa de hoje", async () => {
    const abertaEm = new Date(Date.now() - 2 * 86_400_000)
    const fechadaEm = new Date(abertaEm.getTime() + 10 * 3_600_000)
    const sessaoAntiga = await db.sessaoCaixa.create({ data: { storeId: LOJA_A, operador: "Caixa QA", status: "FECHADA", abertaEm, fechadaEm } })
    const at = new Date(abertaEm.getTime() + 3 * 3_600_000)
    const capa = await produtoComSaldo(LOJA_A, "CapaRetro", 3, 10)
    const { diaNaLojaV3 } = await import("@/lib/operacoes-v3/datas-operacionais-model")
    const raw = {
      id: `VDA-COM-${sufixo}-3`, at: at.toISOString(), total: 40, sessaoId: sessaoAntiga.id, paymentBreakdown: { dinheiro: 40 },
      lines: [{ inventoryId: capa, produtoId: capa, name: "Capa", quantity: 1, unitPrice: 40, lineTotal: 40 }],
      comercial: { retroativa: { modo: "regularizacao", dataEfetivaVenda: diaNaLojaV3(at.toISOString(), "America/Sao_Paulo"), justificativa: "Venda de anteontem esquecida no caderno" } },
    }
    const v = validarComercialVenda(raw, {
      agora: new Date(), operador: "Gerente QA", recursos: { retroativa: true, brindes: true }, limiteDias: 30, podeRetroativa: true,
      sessao: { id: sessaoAntiga.id, status: "FECHADA", abertaEm, fechadaEm },
    })
    if (!v.ok) throw new Error(`${v.code}: ${v.error}`)
    expect(v.allowClosedOriginalSession).toBe(true)
    const r = await db.$transaction((tx) => upsertVendaInTransaction(tx, LOJA_A, raw as unknown as SalePayload, "QA", {
      enforceStock: true, requireCaixaSession: true, allowClosedOriginalSession: v.allowClosedOriginalSession, comercial: v.comercial,
    }), { timeout: 30_000 })
    const venda = await db.venda.findUniqueOrThrow({ where: { id: r.venda.id } })
    expect(venda.at.toISOString()).toBe(at.toISOString())
    expect((venda.payload as { retroactiveSync?: boolean }).retroactiveSync).toBe(true)
    expect((venda.payload as { reason?: string }).reason).toBe("regularizacao_retroativa")
    const mov = await db.movimentacaoFinanceira.findFirstOrThrow({ where: { storeId: LOJA_A, referenciaId: venda.pedidoId } })
    expect(mov.createdAt.getTime()).toBe(at.getTime())
    // Sem o contrato validado, a mesma sessão fechada continua bloqueada.
    const outra = { ...raw, id: `VDA-COM-${sufixo}-4` }
    await expect(db.$transaction((tx) => upsertVendaInTransaction(tx, LOJA_A, outra as unknown as SalePayload, "QA", { enforceStock: true, requireCaixaSession: true })))
      .rejects.toThrow()
  })
})

describe("Implantação — saldo inicial sem financeiro (cenários 8, 9)", () => {
  it("produto zerado recebe saldo inicial uma única vez, sem movimento financeiro", async () => {
    const p = await produtoComSaldo(LOJA_A, "Cabo", 0, 0)
    const antes = await contagens(LOJA_A)
    const body = { produtoId: p, quantidade: 12, custoStatus: "estimado", custoUnitarioCentavos: 850, justificativa: "Contagem física na implantação" }
    const r1 = await registrarSaldoInicial({ storeId: LOJA_A, actorLabel: "QA" }, body, db)
    expect(r1).toMatchObject({ ok: true, replay: false })
    expect((await db.produto.findUniqueOrThrow({ where: { id: p } })).stock).toBe(12)
    expect(await registrarSaldoInicial({ storeId: LOJA_A, actorLabel: "QA" }, body, db)).toMatchObject({ ok: true, replay: true })
    expect(await registrarSaldoInicial({ storeId: LOJA_A, actorLabel: "QA" }, { ...body, quantidade: 13 }, db)).toMatchObject({ ok: false, code: "SALDO_INICIAL_JA_REGISTRADO" })
    expect((await db.produto.findUniqueOrThrow({ where: { id: p } })).stock).toBe(12)
    expect(await contagens(LOJA_A)).toEqual(antes)
    const comSaldo = await produtoComSaldo(LOJA_A, "Fone", 2, 20)
    expect(await registrarSaldoInicial({ storeId: LOJA_A, actorLabel: "QA" }, { ...body, produtoId: comSaldo }, db)).toMatchObject({ ok: false, code: "SALDO_EXISTENTE" })
  })
  it("mercadoria preexistente só é marcada com o modo de implantação ligado", async () => {
    const id = await cadastrar(ADMIN_A)
    expect(await custos.atualizarPerfil(GERENTE_A, id, { preexistente: true }, { implantacaoAtiva: false }, D)).toMatchObject({ ok: false, code: "IMPLANTACAO_DESLIGADA" })
    ok(await custos.atualizarPerfil(GERENTE_A, id, { preexistente: true, categoria: "televisor" }, { implantacaoAtiva: true }, D))
  })
})

describe("Correções da revisão independente (P1-1, P1-3, P2-1, P2-6, P2-7)", () => {
  it("P1-1: cadastro por técnico (custo forçado a 0) congela custo INCOMPLETO, nunca margem de 100%", async () => {
    const id = await cadastrar(TECNICO_A, { custoAquisicao: 900, precoVenda: 0, checklist: { liga: "PASS" }, observacoes: "" })
    expect((await db.aparelhoFisico.findUniqueOrThrow({ where: { id } })).custoAquisicao).toBe(0)
    await db.aparelhoFisico.update({ where: { id }, data: { precoVenda: 1200 } })
    ok(await apa.registrarConferenciaRestricao(GERENTE_A, id, { resultado: "sem_restricao", fonte: "Consulta manual QA" }, D))
    ok(await apa.liberarParaVenda(GERENTE_A, id, D))
    const unit = await db.aparelhoFisico.findUniqueOrThrow({ where: { id } })
    const sale = {
      id: `VDA-COM-${sufixo}-p11`, at: new Date().toISOString(), total: 1200, clienteId: clienteA, customerName: "Cliente QA", sessaoId: sessaoA,
      paymentBreakdown: { pix: 1200 },
      lines: [{ inventoryId: unit.produtoId, produtoId: unit.produtoId, name: "iPhone 11", quantity: 1, unitPrice: 1200, lineTotal: 1200, deviceSale: { version: 1, aparelhoId: id, contratualDias: 0 } }],
    } as unknown as SalePayload
    const r = await db.$transaction((tx) => upsertVendaInTransaction(tx, LOJA_A, sale, "QA", { enforceStock: true, requireCaixaSession: true }), { timeout: 30_000 })
    expect(await db.comercialVendaCusto.findFirstOrThrow({ where: { vendaId: r.venda.id } })).toMatchObject({ custoAquisicaoCentavos: null, custoTotalCentavos: null, completo: false })
  })

  it("P1-3: o mesmo operationId em OUTRA unidade cria outra obrigação (nunca reaproveita o título da primeira)", async () => {
    const [a, b] = await Promise.all([cadastrar(ADMIN_A), cadastrar(ADMIN_A)])
    const body = { operationId: op(), origem: "nova_compra", categoria: "peca", descricao: "Tela", valorCentavos: 10000 }
    const ra = ok(await lancar(GERENTE_A, a, body))
    const rb = ok(await lancar(GERENTE_A, b, body))
    expect(rb.lancamento.contaPagarTituloId).not.toBe(ra.lancamento.contaPagarTituloId)
    expect(await db.contaPagarTitulo.count({ where: { id: { in: [ra.lancamento.contaPagarTituloId!, rb.lancamento.contaPagarTituloId!] } } })).toBe(2)
  })

  it("P2-1: título cancelado ou com valor alterado depois do primeiro rateio não continua sendo apropriado", async () => {
    const t = await db.contaPagarTitulo.create({ data: { storeId: LOJA_A, localKey: `pagar:manual:${LOJA_A}:qa-p21`, descricao: "3 baterias", valor: 300, status: "pendente" } })
    const [u1, u2, u3] = await Promise.all([cadastrar(ADMIN_A), cadastrar(ADMIN_A), cadastrar(ADMIN_A)])
    const link = (id: string) => lancar(GERENTE_A, id, { operationId: op(), origem: "vinculo_financeiro", categoria: "peca", descricao: "Bateria", origemFinanceira: { tipo: "conta_pagar", referenciaId: t.id, quantidadeTotal: 3 } })
    ok(await link(u1))
    await db.contaPagarTitulo.update({ where: { id: t.id }, data: { valor: 450 } })
    expect(await link(u2)).toMatchObject({ ok: false, code: "TITULO_ALTERADO" })
    await db.contaPagarTitulo.update({ where: { id: t.id }, data: { valor: 300, status: "cancelado" } })
    expect(await link(u3)).toMatchObject({ ok: false, code: "TITULO_CANCELADO" })
  })

  it("P2-7: sem permissão no Financeiro não cria obrigação nem rateia título", async () => {
    const id = await cadastrar(ADMIN_A)
    const semFin = { view: false, edit: false }
    expect(await lancar(GERENTE_A, id, { operationId: op(), origem: "nova_compra", categoria: "peca", descricao: "Tela", valorCentavos: 100 }, D, semFin))
      .toMatchObject({ ok: false, status: 403, code: "SEM_PERMISSAO_FINANCEIRO" })
    expect(await lancar(GERENTE_A, id, { operationId: op(), origem: "vinculo_financeiro", categoria: "peca", origemFinanceira: { tipo: "conta_pagar", referenciaId: "x", quantidadeTotal: 1 } }, D, { view: false, edit: true }))
      .toMatchObject({ ok: false, code: "SEM_PERMISSAO_FINANCEIRO" })
  })

  it("P2-6: saldo inicial com custo desconhecido é recusado quando o cadastro já tem custo", async () => {
    const p = await db.produto.create({ data: { storeId: LOJA_A, name: `Carregador ${sufixo}`, sku: `SKU-car-${sufixo}`, stock: 0, price: 50, precoCusto: 18 } })
    expect(await registrarSaldoInicial({ storeId: LOJA_A, actorLabel: "QA" }, { produtoId: p.id, quantidade: 3, custoStatus: "desconhecido", justificativa: "Achados na implantação" }, db))
      .toMatchObject({ ok: false, code: "CUSTO_CADASTRO_EXISTENTE" })
  })
})

describe("Isolamento entre lojas e permissões (cenários 37, 38)", () => {
  it("loja B não lê, não lança e não rateia custo da loja A", async () => {
    const id = await cadastrar(ADMIN_A)
    expect(await custos.obterProntuario(ADMIN_B, id, {}, D)).toMatchObject({ ok: false, code: "NAO_ENCONTRADO" })
    expect(await lancar(ADMIN_B, id, { operationId: op(), origem: "gerencial", descricao: "x", valorCentavos: 1 }, D)).toMatchObject({ ok: false, code: "NAO_ENCONTRADO" })
    const tituloA = await db.contaPagarTitulo.create({ data: { storeId: LOJA_A, localKey: `pagar:manual:${LOJA_A}:qa-iso`, descricao: "Compra A", valor: 100, status: "pendente" } })
    const idB = await cadastrar(ADMIN_B)
    expect(await lancar(ADMIN_B, idB, {
      operationId: op(), origem: "vinculo_financeiro", categoria: "peca", origemFinanceira: { tipo: "conta_pagar", referenciaId: tituloA.id, quantidadeTotal: 1 },
    }, D)).toMatchObject({ ok: false, code: "TITULO_NAO_ENCONTRADO" })
    expect(await registrarSaldoInicial({ storeId: LOJA_B, actorLabel: "QA" }, { produtoId: await produtoComSaldo(LOJA_A, "Iso", 0, 0), quantidade: 1, custoStatus: "desconhecido", justificativa: "teste de isolamento" }, db))
      .toMatchObject({ ok: false, code: "PRODUTO_NAO_ENCONTRADO" })
  })
  it("Gestor Money não publicado: vínculo fica fail-closed", async () => {
    const id = await cadastrar(ADMIN_A)
    expect(await lancar(GERENTE_A, id, {
      operationId: op(), origem: "vinculo_financeiro", categoria: "peca", origemFinanceira: { tipo: "gestor_money_gasto", referenciaId: "g1", quantidadeTotal: 1 },
    }, D)).toMatchObject({ ok: false, code: "GESTOR_MONEY_NAO_DISPONIVEL" })
  })
})
