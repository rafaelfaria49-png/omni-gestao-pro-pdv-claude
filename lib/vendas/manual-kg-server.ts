import "server-only"

import type { Prisma } from "@/generated/prisma"
import { hasInvalidProductCommercial, productCommercialFromMetadata } from "@/lib/cadastros/product-commercial-contract"
import { ManualKgSaleError } from "./manual-kg-contract"

/** Both switches are server-only and default OFF; no browser setting can enable KG. */
export function manualKgStoreApproved(storeId: string): boolean {
  return process.env.PDV_MANUAL_KG_RELEASE === "PDV-PADARIA-VENDA-MANUAL-KG-MVP-001" &&
    (process.env.PDV_MANUAL_KG_STORES ?? "").split(",").map((id) => id.trim()).filter(Boolean).includes(storeId)
}

export function isManualKgProduct(metadata: unknown): boolean {
  const commercial = productCommercialFromMetadata(metadata)
  return !hasInvalidProductCommercial(metadata) && commercial.modoVenda === "peso" &&
    commercial.unidade === "KG" && commercial.basePreco === "KG"
}

/** A code-only deploy cannot open sales against the old integer stock/item schema. */
export async function manualKgAvailable(db: Pick<Prisma.TransactionClient, "$queryRaw">, storeId: string): Promise<boolean> {
  if (!manualKgStoreApproved(storeId)) return false
  const rows = await db.$queryRaw<Array<{ ready: boolean }>>`
    SELECT count(*) = 6 AS ready FROM information_schema.columns
    WHERE table_schema = current_schema() AND data_type = 'double precision' AND
      ((table_name = 'venda_itens' AND column_name = 'quantidade') OR
       (table_name = 'estoque_produtos' AND column_name = 'stock') OR
       (table_name = 'produto_depositos' AND column_name = 'quantidade') OR
       (table_name = 'movimentacoes_estoque' AND column_name IN ('quantidade', 'estoqueAntes', 'estoqueDepois')))
  `
  return rows[0]?.ready === true
}

export async function assertManualKgAvailable(db: Pick<Prisma.TransactionClient, "$queryRaw">, storeId: string) {
  if (!await manualKgAvailable(db, storeId)) throw new ManualKgSaleError()
}
