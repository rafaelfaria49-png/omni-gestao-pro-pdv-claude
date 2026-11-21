/**
 * COMPAT-PROFISSIONAL-001 — classificação PURA de produtos de capinha e relatório de vendas.
 *
 * Dois controles coexistem na mesma loja:
 *  - GERAL (Tipo A): produto genérico ("Capinha transparente") com estoque TOTAL. Modelo/cor
 *    informados na venda viram histórico; NUNCA viram saldo por modelo.
 *  - DETALHADO (Tipo B): produto próprio por modelo/tipo/cor, vinculado a modelos de aparelho
 *    (`metadata.catalogoAparelhos`), com estoque, código e preço próprios.
 *
 * Nada aqui escreve estoque. O relatório só soma o que foi registrado — quantidades por modelo
 * de produtos GERAIS são "vendas informadas", nunca saldo.
 */

import { getProdutoAcessoriosMetadata, modoModeloEfetivo } from "@/lib/acessorios/metadata"
import { resolveAcessorioColorLabel } from "@/lib/acessorios/cores"
import { getProdutoCatalogoAparelhos } from "@/lib/catalogo-aparelhos/produto-metadata"

export type ControleCapinha = "geral" | "detalhado"

export interface ProdutoCapinhaInfo {
  id: string
  name: string
  sku: string | null
  stock: number
  active: boolean
  controle: ControleCapinha
  /** Modelos vinculados (só controle detalhado). */
  deviceModelKeys: string[]
  /** O PDV pergunta o modelo ao vender (modo obrigatório/opcional). */
  pedeModeloNaVenda: boolean
}

/**
 * Classifica um produto como capinha (ou `null`).
 *  - Vinculado a modelos com tipo de compatibilidade "capinha" → DETALHADO.
 *  - Configurado como acessório do tipo capinha, sem vínculo de modelo → GERAL.
 */
export function classificarProdutoCapinha(p: {
  id: string
  name: string
  sku?: string | null
  stock?: number | null
  active?: boolean | null
  metadata?: unknown
}): ProdutoCapinhaInfo | null {
  const acessorio = getProdutoAcessoriosMetadata(p.metadata)
  const catalogo = getProdutoCatalogoAparelhos(asRecord(p.metadata))
  const modelos = catalogo?.deviceModelKeys ?? []
  const vinculoCapinha = modelos.length > 0 && (catalogo?.compatibilityTypes ?? []).includes("capinha")
  const ehCapinha = acessorio?.tipo === "capinha" || vinculoCapinha
  if (!ehCapinha) return null
  return {
    id: p.id,
    name: p.name,
    sku: p.sku ?? null,
    stock: typeof p.stock === "number" && Number.isFinite(p.stock) ? p.stock : 0,
    active: p.active !== false,
    controle: vinculoCapinha ? "detalhado" : "geral",
    deviceModelKeys: vinculoCapinha ? [...modelos] : [],
    pedeModeloNaVenda: modoModeloEfetivo(acessorio) !== "desativado",
  }
}

// ---------------------------------------------------------------------------
// Relatório de vendas de capinhas
// ---------------------------------------------------------------------------

export interface VendaParaRelatorio {
  /** Chave de negócio (`Venda.pedidoId`), usada para casar as devoluções canônicas. */
  pedidoId?: string | null
  status?: string | null
  payload?: unknown
}

/**
 * Devoluções canônicas (`DevolucaoVenda` + itens), por `pedidoId` da venda de origem:
 * `inventoryId` (o mesmo da linha da venda) → quantidade devolvida somada.
 */
export type DevolucoesPorVenda = ReadonlyMap<string, ReadonlyMap<string, number>>

export interface ItemContagem {
  chave: string
  rotulo: string
  quantidade: number
}

export interface RelatorioCapinhas {
  vendasConsideradas: number
  totalVendido: number
  porProduto: (ItemContagem & { controle: ControleCapinha })[]
  /** Modelos INFORMADOS nas vendas (seleção do operador). */
  porModelo: ItemContagem[]
  porCor: ItemContagem[]
  /** Capinhas de controle GERAL vendidas sem modelo informado. */
  semModelo: number
  /** Capinhas vendidas sem cor informada. */
  semCor: number
  /** Por controle: quanto saiu de produtos gerais × detalhados. */
  porControle: Record<ControleCapinha, number>
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : ""
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0
}

function bump(map: Map<string, ItemContagem>, chave: string, rotulo: string, qtd: number) {
  const cur = map.get(chave)
  if (cur) cur.quantidade += qtd
  else map.set(chave, { chave, rotulo, quantidade: qtd })
}

function ordenar<T extends ItemContagem>(map: Map<string, T>): T[] {
  return [...map.values()].sort((a, b) => b.quantidade - a.quantidade || a.rotulo.localeCompare(b.rotulo, "pt-BR"))
}

/**
 * Soma as linhas de capinha das vendas. Vendas canceladas não contam; devoluções são
 * descontadas (`qtyReturned`). Uma linha só entra se o produto (por `produtoId`, id ou SKU)
 * estiver classificado como capinha — nada é presumido pelo nome.
 */
export function montarRelatorioCapinhas(
  vendas: readonly VendaParaRelatorio[],
  produtos: readonly ProdutoCapinhaInfo[],
  devolucoes: DevolucoesPorVenda = new Map(),
): RelatorioCapinhas {
  const porId = new Map(produtos.map((p) => [p.id, p]))
  const porSku = new Map(produtos.filter((p) => p.sku).map((p) => [p.sku as string, p]))
  const produtoMap = new Map<string, ItemContagem & { controle: ControleCapinha }>()
  const modeloMap = new Map<string, ItemContagem>()
  const corMap = new Map<string, ItemContagem>()
  const porControle: Record<ControleCapinha, number> = { geral: 0, detalhado: 0 }
  let total = 0
  let semModelo = 0
  let semCor = 0
  let consideradas = 0

  for (const venda of vendas) {
    const status = str(venda.status)
    // Cancelada não conta; devolvida por inteiro também não (mesmo sem itens de devolução gravados).
    if (status === "cancelada" || status === "devolvida") continue
    const lines = asRecord(venda.payload)?.lines
    if (!Array.isArray(lines)) continue
    // Devolução por item da venda: payload (`qtyReturned`, atribuído à linha) e canônica
    // (`DevolucaoVenda`, só por item) descrevem a MESMA devolução. Reconcilia por item ANTES de
    // distribuir: total devolvido = maior dos dois; o que o payload já atribuiu fica na linha dele
    // e só o EXCEDENTE canônico é distribuído entre as linhas do item (nunca desconta duas vezes).
    const canon = devolucoes.get(str(venda.pedidoId)) ?? new Map<string, number>()
    const chaveItem = (l: Record<string, unknown>) => str(l.inventoryId) || str(l.produtoId)
    const payloadPorItem = new Map<string, number>()
    for (const raw of lines) {
      const l = asRecord(raw)
      if (!l) continue
      const k = chaveItem(l)
      if (k) payloadPorItem.set(k, (payloadPorItem.get(k) ?? 0) + Math.max(0, num(l.qtyReturned)))
    }
    const excedente = new Map<string, number>()
    for (const [k, pago] of payloadPorItem) {
      const canonico = canon.get(k) ?? 0
      if (canonico > pago) excedente.set(k, canonico - pago)
    }
    let contou = false
    for (const raw of lines) {
      const line = asRecord(raw)
      if (!line || line.isAvulso === true) continue
      const produto =
        porId.get(str(line.produtoId)) ?? porId.get(str(line.inventoryId)) ?? porSku.get(str(line.inventoryId))
      if (!produto) continue
      const vendida = num(line.quantity)
      const k = chaveItem(line)
      const doPayload = Math.min(vendida, Math.max(0, num(line.qtyReturned)))
      const saldo = excedente.get(k) ?? 0
      const extra = Math.min(saldo, vendida - doPayload)
      if (extra > 0) excedente.set(k, saldo - extra)
      const qtd = Math.max(0, vendida - doPayload - extra)
      if (qtd <= 0) continue
      contou = true
      total += qtd
      porControle[produto.controle] += qtd
      const pAtual = produtoMap.get(produto.id)
      if (pAtual) pAtual.quantidade += qtd
      else produtoMap.set(produto.id, { chave: produto.id, rotulo: produto.name, quantidade: qtd, controle: produto.controle })

      const sel = asRecord(line.accessorySelection)
      const modeloNome = str(sel?.deviceModelName)
      const modeloKey = str(sel?.deviceModelKey)
      if (modeloNome || modeloKey) bump(modeloMap, modeloKey || modeloNome.toUpperCase(), modeloNome || modeloKey, qtd)
      else if (produto.controle === "geral") semModelo += qtd

      const colorKey = str(sel?.colorKey)
      const corRotulo =
        colorKey === "outra"
          ? str(sel?.customColorLabel) || "Outra"
          : str(sel?.colorLabel) || resolveAcessorioColorLabel(colorKey) || colorKey
      if (corRotulo) bump(corMap, corRotulo.toLocaleUpperCase("pt-BR"), corRotulo, qtd)
      else semCor += qtd
    }
    if (contou) consideradas++
  }

  return {
    vendasConsideradas: consideradas,
    totalVendido: total,
    porProduto: ordenar(produtoMap),
    porModelo: ordenar(modeloMap),
    porCor: ordenar(corMap),
    semModelo,
    semCor,
    porControle,
  }
}
