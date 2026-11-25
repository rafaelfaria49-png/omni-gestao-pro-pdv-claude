import "./g004-fixtures"
import { afterAll, afterEach, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { aplicarOperacaoGasto, estornarPagamentoHub } from "@/lib/gastos/apply"
import { cancelarRevisaoGasto, corrigirRevisaoGasto, expirarRevisaoGasto, prepararRevisaoGasto } from "@/lib/gastos/operacoes"
import { saldoTituloGasto } from "@/lib/gastos/pagamentos"
import { gravarTituloFinanceiro } from "@/lib/gastos/financeiro-scope"
import { aplicarPagamentoLegado } from "@/lib/financeiro/services/movimentacoes-service"
import { fecharDia, fecharMes, reabrirFechamento, verificarPeriodoFechado } from "@/lib/financeiro/services/fechamento-service"
import { registrarDocumentoGasto, vincularDocumentoGasto } from "@/lib/gastos/documentos"
import { DocumentoStorageFixture } from "@/lib/gastos/documentos-fixture"
import { aplicarG004, dataGasto, dataPagamento, estadoG004, fixtureG004, pagoG004 } from "./g004-fixtures"

afterAll(async () => { await prisma.$disconnect() })
afterEach(() => { vi.useRealTimers() })

describe("G004 fronteira de mês no PostgreSQL e dia bancário São Paulo", () => {
  it.each(["diario", "mensal"] as const)("fechamento %s distingue 01:59Z de 03:00Z e replay conserva o instante", async tipo => {
    const f = await fixtureG004(), ctx = await f.contexto()
    const fechado = tipo === "diario" ? await fecharDia(f.L1, "2026-10-31") : await fecharMes(f.L1, 10, 2026)
    const proposta = { tipo: "PAGAR_TITULO", tituloId: (await gravarTituloFinanceiro(ctx, {
      natureza: "PAGAR", chave: "fronteira", descricao: "Fuso real", valorCentavos: "10000", vencimento: "2026-11-10" })).id,
      carteiraId: f.conta(), valorCentavos: "1000", formaPagamento: "pix", dataPagamento: "2026-11-01T01:59:00.000Z" }
    const r = await prepararRevisaoGasto(ctx, { grupoChave: "outubro", proposta })
    const command = { revisaoId: r.id, versaoEsperada: r.versao, chave: "outubro" }, before = await estadoG004(f)
    expect((await verificarPeriodoFechado(f.L1, new Date(proposta.dataPagamento))).fechado).toBe(true)
    expect((await verificarPeriodoFechado(f.L1, new Date("2026-11-01T03:00:00.000Z"))).fechado).toBe(false)
    await expect(aplicarOperacaoGasto(ctx, command)).rejects.toMatchObject({ code: "periodo_fechado" })
    expect(await estadoG004(f)).toBe(before)
    // 03:00Z já pertence a novembro e não aguarda reabertura de outubro.
    const novembro = await aplicarG004(f, { ...proposta, dataPagamento: "2026-11-01T03:00:00.000Z" }, "novembro")
    await reabrirFechamento(fechado.id, f.L1, "Autorizar a proposta original de outubro")
    const outubro = await aplicarOperacaoGasto(ctx, command)
    const datas = await prisma.pagamentoFinanceiro.findMany({ where: { perfilId: f.E1 }, orderBy: { pagoEm: "asc" } })
    expect(datas.map(p => p.pagoEm.toISOString())).toEqual([proposta.dataPagamento, "2026-11-01T03:00:00.000Z"])
    await fecharDia(f.L1, "2026-10-31"); await fecharMes(f.L1, 11, 2026)
    const applied = await estadoG004(f)
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-12-01T12:00:00Z"))
    expect(await aplicarOperacaoGasto(ctx, command)).toEqual(outubro)
    expect(await aplicarOperacaoGasto(novembro.ctx, novembro.command)).toEqual(novembro.resultado)
    expect(await estadoG004(f)).toBe(applied)
  })
  it("fecharDia sem data usa 31/10 em 01:59Z de 01/11; Date explícita e verificação usam o mesmo dia", async () => {
    const f = await fixtureG004()
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-01T01:59:00Z"))
    const fechado = await fecharDia(f.L1)
    expect(fechado.dataReferencia).toBe("2026-10-31")
    expect((await verificarPeriodoFechado(f.L1, new Date())).fechado).toBe(true)
    await reabrirFechamento(fechado.id, f.L1, "Provar instante explícito")
    expect((await fecharDia(f.L1, new Date())).dataReferencia).toBe("2026-10-31")
  })
})
describe("G004 operações PostgreSQL reais", () => {
  it("gasto já pago tem um fato, um pagamento/alocação, uma saída e nenhum título extra; replay retorna IDs", async () => {
    const f = await fixtureG004(), a = await aplicarG004(f, pagoG004(f))
    expect(await prisma.gasto.count({ where: { perfilId: f.E1 } })).toBe(1)
    expect(await prisma.contaPagarTitulo.count({ where: { perfilId: f.E1 } })).toBe(0)
    expect(await prisma.pagamentoFinanceiro.count({ where: { perfilId: f.E1 } })).toBe(1)
    expect(await prisma.alocacaoPagamento.count({ where: { perfilId: f.E1 } })).toBe(1)
    expect(await prisma.movimentacaoFinanceira.count({ where: { perfilId: f.E1 } })).toBe(1)
    expect((await prisma.carteiraFinanceira.findUniqueOrThrow({ where: { id: f.conta() } })).saldoAtualCentavos?.toString()).toBe("96000")
    const before = await estadoG004(f)
    expect(await aplicarOperacaoGasto(a.ctx, a.command)).toEqual(a.resultado)
    expect(await estadoG004(f)).toBe(before)
    expect((await prisma.gastoOutbox.findFirstOrThrow({ where: { operacaoId: a.resultado.operacaoId } })).payload).toEqual(a.resultado)
  })
  it("R$365,01: obrigação sem saída; parcial R$200 e quitação R$165,01 sem duplicar Gasto/título", async () => {
    const f = await fixtureG004()
    const a = await aplicarG004(f, { tipo: "CONTA_PAGAR", descricao: "Obrigação", valorCentavos: "36501", dataGasto, vencimento: "2026-11-10" })
    expect(await prisma.movimentacaoFinanceira.count({ where: { perfilId: f.E1 } })).toBe(0)
    const tituloId = a.resultado.tituloIds[0], pagar = { tipo: "PAGAR_TITULO", tituloId, carteiraId: f.conta(), formaPagamento: "pix", dataPagamento }
    await aplicarG004(f, { ...pagar, valorCentavos: "20000" })
    const saldo = await saldoTituloGasto(prisma, await prisma.contaPagarTitulo.findUniqueOrThrow({ where: { id: tituloId } }))
    expect(saldo).toEqual({ total: BigInt(36501), pago: BigInt(20000), restante: BigInt(16501) })
    const final = await aplicarG004(f, { ...pagar, quitar: true })
    expect(final.resultado.valorCentavos).toBe("16501")
    expect((await prisma.contaPagarTitulo.findUniqueOrThrow({ where: { id: tituloId } })).status).toBe("pago")
    expect(await prisma.contaPagarTitulo.count({ where: { perfilId: f.E1 } })).toBe(1)
    expect(await prisma.gasto.count({ where: { perfilId: f.E1 } })).toBe(1)
    const saidas = await prisma.movimentacaoFinanceira.aggregate({ where: { perfilId: f.E1, tipo: "saida" }, _sum: { valorCentavos: true } })
    expect(saidas._sum.valorCentavos?.toString()).toBe("36501")
  })
  it("duas parciais de R$40 têm IDs distintos; repetir uma não soma novamente", async () => {
    const f = await fixtureG004(), ctx = await f.contexto()
    const t = await gravarTituloFinanceiro(ctx, { natureza: "PAGAR", chave: "duas", descricao: "Duas parciais", valorCentavos: 20000, vencimento: "2026-11-01" })
    const proposta = { tipo: "PAGAR_TITULO", tituloId: t.id, valorCentavos: "4000", carteiraId: f.conta(), formaPagamento: "pix", dataPagamento }
    const a = await aplicarG004(f, proposta), b = await aplicarG004(f, proposta)
    expect(a.resultado.pagamentoId).not.toBe(b.resultado.pagamentoId)
    await aplicarOperacaoGasto(ctx, a.command)
    expect((await saldoTituloGasto(prisma, await prisma.contaPagarTitulo.findUniqueOrThrow({ where: { id: t.id } }))).pago).toBe(BigInt(8000))
  })
  it("chave/payload divergente conflita e grupo confirmado não aplica outra chave", async () => {
    const f = await fixtureG004(), a = await aplicarG004(f, pagoG004(f)), ctx = a.ctx
    const r = await prepararRevisaoGasto(ctx, { grupoChave: "outro", proposta: pagoG004(f, { valorCentavos: "4001" }) })
    const before = await estadoG004(f)
    await expect(aplicarOperacaoGasto(ctx, { revisaoId: r.id, versaoEsperada: 1, chave: a.command.chave })).rejects.toMatchObject({ code: "operacao_conteudo_divergente" })
    await expect(aplicarOperacaoGasto(ctx, { ...a.command, chave: "outra" })).rejects.toMatchObject({ code: "operacao_conteudo_divergente" })
    expect(await estadoG004(f)).toBe(before)
  })
  it("correção CAS encadeia revisão e cancelamento impede dinheiro", async () => {
    const f = await fixtureG004(), ctx = await f.contexto(), r = await prepararRevisaoGasto(ctx, { grupoChave: "corrigir", proposta: pagoG004(f) })
    const novo = await corrigirRevisaoGasto(ctx, { revisaoId: r.id, versaoEsperada: 1, proposta: pagoG004(f, { valorCentavos: "4100" }) })
    expect(novo).toMatchObject({ versao: 2, correcaoDeId: r.id })
    await expect(aplicarOperacaoGasto(ctx, { revisaoId: r.id, versaoEsperada: 1, chave: "antiga" })).rejects.toMatchObject({ code: "revisao_desatualizada" })
    await cancelarRevisaoGasto(ctx, { revisaoId: novo.id, versaoEsperada: 2 })
    await expect(aplicarOperacaoGasto(ctx, { revisaoId: novo.id, versaoEsperada: 2, chave: "nova" })).rejects.toMatchObject({ code: "revisao_desatualizada" })
    expect(await prisma.movimentacaoFinanceira.count({ where: { perfilId: f.E1 } })).toBe(0)
  })
  it("revisão expirada não confirma; revisão aplicada não aceita alteração silenciosa", async () => {
    const f = await fixtureG004(), ctx = await f.contexto(), expiraEm = new Date(Date.now() + 1500)
    const r = await prepararRevisaoGasto(ctx, { grupoChave: "expiracao", proposta: pagoG004(f), expiraEm: expiraEm.toISOString() })
    await new Promise(resolve => setTimeout(resolve, Math.max(0, expiraEm.getTime() - Date.now()) + 10))
    const before = await estadoG004(f)
    await expect(aplicarOperacaoGasto(ctx, { revisaoId: r.id, versaoEsperada: 1, chave: "expirou" })).rejects.toMatchObject({ code: "revisao_expirada" })
    expect(await estadoG004(f)).toBe(before)
    expect((await expirarRevisaoGasto(ctx, { revisaoId: r.id, versaoEsperada: 1 })).estado).toBe("EXPIRADA")
    const a = await aplicarG004(f, pagoG004(f))
    await expect(corrigirRevisaoGasto(ctx, { revisaoId: a.revisao.id, versaoEsperada: 1, proposta: pagoG004(f, { valorCentavos: "5000" }) })).rejects.toMatchObject({ code: "revisao_desatualizada" })
  })
  it("estorno parcial e total compensam o pagamento individual; replay é estável e fatos não mudam", async () => {
    const f = await fixtureG004(), a = await aplicarG004(f, pagoG004(f, { valorCentavos: "10000" }))
    const original = await prisma.pagamentoFinanceiro.findUniqueOrThrow({ where: { id: a.resultado.pagamentoId! } })
    const p = { tipo: "ESTORNAR_PAGAMENTO", pagamentoId: original.id, valorCentavos: "3000", dataPagamento, motivo: "Devolução parcial" }
    const b = await aplicarG004(f, p)
    expect(await aplicarOperacaoGasto(b.ctx, b.command)).toEqual(b.resultado)
    await aplicarG004(f, { ...p, valorCentavos: "7000" })
    expect(await prisma.pagamentoFinanceiro.findUniqueOrThrow({ where: { id: original.id } })).toEqual(original)
    expect((await prisma.carteiraFinanceira.findUniqueOrThrow({ where: { id: f.conta() } })).saldoAtualCentavos?.toString()).toBe("100000")
    await expect(aplicarG004(f, { ...p, valorCentavos: "1" })).rejects.toMatchObject({ code: "estorno_acima_pagamento" })
    const moves = await prisma.movimentacaoFinanceira.findMany({ where: { compensaMovimentacaoId: original.movimentoId } })
    expect(moves).toHaveLength(2)
    expect(moves.reduce((s, m) => s + Number(m.valorCentavos), 0)).toBe(10000)
  })
  it("ponte M1 estorna a parcial escolhida, não a soma da referência nem outro último após retry", async () => {
    const f = await fixtureG004(), ctx = await f.contexto(), t = await gravarTituloFinanceiro(ctx, {
      natureza: "PAGAR", chave: "legado", descricao: "Legado", valorCentavos: "20000", vencimento: dataGasto, carteiraId: f.conta() })
    const input = { storeId: f.L1, tipo: "pagar" as const, canal: "financeiro" as const, op: "parcial" as const, localKey: t.localKey!, valor: 40 }
    const a = await aplicarPagamentoLegado({ ...input, idempotencyKey: "m1-a" })
    await aplicarPagamentoLegado({ ...input, idempotencyKey: "m1-b" })
    const pedido = { localKey: t.localKey!, chave: randomUUID(), movimentoId: a.movimentoId!, valorCentavos: "1500" }
    const r = await estornarPagamentoHub(ctx, pedido), before = await estadoG004(f)
    expect((await prisma.pagamentoFinanceiro.findUniqueOrThrow({ where: { id: r.pagamentoId! } })).formaPagamento).toBe("nao_informado")
    expect((await prisma.movimentacaoFinanceira.findUniqueOrThrow({ where: { id: r.movimentoIds[0] } })).formaPagamento).toBe("nao_informado")
    expect(await estornarPagamentoHub(ctx, pedido)).toEqual(r)
    expect(await estadoG004(f)).toBe(before)
    expect((await saldoTituloGasto(prisma, await prisma.contaPagarTitulo.findUniqueOrThrow({ where: { id: t.id } }))).pago).toBe(BigInt(6500))
    expect(await prisma.pagamentoFinanceiro.count({ where: { perfilId: f.E1, tipo: "PAGAMENTO" } })).toBe(0)
  })
  it("PESSOAL é global e privado; clone, outro owner, outra loja e grant revogado recusam", async () => {
    const f = await fixtureG004(), ctx = await f.contexto(f.P1)
    const r = await aplicarG004(f, pagoG004(f, { carteiraId: f.conta(f.P1) }), "mesma-chave", f.P1)
    expect(await prisma.gasto.findUniqueOrThrow({ where: { id: r.resultado.gastoId! } })).toMatchObject({ storeId: null, perfilId: f.P1 })
    expect(await prisma.auditoriaFinanceira.count({ where: { storeId: f.L1 } })).toBe(0)
    f.login(f.U1, [f.L2])
    expect(await aplicarOperacaoGasto(ctx, r.command)).toEqual(r.resultado)
    await expect(aplicarOperacaoGasto({ ...ctx }, r.command)).rejects.toMatchObject({ code: "acesso_negado" })
    f.login(f.U2, [f.L1])
    await expect(aplicarOperacaoGasto(ctx, r.command)).rejects.toMatchObject({ code: "acesso_negado" })
    f.login()
    await expect(aplicarG004(f, pagoG004(f, { carteiraId: f.conta(f.E2) }))).rejects.toMatchObject({ code: "conta_indisponivel" })
    const e = await aplicarG004(f, pagoG004(f), "mesma-chave")
    expect(e.resultado.operacaoId).not.toBe(r.resultado.operacaoId)
    await prisma.perfilMembro.updateMany({ where: { perfilId: f.E1, adminUserId: f.U1 }, data: { revogadoEm: new Date() } })
    await expect(aplicarOperacaoGasto(e.ctx, e.command)).rejects.toMatchObject({ code: "acesso_negado" })
  })
  it("conta inativa aceita compensação individual histórica, mas recusa novo gasto", async () => {
    const f = await fixtureG004(), a = await aplicarG004(f, pagoG004(f))
    await prisma.carteiraFinanceira.update({ where: { id: f.conta() }, data: { ativo: false } })
    await expect(aplicarG004(f, pagoG004(f))).rejects.toMatchObject({ code: "conta_indisponivel" })
    const r = await aplicarG004(f, { tipo: "ESTORNAR_PAGAMENTO", pagamentoId: a.resultado.pagamentoId, valorCentavos: "4000", dataPagamento, motivo: "Estorno" })
    expect(r.resultado.valorCentavos).toBe("4000")
  })
  it("período fechado bloqueia data econômica; replay posterior não altera data nem duplica", async () => {
    const f = await fixtureG004(), a = await aplicarG004(f, pagoG004(f))
    await fecharDia(f.L1, dataGasto)
    expect(await aplicarOperacaoGasto(a.ctx, a.command)).toEqual(a.resultado)
    await expect(aplicarG004(f, pagoG004(f))).rejects.toMatchObject({ code: "periodo_fechado" })
    const m = await fecharMes(f.L2, 10, 2026)
    expect(m.snapshotDRE).toBeTruthy()
    await expect(aplicarG004(f, pagoG004(f, { carteiraId: f.conta(f.E2) }), randomUUID(), f.E2)).rejects.toMatchObject({ code: "periodo_fechado" })
  })
  it("fornecedor estrangeiro/ambíguo/documento inválido recusa; fornecedor válido fica no fato", async () => {
    const f = await fixtureG004()
    const a = await prisma.fornecedor.create({ data: { storeId: f.L1, name: "Homônimo", document: "529.982.247-25" } })
    const b = await prisma.fornecedor.create({ data: { storeId: f.L2, name: "Fornecedor" } })
    await prisma.fornecedor.create({ data: { storeId: f.L1, name: "Homônimo" } })
    await expect(aplicarG004(f, pagoG004(f, { fornecedorNome: "Homônimo" }))).rejects.toMatchObject({ code: "fornecedor_exige_escolha" })
    await expect(aplicarG004(f, pagoG004(f, { fornecedorId: b.id }))).rejects.toMatchObject({ code: "fornecedor_indisponivel" })
    await expect(aplicarG004(f, pagoG004(f, { fornecedorDocumento: "11111111111" }))).rejects.toMatchObject({ code: "documento_fornecedor_invalido" })
    const r = await aplicarG004(f, pagoG004(f, { fornecedorDocumento: "52998224725" }))
    expect((await prisma.gasto.findUniqueOrThrow({ where: { id: r.resultado.gastoId! } })).fornecedorId).toBe(a.id)
  })
  it("documento G003 compõe o mesmo commit e vínculo de título não autoriza nova despesa", async () => {
    const f = await fixtureG004(), ctx = await f.contexto(), storage = new DocumentoStorageFixture()
    const d = await registrarDocumentoGasto(ctx, { nomeArquivo: "fixture.txt", conteudo: Buffer.from("fixture G004"), proveniencia: "FIXTURE" }, storage)
    const a = await aplicarG004(f, pagoG004(f, { documentoId: d.id }))
    expect(await prisma.documentoVinculo.count({ where: { documentoId: d.id, movimentacaoId: a.resultado.movimentoIds[0] } })).toBe(1)
    const t = await gravarTituloFinanceiro(ctx, { natureza: "PAGAR", chave: "doc", descricao: "Título", valorCentavos: "1000", vencimento: dataGasto })
    await vincularDocumentoGasto(ctx, d.id, { tipo: "PAGAR", id: t.id })
    await expect(aplicarG004(f, pagoG004(f, { documentoId: d.id }))).rejects.toMatchObject({ code: "documento_ja_vinculado_titulo" })
  })
  it("SQL rejeita alteração de fatos, resultado, contadores e vínculo pessoal com storeId empresarial", async () => {
    const f = await fixtureG004(), a = await aplicarG004(f, pagoG004(f)), b = await aplicarG004(f, pagoG004(f))
    const original = await prisma.alocacaoPagamento.findFirstOrThrow({ where: { pagamentoId: a.resultado.pagamentoId! } }), before = await estadoG004(f)
    await expect(prisma.gasto.update({ where: { id: a.resultado.gastoId! }, data: { valorCentavos: "1" } })).rejects.toThrow()
    await expect(prisma.pagamentoFinanceiro.update({ where: { id: a.resultado.pagamentoId! }, data: { valorCentavos: "1" } })).rejects.toThrow()
    await expect(prisma.alocacaoPagamento.update({ where: { id: original.id }, data: { estornadoCentavos: "1" } })).rejects.toThrow()
    await expect(prisma.movimentacaoFinanceira.update({ where: { id: a.resultado.movimentoIds[0] }, data: { compensadoGastosCentavos: "1" } })).rejects.toThrow()
    await expect(prisma.financeiroOperacao.update({ where: { id: a.resultado.operacaoId }, data: { resultado: { adulterado: true } } })).rejects.toThrow()
    await expect(prisma.gastoRevisao.update({ where: { id: a.revisao.id }, data: { proposta: { adulterado: true } } })).rejects.toThrow()
    await expect(prisma.alocacaoPagamento.create({ data: { perfilId: f.E1, storeId: f.L1, pagamentoId: a.resultado.pagamentoId!, gastoId: b.resultado.gastoId!, valorCentavos: "1" } })).rejects.toThrow()
    await expect(prisma.cartaoInstrumento.create({ data: { perfilId: f.P1, storeId: f.L1, nome: "Forjado" } })).rejects.toThrow()
    expect(await estadoG004(f)).toBe(before)
  })
})
