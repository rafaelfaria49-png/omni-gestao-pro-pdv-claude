// ============================================================
// lib/importador-produtos/persist.ts
// Upsert de um lote de produtos. Idempotente. Não aborta por linha.
//
// Filosofia (após incidente Smart 4.749 → 500 atualizados indevidamente):
//  - Matching automático SÓ por chave forte (vide ./match.ts).
//  - SKU vazio na planilha → grava `null` no banco. Nunca inventamos
//    "IMP-cat-nome" — isso causava colisão em massa por slice(0,20).
//  - storeId é obrigatório e usado em TODAS as queries (snapshot inicial
//    + verificação por linha antes de update).
//  - Snapshot do banco com IDs incluídos; chunks SKU+barcode em paralelo.
//    Elimina findFirst por linha (N+1) — update usa O(1) Map lookup.
//  - Upsert paralelizado em chunks de 20 para não saturar o pool DB.
//  - Logs estruturados (console.info) por lote: criados, atualizados,
//    pulados (e por quê), matches fracos descartados.
// ============================================================

import { prisma } from "@/lib/prisma"
import { normalizeSkuForSave } from "@/lib/produto-sku"
import { nomePareceDocumento } from "@/lib/produto-sku-normalize"
import type { ItemResultado, ModoConflito, ProdutoNormalizado } from "./types"
import {
  classificarBarcode,
  classificarSku,
  decidirAcao,
  resolveProductImportMatch,
  type ModoImportacao,
  type SnapshotBancoProdutos,
} from "./match"

function slugCategoria(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .slice(0, 50) || "geral"
}

/** Converte o modo de conflito da UI para o discriminado do `match.ts`. */
function mapearModo(modo: ModoConflito): ModoImportacao {
  switch (modo) {
    case "atualizar":
      return "atualizar-existentes"
    case "pular":
      return "pular-existentes"
    case "criar":
    default:
      return "criar-novos"
  }
}

/**
 * Snapshot interno de persistência — estende SnapshotBancoProdutos com Maps de ID.
 * Isso elimina o findFirst por linha no caminho de atualização (N+1).
 */
type SnapshotPersist = SnapshotBancoProdutos & {
  /** sku.toLowerCase() → produto.id */
  skuParaId: Map<string, string>
  /** barcode → produto.id */
  barcodeParaId: Map<string, string>
  /** sku.toLowerCase() → barcode atual do banco (para não apagar barcode ao atualizar por SKU) */
  skuParaBarcodeAtual: Map<string, string | null>
}

/**
 * Carrega snapshot do banco com IDs incluídos para resolver matches e upserts
 * sem findFirst por linha. Chunks de SKU e barcode buscados em paralelo.
 */
async function carregarSnapshotBanco(
  storeId: string,
  itens: ProdutoNormalizado[],
): Promise<SnapshotPersist> {
  const skusBuscar = new Set<string>()
  const barcodesBuscar = new Set<string>()

  for (const p of itens) {
    const sku = (p.sku ?? "").trim()
    const barcode = (p.barcode ?? "").trim()
    if (sku) {
      const skuToSave = normalizeSkuForSave(sku)
      if (skuToSave) skusBuscar.add(skuToSave.toLowerCase())
    }
    if (barcode) barcodesBuscar.add(barcode)
  }

  const skus = new Set<string>()
  const barcodes = new Set<string>()
  const skuParaId = new Map<string, string>()
  const barcodeParaId = new Map<string, string>()
  const skuParaBarcodeAtual = new Map<string, string | null>()

  const arrSkus = Array.from(skusBuscar)
  const arrBarcodes = Array.from(barcodesBuscar)

  const skuChunks: string[][] = []
  for (let i = 0; i < arrSkus.length; i += 500) skuChunks.push(arrSkus.slice(i, i + 500))
  const barcodeChunks: string[][] = []
  for (let i = 0; i < arrBarcodes.length; i += 500) barcodeChunks.push(arrBarcodes.slice(i, i + 500))

  // Busca SKU e barcode em paralelo — sem await sequencial
  const [skuResultados, barcodeResultados] = await Promise.all([
    Promise.all(
      skuChunks.map((slice) =>
        prisma.produto.findMany({
          where: { storeId, sku: { in: slice, mode: "insensitive" } },
          select: { id: true, sku: true, barcode: true, storeId: true },
        }),
      ),
    ),
    Promise.all(
      barcodeChunks.map((slice) =>
        prisma.produto.findMany({
          where: { storeId, barcode: { in: slice } },
          select: { id: true, sku: true, barcode: true, storeId: true },
        }),
      ),
    ),
  ])

  for (const rows of [...skuResultados, ...barcodeResultados]) {
    for (const f of rows) {
      // Defesa em profundidade: nunca confiar em registros de outra loja
      if (f.storeId !== storeId) continue
      if (f.sku) {
        const skuNorm = f.sku.toLowerCase()
        skus.add(skuNorm)
        skuParaId.set(skuNorm, f.id)
        skuParaBarcodeAtual.set(skuNorm, f.barcode ?? null)
      }
      if (f.barcode) {
        barcodes.add(f.barcode)
        barcodeParaId.set(f.barcode, f.id)
      }
    }
  }

  return { skus, barcodes, skuParaId, barcodeParaId, skuParaBarcodeAtual }
}

/**
 * Persiste UM produto a partir da decisão pré-resolvida.
 * Usa SnapshotPersist para resolver o ID do produto existente em O(1)
 * — sem findFirst por linha.
 */
async function aplicarLinha(
  storeId: string,
  p: ProdutoNormalizado,
  modo: ModoImportacao,
  banco: SnapshotPersist,
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

    const resolucao = resolveProductImportMatch(p, banco)
    const decisao = decidirAcao(resolucao, modo)

    if (decisao.acao === "pular") {
      return { ...base, acao: "pulado", detalhe: decisao.motivo }
    }

    const catSlug = slugCategoria(p.categoria || "produto")
    const skuRaw = (p.sku ?? "").trim()
    // PROIBIDO: inventar SKU. Se vazio na planilha, grava null. O Postgres
    // tolera múltiplos NULLs no @@unique([storeId, sku]).
    const skuToSave = skuRaw ? normalizeSkuForSave(skuRaw) : null
    const barcodeToSave = (p.barcode ?? "").trim() || null

    if (decisao.acao === "atualizar") {
      if (!resolucao.matchForte) {
        return { ...base, acao: "erro", detalhe: "atualizar sem match forte (estado inconsistente)" }
      }

      // Resolve ID via snapshot (O(1)) — elimina findFirst por linha
      let existenteId: string | undefined
      let barcodeExistente: string | null = null

      if (resolucao.matchForte.campo === "barcode") {
        existenteId = banco.barcodeParaId.get(resolucao.matchForte.valor)
        barcodeExistente = resolucao.matchForte.valor
      } else {
        const skuNorm = resolucao.matchForte.valor.toLowerCase()
        existenteId = banco.skuParaId.get(skuNorm)
        barcodeExistente = banco.skuParaBarcodeAtual.get(skuNorm) ?? null
      }

      if (!existenteId) {
        // Produto deletado entre snapshot e persist → criar como novo
        return await criarProdutoNovo(storeId, p, catSlug, skuToSave, barcodeToSave, base)
      }

      await prisma.produto.update({
        where: { id: existenteId },
        data: {
          name: p.nome,
          category: catSlug,
          // NUNCA sobrescreve stock — estoque só muda por ledger auditado.
          precoCusto: p.custo > 0 ? p.custo : undefined,
          price: p.preco > 0 ? p.preco : undefined,
          barcode: barcodeToSave ?? barcodeExistente ?? undefined,
          // brand: nunca importado a partir da categoria — as planilhas
          // suportadas (Gestão Clique / Smart Genius) não trazem coluna
          // de marca real. Mantém o brand existente intocado.
        },
      })
      return { ...base, acao: "atualizado", detalhe: decisao.motivo }
    }

    // decisao.acao === "criar"
    return await criarProdutoNovo(storeId, p, catSlug, skuToSave, barcodeToSave, base)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes("Unique")) {
      // Race: outra request criou o mesmo SKU/barcode simultaneamente.
      return { ...base, acao: "pulado", detalhe: "unique constraint (race condition)" }
    }
    return { ...base, acao: "erro", detalhe: msg }
  }
}

async function criarProdutoNovo(
  storeId: string,
  p: ProdutoNormalizado,
  catSlug: string,
  skuToSave: string | null,
  barcodeToSave: string | null,
  base: ItemResultado,
): Promise<ItemResultado> {
  // NCM/CEST vão em Produto.metadata (schema não tem coluna dedicada —
  // decisão arquitetural em docs/auditoria/COMPRAS_FORNECEDORES_PLANO_TECNICO.md:347).
  // Omite o objeto inteiro quando ambos vazios para não poluir o JSONB.
  const metadataExtras: Record<string, string> = {}
  if (p.ncm) metadataExtras.ncm = p.ncm
  if (p.cest) metadataExtras.cest = p.cest

  await prisma.produto.create({
    data: {
      storeId,
      sku: skuToSave,
      name: p.nome,
      category: catSlug,
      precoCusto: p.custo,
      price: p.preco,
      stock: p.estoque,
      barcode: barcodeToSave,
      metadata: Object.keys(metadataExtras).length > 0 ? metadataExtras : undefined,
      // brand: deixar vazio — schema default já é "". Planilhas suportadas
      // não trazem coluna de marca real. Não duplicar categoria em brand.
    },
  })
  return { ...base, acao: "criado", detalhe: skuToSave ? undefined : "sem SKU (planilha não trouxe)" }
}

export type ResultadoLotePersistencia = {
  criados: number
  atualizados: number
  pulados: number
  erros: number
  itens: ItemResultado[]
  duracaoMs: number
  /** Telemetria por chave de match — facilita auditar a planilha. */
  telemetria: {
    matchForteBarcode: number
    matchForteSku: number
    matchFracoBarcode: number
    matchFracoSku: number
    semChave: number
  }
}

export async function persistirLoteProdutos(
  storeId: string,
  itens: ProdutoNormalizado[],
  modoConflito: ModoConflito,
): Promise<ResultadoLotePersistencia> {
  const inicio = Date.now()
  const modo = mapearModo(modoConflito)

  // 1. Snapshot inicial do banco — 2 queries em vez de N findFirst
  const banco = await carregarSnapshotBanco(storeId, itens)

  // 2. Telemetria de classificação
  const telemetria = {
    matchForteBarcode: 0,
    matchForteSku: 0,
    matchFracoBarcode: 0,
    matchFracoSku: 0,
    semChave: 0,
  }

  // Telemetria prévia (sem I/O — apenas classifica para log)
  for (const p of itens) {
    const sku = (p.sku ?? "").trim()
    const barcode = (p.barcode ?? "").trim()
    const cSku = classificarSku(sku)
    const cBc = classificarBarcode(barcode)
    if (cSku === "ausente" && cBc === "ausente") telemetria.semChave++

    const resolucao = resolveProductImportMatch(p, banco)
    if (resolucao.matchForte?.campo === "barcode") telemetria.matchForteBarcode++
    else if (resolucao.matchForte?.campo === "sku") telemetria.matchForteSku++
    else if (resolucao.matchFraco?.campo === "barcode") telemetria.matchFracoBarcode++
    else if (resolucao.matchFraco?.campo === "sku") telemetria.matchFracoSku++
  }

  // Upsert em paralelo — chunks de 20 para não saturar o pool de conexões
  const CONCURRENCIA = 20
  const resultados: ItemResultado[] = []
  for (let i = 0; i < itens.length; i += CONCURRENCIA) {
    const chunk = itens.slice(i, i + CONCURRENCIA)
    const parcial = await Promise.all(chunk.map((p) => aplicarLinha(storeId, p, modo, banco)))
    resultados.push(...parcial)
  }

  const criados = resultados.filter((r) => r.acao === "criado").length
  const atualizados = resultados.filter((r) => r.acao === "atualizado").length
  const pulados = resultados.filter((r) => r.acao === "pulado").length
  const erros = resultados.filter((r) => r.acao === "erro").length

  console.info(
    `[import/produtos/persist] storeId=${storeId} modo=${modo} itens=${itens.length} ` +
      `criados=${criados} atualizados=${atualizados} pulados=${pulados} erros=${erros} ` +
      `match.forte.bc=${telemetria.matchForteBarcode} match.forte.sku=${telemetria.matchForteSku} ` +
      `match.fraco.bc=${telemetria.matchFracoBarcode} match.fraco.sku=${telemetria.matchFracoSku} ` +
      `sem.chave=${telemetria.semChave} duracao=${Date.now() - inicio}ms`,
  )

  return {
    criados,
    atualizados,
    pulados,
    erros,
    itens: resultados,
    duracaoMs: Date.now() - inicio,
    telemetria,
  }
}
