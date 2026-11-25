/**
 * Integração REAL com PostgreSQL descartável — OMNI-PDV-TROCAS-DEVOLUCOES-INTEGRIDADE-HISTORICO-P1-001.
 *
 * Roda o serviço de produção (`registrarTroca`, motor canônico de venda, ledger de estoque,
 * crédito, financeiro) e a rota legada `/api/ops/devolucao` contra um banco local com o
 * schema do repositório. Só executa com `TROCAS_PG_URL` em loopback — nunca produção.
 *
 *   TROCAS_PG_URL=postgresql://pgadmin@127.0.0.1:<porta>/<db> npx vitest run lib/pdv/trocas/troca-service.pg.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

const PG_URL = process.env.TROCAS_PG_URL?.trim() ?? ""
function isLoopback(raw: string): boolean {
  try {
    const host = new URL(raw).hostname.replace(/^\[|\]$/g, "")
    return host === "127.0.0.1" || host === "localhost" || host === "::1"
  } catch {
    return false
  }
}
if (PG_URL && !isLoopback(PG_URL)) throw new Error("TROCAS_PG_URL precisa ser um PostgreSQL descartável em loopback.")
const RUN = Boolean(PG_URL)

const SUF = Math.random().toString(36).slice(2, 7)
const LOJA = `trc-a-${SUF}`
const LOJA_B = `trc-b-${SUF}`

const authState = vi.hoisted(() => ({ session: null as unknown }))
vi.mock("@/auth", () => ({ auth: async () => authState.session }))
vi.mock("@/lib/auth/module-access", () => ({ requireModuleApi: async () => null }))
vi.mock("@/lib/auth/api-enterprise-guard", () => ({ apiGuardEnterpriseOrOps: async () => null }))
vi.mock("@/lib/auth/guard-enterprise", () => ({ requireEnterpriseWith: async () => ({ ok: true }) }))
vi.mock("@/lib/vendas/guard-estorno-venda", () => ({ requireEstornoStepUp: async () => ({ ok: true }) }))
vi.mock("@/lib/ops-api-gate", async (orig) => ({ ...(await orig<Record<string, unknown>>()), opsLojaIdFromRequest: (req: Request) => req.headers.get("x-assistec-loja-id") }))

type Db = any

describe.skipIf(!RUN)("trocas/devoluções — PostgreSQL descartável real", () => {
  let db: Db
  let svc: typeof import("./troca-service")
  let consulta: typeof import("./troca-consulta")
  let legacyPOST: (req: Request) => Promise<Response>
  let cancelarPOST: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>
  let sessaoAberta = ""
  let sessaoFechada = ""
  let opSeq = 0
  const op = () => `trc_pgtest${SUF}${String(++opSeq).padStart(4, "0")}`

  async function produto(id: string, name: string, price: number, stock: number, extra: Record<string, unknown> = {}) {
    await db.produto.create({ data: { id, storeId: LOJA, name, price, stock, ...extra } })
  }

  async function vendaOriginal(pedidoId: string, lines: Array<Record<string, unknown>>, opts: { total?: number; sessaoId?: string; clienteNome?: string; at?: Date } = {}) {
    const total = opts.total ?? lines.reduce((s, l) => s + Number(l.lineTotal), 0)
    await db.venda.create({
      data: {
        storeId: LOJA,
        pedidoId,
        total,
        status: "concluida",
        clienteNome: opts.clienteNome ?? null,
        at: opts.at ?? new Date(Date.now() - 3 * 86_400_000),
        payload: { id: pedidoId, lines, total, sessaoId: opts.sessaoId ?? null, paymentBreakdown: { cartaoCredito: total } },
        itens: {
          create: lines.map((l) => ({
            inventoryId: (l.inventoryId as string) || null,
            nome: l.name as string,
            quantidade: l.quantity as number,
            precoUnitario: l.unitPrice as number,
            lineTotal: l.lineTotal as number,
          })),
        },
      },
    })
  }

  const base = () => ({ storeId: LOJA, operadorLabel: "Operador PG", numeracaoServidor: true, sessaoId: sessaoAberta })

  async function contagens(pedidoId: string) {
    const devs = await db.devolucaoVenda.findMany({ where: { storeId: LOJA, vendaLocalId: pedidoId } })
    const devIds = devs.map((d: { id: string }) => d.id)
    const novas = await db.venda.findMany({ where: { storeId: LOJA, payload: { path: ["trocaOrigem", "vendaOrigem"], equals: pedidoId } } })
    const creditos = await db.clienteCredito.findMany({ where: { storeId: LOJA, vendaOrigemId: pedidoId } })
    const saidas = await db.movimentacaoFinanceira.findMany({ where: { storeId: LOJA, origem: "devolucao_pdv", referenciaId: { in: devIds } } })
    const entradas = await db.movimentacaoFinanceira.findMany({
      where: { storeId: LOJA, origem: "venda", referenciaId: { in: novas.map((n: { pedidoId: string }) => n.pedidoId) } },
    })
    return { devs, novas, creditos, saidas, entradas }
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = PG_URL
    process.env.DIRECT_URL = PG_URL
    authState.session = { user: { id: "pg-user", name: "Operador PG", role: "ADMIN" } }
    const { PrismaClient } = await import("@/generated/prisma")
    db = new PrismaClient({ datasources: { db: { url: PG_URL } }, log: [] })
    svc = await import("./troca-service")
    consulta = await import("./troca-consulta")
    ;({ POST: legacyPOST } = await import("@/app/api/ops/devolucao/route"))
    ;({ POST: cancelarPOST } = (await import("@/app/api/vendas/[id]/cancelar/route")) as unknown as { POST: typeof cancelarPOST })

    await db.store.create({ data: { id: LOJA, name: "Troca PG A", codigoNumeracaoVenda: `T${SUF.slice(0, 3).toUpperCase()}` } })
    await db.store.create({ data: { id: LOJA_B, name: "Troca PG B", codigoNumeracaoVenda: `U${SUF.slice(0, 3).toUpperCase()}` } })
    sessaoAberta = (await db.sessaoCaixa.create({ data: { storeId: LOJA, operador: "PG", status: "ABERTA" } })).id
    sessaoFechada = (
      await db.sessaoCaixa.create({
        data: { storeId: LOJA, operador: "PG", status: "FECHADA", abertaEm: new Date(Date.now() - 4 * 86_400_000), fechadaEm: new Date(Date.now() - 3 * 86_400_000 + 3_600_000) },
      })
    ).id

    await produto("ps4", "CONTROLE DE VIDEO GAME PS4 WIRELESS", 119.9, 0, { barcode: "0789000000017", sku: "CTRL-PS4" })
    await produto("x360", "CONTROLE DE VIDEO GAME X-360 PC PS3 SEM FIO", 129.9, 5, { barcode: "7890000000024" })
    await produto("cabo", "CABO DE CELULAR USB LIGHTNING 2 METROS KAIDI", 29.99, 10)
    await produto("p2", "CABO DE AUDIO P2 PARA P2 KAIDI KD-29", 15, 10, { barcode: "0001234567895" })
    await produto("barato", "PELICULA 3D", 30, 10)
  }, 120_000)

  afterAll(async () => {
    if (!db) return
    for (const storeId of [LOJA, LOJA_B]) {
      await db.usoCreditoCliente.deleteMany({ where: { storeId } })
      await db.clienteCredito.deleteMany({ where: { storeId } })
      await db.devolucaoVenda.deleteMany({ where: { storeId } })
      await db.movimentacaoFinanceira.deleteMany({ where: { storeId } })
      await db.movimentacaoEstoque.deleteMany({ where: { storeId } })
      await db.venda.deleteMany({ where: { storeId } })
      await db.serieVenda.deleteMany({ where: { storeId } })
      await db.produtoDeposito?.deleteMany?.({ where: { storeId } }).catch(() => undefined)
      await db.produto.deleteMany({ where: { storeId } })
      await db.sessaoCaixa.deleteMany({ where: { storeId } })
    }
    await db.$disconnect()
  })

  it("REGRESSÃO 000760: 119,90 → 129,90 com R$ 10,00 em dinheiro, sem CPF, atômica e confirmada após releitura", async () => {
    await vendaOriginal("VDA-PG-000760", [
      { inventoryId: "ps4", produtoId: "ps4", name: "CONTROLE DE VIDEO GAME PS4 WIRELESS", quantity: 1, unitPrice: 119.9, lineTotal: 119.9, itemType: "produto" },
    ], { sessaoId: sessaoFechada })
    const operationId = op()
    const out = await svc.registrarTroca({
      ...base(),
      operationId,
      pedidoIdOrigem: "VDA-PG-000760",
      modo: "troca",
      linhas: [{ lineIndex: 0, quantidade: 1 }],
      novosItens: [{ produtoId: "x360", quantidade: 1 }],
      formaDiferenca: "dinheiro",
      motivo: "nao deu certo",
    })
    expect(out.replayed).toBe(false)
    expect(out.resultado).toMatchObject({ valorDevolvido: 119.9, totalNovaCompra: 129.9, creditoAplicado: 119.9, diferenca: { valor: 10, forma: "dinheiro" }, excedente: { valor: 0 }, valeEmitido: 0 })
    const c = await contagens("VDA-PG-000760")
    expect(c.devs).toHaveLength(1)
    expect(c.novas).toHaveLength(1)
    expect(c.novas[0].pedidoId).toBe(out.resultado.novaVenda!.pedidoId)
    expect(c.novas[0].total).toBe(129.9)
    // Crédito da troca: nasce e é consumido na MESMA transação — nenhum vale residual.
    expect(c.creditos).toHaveLength(1)
    expect(c.creditos[0]).toMatchObject({ valorOriginal: 119.9, saldoAtual: 0, status: "zerado", clienteDoc: "" })
    const usos = await db.usoCreditoCliente.findMany({ where: { creditoId: c.creditos[0].id } })
    expect(usos).toHaveLength(1)
    expect(usos[0]).toMatchObject({ valor: 119.9, vendaId: c.novas[0].pedidoId })
    // Financeiro: só R$ 10,00 de entrada efetiva; nenhuma saída fictícia pelo crédito.
    expect(c.saidas).toHaveLength(0)
    expect(c.entradas).toHaveLength(1)
    expect(c.entradas[0].valor).toBe(10)
    // Estoque: PS4 volta (+1), X360 baixa (-1).
    expect((await db.produto.findUnique({ where: { id: "ps4" } })).stock).toBe(1)
    expect((await db.produto.findUnique({ where: { id: "x360" } })).stock).toBe(4)
    // Vínculo persistido e status da original.
    expect((await db.venda.findFirst({ where: { storeId: LOJA, pedidoId: "VDA-PG-000760" } })).status).toBe("devolvida")
    expect(c.devs[0].payload.resultado.novaVenda.pedidoId).toBe(c.novas[0].pedidoId)
    // A sessão histórica FECHADA não foi tocada: devolução e venda nova na sessão aberta.
    expect(c.devs[0].sessaoId).toBe(sessaoAberta)
    expect(c.novas[0].payload.sessaoId).toBe(sessaoAberta)
    // Releitura servidor: disponível 0 e a troca aparece no histórico com a venda substituta.
    const view = await consulta.detalheVendaParaTroca(LOJA, "VDA-PG-000760")
    expect(view!.linhas[0]).toMatchObject({ devolvido: 1, disponivel: 0 })
    expect(view!.devolucoes[0]).toMatchObject({ tipo: "troca", status: "confirmada", novaVenda: { pedidoId: c.novas[0].pedidoId }, diferenca: { valor: 10, forma: "dinheiro" } })
    const nova = await consulta.detalheVendaParaTroca(LOJA, c.novas[0].pedidoId)
    expect(nova!.trocaOrigem).toMatchObject({ vendaOrigem: "VDA-PG-000760" })

    // Reenvio (resposta perdida / clique duplo): mesmo resultado, nada duplicado.
    const replay = await svc.registrarTroca({
      ...base(),
      operationId,
      pedidoIdOrigem: "VDA-PG-000760",
      modo: "troca",
      linhas: [{ lineIndex: 0, quantidade: 1 }],
      novosItens: [{ produtoId: "x360", quantidade: 1 }],
      formaDiferenca: "dinheiro",
      motivo: "nao deu certo",
    })
    expect(replay.replayed).toBe(true)
    expect(replay.resultado.novaVenda!.pedidoId).toBe(c.novas[0].pedidoId)
    const c2 = await contagens("VDA-PG-000760")
    expect([c2.devs.length, c2.novas.length, c2.creditos.length, c2.entradas.length]).toEqual([1, 1, 1, 1])
    expect((await db.produto.findUnique({ where: { id: "x360" } })).stock).toBe(4)

    // Mesma chave com outros dados → recusa explícita.
    await expect(
      svc.registrarTroca({ ...base(), operationId, pedidoIdOrigem: "VDA-PG-000760", modo: "troca", linhas: [{ lineIndex: 0, quantidade: 1 }], novosItens: [{ produtoId: "cabo", quantidade: 1 }], formaDiferenca: "dinheiro" }),
    ).rejects.toMatchObject({ code: "OPERACAO_REUTILIZADA" })
    // Nova operação na mesma venda → nada disponível.
    await expect(
      svc.registrarTroca({ ...base(), operationId: op(), pedidoIdOrigem: "VDA-PG-000760", modo: "troca", linhas: [{ lineIndex: 0, quantidade: 1 }], novosItens: [{ produtoId: "x360", quantidade: 1 }], formaDiferenca: "dinheiro" }),
    ).rejects.toMatchObject({ code: "DEVOLUCAO_ACIMA_DO_DISPONIVEL" })
  }, 60_000)

  it("falha da nova venda (estoque insuficiente) reverte TUDO: sem devolução, crédito ou estoque", async () => {
    await db.produto.update({ where: { id: "barato" }, data: { stock: 0 } })
    await vendaOriginal("VDA-PG-FALHA", [{ inventoryId: "cabo", produtoId: "cabo", name: "CABO DE CELULAR USB LIGHTNING 2 METROS KAIDI", quantity: 1, unitPrice: 29.99, lineTotal: 29.99 }])
    const antes = (await db.produto.findUnique({ where: { id: "cabo" } })).stock
    await expect(
      svc.registrarTroca({ ...base(), operationId: op(), pedidoIdOrigem: "VDA-PG-FALHA", modo: "troca", linhas: [{ lineIndex: 0, quantidade: 1 }], novosItens: [{ produtoId: "barato", quantidade: 1 }], destinoExcedente: "dinheiro" }),
    ).rejects.toBeTruthy()
    const c = await contagens("VDA-PG-FALHA")
    expect([c.devs.length, c.novas.length, c.creditos.length, c.saidas.length]).toEqual([0, 0, 0, 0])
    expect((await db.produto.findUnique({ where: { id: "cabo" } })).stock).toBe(antes)
    await db.produto.update({ where: { id: "barato" }, data: { stock: 10 } })
  })

  it("caixa fechado e sessão de outra loja bloqueiam antes de qualquer escrita", async () => {
    await vendaOriginal("VDA-PG-CAIXA", [{ inventoryId: "cabo", name: "CABO", quantity: 1, unitPrice: 29.99, lineTotal: 29.99 }])
    await expect(
      svc.registrarTroca({ ...base(), sessaoId: sessaoFechada, operationId: op(), pedidoIdOrigem: "VDA-PG-CAIXA", modo: "troca", linhas: [{ lineIndex: 0, quantidade: 1 }], novosItens: [{ produtoId: "x360", quantidade: 1 }] }),
    ).rejects.toMatchObject({ code: "CAIXA_FECHADO" })
    await expect(
      svc.registrarTroca({ ...base(), sessaoId: null, operationId: op(), pedidoIdOrigem: "VDA-PG-CAIXA", modo: "reembolso", formaReembolso: "dinheiro", linhas: [{ lineIndex: 0, quantidade: 1 }] }),
    ).rejects.toMatchObject({ code: "CAIXA_FECHADO" })
    expect((await contagens("VDA-PG-CAIXA")).devs).toHaveLength(0)
  })

  it("concorrência real: duas operações diferentes sobre a última unidade → exatamente uma vence", async () => {
    await vendaOriginal("VDA-PG-CONC", [{ inventoryId: "cabo", produtoId: "cabo", name: "CABO", quantity: 1, unitPrice: 29.99, lineTotal: 29.99 }])
    const mk = () =>
      svc.registrarTroca({ ...base(), operationId: op(), pedidoIdOrigem: "VDA-PG-CONC", modo: "vale_credito", clienteDoc: "12345678909", clienteNome: "Cliente PG", linhas: [{ lineIndex: 0, quantidade: 1 }] })
    const r = await Promise.allSettled([mk(), mk(), mk()])
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1)
    const rej = r.filter((x): x is PromiseRejectedResult => x.status === "rejected")
    expect(rej.every((x) => (x.reason as { code?: string }).code === "DEVOLUCAO_ACIMA_DO_DISPONIVEL")).toBe(true)
    const c = await contagens("VDA-PG-CONC")
    expect(c.devs).toHaveLength(1)
    expect(c.creditos).toHaveLength(1)
    expect(c.saidas).toHaveLength(0) // vale não é saída de caixa
  }, 60_000)

  it("concorrência real: a MESMA operação em duas abas → uma grava, a outra é replay", async () => {
    await vendaOriginal("VDA-PG-ABAS", [{ inventoryId: "cabo", produtoId: "cabo", name: "CABO", quantity: 2, unitPrice: 29.99, lineTotal: 59.98 }])
    const operationId = op()
    const mk = () =>
      svc.registrarTroca({ ...base(), operationId, pedidoIdOrigem: "VDA-PG-ABAS", modo: "troca", linhas: [{ lineIndex: 0, quantidade: 1 }], novosItens: [{ produtoId: "p2", quantidade: 1 }], destinoExcedente: "dinheiro" })
    const [a, b] = await Promise.all([mk(), mk()])
    expect([a.replayed, b.replayed].sort()).toEqual([false, true])
    const c = await contagens("VDA-PG-ABAS")
    expect([c.devs.length, c.novas.length]).toEqual([1, 1])
    // Excedente 29,99 − 15,00 = 14,99 devolvido em dinheiro: saída real, sem vale residual.
    expect(c.saidas).toHaveLength(1)
    expect(c.saidas[0].valor).toBe(14.99)
    expect(c.creditos[0]).toMatchObject({ valorOriginal: 15, saldoAtual: 0 })
    const view = await consulta.detalheVendaParaTroca(LOJA, "VDA-PG-ABAS")
    expect(view!.linhas[0]).toMatchObject({ devolvido: 1, disponivel: 1 })
  }, 60_000)

  it("reembolso, vale, apenas estoque, item avulso e produto removido", async () => {
    await vendaOriginal("VDA-PG-MIX", [
      { inventoryId: "p2", produtoId: "p2", name: "CABO DE AUDIO P2 PARA P2 KAIDI KD-29", quantity: 1, unitPrice: 15, lineTotal: 15 },
      { inventoryId: "avulso-1", name: "Capinha avulsa", quantity: 1, unitPrice: 20, lineTotal: 20, itemType: "avulso", isAvulso: true },
      { inventoryId: "removido-xyz", produtoId: "removido-xyz", name: "Produto apagado", quantity: 1, unitPrice: 10, lineTotal: 10 },
    ])
    const p2Antes = (await db.produto.findUnique({ where: { id: "p2" } })).stock
    // Vale exige titular.
    await expect(
      svc.registrarTroca({ ...base(), operationId: op(), pedidoIdOrigem: "VDA-PG-MIX", modo: "vale_credito", linhas: [{ lineIndex: 0, quantidade: 1 }] }),
    ).rejects.toMatchObject({ code: "TITULAR_OBRIGATORIO" })
    // Apenas estoque em avulso: sem vínculo → recusa (nada inventado).
    await expect(
      svc.registrarTroca({ ...base(), operationId: op(), pedidoIdOrigem: "VDA-PG-MIX", modo: "somente_estoque", linhas: [{ lineIndex: 1, quantidade: 1 }] }),
    ).rejects.toMatchObject({ code: "SEM_VINCULO_ESTOQUE" })
    // Reembolso do avulso + produto removido: saída financeira real, nenhum movimento de estoque.
    const movAntes = await db.movimentacaoEstoque.count({ where: { storeId: LOJA } })
    const r = await svc.registrarTroca({ ...base(), operationId: op(), pedidoIdOrigem: "VDA-PG-MIX", modo: "reembolso", formaReembolso: "pix", linhas: [{ lineIndex: 1, quantidade: 1 }, { lineIndex: 2, quantidade: 1 }] })
    expect(r.resultado.itensDevolvidos.map((i) => i.destino)).toEqual(["sem_vinculo_estoque", "sem_vinculo_estoque"])
    expect(r.resultado.reembolso).toMatchObject({ valor: 30, forma: "pix" })
    expect(await db.movimentacaoEstoque.count({ where: { storeId: LOJA } })).toBe(movAntes)
    // Apenas estoque do produto cadastrado: +1, sem crédito e sem financeiro.
    const e = await svc.registrarTroca({ ...base(), operationId: op(), pedidoIdOrigem: "VDA-PG-MIX", modo: "somente_estoque", linhas: [{ lineIndex: 0, quantidade: 1 }] })
    expect(e.resultado).toMatchObject({ valorDevolvido: 0, valeEmitido: 0, reembolso: null })
    expect((await db.produto.findUnique({ where: { id: "p2" } })).stock).toBe(p2Antes + 1)
    const c = await contagens("VDA-PG-MIX")
    expect(c.saidas).toHaveLength(1)
    expect(c.creditos).toHaveLength(0)
    expect((await db.venda.findFirst({ where: { storeId: LOJA, pedidoId: "VDA-PG-MIX" } })).status).toBe("devolvida")
  }, 60_000)

  it("busca servidor: nome histórico sem acento, EAN com zeros à esquerda, SKU, avulso, cliente e isolamento por loja", async () => {
    await vendaOriginal("VDA-PG-000767", [
      { inventoryId: "p2", produtoId: "p2", name: "CABO DE ÁUDIO P2 PARA P2 KAIDI KD-29", quantity: 1, unitPrice: 15, lineTotal: 15 },
      { inventoryId: "cabo", produtoId: "cabo", name: "CABO DE CELULAR USB LIGHTNING 2 METROS KAIDI", quantity: 1, unitPrice: 29.99, lineTotal: 29.99 },
    ], { clienteNome: "José Antônio" })
    const ids = async (q: string, storeId = LOJA) => (await consulta.buscarVendasParaTroca({ storeId, q, dias: 0, take: 30, skip: 0 })).vendas.map((v) => v.pedidoId)
    expect(await ids("cabo de audio p2")).toContain("VDA-PG-000767")
    expect(await ids("0001234567895")).toContain("VDA-PG-000767")
    expect(await ids("1234567895")).not.toContain("VDA-PG-000767") // zeros à esquerda não são descartados
    expect(await ids("0789000000017")).toContain("VDA-PG-000760") // EAN do PS4 → venda real
    expect(await ids("ctrl-ps4")).toContain("VDA-PG-000760") // SKU, sem diferenciar caixa
    expect(await ids("controle de video game ps4")).toContain("VDA-PG-000760")
    expect(await ids("capinha avulsa")).toContain("VDA-PG-MIX") // item avulso sem cadastro
    expect(await ids("Produto apagado")).toContain("VDA-PG-MIX") // produto removido do cadastro
    expect(await ids("jose antonio")).toContain("VDA-PG-000767")
    expect(await ids("pg-000767")).toEqual(["VDA-PG-000767"])
    expect(await ids("cabo de audio p2", LOJA_B)).toEqual([])
    const r = await consulta.buscarVendasParaTroca({ storeId: LOJA, q: "cabo", dias: 0, take: 2, skip: 0 })
    expect(r.vendas).toHaveLength(2)
    expect(r.hasMore).toBe(true)
    // Detalhe 000767: códigos vêm do CADASTRO ATUAL, rotulados como tal; snapshot vazio.
    const v = await consulta.detalheVendaParaTroca(LOJA, "VDA-PG-000767")
    expect(v!.linhas[0]).toMatchObject({ snapshotBarcode: "", cadastroAtual: { barcode: "0001234567895" }, situacaoCadastro: "cadastrado" })
    expect(await consulta.detalheVendaParaTroca(LOJA_B, "VDA-PG-000767")).toBeNull()
  }, 60_000)

  it("multiloja: a venda de uma loja não é encontrada pela outra", async () => {
    await expect(
      svc.registrarTroca({ ...base(), storeId: LOJA_B, sessaoId: null, operationId: op(), pedidoIdOrigem: "VDA-PG-000767", modo: "somente_estoque", linhas: [{ lineIndex: 0, quantidade: 1 }] }),
    ).rejects.toMatchObject({ code: "VENDA_NAO_ENCONTRADA" })
  })

  describe("cancelamento depois de troca/vale (revisão independente P1)", () => {
    const cancelar = (pedidoId: string) =>
      cancelarPOST(
        new Request(`http://local/api/vendas/${pedidoId}/cancelar`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-assistec-loja-id": LOJA },
          body: JSON.stringify({ motivo: "teste pg", forcar: true }),
        }),
        { params: Promise.resolve({ id: pedidoId }) },
      )

    it("venda à vista virou vale integral: cancelar NÃO estorna em dinheiro o que já virou crédito", async () => {
      await vendaOriginal("VDA-PG-CANC1", [{ inventoryId: "p2", produtoId: "p2", name: "P2", quantity: 1, unitPrice: 15, lineTotal: 15 }])
      await db.movimentacaoFinanceira.create({ data: { storeId: LOJA, tipo: "entrada", valor: 15, descricao: "Venda PDV VDA-PG-CANC1", origem: "venda", referenciaId: "VDA-PG-CANC1" } })
      await svc.registrarTroca({ ...base(), operationId: op(), pedidoIdOrigem: "VDA-PG-CANC1", modo: "vale_credito", clienteDoc: "12345678909", clienteNome: "Cliente PG", linhas: [{ lineIndex: 0, quantidade: 1 }] })
      const res = await cancelar("VDA-PG-CANC1")
      const corpo = await res.json()
      expect(res.status, JSON.stringify(corpo)).toBe(200)
      expect((await db.venda.findFirst({ where: { storeId: LOJA, pedidoId: "VDA-PG-CANC1" } })).status).toBe("cancelada")
      const estornos = await db.movimentacaoFinanceira.findMany({ where: { storeId: LOJA, referenciaId: "VDA-PG-CANC1", origem: "cancelamento_pdv" } })
      expect(estornos.reduce((s: number, m: { valor: number }) => s + m.valor, 0)).toBe(0)
    }, 60_000)

    it("venda substituta de troca não é cancelada pela rota de cancelamento", async () => {
      const nova = (await contagens("VDA-PG-000760")).novas[0]
      const res = await cancelar(nova.pedidoId)
      expect(res.status).toBe(409)
      expect((await res.json()).code).toBe("VENDA_DE_TROCA")
      expect((await db.venda.findFirst({ where: { id: nova.id } })).status).not.toBe("cancelada")
    })
  })

  describe("rota legada /api/ops/devolucao (fila antiga)", () => {
    function post(body: Record<string, unknown>) {
      return legacyPOST(new Request("http://local/api/ops/devolucao", { method: "POST", headers: { "content-type": "application/json", "x-assistec-loja-id": LOJA }, body: JSON.stringify(body) }))
    }
    const corpo = (localId: string, vendaLocalId: string, inventoryId: string, quantidade: number, tipo = "vale_credito") => ({
      localId,
      vendaLocalId,
      tipo,
      valorTotal: 15 * quantidade,
      creditoEmitido: tipo === "vale_credito" ? 15 * quantidade : 0,
      clienteNome: "Cliente",
      clienteDoc: "12345678909",
      itens: [{ inventoryId, nome: "P2", quantidade, valorUnitario: 15, valorTotal: 15 * quantidade }],
    })

    it("colisão de DEV-AAAA-NNNN entre terminais → 409, nunca ok silencioso", async () => {
      await vendaOriginal("VDA-PG-LEG1", [{ inventoryId: "p2", produtoId: "p2", name: "P2", quantity: 3, unitPrice: 15, lineTotal: 45 }])
      await vendaOriginal("VDA-PG-LEG2", [{ inventoryId: "p2", produtoId: "p2", name: "P2", quantity: 3, unitPrice: 15, lineTotal: 45 }])
      const r1 = await post(corpo(`DEV-2026-0001-${SUF}`, "VDA-PG-LEG1", "p2", 1))
      expect(r1.status).toBe(200)
      const replay = await post(corpo(`DEV-2026-0001-${SUF}`, "VDA-PG-LEG1", "p2", 1))
      expect((await replay.json()).idempotente).toBe(true)
      const colisao = await post(corpo(`DEV-2026-0001-${SUF}`, "VDA-PG-LEG2", "p2", 1))
      expect(colisao.status).toBe(409)
      expect((await colisao.json()).code).toBe("DEVOLUCAO_LOCAL_ID_COLISAO")
    })

    it("quantidade é autoridade do servidor e vale não gera saída financeira", async () => {
      const acima = await post(corpo(`DEV-2026-0002-${SUF}`, "VDA-PG-LEG1", "p2", 3))
      expect(acima.status).toBe(409)
      expect((await acima.json()).code).toBe("DEVOLUCAO_ACIMA_DO_DISPONIVEL")
      const devs = await db.devolucaoVenda.findMany({ where: { storeId: LOJA, vendaLocalId: "VDA-PG-LEG1" }, select: { id: true } })
      const saidas = await db.movimentacaoFinanceira.count({ where: { storeId: LOJA, origem: "devolucao_pdv", referenciaId: { in: devs.map((d: { id: string }) => d.id) } } })
      expect(saidas).toBe(0)
      const reembolso = await post(corpo(`DEV-2026-0003-${SUF}`, "VDA-PG-LEG1", "p2", 1, "devolucao"))
      expect(reembolso.status).toBe(200)
      const id = (await reembolso.json()).devolucaoId
      expect(await db.movimentacaoFinanceira.count({ where: { storeId: LOJA, origem: "devolucao_pdv", referenciaId: id } })).toBe(1)
    })
  })
})
