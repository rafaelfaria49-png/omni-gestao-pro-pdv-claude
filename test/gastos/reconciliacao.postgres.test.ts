import "./g005-fixtures"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@/generated/prisma"
import { consultarFinanceiro, consultarFinanceiroEmpresa, filtroConsultaFinanceira } from "@/lib/gastos/query"
import { diaNoFusoConsulta } from "@/lib/gastos/query-calculo"
import { cadastrarCartaoGasto, cadastrarCicloGasto } from "@/lib/gastos/cartoes"
import { transferirEntreCarteiras } from "@/lib/financeiro/services/carteiras-service"
import { fecharMes } from "@/lib/financeiro/services/fechamento-service"
import { gravarTituloFinanceiro } from "@/lib/gastos/financeiro-scope"
import { aplicarPagamentoLegado } from "@/lib/financeiro/services/movimentacoes-service"
import { fixtureG005, aplicarG005, pagoG005, dataGasto, dataPagamento, estadoG005, provaG005 } from "./g005-fixtures"

afterAll(async () => { vi.restoreAllMocks(); await prisma.$disconnect() })
const periodo = { dataInicio: "2026-10-01", dataFim: "2026-10-31" }
// Serviços legados (transferirEntreCarteiras, aplicarPagamentoLegado) não recebem data: o movimento leva o
// createdAt do relógio real, preenchido pelo motor do Prisma (fora do alcance de vi.setSystemTime). O período
// desses casos termina no maior entre 31/10/2026 e o dia civil de São Paulo — cobre o instante gravado em qualquer data.
const hojeSP = () => diaNoFusoConsulta(new Date())
const periodoComLegado = () => ({ dataInicio: "2026-10-01", dataFim: hojeSP() > "2026-10-31" ? hojeSP() : "2026-10-31" })
// Suíte do comportamento LIGADO (G005); a ativação é explícita aqui, nunca herdada do ambiente.
beforeAll(() => { vi.stubEnv("GESTOR_MONEY_ENABLED", "true") })

describe("G005 A13 completo pelo serviço e SQL real", () => {
  it("oito posições exatas, crédito/fatura/transferência/estorno sem duplicar despesa", async () => {
    const f = await fixtureG005(), ctx = await f.contexto(), caixa = `${f.E1}-caixa`
    await prisma.carteiraFinanceira.create({ data: { id: caixa, perfilId: f.E1, storeId: f.L1, nome: "Caixa A13", tipo: "caixa", saldoInicial: 0, saldoAtual: 0, saldoInicialCentavos: "0", saldoAtualCentavos: "0", precisaoStatus: "CENTAVOS" } })
    const t = await aplicarG005(f, { tipo: "CONTA_PAGAR", descricao: "T1 A13", valorCentavos: "36501", dataGasto, vencimento: "2026-10-31", carteiraId: f.conta() })
    const prova: unknown[] = []
    const conferir = async (passo: string, banco: string, dinheiro: string, aberto: string, despesa: string) => {
      const antes = await estadoG005(f), q = await consultarFinanceiro(ctx, filtroConsultaFinanceira(periodoComLegado()))
      expect(q.contas.find(c => c.id === f.conta())?.saldoCentavos).toBe(banco)
      expect(q.contas.find(c => c.id === caixa)?.saldoCentavos).toBe(dinheiro)
      expect(q.pagarAbertoCentavos).toBe(aberto); expect(q.despesaRealizadaCentavos).toBe(despesa)
      expect(q.receitaRealizadaCentavos).toBe("0")
      const sql = await prisma.$queryRaw<Array<{ id: string; saldo: string }>>`
        SELECT c.id,(c."saldoInicialCentavos"+COALESCE(SUM(CASE WHEN m.tipo='entrada' THEN m."valorCentavos" ELSE -m."valorCentavos" END),0))::bigint::text saldo
        FROM carteiras_financeiras c LEFT JOIN movimentacoes_financeiras m ON m."carteiraId"=c.id AND m."perfilId"=${f.E1}
        WHERE c."perfilId"=${f.E1} GROUP BY c.id ORDER BY c.id`
      expect(sql.find(c => c.id === f.conta())?.saldo).toBe(banco); expect(sql.find(c => c.id === caixa)?.saldo).toBe(dinheiro)
      const [s] = await prisma.$queryRaw<Array<{ aberto: string }>>`
        SELECT COALESCE(SUM(t."valorCentavos"-COALESCE(a.pago,0)),0)::bigint::text aberto
        FROM contas_pagar_titulos t LEFT JOIN LATERAL (
          SELECT SUM(CASE WHEN p.tipo='ESTORNO' THEN -a."valorCentavos" ELSE a."valorCentavos" END) pago
          FROM alocacoes_pagamento a JOIN pagamentos_financeiros p ON p.id=a."pagamentoId"
          WHERE a."pagarTituloId"=t.id AND a."perfilId"=${f.E1}) a ON TRUE
        WHERE t."perfilId"=${f.E1} AND t.ativo=TRUE AND t.status NOT IN ('cancelado','estornado')`
      expect(s.aberto).toBe(aberto)
      const [realizadoSQL] = await prisma.$queryRaw<Array<{ despesa: string; receita: string }>>`
        SELECT COALESCE(SUM(CASE WHEN COALESCE(o.tipo,m.tipo)='saida' THEN m."valorCentavos" * CASE WHEN o.id IS NULL THEN 1 ELSE -1 END ELSE 0 END),0)::bigint::text despesa,
          COALESCE(SUM(CASE WHEN COALESCE(o.tipo,m.tipo)='entrada' THEN m."valorCentavos" * CASE WHEN o.id IS NULL THEN 1 ELSE -1 END ELSE 0 END),0)::bigint::text receita
        FROM movimentacoes_financeiras m LEFT JOIN movimentacoes_financeiras o ON o.id=m."compensaMovimentacaoId" AND o."perfilId"=${f.E1}
        WHERE m."perfilId"=${f.E1} AND m.origem NOT LIKE 'transferencia%'
          AND COALESCE(m."ocorridoEm",m."createdAt") >= TIMESTAMPTZ '2026-10-01 00:00:00 America/Sao_Paulo'
          AND COALESCE(m."ocorridoEm",m."createdAt") < TIMESTAMPTZ '2026-11-01 00:00:00 America/Sao_Paulo'`
      expect(realizadoSQL.despesa).toBe(despesa); expect(realizadoSQL.receita).toBe("0")
      expect(await estadoG005(f)).toBe(antes)
      prova.push({ passo, esperado: { banco, caixa: dinheiro, aberto, despesa }, servico: { banco: q.contas.find(c => c.id === f.conta())?.saldoCentavos, caixa: q.contas.find(c => c.id === caixa)?.saldoCentavos, aberto: q.pagarAbertoCentavos, despesa: q.despesaRealizadaCentavos }, sql, sqlAberto: s.aberto, realizadoSQL, asOf: q.asOf, versao: q.versaoCalculo })
    }
    await conferir("inicial", "100000", "0", "36501", "0")
    const pix = await aplicarG005(f, pagoG005(f, { valorCentavos: "2000" }))
    await conferir("pix20", "98000", "0", "36501", "2000")
    const proposta = { tipo: "PAGAR_TITULO", tituloId: t.resultado.tituloIds[0], carteiraId: f.conta(), formaPagamento: "pix", dataPagamento }
    await aplicarG005(f, { ...proposta, valorCentavos: "20000" })
    await conferir("parcial200", "78000", "0", "16501", "22000")
    await aplicarG005(f, { ...proposta, quitar: true })
    await conferir("quitacao16501", "61499", "0", "0", "38501")
    expect((await transferirEntreCarteiras({ storeId: f.L1, origemId: f.conta(), destinoId: caixa, valor: 50 })).ok).toBe(true)
    await conferir("transferencia50", "56499", "5000", "0", "38501")
    const cartao = await cadastrarCartaoGasto(ctx, { nome: "A13 crédito" })
    const ciclo = await cadastrarCicloGasto(ctx, { cartaoId: cartao.id, identificador: "2026-10", competencia: "2026-10", vencimento: "2026-10-31" })
    const compra = await aplicarG005(f, { tipo: "COMPRA_CREDITO", descricao: "A13 compra crédito", valorCentavos: "10000", dataGasto, cicloId: ciclo.id })
    await conferir("credito100", "56499", "5000", "10000", "38501")
    await aplicarG005(f, { tipo: "PAGAR_FATURA", cicloId: ciclo.id, carteiraId: f.conta(), formaPagamento: "pix", dataPagamento, alocacoes: [{ tituloId: compra.resultado.tituloIds[0], valorCentavos: "10000" }] })
    await conferir("fatura100", "46499", "5000", "0", "48501")
    await aplicarG005(f, { tipo: "ESTORNAR_PAGAMENTO", pagamentoId: pix.resultado.pagamentoId, valorCentavos: "2000", dataPagamento, motivo: "A13 devolver PIX" })
    await conferir("estorno20", "48499", "5000", "0", "46501")
    const q = await consultarFinanceiroEmpresa(f.L1, periodoComLegado())
    expect(q.saldoCentavos).toBe("53499")
    expect(await prisma.gasto.count({ where: { perfilId: f.E1 } })).toBe(3)
    expect(await prisma.contaPagarTitulo.count({ where: { perfilId: f.E1 } })).toBe(2)
    provaG005("a13-numerico", { fixture: f.id, prova, final: { saldoConsolidadoCentavos: q.saldoCentavos, despesaCentavos: q.despesaRealizadaCentavos } })
  }, 60000)
})

describe("G005 filtros, precisão, período e privacidade PostgreSQL", () => {
  it("FK explícita não é sombreada por localKey alheio; referência legada ambígua exige revisão", async () => {
    const f = await fixtureG005(), cat = `${f.E1}-cat`, id = `${f.id}-primeiro`
    await prisma.categoriaGasto.create({ data: { id: cat, perfilId: f.E1, storeId: f.L1, nome: "Energia", nomeNormalizado: "energia", natureza: "DESPESA" } })
    await prisma.contaPagarTitulo.create({ data: { id, perfilId: f.E1, storeId: f.L1, localKey: "chave-primeiro", descricao: "Primeiro", categoriaId: cat, valor: 10, valorCentavos: "1000", status: "pago", payload: { historico: [{ tipo: "pagamento", valor: 10 }] }, vencimento: "2026-10-31" } })
    await prisma.contaPagarTitulo.create({ data: { id: `${f.id}-segundo`, perfilId: f.E1, storeId: f.L1, localKey: id, descricao: "Segundo", valor: 20, valorCentavos: "2000", vencimento: "2026-10-31" } })
    await prisma.movimentacaoFinanceira.create({ data: { perfilId: f.E1, storeId: f.L1, carteiraId: f.conta(), tipo: "saida", origem: "pagar", valor: 10, valorCentavos: "1000", pagarTituloId: id, referenciaId: id, ocorridoEm: new Date(dataPagamento) } })
    expect((await consultarFinanceiroEmpresa(f.L1, { ...periodo, categoriaId: cat })).despesaRealizadaCentavos).toBe("1000")
    await prisma.movimentacaoFinanceira.create({ data: { perfilId: f.E1, storeId: f.L1, carteiraId: f.conta(), tipo: "saida", origem: "pagar", valor: 1, valorCentavos: "100", referenciaId: id, ocorridoEm: new Date(dataPagamento) } })
    await expect(consultarFinanceiroEmpresa(f.L1, periodo)).rejects.toMatchObject({ code: "vinculo_legado_exige_revisao" })
  })
  it("A19: pagar e receber com o mesmo ID/localKey não trocam categoria ou identidade", async () => {
    const f = await fixtureG005(), cat = `${f.E1}-cat`, id = `${f.id}-titulo-igual`, movimentoId = `${f.id}-pagamento-legado`
    await prisma.categoriaGasto.create({ data: { id: cat, perfilId: f.E1, storeId: f.L1, nome: "Energia", nomeNormalizado: "energia", natureza: "DESPESA" } })
    await prisma.contaPagarTitulo.create({ data: { id, perfilId: f.E1, storeId: f.L1, localKey: "mesma-chave", descricao: "Obrigação", valor: 10, valorCentavos: "1000", categoriaId: cat, vencimento: "2026-10-31", status: "pago", payload: { historico: [{ tipo: "pagamento", valor: 10, movimentoId, at: dataPagamento }] } } })
    await prisma.contaReceberTitulo.create({ data: { id, perfilId: f.E1, storeId: f.L1, localKey: "mesma-chave", descricao: "Recebível", valor: 10, valorCentavos: "1000", vencimento: "2026-10-31" } })
    await prisma.movimentacaoFinanceira.create({ data: { id: movimentoId, perfilId: f.E1, storeId: f.L1, tipo: "saida", origem: "pagar", valor: 10, valorCentavos: "1000", carteiraId: f.conta(), pagarTituloId: id, referenciaId: "mesma-chave", ocorridoEm: new Date(dataPagamento) } })
    const q = await consultarFinanceiroEmpresa(f.L1, { ...periodo, categoriaId: cat })
    expect(q.despesaRealizadaCentavos).toBe("1000"); expect(q.receber).toHaveLength(0); expect(q.pagar).toHaveLength(1)
  })
  it("recebível e parcial M1 usam a identidade canônica e o restante, sem inventar outra receita", async () => {
    const f = await fixtureG005(), ctx = await f.contexto()
    const t = await gravarTituloFinanceiro(ctx, { natureza: "RECEBER", chave: "cr-g005", descricao: "Recebível real", valorCentavos: "36501", vencimento: "2026-10-31", carteiraId: f.conta() })
    await aplicarPagamentoLegado({ storeId: f.L1, tipo: "receber", canal: "financeiro", op: "parcial", localKey: t.localKey!, valor: 200, idempotencyKey: `${f.id}-parcial` })
    const parcial = await consultarFinanceiroEmpresa(f.L1, periodoComLegado())
    expect(parcial.receberAbertoCentavos).toBe("16501"); expect(parcial.receitaRealizadaCentavos).toBe("20000")
    await aplicarPagamentoLegado({ storeId: f.L1, tipo: "receber", canal: "financeiro", op: "liquidar", localKey: t.localKey!, idempotencyKey: `${f.id}-quitar` })
    const final = await consultarFinanceiroEmpresa(f.L1, periodoComLegado())
    expect(final.receberAbertoCentavos).toBe("0"); expect(final.receitaRealizadaCentavos).toBe("36501"); expect(final.despesaRealizadaCentavos).toBe("0")
    expect(await prisma.contaReceberTitulo.count({ where: { perfilId: f.E1 } })).toBe(1)
  })
  it("compra no mês anterior e pagamento da fatura no seguinte usam datas e bases distintas", async () => {
    const f = await fixtureG005(), ctx = await f.contexto()
    const card = await cadastrarCartaoGasto(ctx, { nome: "Crédito entre meses" }), ciclo = await cadastrarCicloGasto(ctx, { cartaoId: card.id, identificador: "2026-10", competencia: "2026-10", vencimento: "2026-10-31" })
    const compra = await aplicarG005(f, { tipo: "COMPRA_CREDITO", descricao: "Consumo setembro", valorCentavos: "10000", dataGasto: "2026-09-30", cicloId: ciclo.id })
    await aplicarG005(f, { tipo: "PAGAR_FATURA", cicloId: ciclo.id, carteiraId: f.conta(), formaPagamento: "pix", dataPagamento: "2026-10-01T03:01:00Z", alocacoes: [{ tituloId: compra.resultado.tituloIds[0], valorCentavos: "10000" }] })
    const set = await consultarFinanceiroEmpresa(f.L1, { dataInicio: "2026-09-01", dataFim: "2026-09-30" }), out = await consultarFinanceiroEmpresa(f.L1, periodo)
    expect(set.despesaRealizadaCentavos).toBe("0"); expect(set.saldoCentavos).toBe("100000")
    expect(out.despesaRealizadaCentavos).toBe("10000"); expect(out.saldoCentavos).toBe("90000")
    expect(set.criterios.posicaoTitulos).toBe("ATUAL_NO_SNAPSHOT"); expect(set.pagarAbertoCentavos).toBe("0")
  })
  it("agrega mais de uma página e usa categoria estruturada, jamais descrição", async () => {
    const f = await fixtureG005(), cat = `${f.E1}-energia`
    await prisma.categoriaGasto.create({ data: { id: cat, perfilId: f.E1, storeId: f.L1, nome: "Energia", nomeNormalizado: "energia", natureza: "DESPESA" } })
    await prisma.movimentacaoFinanceira.createMany({ data: Array.from({ length: 601 }, (_, i) => ({ perfilId: f.E1, storeId: f.L1, carteiraId: f.conta(), descricao: "Alimentação não é categoria", tipo: "saida", origem: "manual", valor: 0.01, valorCentavos: "1", categoriaId: cat, ocorridoEm: new Date(dataPagamento), id: `${f.id}-mov-${i}` })) })
    const q = await consultarFinanceiroEmpresa(f.L1, { ...periodo, categoriaId: cat })
    expect(q.despesaRealizadaCentavos).toBe("601"); expect(q.quantidadeRegistros).toBe(601)
    expect(q.porCategoria).toEqual([{ categoriaId: cat, categoria: "Energia", despesaCentavos: "601", receitaCentavos: "0", quantidade: 601 }])
    expect((await consultarFinanceiroEmpresa(f.L1, { ...periodo, categoriaNome: "energia" })).despesaRealizadaCentavos).toBe("601")
    expect((await consultarFinanceiroEmpresa(f.L1, { ...periodo, dataFim: "2026-10-21" })).despesaRealizadaCentavos).toBe("0")
    expect((await consultarFinanceiroEmpresa(f.L1, { ...periodo, carteiraId: f.conta() })).despesaRealizadaCentavos).toBe("601")
  }, 30000)
  it("snapshot de conta ignora saldo materializado incorreto e lê somente o ledger", async () => {
    const f = await fixtureG005()
    await aplicarG005(f, pagoG005(f, { valorCentavos: "100" }))
    await prisma.carteiraFinanceira.update({ where: { id: f.conta() }, data: { saldoAtual: 777, saldoAtualCentavos: "77700" } })
    const antes = await estadoG005(f), q = await consultarFinanceiroEmpresa(f.L1, periodo)
    expect(q.saldoCentavos).toBe("99900"); expect(await estadoG005(f)).toBe(antes)
  })
  it("nega clone/owner/loja/conta/categoria forjados e grant revogado, sem mostrar pessoal", async () => {
    const f = await fixtureG005(), ctx = await f.contexto(f.P1)
    await aplicarG005(f, pagoG005(f, { carteiraId: f.conta(f.P1), valorCentavos: "9999", descricao: "PESSOAL_SECRETO_G005" }), "pessoal", f.P1)
    expect((await consultarFinanceiro(ctx, filtroConsultaFinanceira(periodo))).despesaRealizadaCentavos).toBe("9999")
    expect(JSON.stringify(await consultarFinanceiroEmpresa(f.L1, periodo))).not.toContain("PESSOAL_SECRETO_G005")
    await expect(consultarFinanceiro({ ...ctx }, filtroConsultaFinanceira(periodo))).rejects.toMatchObject({ status: 403 })
    await expect(consultarFinanceiroEmpresa(f.L1, { ...periodo, carteiraId: f.conta(f.P1) })).rejects.toMatchObject({ status: 404 })
    await expect(consultarFinanceiroEmpresa(f.L1, { ...periodo, categoriaId: "categoria-forjada" })).rejects.toMatchObject({ status: 404 })
    f.login(f.U2, [f.L1]); await expect(consultarFinanceiro(ctx, filtroConsultaFinanceira(periodo))).rejects.toMatchObject({ status: 403 })
    await expect(consultarFinanceiroEmpresa(f.L2, periodo)).rejects.toMatchObject({ status: 403 })
    f.login(); await prisma.perfilMembro.updateMany({ where: { perfilId: f.E1, adminUserId: f.U1 }, data: { revogadoEm: new Date() } })
    await expect(consultarFinanceiroEmpresa(f.L1, periodo)).rejects.toMatchObject({ status: 403 })
  })
  it("ausência de perfil é legado empresarial exato, sem criar perfil por GET", async () => {
    const f = await fixtureG005(), loja = `${f.id}-sem-perfil`
    await prisma.store.create({ data: { id: loja, name: "Legado sintético" } })
    await prisma.adminUserStore.create({ data: { adminUserId: f.U1, storeId: loja } }); f.login(f.U1, [loja])
    const q = await consultarFinanceiroEmpresa(loja, periodo)
    expect(q.criterios.perfilId).toBeNull(); expect(q.despesaRealizadaCentavos).toBe("0")
    expect(await prisma.financeiroPerfil.count({ where: { storeId: loja } })).toBe(0)
  })
  it("ocorridoEm e meia-noite SP prevalecem sobre sincronização; estorno posterior mantém o mês original", async () => {
    const f = await fixtureG005()
    const a = await aplicarG005(f, pagoG005(f, { dataGasto: "2026-09-30", dataPagamento: "2026-10-01T02:59:00Z", valorCentavos: "1000" }))
    await aplicarG005(f, pagoG005(f, { dataGasto: "2026-10-01", dataPagamento: "2026-10-01T03:01:00Z", valorCentavos: "2000" }))
    await aplicarG005(f, { tipo: "ESTORNAR_PAGAMENTO", pagamentoId: a.resultado.pagamentoId, valorCentavos: "1000", dataPagamento: "2026-10-02T15:00:00Z", motivo: "Devolução no mês seguinte" })
    const set = await consultarFinanceiroEmpresa(f.L1, { dataInicio: "2026-09-01", dataFim: "2026-09-30" }), out = await consultarFinanceiroEmpresa(f.L1, periodo)
    expect(set.despesaRealizadaCentavos).toBe("1000"); expect(out.despesaRealizadaCentavos).toBe("1000")
    expect(set.contas[0].saldoCentavos).toBe("99000"); expect(out.contas[0].saldoCentavos).toBe("98000")
    const antes = await estadoG005(f); await fecharMes(f.L1, 9, 2026)
    expect((await consultarFinanceiroEmpresa(f.L1, { dataInicio: "2026-09-01", dataFim: "2026-09-30" })).despesaRealizadaCentavos).toBe("1000")
    expect(await estadoG005(f)).toBe(antes)
  }, 60000)
  it("anomalia legada é recusa explícita, sem corrigir/round/write no GET", async () => {
    const f = await fixtureG005()
    await prisma.contaPagarTitulo.create({ data: { perfilId: f.E1, storeId: f.L1, descricao: "Precisão anômala", valor: 1.001, precisaoStatus: "ANOMALIA_LEGADO", valorOriginalLegado: 1.001, vencimento: "2026-10-31" } })
    const antes = await estadoG005(f)
    await expect(consultarFinanceiroEmpresa(f.L1, periodo)).rejects.toMatchObject({ code: "precisao_legada_exige_revisao" })
    expect(await estadoG005(f)).toBe(antes)
  })
})

describe("G005 snapshot real durante quitação concorrente", () => {
  it("duas conexões distintas: leitura fixada antes do COMMIT conserva a posição integral anterior", async () => {
    const f = await fixtureG005(), t = await aplicarG005(f, { tipo: "CONTA_PAGAR", descricao: "Concorrência", valorCentavos: "36501", dataGasto, vencimento: "2026-10-31" })
    let sinal!: () => void, liberar!: () => void
    const fixado = new Promise<void>(r => { sinal = r }), continuar = new Promise<void>(r => { liberar = r })
    const original = prisma.$transaction.bind(prisma)
    let readPid = 0, writePid = 0, isolacao = "", somenteLeitura = ""
    const spy = vi.spyOn(prisma, "$transaction")
    const interceptar = async (fn: (db: Prisma.TransactionClient) => Promise<unknown>, options?: { isolationLevel?: string }) => original(async tx => {
      if (options?.isolationLevel !== "RepeatableRead") {
        const [p] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() pid`; writePid = p.pid
        return fn(tx)
      }
      const proxy = new Proxy(tx, { get(target, key) {
        if (key !== "$executeRaw") return Reflect.get(target, key)
        return async (sql: TemplateStringsArray, ...values: unknown[]) => {
          const result = await target.$executeRaw(sql, ...values)
          if (sql.join("").includes("SET TRANSACTION READ ONLY")) {
            const [p] = await target.$queryRaw<Array<{ pid: number; iso: string; ro: string }>>`SELECT pg_backend_pid() pid,current_setting('transaction_isolation') iso,current_setting('transaction_read_only') ro`
            readPid = p.pid; isolacao = p.iso; somenteLeitura = p.ro; sinal(); await continuar
          }
          return result
        }
      } })
      return fn(proxy)
    }, { isolationLevel: options?.isolationLevel as Prisma.TransactionIsolationLevel, timeout: 20000 })
    spy.mockImplementation(interceptar as typeof prisma.$transaction)
    const pendente = consultarFinanceiroEmpresa(f.L1, periodo)
    try {
      await fixado
      await aplicarG005(f, { tipo: "PAGAR_TITULO", tituloId: t.resultado.tituloIds[0], quitar: true, carteiraId: f.conta(), formaPagamento: "pix", dataPagamento })
      liberar(); const durante = await pendente
      expect(readPid).not.toBe(writePid); expect(readPid).toBeGreaterThan(0); expect(writePid).toBeGreaterThan(0)
      expect(isolacao).toBe("repeatable read"); expect(somenteLeitura).toBe("on")
      expect(durante.pagarAbertoCentavos).toBe("36501"); expect(durante.despesaRealizadaCentavos).toBe("0"); expect(durante.saldoCentavos).toBe("100000")
      spy.mockRestore()
      const depois = await consultarFinanceiroEmpresa(f.L1, periodo)
      expect(depois.pagarAbertoCentavos).toBe("0"); expect(depois.despesaRealizadaCentavos).toBe("36501"); expect(depois.saldoCentavos).toBe("63499")
      provaG005("snapshot-concorrente", { readPid, writePid, isolacao, somenteLeitura, antes: { aberto: durante.pagarAbertoCentavos, despesa: durante.despesaRealizadaCentavos, saldo: durante.saldoCentavos }, depois: { aberto: depois.pagarAbertoCentavos, despesa: depois.despesaRealizadaCentavos, saldo: depois.saldoCentavos }, semSleep: true })
    } finally { liberar(); spy.mockRestore() }
  }, 60000)
})
