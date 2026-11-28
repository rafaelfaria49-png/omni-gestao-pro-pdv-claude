/** Só auth() é substituído; guards, serviços, rotas e PostgreSQL são reais. */
import { modulosSinteticos } from "@/test/gastos/sessao-modulos"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { requireFinanceiroPerfilAccess } from "@/lib/gastos/access"
import { criarContaFinanceira, definirContaFinanceiraAtiva } from "@/lib/gastos/contas"
import { criarCategoriaGasto, definirCategoriaGastoAtiva } from "@/lib/gastos/categorias"
import { criarMovimentoFinanceiro, emTransacaoFinanceira, gravarTituloFinanceiro } from "@/lib/gastos/financeiro-scope"
import { upsertContaPagar, registrarPagamentoParcialContaPagar, cancelContaPagar, liquidarContaPagar, estornarContaPagar } from "@/lib/financeiro/services/contas-pagar-service"
import { upsertContaReceber, registrarPagamentoParcial, cancelContaReceber, estornarContaReceber } from "@/lib/financeiro/services/contas-receber-service"
import { aplicarPagamentoLegado, createMovimentacaoSaidaFromPagar, createMovimentacaoEntradaFromReceber, createMovimentacao, createMovimentacaoSaidaFromOmniAgent, estornarMovimentacaoPorReferencia } from "@/lib/financeiro/services/movimentacoes-service"
import { criarCarteira, recalcularSaldoCarteira, transferirEntreCarteiras } from "@/lib/financeiro/services/carteiras-service"
import { upsertVendaInTransaction } from "@/lib/ops-upsert-venda"
import { upsertContaReceberFromOS } from "@/lib/financeiro/adapters/os-faturamento"
import { executarRecebimentoLote, validarRecebimentoLote } from "@/lib/financeiro/services/recebimento-lote-service"
import { persistirImportacao } from "@/lib/importador-avancado/persistidor"
import { POST as pagarPersistRoute } from "@/app/api/ops/contas-pagar-persist/route"
import { POST as receberPersistRoute } from "@/app/api/ops/contas-receber-persist/route"

const config = vi.hoisted(() => {
  const raw = process.env.GASTOS_G002_TEST_DATABASE_URL
  const url = new URL(raw ?? "postgresql://gastos_g002@127.0.0.1:55494/gastos_g002_test")
  if (url.protocol !== "postgresql:" || url.hostname !== "127.0.0.1" || url.port !== "55494"
    || url.pathname !== "/gastos_g002_test" || url.username !== "gastos_g002" || url.search !== "") {
    throw new Error("G002 recusa banco fora do cluster descartável identificado.")
  }
  return { url: url.toString(), queryCount: 0 }
})
vi.mock("@/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/prisma", async () => {
  const { PrismaClient } = await import("@/generated/prisma")
  const client = new PrismaClient({ datasources: { db: { url: config.url } }, log: [{ emit: "event", level: "query" }] })
  client.$on("query", () => { config.queryCount++ })
  return { prisma: client, prismaEnsureConnected: () => client.$connect() }
})

const L1 = "g002-fixture-L1", L2 = "g002-fixture-L2", L3 = "g002-fixture-L3"
const U1 = "g002-fixture-U1", U2 = "g002-fixture-U2"
const E1 = "g002-fixture-E1", E2 = "g002-fixture-E2", P1 = "g002-fixture-P1", P2 = "g002-fixture-P2"
const F1 = "g002-fixture-F1", F2 = "g002-fixture-F2"
const stores = [L1, L2, L3], perfis = [E1, E2, P1, P2]
const scope = { OR: [{ storeId: { in: stores } }, { perfilId: { in: perfis } }] }
function login(id = U1, allowedStoreIds = stores) {
  vi.mocked(auth).mockResolvedValue({ user: { id, role: "ADMIN", storeAccess: "restricted", allowedStoreIds, storeModules: modulosSinteticos(allowedStoreIds), lojaId: L1 } } as never)
}
async function context(perfilId = P1, storeId?: string) {
  const access = await requireFinanceiroPerfilAccess(storeId ? { tipo: "EMPRESA", perfilId, storeId } : { tipo: "PESSOAL", perfilId }, "edit")
  expect(access.ok).toBe(true)
  if (!access.ok) throw new Error("Contexto da fixture negado")
  return access.contexto
}
const conta = (ctx: unknown, nome = "Conta") => criarContaFinanceira(ctx, { nome, tipo: "banco", saldoInicialCentavos: "10000" })
const categoria = (ctx: unknown) => criarCategoriaGasto(ctx, { nome: "Alimentação", natureza: "DESPESA" })
const titulo = (ctx: unknown, extra: Record<string, unknown> = {}) => gravarTituloFinanceiro(ctx, {
  natureza: "PAGAR", chave: "comprovante-1", descricao: "Despesa fixture", valorCentavos: "36501", vencimento: "2026-10-25", ...extra,
})
// Reconciliação main: os snapshots legados exigem autoridade de plataforma (requireModuleApi "platform").
// Só a chamada da rota recebe essa flag na MESMA sessão sintética; as asserções de escopo não mudam.
async function comoPlataforma<T>(fn: () => Promise<T>): Promise<T> {
  const anterior = vi.mocked(auth).getMockImplementation() as unknown as (() => Promise<unknown>) | undefined
  const sessao = (await anterior?.()) as { user: Record<string, unknown> } | null
  vi.mocked(auth).mockResolvedValue({ ...sessao, user: { ...sessao?.user, platformAuthority: true } } as never)
  try { return await fn() } finally { if (anterior) vi.mocked(auth).mockImplementation(anterior as never) }
}
const pagarPersist = (req: Request) => comoPlataforma(() => pagarPersistRoute(req))
const receberPersist = (req: Request) => comoPlataforma(() => receberPersistRoute(req))
const request = (storeId: string, rows: unknown[]) => new Request("http://localhost/api/ops/contas-pagar-persist", {
  method: "POST", headers: { "content-type": "application/json", "x-assistec-loja-id": storeId }, body: JSON.stringify({ rows }),
})
async function clearWrites() {
  await prisma.itemVenda.deleteMany({ where: { venda: { storeId: { in: stores } } } })
  await prisma.venda.deleteMany({ where: { storeId: { in: stores } } })
  await prisma.ordemServico.deleteMany({ where: { storeId: { in: stores } } })
  await prisma.caixaOperacao.deleteMany({ where: { storeId: { in: stores } } })
  await prisma.sessaoCaixa.deleteMany({ where: { storeId: { in: stores } } })
  await prisma.movimentacaoFinanceira.deleteMany({ where: scope })
  await prisma.contaPagarTitulo.deleteMany({ where: scope })
  await prisma.contaReceberTitulo.deleteMany({ where: scope })
  await prisma.categoriaGasto.deleteMany({ where: { perfilId: { in: perfis } } })
  await prisma.carteiraFinanceira.deleteMany({ where: scope })
}

describe.skipIf(!process.env.GASTOS_G002_TEST_DATABASE_URL)("G002 writers PostgreSQL real", () => {
  beforeAll(async () => {
    const [identity] = await prisma.$queryRaw<Array<{ database: string; user: string; port: number; rolsuper: boolean; rolbypassrls: boolean }>>`
      SELECT current_database() AS database, current_user AS user, inet_server_port() AS port, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`
    expect(identity).toMatchObject({ database: "gastos_g002_test", user: "gastos_g002", port: 55494, rolsuper: false, rolbypassrls: false })
    const owners = await prisma.$queryRaw<Array<{ tableowner: string }>>`SELECT tableowner FROM pg_tables WHERE tablename IN ('financeiro_perfis','categorias_gastos','carteiras_financeiras','contas_pagar_titulos','contas_receber_titulos','movimentacoes_financeiras')`
    expect(owners).toHaveLength(6)
    expect(owners.every(row => row.tableowner === identity.user)).toBe(true)
    console.info("G002_APP_IDENTITY_OWNER_BYPASS_RLS", JSON.stringify(identity))
    expect(await prisma.store.count()).toBe(0)
    await prisma.store.createMany({ data: stores.map(id => ({ id, name: "Fixture G002" })) })
    await prisma.adminUser.createMany({ data: [U1, U2].map(id => ({ id, email: `${id}@example.invalid`, password: "synthetic-only", lojaId: L1, role: "ADMIN" })) })
    await prisma.financeiroPerfil.createMany({ data: [
      { id: E1, tipo: "EMPRESA", storeId: L1 }, { id: E2, tipo: "EMPRESA", storeId: L2 },
      { id: P1, tipo: "PESSOAL", ownerAdminUserId: U1 }, { id: P2, tipo: "PESSOAL", ownerAdminUserId: U2 },
    ] })
    await prisma.fornecedor.createMany({ data: [{ id: F1, storeId: L1, name: "Fornecedor" }, { id: F2, storeId: L2, name: "Fornecedor" }] })
  })

  beforeEach(async () => {
    await clearWrites()
    await prisma.perfilMembro.deleteMany({ where: { storeId: { in: stores } } })
    await prisma.financeiroPerfil.deleteMany({ where: { storeId: L3 } })
    await prisma.financeiroPerfil.updateMany({ where: { id: { in: perfis } }, data: { ativo: true } })
    await prisma.adminUser.updateMany({ where: { id: { in: [U1, U2] } }, data: { active: true, role: "ADMIN" } })
    await prisma.fornecedor.updateMany({ where: { id: { in: [F1, F2] } }, data: { active: true } })
    await prisma.adminUserStore.createMany({ data: [
      ...stores.map(storeId => ({ adminUserId: U1, storeId })), { adminUserId: U2, storeId: L1 },
    ], skipDuplicates: true })
    await prisma.perfilMembro.createMany({ data: [
      { perfilId: E1, storeId: L1, adminUserId: U1 }, { perfilId: E1, storeId: L1, adminUserId: U2 },
      { perfilId: E2, storeId: L2, adminUserId: U1 },
    ] })
    login()
  })
  afterAll(async () => {
    await clearWrites()
    await prisma.perfilMembro.deleteMany({ where: { storeId: { in: stores } } })
    await prisma.financeiroPerfil.deleteMany({ where: { OR: [{ id: { in: perfis } }, { storeId: { in: stores } }] } })
    await prisma.fornecedor.deleteMany({ where: { id: { in: [F1, F2] } } })
    await prisma.adminUserStore.deleteMany({ where: { adminUserId: { in: [U1, U2] } } })
    await prisma.adminUser.deleteMany({ where: { id: { in: [U1, U2] } } })
    await prisma.store.deleteMany({ where: { id: { in: stores } } })
    expect(await prisma.financeiroPerfil.count()).toBe(0)
    await prisma.$disconnect()
  })

  it("dois administradores na mesma loja conservam pessoal privado e empresa compartilhada", async () => {
    const c1 = await context(), ce1 = await context(E1, L1)
    const cp1 = await conta(c1), cg = await conta(ce1)
    login(U2)
    expect((await requireFinanceiroPerfilAccess({ tipo: "PESSOAL", perfilId: P1 }, "edit")).ok).toBe(false)
    const c2 = await context(P2), ce2 = await context(E1, L1)
    await expect(titulo(c2, { carteiraId: cp1.id })).rejects.toThrow()
    const t = await titulo(ce2, { carteiraId: cg.id })
    expect(t).toMatchObject({ perfilId: E1, storeId: L1, carteiraId: cg.id })
  })

  it("o mesmo pessoal permanece após troca/perda de lojas; company IDs não são herdados", async () => {
    const cp = await context(), c = await conta(cp)
    await prisma.adminUserStore.deleteMany({ where: { adminUserId: U1 } })
    login(U1, [])
    const same = await context()
    expect(same.perfilId).toBe(cp.perfilId)
    const t = await titulo(same, { carteiraId: c.id })
    expect(t).toMatchObject({ perfilId: P1, storeId: null, localKey: null })
    expect((await requireFinanceiroPerfilAccess({ tipo: "EMPRESA", perfilId: E1, storeId: L1 }, "edit")).ok).toBe(false)
  })

  it("um usuário em duas lojas grava contas e títulos em escopos empresariais distintos", async () => {
    const a = await context(E1, L1), b = await context(E2, L2)
    const ca = await conta(a), cb = await conta(b)
    const ta = await titulo(a, { carteiraId: ca.id }), tb = await titulo(b, { carteiraId: cb.id })
    expect(ta.perfilId).toBe(E1); expect(tb.perfilId).toBe(E2)
    await expect(titulo(a, { carteiraId: cb.id })).rejects.toThrow()
    expect(ta.id).not.toBe(tb.id)
  })

  it("writer novo recusa ausência, JSON, clone, outro dono, usuário inativo e membership revogada", async () => {
    const c = await context(), e = await context(E1, L1)
    await expect(conta(undefined)).rejects.toThrow()
    await expect(conta(JSON.parse(JSON.stringify(c)))).rejects.toThrow()
    await expect(conta({ ...c })).rejects.toThrow()
    login(U2)
    await expect(conta(c)).rejects.toThrow()
    login()
    await prisma.adminUser.update({ where: { id: U1 }, data: { active: false } })
    await expect(conta(c)).rejects.toThrow()
    await prisma.adminUser.update({ where: { id: U1 }, data: { active: true } })
    await prisma.perfilMembro.updateMany({ where: { perfilId: E1, adminUserId: U1 }, data: { revogadoEm: new Date() } })
    await expect(conta(e)).rejects.toThrow()
    expect(await prisma.carteiraFinanceira.count()).toBe(0)
  })

  it("contas/categorias inativas ou estrangeiras e natureza incompatível são rejeitadas", async () => {
    const c = await context(), e = await context(E1, L1)
    const cp = await conta(c), ce = await conta(e), cat = await categoria(c), catE = await categoria(e)
    await expect(titulo(c, { carteiraId: ce.id })).rejects.toThrow()
    await expect(titulo(c, { categoriaId: catE.id })).rejects.toThrow()
    await definirContaFinanceiraAtiva(c, { id: cp.id, ativo: false })
    await expect(titulo(c, { carteiraId: cp.id })).rejects.toThrow()
    await definirCategoriaGastoAtiva(c, { id: cat.id, ativo: false })
    await expect(titulo(c, { categoriaId: cat.id })).rejects.toThrow()
    const receita = await criarCategoriaGasto(c, { nome: "Salário", natureza: "RECEITA" })
    await expect(titulo(c, { categoriaId: receita.id })).rejects.toThrow()
    expect(await prisma.contaPagarTitulo.count()).toBe(0)
  })

  it("FK/checagem real protege pessoal sem storeId contra outra conta pessoal e categoria empresarial", async () => {
    const p1 = await context(), e = await context(E1, L1), ec = await categoria(e)
    login(U2); const p2 = await context(P2), conta2 = await conta(p2); login()
    await expect(prisma.$executeRaw`INSERT INTO movimentacoes_financeiras (id,"perfilId","storeId",tipo,valor,"carteiraId") VALUES ('g002-fixture-forged',${P1},NULL,'saida',1,${conta2.id})`).rejects.toMatchObject({ code: "P2010", meta: { code: "23514" } })
    await expect(prisma.$executeRaw`INSERT INTO contas_pagar_titulos (id,"perfilId","storeId","identidadePessoal",valor,"categoriaId","updatedAt") VALUES ('g002-fixture-forged',${P1},NULL,${`gastos:pessoal:${P1}:forged`},1,${ec.id},now())`).rejects.toMatchObject({ code: "P2010", meta: { code: "23514" } })
    await expect(titulo(p1, { fornecedorId: F1 })).rejects.toThrow()
    await expect(titulo(p1, { storeId: L1 })).rejects.toThrow()
    const pessoalReceber = await gravarTituloFinanceiro(p1, { natureza: "RECEBER", chave: "receber-privado", descricao: "Privado", valorCentavos: "100", vencimento: "2026-10-25" })
    await expect(prisma.$executeRaw`INSERT INTO vendas (id,"storeId","pedidoId","contaReceberTituloId") VALUES ('g002-fixture-forged-sale',${L1},'g002-fixture-forged-pedido',${pessoalReceber.id})`).rejects.toMatchObject({ code: "P2010", meta: { code: "23514" } })
    expect(await prisma.contaPagarTitulo.count()).toBe(0)
  })

  it("movimento exige conta explícita, título ativo e mesmo perfil, sem aplicar baixa G004", async () => {
    const p = await context(), c = await conta(p), t = await titulo(p, { carteiraId: c.id })
    const input = { tipo: "saida", descricao: "Parcial", valorCentavos: "20000", formaPagamento: "pix", carteiraId: c.id, pagarTituloId: t.id }
    const m = await criarMovimentoFinanceiro(p, input)
    expect(m).toMatchObject({ perfilId: P1, storeId: null, pagarTituloId: t.id, carteiraId: c.id, formaPagamento: "pix", valor: 200 })
    expect(m.valorCentavos?.toString()).toBe("20000")
    expect(() => JSON.stringify(m)).not.toThrow()
    expect((await prisma.contaPagarTitulo.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("pendente")
    expect((await prisma.carteiraFinanceira.findUniqueOrThrow({ where: { id: c.id } })).saldoAtual).toBe(100)
    login(U2); const estrangeiro = await titulo(await context(P2)); login()
    await expect(criarMovimentoFinanceiro(p, { ...input, pagarTituloId: estrangeiro.id })).rejects.toThrow()
    await expect(criarMovimentoFinanceiro(p, { ...input, carteiraId: undefined })).rejects.toThrow()
    await prisma.contaPagarTitulo.update({ where: { id: t.id }, data: { ativo: false } })
    await expect(criarMovimentoFinanceiro(p, input)).rejects.toThrow()
  })

  it("fornecedor estrangeiro/inativo e perfil empresarial inativo não são aceitos", async () => {
    const e = await context(E1, L1)
    await expect(titulo(e, { fornecedorId: F2 })).rejects.toThrow()
    await prisma.fornecedor.update({ where: { id: F1 }, data: { active: false } })
    await expect(titulo(e, { fornecedorId: F1 })).rejects.toThrow()
    await prisma.financeiroPerfil.create({ data: { tipo: "EMPRESA", storeId: L3, ativo: false } })
    await expect(upsertContaPagar({ storeId: L3, localKey: "perfil-inativo", valor: 10 })).rejects.toThrow()
    expect(await prisma.perfilMembro.count({ where: { storeId: L3 } })).toBe(0)
    expect(await prisma.contaPagarTitulo.count()).toBe(0)
  })

  it("namespace pessoal não altera localKey empresarial; repetição exata mantém ID e payload diferente conflita", async () => {
    const p = await context(), t1 = await titulo(p), t2 = await titulo(p)
    expect(t1.id).toBe(t2.id)
    expect(t1.identidadePessoal).toBe(`gastos:pessoal:${P1}:comprovante-1`)
    expect(t1.localKey).toBeNull()
    await expect(titulo(p, { valorCentavos: "20000" })).rejects.toThrow()
    const a = await upsertContaPagar({ storeId: L1, localKey: "mesma-chave", valor: 10 })
    const b = await upsertContaPagar({ storeId: L2, localKey: "mesma-chave", valor: 10 })
    expect(a.localKey).toBe("mesma-chave"); expect(b.localKey).toBe("mesma-chave")
    expect(a.id).not.toBe(b.id); expect(a.perfilId).toBe(E1); expect(b.perfilId).toBe(E2)
  })

  it("precisão nova exata e legado anômalo são preservados com sinalização explícita", async () => {
    const p = await context(), t = await titulo(p)
    expect(t.valor).toBe(365.01); expect(t.valorCentavos?.toString()).toBe("36501")
    const alto = await titulo(p, { chave: "valor-alto", valorCentavos: "13499999986" })
    expect(alto.valorCentavos?.toString()).toBe("13499999986")
    expect(alto.valor).toBe(134999999.86)
    await expect(titulo(p, { chave: "invalido", valorCentavos: "0.5" })).rejects.toThrow()
    const legacy = await upsertContaPagar({ storeId: L1, localKey: "anomalia", valor: 0.005 })
    expect(legacy).toMatchObject({ valor: 0.005, valorCentavos: null, valorOriginalLegado: 0.005, precisaoStatus: "ANOMALIA_LEGADO" })
    const binary = await upsertContaReceber({ storeId: L1, localKey: "binary", valor: 0.1 + 0.2 })
    expect(binary.valor).toBeCloseTo(0.3, 12); expect(binary.valorCentavos?.toString()).toBe("30")
  })

  it("rotas legadas sem perfil continuam empresariais e não aceitam owner do snapshot", async () => {
    const a = await pagarPersist(request(L1, [{ id: "legacy-api", valor: 10, perfilId: P1, ownerAdminUserId: U2 }]))
    const b = await receberPersist(request(L1, [{ id: "legacy-api", valor: 20, perfilId: P2, ownerAdminUserId: U2 }]))
    expect(a.status).toBe(200); expect(b.status).toBe(200)
    for (const row of [await prisma.contaPagarTitulo.findUniqueOrThrow({ where: { storeId_localKey: { storeId: L1, localKey: "legacy-api" } } }),
      await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { storeId_localKey: { storeId: L1, localKey: "legacy-api" } } })]) {
      expect(row).toMatchObject({ storeId: L1, perfilId: E1 })
      expect(row.payload).not.toHaveProperty("perfilId"); expect(row.payload).not.toHaveProperty("ownerAdminUserId")
    }
    login(U2, [L1])
    // Usuário restrito (sem plataforma) nunca grava snapshot — nem da própria loja, nem de outra.
    expect((await pagarPersistRoute(request(L2, [{ id: "forjado", valor: 10 }]))).status).toBe(403)
    expect(await prisma.contaPagarTitulo.count({ where: { localKey: "forjado" } })).toBe(0)
  })

  it("provisionamento concorrente cria um único perfil empresarial e nenhum membership", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => pagarPersist(request(L3, [{ id: `concorrente-${i}`, valor: i + 1 }]))))
    expect(results.map(r => r.status)).toEqual(Array(8).fill(200))
    const perfil = await prisma.financeiroPerfil.findUniqueOrThrow({ where: { storeId: L3 } })
    expect(await prisma.contaPagarTitulo.count({ where: { storeId: L3, perfilId: perfil.id } })).toBe(8)
    expect(await prisma.perfilMembro.count({ where: { perfilId: perfil.id } })).toBe(0)
    expect((await requireFinanceiroPerfilAccess({ tipo: "EMPRESA", perfilId: perfil.id, storeId: L3 }, "edit")).ok).toBe(false)
  })

  it("falha posterior ao provisionamento desfaz perfil e título na mesma transação", async () => {
    await expect(prisma.$transaction(async tx => {
      const row = await upsertContaPagar({ storeId: L3, localKey: "rollback", valor: 10, db: tx })
      // O hint opcional de snapshot é ignorado com aviso (A1); uma associação
      // efetiva estrangeira continua proibida pelo banco e reverte a unidade.
      await tx.$executeRaw`UPDATE contas_pagar_titulos SET "fornecedorId" = ${F1} WHERE id = ${row.id}`
    })).rejects.toMatchObject({ meta: { code: "23514" } })
    expect(await prisma.financeiroPerfil.findUnique({ where: { storeId: L3 } })).toBeNull()
    expect(await prisma.contaPagarTitulo.count({ where: { storeId: L3 } })).toBe(0)
    expect(await prisma.perfilMembro.count({ where: { storeId: L3 } })).toBe(0)
  })

  it("reimportação após pagamento não apaga fatos, valor principal ou saldo; parciais iguais continuam legítimas", async () => {
    const t = await upsertContaPagar({ storeId: L1, localKey: "pago-reimportado", valor: 100, payloadPatch: { origem: "importado" }, replacePayload: true })
    for (let i = 0; i < 2; i++) {
      expect((await registrarPagamentoParcialContaPagar({ storeId: L1, id: t.id, valorPago: 20 })).ok).toBe(true)
      expect((await createMovimentacaoSaidaFromPagar(t, 20, { parcial: true, idempotenciaDoChamador: true })).ok).toBe(true)
    }
    const reimported = await upsertContaPagar({ storeId: L1, localKey: t.localKey!, valor: 1, status: "pendente", payloadPatch: { historico: [], perfilId: P1 }, replacePayload: true })
    expect(reimported).toMatchObject({ id: t.id, valor: 100, status: "parcial", perfilId: E1 })
    expect((reimported.payload as { historico: unknown[] }).historico).toHaveLength(2)
    const movements = await prisma.movimentacaoFinanceira.findMany({ where: { referenciaId: t.id } })
    expect(movements).toHaveLength(2); expect(movements.reduce((a, m) => a + m.valor, 0)).toBe(40)
    expect(movements.every(m => m.pagarTituloId === t.id && m.perfilId === E1)).toBe(true)
  })

  it("recebimento parcial repetido e snapshot preservam histórico servidor e saldo restante", async () => {
    const t = await upsertContaReceber({ storeId: L1, localKey: "recebido-reimportado", valor: 100 })
    for (let i = 0; i < 2; i++) {
      expect((await registrarPagamentoParcial({ storeId: L1, id: t.id, valorPago: 20 })).ok).toBe(true)
      expect((await createMovimentacaoEntradaFromReceber(t, 20, { parcial: true, idempotenciaDoChamador: true })).ok).toBe(true)
    }
    const result = await upsertContaReceber({ storeId: L1, localKey: t.localKey!, valor: 1, status: "pendente", payloadPatch: { historico: [], ownerAdminUserId: U2 }, replacePayload: true })
    expect(result).toMatchObject({ id: t.id, valor: 100, status: "parcial", perfilId: E1 })
    expect((result.payload as { historico: unknown[] }).historico).toHaveLength(2)
    expect(await prisma.movimentacaoFinanceira.count({ where: { receberTituloId: t.id } })).toBe(2)
  })

  it("persistidor real reimporta pagar/receber mantendo identidades, perfil e pagamentos servidor", async () => {
    const grupos: Parameters<typeof persistirImportacao>[1] = new Map([
      ["contas_pagar", [{ chave: "synthetic-cp", dominioPrincipal: "contas_pagar", fontes: ["synthetic.csv"], campos: {
        "financeiro.descricao": "Obrigação sintética", "financeiro.entidadeNome": "Fornecedor", "financeiro.valor": 100,
        "pagamento.vencimento": "25/10/2026", "status.situacao": "pendente",
      } }]],
      ["contas_receber", [{ chave: "synthetic-cr", dominioPrincipal: "contas_receber", fontes: ["synthetic.csv"], campos: {
        "financeiro.descricao": "Recebível sintético", "financeiro.entidadeNome": "Cliente", "financeiro.valor": 100,
        "pagamento.vencimento": "25/10/2026", "status.situacao": "pendente",
      } }]],
    ])
    expect((await persistirImportacao(L1, grupos, "g002-fixture-import-1")).ok).toBe(true)
    const p = await prisma.contaPagarTitulo.findFirstOrThrow({ where: { storeId: L1 } })
    const r = await prisma.contaReceberTitulo.findFirstOrThrow({ where: { storeId: L1 } })
    expect((await registrarPagamentoParcialContaPagar({ storeId: L1, id: p.id, valorPago: 20 })).ok).toBe(true)
    expect((await registrarPagamentoParcial({ storeId: L1, id: r.id, valorPago: 20 })).ok).toBe(true)
    expect((await persistirImportacao(L1, grupos, "g002-fixture-import-2")).ok).toBe(true)
    const pagar = await prisma.contaPagarTitulo.findUniqueOrThrow({ where: { id: p.id } })
    const receber = await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { id: r.id } })
    expect(pagar).toMatchObject({ localKey: p.localKey, valor: 100, perfilId: E1, status: "parcial" })
    expect(receber).toMatchObject({ localKey: r.localKey, valor: 100, perfilId: E1, status: "parcial" })
    expect((pagar.payload as { historico: Array<{ valor: number }> }).historico[0].valor).toBe(20)
    expect((receber.payload as { historico: Array<{ valor: number }> }).historico[0].valor).toBe(20)
    expect(await prisma.contaPagarTitulo.count()).toBe(1); expect(await prisma.contaReceberTitulo.count()).toBe(1)
  })

  it("transferência conserva duas pernas empresariais e saldos, sem escolher conta automaticamente", async () => {
    const a = await criarCarteira({ storeId: L1, nome: "A", saldoInicial: 100 })
    const b = await criarCarteira({ storeId: L1, nome: "B", saldoInicial: 10 })
    const result = await transferirEntreCarteiras({ storeId: L1, origemId: a.id, destinoId: b.id, valor: 20 })
    expect(result).toMatchObject({ ok: true, origemSaldo: 80, destinoSaldo: 30 })
    const rows = await prisma.movimentacaoFinanceira.findMany({ where: { origem: "transferencia" } })
    expect(rows).toHaveLength(2); expect(rows.every(r => r.perfilId === E1)).toBe(true)
    const p = await context(), cp = await conta(p)
    expect((await transferirEntreCarteiras({ storeId: L1, origemId: a.id, destinoId: cp.id, valor: 1 })).ok).toBe(false)
  })

  it("movimento manual/Agent empresarial preserva referência/origem e rollbacks de conta inválida", async () => {
    const m = await createMovimentacao({ storeId: L1, tipo: "saida", descricao: "Manual", valor: 20 })
    expect(m).toMatchObject({ perfilId: E1, storeId: L1, origem: "manual", valor: 20 })
    const r = await createMovimentacaoSaidaFromOmniAgent({ storeId: L1, commandId: "g002-fixture-command", descricao: "Agent", valor: 10 })
    expect(r.ok).toBe(true)
    expect(await prisma.movimentacaoFinanceira.findFirst({ where: { referenciaId: "g002-fixture-command" } })).toMatchObject({ perfilId: E1, origem: "omni_agent", valor: 10 })
    await expect(createMovimentacao({ storeId: L3, tipo: "saida", descricao: "Inválido", valor: 10, carteiraId: "nao-existe" })).rejects.toThrow()
    expect(await prisma.financeiroPerfil.findUnique({ where: { storeId: L3 } })).toBeNull()
  })

  it("venda à vista/a prazo e OS usam writers reais, preservando origem, IDs e parcelas", async () => {
    const cash = await prisma.$transaction(tx => upsertVendaInTransaction(tx, L1, { id: "g002-fixture-PED-CASH", total: 100,
      customerName: "Cliente", paymentBreakdown: { dinheiro: 100 }, lines: [{ inventoryId: "__avulso__1", name: "Serviço", quantity: 2, unitPrice: 50, isAvulso: true }] }))
    expect(cash).toBeDefined()
    const credit = await prisma.$transaction(tx => upsertVendaInTransaction(tx, L1, { id: "g002-fixture-PED-CREDIT", total: 100,
      customerName: "Cliente", paymentBreakdown: { dinheiro: 20, aPrazo: 80 }, aPrazoConfig: { parcelas: 2 },
      lines: [{ inventoryId: "__avulso__2", name: "Serviço", quantity: 2, unitPrice: 50, isAvulso: true }] }))
    expect(credit).toBeDefined()
    const sale = await prisma.venda.findUniqueOrThrow({ where: { pedidoId: "g002-fixture-PED-CREDIT" } })
    const items = await prisma.itemVenda.findMany({ where: { vendaId: sale.id } })
    expect(items[0]).toMatchObject({ quantidade: 2, precoUnitario: 50, lineTotal: 100 })
    expect(await prisma.contaReceberTitulo.count({ where: { storeId: L1 } })).toBe(2)
    expect((await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { id: sale.contaReceberTituloId! } })).perfilId).toBe(E1)
    const os = { id: "g002-fixture-OS1", storeId: L1, clienteId: null, cliente: { nome: "Cliente" }, status: "pronto", orcamento: {},
      faturamentoPendente: true, faturamentoStatus: "pendente", faturamentoOrigem: "orcamento_os", faturamentoReferencia: "OS fixture",
      faturamentoTotal: 85.9, faturamentoCriadoEm: "2026-10-20T12:00:00.000Z" }
    const beforeOS = await prisma.ordemServico.create({ data: { id: os.id, storeId: L1, numero: "G002-OS1", valorTotal: 85.9, payload: os } })
    const billed = await upsertContaReceberFromOS(os as never)
    expect(billed.ok).toBe(true)
    const osTitle = await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { storeId_localKey: { storeId: L1, localKey: `os-faturamento:${L1}:${os.id}` } } })
    expect(osTitle).toMatchObject({ perfilId: E1, valor: 85.9 })
    expect((await upsertContaReceberFromOS(os as never)).ok).toBe(true)
    expect(await prisma.contaReceberTitulo.count({ where: { localKey: osTitle.localKey } })).toBe(1)
    expect(await prisma.ordemServico.findUniqueOrThrow({ where: { id: os.id } })).toEqual(beforeOS)
    expect(await prisma.movimentacaoEstoque.count()).toBe(0)
  })

  it("produto físico mantém quantidade/baixa e replay da venda não repete estoque nem financeiro", async () => {
    await expect(prisma.$transaction(async tx => {
      const product = await tx.produto.create({ data: { id: "g002-fixture-stock-product", storeId: L1, name: "Produto", stock: 10, price: 50 } })
      const sale = { id: "g002-fixture-stock-sale", total: 100, paymentBreakdown: { dinheiro: 100 },
        lines: [{ inventoryId: product.id, name: product.name, quantity: 2, unitPrice: 50 }] }
      await upsertVendaInTransaction(tx, L1, sale, undefined, { enforceStock: true })
      expect((await tx.produto.findUniqueOrThrow({ where: { id: product.id } })).stock).toBe(8)
      expect(await tx.movimentacaoEstoque.count({ where: { produtoId: product.id } })).toBe(1)
      expect(await tx.movimentacaoFinanceira.count({ where: { referenciaId: sale.id, perfilId: E1 } })).toBe(1)
      await upsertVendaInTransaction(tx, L1, sale, undefined, { enforceStock: true })
      expect((await tx.produto.findUniqueOrThrow({ where: { id: product.id } })).stock).toBe(8)
      expect(await tx.movimentacaoEstoque.count({ where: { produtoId: product.id } })).toBe(1)
      expect(await tx.movimentacaoFinanceira.count({ where: { referenciaId: sale.id } })).toBe(1)
      // Limpeza determinística da fixture física; todas as mutações acima foram SQL real.
      throw new Error("G002_STOCK_FIXTURE_ROLLBACK")
    }, { maxWait: 5_000, timeout: 20_000 })).rejects.toThrow("G002_STOCK_FIXTURE_ROLLBACK")
    expect(await prisma.produto.count({ where: { id: "g002-fixture-stock-product" } })).toBe(0)
  })

  it("re-sync a prazo após baixa parcial mantém principal/status; total divergente falha antes de qualquer efeito", async () => {
    const input = { id: "g002-fixture-paid-replay", total: 100, customerName: "Cliente fixture",
      paymentBreakdown: { aPrazo: 100 }, lines: [{ inventoryId: "__avulso__replay", name: "Serviço", quantity: 2, unitPrice: 50, isAvulso: true }] }
    await prisma.$transaction(tx => upsertVendaInTransaction(tx, L1, input))
    const sale = await prisma.venda.findUniqueOrThrow({ where: { pedidoId: input.id } })
    const row = await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { id: sale.contaReceberTituloId! } })
    expect((await registrarPagamentoParcial({ storeId: L1, id: row.id, valorPago: 20 })).ok).toBe(true)
    expect((await createMovimentacaoEntradaFromReceber(row, 20, { parcial: true, idempotenciaDoChamador: true })).ok).toBe(true)
    const before = await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { id: row.id } })
    const itemBefore = await prisma.itemVenda.findMany({ where: { vendaId: sale.id } })
    expect(before).toMatchObject({ valor: 100, status: "parcial", perfilId: E1 })
    expect((await prisma.$transaction(tx => upsertVendaInTransaction(tx, L1, input))).replayed).toBe(true)
    await expect(prisma.$transaction(tx => upsertVendaInTransaction(tx, L1, {
      ...input, total: 120, paymentBreakdown: { aPrazo: 120 }, lines: [{ ...input.lines[0], unitPrice: 60 }],
    }))).rejects.toMatchObject({ code: "PEDIDO_ID_CONFLITO_MESMA_LOJA" })
    expect(await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { id: row.id } })).toEqual(before)
    expect(await prisma.venda.findUniqueOrThrow({ where: { id: sale.id } })).toEqual(sale)
    expect(await prisma.itemVenda.findMany({ where: { vendaId: sale.id } })).toEqual(itemBefore)
    expect(await prisma.movimentacaoFinanceira.count({ where: { referenciaId: row.id } })).toBe(1)
    expect(await prisma.movimentacaoEstoque.count({ where: { storeId: L1 } })).toBe(0)
  })

  it("mutações de títulos legados adotam sua carteira antes da FK sem mudar principal ou saldo da conta", async () => {
    for (const kind of ["cancelar-pagar", "liquidar-pagar", "parcial-pagar", "estornar-pagar-titulo", "estornar-pagar-parcial", "cancelar-receber", "parcial-receber"] as const) {
      const wallet = await prisma.carteiraFinanceira.create({ data: { storeId: L1, nome: kind, tipo: "banco" } })
      const isPagar = kind.includes("pagar"), reversal = kind.startsWith("estornar")
      const data = { storeId: L1, localKey: kind, descricao: kind, valor: 100, vencimento: "25/10/2026", carteiraId: wallet.id,
        status: reversal ? "parcial" : "pendente", payload: reversal ? { historico: [{ tipo: "pagamento", valor: 20 }] } : {},
      }
      const row = isPagar ? await prisma.contaPagarTitulo.create({ data }) : await prisma.contaReceberTitulo.create({ data })
      const params = { storeId: L1, id: row.id }
      const result = kind === "cancelar-pagar" ? await cancelContaPagar(params)
        : kind === "liquidar-pagar" ? await liquidarContaPagar(params)
        : kind === "parcial-pagar" ? await registrarPagamentoParcialContaPagar({ ...params, valorPago: 20 })
        : kind.startsWith("estornar") ? await estornarContaPagar({ ...params, modo: kind === "estornar-pagar-titulo" ? "titulo_completo" : "ultimo_pagamento" })
        : kind === "cancelar-receber" ? await cancelContaReceber(params)
        : await registrarPagamentoParcial({ ...params, valorPago: 20 })
      expect(result.ok, kind).toBe(true)
      const updated = isPagar ? await prisma.contaPagarTitulo.findUniqueOrThrow({ where: { id: row.id } })
        : await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { id: row.id } })
      expect(updated).toMatchObject({ perfilId: E1, carteiraId: wallet.id, localKey: kind, valor: 100 })
      expect(updated.valorCentavos?.toString()).toBe("10000")
      expect(await prisma.carteiraFinanceira.findUniqueOrThrow({ where: { id: wallet.id } })).toMatchObject({ perfilId: E1, saldoAtual: 0 })
    }
    expect(await prisma.movimentacaoFinanceira.count({ where: { storeId: L1 } })).toBe(0)
  })

  it("ponte de movimento adota título e conta original sem confundir a conta de pagamento explícita", async () => {
    const original = await prisma.carteiraFinanceira.create({ data: { storeId: L1, nome: "Conta original", tipo: "banco" } })
    const pagamento = await prisma.carteiraFinanceira.create({ data: { storeId: L1, perfilId: E1, nome: "Conta pagamento", tipo: "banco" } })
    const row = await prisma.contaReceberTitulo.create({ data: { storeId: L1, localKey: "ponte-legada", valor: 100,
      descricao: "Título legado", vencimento: "25/10/2026", carteiraId: original.id,
    } })
    expect((await createMovimentacaoEntradaFromReceber(row, 20, { carteiraId: pagamento.id })).ok).toBe(true)
    expect(await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ perfilId: E1, carteiraId: original.id, valor: 100, status: "pendente" })
    expect(await prisma.carteiraFinanceira.findUniqueOrThrow({ where: { id: original.id } })).toMatchObject({ perfilId: E1, saldoAtual: 0 })
    expect(await prisma.carteiraFinanceira.findUniqueOrThrow({ where: { id: pagamento.id } })).toMatchObject({ perfilId: E1, saldoAtual: 20 })
    expect(await prisma.movimentacaoFinanceira.findFirstOrThrow({ where: { receberTituloId: row.id } })).toMatchObject({ perfilId: E1, carteiraId: pagamento.id, valor: 20 })
  })

  it("novo destino de pagamento inativo recusa e reverte perfil/histórico, preservando a referência histórica", async () => {
    const wallet = await prisma.carteiraFinanceira.create({ data: { storeId: L3, nome: "Conta legada", tipo: "banco" } })
    const row = await prisma.contaPagarTitulo.create({ data: { storeId: L3, localKey: "conta-desativada", valor: 100,
      descricao: "Título legado", vencimento: "25/10/2026", carteiraId: wallet.id,
    } })
    await prisma.carteiraFinanceira.update({ where: { id: wallet.id }, data: { ativo: false } })
    await expect(prisma.$transaction(async tx => {
      const parcial = await registrarPagamentoParcialContaPagar({ storeId: L3, id: row.id, valorPago: 20, db: tx })
      expect(parcial.ok).toBe(true)
      await createMovimentacaoSaidaFromPagar(row, 20, { carteiraId: wallet.id, parcial: true, db: tx })
    })).rejects.toThrow()
    expect(await prisma.contaPagarTitulo.findUniqueOrThrow({ where: { id: row.id } })).toEqual(row)
    expect(await prisma.financeiroPerfil.count({ where: { storeId: L3 } })).toBe(0)
    expect((await prisma.carteiraFinanceira.findUniqueOrThrow({ where: { id: wallet.id } })).perfilId).toBeNull()
    expect(await prisma.movimentacaoFinanceira.count({ where: { storeId: L3 } })).toBe(0)
  })

  it("snapshots com referências opcionais obsoletas não travam o lote nem vinculam conta/fornecedor estrangeiros", async () => {
    const inativa = await prisma.carteiraFinanceira.create({ data: { storeId: L1, perfilId: E1, nome: "Inativa", tipo: "banco", ativo: false } })
    const estrangeira = await prisma.carteiraFinanceira.create({ data: { storeId: L2, perfilId: E2, nome: "Outra", tipo: "banco" } })
    const ativa = await prisma.carteiraFinanceira.create({ data: { storeId: L1, perfilId: E1, nome: "Ativa", tipo: "banco" } })
    for (const kind of ["pagar", "receber"] as const) {
      const invalidos = [inativa.id, estrangeira.id, "g002-conta-inexistente"]
      const rows = invalidos.map((carteiraId, i) => ({ id: `snapshot-${kind}-${i}`, descricao: "Fixture", valor: 10, carteiraId }))
      if (kind === "pagar") rows.push({ id: "snapshot-pagar-fornecedor", descricao: "Fixture", valor: 10, carteiraId: "" })
      const payload: Array<Record<string, unknown>> = rows.map(row => row.id === "snapshot-pagar-fornecedor" ? { ...row, fornecedorId: F2 } : row)
      payload.push({ id: `snapshot-${kind}-valida`, descricao: "Última linha válida", valor: 10, carteiraId: ativa.id })
      const response = await (kind === "pagar" ? pagarPersist : receberPersist)(request(L1, payload))
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body).toMatchObject({ ok: true, count: payload.length })
      expect(body.warnings.length).toBeGreaterThanOrEqual(invalidos.length)
      expect(JSON.stringify(body)).not.toContain(estrangeira.id)
      expect(JSON.stringify(body)).not.toContain(F2)
      const saved = kind === "pagar"
        ? await prisma.contaPagarTitulo.findMany({ where: { storeId: L1, localKey: { startsWith: `snapshot-${kind}-` } } })
        : await prisma.contaReceberTitulo.findMany({ where: { storeId: L1, localKey: { startsWith: `snapshot-${kind}-` } } })
      expect(saved).toHaveLength(payload.length)
      expect(saved.every(row => row.perfilId === E1)).toBe(true)
      expect(saved.filter(row => row.localKey !== `snapshot-${kind}-valida`).every(row => row.carteiraId === null)).toBe(true)
      expect(saved.find(row => row.localKey === `snapshot-${kind}-valida`)?.carteiraId).toBe(ativa.id)
    }
    expect((await prisma.contaPagarTitulo.findUniqueOrThrow({ where: { storeId_localKey: { storeId: L1, localKey: "snapshot-pagar-fornecedor" } } })).fornecedorId).toBeNull()
    expect(await prisma.movimentacaoFinanceira.count({ where: { storeId: L1 } })).toBe(0)
  })

  it("snapshot não troca a carteira de título com ledger nem apaga metadados históricos do servidor", async () => {
    const original = await prisma.carteiraFinanceira.create({ data: { storeId: L1, perfilId: E1, nome: "Original", tipo: "banco" } })
    const sugerida = await prisma.carteiraFinanceira.create({ data: { storeId: L1, perfilId: E1, nome: "Sugerida", tipo: "banco" } })
    for (const kind of ["pagar", "receber"] as const) {
      const data = { storeId: L1, perfilId: E1, localKey: `ledger-conta-${kind}`, descricao: "Fixture", valor: 100, vencimento: "25/10/2026", carteiraId: original.id,
        payload: { carteiraId: original.id, storeId: L1, userId: "usuario-historico", contexto: { origem: "legado" } },
      }
      const row = kind === "pagar" ? await prisma.contaPagarTitulo.create({ data }) : await prisma.contaReceberTitulo.create({ data })
      const pay = { storeId: L1, id: row.id, valorPago: 20 }
      expect((await (kind === "pagar" ? registrarPagamentoParcialContaPagar : registrarPagamentoParcial)(pay)).ok).toBe(true)
      const warnings: unknown[] = []
      const input = { storeId: L1, localKey: data.localKey, valor: 1, status: "pendente", replacePayload: true,
        payloadPatch: { carteiraId: sugerida.id, historico: [], perfilId: P1, storeId: L2, userId: U2, contexto: { forjado: true } },
        onWarning: (warning: unknown) => warnings.push(warning),
      }
      const saved = await (kind === "pagar" ? upsertContaPagar : upsertContaReceber)(input)
      expect(saved).toMatchObject({ carteiraId: original.id, perfilId: E1, valor: 100, status: "parcial" })
      expect(saved.payload).toMatchObject({ carteiraId: original.id, storeId: L1, userId: "usuario-historico", contexto: { origem: "legado" } })
      expect((saved.payload as Record<string, unknown>).perfilId).toBeUndefined()
      expect((saved.payload as { historico: unknown[] }).historico).toHaveLength(1)
      expect(warnings).toContainEqual({ campo: "carteiraId", motivo: "preservado_historico" })
    }
    expect(await prisma.movimentacaoFinanceira.count({ where: { storeId: L1 } })).toBe(0)
  })

  it("snapshot paralelo conserva última ocorrência da mesma localKey em pagar e receber", async () => {
    for (const [kind, handler] of [["pagar", pagarPersist], ["receber", receberPersist]] as const) {
      const rows = [{ id: `${kind}-repetido`, valor: 10 }, { id: `${kind}-outro`, valor: 30 },
        { id: `${kind}-repetido`, valor: 20 }, { id: `${kind}-ultimo`, valor: 40 }, { id: `${kind}-repetido`, valor: 50 }]
      const response = await handler(request(L1, rows))
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ ok: true, count: 5 })
      const saved = kind === "pagar" ? await prisma.contaPagarTitulo.findUniqueOrThrow({ where: { storeId_localKey: { storeId: L1, localKey: `${kind}-repetido` } } })
        : await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { storeId_localKey: { storeId: L1, localKey: `${kind}-repetido` } } })
      expect(saved).toMatchObject({ valor: 50, perfilId: E1 })
      const count = kind === "pagar" ? await prisma.contaPagarTitulo.count({ where: { storeId: L1 } })
        : await prisma.contaReceberTitulo.count({ where: { storeId: L1 } })
      expect(count).toBe(3)
    }
    expect(await prisma.movimentacaoFinanceira.count({ where: { storeId: L1 } })).toBe(0)
  })

  it("cancelamento preserva vínculo histórico com carteira desativada em pagar e receber", async () => {
    const wallet = await prisma.carteiraFinanceira.create({ data: { storeId: L1, nome: "Histórica", tipo: "banco" } })
    const base = { storeId: L1, valor: 100, descricao: "Fixture", vencimento: "25/10/2026", carteiraId: wallet.id }
    const cp = await prisma.contaPagarTitulo.create({ data: { ...base, localKey: "historica-cp" } })
    const cr = await prisma.contaReceberTitulo.create({ data: { ...base, localKey: "historica-cr" } })
    await prisma.carteiraFinanceira.update({ where: { id: wallet.id }, data: { ativo: false } })
    expect((await cancelContaPagar({ storeId: L1, id: cp.id })).ok).toBe(true)
    expect((await cancelContaReceber({ storeId: L1, id: cr.id })).ok).toBe(true)
    await prisma.$executeRaw`UPDATE contas_pagar_titulos SET descricao = 'Metadado histórico' WHERE id = ${cp.id}`
    expect(await prisma.contaPagarTitulo.findUniqueOrThrow({ where: { id: cp.id } })).toMatchObject({ perfilId: E1, carteiraId: wallet.id, status: "cancelado" })
    expect(await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { id: cr.id } })).toMatchObject({ perfilId: E1, carteiraId: wallet.id, status: "cancelado" })
    expect(await prisma.movimentacaoFinanceira.count({ where: { storeId: L1 } })).toBe(0)
  })

  it("estornos CP/CR conservam cada conta desativada e são idempotentes sob concorrência", async () => {
    for (const kind of ["pagar", "receber"] as const) {
      const a = await criarCarteira({ storeId: L1, nome: `A ${kind}`, tipo: "banco", saldoInicial: 100 })
      const b = await criarCarteira({ storeId: L1, nome: `B ${kind}`, tipo: "banco", saldoInicial: 100 })
      const row = await (kind === "pagar" ? upsertContaPagar : upsertContaReceber)({ storeId: L1, localKey: `estorno-${kind}`, valor: 100, payloadPatch: { carteiraId: a.id } })
      for (const [carteiraId, valorPago] of [[a.id, 20], [b.id, 30]] as const) {
        expect((await (kind === "pagar" ? registrarPagamentoParcialContaPagar : registrarPagamentoParcial)({ storeId: L1, id: row.id, valorPago })).ok).toBe(true)
        const opts = { parcial: true, carteiraId, idempotenciaDoChamador: true }
        expect((await (kind === "pagar" ? createMovimentacaoSaidaFromPagar(row, valorPago, opts)
          : createMovimentacaoEntradaFromReceber({ ...row, cliente: "Fixture" }, valorPago, opts))).ok).toBe(true)
      }
      await prisma.carteiraFinanceira.updateMany({ where: { id: { in: [a.id, b.id] } }, data: { ativo: false } })
      const results = await Promise.all([estornarMovimentacaoPorReferencia(L1, row.id, kind), estornarMovimentacaoPorReferencia(L1, row.id, kind)])
      expect(results.filter(r => r.ok && r.action === "created")).toHaveLength(1)
      const reversed = await prisma.movimentacaoFinanceira.findMany({ where: { storeId: L1, referenciaId: row.id, origem: `estorno_${kind}` } })
      expect(reversed).toHaveLength(2)
      expect(reversed.find(m => m.carteiraId === a.id)?.valor).toBe(20)
      expect(reversed.find(m => m.carteiraId === b.id)?.valor).toBe(30)
      expect((await prisma.carteiraFinanceira.findUniqueOrThrow({ where: { id: a.id } })).saldoAtual).toBe(100)
      expect((await prisma.carteiraFinanceira.findUniqueOrThrow({ where: { id: b.id } })).saldoAtual).toBe(100)
      const undo = { storeId: L1, id: row.id, modo: "titulo_completo" as const }
      expect((await (kind === "pagar" ? estornarContaPagar : estornarContaReceber)(undo)).ok).toBe(true)
      await expect(createMovimentacao({ storeId: L1, tipo: "saida", valor: 1, descricao: "Novo destino recusado", carteiraId: a.id })).rejects.toThrow()
      await expect(prisma.$executeRaw`INSERT INTO movimentacoes_financeiras (id,"storeId","perfilId",tipo,valor,descricao,origem,"referenciaId","carteiraId","createdAt") VALUES
        (${`fake-estorno-${kind}`},${L1},${E1},${kind === "pagar" ? "entrada" : "saida"},999,'Inválido',${`estorno_${kind}`},${row.id},${a.id},now())`).rejects.toMatchObject({ meta: { code: "23514" } })
    }
  })

  it("prisma global passado como db ainda abre transação e reverte perfil em falha posterior", async () => {
    await expect(emTransacaoFinanceira(prisma, async tx => {
      await upsertContaPagar({ storeId: L3, localKey: "global-tx", valor: 10, db: tx })
      throw new Error("G002_GLOBAL_ROLLBACK")
    })).rejects.toThrow("G002_GLOBAL_ROLLBACK")
    expect(await prisma.financeiroPerfil.count({ where: { storeId: L3 } })).toBe(0)
    expect(await prisma.contaPagarTitulo.count({ where: { storeId: L3 } })).toBe(0)
  })

  it.each(["titulo", "saldo", "lote", "transferencia"] as const)("N13-17 criação inicial do perfil concorre com %s sem inverter locks", async modo => {
    const wallet = await prisma.carteiraFinanceira.create({ data: { storeId: L3, nome: `Perfil inicial ${modo}`, tipo: "banco", saldoInicial: 100, saldoAtual: 100 } })
    const destino = await prisma.carteiraFinanceira.create({ data: { storeId: L3, nome: "Destino legado", tipo: "banco" } })
    const title = await prisma.contaReceberTitulo.create({ data: { storeId: L3, localKey: `perfil-inicial-${modo}`, descricao: "Legado", cliente: "Fixture", valor: 100, payload: { carteiraId: wallet.id } } })
    const sessao = await prisma.sessaoCaixa.create({ data: { storeId: L3, operador: "Fixture perfil inicial" } })
    const lock = `g002:perfil-inicial:${modo}`
    await prisma.$executeRawUnsafe(`CREATE FUNCTION qa_g002_perfil_inicial() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."storeId" = 'g002-fixture-L3' THEN PERFORM pg_advisory_xact_lock(hashtext('g002:perfil-inicial:${modo}')); END IF; RETURN NEW; END $$`)
    await prisma.$executeRawUnsafe('CREATE TRIGGER qa_g002_perfil_inicial AFTER INSERT ON financeiro_perfis FOR EACH ROW EXECUTE FUNCTION qa_g002_perfil_inicial()')
    try {
      const esperar = async (minimo: number) => {
        for (let n = 0; n < 150; n++) {
          const rows = await prisma.$queryRaw<Array<{ wait_event: string }>>`SELECT wait_event FROM pg_stat_activity WHERE datname=current_database() AND usename=current_user AND state='active' AND wait_event_type='Lock'`
          if (rows.length >= minimo) return rows
          await new Promise(resolve => setTimeout(resolve, 10))
        }
        throw new Error(`N13-15: não observou ${minimo} esperas PostgreSQL`)
      }
      let pronto!: () => void, soltar!: () => void, iniciar!: () => void
      const prontoP = new Promise<void>(r => { pronto = r }), soltarP = new Promise<void>(r => { soltar = r })
      const iniciarP = new Promise<void>(r => { iniciar = r })
      const gate = prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${lock}))::text AS lock`
        pronto(); await soltarP
      }, { timeout: 15_000 })
      await prontoP
      const primeiro = modo === "titulo"
        ? createMovimentacaoEntradaFromReceber(title, 10, { carteiraId: wallet.id, parcial: true, idempotenciaDoChamador: true })
        : createMovimentacao({ storeId: L3, carteiraId: wallet.id, tipo: "entrada", descricao: "Inicial", valor: 10, referenciaId: `N13-15-${modo}` })
      const capturado = primeiro.then(value => ({ status: "fulfilled" as const, value }), reason => ({ status: "rejected" as const, reason }))
      const segundo = iniciarP.then<unknown>(() => {
        if (modo === "titulo") return upsertContaReceber({ storeId: L3, localKey: title.localKey!, valor: 100, payloadPatch: { carteiraId: wallet.id } })
        if (modo === "saldo") return recalcularSaldoCarteira(wallet.id, L3)
        if (modo === "transferencia") return transferirEntreCarteiras({ storeId: L3, origemId: wallet.id, destinoId: destino.id, valor: 20 })
        return prisma.$transaction(tx => executarRecebimentoLote(tx, { storeId: L3, sessaoId: sessao.id,
          formaPagamento: "pix", userLabel: "Fixture", idempotencyKey: "N15-perfil-inicial" },
          [{ tituloId: title.id, localKey: title.localKey!, saldoEsperado: 100, valorReceber: 20 }]), { timeout: 15_000 })
      }).then(value => ({ status: "fulfilled" as const, value }), reason => ({ status: "rejected" as const, reason }))
      const resultados = Promise.all([capturado, segundo])
      try {
        await esperar(1)
        iniciar()
        if (modo === "saldo") {
          let concluiu = false
          void segundo.then(() => { concluiu = true })
          for (let n = 0; n < 150 && !concluiu; n++) await new Promise(resolve => setTimeout(resolve, 10))
          expect(concluiu).toBe(true) // recálculo avança com perfil ainda não commitado
          expect(await prisma.financeiroPerfil.count({ where: { storeId: L3 } })).toBe(0)
        } else console.info("G002_N13_15_WAIT", modo, JSON.stringify(await esperar(2)))
      } finally { iniciar(); soltar(); await Promise.all([gate, resultados]) }
      const settled = await resultados
      console.info("G002_N13_15_OUTCOMES", modo, JSON.stringify(settled.map(r => r.status === "rejected" ? String(r.reason) : r.status)))
      expect(settled.map(r => r.status)).toEqual(["fulfilled", "fulfilled"])
      expect(await prisma.financeiroPerfil.count({ where: { storeId: L3, tipo: "EMPRESA" } })).toBe(1)
      expect(await prisma.perfilMembro.count({ where: { storeId: L3 } })).toBe(0)
      expect(await prisma.movimentacaoFinanceira.count({ where: { storeId: L3 } })).toBe(modo === "lote" ? 2 : modo === "transferencia" ? 3 : 1)
      expect(await prisma.caixaOperacao.count({ where: { sessaoId: sessao.id } })).toBe(modo === "lote" ? 1 : 0)
      expect((await prisma.carteiraFinanceira.findUniqueOrThrow({ where: { id: wallet.id } })).saldoAtual).toBe(modo === "lote" ? 130 : modo === "transferencia" ? 90 : 110)
      expect((await prisma.carteiraFinanceira.findUniqueOrThrow({ where: { id: destino.id } })).saldoAtual).toBe(modo === "transferencia" ? 20 : 0)
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER qa_g002_perfil_inicial ON financeiro_perfis')
      await prisma.$executeRawUnsafe('DROP FUNCTION qa_g002_perfil_inicial()')
    }
  })

  it("N16 recálculo com db prisma explícito não deixa perfil após conta inexistente", async () => {
    await expect(recalcularSaldoCarteira("g002-inexistente", L3, prisma)).rejects.toThrow("Carteira não encontrada")
    expect(await prisma.financeiroPerfil.count({ where: { storeId: L3 } })).toBe(0)
  })


  it("N18 transferência recusada conserva resultado falso e não deixa perfil inicial", async () => {
    const res = await transferirEntreCarteiras({ storeId: L3, origemId: "g002-ausente-a", destinoId: "g002-ausente-b", valor: 20 })
    expect(res).toMatchObject({ ok: false })
    expect(await prisma.financeiroPerfil.count({ where: { storeId: L3 } })).toBe(0)
    expect(await prisma.movimentacaoFinanceira.count({ where: { storeId: L3 } })).toBe(0)
  })

  it("N1 snapshot e movimento avulso conservam ordem de locks do título antes da carteira", async () => {
    const capturar = <T>(p: Promise<T>) => p.then(value => ({ status: "fulfilled" as const, value }), reason => ({ status: "rejected" as const, reason }))
    const esperarLocks = async (minimo: number) => {
      for (let n = 0; n < 150; n++) {
        const rows = await prisma.$queryRaw<Array<{ wait_event: string }>>`SELECT wait_event FROM pg_stat_activity WHERE datname=current_database() AND usename=current_user AND state='active' AND wait_event_type='Lock'`
        if (rows.length >= minimo) return rows
        await new Promise(resolve => setTimeout(resolve, 10))
      }
      throw new Error(`N1: não observou ${minimo} transações esperando locks reais`)
    }
    for (const kind of ["pagar", "receber"] as const) {
      const wallet = await criarCarteira({ storeId: L1, nome: `N1 ${kind}`, tipo: "banco", saldoInicial: 100 })
      const row = await (kind === "pagar" ? upsertContaPagar : upsertContaReceber)({ storeId: L1, localKey: `N1-${kind}`, valor: 100, payloadPatch: { carteiraId: wallet.id } })
      expect((await (kind === "pagar" ? registrarPagamentoParcialContaPagar : registrarPagamentoParcial)({ storeId: L1, id: row.id, valorPago: 20 })).ok).toBe(true)
      let pronto!: () => void, soltar!: () => void, iniciarSnapshot!: () => void
      const gatePronto = new Promise<void>(resolve => { pronto = resolve })
      const gateSolto = new Promise<void>(resolve => { soltar = resolve })
      const snapshotIniciado = new Promise<void>(resolve => { iniciarSnapshot = resolve })
      const lock = `financeiro:carteira-saldo:${L1}:${wallet.id}`
      const gate = prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${lock}))::text AS lock`
        pronto(); await gateSolto
      }, { timeout: 15_000 })
      await gatePronto
      const opts = { parcial: true, carteiraId: wallet.id, idempotenciaDoChamador: true }
      const pagamento = capturar(kind === "pagar" ? createMovimentacaoSaidaFromPagar(row, 20, opts)
        : createMovimentacaoEntradaFromReceber({ ...row, cliente: "Fixture" }, 20, opts))
      const snapshot = capturar(snapshotIniciado.then<unknown>(() => (kind === "pagar" ? upsertContaPagar : upsertContaReceber)({
        storeId: L1, localKey: row.localKey!, valor: 1, status: "pendente", replacePayload: true, payloadPatch: { carteiraId: wallet.id, historico: [] },
      })))
      const resultados = Promise.all([pagamento, snapshot])
      try {
        await esperarLocks(1)
        iniciarSnapshot()
        console.info("G002_N1_LOCK_WAIT", kind, JSON.stringify(await esperarLocks(2)))
      } finally {
        iniciarSnapshot(); soltar(); await Promise.all([gate, resultados])
      }
      const settled = await resultados
      console.info("G002_N1_OUTCOMES", kind, JSON.stringify(settled.map(r => r.status === "rejected" ? String(r.reason) : r.status)))
      expect(settled.map(r => r.status)).toEqual(["fulfilled", "fulfilled"])
      expect(settled[0].status === "fulfilled" && settled[0].value.ok).toBe(true)
      expect(await prisma.movimentacaoFinanceira.count({ where: { referenciaId: row.id } })).toBe(1)
      const saved = kind === "pagar" ? await prisma.contaPagarTitulo.findUniqueOrThrow({ where: { id: row.id } })
        : await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { id: row.id } })
      expect(saved).toMatchObject({ valor: 100, status: "parcial", perfilId: E1 })
      expect((saved.payload as { historico: unknown[] }).historico).toHaveLength(1)
      expect((await prisma.carteiraFinanceira.findUniqueOrThrow({ where: { id: wallet.id } })).saldoAtual).toBe(kind === "pagar" ? 80 : 120)
    }
  })

  it("N6 db prisma explícito no CR mantém rollback de provisionamento após falha SQL", async () => {
    await expect(upsertContaReceber({ db: prisma, storeId: L3, localKey: "N6-global", valor: 10, descricao: "inválido\u0000" })).rejects.toThrow()
    expect(await prisma.financeiroPerfil.count({ where: { storeId: L3 } })).toBe(0)
    expect(await prisma.contaReceberTitulo.count({ where: { storeId: L3 } })).toBe(0)
  })

  it.each(["pagar", "receber"] as const)("M1 serviço %s: parciais iguais, replay após commit e conflito conservam fatos", async tipo => {
    const wallet = await criarCarteira({ storeId: L1, nome: `M1 ${tipo}`, tipo: "banco", saldoInicial: 100 })
    const row = await (tipo === "pagar" ? upsertContaPagar : upsertContaReceber)({ storeId: L1, localKey: `M1-${tipo}`, valor: 200, payloadPatch: { carteiraId: wallet.id } })
    const input = { tipo, storeId: L1, localKey: row.localKey!, op: "parcial" as const, valor: 20, canal: "financeiro" as const, idempotencyKey: "M1-servico-primeiro" }
    const primeiro = await aplicarPagamentoLegado(input)
    const segundo = await aplicarPagamentoLegado({ ...input, idempotencyKey: "M1-servico-segundo" })
    // Simula a resposta do primeiro commit perdida: o replay acontece após outra parcela.
    const replay = await aplicarPagamentoLegado(input)
    expect([primeiro.replay, segundo.replay, replay.replay]).toEqual([false, false, true])
    expect(replay.movimentoId).toBe(primeiro.movimentoId)
    expect(replay.valorAplicado).toBe(20)
    await expect(aplicarPagamentoLegado({ ...input, valor: 21 })).rejects.toMatchObject({ code: "idempotency_conflict", status: 409 })
    const movs = await prisma.movimentacaoFinanceira.findMany({ where: { storeId: L1, referenciaId: row.id } })
    expect(movs).toHaveLength(2)
    expect(movs.reduce((s, m) => s + m.valor, 0)).toBe(40)
    expect((await prisma.carteiraFinanceira.findUniqueOrThrow({ where: { id: wallet.id } })).saldoAtual).toBe(tipo === "pagar" ? 60 : 140)
    const saved = tipo === "pagar" ? await prisma.contaPagarTitulo.findUniqueOrThrow({ where: { id: row.id } })
      : await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { id: row.id } })
    expect((saved.payload as { historico: unknown[] }).historico).toHaveLength(2)
    expect(saved).toMatchObject({ perfilId: E1, status: "parcial", valor: 200 })
  })

  it.each([true, false])("M1 concorrência real no título, mesma identidade=%s, conserva efeito único por operação", async mesma => {
    const wallet = await criarCarteira({ storeId: L1, nome: "M1 concorrente", tipo: "banco", saldoInicial: 100 })
    const row = await upsertContaReceber({ storeId: L1, localKey: "M1-concorrente", valor: 200, payloadPatch: { carteiraId: wallet.id } })
    let pronto!: () => void, soltar!: () => void
    const prontoP = new Promise<void>(resolve => { pronto = resolve }), soltarP = new Promise<void>(resolve => { soltar = resolve })
    const gate = prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM contas_receber_titulos WHERE id=${row.id} AND "storeId"=${L1} FOR UPDATE`
      pronto(); await soltarP
    })
    await prontoP
    const input = { storeId: L1, tipo: "receber" as const, op: "parcial" as const, localKey: row.localKey!, valor: 20, canal: "financeiro" as const, idempotencyKey: "M1-concorrente-A" }
    const resultados = Promise.all([aplicarPagamentoLegado(input), aplicarPagamentoLegado({ ...input, idempotencyKey: mesma ? input.idempotencyKey : "M1-concorrente-B" })])
    try {
      let waits = 0
      for (let n = 0; n < 150; n++) {
        const rows = await prisma.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) AS n FROM pg_stat_activity WHERE datname=current_database() AND usename=current_user AND state='active' AND wait_event_type='Lock'`
        waits = Number(rows[0].n)
        if (waits >= 2) break
        await new Promise(resolve => setTimeout(resolve, 10))
      }
      expect(waits).toBeGreaterThanOrEqual(2)
    } finally { soltar(); await gate }
    const outcomes = await resultados
    expect(outcomes.filter(r => r.replay)).toHaveLength(mesma ? 1 : 0)
    expect(await prisma.movimentacaoFinanceira.count({ where: { referenciaId: row.id } })).toBe(mesma ? 1 : 2)
    expect((await prisma.carteiraFinanceira.findUniqueOrThrow({ where: { id: wallet.id } })).saldoAtual).toBe(mesma ? 120 : 140)
  })

  it("M1 falha SQL no saldo reverte histórico, movimento e provisionamento", async () => {
    const wallet = await prisma.carteiraFinanceira.create({ data: { storeId: L3, nome: "M1 rollback", tipo: "banco", saldoInicial: 100, saldoAtual: 100 } })
    const row = await prisma.contaPagarTitulo.create({ data: { storeId: L3, localKey: "M1-rollback", descricao: "Fixture", valor: 100, vencimento: "2026-10-25", payload: { carteiraId: wallet.id } } })
    await prisma.$executeRawUnsafe(`CREATE FUNCTION qa_g002_m1_saldo() RETURNS trigger AS $$ BEGIN IF NEW."storeId" = 'g002-fixture-L3' THEN RAISE EXCEPTION 'M1_SALDO_FALHA'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`)
    try {
      await prisma.$executeRawUnsafe('CREATE TRIGGER qa_g002_m1_saldo BEFORE UPDATE OF "saldoAtual" ON carteiras_financeiras FOR EACH ROW EXECUTE FUNCTION qa_g002_m1_saldo()')
      await expect(aplicarPagamentoLegado({ storeId: L3, tipo: "pagar", op: "parcial", localKey: row.localKey!, valor: 20, canal: "financeiro", idempotencyKey: "M1-rollback" })).rejects.toThrow()
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS qa_g002_m1_saldo ON carteiras_financeiras')
      await prisma.$executeRawUnsafe('DROP FUNCTION qa_g002_m1_saldo()')
    }
    expect(await prisma.movimentacaoFinanceira.count({ where: { storeId: L3 } })).toBe(0)
    expect(await prisma.financeiroPerfil.count({ where: { storeId: L3 } })).toBe(0)
    expect(await prisma.contaPagarTitulo.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ perfilId: null, status: "pendente", payload: { carteiraId: wallet.id } })
    expect((await prisma.carteiraFinanceira.findUniqueOrThrow({ where: { id: wallet.id } })).saldoAtual).toBe(100)
  })

  it("N10 lote com dois títulos e snapshot do segundo conservam ordem global antes da carteira", async () => {
    const wallet = await criarCarteira({ storeId: L1, nome: "N10 carteira comum", tipo: "banco", saldoInicial: 100 })
    const t1 = await upsertContaReceber({ storeId: L1, localKey: "N10-t1", valor: 100, payloadPatch: { carteiraId: wallet.id } })
    const t2 = await upsertContaReceber({ storeId: L1, localKey: "N10-t2", valor: 100, payloadPatch: { carteiraId: wallet.id } })
    const sessao = await prisma.sessaoCaixa.create({ data: { storeId: L1, operador: "Fixture N10" } })
    const validado = validarRecebimentoLote({ idempotencyKey: "N10-fixture-unica", itens: [
      { tituloId: t1.id, localKey: t1.localKey!, saldoEsperado: 100, valorReceber: 20 },
      { tituloId: t2.id, localKey: t2.localKey!, saldoEsperado: 100, valorReceber: 30 },
    ] })
    expect(validado.ok).toBe(true)
    if (!validado.ok) throw new Error("Fixture N10 inválida")
    const capturar = <T>(p: Promise<T>) => p.then(value => ({ status: "fulfilled" as const, value }), reason => ({ status: "rejected" as const, reason }))
    const esperarLocks = async (minimo: number) => {
      for (let n = 0; n < 150; n++) {
        const rows = await prisma.$queryRaw<Array<{ wait_event: string }>>`SELECT wait_event FROM pg_stat_activity WHERE datname=current_database() AND usename=current_user AND state='active' AND wait_event_type='Lock'`
        if (rows.length >= minimo) return rows
        await new Promise(resolve => setTimeout(resolve, 10))
      }
      throw new Error(`N10: não observou ${minimo} waiters reais`)
    }
    let pronto!: () => void, soltar!: () => void, iniciarSnapshot!: () => void
    const gatePronto = new Promise<void>(resolve => { pronto = resolve })
    const gateSolto = new Promise<void>(resolve => { soltar = resolve })
    const snapshotIniciado = new Promise<void>(resolve => { iniciarSnapshot = resolve })
    const lock = `financeiro:carteira-saldo:${L1}:${wallet.id}`
    const gate = prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${lock}))::text AS lock`
      pronto(); await gateSolto
    }, { timeout: 15_000 })
    await gatePronto
    const lote = capturar(prisma.$transaction(tx => executarRecebimentoLote(tx, {
      storeId: L1, sessaoId: sessao.id, formaPagamento: "pix", userLabel: "Fixture N10", idempotencyKey: "N10-fixture-unica",
    }, validado.itens), { timeout: 15_000 }))
    const snapshot = capturar(snapshotIniciado.then(() => upsertContaReceber({ storeId: L1, localKey: t2.localKey!, valor: 100,
      status: "pendente", replacePayload: true, payloadPatch: { carteiraId: wallet.id, historico: [] },
    })))
    const resultados = Promise.all([lote, snapshot])
    try {
      await esperarLocks(1)
      iniciarSnapshot()
      console.info("G002_N10_LOCK_WAIT", JSON.stringify(await esperarLocks(2)))
    } finally {
      iniciarSnapshot(); soltar(); await Promise.all([gate, resultados])
    }
    const settled = await resultados
    console.info("G002_N10_OUTCOMES", JSON.stringify(settled.map(r => r.status === "rejected" ? String(r.reason) : r.status)))
    expect(settled.map(r => r.status)).toEqual(["fulfilled", "fulfilled"])
    expect(settled[0].status === "fulfilled" && settled[0].value.totalRecebido).toBe(50)
    expect(await prisma.movimentacaoFinanceira.count({ where: { referenciaId: { in: [t1.id, t2.id] } } })).toBe(2)
    expect(await prisma.caixaOperacao.count({ where: { sessaoId: sessao.id, valor: 50 } })).toBe(1)
    expect((await prisma.carteiraFinanceira.findUniqueOrThrow({ where: { id: wallet.id } })).saldoAtual).toBe(150)
    const saved = await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { id: t2.id } })
    expect(saved).toMatchObject({ valor: 100, status: "parcial", perfilId: E1 })
    expect((saved.payload as { historico: unknown[] }).historico).toHaveLength(1)
  })

  it("N11 lotes distintos conservam ordem global de carteiras mesmo com títulos e sessões diferentes", async () => {
    const a = await criarCarteira({ storeId: L1, nome: "N11 A", tipo: "banco", saldoInicial: 100 })
    const b = await criarCarteira({ storeId: L1, nome: "N11 B", tipo: "banco", saldoInicial: 100 })
    const rows: Awaited<ReturnType<typeof upsertContaReceber>>[] = []
    for (const [i, carteiraId] of [a.id, b.id, b.id, a.id].entries()) rows.push(await upsertContaReceber({
      storeId: L1, localKey: `N11-${i}`, valor: 100, payloadPatch: { carteiraId },
    }))
    const sessoes = await Promise.all(["N11 A", "N11 B"].map(operador => prisma.sessaoCaixa.create({ data: { storeId: L1, operador } })))
    let pronto!: () => void, soltar!: () => void
    const gatePronto = new Promise<void>(resolve => { pronto = resolve })
    const gateSolto = new Promise<void>(resolve => { soltar = resolve })
    const gate = prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM contas_receber_titulos WHERE "storeId"=${L1} AND id IN (${rows[1].id},${rows[3].id}) ORDER BY id FOR UPDATE`
      pronto(); await gateSolto
    }, { timeout: 15_000 })
    await gatePronto
    const executar = async (n: number) => {
      const input = { idempotencyKey: `N11-lote-${n}`, itens: rows.slice(n * 2, n * 2 + 2).map(t => ({
        tituloId: t.id, localKey: t.localKey!, saldoEsperado: 100, valorReceber: 20,
      })) }
      const v = validarRecebimentoLote(input)
      if (!v.ok) throw new Error("Fixture N11 inválida")
      return prisma.$transaction(tx => executarRecebimentoLote(tx, { storeId: L1, sessaoId: sessoes[n].id,
        formaPagamento: "pix", userLabel: "Fixture N11", idempotencyKey: input.idempotencyKey,
      }, v.itens), { timeout: 15_000 })
    }
    const resultados = Promise.allSettled([executar(0), executar(1)])
    try {
      let waits: Array<{ wait_event: string }> = []
      for (let n = 0; n < 150; n++) {
        waits = await prisma.$queryRaw<Array<{ wait_event: string }>>`SELECT wait_event FROM pg_stat_activity WHERE datname=current_database() AND usename=current_user AND state='active' AND wait_event_type='Lock'`
        if (waits.length >= 2) break
        await new Promise(resolve => setTimeout(resolve, 10))
      }
      expect(waits.length).toBeGreaterThanOrEqual(2)
      console.info("G002_N11_LOCK_WAIT", JSON.stringify(waits))
    } finally { soltar(); await Promise.all([gate, resultados]) }
    const settled = await resultados
    console.info("G002_N11_OUTCOMES", JSON.stringify(settled.map(r => r.status === "rejected" ? String(r.reason) : r.status)))
    expect(settled.map(r => r.status)).toEqual(["fulfilled", "fulfilled"])
    expect(await prisma.movimentacaoFinanceira.count({ where: { referenciaId: { in: rows.map(t => t.id) } } })).toBe(4)
    expect(await prisma.caixaOperacao.count({ where: { sessaoId: { in: sessoes.map(s => s.id) }, valor: 40 } })).toBe(2)
    expect((await prisma.carteiraFinanceira.findUniqueOrThrow({ where: { id: a.id } })).saldoAtual).toBe(140)
    expect((await prisma.carteiraFinanceira.findUniqueOrThrow({ where: { id: b.id } })).saldoAtual).toBe(140)
  })

  it("N2 trigger exige fatos reais de mesma referência, direção, família, conta e escopo no estorno inativo", async () => {
    const a = await criarCarteira({ storeId: L1, nome: "N2 original", tipo: "banco" })
    const b = await criarCarteira({ storeId: L1, nome: "N2 outra conta", tipo: "banco" })
    const cases = ["pagar_parcial", "pagar_parcial_1", "receber_parcial", "receber_parcial_1"] as const
    for (const origem of cases) {
      // Legado sem perfil é válido só na loja empresarial explícita; nenhuma loja fictícia.
      await prisma.movimentacaoFinanceira.create({ data: { storeId: L1, carteiraId: a.id, perfilId: null,
        referenciaId: `N2-${origem}`, origem, tipo: origem.startsWith("pagar") ? "saida" : "entrada", valor: 20,
      } })
    }
    await prisma.carteiraFinanceira.updateMany({ where: { id: { in: [a.id, b.id] } }, data: { ativo: false } })
    const inserir = (id: string, ref: string, origem: string, tipo: string, valor: number, carteiraId = a.id, perfilId = E1, storeId = L1) =>
      prisma.$executeRaw`INSERT INTO movimentacoes_financeiras (id,"storeId","perfilId",tipo,valor,origem,"referenciaId","carteiraId")
        VALUES (${id},${storeId},${perfilId},${tipo},${valor},${origem},${ref},${carteiraId})`
    for (const origem of cases) {
      const pagar = origem.startsWith("pagar")
      expect(await inserir(`N2-valido-${origem}`, `N2-${origem}`, pagar ? "estorno_pagar" : "estorno_receber", pagar ? "entrada" : "saida", 20)).toBe(1)
    }
    const ref = "N2-pagar_parcial"
    const invalidos = [
      { id: "referencia", ref: "N2-inexistente" },
      { id: "familia", origem: "estorno_receber", tipo: "saida" },
      { id: "direcao", tipo: "saida" },
      { id: "conta", carteiraId: b.id },
      { id: "perfil", perfilId: E2 },
      { id: "loja", storeId: L2, perfilId: E2 },
      { id: "zero", valor: 0 }, { id: "negativo", valor: -20 },
    ]
    for (const p of invalidos) {
      const input = { ref, origem: "estorno_pagar", tipo: "entrada", valor: 20, carteiraId: a.id, perfilId: E1, storeId: L1, ...p }
      await expect(inserir(`N2-negativo-${p.id}`, input.ref, input.origem, input.tipo, input.valor, input.carteiraId, input.perfilId, input.storeId)).rejects.toMatchObject({ meta: { code: "23514" } })
    }
    // Reconciliação #397: o trigger agora exige estorno <= líquido ainda movimentado na conta.
    // O limite documentado no G002 (compensação SQL repetida aceita) foi fechado: a 2ª
    // compensação integral do mesmo fato é recusada pelo banco.
    await expect(inserir("N2-limite-sql", ref, "estorno_pagar", "entrada", 20)).rejects.toMatchObject({ meta: { code: "23514" } })
    expect(await prisma.movimentacaoFinanceira.count({ where: { id: { startsWith: "N2-negativo-" } } })).toBe(0)
  })

  for (const [kind, handler] of [["pagar", pagarPersist], ["receber", receberPersist]] as const) {
    it(`mede snapshot ${kind} de 8000 linhas e re-sync sem duplicação no cluster local`, async () => {
      const rows = Array.from({ length: 8000 }, (_, i) => ({ id: `vazao-${kind}-${i}`, descricao: "Fixture de vazão", valor: 10 }))
      for (const phase of ["insercao", "replay"] as const) {
        config.queryCount = 0
        const start = performance.now()
        const response = await handler(request(L3, rows))
        const elapsedMs = Math.round(performance.now() - start), queries = config.queryCount
        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({ ok: true, count: 8000 })
        console.info("G002_SYNC_8000", JSON.stringify({ kind, phase, elapsedMs, queries, queriesPerRow: queries / 8000,
          qualification: "Cluster PostgreSQL local próprio; não mede RTT, carga ou timeout de produção." }))
      }
      const count = kind === "pagar" ? await prisma.contaPagarTitulo.count({ where: { storeId: L3 } })
        : await prisma.contaReceberTitulo.count({ where: { storeId: L3 } })
      expect(count).toBe(8000)
      expect(await prisma.financeiroPerfil.count({ where: { storeId: L3 } })).toBe(1)
      expect(await prisma.perfilMembro.count({ where: { storeId: L3 } })).toBe(0)
      expect(await prisma.movimentacaoFinanceira.count({ where: { storeId: L3 } })).toBe(0)
    }, 300_000)
  }

  it("SQL conserva categoria/título históricos desativados, mas recusa novas associações e escopo estrangeiro", async () => {
    const ctx = await context(E1, L1), cat = await categoria(ctx), account = await conta(ctx)
    const row = await titulo(ctx, { chave: "historico-inativo", categoriaId: cat.id })
    const move = await criarMovimentoFinanceiro(ctx, { tipo: "saida", valorCentavos: "1000", descricao: "Histórico",
      categoriaId: cat.id, pagarTituloId: row.id, carteiraId: account.id, formaPagamento: "pix" })
    await definirCategoriaGastoAtiva(ctx, { id: cat.id, ativo: false })
    await prisma.contaPagarTitulo.update({ where: { id: row.id }, data: { ativo: false } })
    await prisma.$executeRaw`UPDATE movimentacoes_financeiras SET descricao = 'Metadado histórico' WHERE id = ${move.id}`
    const fresh = await prisma.movimentacaoFinanceira.create({ data: { storeId: L1, perfilId: E1, tipo: "saida", valor: 10 } })
    await expect(prisma.$executeRaw`UPDATE movimentacoes_financeiras SET "categoriaId" = ${cat.id} WHERE id = ${fresh.id}`).rejects.toMatchObject({ meta: { code: "23514" } })
    await expect(prisma.$executeRaw`UPDATE movimentacoes_financeiras SET "pagarTituloId" = ${row.id} WHERE id = ${fresh.id}`).rejects.toMatchObject({ meta: { code: "23514" } })
    const foreign = await prisma.categoriaGasto.create({ data: { storeId: L2, perfilId: E2, nome: "Outra", nomeNormalizado: "outra", natureza: "DESPESA" } })
    await expect(prisma.$executeRaw`UPDATE movimentacoes_financeiras SET "categoriaId" = ${foreign.id} WHERE id = ${move.id}`).rejects.toMatchObject({ meta: { code: "23514" } })
    expect(await prisma.movimentacaoFinanceira.findUniqueOrThrow({ where: { id: move.id } })).toMatchObject({ categoriaId: cat.id, pagarTituloId: row.id, descricao: "Metadado histórico" })
  })

  // Contrato 20261126150000 (runtime restrito): papel não dono e sem contexto vê o EMPRESARIAL
  // (como antes das migrations — senão PDV/Financeiro ficariam indisponíveis) e NENHUMA linha pessoal.
  it("papel não owner com SELECT concedido não vê nenhuma linha pessoal por RLS e vê o empresarial", async () => {
    const p = await context(), c = await conta(p)
    await titulo(p, { carteiraId: c.id })
    const pessoaisDono = await prisma.carteiraFinanceira.count({ where: { storeId: null } })
    expect(pessoaisDono).toBeGreaterThan(0)
    const empresaDono = await prisma.carteiraFinanceira.count({ where: { storeId: { not: null } } })
    await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE gastos_g002_anon")
      const [identity] = await tx.$queryRaw<Array<{ user: string }>>`SELECT current_user AS user`
      expect(identity.user).toBe("gastos_g002_anon")
      expect(await tx.financeiroPerfil.count({ where: { tipo: "PESSOAL" } })).toBe(0)
      expect(await tx.categoriaGasto.count({ where: { storeId: null } })).toBe(0)
      expect(await tx.carteiraFinanceira.count({ where: { storeId: null } })).toBe(0)
      expect(await tx.contaPagarTitulo.count({ where: { storeId: null } })).toBe(0)
      expect(await tx.contaReceberTitulo.count({ where: { storeId: null } })).toBe(0)
      expect(await tx.movimentacaoFinanceira.count({ where: { storeId: null } })).toBe(0)
      expect(await tx.carteiraFinanceira.count({ where: { storeId: { not: null } } })).toBe(empresaDono)
    })
  })

})
