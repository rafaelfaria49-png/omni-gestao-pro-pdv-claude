import "./g004-fixtures"
import { afterAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import { cadastrarCartaoGasto, cadastrarCicloGasto } from "@/lib/gastos/cartoes"
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
})
