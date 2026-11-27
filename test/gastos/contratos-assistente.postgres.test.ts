/**
 * OMNI-GESTOR-MONEY-CONVERSATIONAL-CONTRACTS-FINAL-001 — contratos que o assistente (#417) consome.
 * PostgreSQL real G005 (papel não superusuário, NOBYPASSRLS). Só a sessão é fixture.
 */
import "./g005-fixtures"
import { afterAll, describe, expect, it } from "vitest"
import { randomUUID } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { aplicarOperacaoGasto } from "@/lib/gastos/apply"
import { criarCategoriaGasto } from "@/lib/gastos/categorias"
import { cadastrarCartaoGasto, cadastrarCicloGasto, planejarPagamentoFaturaGasto } from "@/lib/gastos/cartoes"
import { gravarTituloFinanceiro } from "@/lib/gastos/financeiro-scope"
import { consultarFinanceiro, filtroConsultaFinanceira } from "@/lib/gastos/query"
import { concederAcessoPerfil, listarAcessosPerfil, provisionarPerfilEmpresa, revogarAcessoPerfil } from "@/lib/gastos/membros"
import { aplicarG005, dataGasto, dataPagamento, estadoG005, fixtureG005 } from "./g005-fixtures"

afterAll(async () => { await prisma.$disconnect() })
const outubro = { dataInicio: "2026-10-01", dataFim: "2026-10-31" }
const saldo = async (id: string) => (await prisma.carteiraFinanceira.findUniqueOrThrow({ where: { id } })).saldoAtualCentavos?.toString()

describe("G004 receita e recebimento canônicos", () => {
  it.each(["PESSOAL", "EMPRESA"] as const)("RECEITA_RECEBIDA %s: uma entrada categorizada, sem fato/pagamento, idempotente", async (tipo) => {
    const f = await fixtureG005(), perfilId = tipo === "PESSOAL" ? f.P1 : f.E1, ctx = await f.contexto(perfilId)
    const cat = await criarCategoriaGasto(ctx, { nome: "Salário", natureza: "RECEITA" })
    const a = await aplicarG005(f, { tipo: "RECEITA_RECEBIDA", descricao: "Salário", valorCentavos: "350000", carteiraId: f.conta(perfilId),
      formaPagamento: "transferencia", dataPagamento, categoriaId: cat.id }, "receita", perfilId)
    expect(await aplicarOperacaoGasto(a.ctx, a.command)).toEqual(a.resultado)
    expect(a.resultado).toMatchObject({ gastoId: null, pagamentoId: null, tituloIds: [], valorCentavos: "350000" })
    const movs = await prisma.movimentacaoFinanceira.findMany({ where: { perfilId } })
    expect(movs.map((m) => [m.tipo, m.origem, m.valorCentavos?.toString(), m.categoriaId])).toEqual([["entrada", "receita", "350000", cat.id]])
    expect(await saldo(f.conta(perfilId))).toBe("450000")
    expect(await prisma.gasto.count({ where: { perfilId } })).toBe(0)
    const q = await consultarFinanceiro(ctx, filtroConsultaFinanceira({ ...outubro, categoriaId: cat.id }))
    expect([q.receitaRealizadaCentavos, q.despesaRealizadaCentavos]).toEqual(["350000", "0"])
    const despesa = await criarCategoriaGasto(ctx, { nome: "Mercado", natureza: "DESPESA" })
    await expect(aplicarG005(f, { tipo: "RECEITA_RECEBIDA", descricao: "x", valorCentavos: "1", carteiraId: f.conta(perfilId), formaPagamento: "pix",
      dataPagamento, categoriaId: despesa.id }, "receita-cat-errada", perfilId)).rejects.toMatchObject({ code: "categoria_indisponivel" })
  })

  it("RECEBER_TITULO: parcial 200 de 800 deixa 600; quitação zera; nunca recebe acima do aberto", async () => {
    const f = await fixtureG005(), ctx = await f.contexto()
    const t = await gravarTituloFinanceiro(ctx, { natureza: "RECEBER", chave: "cliente-800", descricao: "Cliente", valorCentavos: "80000", vencimento: "2026-10-30", carteiraId: f.conta() })
    const receber = (patch: Record<string, unknown>) => ({ tipo: "RECEBER_TITULO", tituloId: t.id, carteiraId: f.conta(), formaPagamento: "pix", dataPagamento, ...patch })
    const a = await aplicarG005(f, receber({ valorCentavos: "20000" }), "receber-200")
    expect(await aplicarOperacaoGasto(a.ctx, a.command)).toEqual(a.resultado) // repetir não recebe de novo
    let q = await consultarFinanceiro(ctx, filtroConsultaFinanceira(outubro))
    expect([q.receberAbertoCentavos, q.receitaRealizadaCentavos]).toEqual(["60000", "20000"])
    expect((await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("parcial")
    await expect(aplicarG005(f, receber({ valorCentavos: "60001" }), "receber-demais")).rejects.toMatchObject({ code: "valor_acima_saldo_titulo" })
    const final = await aplicarG005(f, receber({ quitar: true }), "receber-quitar")
    expect(final.resultado.valorCentavos).toBe("60000")
    q = await consultarFinanceiro(ctx, filtroConsultaFinanceira(outubro))
    expect([q.receberAbertoCentavos, q.receitaRealizadaCentavos]).toEqual(["0", "80000"])
    expect((await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("pago")
    expect(await prisma.movimentacaoFinanceira.count({ where: { receberTituloId: t.id } })).toBe(2)
    expect(await saldo(f.conta())).toBe("180000")
  })

  it("RECEBER_TITULO isola perfis: título EMPRESA não é recebido no PESSOAL e vice-versa", async () => {
    const f = await fixtureG005(), ctx = await f.contexto()
    const t = await gravarTituloFinanceiro(ctx, { natureza: "RECEBER", chave: "isolado", descricao: "Empresa", valorCentavos: "1000", vencimento: "2026-10-30", carteiraId: f.conta() })
    const antes = await estadoG005(f)
    await expect(aplicarG005(f, { tipo: "RECEBER_TITULO", tituloId: t.id, quitar: true, carteiraId: f.conta(f.P1), formaPagamento: "pix", dataPagamento },
      "cruzado", f.P1)).rejects.toMatchObject({ code: "titulo_indisponivel" })
    expect(await estadoG005(f)).toBe(antes)
  })
})

describe("PAGAR_FATURA para o assistente", () => {
  it("planejar 'pagar 150 da fatura' aloca nos títulos abertos do ciclo; aplicar recompõe exatamente", async () => {
    const f = await fixtureG005(), ctx = await f.contexto()
    const cartao = await cadastrarCartaoGasto(ctx, { nome: "Cartão assistente" })
    const ciclo = await cadastrarCicloGasto(ctx, { cartaoId: cartao.id, identificador: "2026-10", competencia: "2026-10", vencimento: "2026-10-31" })
    await aplicarG005(f, { tipo: "COMPRA_CREDITO", descricao: "Compra A", valorCentavos: "8000", dataGasto, cicloId: ciclo.id })
    await aplicarG005(f, { tipo: "COMPRA_CREDITO", descricao: "Compra B", valorCentavos: "12000", dataGasto, cicloId: ciclo.id })
    const plano = await planejarPagamentoFaturaGasto(ctx, { cicloId: ciclo.id, valorCentavos: "15000" })
    expect(plano.restanteCentavos).toBe("20000")
    expect(plano.alocacoes.reduce((s, a) => s + BigInt(a.valorCentavos), BigInt(0)).toString()).toBe("15000")
    const antes = await estadoG005(f)
    await expect(planejarPagamentoFaturaGasto(ctx, { cicloId: ciclo.id, valorCentavos: "20001" })).rejects.toMatchObject({ code: "valor_acima_saldo_fatura" })
    expect(await estadoG005(f)).toBe(antes) // planejar não escreve
    await aplicarG005(f, { tipo: "PAGAR_FATURA", cicloId: ciclo.id, carteiraId: f.conta(), formaPagamento: "pix", dataPagamento, alocacoes: plano.alocacoes })
    const resto = await planejarPagamentoFaturaGasto(ctx, { cicloId: ciclo.id, quitar: true })
    expect(resto).toMatchObject({ restanteCentavos: "5000", valorCentavos: "5000" })
    expect(await prisma.gasto.count({ where: { perfilId: f.E1 } })).toBe(2)
  })
})

describe("Inbox G006", () => {
  it("o CHECK aceita PROCESSADO_G008 além dos estados G006", async () => {
    const [r] = await prisma.$queryRaw<Array<{ def: string }>>`SELECT pg_get_constraintdef(oid) def FROM pg_constraint WHERE conname='g006_inbox_check'`
    expect(r.def).toContain("PROCESSADO_G008")
    expect(r.def).toContain("AGUARDANDO_VINCULO")
  })
})

describe("Acesso ao perfil EMPRESA (PerfilMembro)", () => {
  async function lojaNova() {
    const f = await fixtureG005(), loja = `${f.id}-L9`, admin = `${f.id}-A9`, gerente = `${f.id}-G9`, tecnico = `${f.id}-T9`
    await prisma.store.create({ data: { id: loja, name: "Loja sem perfil" } })
    await prisma.adminUser.createMany({ data: [[admin, "ADMIN"], [gerente, "GERENTE"], [tecnico, "TECNICO"]].map(([id, role]) => ({
      id, email: `${id}@example.invalid`, password: "synthetic-only", role, lojaId: loja })) })
    await prisma.adminUserStore.createMany({ data: [admin, gerente, tecnico].map((adminUserId) => ({ adminUserId, storeId: loja })) })
    return { f, loja, admin, gerente, tecnico }
  }

  it("provisionar cria o perfil e o 1º membro; conceder/revogar auditados; último membro protegido", async () => {
    const { f, loja, admin, gerente, tecnico } = await lojaNova()
    f.login(admin, [loja])
    const p = await provisionarPerfilEmpresa({ storeId: loja, motivo: "Ativação controlada" })
    expect(p).toMatchObject({ provisionado: true, acao: "CONCEDIDO" })
    expect(await provisionarPerfilEmpresa({ storeId: loja })).toMatchObject({ provisionado: false, acao: null }) // idempotente
    expect(await concederAcessoPerfil({ storeId: loja, adminUserId: gerente })).toMatchObject({ acao: "CONCEDIDO" })
    expect(await concederAcessoPerfil({ storeId: loja, adminUserId: gerente })).toMatchObject({ acao: null })
    await expect(concederAcessoPerfil({ storeId: loja, adminUserId: tecnico })).rejects.toMatchObject({ code: "destinatario_sem_permissao" })
    await expect(concederAcessoPerfil({ storeId: loja, adminUserId: f.U2 })).rejects.toMatchObject({ code: "destinatario_sem_vinculo_loja" })
    expect(await revogarAcessoPerfil({ storeId: loja, adminUserId: gerente, motivo: "Saiu da equipe" })).toMatchObject({ acao: "REVOGADO" })
    await expect(revogarAcessoPerfil({ storeId: loja, adminUserId: admin })).rejects.toMatchObject({ code: "ultimo_membro" })
    expect(await concederAcessoPerfil({ storeId: loja, adminUserId: gerente })).toMatchObject({ acao: "REATIVADO" })
    const lista = await listarAcessosPerfil({ storeId: loja })
    expect(lista.eventos.map((e) => e.acao)).toEqual(["PROVISIONADO", "CONCEDIDO", "CONCEDIDO", "REVOGADO", "REATIVADO"])
    // Trilha imutável no banco.
    await expect(prisma.perfilMembroEvento.updateMany({ where: { perfilId: p.perfilId }, data: { motivo: "adulterado" } })).rejects.toThrow()
    await expect(prisma.perfilMembroEvento.deleteMany({ where: { perfilId: p.perfilId } })).rejects.toThrow()
  })

  it("GERENTE não concede; ADMIN de outra loja ou sem vínculo não provisiona; ADMIN não-membro não concede", async () => {
    const { f, loja, admin, gerente } = await lojaNova()
    f.login(gerente, [loja])
    await expect(provisionarPerfilEmpresa({ storeId: loja })).rejects.toMatchObject({ code: "acesso_negado" })
    f.login(admin, [f.L1]) // sessão sem a loja
    await expect(provisionarPerfilEmpresa({ storeId: loja })).rejects.toMatchObject({ code: "acesso_negado" })
    f.login(admin, [loja]); await provisionarPerfilEmpresa({ storeId: loja })
    // Outro ADMIN vinculado mas não membro: depois do 1º membro, só membro concede.
    const outro = `${f.id}-A8`
    await prisma.adminUser.create({ data: { id: outro, email: `${outro}@example.invalid`, password: "synthetic-only", role: "ADMIN", lojaId: loja } })
    await prisma.adminUserStore.create({ data: { adminUserId: outro, storeId: loja } })
    f.login(outro, [loja])
    await expect(concederAcessoPerfil({ storeId: loja, adminUserId: outro })).rejects.toMatchObject({ code: "acesso_negado" })
    await expect(provisionarPerfilEmpresa({ storeId: loja })).rejects.toMatchObject({ code: "acesso_negado" })
    expect(await prisma.perfilMembro.count({ where: { storeId: loja, revogadoEm: null } })).toBe(1)
  })

  it("concessões concorrentes do mesmo usuário geram UM membro e UM evento", async () => {
    const { f, loja, admin, gerente } = await lojaNova()
    f.login(admin, [loja]); const p = await provisionarPerfilEmpresa({ storeId: loja })
    const r = await Promise.allSettled(Array.from({ length: 4 }, () => concederAcessoPerfil({ storeId: loja, adminUserId: gerente, motivo: randomUUID().slice(0, 8) })))
    expect(r.every((x) => x.status === "fulfilled")).toBe(true)
    expect(await prisma.perfilMembro.count({ where: { perfilId: p.perfilId, adminUserId: gerente } })).toBe(1)
    expect(await prisma.perfilMembroEvento.count({ where: { perfilId: p.perfilId, adminUserId: gerente } })).toBe(1)
  })
})
