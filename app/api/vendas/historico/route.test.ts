/**
 * GOAL PDV-TROCAS-DEVOLUCOES-BUSCA-VALE-CREDITO-001 — busca de vendas por item/produto.
 * GOAL PDV-PADARIA-HISTORICO-PAGAMENTO-G1-001 — filtro por pagamento antes da paginação.
 *
 * Exercita o handler GET de PRODUÇÃO sobre um Prisma EM MEMÓRIA que CAPTURA os
 * `where` recebidos e os AVALIA (inclusive `AND`/`OR` aninhados e o filtro JSON
 * do `payload`), ordena por `orderBy` e respeita `take/skip`. O harness anterior
 * ignorava a paginação — por isso o filtro aplicado depois da página passava.
 *
 * Semântica do filtro JSON espelhada do PostgreSQL real (provada em
 * `lib/vendas/historico-pagamento.pg.test.ts`): `gt` só casa número JSON
 * (o Prisma compila `JSONB_TYPEOF(...) = 'number'`); `equals: AnyNull` casa
 * caminho ausente ou JSON null.
 *
 * Autenticação: só `@/auth` é simulado (sessão de formato real). `requireModuleApi`,
 * `canAccessStore`/`canUseModule` e a resolução da loja pelo header são os reais.
 *
 * Prova também que:
 *  - `q` passa a cobrir item vendido (ItemVenda.nome) além de cupom e cliente;
 *  - SKU e barcode/EAN resolvem ids de Produto (uma query por loja) e entram
 *    como `itens: { some: { inventoryId: { in } } }` — sem N+1;
 *  - cupom continua buscando; venda sem cliente não quebra;
 *  - storeId do header isola lojas; data/status combinam com a busca;
 *  - KPIs continuam SEM o filtro textual (escopo da loja/janela, como antes);
 *  - nenhum resultado → payload vazio e ok.
 */
import { describe, it, expect, beforeEach, vi } from "vitest"
import { Prisma } from "@/generated/prisma"
import { coletarVendasHistoricoParaExportacao } from "@/lib/vendas/historico-pagamento-export"

type Row = Record<string, unknown>

const h = vi.hoisted(() => {
  const STORE = "loja-1"
  const OTHER_STORE = "loja-2"

  const produtos: Row[] = []
  const vendas: Row[] = []
  const captured: {
    vendaFindMany: Array<Row>
    vendaFindManyArgs: Array<Row>
    vendaCount: Array<Row>
    vendaAggregate: Array<Row>
    aggregateResults: Array<Row>
    produtoFindMany: Array<Row>
    ensureConnected: number
  } = {
    vendaFindMany: [],
    vendaFindManyArgs: [],
    vendaCount: [],
    vendaAggregate: [],
    aggregateResults: [],
    produtoFindMany: [],
    ensureConnected: 0,
  }

  function sessionFor(stores: string[], modules: string[] = ["sales", "pdv", "cash"]) {
    return {
      user: {
        id: "synthetic-store-user",
        role: "ADMIN",
        accessScope: "STORE",
        platformAuthority: false,
        mustChangePassword: false,
        allowedStoreIds: stores,
        storeAccess: "restricted",
        storeModules: Object.fromEntries(stores.map((s) => [s, modules])),
      },
    }
  }

  const authState: { session: unknown } = { session: sessionFor([STORE]) }

  function reset() {
    produtos.length = 0
    vendas.length = 0
    captured.vendaFindMany.length = 0
    captured.vendaFindManyArgs.length = 0
    captured.vendaCount.length = 0
    captured.vendaAggregate.length = 0
    captured.aggregateResults.length = 0
    captured.produtoFindMany.length = 0
    captured.ensureConnected = 0
    authState.session = sessionFor([STORE])
  }

  function isObj(v: unknown): v is Row {
    return !!v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)
  }

  function cmp(a: unknown, b: unknown): number {
    const x = a instanceof Date ? a.getTime() : (a as number | string)
    const y = b instanceof Date ? b.getTime() : (b as number | string)
    return x < y ? -1 : x > y ? 1 : 0
  }

  /** Filtro escalar do Prisma usado pela rota (equals/contains/not/in/gte/lte). */
  function casaEscalar(value: unknown, f: unknown): boolean {
    if (f === null) return value === null || value === undefined
    if (!isObj(f)) return f instanceof Date ? cmp(value, f) === 0 : value === f
    const insensitive = f.mode === "insensitive"
    const norm = (v: unknown) => (insensitive && typeof v === "string" ? v.toLowerCase() : v)
    if ("equals" in f && norm(value) !== norm(f.equals)) return false
    if ("contains" in f && !(typeof value === "string" && String(norm(value)).includes(String(norm(f.contains))))) return false
    if ("not" in f && value === f.not) return false
    if ("in" in f && !(f.in as unknown[]).includes(value)) return false
    if ("gte" in f && cmp(value, f.gte) < 0) return false
    if ("lte" in f && cmp(value, f.lte) > 0) return false
    return true
  }

  /** Filtro JSON do Prisma (path + gt | equals), com a semântica do PostgreSQL. */
  function casaJson(payload: unknown, f: Row, anyNull: unknown): boolean {
    let v: unknown = payload
    for (const k of (f.path as string[]) ?? []) v = isObj(v) ? v[k] : undefined
    if ("gt" in f) return typeof v === "number" && v > (f.gt as number)
    if ("equals" in f) {
      if (f.equals === anyNull) return v === undefined || v === null
      return v === f.equals
    }
    throw new Error("filtro JSON não suportado pelo harness")
  }

  function casa(row: Row, where: Row, anyNull: unknown): boolean {
    for (const [key, f] of Object.entries(where)) {
      if (f === undefined) continue
      if (key === "AND") {
        if (!(f as Row[]).every((w) => casa(row, w, anyNull))) return false
      } else if (key === "OR") {
        if (!(f as Row[]).some((w) => casa(row, w, anyNull))) return false
      } else if (key === "payload") {
        if (!casaJson(row.payload, f as Row, anyNull)) return false
      } else if (key === "itens") {
        const some = ((f as Row).some ?? {}) as Row
        const itens = row.itensBusca as Array<Row>
        if (!itens.some((it) => Object.entries(some).every(([k, sf]) => casaEscalar(it[k], sf)))) return false
      } else if (!casaEscalar(row[key], f)) {
        return false
      }
    }
    return true
  }

  function ordenar(rows: Row[], orderBy: unknown): Row[] {
    const specs = (Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []) as Row[]
    return [...rows].sort((a, b) => {
      for (const spec of specs) {
        const [field, dir] = Object.entries(spec)[0]!
        const c = cmp(a[field], b[field])
        if (c !== 0) return dir === "desc" ? -c : c
      }
      return 0
    })
  }

  const anyNullRef: { value: unknown } = { value: undefined }
  const filtrar = (where: Row) => vendas.filter((v) => casa(v, where, anyNullRef.value))

  const prisma = {
    produto: {
      findMany: async ({ where }: { where: Row }) => {
        captured.produtoFindMany.push(where)
        const orProduto = (where.OR as Array<Row>) ?? []
        const skuEquals = String((((orProduto[0] as Row)?.sku as Row)?.equals ?? "")).toLowerCase()
        const barcodeEquals = String(
          (((orProduto[1] as Row)?.barcode as Row)?.equals ?? ""),
        ).toLowerCase()
        return produtos.filter((p) => {
          if (where.storeId && p.storeId !== where.storeId) return false
          const pSku = String(p.sku ?? "").toLowerCase()
          const pBarcode = String(p.barcode ?? "").toLowerCase()
          return (skuEquals !== "" && pSku === skuEquals) || (barcodeEquals !== "" && pBarcode === barcodeEquals)
        })
      },
    },
    venda: {
      findMany: async (args: { where: Row; orderBy?: unknown; take?: number; skip?: number }) => {
        captured.vendaFindMany.push(args.where)
        captured.vendaFindManyArgs.push(args as unknown as Row)
        const rows = ordenar(filtrar(args.where), args.orderBy)
        const skip = args.skip ?? 0
        return args.take === undefined ? rows.slice(skip) : rows.slice(skip, skip + args.take)
      },
      count: async ({ where }: { where: Row }) => {
        captured.vendaCount.push(where)
        return filtrar(where).length
      },
      aggregate: async ({ where }: { where: Row }) => {
        captured.vendaAggregate.push(where)
        const rows = filtrar(where)
        const result = {
          _sum: { total: rows.reduce((s, r) => s + (r.total as number), 0) },
          _count: { id: rows.length },
        }
        captured.aggregateResults.push(result)
        return result
      },
    },
    pdvTerminal: { findMany: async () => [] },
  }

  function addProduto(p: { id: string; sku?: string; barcode?: string; storeId?: string }) {
    produtos.push({ storeId: STORE, ...p })
  }

  function addVenda(v: {
    pedidoId: string
    storeId?: string
    clienteNome?: string | null
    itens?: Array<{ nome?: string; inventoryId?: string; quantidade?: number }>
    status?: string
    at?: Date
    total?: number
    operador?: string | null
    terminalId?: string | null
    payload?: unknown
  }) {
    vendas.push({
      storeId: STORE,
      status: "concluida",
      at: new Date("2026-08-20T10:00:00Z"),
      total: 100,
      operador: null,
      terminalId: null,
      clienteNome: null,
      canceladaEm: null,
      motivoCancelamento: null,
      payload: { paymentBreakdown: { dinheiro: 100 } },
      ...v,
      id: v.pedidoId,
      itens: (v.itens ?? []).map((it) => ({ quantidade: it.quantidade ?? 1 })),
      itensBusca: v.itens ?? [],
    })
  }

  return { STORE, OTHER_STORE, prisma, captured, reset, addProduto, addVenda, authState, sessionFor, anyNullRef }
})

vi.mock("@/auth", () => ({ auth: async () => h.authState.session }))
vi.mock("@/lib/prisma", () => ({
  prisma: h.prisma,
  prismaEnsureConnected: async () => {
    h.captured.ensureConnected++
  },
  withPrismaSafe: async (op: (db: unknown) => Promise<unknown>, fallback: unknown) => {
    try {
      return await op(h.prisma)
    } catch {
      return fallback
    }
  },
}))

import { GET } from "./route"

function getReq(query = "", storeId: string = h.STORE) {
  return new Request(`http://local/api/vendas/historico?${query}`, {
    headers: { "x-assistec-loja-id": storeId },
  })
}

beforeEach(() => {
  h.reset()
  h.anyNullRef.value = Prisma.AnyNull
})

describe("GET /api/vendas/historico — busca por item/produto", () => {
  it("nome parcial do produto casa via itens.some(nome contains, insensitive)", async () => {
    h.addVenda({ pedidoId: "VDA-2026-0001", itens: [{ nome: "Fone de Ouvido Redmi Básico" }] })
    const res = await GET(getReq("q=fone%20de%20ouvido"))
    const j = await res.json()
    expect(j.ok).toBe(true)
    expect(j.vendas).toHaveLength(1)
    expect(j.vendas[0].id).toBe("VDA-2026-0001")
    const where = h.captured.vendaFindMany[0]!
    const or = where.OR as Array<Row>
    expect(or).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          itens: { some: { nome: { contains: "fone de ouvido", mode: "insensitive" } } },
        }),
      ]),
    )
  })

  it("SKU resolve ids de Produto (query única por loja) e casa por inventoryId", async () => {
    h.addProduto({ id: "prod-1", sku: "RDMI-RED" })
    h.addVenda({ pedidoId: "VDA-2026-0002", itens: [{ inventoryId: "prod-1", nome: "Fone Redmi" }] })
    const res = await GET(getReq("q=rdmi-red"))
    const j = await res.json()
    expect(j.ok).toBe(true)
    expect(j.vendas.map((v: Row) => v.id)).toContain("VDA-2026-0002")
    // Query de produto presa ao storeId (isolação) e com correspondência exata.
    const produtoWhere = h.captured.produtoFindMany[0]!
    expect(produtoWhere.storeId).toBe(h.STORE)
    const orProduto = produtoWhere.OR as Array<Row>
    expect((orProduto[0]!.sku as Row).equals).toBe("rdmi-red")
    expect((orProduto[1]!.barcode as Row).equals).toBe("rdmi-red")
    const where = h.captured.vendaFindMany[0]!
    const or = where.OR as Array<Row>
    expect(or).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          itens: { some: { inventoryId: { in: ["prod-1"] } } },
        }),
      ]),
    )
  })

  it("EAN/barcode resolve o produto e localiza a venda (cliente perdeu o cupom)", async () => {
    h.addProduto({ id: "prod-2", barcode: "7891234567890" })
    h.addVenda({ pedidoId: "VDA-2026-0003", itens: [{ inventoryId: "prod-2", nome: "Carregador" }] })
    const res = await GET(getReq("q=7891234567890"))
    const j = await res.json()
    expect(j.vendas.map((v: Row) => v.id)).toContain("VDA-2026-0003")
  })

  it("busca existente por cupom continua funcionando (OR preserva pedidoId)", async () => {
    h.addVenda({ pedidoId: "VDA-2026-0004" })
    const res = await GET(getReq("q=vda-2026-0004"))
    const j = await res.json()
    expect(j.vendas).toHaveLength(1)
    const or = (h.captured.vendaFindMany[0]!.OR as Array<Row>)[0]!
    expect((or.pedidoId as Row).contains).toBe("vda-2026-0004")
    expect((or.pedidoId as Row).mode).toBe("insensitive")
  })

  it("venda sem cliente é encontrada por produto (clienteNome null não quebra)", async () => {
    h.addVenda({ pedidoId: "VDA-2026-0005", clienteNome: null, itens: [{ nome: "Capa Silicone" }] })
    const res = await GET(getReq("q=silicone"))
    const j = await res.json()
    expect(j.vendas).toHaveLength(1)
    expect(j.vendas[0].cliente).toBe("—")
  })

  it("storeId do header isola lojas (venda de outra loja não vaza)", async () => {
    h.addVenda({ pedidoId: "VDA-2026-0006", itens: [{ nome: "Fone Redmi" }] })
    // Venda "de outra loja" — o fake filtra por where.storeId, então basta que o
    // where carregue o storeId do header e a loja errada nunca seja consultada.
    const res = await GET(getReq("q=redmi"))
    const j = await res.json()
    expect(h.captured.vendaFindMany[0]!.storeId).toBe(h.STORE)
    expect(j.vendas).toHaveLength(1)
  })

  it("combina busca com filtros de data e status no MESMO where", async () => {
    h.addVenda({ pedidoId: "VDA-2026-0007", itens: [{ nome: "Fone Redmi" }] })
    const from = encodeURIComponent("2026-08-01T00:00:00Z")
    const to = encodeURIComponent("2026-08-30T23:59:59Z")
    await GET(getReq(`q=redmi&status=concluida&from=${from}&to=${to}`))
    const where = h.captured.vendaFindMany[0]!
    expect(where.status).toBe("concluida")
    const at = where.at as Row
    expect((at.gte as Date).toISOString()).toBe("2026-08-01T00:00:00.000Z")
    expect((at.lte as Date).toISOString()).toBe("2026-08-30T23:59:59.000Z")
    expect(where.OR).toBeDefined()
  })

  it("nenhum resultado → ok com lista e total vazios", async () => {
    h.addVenda({ pedidoId: "VDA-2026-0008" })
    const res = await GET(getReq("q=produto-inexistente-xyz"))
    const j = await res.json()
    expect(j.ok).toBe(true)
    expect(j.vendas).toHaveLength(0)
    expect(j.total).toBe(0)
  })

  it("KPIs continuam sem o filtro textual (escopo loja + janela + terminal)", async () => {
    h.addVenda({ pedidoId: "VDA-2026-0009", itens: [{ nome: "Fone" }] })
    await GET(getReq("q=fone"))
    // 5 counts: 1 total (com OR da busca) + 4 KPIs (sem OR); aggregate sem OR.
    expect(h.captured.vendaCount).toHaveLength(5)
    const comOr = h.captured.vendaCount.filter((w) => w.OR !== undefined)
    const semOr = h.captured.vendaCount.filter((w) => w.OR === undefined)
    expect(comOr).toHaveLength(1)
    expect(semOr).toHaveLength(4)
    for (const w of [...semOr, ...h.captured.vendaAggregate]) {
      expect(w.OR).toBeUndefined()
      expect(w.storeId).toBe(h.STORE)
    }
    // Faturamento ignora a busca textual: a venda casa e entra no agregado.
    const agg = h.captured.aggregateResults[0]!
    expect((agg as unknown as { _sum: { total: number } })._sum.total).toBeCloseTo(100, 2)
  })

  it("sem q: nenhuma query de produto e nenhum OR", async () => {
    h.addVenda({ pedidoId: "VDA-2026-0010" })
    const res = await GET(getReq(""))
    const j = await res.json()
    expect(j.vendas).toHaveLength(1)
    expect(h.captured.produtoFindMany).toHaveLength(0)
    expect(h.captured.vendaFindMany[0]!.OR).toBeUndefined()
  })
})

// ── GOAL PDV-PADARIA-HISTORICO-PAGAMENTO-G1-001 ─────────────────────────────

const BASE_AT = Date.UTC(2026, 9, 24, 12, 0, 0)

/** `n` vendas, uma por minuto, da mais recente (i=0) para a mais antiga. */
function seed(
  n: number,
  breakdown: (i: number) => unknown,
  extra: (i: number) => Partial<Parameters<typeof h.addVenda>[0]> = () => ({}),
) {
  for (let i = 0; i < n; i++) {
    h.addVenda({
      pedidoId: `V-${String(i).padStart(4, "0")}`,
      at: new Date(BASE_AT - i * 60_000),
      total: 10,
      payload: breakdown(i),
      ...extra(i),
    })
  }
}

type Resp = { ok: boolean; vendas: Array<{ id: string; formaPagamento: string }>; total: number; kpis: Row; error?: string }

async function listar(query: string, storeId?: string): Promise<{ status: number; body: Resp }> {
  const res = await GET(getReq(query, storeId))
  return { status: res.status, body: (await res.json()) as Resp }
}

describe("GET /api/vendas/historico — filtro por pagamento antes da paginação", () => {
  it("30 vendas, 5 Pix nas mais antigas: página 1 traz as 5 e total=5 (antes: vazia, total=30)", async () => {
    seed(30, (i) => ({ paymentBreakdown: i >= 25 ? { pix: 10 } : { dinheiro: 10 } }))
    const p1 = await listar("pagamento=pix&take=20&skip=0")
    expect(p1.status).toBe(200)
    expect(p1.body.vendas.map((v) => v.id)).toEqual(["V-0025", "V-0026", "V-0027", "V-0028", "V-0029"])
    expect(p1.body.total).toBe(5)
    // Sem página 2: avançar devolve lista vazia e o mesmo total.
    const p2 = await listar("pagamento=pix&take=20&skip=20")
    expect(p2.body.vendas).toEqual([])
    expect(p2.body.total).toBe(5)
  })

  it("várias páginas válidas: avançar e voltar sem duplicar nem pular; última página parcial", async () => {
    // 90 vendas; Pix em 2 de cada 3 → 60 Pix, intercaladas com dinheiro.
    seed(90, (i) => ({ paymentBreakdown: i % 3 === 2 ? { dinheiro: 10 } : { pix: 10 } }))
    const esperado = Array.from({ length: 90 }, (_, i) => i).filter((i) => i % 3 !== 2).map((i) => `V-${String(i).padStart(4, "0")}`)
    const p1 = await listar("pagamento=pix&take=25&skip=0")
    const p2 = await listar("pagamento=pix&take=25&skip=25")
    const p3 = await listar("pagamento=pix&take=25&skip=50")
    const volta = await listar("pagamento=pix&take=25&skip=0")
    expect([p1, p2, p3].map((p) => p.body.vendas.length)).toEqual([25, 25, 10])
    expect([p1, p2, p3].every((p) => p.body.total === 60)).toBe(true)
    const ids = [...p1.body.vendas, ...p2.body.vendas, ...p3.body.vendas].map((v) => v.id)
    expect(ids).toEqual(esperado)
    expect(new Set(ids).size).toBe(60)
    expect(volta.body.vendas.map((v) => v.id)).toEqual(p1.body.vendas.map((v) => v.id))
  })

  it("página além do total: lista vazia com total correto", async () => {
    seed(12, () => ({ paymentBreakdown: { cartaoDebito: 10 } }))
    const r = await listar("pagamento=cartaoDebito&take=20&skip=400")
    expect(r.body.vendas).toEqual([])
    expect(r.body.total).toBe(12)
  })

  it("ordenação determinística: mesmo instante desempata por id, sem repetir entre páginas", async () => {
    const mesmoInstante = new Date(BASE_AT)
    for (let i = 0; i < 6; i++) {
      h.addVenda({ pedidoId: `T-${i}`, at: mesmoInstante, payload: { paymentBreakdown: { pix: 5 } } })
    }
    const a = await listar("pagamento=pix&take=4&skip=0")
    const b = await listar("pagamento=pix&take=4&skip=4")
    expect([...a.body.vendas, ...b.body.vendas].map((v) => v.id)).toEqual(["T-5", "T-4", "T-3", "T-2", "T-1", "T-0"])
    expect(h.captured.vendaFindManyArgs[0]!.orderBy).toEqual([{ at: "desc" }, { id: "desc" }])
  })

  it("dinheiro, Pix, débito e crédito contam só as próprias vendas", async () => {
    const formas = ["dinheiro", "pix", "cartaoDebito", "cartaoCredito"] as const
    seed(20, (i) => ({ paymentBreakdown: { [formas[i % 4]!]: 10 } }))
    for (const forma of formas) {
      const r = await listar(`pagamento=${forma}&take=50`)
      expect(r.body.total).toBe(5)
      expect(r.body.vendas).toHaveLength(5)
    }
  })

  it("pagamento dividido: R$ 60 dinheiro + R$ 40 Pix entra em dinheiro e em Pix, uma vez cada; não em crédito", async () => {
    h.addVenda({ pedidoId: "SPLIT", total: 100, payload: { paymentBreakdown: { dinheiro: 60, pix: 40, cartaoCredito: 0 } } })
    h.addVenda({ pedidoId: "SO-CREDITO", total: 30, payload: { paymentBreakdown: { cartaoCredito: 30 } } })
    const dinheiro = await listar("pagamento=dinheiro")
    const pix = await listar("pagamento=pix")
    const credito = await listar("pagamento=cartaoCredito")
    const todos = await listar("")
    expect(dinheiro.body.vendas.map((v) => v.id)).toEqual(["SPLIT"])
    expect(pix.body.vendas.map((v) => v.id)).toEqual(["SPLIT"])
    expect(credito.body.vendas.map((v) => v.id)).toEqual(["SO-CREDITO"])
    expect(todos.body.vendas.filter((v) => v.id === "SPLIT")).toHaveLength(1)
    expect(todos.body.total).toBe(2)
    // A coluna mostra as duas formas; não apresenta a venda como só dinheiro.
    expect(dinheiro.body.vendas[0]!.formaPagamento).toBe("Dinheiro + Pix")
  })

  it("tipos JSON: só número positivo casa; texto, zero, negativo, null, ausente, inválido e booleano não", async () => {
    const casos: Record<string, unknown> = {
      num_pos: { paymentBreakdown: { pix: 10 } },
      num_centavo: { paymentBreakdown: { pix: 0.01 } },
      texto_numerico: { paymentBreakdown: { pix: "10" } },
      texto_invalido: { paymentBreakdown: { pix: "abc" } },
      zero: { paymentBreakdown: { pix: 0 } },
      negativo: { paymentBreakdown: { pix: -5 } },
      json_null: { paymentBreakdown: { pix: null } },
      ausente: { paymentBreakdown: { dinheiro: 10 } },
      breakdown_null: { paymentBreakdown: null },
      booleano: { paymentBreakdown: { pix: true } },
      payload_vazio: {},
    }
    let i = 0
    for (const [id, payload] of Object.entries(casos)) {
      h.addVenda({ pedidoId: id, at: new Date(BASE_AT - i++ * 60_000), payload })
    }
    const r = await listar("pagamento=pix&take=50")
    // Texto numérico NÃO casa: o contrato aceita só JSON numérico (produção
    // 2026-10-24: 0 valores textuais em 2.017 breakdowns). Sem conversão insegura.
    expect(r.body.vendas.map((v) => v.id).sort()).toEqual(["num_centavo", "num_pos"])
    expect(r.body.total).toBe(2)
    const rotulos = Object.fromEntries((await listar("take=50")).body.vendas.map((v) => [v.id, v.formaPagamento]))
    expect(rotulos.num_pos).toBe("Pix")
    expect(rotulos.texto_numerico).toBe("—")
    expect(rotulos.zero).toBe("—")
    expect(rotulos.payload_vazio).toBe("—")
  })

  it("venda importada (sem breakdown) casa pelo rótulo legado exato; rótulo ambíguo não casa nada", async () => {
    h.addVenda({ pedidoId: "IMP-PIX", payload: { formaPagamento: "PIX", importadoEm: "2026-04-10" } })
    h.addVenda({ pedidoId: "IMP-DIN", payload: { formaPagamento: "Dinheiro à Vista", importadoEm: "2026-04-10" } })
    h.addVenda({ pedidoId: "IMP-PARC", payload: { formaPagamento: "Dinheiro Parcelado", importadoEm: "2026-04-10" } })
    h.addVenda({ pedidoId: "IMP-NULL", payload: { formaPagamento: null, importadoEm: "2026-04-10" } })
    // Moderna com rótulo textual divergente: vale o breakdown, nunca o rótulo.
    h.addVenda({ pedidoId: "MOD", payload: { paymentBreakdown: { dinheiro: 10 }, formaPagamento: "PIX" } })
    expect((await listar("pagamento=pix")).body.vendas.map((v) => v.id)).toEqual(["IMP-PIX"])
    expect((await listar("pagamento=dinheiro")).body.vendas.map((v) => v.id).sort()).toEqual(["IMP-DIN", "MOD"])
    expect((await listar("pagamento=aPrazo")).body.total).toBe(0)
    const rotulos = Object.fromEntries((await listar("")).body.vendas.map((v) => [v.id, v.formaPagamento]))
    expect(rotulos["IMP-PARC"]).toBe("Dinheiro Parcelado")
    expect(rotulos["IMP-NULL"]).toBe("—")
  })

  it("combina pagamento com busca, período, status, operador e terminal no mesmo where", async () => {
    const dentro = new Date("2026-08-15T12:00:00Z")
    const fora = new Date("2026-07-01T12:00:00Z")
    const base = { itens: [{ nome: "Pão Francês" }], operador: "Ana", terminalId: "term-1", at: dentro }
    h.addVenda({ pedidoId: "OK", ...base, payload: { paymentBreakdown: { pix: 5 } } })
    h.addVenda({ pedidoId: "DINHEIRO", ...base, payload: { paymentBreakdown: { dinheiro: 5 } } })
    h.addVenda({ pedidoId: "FORA-DATA", ...base, at: fora, payload: { paymentBreakdown: { pix: 5 } } })
    h.addVenda({ pedidoId: "CANCELADA", ...base, status: "cancelada", payload: { paymentBreakdown: { pix: 5 } } })
    h.addVenda({ pedidoId: "OUTRO-TERM", ...base, terminalId: "term-2", payload: { paymentBreakdown: { pix: 5 } } })
    h.addVenda({ pedidoId: "OUTRO-OP", ...base, operador: "Bia", payload: { paymentBreakdown: { pix: 5 } } })
    h.addVenda({ pedidoId: "OUTRO-ITEM", ...base, itens: [{ nome: "Bolo" }], payload: { paymentBreakdown: { pix: 5 } } })
    const from = encodeURIComponent("2026-08-01T00:00:00Z")
    const to = encodeURIComponent("2026-08-31T23:59:59Z")
    const r = await listar(`pagamento=pix&q=franc&status=concluida&operador=ana&terminalId=term-1&from=${from}&to=${to}`)
    expect(r.body.vendas.map((v) => v.id)).toEqual(["OK"])
    expect(r.body.total).toBe(1)
    const where = h.captured.vendaFindMany[0]!
    // Busca no OR e pagamento no AND: um não sobrescreve o outro.
    expect(where.OR).toBeDefined()
    expect(where.AND).toHaveLength(1)
    expect(where.storeId).toBe(h.STORE)
  })

  it("loja A × loja B: o filtro nunca traz venda de outra loja, nem no total", async () => {
    h.authState.session = h.sessionFor([h.STORE, h.OTHER_STORE])
    seed(5, () => ({ paymentBreakdown: { pix: 10 } }))
    seed(7, () => ({ paymentBreakdown: { pix: 10 } }), (i) => ({ pedidoId: `B-${i}`, storeId: h.OTHER_STORE }))
    const a = await listar("pagamento=pix&take=50", h.STORE)
    const b = await listar("pagamento=pix&take=50", h.OTHER_STORE)
    expect(a.body.total).toBe(5)
    expect(a.body.vendas.every((v) => v.id.startsWith("V-"))).toBe(true)
    expect(b.body.total).toBe(7)
    expect(b.body.vendas.every((v) => v.id.startsWith("B-"))).toBe(true)
  })

  it("chave de pagamento fora das 7 canônicas → 400, sem tocar no Prisma", async () => {
    seed(3, () => ({ paymentBreakdown: { pix: 10 } }))
    for (const chave of ["boleto", "PIX", "pix'--", "__proto__", "paymentBreakdown"]) {
      const r = await listar(`pagamento=${encodeURIComponent(chave)}`)
      expect(r.status).toBe(400)
      expect(r.body.ok).toBe(false)
    }
    expect(h.captured.ensureConnected).toBe(0)
    expect(h.captured.vendaFindMany).toHaveLength(0)
    expect(h.captured.vendaCount).toHaveLength(0)
  })

  it("take/skip validados e limitados", async () => {
    seed(3, () => ({ paymentBreakdown: { pix: 10 } }))
    const casos: Array<[string, number, number]> = [
      ["", 50, 0],
      ["take=abc&skip=xyz", 50, 0],
      ["take=0&skip=-5", 1, 0],
      ["take=999&skip=7", 200, 7],
      ["take=20&skip=99999999", 20, 1_000_000],
    ]
    for (const [query, take, skip] of casos) {
      h.captured.vendaFindManyArgs.length = 0
      const r = await listar(query)
      expect(r.status).toBe(200)
      expect(h.captured.vendaFindManyArgs[0]!.take).toBe(take)
      expect(h.captured.vendaFindManyArgs[0]!.skip).toBe(skip)
    }
  })

  it("com filtro de pagamento não há varredura sem limite: todo findMany de venda é paginado", async () => {
    seed(40, (i) => ({ paymentBreakdown: i % 2 ? { pix: 10 } : { dinheiro: 10 } }))
    await listar("pagamento=pix&take=20&skip=0")
    expect(h.captured.vendaFindManyArgs).toHaveLength(1)
    expect(h.captured.vendaFindManyArgs[0]!.take).toBe(20)
  })

  it("KPIs preservam a semântica: loja + terminal + período, sem pagamento, busca, status ou operador", async () => {
    seed(10, (i) => ({ paymentBreakdown: i < 3 ? { pix: 10 } : { dinheiro: 10 } }))
    h.addVenda({ pedidoId: "CANC", status: "cancelada", total: 10, payload: { paymentBreakdown: { pix: 10 } } })
    const comFiltro = await listar("pagamento=pix&status=concluida&operador=x&q=v-00")
    const semFiltro = await listar("")
    expect(comFiltro.body.kpis).toEqual(semFiltro.body.kpis)
    expect(semFiltro.body.kpis).toMatchObject({ totalVendas: 10, faturamento: 100, cancelamentos: 1, concluidas: 10 })
    for (const w of h.captured.vendaAggregate) expect(w.AND).toBeUndefined()
  })
})

describe("GET /api/vendas/historico — guards de sessão, módulo e loja (reais)", () => {
  it("sem sessão → 401 antes de qualquer acesso ao Prisma", async () => {
    h.authState.session = null
    const r = await listar("pagamento=pix")
    expect(r.status).toBe(401)
    expect(h.captured.ensureConnected).toBe(0)
    expect(h.captured.vendaFindMany).toHaveLength(0)
  })

  it("sessão sem o módulo sales → 403 antes de qualquer acesso ao Prisma", async () => {
    h.authState.session = h.sessionFor([h.STORE], ["pdv", "cash"])
    const r = await listar("pagamento=pix")
    expect(r.status).toBe(403)
    expect(h.captured.ensureConnected).toBe(0)
    expect(h.captured.vendaFindMany).toHaveLength(0)
  })

  it("loja fora da membership → 403, mesmo com filtro de pagamento válido", async () => {
    h.addVenda({ pedidoId: "B-1", storeId: h.OTHER_STORE, payload: { paymentBreakdown: { pix: 10 } } })
    const r = await listar("pagamento=pix", h.OTHER_STORE)
    expect(r.status).toBe(403)
    expect(h.captured.ensureConnected).toBe(0)
    expect(h.captured.vendaFindMany).toHaveLength(0)
  })

  it("troca de senha pendente → 403", async () => {
    const s = h.sessionFor([h.STORE]) as { user: Row }
    s.user.mustChangePassword = true
    h.authState.session = s
    const r = await listar("")
    expect(r.status).toBe(403)
    expect(h.captured.vendaFindMany).toHaveLength(0)
  })
})

describe("Exportação CSV sobre a rota real — filtro de pagamento", () => {
  async function exportar(query: string, max?: number) {
    const chamadas: number[] = []
    const result = await coletarVendasHistoricoParaExportacao(
      async (skip, take) => {
        chamadas.push(skip)
        const r = await listar(`${query}&take=${take}&skip=${skip}`)
        return { vendas: r.body.vendas.map((v) => ({ ...v, dbId: v.id })), total: r.body.total }
      },
      max ? { max } : {},
    )
    return { ...result, chamadas }
  }

  it("1ª janela de 200 sem Pix não encerra a exportação: todas as Pix saem, sem repetição", async () => {
    // 650 vendas: as 300 mais recentes em dinheiro, depois 350 Pix.
    seed(650, (i) => ({ paymentBreakdown: i < 300 ? { dinheiro: 10 } : { pix: 10 } }))
    const r = await exportar("pagamento=pix")
    expect(r.linhas).toHaveLength(350)
    expect(new Set(r.linhas.map((v) => v.id)).size).toBe(350)
    expect(r.totalServidor).toBe(350)
    expect(r.truncado).toBe(false)
    expect(r.chamadas).toEqual([0, 200])
  })

  it("respeita a loja e os demais filtros ativos", async () => {
    h.authState.session = h.sessionFor([h.STORE, h.OTHER_STORE])
    seed(30, () => ({ paymentBreakdown: { pix: 10 } }), (i) => ({ status: i % 2 ? "cancelada" : "concluida" }))
    seed(30, () => ({ paymentBreakdown: { pix: 10 } }), (i) => ({ pedidoId: `B-${i}`, storeId: h.OTHER_STORE }))
    const r = await exportar("pagamento=pix&status=concluida")
    expect(r.linhas).toHaveLength(15)
    expect(r.linhas.every((v) => v.id.startsWith("V-"))).toBe(true)
  })
})
