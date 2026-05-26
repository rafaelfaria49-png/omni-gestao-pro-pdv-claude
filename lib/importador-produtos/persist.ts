// ============================================================
// lib/importador-produtos/persist.ts
// Upsert de um lote de produtos. Idempotente. Não aborta por linha.
// Reusa a lógica de dedupe do importador avançado.
// ============================================================

import { prisma } from "@/lib/prisma"
import type { Prisma } from "@/generated/prisma"
import { normalizeSkuForSave } from "@/lib/produto-sku"
import {
  normalizeProdutoSku,
  looksLikeEan,
  nomePareceDocumento,
} from "@/lib/produto-sku-normalize"
import type { ItemResultado, ModoConflito, ProdutoNormalizado } from "./types"

function slugCategoria(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .slice(0, 50) || "geral"
}

/**
 * Persiste UM produto. Retorna o resultado por linha.
 * Mesma estratégia de dedup do persistidor avançado:
 *  - SKU normalizado (sem gc-)
 *  - SKU original
 *  - SKU com prefixo gc- (legado)
 *  - barcode igual
 *  - se SKU parece EAN, casa também por barcode == sku
 */
async function upsertUmProduto(
  storeId: string,
  p: ProdutoNormalizado,
  modoConflito: ModoConflito,
): Promise<ItemResultado> {
  const base: ItemResultado = {
    linha: p.linha,
    sku: p.sku,
    barcode: p.barcode,
    nome: p.nome,
    acao: "erro",
  }

  try {
    if (!p.nome.trim()) {
      return { ...base, acao: "pulado", detalhe: "nome vazio" }
    }
    if (nomePareceDocumento(p.nome)) {
      return { ...base, acao: "pulado", detalhe: "linha parece termo/documento" }
    }

    const catSlug = slugCategoria(p.categoria || "produto")
    const skuRaw = p.sku.trim()
      ? p.sku.trim()
      : `IMP-${catSlug}-${p.nome.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 20)}`
    const skuToSave = normalizeSkuForSave(skuRaw)
    const skuNorm = normalizeProdutoSku(skuToSave)

    const orMatch: Prisma.ProdutoWhereInput[] = [{ sku: skuToSave }]
    if (skuRaw !== skuToSave) orMatch.push({ sku: skuRaw })
    if (skuNorm && skuNorm !== skuToSave.toLowerCase()) orMatch.push({ sku: skuNorm })
    if (skuNorm) orMatch.push({ sku: `gc-${skuNorm}` })
    if (p.barcode) orMatch.push({ barcode: p.barcode })
    if (looksLikeEan(skuNorm)) orMatch.push({ barcode: skuNorm })

    const existente = await prisma.produto.findFirst({
      where: { storeId, OR: orMatch },
      select: { id: true, barcode: true },
    })

    if (existente) {
      if (modoConflito === "pular") {
        return { ...base, acao: "pulado", detalhe: "já existia (modo pular)" }
      }
      // modoConflito === "atualizar":
      // NUNCA sobrescreve stock — estoque só muda por ledger auditado.
      // Aplica nome/categoria sempre; preço/custo só se > 0; barcode só se vier preenchido.
      await prisma.produto.update({
        where: { id: existente.id },
        data: {
          name: p.nome,
          category: catSlug,
          precoCusto: p.custo > 0 ? p.custo : undefined,
          price: p.preco > 0 ? p.preco : undefined,
          barcode: p.barcode || existente.barcode || undefined,
          brand: p.categoria || undefined,
        },
      })
      return { ...base, acao: "atualizado" }
    }

    // Novo produto: pode iniciar com o estoque da planilha.
    await prisma.produto.create({
      data: {
        storeId,
        sku: skuToSave,
        name: p.nome,
        category: catSlug,
        precoCusto: p.custo,
        price: p.preco,
        stock: p.estoque,
        barcode: p.barcode || null,
        brand: p.categoria || "",
      },
    })
    return { ...base, acao: "criado" }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // Unique race — outra request criou o mesmo SKU. Tratamos como atualizado para não falhar o lote.
    if (msg.includes("Unique")) {
      return { ...base, acao: "atualizado", detalhe: "unique race" }
    }
    return { ...base, acao: "erro", detalhe: msg }
  }
}

export type ResultadoLotePersistencia = {
  criados: number
  atualizados: number
  pulados: number
  erros: number
  itens: ItemResultado[]
  duracaoMs: number
}

export async function persistirLoteProdutos(
  storeId: string,
  itens: ProdutoNormalizado[],
  modoConflito: ModoConflito,
): Promise<ResultadoLotePersistencia> {
  const inicio = Date.now()
  const resultados: ItemResultado[] = []
  for (const p of itens) {
    const r = await upsertUmProduto(storeId, p, modoConflito)
    resultados.push(r)
  }
  const criados = resultados.filter((r) => r.acao === "criado").length
  const atualizados = resultados.filter((r) => r.acao === "atualizado").length
  const pulados = resultados.filter((r) => r.acao === "pulado").length
  const erros = resultados.filter((r) => r.acao === "erro").length
  return {
    criados,
    atualizados,
    pulados,
    erros,
    itens: resultados,
    duracaoMs: Date.now() - inicio,
  }
}
