/**
 * CAD-R2-009 — Fake compartilhado do boundary Stock/Ledger para testes.
 *
 * TEST-ONLY (vitest `node`, sem banco). Acopla de forma NÃO-DESTRUTIVA a um
 * TransactionClient fake existente (`any`) os membros que
 * `applyStockMutationTx` exige, preservando o comportamento original do
 * harness (wraps com delegação):
 * - `tx.$queryRaw` (lock `SELECT ... FOR UPDATE` — fake aceita sem serializar
 *   de verdade; a prova de concorrência real exige Postgres);
 * - `tx.deposito` (principal por loja, lazy) e `tx.produtoDeposito` (saldos
 *   físicos), criados apenas se o harness ainda não os definir;
 * - `tx.produto.findFirst/findUnique`: intercepta SOMENTE `where: { id }`
 *   (+ `storeId` opcional) para ownership; qualquer outro `where` (ex.: `OR`
 *   de resolução id|sku|barcode) delega ao fake original;
 * - `tx.produto.update`: intercepta SOMENTE `data.stock` absoluto (boundary);
 *   `increment`/`decrement` delegam ao fake original;
 * - `tx.movimentacaoEstoque.findFirst`: intercepta SOMENTE lookup por
 *   `idempotencyKey` (índice lateral + busca no ledger); qualquer outro
 *   `where` (guarda legado, `tipo`/`createdAt` do historical-recovery) delega;
 * - `tx.movimentacaoEstoque.create`: checa unicidade da chave (P2002 fake),
 *   carimba `id`, delega o push ao fake original e indexa a chave.
 *
 * Mutação preserva as referências de `products` (mesmos objetos) para que os
 * mapas `byId` dos harnesses continuem enxergando o saldo atualizado.
 * Não importa `@/lib/prisma` nem o serviço (puro, sem `server-only`).
 */

export type StockLedgerFakeProduct = {
  id: string
  storeId: string
  stock: number
  precoCusto?: number
  sku?: string | null
  barcode?: string | null
  name?: string
  price?: number
}

export function attachStockLedgerBoundaryToFakeTx(
  tx: any,
  opts: {
    products: StockLedgerFakeProduct[]
    /** Array de ledger do harness (quando existir) para busca de linhas. */
    ledger?: Array<Record<string, unknown>>
  },
): void {
  const byId = new Map<string, StockLedgerFakeProduct>((opts.products ?? []).map((p) => [p.id, p]))
  const ledger: Array<Record<string, unknown>> = opts.ledger ?? []
  /** Índice lateral storeId|key → mov id (independe do formato da linha). */
  const seenKeys = new Map<string, string>()
  const depositos = new Map<string, { id: string; storeId: string }>()
  const pds = new Map<string, { storeId: string; produtoId: string; depositoId: string; quantidade: number }>()
  let depSeq = 1
  let movSeq = 1

  if (typeof tx.$queryRaw !== "function") {
    tx.$queryRaw = async () => []
  }

  if (tx.produto) {
    const origFindFirst =
      typeof tx.produto.findFirst === "function" ? tx.produto.findFirst.bind(tx.produto) : async () => null
    tx.produto.findFirst = async (args: any) => {
      const where = args?.where ?? {}
      if (typeof where.id === "string") {
        const p = byId.get(where.id) as Record<string, unknown> | undefined
        if (!p) return null
        if (where.storeId !== undefined && p.storeId !== where.storeId) return null
        return p
      }
      return origFindFirst(args)
    }

    const origFindUnique =
      typeof tx.produto.findUnique === "function" ? tx.produto.findUnique.bind(tx.produto) : async () => null
    tx.produto.findUnique = async (args: any) => {
      const p = (args?.where?.id ? byId.get(args.where.id) : undefined) as Record<string, unknown> | undefined
      if (p) return { ...p, id: p.id, storeId: p.storeId }
      return origFindUnique(args)
    }

    const origUpdate = typeof tx.produto.update === "function" ? tx.produto.update.bind(tx.produto) : null
    tx.produto.update = async (args: any) => {
      const data = args?.data ?? {}
      if (typeof data.stock === "number" || !origUpdate) {
        const p = byId.get(args?.where?.id) as Record<string, unknown> | undefined
        if (!p) throw new Error("P2025")
        if (typeof data.stock === "number") p.stock = data.stock
        else if (data.stock?.decrement != null) (p.stock as number) -= data.stock.decrement
        else if (data.stock?.increment != null) (p.stock as number) += data.stock.increment
        if (typeof data.precoCusto === "number") p.precoCusto = data.precoCusto
        return p
      }
      return origUpdate(args)
    }
  }

  if (!tx.deposito) {
    tx.deposito = {
      findFirst: async ({ where }: any) => {
        for (const d of depositos.values()) {
          if (where?.storeId !== undefined && d.storeId !== where.storeId) continue
          if (where?.id !== undefined && typeof where.id === "string" && d.id !== where.id) continue
          return { ...d }
        }
        return null
      },
      findUnique: async ({ where }: any) => {
        const d = where?.id ? [...depositos.values()].find((x) => x.id === where.id) : undefined
        return d ? { ...d } : null
      },
      create: async ({ data }: any) => {
        const row = { id: `dep-fake-${depSeq++}`, storeId: String(data?.storeId ?? "") }
        depositos.set(row.id, row)
        return { ...row }
      },
    }
  }

  if (!tx.produtoDeposito) {
    tx.produtoDeposito = {
      findMany: async ({ where }: any) => {
        const out: Array<{ depositoId: string; quantidade: number }> = []
        for (const r of pds.values()) {
          if (where?.storeId !== undefined && r.storeId !== where.storeId) continue
          if (where?.produtoId !== undefined && r.produtoId !== where.produtoId) continue
          out.push({ depositoId: r.depositoId, quantidade: r.quantidade })
        }
        return out
      },
      upsert: async ({ where, create, update }: any) => {
        const k = `${where?.produtoId_depositoId?.produtoId}|${where?.produtoId_depositoId?.depositoId}`
        const ex = pds.get(k)
        if (ex) ex.quantidade = update?.quantidade
        else {
          pds.set(k, {
            storeId: create?.storeId,
            produtoId: create?.produtoId,
            depositoId: create?.depositoId,
            quantidade: create?.quantidade ?? update?.quantidade,
          })
        }
        return {}
      },
    }
  }

  if (tx.movimentacaoEstoque) {
    const origFindFirst =
      typeof tx.movimentacaoEstoque.findFirst === "function"
        ? tx.movimentacaoEstoque.findFirst.bind(tx.movimentacaoEstoque)
        : async () => null
    tx.movimentacaoEstoque.findFirst = async (args: any) => {
      const where = args?.where ?? {}
      if (where.idempotencyKey !== undefined) {
        const k = `${where.storeId}|${where.idempotencyKey}`
        const knownId = seenKeys.get(k)
        if (knownId) {
          return (
            (ledger.find((m) => (m as Record<string, unknown>).id === knownId) as Record<string, unknown> | undefined) ??
            ({ id: knownId, storeId: where.storeId, idempotencyKey: where.idempotencyKey } as Record<string, unknown>)
          )
        }
        const hit = (ledger.find(
          (m) => m.storeId === where.storeId && (m.idempotencyKey ?? null) === where.idempotencyKey,
        ) as Record<string, unknown> | undefined) ?? null
        if (hit && (hit as Record<string, unknown>).id !== undefined) {
          seenKeys.set(k, String((hit as Record<string, unknown>).id))
        }
        return hit
      }
      return origFindFirst(args)
    }

    const origCreate =
      typeof tx.movimentacaoEstoque.create === "function"
        ? tx.movimentacaoEstoque.create.bind(tx.movimentacaoEstoque)
        : async ({ data }: any) => {
            ledger.push({ ...data })
            return data
          }
    tx.movimentacaoEstoque.create = async (args: any) => {
      const data = (args?.data ?? {}) as Record<string, unknown>
      const key = (data.idempotencyKey ?? null) as string | null
      if (key) {
        const k = `${data.storeId}|${key}`
        if (
          seenKeys.has(k) ||
          ledger.some((m) => m.storeId === data.storeId && (m.idempotencyKey ?? null) === key)
        ) {
          const e = new Error("Unique constraint failed") as Error & { code: string; name: string }
          e.code = "P2002"
          e.name = "PrismaClientKnownRequestError"
          throw e
        }
      }
      const id = `mov-fake-${movSeq++}`
      const ret = (await origCreate({ data: { ...data, id } })) as unknown
      if (key) seenKeys.set(`${data.storeId}|${key}`, id)
      const rid = (ret as Record<string, unknown> | null)?.id
      return { id: typeof rid === "string" && rid ? rid : id }
    }
  }
}
