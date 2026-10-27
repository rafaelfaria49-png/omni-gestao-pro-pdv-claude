/**
 * Integração REAL com PostgreSQL descartável (RELATORIOS-PRODUTOS-VENDIDOS-REAL-001).
 *
 * Roda os handlers de produção `GET /api/vendas/produtos-vendidos` (+ `/variantes`)
 * com o Prisma de verdade: prova groupBy com filtro relacional, coorte por período,
 * canceladas, devoluções (inclusive após o período e acima do vendido), linha legada
 * por SKU, isolamento entre lojas e volume (2 mil vendas).
 *
 * Só executa com `PRODUTOS_VENDIDOS_PG_URL` em loopback — nunca produção.
 *   initdb + pg_ctl em diretório temporário; `prisma db push` com DATABASE_URL local;
 *   PRODUTOS_VENDIDOS_PG_URL=postgresql://user@127.0.0.1:<porta>/<db> npx vitest run lib/relatorios/produtos-vendidos.pg.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

const PG_URL = process.env.PRODUTOS_VENDIDOS_PG_URL?.trim() ?? ""

function isLoopback(raw: string): boolean {
  try {
    const host = new URL(raw).hostname.replace(/^\[|\]$/g, "")
    return host === "127.0.0.1" || host === "localhost" || host === "::1"
  } catch {
    return false
  }
}

if (PG_URL && !isLoopback(PG_URL)) {
  throw new Error("PRODUTOS_VENDIDOS_PG_URL precisa ser um PostgreSQL descartável em loopback.")
}

const RUN = Boolean(PG_URL)
const SUFIXO = Math.random().toString(36).slice(2, 8)
const LOJA_A = `pvpg-a-${SUFIXO}`
const LOJA_B = `pvpg-b-${SUFIXO}`
/** Vendas extras de volume; `PRODUTOS_VENDIDOS_PG_VOLUME` permite medir cargas maiores. */
const VOLUME = Number.parseInt(process.env.PRODUTOS_VENDIDOS_PG_VOLUME ?? "", 10) || 2000

const auth = vi.hoisted(() => ({ session: null as unknown }))
vi.mock("@/auth", () => ({ auth: async () => auth.session }))

type Produto = {
  produtoId: string | null
  nome: string
  tipo: string
  quantidadeBruta: number
  quantidadeDevolvida: number
  quantidadeLiquida: number
  receitaBruta: number
  receitaLiquida: number
  nomesNaVenda: string[]
}
type Resp = {
  ok: boolean
  produtos: Produto[]
  totalProdutos: number
  categorias: Array<{ chave: string; nome: string; quantidadeLiquida: number }>
  totais: Record<string, number>
  vendas: { quantidade: number; total: number }
  canceladas: { quantidade: number; total: number }
  diagnostico: { devolucoesSemVenda: { documentos: number }; quantidadeDevolvidaDescartada: number; ajusteNaoRateado: number }
}

type Db = any

describe.skipIf(!RUN)("produtos vendidos — PostgreSQL descartável real", () => {
  let GET: (req: Request) => Promise<Response>
  let GET_VARIANTES: (req: Request) => Promise<Response>
  let db: Db
  const OUT = "from=2026-10-01T03:00:00.000Z&to=2026-11-01T02:59:59.999Z"
  const SET = "from=2026-09-01T03:00:00.000Z&to=2026-10-01T02:59:59.999Z"
  const dia = (d: number, m = 10) => new Date(Date.UTC(2026, m - 1, d, 15, 0, 0))
  const P = { pel: `pel-${SUFIXO}`, capa: `capa-${SUFIXO}`, cabo: `cabo-${SUFIXO}`, pelB: `pelb-${SUFIXO}` }

  async function relatorio(query: string, storeId = LOJA_A): Promise<Resp> {
    const res = await GET(new Request(`http://local/api/vendas/produtos-vendidos?${query}`, { headers: { "x-assistec-loja-id": storeId } }))
    expect(res.status).toBe(200)
    return (await res.json()) as Resp
  }
  const achar = (r: Resp, id: string) => r.produtos.find((p) => p.produtoId === id)

  beforeAll(async () => {
    process.env.DATABASE_URL = PG_URL
    auth.session = {
      user: {
        id: "pv-pg-user", role: "ADMIN", accessScope: "STORE", platformAuthority: false, mustChangePassword: false,
        allowedStoreIds: [LOJA_A, LOJA_B], storeAccess: "restricted",
        storeModules: { [LOJA_A]: ["sales", "reports"], [LOJA_B]: ["sales", "reports"] },
      },
    }
    const { PrismaClient } = await import("@/generated/prisma")
    db = new PrismaClient({ datasources: { db: { url: PG_URL } }, log: [] })
    ;({ GET } = await import("@/app/api/vendas/produtos-vendidos/route"))
    ;({ GET: GET_VARIANTES } = await import("@/app/api/vendas/produtos-vendidos/variantes/route"))

    await db.store.createMany({ data: [{ id: LOJA_A, name: "PV PG A" }, { id: LOJA_B, name: "PV PG B" }] })
    await db.categoriaProduto.create({ data: { storeId: LOJA_A, slug: "peliculas", nome: "Películas" } })
    await db.produto.createMany({
      data: [
        { id: P.pel, storeId: LOJA_A, name: "Película 3D", sku: `PEL-${SUFIXO}`, category: "peliculas", price: 30 },
        { id: P.capa, storeId: LOJA_A, name: "Capinha Silicone", category: "Capinhas", price: 50 },
        { id: P.cabo, storeId: LOJA_A, name: "Cabo USB-C", price: 25 },
        // Mesmo SKU na outra loja: nunca pode se misturar.
        { id: P.pelB, storeId: LOJA_B, name: "Película B", sku: `PEL-${SUFIXO}`, category: "peliculas", price: 30 },
      ],
    })

    type Linha = { inventoryId: string; nome: string; quantidade: number; precoUnitario: number; sel?: unknown }
    const vendas: any[] = []
    const itens: any[] = []
    const venda = (storeId: string, pedidoId: string, at: Date, linhas: Linha[], status = "concluida") => {
      const id = `${storeId}-${pedidoId}`
      const total = linhas.reduce((s, l) => s + l.quantidade * l.precoUnitario, 0)
      vendas.push({
        id, storeId, pedidoId: `${pedidoId}-${SUFIXO}`, at, status, total,
        payload: {
          id: `${pedidoId}-${SUFIXO}`,
          lines: linhas.map((l) => ({
            inventoryId: l.inventoryId, name: l.nome, quantity: l.quantidade, unitPrice: l.precoUnitario,
            lineTotal: l.quantidade * l.precoUnitario, ...(l.sel ? { accessorySelection: l.sel } : {}),
          })),
        },
      })
      for (const l of linhas) {
        itens.push({ vendaId: id, inventoryId: l.inventoryId, nome: l.nome, quantidade: l.quantidade, precoUnitario: l.precoUnitario, lineTotal: l.quantidade * l.precoUnitario })
      }
    }
    const sel = (m: string, c: string) => ({ version: 1, deviceModelName: m, colorKey: "preto", colorLabel: c })

    venda(LOJA_A, "V1", dia(10), [
      { inventoryId: P.pel, nome: "Película 3D", quantidade: 3, precoUnitario: 30, sel: sel("iPhone 13", "Preto") },
      { inventoryId: P.capa, nome: "Capinha Silicone", quantidade: 1, precoUnitario: 50 },
    ])
    // Produto repetido em duas linhas da mesma venda.
    venda(LOJA_A, "V2", dia(11), [
      { inventoryId: P.pel, nome: "Película 3D", quantidade: 1, precoUnitario: 30, sel: sel("iPhone 14", "Preto") },
      { inventoryId: P.pel, nome: "Película 3D", quantidade: 1, precoUnitario: 30, sel: sel("iPhone 14", "Preto") },
    ])
    venda(LOJA_A, "V3", dia(12), [{ inventoryId: P.pel, nome: "Película 3D", quantidade: 5, precoUnitario: 30 }], "cancelada")
    venda(LOJA_A, "V4", dia(20, 9), [{ inventoryId: P.pel, nome: "Película 3D", quantidade: 7, precoUnitario: 30 }])
    venda(LOJA_A, "V5", dia(15), [{ inventoryId: P.capa, nome: "Capinha Silicone", quantidade: 2, precoUnitario: 50 }], "devolvida")
    // Linha legada gravada com o SKU no lugar do id, com nome antigo.
    venda(LOJA_A, "V6", dia(16), [{ inventoryId: `PEL-${SUFIXO}`, nome: "PELICULA ANTIGA", quantidade: 1, precoUnitario: 30 }])
    venda(LOJA_A, "V7", dia(17), [{ inventoryId: `__avulso__x-${SUFIXO}`, nome: "Chaveiro", quantidade: 4, precoUnitario: 5 }])
    // PDV com relógio adiantado: venda gravada em 25/10, devolução (relógio do servidor) em 20/09.
    venda(LOJA_A, "V8", dia(25), [{ inventoryId: P.capa, nome: "Capinha Silicone", quantidade: 1, precoUnitario: 50 }], "parcialmente_devolvida")
    for (let i = 0; i < VOLUME; i++) {
      // Espalhadas entre 2 e 27/10, qualquer que seja o volume.
      venda(LOJA_A, `VOL${i}`, new Date(dia(2).getTime() + Math.floor((i * 25 * 86_400_000) / VOLUME)), [{ inventoryId: P.cabo, nome: "Cabo USB-C", quantidade: 1, precoUnitario: 25 }])
    }
    venda(LOJA_B, "B1", dia(10), [{ inventoryId: P.pelB, nome: "Película B", quantidade: 100, precoUnitario: 30 }])

    await db.venda.createMany({ data: vendas })
    await db.itemVenda.createMany({ data: itens })

    const devolucao = async (storeId: string, localId: string, vendaPedido: string, at: Date, itensDev: Array<[string, string, number, number]>) =>
      db.devolucaoVenda.create({
        data: {
          storeId, localId: `${localId}-${SUFIXO}`, vendaLocalId: vendaPedido ? `${vendaPedido}-${SUFIXO}` : "", tipo: "devolucao", at,
          valorTotal: itensDev.reduce((s, i) => s + i[3], 0),
          itens: { create: itensDev.map(([inventoryId, nome, quantidade, valorTotal]) => ({ inventoryId, nome, quantidade, valorUnitario: valorTotal / quantidade, valorTotal })) },
        },
      })
    // V1: duas devoluções somando 5 películas, mas só 3 foram vendidas → limita a 3.
    await devolucao(LOJA_A, "D3", "V1", dia(18), [[P.pel, "Película 3D", 1, 30]])
    await devolucao(LOJA_A, "D4", "V1", dia(19), [[P.pel, "Película 3D", 4, 120]])
    // V5: uma devolução no período e outra DEPOIS do período — ambas descontam da coorte.
    await devolucao(LOJA_A, "D1", "V5", dia(16), [[P.capa, "Capinha Silicone", 1, 50]])
    await devolucao(LOJA_A, "D2", "V5", dia(2, 11), [[P.capa, "Capinha Silicone", 1, 50]])
    await devolucao(LOJA_A, "D8", "V8", dia(20, 9), [[P.capa, "Capinha Silicone", 1, 50]])
    // Devolução sem venda vinculada.
    await devolucao(LOJA_A, "D5", "", dia(20), [[P.cabo, "Cabo USB-C", 1, 25]])
    // Loja B apontando para pedido da loja A: não pode afetar A.
    await devolucao(LOJA_B, "DB", "V1", dia(18), [[P.pel, "Película 3D", 1, 30]])
  }, 120_000)

  afterAll(async () => {
    if (!db) return
    const lojas = { in: [LOJA_A, LOJA_B] }
    await db.devolucaoVenda.deleteMany({ where: { storeId: lojas } })
    await db.venda.deleteMany({ where: { storeId: lojas } })
    await db.produto.deleteMany({ where: { storeId: lojas } })
    await db.categoriaProduto.deleteMany({ where: { storeId: lojas } })
    await db.store.deleteMany({ where: { id: lojas } })
    await db.$disconnect()
  })

  it("bruto, devolvido e líquido por produto no período (sem canceladas, sem duplicar)", async () => {
    const t0 = performance.now()
    const r = await relatorio(OUT)
    console.info(`[pv-pg] ${VOLUME + 8} vendas na loja A → relatório em ${Math.round(performance.now() - t0)} ms`)
    expect(r.produtos.map((p) => p.produtoId)).toEqual([P.cabo, P.pel, P.capa])

    // Película: V1 3 + V2 2 (duas linhas) + V6 1 (SKU legado) = 6; V3 cancelada fora.
    expect(achar(r, P.pel)).toMatchObject({ quantidadeBruta: 6, quantidadeDevolvida: 3, quantidadeLiquida: 3, receitaBruta: 180, receitaLiquida: 90 })
    expect(achar(r, P.pel)!.nomesNaVenda).toEqual(["PELICULA ANTIGA"])
    // Capinha: V1 1 + V5 2 + V8 1 = 4; V5 devolvida integralmente (uma devolução após o período)
    // e V8 devolvida com relógio adiantado (devolução "anterior" à venda).
    expect(achar(r, P.capa)).toMatchObject({ quantidadeBruta: 4, quantidadeDevolvida: 3, quantidadeLiquida: 1, receitaLiquida: 50 })
    expect(achar(r, P.cabo)).toMatchObject({ quantidadeBruta: VOLUME, quantidadeLiquida: VOLUME, receitaBruta: VOLUME * 25 })

    expect(r.canceladas).toEqual({ quantidade: 1, total: 150 })
    // V1, V2, V5, V6, V7, V8 + volume (V3 cancelada; V4 em setembro).
    expect(r.vendas.quantidade).toBe(6 + VOLUME)
    expect(r.diagnostico.quantidadeDevolvidaDescartada).toBe(2)
    expect(r.diagnostico.devolucoesSemVenda.documentos).toBe(1)
    expect(r.diagnostico.ajusteNaoRateado).toBe(0)
  })

  it("resumo por categoria (quantas películas, capinhas…) e filtro por categoria", async () => {
    const r = await relatorio(OUT)
    expect(r.categorias.map((c) => [c.nome, c.quantidadeLiquida])).toEqual([
      ["Sem categoria", VOLUME],
      ["Películas", 3],
      ["Capinhas", 1],
    ])
    const so = await relatorio(`${OUT}&categoria=capinhas`)
    expect(so.produtos.map((p) => p.produtoId)).toEqual([P.capa])
    expect(so.totais.quantidadeLiquida).toBe(1)
  })

  it("busca, ordem por receita e itens avulsos opcionais", async () => {
    expect((await relatorio(`${OUT}&q=pelicula`)).produtos.map((p) => p.produtoId)).toEqual([P.pel])
    expect((await relatorio(`${OUT}&ordem=receita`)).produtos[0]!.produtoId).toBe(P.cabo)
    const todos = await relatorio(`${OUT}&todos=1`)
    expect(todos.produtos.find((p) => p.tipo === "avulso")).toMatchObject({ nome: "Chaveiro", quantidadeBruta: 4 })
    expect((await relatorio(OUT)).produtos.some((p) => p.tipo === "avulso")).toBe(false)
  })

  it("outro período vê só as vendas daquele período", async () => {
    const r = await relatorio(SET)
    expect(r.produtos.map((p) => [p.produtoId, p.quantidadeLiquida])).toEqual([[P.pel, 7]])
    expect(r.canceladas.quantidade).toBe(0)
  })

  it("isolamento: loja B só vê a própria venda e a devolução de B não afeta A", async () => {
    const b = await relatorio(OUT, LOJA_B)
    expect(b.produtos.map((p) => [p.produtoId, p.quantidadeLiquida])).toEqual([[P.pelB, 100]])
    // DB aponta para o pedido de A, mas está na loja B: em B não há venda vinculada.
    expect(b.diagnostico.devolucoesSemVenda.documentos).toBe(1)
    const a = await relatorio(OUT)
    expect(a.produtos.some((p) => p.produtoId === P.pelB)).toBe(false)
  })

  it("variantes por modelo/cor do payload, conciliadas com ItemVenda", async () => {
    const res = await GET_VARIANTES(
      new Request(`http://local/api/vendas/produtos-vendidos/variantes?produtoId=${P.pel}&${OUT}`, { headers: { "x-assistec-loja-id": LOJA_A } }),
    )
    expect(res.status).toBe(200)
    const v = (await res.json()) as { variantes: Array<{ rotulo: string; quantidade: number; origem: string }>; quantidadeTotal: number }
    expect(v.quantidadeTotal).toBe(6)
    expect(v.variantes.map((x) => [x.origem, x.quantidade])).toEqual([
      ["variante", 3],
      ["variante", 2],
      ["sem_variante", 1],
    ])
    const outraLoja = await GET_VARIANTES(
      new Request(`http://local/api/vendas/produtos-vendidos/variantes?produtoId=${P.pel}&${OUT}`, { headers: { "x-assistec-loja-id": LOJA_B } }),
    )
    expect(outraLoja.status).toBe(404)
  })
})
