/**
 * Versão do catálogo de produtos de UMA loja (PDV-CADASTROS-SYNC-AUTOMATICO-001).
 *
 * Toda escrita de `Produto` passa pelo Prisma (`create`/`update`/`delete`, inclusive a
 * baixa do ledger de estoque), e `updatedAt` é `@updatedAt`. Então `count` + `max(updatedAt)`
 * por `storeId` muda a cada criação, edição (nome, SKU, código, preço, estoque) e exclusão —
 * sem migration e sem tabela nova. O PDV só baixa o snapshot inteiro quando a versão muda.
 *
 * Módulo puro: o caller passa o cliente (`prisma` ou `tx`).
 */

export type CatalogVersionReader = {
  produto: {
    aggregate(args: {
      where: { storeId: string }
      _count: { _all: true }
      _max: { updatedAt: true }
    }): Promise<{ _count: { _all: number }; _max: { updatedAt: Date | null } }>
  }
}

const CATALOG_VERSION_PREFIX = "v1"

export function formatCatalogVersion(count: number, maxUpdatedAt: Date | null): string {
  const at = maxUpdatedAt instanceof Date && !Number.isNaN(maxUpdatedAt.getTime()) ? maxUpdatedAt.getTime() : 0
  return `${CATALOG_VERSION_PREFIX}:${Math.max(0, Math.trunc(count))}:${at}`
}

/** Leia ANTES do snapshot: uma escrita no meio deixa a versão velha e o próximo check refaz. */
export async function readCatalogVersion(db: CatalogVersionReader, storeId: string): Promise<string> {
  const agg = await db.produto.aggregate({
    where: { storeId },
    _count: { _all: true },
    _max: { updatedAt: true },
  })
  return formatCatalogVersion(agg._count._all, agg._max.updatedAt)
}

export function isCatalogVersion(value: unknown): value is string {
  return typeof value === "string" && /^v1:\d+:\d+$/.test(value)
}
