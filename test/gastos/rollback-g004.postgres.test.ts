import "./g004-fixtures"
import { afterAll, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import { prepararRevisaoGasto } from "@/lib/gastos/operacoes"
import { aplicarOperacaoGasto } from "@/lib/gastos/apply"
import { gravarTituloFinanceiro } from "@/lib/gastos/financeiro-scope"
import { cadastrarCartaoGasto, cadastrarCicloGasto } from "@/lib/gastos/cartoes"
import { aplicarG004, dataGasto, dataPagamento, estadoG004, fixtureG004, pagoG004 } from "./g004-fixtures"

afterAll(async () => { await prisma.$disconnect() })
const casos = [
  ["reserva", "financeiro_operacoes", "INSERT"], ["gasto", "gastos", "INSERT"],
  ["titulo", "contas_pagar_titulos", "INSERT"], ["pagamento", "pagamentos_financeiros", "INSERT"],
  ["alocacao", "alocacoes_pagamento", "INSERT"], ["movimento", "movimentacoes_financeiras", "INSERT"],
  ["saldo", "carteiras_financeiras", "UPDATE"], ["auditoria", "financeiro_operacao_eventos", "INSERT"],
  ["outbox", "gastos_outbox", "INSERT"], ["precommit", "financeiro_operacoes", "UPDATE"],
] as const
describe("G004 falhas SQL após cada fronteira real", () => {
  it.each(casos)("rollback integral após %s", async (etapa, tabela, evento) => {
    const f = await fixtureG004(), ctx = await f.contexto()
    const proposta = etapa === "titulo" ? { tipo: "CONTA_PAGAR", descricao: "Falha título", valorCentavos: "4000", dataGasto, vencimento: "2026-11-01" } : pagoG004(f)
    const r = await prepararRevisaoGasto(ctx, { grupoChave: `rollback-${etapa}`, proposta }), before = await estadoG004(f)
    // DDL exclusivo de fixture, perfil UUID sintético validado; nenhum trigger canônico é removido/desabilitado.
    expect(f.E1).toMatch(/^g004-[a-f0-9-]+-E1$/)
    await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION g004_qa_falhar() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."perfilId"=TG_ARGV[0] THEN RAISE EXCEPTION 'G004_QA_FAILURE'; END IF; RETURN NEW; END $$`)
    const ddl = etapa === "precommit" ? `CREATE CONSTRAINT TRIGGER g004_qa_falha AFTER ${evento} ON ${tabela} DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION g004_qa_falhar('${f.E1}')`
      : `CREATE TRIGGER g004_qa_falha AFTER ${evento} ON ${tabela} FOR EACH ROW EXECUTE FUNCTION g004_qa_falhar('${f.E1}')`
    await prisma.$executeRawUnsafe(ddl)
    try {
      await expect(aplicarOperacaoGasto(ctx, { revisaoId: r.id, versaoEsperada: 1, chave: `falha-${etapa}` })).rejects.toThrow("G004_QA_FAILURE")
      expect(await estadoG004(f)).toBe(before)
    } finally { await prisma.$executeRawUnsafe(`DROP TRIGGER g004_qa_falha ON ${tabela}`) }
    const aplicado = await aplicarOperacaoGasto(ctx, { revisaoId: r.id, versaoEsperada: 1, chave: `falha-${etapa}` })
    expect(aplicado.estado).toBe("APLICADA")
    expect(await prisma.financeiroOperacao.count({ where: { perfilId: f.E1 } })).toBe(1)
    expect(await prisma.gastoOutbox.count({ where: { perfilId: f.E1 } })).toBe(1)
  })
  it.each(["titulo-projecao", "fatura-projecao", "estorno-contador"] as const)("rollback integral em %s identifica a falha SQL injetada", async modo => {
    const f = await fixtureG004(), ctx = await f.contexto()
    let proposta: unknown, alvo: string
    if (modo === "fatura-projecao") {
      const cartao = await cadastrarCartaoGasto(ctx, { nome: "Rollback de fatura" })
      const ciclo = await cadastrarCicloGasto(ctx, { cartaoId: cartao.id, identificador: "2026-11", competencia: "2026-11", vencimento: "2026-11-10" })
      const compras = []
      for (const valorCentavos of ["1000", "2000"]) compras.push(await aplicarG004(f, { tipo: "COMPRA_CREDITO", descricao: "Obrigação real", dataGasto, valorCentavos, cicloId: ciclo.id }))
      const alocacoes = compras.map((c, i) => ({ tituloId: c.resultado.tituloIds[0], valorCentavos: i ? "2000" : "1000" }))
      proposta = { tipo: "PAGAR_FATURA", cicloId: ciclo.id, carteiraId: f.conta(), formaPagamento: "pix", dataPagamento, alocacoes }
      alvo = alocacoes.map(a => a.tituloId).sort().at(-1)!
    } else {
      const t = await gravarTituloFinanceiro(ctx, { natureza: "PAGAR", chave: "rollback", descricao: "Projeção real", valorCentavos: "10000", vencimento: dataGasto })
      const pagar = { tipo: "PAGAR_TITULO", tituloId: t.id, valorCentavos: "4000", carteiraId: f.conta(), formaPagamento: "pix", dataPagamento }
      if (modo === "estorno-contador") {
        const original = await aplicarG004(f, pagar)
        alvo = (await prisma.alocacaoPagamento.findFirstOrThrow({ where: { pagamentoId: original.resultado.pagamentoId! } })).id
        proposta = { tipo: "ESTORNAR_PAGAMENTO", pagamentoId: original.resultado.pagamentoId, valorCentavos: "1000", dataPagamento, motivo: "Injeção no contador derivado" }
      } else { proposta = pagar; alvo = t.id }
    }
    const r = await prepararRevisaoGasto(ctx, { grupoChave: modo, proposta }), before = await estadoG004(f)
    const operacoesAntes = await prisma.financeiroOperacao.count({ where: { perfilId: f.E1 } })
    const tabela = modo === "estorno-contador" ? "alocacoes_pagamento" : "contas_pagar_titulos"
    expect(f.E1).toMatch(/^g004-[a-f0-9-]+-E1$/)
    await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION g004_qa_delta_falhar() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."perfilId"=TG_ARGV[0] AND NEW.id=TG_ARGV[1] THEN RAISE EXCEPTION 'G004_QA_FAILURE_DELTA'; END IF; RETURN NEW; END $$`)
    await prisma.$executeRawUnsafe(`CREATE TRIGGER g004_qa_delta_falha AFTER UPDATE ON ${tabela} FOR EACH ROW EXECUTE FUNCTION g004_qa_delta_falhar('${f.E1}','${alvo}')`)
    const command = { revisaoId: r.id, versaoEsperada: r.versao, chave: modo }
    try {
      await expect(aplicarOperacaoGasto(ctx, command)).rejects.toThrow("G004_QA_FAILURE_DELTA")
      expect(await estadoG004(f)).toBe(before)
    } finally { await prisma.$executeRawUnsafe(`DROP TRIGGER g004_qa_delta_falha ON ${tabela}`) }
    expect((await aplicarOperacaoGasto(ctx, command)).estado).toBe("APLICADA")
    expect(await prisma.financeiroOperacao.count({ where: { perfilId: f.E1 } })).toBe(operacoesAntes + 1)
    expect(await prisma.gastoOutbox.count({ where: { perfilId: f.E1 } })).toBe(operacoesAntes + 1)
  })
})
