// ============================================================
// lib/importador-produtos/dedupe.ts
// Deduplicação interna da planilha + consulta de possíveis duplicados no banco.
// ============================================================

import { prisma } from "@/lib/prisma"
import { normalizeProdutoSku } from "@/lib/produto-sku-normalize"
import { normalizeSkuForSave } from "@/lib/produto-sku"
import type { ProdutoNormalizado } from "./types"

/** Identidade interna para dedup: prioridade SKU normalizado → barcode → nome normalizado. */
function chaveInterna(p: ProdutoNormalizado): string {
  const skuN = normalizeProdutoSku(p.sku)
  if (skuN) return `sku:${skuN}`
  const bc = (p.barcode ?? "").trim()
  if (bc) return `bc:${bc}`
  return `nome:${(p.nome ?? "").trim().toLowerCase()}`
}

/**
 * Conta quantos produtos válidos colidiriam entre si dentro da planilha.
 * (Não remove — apenas reporta. Persist usa upsert idempotente; quem chega depois ganha.)
 */
export function contarDuplicadosInternos(validos: ProdutoNormalizado[]): number {
  const visto = new Map<string, number>()
  for (const p of validos) {
    const k = chaveInterna(p)
    visto.set(k, (visto.get(k) ?? 0) + 1)
  }
  let duplicados = 0
  for (const count of visto.values()) {
    if (count > 1) duplicados += count - 1
  }
  return duplicados
}

/**
 * Verifica quantos dos itens já existem no banco para a loja informada.
 * Faz lookup em lotes para evitar query gigante.
 *
 * Considera "possível duplicado" se:
 *   - existe produto no storeId com `sku` igual (normalizado, ou com prefixo gc-)
 *   - OU existe produto com `barcode` igual
 *
 * O upsert real (em persist.ts) reusa a mesma lógica para decidir update vs create.
 */
export async function contarPossiveisDuplicadosBanco(
  storeId: string,
  validos: ProdutoNormalizado[],
): Promise<number> {
  if (validos.length === 0) return 0

  const skus = new Set<string>()
  const skusComPrefixo = new Set<string>()
  const barcodes = new Set<string>()
  for (const p of validos) {
    const skuN = normalizeProdutoSku(p.sku)
    const skuSave = normalizeSkuForSave(p.sku)
    if (skuN) {
      skus.add(skuN)
      skus.add(skuSave)
      skusComPrefixo.add(`gc-${skuN}`)
    }
    const bc = (p.barcode ?? "").trim()
    if (bc) barcodes.add(bc)
  }

  const todosSkus = Array.from(new Set([...skus, ...skusComPrefixo]))
  const todosBarcodes = Array.from(barcodes)
  if (todosSkus.length === 0 && todosBarcodes.length === 0) return 0

  const BATCH = 500
  const existentesSku = new Set<string>()
  const existentesBarcode = new Set<string>()

  for (let i = 0; i < todosSkus.length; i += BATCH) {
    const slice = todosSkus.slice(i, i + BATCH)
    const found = await prisma.produto.findMany({
      where: { storeId, sku: { in: slice } },
      select: { sku: true, barcode: true },
    })
    for (const f of found) {
      if (f.sku) existentesSku.add(normalizeProdutoSku(f.sku))
      if (f.barcode) existentesBarcode.add(f.barcode)
    }
  }

  for (let i = 0; i < todosBarcodes.length; i += BATCH) {
    const slice = todosBarcodes.slice(i, i + BATCH)
    const found = await prisma.produto.findMany({
      where: { storeId, barcode: { in: slice } },
      select: { sku: true, barcode: true },
    })
    for (const f of found) {
      if (f.sku) existentesSku.add(normalizeProdutoSku(f.sku))
      if (f.barcode) existentesBarcode.add(f.barcode)
    }
  }

  let possiveis = 0
  for (const p of validos) {
    const skuN = normalizeProdutoSku(p.sku)
    const bc = (p.barcode ?? "").trim()
    if (skuN && existentesSku.has(skuN)) {
      possiveis++
      continue
    }
    if (bc && existentesBarcode.has(bc)) {
      possiveis++
    }
  }
  return possiveis
}
