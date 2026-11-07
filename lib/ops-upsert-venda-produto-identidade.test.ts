/**
 * PDV-SYNC-PRODUTO-NAO-RESOLVIDO-RECOVERY-001 — identidade estável do produto na venda.
 *
 * O PDV manda `inventoryId` = SKU quando existe (`/api/ops/inventory#rowToItem`). O SKU é
 * editável no Cadastro: se mudar entre o carregamento do catálogo e a sincronização, a
 * linha deixava de casar e a venda ficava presa em `PRODUTO_NAO_RESOLVIDO`. A linha agora
 * pode trazer `produtoId` (cuid do catálogo da loja); com ele a resolução é SOMENTE por
 * id + loja — nunca cai para o SKU, que pode ter sido reatribuído a outro produto.
 *
 * `TransactionClient` fake em memória (mesmo padrão de `ops-upsert-venda-safety.test.ts`),
 * com `produto.findFirst` que entende tanto `{ storeId, id }` quanto `{ storeId, OR }`.
 */
import { describe, expect, it } from "vitest"
import { upsertVendaInTransaction, UnresolvedProductError, type SalePayload } from "./ops-upsert-venda"
import { servicoInventoryId } from "./os-pdv-virtual-lines"
import { attachStockLedgerBoundaryToFakeTx } from "./estoque/stock-ledger-test-fake"

type FakeProduct = {
  id: string
  storeId: string
  stock: number
  precoCusto: number
  sku: string | null
  barcode: string | null
  name: string
}

function proj(p: FakeProduct) {
  return { id: p.id, stock: p.stock, precoCusto: p.precoCusto, sku: p.sku, name: p.name }
}

function matchesWhere(p: FakeProduct, where: any): boolean {
  if (where.storeId !== undefined && p.storeId !== where.storeId) return false
  if (where.id !== undefined && p.id !== where.id) return false
  const ors: Array<Record<string, string>> | undefined = where.OR
  if (!ors) return true
  return ors.some(
    (cond) =>
      (cond.id !== undefined && p.id === cond.id) ||
      (cond.sku !== undefined && p.sku === cond.sku) ||
      (cond.barcode !== undefined && p.barcode === cond.barcode),
  )
}

function makeFakeTx(products: FakeProduct[]) {
  const byId = new Map(products.map((p) => [p.id, p]))
  const ledger: Array<Record<string, unknown>> = []
  const financeiro: Array<Record<string, unknown>> = []
  const itemRows: Array<Record<string, unknown>> = []
  const produtoQueries: Array<Record<string, unknown>> = []
  let vendaCounter = 0

  const tx: any = {
    cliente: { findFirst: async () => null },
    venda: {
      findUnique: async () => null,
      create: async ({ data }: any) => ({
        id: `venda-${++vendaCounter}`,
        ...data,
        terminalId: data.terminalId ?? null,
        status: "concluida",
      }),
      update: async () => ({}),
    },
    itemVenda: {
      deleteMany: async () => ({ count: 0 }),
      create: async ({ data }: any) => {
        itemRows.push(data)
        return data
      },
    },
    produto: {
      findFirst: async ({ where }: any) => {
        produtoQueries.push(where)
        const p = products.find((candidate) => matchesWhere(candidate, where))
        return p ? proj(p) : null
      },
      findUnique: async ({ where }: any) => {
        const p = byId.get(where.id)
        return p ? { stock: p.stock, precoCusto: p.precoCusto } : null
      },
      updateMany: async ({ where, data }: any) => {
        const p = byId.get(where.id)
        if (!p || p.storeId !== where.storeId) return { count: 0 }
        const gte = where.stock?.gte
        if (typeof gte === "number" && p.stock < gte) return { count: 0 }
        p.stock -= data.stock?.decrement ?? 0
        return { count: 1 }
      },
      update: async ({ where, data }: any) => {
        const p = byId.get(where.id)
        if (p && data.stock?.decrement != null) p.stock -= data.stock.decrement
        return p ?? {}
      },
    },
    movimentacaoEstoque: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        ledger.push(data)
        return data
      },
    },
    movimentacaoFinanceira: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        financeiro.push(data)
        return data
      },
    },
    contaReceberTitulo: { upsert: async () => ({ id: "tit-1" }) },
    sessaoCaixa: { findFirst: async () => null },
  }
  attachStockLedgerBoundaryToFakeTx(tx, { products, ledger })
  return { tx, byId, ledger, financeiro, itemRows, produtoQueries }
}

const STORE = "loja-a01"
const OUTRA_LOJA = "loja-b02"
/** Isola do gate de caixa (coberto em `ops-upsert-venda-safety.test.ts`). */
const LIVE = { enforceStock: true } as const

function produto(over: Partial<FakeProduct> = {}): FakeProduct {
  return {
    id: "cuid-pelicula",
    storeId: STORE,
    stock: 10,
    precoCusto: 1,
    sku: "PEL-NOVO",
    barcode: null,
    name: "PELÍCULA",
    ...over,
  }
}

function venda(lines: NonNullable<SalePayload["lines"]>, total = 8): SalePayload {
  return { id: "PED-PEL-1", total, paymentBreakdown: { dinheiro: total }, lines }
}

async function expectUnresolved(promise: Promise<unknown>): Promise<UnresolvedProductError> {
  try {
    await promise
  } catch (e) {
    expect(e).toBeInstanceOf(UnresolvedProductError)
    return e as UnresolvedProductError
  }
  throw new Error("deveria ter lançado UnresolvedProductError")
}

describe("upsertVendaInTransaction — produtoId como identidade estável", () => {
  it("SKU editado após o catálogo: produtoId resolve o mesmo produto e baixa uma vez", async () => {
    const { tx, byId, ledger, itemRows } = makeFakeTx([produto()])
    await upsertVendaInTransaction(
      tx,
      STORE,
      venda([{ inventoryId: "PEL-ANTIGO", produtoId: "cuid-pelicula", name: "PELÍCULA", quantity: 2, unitPrice: 4 }]),
      undefined,
      LIVE,
    )
    expect(itemRows).toHaveLength(1)
    expect(itemRows[0]!.inventoryId).toBe("cuid-pelicula")
    expect(byId.get("cuid-pelicula")!.stock).toBe(8)
    expect(ledger).toHaveLength(1)
  })

  it("sem produtoId (venda pendente antiga) o SKU antigo continua não resolvendo — sem chute", async () => {
    const { tx, byId, ledger, financeiro } = makeFakeTx([produto()])
    const err = await expectUnresolved(
      upsertVendaInTransaction(
        tx,
        STORE,
        venda([{ inventoryId: "PEL-ANTIGO", name: "PELÍCULA", quantity: 2, unitPrice: 4 }]),
        undefined,
        LIVE,
      ),
    )
    expect(err.inventoryIds).toEqual(["PEL-ANTIGO"])
    expect(byId.get("cuid-pelicula")!.stock).toBe(10)
    expect(ledger).toHaveLength(0)
    expect(financeiro).toHaveLength(0)
  })

  it("produtoId removido NÃO cai para o SKU reatribuído a outro produto (falha fechada)", async () => {
    // O produto original sumiu; outro produto da loja agora usa o mesmo SKU.
    const outro = produto({ id: "cuid-capinha", sku: "PEL-ANTIGO", name: "CAPINHA", stock: 3 })
    const { tx, byId, ledger, financeiro, produtoQueries } = makeFakeTx([outro])
    const err = await expectUnresolved(
      upsertVendaInTransaction(
        tx,
        STORE,
        venda([{ inventoryId: "PEL-ANTIGO", produtoId: "cuid-pelicula", name: "PELÍCULA", quantity: 2, unitPrice: 4 }]),
        undefined,
        LIVE,
      ),
    )
    expect(err.inventoryIds).toEqual(["PEL-ANTIGO"])
    expect(byId.get("cuid-capinha")!.stock).toBe(3)
    expect(ledger).toHaveLength(0)
    expect(financeiro).toHaveLength(0)
    expect(produtoQueries.every((w) => w.OR === undefined)).toBe(true)
  })

  it("produtoId de OUTRA loja não resolve (sem vazamento entre lojas)", async () => {
    const { tx, byId, ledger } = makeFakeTx([produto({ storeId: OUTRA_LOJA })])
    await expectUnresolved(
      upsertVendaInTransaction(
        tx,
        STORE,
        venda([{ inventoryId: "PEL-NOVO", produtoId: "cuid-pelicula", name: "PELÍCULA", quantity: 2, unitPrice: 4 }]),
        undefined,
        LIVE,
      ),
    )
    expect(byId.get("cuid-pelicula")!.stock).toBe(10)
    expect(ledger).toHaveLength(0)
  })

  it("linha legada sem produtoId mantém a resolução id|sku|barcode", async () => {
    const { tx, byId, itemRows } = makeFakeTx([produto()])
    await upsertVendaInTransaction(
      tx,
      STORE,
      venda([{ inventoryId: "PEL-NOVO", name: "PELÍCULA", quantity: 2, unitPrice: 4 }]),
      undefined,
      LIVE,
    )
    expect(itemRows[0]!.inventoryId).toBe("cuid-pelicula")
    expect(byId.get("cuid-pelicula")!.stock).toBe(8)
  })

  it("duas linhas do mesmo produto (SKU antigo + atual) agregam em uma baixa", async () => {
    const { tx, byId, ledger, itemRows } = makeFakeTx([produto()])
    await upsertVendaInTransaction(
      tx,
      STORE,
      venda([
        { inventoryId: "PEL-ANTIGO", produtoId: "cuid-pelicula", name: "PELÍCULA", quantity: 1, unitPrice: 4 },
        { inventoryId: "PEL-NOVO", produtoId: "cuid-pelicula", name: "PELÍCULA", quantity: 1, unitPrice: 4 },
      ]),
      undefined,
      LIVE,
    )
    expect(itemRows.map((r) => r.inventoryId)).toEqual(["cuid-pelicula", "cuid-pelicula"])
    expect(byId.get("cuid-pelicula")!.stock).toBe(8)
    expect(ledger).toHaveLength(1)
  })

  it("linha de serviço com produtoId espúrio segue virtual (sem Produto, sem baixa)", async () => {
    const { tx, ledger, produtoQueries } = makeFakeTx([])
    await upsertVendaInTransaction(
      tx,
      STORE,
      venda([{ inventoryId: servicoInventoryId("svc-1"), produtoId: "x", name: "Aplicação", quantity: 1, unitPrice: 8 }]),
      undefined,
      LIVE,
    )
    expect(ledger).toHaveLength(0)
    expect(produtoQueries).toHaveLength(0)
  })
})
