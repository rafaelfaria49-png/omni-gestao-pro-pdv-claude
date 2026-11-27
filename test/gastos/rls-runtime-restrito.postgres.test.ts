/**
 * OMNI-GESTOR-MONEY-FOUNDATION-HARDENING-P0-002 — contrato de RLS com RUNTIME RESTRITO.
 *
 * O Prisma da aplicação conecta como papel NÃO dono, NOBYPASSRLS, só com GRANTs de DML
 * (GASTOS_RLS_TEST_DATABASE_URL). A preparação usa outro cliente como dono (GASTOS_RLS_OWNER_URL).
 * Prova, pelo código real G001/G002/G003: legado empresarial legível/gravável; linha pessoal
 * gravável e legível somente pelo dono revalidado; outro dono, outra loja e conexão sem contexto
 * não veem nada; contexto não vaza entre transações nem sob concorrência.
 * Pula sem as URLs (nunca usa .env). Exige loopback e banco gm_rls_app*.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { modulosSinteticos } from "@/test/gastos/sessao-modulos"

vi.mock("@/auth", () => ({ auth: vi.fn() }))

const RUNTIME = process.env.GASTOS_RLS_TEST_DATABASE_URL ?? ""
const OWNER = process.env.GASTOS_RLS_OWNER_URL ?? ""
function seguro(raw: string): boolean {
  try {
    const u = new URL(raw)
    return ["127.0.0.1", "localhost"].includes(u.hostname) && u.pathname.startsWith("/gm_rls_app")
  } catch { return false }
}

describe.skipIf(!RUNTIME || !OWNER)("RLS do Gestor Money com runtime restrito (PostgreSQL real)", () => {
  const L1 = "rls-L1", L2 = "rls-L2", U1 = "rls-U1", U2 = "rls-U2"
  const P1 = "rls-P1", P2 = "rls-P2", E1 = "rls-E1"
  let owner: import("@/generated/prisma").PrismaClient
  let prisma: typeof import("@/lib/prisma").prisma
  let auth: ReturnType<typeof vi.fn>
  const login = (id: string, stores: string[] = [L1]) => auth.mockResolvedValue({
    user: { id, role: "ADMIN", storeAccess: "restricted", allowedStoreIds: stores, storeModules: modulosSinteticos(stores), lojaId: stores[0] },
  })

  beforeAll(async () => {
    if (!seguro(RUNTIME) || !seguro(OWNER)) throw new Error("RLS: só PostgreSQL descartável em loopback (gm_rls_app*).")
    if (process.env.DATABASE_URL !== RUNTIME) throw new Error("RLS: DATABASE_URL precisa ser o runtime restrito.")
    const { PrismaClient } = await import("@/generated/prisma")
    owner = new PrismaClient({ datasources: { db: { url: OWNER } } })
    prisma = (await import("@/lib/prisma")).prisma
    auth = vi.mocked((await import("@/auth")).auth) as unknown as ReturnType<typeof vi.fn>
    const [id] = await prisma.$queryRaw<Array<{ usuario: string; dono: boolean; bypass: boolean; superuser: boolean }>>`
      SELECT current_user AS usuario, (SELECT tableowner = current_user FROM pg_tables WHERE tablename='movimentacoes_financeiras') AS dono,
        rolbypassrls AS bypass, rolsuper AS superuser FROM pg_roles WHERE rolname = current_user`
    expect(id).toMatchObject({ dono: false, bypass: false, superuser: false })
    // Idempotente: limpa a massa sintética de execuções anteriores (como dono, fora do RLS).
    await owner.movimentacaoFinanceira.deleteMany({ where: { OR: [{ id: { startsWith: "rls-" } }, { referenciaId: { startsWith: "rls-" } }] } })
    await owner.contaPagarTitulo.deleteMany({ where: { id: { startsWith: "rls-" } } })
    await owner.contaReceberTitulo.deleteMany({ where: { id: { startsWith: "rls-" } } })
    await owner.carteiraFinanceira.deleteMany({ where: { OR: [{ id: { startsWith: "rls-" } }, { perfilId: { in: [P1, P2] } }] } })
    await owner.store.createMany({ data: [{ id: L1, name: "RLS L1" }, { id: L2, name: "RLS L2" }], skipDuplicates: true })
    await owner.adminUser.createMany({ data: [U1, U2].map((u) => ({ id: u, email: `${u}@example.invalid`, password: "synthetic-only", role: "ADMIN", lojaId: L1 })), skipDuplicates: true })
    await owner.adminUserStore.createMany({ data: [{ adminUserId: U1, storeId: L1 }, { adminUserId: U2, storeId: L1 }], skipDuplicates: true })
    await owner.financeiroPerfil.createMany({ data: [
      { id: P1, tipo: "PESSOAL", ownerAdminUserId: U1 }, { id: P2, tipo: "PESSOAL", ownerAdminUserId: U2 },
      { id: E1, tipo: "EMPRESA", storeId: L1 },
    ], skipDuplicates: true })
    await owner.perfilMembro.createMany({ data: [{ perfilId: E1, storeId: L1, adminUserId: U1 }], skipDuplicates: true })
  })
  afterAll(async () => { await owner?.$disconnect() })

  async function contexto(perfilId: string, seletor: Record<string, string>) {
    const { requireFinanceiroPerfilAccess } = await import("@/lib/gastos/access")
    const r = await requireFinanceiroPerfilAccess({ perfilId, ...seletor })
    if (!r.ok) throw new Error(`contexto negado ${perfilId}`)
    return r.contexto
  }

  it("legado empresarial: o runtime restrito lê e grava sem contexto (flag desligada)", async () => {
    await prisma.carteiraFinanceira.create({ data: { id: "rls-legado-cart", storeId: L1, nome: "Caixa legado", tipo: "caixa" } })
    await prisma.movimentacaoFinanceira.create({ data: { id: "rls-legado-mov", storeId: L1, tipo: "entrada", valor: 10, origem: "pdv", referenciaId: "v1", carteiraId: "rls-legado-cart" } })
    expect(await prisma.movimentacaoFinanceira.count({ where: { storeId: L1 } })).toBeGreaterThanOrEqual(1)
  })

  it("PESSOAL: o dono revalidado grava e lê a própria conta; nada aparece sem contexto", async () => {
    login(U1)
    const { criarContaFinanceira } = await import("@/lib/gastos/contas")
    const { comLeituraFinanceira } = await import("@/lib/gastos/read-scope")
    const ctx = await contexto(P1, { tipo: "PESSOAL" })
    const conta = await criarContaFinanceira(ctx, { nome: "Conta pessoal U1", tipo: "banco", saldoInicialCentavos: "1000" })
    expect(conta).toMatchObject({ perfilId: P1, storeId: null })
    const lidas = await comLeituraFinanceira(ctx, (db) => db.carteiraFinanceira.findMany({ where: { storeId: null }, select: { id: true } }))
    expect(lidas.map((c) => c.id)).toEqual([conta.id])
    // Conexão do pool sem contexto (fora da transação do dono): nenhuma linha pessoal.
    expect(await prisma.carteiraFinanceira.count({ where: { storeId: null } })).toBe(0)
    expect(await prisma.financeiroPerfil.count({ where: { tipo: "PESSOAL" } })).toBe(0)
  })

  it("outro dono não vê nem obtém contexto do perfil alheio", async () => {
    login(U2)
    const { requireFinanceiroPerfilAccess } = await import("@/lib/gastos/access")
    expect((await requireFinanceiroPerfilAccess({ tipo: "PESSOAL", perfilId: P1 })).ok).toBe(false)
    const { comLeituraFinanceira } = await import("@/lib/gastos/read-scope")
    const ctx2 = await contexto(P2, { tipo: "PESSOAL" })
    const vistas = await comLeituraFinanceira(ctx2, (db) => db.carteiraFinanceira.findMany({ where: { storeId: null }, select: { perfilId: true } }))
    expect(vistas.every((c) => c.perfilId === P2)).toBe(true)
  })

  it("contexto EMPRESA (com grant) nunca enxerga linhas pessoais", async () => {
    login(U1)
    const { comLeituraFinanceira } = await import("@/lib/gastos/read-scope")
    const ctx = await contexto(E1, { tipo: "EMPRESA", storeId: L1 })
    expect(await comLeituraFinanceira(ctx, (db) => db.carteiraFinanceira.count({ where: { storeId: null } }))).toBe(0)
  })

  it("concorrência: duas transações de donos diferentes, em paralelo, veem só o próprio dono", async () => {
    const { declararDonoPessoalRls } = await import("@/lib/gastos/rls-contexto")
    const ler = (dono: string) => prisma.$transaction(async (tx) => {
      await declararDonoPessoalRls(tx, dono)
      await tx.$queryRaw`SELECT pg_sleep(0.3)::text AS pausa`
      return (await tx.carteiraFinanceira.findMany({ where: { storeId: null }, select: { perfilId: true } })).map((c) => c.perfilId)
    })
    const [a, b, nada] = await Promise.all([ler(U1), ler(U2), prisma.carteiraFinanceira.count({ where: { storeId: null } })])
    expect(a.every((p) => p === P1) && a.length > 0).toBe(true)
    expect(b.every((p) => p === P2)).toBe(true)
    expect(nada).toBe(0)
  })

  it("dono declarado não consegue gravar no perfil de outro dono", async () => {
    const { declararDonoPessoalRls } = await import("@/lib/gastos/rls-contexto")
    await expect(prisma.$transaction(async (tx) => {
      await declararDonoPessoalRls(tx, U1)
      await tx.carteiraFinanceira.create({ data: { storeId: null, perfilId: P2, nome: "invasão", tipo: "banco" } })
    })).rejects.toThrow()
    expect(await owner.carteiraFinanceira.count({ where: { perfilId: P2, nome: "invasão" } })).toBe(0)
  })

  it("estorno por identidade (#397): a entrada volta na conta do PAGAMENTO estornado, mesmo desativada", async () => {
    await owner.carteiraFinanceira.createMany({ data: [
      { id: "rls-cA", storeId: L1, nome: "Conta A", tipo: "banco" }, { id: "rls-cB", storeId: L1, nome: "Conta B", tipo: "banco" },
    ] })
    await owner.contaPagarTitulo.create({ data: { id: "rls-tp", storeId: L1, localKey: "rls-tp", descricao: "Fornecedor", valor: 300, status: "parcial", payload: {} } })
    await owner.movimentacaoFinanceira.create({ data: { id: "rls-m1", storeId: L1, tipo: "saida", valor: 100, origem: "pagar_parcial", referenciaId: "rls-tp", carteiraId: "rls-cA", createdAt: new Date("2026-11-01T10:00:00Z") } })
    await owner.movimentacaoFinanceira.create({ data: { id: "rls-m2", storeId: L1, tipo: "saida", valor: 50, origem: "pagar_parcial", referenciaId: "rls-tp", carteiraId: "rls-cB", createdAt: new Date("2026-11-02T10:00:00Z") } })
    await owner.carteiraFinanceira.update({ where: { id: "rls-cA" }, data: { ativo: false } })
    const historico = [{ tipo: "criacao" }, { tipo: "pagamento", valor: 100 }, { tipo: "pagamento", valor: 50 },
      { tipo: "estorno_pagamento", valor: 100, refHistoricoIndex: 1 }]
    const { estornarMovimentacaoDePagamentoPagar } = await import("@/lib/financeiro/services/movimentacoes-service")
    const r = await prisma.$transaction((tx) => estornarMovimentacaoDePagamentoPagar(tx, { storeId: L1, tituloId: "rls-tp", valor: 100, pagoRestante: 50, historico }))
    expect(r).toMatchObject({ valor: 100, divergente: false })
    const mov = await owner.movimentacaoFinanceira.findUniqueOrThrow({ where: { id: r.movimentacaoId! } })
    expect(mov).toMatchObject({ tipo: "entrada", origem: "estorno_pagar", valor: 100, carteiraId: "rls-cA" })
    await owner.movimentacaoFinanceira.deleteMany({ where: { referenciaId: "rls-tp" } })
    await owner.contaPagarTitulo.delete({ where: { id: "rls-tp" } })
    await owner.carteiraFinanceira.deleteMany({ where: { id: { in: ["rls-cA", "rls-cB"] } } })
  })


  it("estorno por referência nunca estorna mais que o líquido global (revisão P1-1)", async () => {
    await owner.carteiraFinanceira.create({ data: { id: "rls-cB2", storeId: L1, nome: "Conta B2", tipo: "banco" } })
    await owner.contaReceberTitulo.create({ data: { id: "rls-tr", storeId: L1, localKey: "rls-tr", descricao: "Venda a prazo", valor: 100, status: "parcial", payload: {} } })
    await owner.movimentacaoFinanceira.createMany({ data: [
      { id: "rls-r1", storeId: L1, tipo: "entrada", valor: 60, origem: "receber_parcial", referenciaId: "rls-tr", carteiraId: null, createdAt: new Date("2026-11-01T10:00:00Z") },
      { id: "rls-r2", storeId: L1, tipo: "entrada", valor: 40, origem: "receber_parcial", referenciaId: "rls-tr", carteiraId: "rls-cB2", createdAt: new Date("2026-11-02T10:00:00Z") },
      // estorno anterior do 1º pagamento lançado (fallback antigo) na conta do mais recente
      { id: "rls-r3", storeId: L1, tipo: "saida", valor: 60, origem: "estorno_receber", referenciaId: "rls-tr", carteiraId: "rls-cB2", createdAt: new Date("2026-11-03T10:00:00Z") },
    ] })
    const { estornarMovimentacaoPorReferencia } = await import("@/lib/financeiro/services/movimentacoes-service")
    expect(await estornarMovimentacaoPorReferencia(L1, "rls-tr", "receber")).toMatchObject({ ok: true, action: "created" })
    const estornos = await owner.movimentacaoFinanceira.aggregate({ where: { referenciaId: "rls-tr", origem: "estorno_receber" }, _sum: { valor: true } })
    expect(estornos._sum.valor).toBe(100) // 60 anterior + 40 agora — nunca 120
    expect(await estornarMovimentacaoPorReferencia(L1, "rls-tr", "receber")).toMatchObject({ ok: true, action: "skipped_idempotent" })
    await owner.movimentacaoFinanceira.deleteMany({ where: { referenciaId: "rls-tr" } })
    await owner.contaReceberTitulo.delete({ where: { id: "rls-tr" } })
    await owner.carteiraFinanceira.delete({ where: { id: "rls-cB2" } })
  })


  it("rollback de ativação: flag desligada não congela título adotado nem perfil EMPRESA desativado (revisão P1-2)", async () => {
    const { upsertContaReceber } = await import("@/lib/financeiro/services/contas-receber-service")
    const { createMovimentacaoEntradaFromReceber } = await import("@/lib/financeiro/services/movimentacoes-service")
    vi.stubEnv("GESTOR_MONEY_ENABLED", "true")
    const adotado = await upsertContaReceber({ storeId: L1, localKey: "rls-rb", descricao: "Adotado na ativação", valor: 50 })
    expect(adotado.perfilId).toBe(E1)
    vi.stubEnv("GESTOR_MONEY_ENABLED", "")
    try {
      const r1 = await createMovimentacaoEntradaFromReceber({ id: adotado.id, storeId: L1, descricao: adotado.descricao, cliente: adotado.cliente }, 10, { parcial: true, carteiraId: null, idempotenciaDoChamador: true })
      expect(r1).toMatchObject({ ok: true, action: "created" })
      await owner.financeiroPerfil.update({ where: { id: E1 }, data: { ativo: false } })
      const atualizado = await upsertContaReceber({ storeId: L1, localKey: "rls-rb", descricao: "Atualizado com perfil desativado", valor: 50 })
      expect(atualizado.descricao).toBe("Atualizado com perfil desativado")
      const r2 = await createMovimentacaoEntradaFromReceber({ id: adotado.id, storeId: L1, descricao: adotado.descricao, cliente: adotado.cliente }, 15, { parcial: true, carteiraId: null, idempotenciaDoChamador: true })
      expect(r2).toMatchObject({ ok: true, action: "created" })
      const movs = await owner.movimentacaoFinanceira.findMany({ where: { referenciaId: adotado.id }, select: { perfilId: true, valor: true } })
      expect(movs.map(m => [m.valor, m.perfilId]).sort()).toEqual([[10, E1], [15, E1]])
    } finally {
      await owner.financeiroPerfil.update({ where: { id: E1 }, data: { ativo: true } })
      vi.unstubAllEnvs()
      vi.stubEnv("GESTOR_MONEY_ENABLED", "true")
      await owner.movimentacaoFinanceira.deleteMany({ where: { referenciaId: adotado.id } })
      await owner.contaReceberTitulo.delete({ where: { id: adotado.id } })
    }
  })

  it("RLS runtime restrito: cartões e histórico de limites pessoais são isolados por dono e invisíveis sem contexto", async () => {
    login(U1)
    const { cadastrarCartaoGasto, consultarCartoesGasto, editarCartaoGasto } = await import("@/lib/gastos/cartoes")
    const ctxP1 = await contexto(P1, { tipo: "PESSOAL" })
    const card = await cadastrarCartaoGasto(ctxP1, { nome: "Cartão RLS U1", limiteCentavos: "200000", motivo: "RLS" })
    await editarCartaoGasto(ctxP1, { cartaoId: card.id, limiteCentavos: "250000", motivo: "Aumento RLS" })

    const [lidoU1] = await consultarCartoesGasto(ctxP1, { cartaoId: card.id })
    expect(lidoU1.limiteCentavos).toBe("250000")
    expect(lidoU1.historicoLimites).toHaveLength(2)

    // Sem contexto no pool restrito (NOBYPASSRLS): zero linhas pessoais de cartão ou histórico
    expect(await prisma.cartaoInstrumento.count({ where: { storeId: null } })).toBe(0)
    expect(await prisma.cartaoLimiteEvento.count({ where: { storeId: null } })).toBe(0)

    // Contexto EMPRESA não enxerga cartão nem eventos pessoais
    const ctxE1 = await contexto(E1, { tipo: "EMPRESA", storeId: L1 })
    expect(await consultarCartoesGasto(ctxE1)).toEqual([])

    // Outro dono (U2) não lê nem altera o cartão pessoal de U1
    login(U2)
    const ctxP2 = await contexto(P2, { tipo: "PESSOAL" })
    expect(await consultarCartoesGasto(ctxP2)).toEqual([])
    await expect(editarCartaoGasto(ctxP2, { cartaoId: card.id, limiteCentavos: "1" })).rejects.toMatchObject({ code: "cartao_indisponivel", status: 404 })
  })

})
