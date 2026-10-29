import "server-only"

import type { Prisma } from "@/generated/prisma"
import { hasInvalidProductCommercial, productCommercialFromMetadata } from "@/lib/cadastros/product-commercial-contract"
import { ManualKgSaleError } from "./manual-kg-contract"

/** Both switches are server-only and default OFF; no browser setting can enable KG. */
export function manualKgStoreApproved(storeId: string): boolean {
  return process.env.PDV_MANUAL_KG_RELEASE === "PDV-PADARIA-KG-RELEASE-HARDENING-002" &&
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
    SELECT count(*) = 7 AND
      (SELECT count(*) = 8 FROM (VALUES
        ('vendas','manual_kg_guard_venda'), ('venda_itens','manual_kg_guard_item'),
        ('movimentacoes_estoque','manual_kg_guard_stock_sale'), ('movimentacoes_financeiras','manual_kg_guard_finance_sale'),
        ('devolucoes_venda','manual_kg_guard_return'), ('itens_devolucao_venda','manual_kg_guard_return_item'),
        ('contas_receber_titulos','manual_kg_guard_title'), ('usos_credito_cliente','manual_kg_guard_credit_use')
      ) expected(tbl, fn) JOIN pg_namespace n ON n.nspname = current_schema()
        JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = expected.tbl
        JOIN pg_trigger t ON t.tgrelid = c.oid AND t.tgname = expected.fn AND t.tgenabled = 'O'
        JOIN pg_proc p ON p.oid = t.tgfoid AND p.proname = expected.fn AND p.pronamespace = n.oid
        WHERE p.prosecdef AND 'search_path=public, pg_temp' = ANY(p.proconfig)) AND
      EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
        WHERE n.nspname=current_schema() AND t.relname='venda_itens' AND c.conname='venda_itens_quantity_contract' AND c.convalidated
          AND obj_description(c.oid, 'pg_constraint') = 'manual-kg-additive-v2:' || md5(pg_get_constraintdef(c.oid))) AS ready FROM information_schema.columns
    WHERE table_schema = current_schema() AND
      ((table_name = 'venda_itens' AND column_name = 'quantidade' AND data_type = 'integer' AND is_nullable = 'YES') OR
       (table_name = 'venda_itens' AND column_name = 'quantidadeKg' AND data_type = 'numeric' AND numeric_precision = 65 AND numeric_scale = 30) OR
       (table_name = 'estoque_produtos' AND column_name = 'stock' AND data_type = 'double precision') OR
       (table_name = 'produto_depositos' AND column_name = 'quantidade' AND data_type = 'double precision') OR
       (table_name = 'movimentacoes_estoque' AND column_name IN ('quantidade', 'estoqueAntes', 'estoqueDepois') AND data_type = 'double precision'))
  `
  return rows[0]?.ready === true
}

export async function assertManualKgAvailable(db: Pick<Prisma.TransactionClient, "$queryRaw">, storeId: string) {
  if (!await manualKgAvailable(db, storeId)) throw new ManualKgSaleError()
}

/** Version barrier for old SQL clients; transaction-local, never authentication. */
export async function enterManualKgTransaction(db: Pick<Prisma.TransactionClient, "$queryRaw">) {
  await db.$queryRaw`SELECT set_config('omni.manual_kg_writer', 'additive-v2', true)`
}
