import "./g004-fixtures"
import { afterAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import {
  cadastrarCartaoGasto,
  cadastrarCicloGasto,
  consultarCartoesGasto,
  consultarHistoricoLimiteCartaoGasto,
  editarCartaoGasto,
} from "@/lib/gastos/cartoes"
import { consultarFinanceiro, filtroConsultaFinanceira } from "@/lib/gastos/query"
import { aplicarG004, dataGasto, dataPagamento, estadoG004, fixtureG004, pagoG004 } from "./g004-fixtures"

afterAll(async () => { await prisma.$disconnect() })
async function ciclos() {
  const f = await fixtureG004(), ctx = await f.contexto()
  const cartao = await cadastrarCartaoGasto(ctx, { nome: "Cartão sintético", ultimos4: "1234", bandeira: "fixture" })
  const a = await cadastrarCicloGasto(ctx, { cartaoId: cartao.id, identificador: "2026-11", competencia: "2026-11", vencimento: "2026-11-10" })
  const b = await cadastrarCicloGasto(ctx, { cartaoId: cartao.id, identificador: "2026-12", competencia: "2026-12", vencimento: "2026-12-10" })
  return { f, ctx, cartao, a, b }
}
describe("G004 cartão/crédito/fatura PostgreSQL", () => {
  it("compra no crédito cria obrigações e nenhum caixa; fatura aloca sem criar segunda despesa/título", async () => {
    const { f, a } = await ciclos()
    const compra = { tipo: "COMPRA_CREDITO", descricao: "Compra no cartão", valorCentavos: "8000", dataGasto, cicloId: a.id }
    const x = await aplicarG004(f, compra), y = await aplicarG004(f, { ...compra, valorCentavos: "12000" })
    expect(await prisma.movimentacaoFinanceira.count({ where: { perfilId: f.E1 } })).toBe(0)
    expect((await prisma.carteiraFinanceira.findUniqueOrThrow({ where: { id: f.conta() } })).saldoAtualCentavos?.toString()).toBe("100000")
    const pagamento = await aplicarG004(f, { tipo: "PAGAR_FATURA", cicloId: a.id, carteiraId: f.conta(), formaPagamento: "pix", dataPagamento,
      alocacoes: [{ tituloId: x.resultado.tituloIds[0], valorCentavos: "8000" }, { tituloId: y.resultado.tituloIds[0], valorCentavos: "12000" }] })
    expect(pagamento.resultado.gastoId).toBeNull()
    expect(await prisma.gasto.count({ where: { perfilId: f.E1 } })).toBe(2)
    expect(await prisma.contaPagarTitulo.count({ where: { perfilId: f.E1 } })).toBe(2)
    expect(await prisma.pagamentoFinanceiro.count({ where: { perfilId: f.E1 } })).toBe(1)
    expect(await prisma.alocacaoPagamento.count({ where: { pagamentoId: pagamento.resultado.pagamentoId! } })).toBe(2)
    expect(await prisma.movimentacaoFinanceira.count({ where: { perfilId: f.E1, valorCentavos: "20000" } })).toBe(1)
    expect((await prisma.carteiraFinanceira.findUniqueOrThrow({ where: { id: f.conta() } })).saldoAtualCentavos?.toString()).toBe("80000")
  })
  it("parcelas completas conservam valores, ciclos e vencimentos sem juros inventados", async () => {
    const { f, a, b } = await ciclos()
    const r = await aplicarG004(f, { tipo: "COMPRA_CREDITO", descricao: "Parcelada", valorCentavos: "10001", dataGasto,
      parcelas: [{ cicloId: b.id, numero: 2, total: 2, valorCentavos: "5000" }, { cicloId: a.id, numero: 1, total: 2, valorCentavos: "5001" }] })
    const ts = await prisma.contaPagarTitulo.findMany({ where: { gastoId: r.resultado.gastoId! }, orderBy: { vencimento: "asc" } })
    expect(ts.map(t => [t.valorCentavos?.toString(), t.cartaoCicloId, t.vencimento])).toEqual([["5001", a.id, "2026-11-10"], ["5000", b.id, "2026-12-10"]])
    expect(await prisma.movimentacaoFinanceira.count({ where: { perfilId: f.E1 } })).toBe(0)
  })
  it("não paga título de outro ciclo/perfil nem usa limite de crédito como dinheiro", async () => {
    const { f, a, b } = await ciclos()
    const x = await aplicarG004(f, { tipo: "COMPRA_CREDITO", descricao: "Compra", valorCentavos: "1000", dataGasto, cicloId: a.id })
    const before = await estadoG004(f)
    await expect(aplicarG004(f, { tipo: "PAGAR_FATURA", cicloId: b.id, carteiraId: f.conta(), formaPagamento: "pix", dataPagamento,
      alocacoes: [{ tituloId: x.resultado.tituloIds[0], valorCentavos: "1000" }] })).rejects.toMatchObject({ code: "alocacao_fatura_invalida" })
    // Preparar deixa apenas a revisão; nenhuma mudança financeira.
    expect(await prisma.pagamentoFinanceiro.count({ where: { perfilId: f.E1 } })).toBe(0)
    expect(before).toContain(x.resultado.operacaoId)
    await prisma.carteiraFinanceira.update({ where: { id: f.conta() }, data: { tipo: "credito" } })
    await expect(aplicarG004(f, pagoG004(f))).rejects.toMatchObject({ code: "conta_indisponivel" })
    await expect(aplicarG004(f, { tipo: "COMPRA_CREDITO", descricao: "Outro perfil", valorCentavos: "1000", dataGasto, cicloId: a.id }, "estrangeiro", f.E2)).rejects.toMatchObject({ code: "ciclo_indisponivel" })
  })
  it("estorno parcial de fatura exige alocação explícita; compensa só a obrigação escolhida", async () => {
    const { f, a } = await ciclos()
    const compra = { tipo: "COMPRA_CREDITO", descricao: "Compra", valorCentavos: "4000", dataGasto, cicloId: a.id }
    const x = await aplicarG004(f, compra), y = await aplicarG004(f, compra)
    const p = await aplicarG004(f, { tipo: "PAGAR_FATURA", cicloId: a.id, carteiraId: f.conta(), formaPagamento: "pix", dataPagamento,
      alocacoes: [x, y].map(c => ({ tituloId: c.resultado.tituloIds[0], valorCentavos: "4000" })) })
    const estorno = { tipo: "ESTORNAR_PAGAMENTO", pagamentoId: p.resultado.pagamentoId, valorCentavos: "1000", dataPagamento, motivo: "Devolução" }
    await expect(aplicarG004(f, estorno)).rejects.toMatchObject({ code: "estorno_exige_alocacoes" })
    const alocacao = await prisma.alocacaoPagamento.findFirstOrThrow({ where: { pagamentoId: p.resultado.pagamentoId!, pagarTituloId: x.resultado.tituloIds[0] } })
    await aplicarG004(f, { ...estorno, alocacoes: [{ alocacaoId: alocacao.id, valorCentavos: "1000" }] })
    expect((await prisma.contaPagarTitulo.findUniqueOrThrow({ where: { id: x.resultado.tituloIds[0] } })).status).toBe("parcial")
    expect((await prisma.contaPagarTitulo.findUniqueOrThrow({ where: { id: y.resultado.tituloIds[0] } })).status).toBe("pago")
  })
  it("recusa PAN/CVV e não grava dados secretos", async () => {
    const { ctx } = await ciclos()
    await expect(cadastrarCartaoGasto(ctx, { nome: "Não armazenar", pan: "4111111111111111", cvv: "123" })).rejects.toMatchObject({ code: "cartao_invalido" })
    await expect(cadastrarCartaoGasto(ctx, { nome: "Não armazenar", ultimos4: "4111111111111111" })).rejects.toMatchObject({ code: "cartao_invalido" })
  })

  it("limites: null quando não informado, cadastro/edição auditados, histórico imutável no PostgreSQL", async () => {
    const { f, ctx, cartao } = await ciclos()
    expect(cartao.limiteCentavos).toBeNull()
    const [inicial] = await consultarCartoesGasto(ctx, { cartaoId: cartao.id })
    expect(inicial).toMatchObject({
      limiteCentavos: null,
      limiteUtilizadoCentavos: "0",
      limiteDisponivelCentavos: null,
      limiteExcedidoCentavos: null,
    })
    expect(inicial.historicoLimites).toHaveLength(0)

    const ed1 = await editarCartaoGasto(ctx, { cartaoId: cartao.id, limiteCentavos: "500000", motivo: "Limite inicial aprovado" })
    expect(ed1.resumoLimite).toMatchObject({ limiteCentavos: "500000", limiteUtilizadoCentavos: "0", limiteDisponivelCentavos: "500000", limiteExcedidoCentavos: "0" })
    expect(ed1.eventoLimite).toMatchObject({ acao: "CADASTRO", limiteAnteriorCentavos: null, limiteNovoCentavos: "500000", motivo: "Limite inicial aprovado", autorAdminUserId: f.U1 })

    // Edição idempotente com mesmo valor não gera evento duplicado
    const edSemMudanca = await editarCartaoGasto(ctx, { cartaoId: cartao.id, limiteCentavos: "500000" })
    expect(edSemMudanca.eventoLimite).toBeNull()

    const ed2 = await editarCartaoGasto(ctx, { cartaoId: cartao.id, limiteCentavos: "750000", motivo: "Aumento de limite" })
    expect(ed2.eventoLimite).toMatchObject({ acao: "ALTERACAO", limiteAnteriorCentavos: "500000", limiteNovoCentavos: "750000" })

    const ed3 = await editarCartaoGasto(ctx, { cartaoId: cartao.id, limiteCentavos: null, motivo: "Remover teto informado" })
    expect(ed3.eventoLimite).toMatchObject({ acao: "REMOCAO", limiteAnteriorCentavos: "750000", limiteNovoCentavos: null })

    const historico = await consultarHistoricoLimiteCartaoGasto(ctx, cartao.id)
    expect(historico.map(h => [h.acao, h.limiteAnteriorCentavos, h.limiteNovoCentavos])).toEqual([
      ["CADASTRO", null, "500000"],
      ["ALTERACAO", "500000", "750000"],
      ["REMOCAO", "750000", null],
    ])

    // Imutabilidade no PostgreSQL: UPDATE e DELETE no histórico são recusados por trigger
    await expect(prisma.cartaoLimiteEvento.update({ where: { id: historico[0].id }, data: { motivo: "adulterado" } })).rejects.toThrow()
    await expect(prisma.cartaoLimiteEvento.delete({ where: { id: historico[0].id } })).rejects.toThrow()
  })

  it("parcelas comprometem limite integral, bloqueiam excesso, recompõem no pagamento e não alteram saldo de contas", async () => {
    const f = await fixtureG004(), ctx = await f.contexto()
    const card = await cadastrarCartaoGasto(ctx, { nome: "Corporativo Limite", ultimos4: "4321", bandeira: "Visa", limiteCentavos: "30000", motivo: "Emissão" })
    const c1 = await cadastrarCicloGasto(ctx, { cartaoId: card.id, identificador: "2026-10", competencia: "2026-10", vencimento: "2026-10-28" })
    const c2 = await cadastrarCicloGasto(ctx, { cartaoId: card.id, identificador: "2026-11", competencia: "2026-11", vencimento: "2026-11-28" })
    const c3 = await cadastrarCicloGasto(ctx, { cartaoId: card.id, identificador: "2026-12", competencia: "2026-12", vencimento: "2026-12-28" })

    // Compra 3x de R$ 240,00 (3 parcelas de R$ 80,00) compromete 24000 de imediato
    const compra = await aplicarG004(f, {
      tipo: "COMPRA_CREDITO", descricao: "Equipamento 3x", valorCentavos: "24000", dataGasto,
      parcelas: [
        { cicloId: c1.id, numero: 1, total: 3, valorCentavos: "8000" },
        { cicloId: c2.id, numero: 2, total: 3, valorCentavos: "8000" },
        { cicloId: c3.id, numero: 3, total: 3, valorCentavos: "8000" },
      ],
    })
    const [aposCompra] = await consultarCartoesGasto(ctx, { cartaoId: card.id })
    expect(aposCompra).toMatchObject({ limiteCentavos: "30000", limiteUtilizadoCentavos: "24000", limiteDisponivelCentavos: "6000", limiteExcedidoCentavos: "0" })

    // Nova compra de R$ 60,01 excede o disponível (6000) -> bloqueada com 409 limite_cartao_insuficiente
    await expect(aplicarG004(f, {
      tipo: "COMPRA_CREDITO", descricao: "Excesso", valorCentavos: "6001", dataGasto, cicloId: c1.id,
    })).rejects.toMatchObject({ code: "limite_cartao_insuficiente", status: 409 })

    // Pagar 1ª parcela (8000) recompõe limite disponível de 6000 para 14000
    const titulos = await prisma.contaPagarTitulo.findMany({ where: { gastoId: compra.resultado.gastoId! }, orderBy: { vencimento: "asc" } })
    const pagFatura = await aplicarG004(f, {
      tipo: "PAGAR_FATURA", cicloId: c1.id, carteiraId: f.conta(), formaPagamento: "pix", dataPagamento,
      alocacoes: [{ tituloId: titulos[0].id, valorCentavos: "8000" }],
    })
    const [aposPagamento] = await consultarCartoesGasto(ctx, { cartaoId: card.id })
    expect(aposPagamento).toMatchObject({ limiteCentavos: "30000", limiteUtilizadoCentavos: "16000", limiteDisponivelCentavos: "14000", limiteExcedidoCentavos: "0" })

    // Estorno parcial de 3000 volta a comprometer o limite (utilizado 19000, disponível 11000)
    await aplicarG004(f, {
      tipo: "ESTORNAR_PAGAMENTO", pagamentoId: pagFatura.resultado.pagamentoId, valorCentavos: "3000", dataPagamento, motivo: "Estorno fatura",
    })
    const [aposEstorno] = await consultarCartoesGasto(ctx, { cartaoId: card.id })
    expect(aposEstorno).toMatchObject({ limiteCentavos: "30000", limiteUtilizadoCentavos: "19000", limiteDisponivelCentavos: "11000", limiteExcedidoCentavos: "0" })

    // G005 projeta cartões + faturas por ciclo sem jamais misturar limite de crédito com saldo de contas
    const g005 = await consultarFinanceiro(ctx, filtroConsultaFinanceira({ dataInicio: "2026-10-01", dataFim: "2026-10-31" }))
    expect(g005.saldoCentavos).toBe("95000") // 100000 - 8000 + 3000 (nunca soma 30000 ou 11000 do cartão)
    const cardG005 = g005.cartoes.find(c => c.id === card.id)
    expect(cardG005).toMatchObject({ limiteCentavos: "30000", limiteUtilizadoCentavos: "19000", limiteDisponivelCentavos: "11000" })
    expect(cardG005?.ciclos.map(c => [c.identificador, c.totalCentavos, c.pagoCentavos, c.restanteCentavos])).toEqual([
      ["2026-10", "8000", "5000", "3000"],
      ["2026-11", "8000", "0", "8000"],
      ["2026-12", "8000", "0", "8000"],
    ])
  })

  it("concorrência real no limite e isolamento estrito PESSOAL vs EMPRESA + ciclos de cartões distintos", async () => {
    const f = await fixtureG004()
    const ctxP1 = await f.contexto(f.P1), ctxE1 = await f.contexto(f.E1)
    const cardP1 = await cadastrarCartaoGasto(ctxP1, { nome: "Pessoal Black", limiteCentavos: "10000" })
    const cicloP1 = await cadastrarCicloGasto(ctxP1, { cartaoId: cardP1.id, identificador: "2026-10", competencia: "2026-10", vencimento: "2026-10-25" })
    const cardP1Outro = await cadastrarCartaoGasto(ctxP1, { nome: "Pessoal Outro", limiteCentavos: "10000" })
    const cicloP1Outro = await cadastrarCicloGasto(ctxP1, { cartaoId: cardP1Outro.id, identificador: "2026-10", competencia: "2026-10", vencimento: "2026-10-25" })

    // Parcelas de cartões distintos na mesma compra são recusadas
    await expect(aplicarG004(f, {
      tipo: "COMPRA_CREDITO", descricao: "Misturado", valorCentavos: "2000", dataGasto,
      parcelas: [
        { cicloId: cicloP1.id, numero: 1, total: 2, valorCentavos: "1000" },
        { cicloId: cicloP1Outro.id, numero: 2, total: 2, valorCentavos: "1000" },
      ],
    }, "misturado", f.P1)).rejects.toMatchObject({ code: "ciclo_cartao_divergente", status: 422 })

    // Duas compras simultâneas de 7000 em limite de 10000: exatamente 1 passa e 1 falha
    const res = await Promise.allSettled([
      aplicarG004(f, { tipo: "COMPRA_CREDITO", descricao: "Concorrente A", valorCentavos: "7000", dataGasto, cicloId: cicloP1.id }, "conc-a", f.P1),
      aplicarG004(f, { tipo: "COMPRA_CREDITO", descricao: "Concorrente B", valorCentavos: "7000", dataGasto, cicloId: cicloP1.id }, "conc-b", f.P1),
    ])
    expect(res.filter(r => r.status === "fulfilled")).toHaveLength(1)
    expect(res.filter(r => r.status === "rejected")).toHaveLength(1)

    // Isolamento: contexto EMPRESA não enxerga nem edita cartão PESSOAL; U2 não acessa P1
    expect(await consultarCartoesGasto(ctxE1)).toEqual([])
    await expect(editarCartaoGasto(ctxE1, { cartaoId: cardP1.id, limiteCentavos: "999999" })).rejects.toMatchObject({ code: "cartao_indisponivel", status: 404 })
    f.login(f.U2, [f.L1])
    await expect(consultarCartoesGasto(ctxP1)).rejects.toMatchObject({ status: 403 })
  })
})
