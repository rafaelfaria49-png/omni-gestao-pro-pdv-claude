/**
 * OMNI-GESTOR-MONEY-ACTIVATION-PRECONDITIONS-001 — contratos de produto (exemplos 01–07) sobre o motor G002–G005 real.
 *
 * NÃO é WhatsApp nem interpretação de linguagem: cada exemplo é a PROPOSTA ESTRUTURADA que G008 deverá produzir
 * a partir da frase, passando pelo mesmo caminho revisão → confirmação → aplicação atômica do G004 e pela consulta
 * canônica do G005. PostgreSQL descartável G005 (papel não dono de cluster, NOBYPASSRLS); só a sessão é fixture.
 */
import "./g005-fixtures"
import { afterAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import { aplicarOperacaoGasto } from "@/lib/gastos/apply"
import { corrigirRevisaoGasto, prepararRevisaoGasto } from "@/lib/gastos/operacoes"
import { saldoTituloGasto } from "@/lib/gastos/pagamentos"
import { criarCategoriaGasto } from "@/lib/gastos/categorias"
import { cadastrarCartaoGasto, cadastrarCicloGasto } from "@/lib/gastos/cartoes"
import { consultarFinanceiro, filtroConsultaFinanceira } from "@/lib/gastos/query"
import { transferirEntreCarteiras } from "@/lib/financeiro/services/carteiras-service"
import { aplicarG005, dataGasto, dataPagamento, estadoG005, fixtureG005 } from "./g005-fixtures"

afterAll(async () => { await prisma.$disconnect() })
const outubro = { dataInicio: "2026-10-01", dataFim: "2026-10-31" }
const saldo = async (id: string) => (await prisma.carteiraFinanceira.findUniqueOrThrow({ where: { id } })).saldoAtualCentavos?.toString()

describe("Gestor Money — contratos de produto 01–07 (motor canônico, sem canal)", () => {
  it.each(["PESSOAL", "EMPRESA"] as const)("01 %s: 'Gastei R$ 250 no mercado, paguei no Pix' = 25000 centavos, supermercado, Pix, sem duplicar", async (tipo) => {
    const f = await fixtureG005(), perfilId = tipo === "PESSOAL" ? f.P1 : f.E1, ctx = await f.contexto(perfilId)
    const categoria = await criarCategoriaGasto(ctx, { nome: "Supermercado", natureza: "DESPESA" })
    const proposta = { tipo: "GASTO_PAGO", descricao: "Mercado", dataGasto, valorCentavos: "25000", categoriaId: categoria.id,
      carteiraId: f.conta(perfilId), formaPagamento: "pix", dataPagamento }
    const a = await aplicarG005(f, proposta, "ex01", perfilId)
    expect(await aplicarOperacaoGasto(a.ctx, a.command)).toEqual(a.resultado) // repetição da confirmação = mesma operação
    const gasto = await prisma.gasto.findFirstOrThrow({ where: { perfilId } })
    expect(gasto).toMatchObject({ categoriaId: categoria.id, storeId: tipo === "PESSOAL" ? null : f.L1 })
    expect(await prisma.gasto.count({ where: { perfilId } })).toBe(1)
    const mov = await prisma.movimentacaoFinanceira.findMany({ where: { perfilId } })
    expect(mov.map((m) => [m.tipo, m.valorCentavos?.toString(), m.formaPagamento])).toEqual([["saida", "25000", "pix"]])
    expect(await saldo(f.conta(perfilId))).toBe("75000")
    // Perfil é explícito: nada aparece no outro perfil do mesmo usuário nem para outro ADMIN da mesma loja.
    const outro = tipo === "PESSOAL" ? f.E1 : f.P1
    expect(await prisma.gasto.count({ where: { perfilId: outro } })).toBe(0)
    f.login(f.U2, [f.L1])
    if (tipo === "PESSOAL") await expect(f.contexto(f.P1)).rejects.toThrow("Contexto G005 negado")
  })

  it("02+03: 'devendo 800 ao fornecedor, vence dia 10' sem saída; 'paguei 200 daquela dívida' deixa 600", async () => {
    const f = await fixtureG005()
    const divida = await aplicarG005(f, { tipo: "CONTA_PAGAR", descricao: "Fornecedor", valorCentavos: "80000", dataGasto, vencimento: "2026-11-10" }, "ex02")
    const tituloId = divida.resultado.tituloIds[0]
    expect(await prisma.movimentacaoFinanceira.count({ where: { perfilId: f.E1 } })).toBe(0)
    expect(await saldo(f.conta())).toBe("100000")
    expect((await prisma.contaPagarTitulo.findUniqueOrThrow({ where: { id: tituloId } })).vencimento).toBe("2026-11-10")
    await aplicarG005(f, { tipo: "PAGAR_TITULO", tituloId, carteiraId: f.conta(), valorCentavos: "20000", formaPagamento: "pix", dataPagamento }, "ex03")
    const t = await prisma.contaPagarTitulo.findUniqueOrThrow({ where: { id: tituloId } })
    expect(await saldoTituloGasto(prisma, t)).toEqual({ total: BigInt(80000), pago: BigInt(20000), restante: BigInt(60000) })
    expect(await prisma.contaPagarTitulo.count({ where: { perfilId: f.E1 } })).toBe(1)
    expect(await prisma.gasto.count({ where: { perfilId: f.E1 } })).toBe(1)
    const q = await consultarFinanceiro(await f.contexto(), filtroConsultaFinanceira(outubro))
    expect(q.pagarAbertoCentavos).toBe("60000")
    expect(q.despesaRealizadaCentavos).toBe("20000")
  })

  it("04: 'comprei 600 no cartão em 3 vezes' = 3 parcelas de 20000, sem caixa; pagar a fatura não duplica a despesa", async () => {
    const f = await fixtureG005(), ctx = await f.contexto()
    const cartao = await cadastrarCartaoGasto(ctx, { nome: "Cartão sintético" })
    const ciclos = await Promise.all(["2026-11", "2026-12", "2027-01"].map((c) =>
      cadastrarCicloGasto(ctx, { cartaoId: cartao.id, identificador: c, competencia: c, vencimento: `${c}-10` })))
    const compra = await aplicarG005(f, { tipo: "COMPRA_CREDITO", descricao: "Compra parcelada", valorCentavos: "60000", dataGasto,
      parcelas: ciclos.map((c, i) => ({ cicloId: c.id, numero: i + 1, total: 3, valorCentavos: "20000" })) }, "ex04")
    const ts = await prisma.contaPagarTitulo.findMany({ where: { gastoId: compra.resultado.gastoId! }, orderBy: { vencimento: "asc" } })
    expect(ts.map((t) => [t.valorCentavos?.toString(), t.vencimento])).toEqual([["20000", "2026-11-10"], ["20000", "2026-12-10"], ["20000", "2027-01-10"]])
    expect(await prisma.movimentacaoFinanceira.count({ where: { perfilId: f.E1 } })).toBe(0)
    const fatura = await aplicarG005(f, { tipo: "PAGAR_FATURA", cicloId: ciclos[0].id, carteiraId: f.conta(), formaPagamento: "pix", dataPagamento,
      alocacoes: [{ tituloId: ts[0].id, valorCentavos: "20000" }] }, "ex04-fatura")
    expect(fatura.resultado.gastoId).toBeNull()
    expect(await prisma.gasto.count({ where: { perfilId: f.E1 } })).toBe(1)
    expect(await prisma.contaPagarTitulo.count({ where: { perfilId: f.E1 } })).toBe(3)
    expect(await saldo(f.conta())).toBe("80000")
  })

  it("05: 'quanto gastei no mercado este mês?' vem do motor (categoria estruturada), não de texto nem de total sugerido", async () => {
    const f = await fixtureG005(), ctx = await f.contexto()
    const mercado = await criarCategoriaGasto(ctx, { nome: "Supermercado", natureza: "DESPESA" })
    const outra = await criarCategoriaGasto(ctx, { nome: "Combustível", natureza: "DESPESA" })
    const pago = (valor: string, categoriaId: string, descricao: string) => ({ tipo: "GASTO_PAGO", descricao, dataGasto, valorCentavos: valor,
      categoriaId, carteiraId: f.conta(), formaPagamento: "pix", dataPagamento })
    await aplicarG005(f, pago("25000", mercado.id, "Mercado A"))
    await aplicarG005(f, pago("13050", mercado.id, "Mercado B"))
    await aplicarG005(f, pago("9900", outra.id, "mercado de combustível")) // descrição com "mercado" não entra
    const antes = await estadoG005(f)
    const q = await consultarFinanceiro(ctx, filtroConsultaFinanceira({ ...outubro, categoriaId: mercado.id }))
    expect(q.despesaRealizadaCentavos).toBe("38050")
    expect(await estadoG005(f)).toBe(antes) // consulta não escreve
  })

  it("06: transferência interna entre contas da EMPRESA não cria receita nem despesa", async () => {
    const f = await fixtureG005(), ctx = await f.contexto(), caixa = `${f.E1}-caixa`
    await prisma.carteiraFinanceira.create({ data: { id: caixa, perfilId: f.E1, storeId: f.L1, nome: "Carteira", tipo: "caixa",
      saldoInicial: 0, saldoAtual: 0, saldoInicialCentavos: "0", saldoAtualCentavos: "0", precisaoStatus: "CENTAVOS" } })
    expect((await transferirEntreCarteiras({ storeId: f.L1, origemId: f.conta(), destinoId: caixa, valor: 300 })).ok).toBe(true)
    // O serviço legado de transferência grava no relógio real: o período vai até hoje (dia civil de São Paulo).
    const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
    const q = await consultarFinanceiro(ctx, filtroConsultaFinanceira({ dataInicio: "2026-10-01", dataFim: hoje }))
    expect(q.contas.find((c) => c.id === f.conta())?.saldoCentavos).toBe("70000")
    expect(q.contas.find((c) => c.id === caixa)?.saldoCentavos).toBe("30000")
    expect([q.receitaRealizadaCentavos, q.despesaRealizadaCentavos]).toEqual(["0", "0"])
  })

  it("06 PESSOAL: TRANSFERENCIA_INTERNA no motor G004 move 30000 sem receita/despesa, idempotente e isolada", async () => {
    const f = await fixtureG005(), ctx = await f.contexto(f.P1), carteira = `${f.P1}-carteira`
    await prisma.carteiraFinanceira.create({ data: { id: carteira, perfilId: f.P1, storeId: null, nome: "Carteira pessoal", tipo: "caixa",
      saldoInicial: 0, saldoAtual: 0, saldoInicialCentavos: "0", saldoAtualCentavos: "0", precisaoStatus: "CENTAVOS" } })
    const transferir = (patch: Record<string, unknown> = {}) => ({ tipo: "TRANSFERENCIA_INTERNA", valorCentavos: "30000",
      carteiraOrigemId: f.conta(f.P1), carteiraDestinoId: carteira, dataPagamento, ...patch })
    const a = await aplicarG005(f, transferir(), "ex06-pessoal", f.P1)
    expect(a.resultado).toMatchObject({ gastoId: null, pagamentoId: null, tituloIds: [], valorCentavos: "30000" })
    expect(await aplicarOperacaoGasto(a.ctx, a.command)).toEqual(a.resultado) // confirmar de novo não move de novo
    expect([await saldo(f.conta(f.P1)), await saldo(carteira)]).toEqual(["70000", "30000"])
    const movs = await prisma.movimentacaoFinanceira.findMany({ where: { operacaoFinanceiraId: a.resultado.operacaoId }, orderBy: { tipo: "desc" } })
    expect(movs.map((m) => [m.tipo, m.carteiraId, m.valorCentavos?.toString(), m.origem, m.storeId])).toEqual([
      ["saida", f.conta(f.P1), "30000", "transferencia", null], ["entrada", carteira, "30000", "transferencia", null]])
    expect(await prisma.gasto.count({ where: { perfilId: f.P1 } })).toBe(0)
    expect(await prisma.pagamentoFinanceiro.count({ where: { perfilId: f.P1 } })).toBe(0)
    const q = await consultarFinanceiro(ctx, filtroConsultaFinanceira(outubro))
    expect(q.contas.find((c) => c.id === carteira)?.saldoCentavos).toBe("30000")
    expect([q.receitaRealizadaCentavos, q.despesaRealizadaCentavos]).toEqual(["0", "0"])
    // Isolamento: conta de outro perfil (EMPRESA do mesmo usuário ou PESSOAL de outro dono), mesma conta e saldo insuficiente.
    await expect(aplicarG005(f, transferir({ carteiraDestinoId: f.conta(f.E1) }), "ex06-empresa", f.P1)).rejects.toMatchObject({ code: "conta_indisponivel" })
    await expect(aplicarG005(f, transferir({ carteiraDestinoId: f.conta(f.P2) }), "ex06-alheia", f.P1)).rejects.toMatchObject({ code: "conta_indisponivel" })
    await expect(aplicarG005(f, transferir({ carteiraDestinoId: f.conta(f.P1) }), "ex06-mesma", f.P1)).rejects.toMatchObject({ code: "transferencia_mesma_conta" })
    await expect(aplicarG005(f, transferir({ valorCentavos: "70001" }), "ex06-saldo", f.P1)).rejects.toMatchObject({ code: "saldo_conta_insuficiente" })
    f.login(f.U2, [f.L1])
    await expect(f.contexto(f.P1)).rejects.toThrow("Contexto G005 negado")
    expect([await saldo(f.conta(f.P1)), await saldo(carteira), await saldo(f.conta(f.P2))]).toEqual(["70000", "30000", "100000"])
  })

  it("06 SQL: o banco recusa transferência forjada fora do motor (só uma perna)", async () => {
    const f = await fixtureG005(), ctx = await f.contexto(f.P1)
    const r = await prepararRevisaoGasto(ctx, { grupoChave: "ex06-forjada", proposta: { tipo: "TRANSFERENCIA_INTERNA", valorCentavos: "1000",
      carteiraOrigemId: f.conta(f.P1), carteiraDestinoId: f.conta(f.E1), dataPagamento } })
    const forjar = prisma.$transaction(async (tx) => {
      const op = await tx.financeiroOperacao.create({ data: { perfilId: f.P1, storeId: null, autorAdminUserId: f.U1, chave: "forjada",
        grupoChave: "ex06-forjada", tipo: "TRANSFERENCIA_INTERNA", payloadHash: r.payloadHash, revisaoId: r.id } })
      await tx.movimentacaoFinanceira.create({ data: { perfilId: f.P1, storeId: null, operacaoFinanceiraId: op.id, tipo: "saida",
        origem: "transferencia", referenciaId: op.id, descricao: "forjada", carteiraId: f.conta(f.P1), valor: 10, valorCentavos: "1000",
        precisaoStatus: "CENTAVOS", formaPagamento: "transferencia", ocorridoEm: new Date(dataPagamento) } })
    })
    await expect(forjar).rejects.toThrow()
    expect(await saldo(f.conta(f.P1))).toBe("100000")
  })

  it("07: 'registrei errado' — antes de confirmar corrige por CAS; depois, estorno auditado do pagamento escolhido", async () => {
    const f = await fixtureG005(), ctx = await f.contexto()
    const errado = { tipo: "GASTO_PAGO", descricao: "Mercado", dataGasto, valorCentavos: "52000", carteiraId: f.conta(), formaPagamento: "pix", dataPagamento }
    const r = await prepararRevisaoGasto(ctx, { grupoChave: "ex07", proposta: errado })
    const certo = await corrigirRevisaoGasto(ctx, { revisaoId: r.id, versaoEsperada: 1, proposta: { ...errado, valorCentavos: "25000" } })
    await expect(aplicarOperacaoGasto(ctx, { revisaoId: r.id, versaoEsperada: 1, chave: "ex07-velha" })).rejects.toMatchObject({ code: "revisao_desatualizada" })
    const aplicado = await aplicarOperacaoGasto(ctx, { revisaoId: certo.id, versaoEsperada: certo.versao, chave: "ex07" })
    expect(await saldo(f.conta())).toBe("75000")
    // Já confirmado e ainda errado: estorno do pagamento identificado (nunca o "último" da conta), com motivo.
    await aplicarG005(f, { tipo: "ESTORNAR_PAGAMENTO", pagamentoId: aplicado.pagamentoId, valorCentavos: "25000", dataPagamento, motivo: "Registrado em duplicidade" }, "ex07-estorno")
    expect(await saldo(f.conta())).toBe("100000")
    const original = await prisma.pagamentoFinanceiro.findUniqueOrThrow({ where: { id: aplicado.pagamentoId! } })
    expect(await prisma.movimentacaoFinanceira.count({ where: { compensaMovimentacaoId: original.movimentoId } })).toBe(1)
    expect(await prisma.gasto.count({ where: { perfilId: f.E1 } })).toBe(1) // fato preservado; nada apagado
    expect(await prisma.financeiroOperacaoEvento.count({ where: { perfilId: f.E1 } })).toBeGreaterThanOrEqual(2)
  })
})
