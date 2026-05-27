// ============================================================
// lib/importador-produtos/dedupe.ts
// Deduplicação interna da planilha + consulta de possíveis duplicados no banco.
//
// IMPORTANTE: a contagem aqui DEVE usar a mesma função de match que o persist
// (lib/importador-produtos/match.ts) — preview e execução não podem divergir.
// ============================================================

import { prisma } from "@/lib/prisma"
import { normalizeSkuForSave } from "@/lib/produto-sku"
import type { ProdutoNormalizado } from "./types"
import {
  classificarBarcode,
  classificarSku,
  resolveProductImportMatch,
  type SnapshotBancoProdutos,
} from "./match"

/** Identidade interna para dedup (apenas dentro da própria planilha). */
function chaveInterna(p: ProdutoNormalizado): string {
  const sku = (p.sku ?? "").trim().toLowerCase()
  if (sku) return `sku:${sku}`
  const bc = (p.barcode ?? "").trim()
  if (bc) return `bc:${bc}`
  return `nome:${(p.nome ?? "").trim().toLowerCase()}`
}

/** Conta linhas que colidiriam entre si dentro da planilha. */
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

export type AnaliseDuplicadosBanco = {
  /** Match FORTE (autorizaria update automático): barcode EAN/GTIN ou SKU alfanumérico/longo. */
  forte: number
  /** Match FRACO (NÃO autoriza update — só informa): SKU curto numérico ou barcode mal formatado. */
  fraco: number
  /** Sem nenhuma chave que ajude a casar (planilha pobre — todos serão criados). */
  semChave: number
}

/**
 * Roda a MESMA lógica de match do persist contra o snapshot do banco,
 * devolvendo a separação forte/fraco para o preview.
 *
 * Sem isso, o preview reportava "25 possíveis duplicados" via critério próprio
 * e o persist atualizava 500 via critério agressivo (OR com gc-prefix, etc.) —
 * divergência que causou o incidente Smart.
 */
export async function analisarDuplicadosBanco(
  storeId: string,
  validos: ProdutoNormalizado[],
): Promise<AnaliseDuplicadosBanco> {
  const out: AnaliseDuplicadosBanco = { forte: 0, fraco: 0, semChave: 0 }
  if (validos.length === 0) return out

  // 1. Monta snapshot do banco (mesma estratégia do persist — 2 queries batch).
  const skusBuscar = new Set<string>()
  const barcodesBuscar = new Set<string>()
  for (const p of validos) {
    const sku = (p.sku ?? "").trim()
    const barcode = (p.barcode ?? "").trim()
    if (sku) {
      const skuToSave = normalizeSkuForSave(sku)
      if (skuToSave) skusBuscar.add(skuToSave.toLowerCase())
    }
    if (barcode) barcodesBuscar.add(barcode)
  }

  const banco: SnapshotBancoProdutos = { skus: new Set(), barcodes: new Set() }

  const arrSkus = Array.from(skusBuscar)
  const arrBarcodes = Array.from(barcodesBuscar)

  // Monta arrays de chunks
  const skuChunks: string[][] = []
  for (let i = 0; i < arrSkus.length; i += 500) skuChunks.push(arrSkus.slice(i, i + 500))
  const barcodeChunks: string[][] = []
  for (let i = 0; i < arrBarcodes.length; i += 500) barcodeChunks.push(arrBarcodes.slice(i, i + 500))

  // Busca SKU e barcode em paralelo (não sequencial)
  const [skuResultados, barcodeResultados] = await Promise.all([
    Promise.all(
      skuChunks.map((slice) =>
        prisma.produto.findMany({
          where: { storeId, sku: { in: slice, mode: "insensitive" } },
          select: { sku: true, barcode: true, storeId: true },
        }),
      ),
    ),
    Promise.all(
      barcodeChunks.map((slice) =>
        prisma.produto.findMany({
          where: { storeId, barcode: { in: slice } },
          select: { sku: true, barcode: true, storeId: true },
        }),
      ),
    ),
  ])

  for (const rows of [...skuResultados, ...barcodeResultados]) {
    for (const f of rows) {
      if (f.storeId !== storeId) continue
      if (f.sku) banco.skus.add(f.sku.toLowerCase())
      if (f.barcode) banco.barcodes.add(f.barcode)
    }
  }

  // 2. Aplica `resolveProductImportMatch` linha a linha.
  for (const p of validos) {
    const resolucao = resolveProductImportMatch(p, banco)
    if (resolucao.matchForte) {
      out.forte++
    } else if (resolucao.matchFraco) {
      out.fraco++
    } else {
      const sku = (p.sku ?? "").trim()
      const barcode = (p.barcode ?? "").trim()
      if (classificarSku(sku) === "ausente" && classificarBarcode(barcode) === "ausente") {
        out.semChave++
      }
    }
  }

  return out
}

/**
 * Compatibilidade: a UI antiga chamava `contarPossiveisDuplicadosBanco`.
 * Mantemos a função para não quebrar nada, mas devolve só `forte + fraco`.
 * Novo código deve usar `analisarDuplicadosBanco` para granularidade.
 */
export async function contarPossiveisDuplicadosBanco(
  storeId: string,
  validos: ProdutoNormalizado[],
): Promise<number> {
  const a = await analisarDuplicadosBanco(storeId, validos)
  return a.forte + a.fraco
}
