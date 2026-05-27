// ============================================================
// lib/importador-produtos/match.ts
// Função única de resolução de match preview ↔ execução.
//
// Conceito: separa SKU/barcode FORTES (alfanuméricos, EAN/GTIN reais,
// >= 7 dígitos) de chaves FRACAS (códigos curtos numéricos como 10, 148,
// 1000 — sequenciais de qualquer ERP, alta chance de colidir entre lojas
// e entre planilhas). Matching automático só pode acontecer com chave forte.
// ============================================================

import type { ProdutoNormalizado } from "./types"

/** Resultado da classificação de uma chave. */
export type ForcaChave = "forte" | "fraca" | "ausente"

/**
 * Classifica um SKU.
 *  - "ausente": string vazia
 *  - "forte":   contém letra OU tem >=7 caracteres (alfanumérico longo, código de fornecedor)
 *  - "fraca":   só dígitos com <=6 caracteres (ex.: "10", "148", "1000")
 *
 * O limiar de 7 captura códigos sequenciais comuns de ERPs antigos (até ~9999)
 * que costumam colidir entre planilhas. EAN/GTIN tem 8+, então sempre será forte.
 */
export function classificarSku(sku: string): ForcaChave {
  const s = (sku ?? "").trim()
  if (!s) return "ausente"
  // Tem qualquer letra → alfanumérico, considera forte
  if (/[a-zA-Z]/.test(s)) return "forte"
  // Só dígitos: ≥7 dígitos é forte (EAN, GTIN, código longo), ≤6 é fraco
  if (/^\d+$/.test(s)) return s.length >= 7 ? "forte" : "fraca"
  // Tem caracteres especiais (hífen, ponto) → considera forte
  return "forte"
}

/**
 * Classifica um barcode.
 *  - "forte":   8/12/13/14 dígitos (EAN-8, UPC-A, EAN-13, EAN-14/GTIN-14)
 *  - "fraca":   qualquer outra coisa preenchida (códigos internos colocados na coluna errada)
 *  - "ausente": vazio
 */
export function classificarBarcode(barcode: string): ForcaChave {
  const s = (barcode ?? "").trim()
  if (!s) return "ausente"
  if (/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(s)) return "forte"
  return "fraca"
}

/** Tipo de chave usada na decisão de match. */
export type CampoChave = "barcode" | "sku" | "none"

/** Resultado da resolução para um produto. */
export type ResolucaoMatch = {
  /** Match forte detectado: existe produto no banco com chave forte igual. */
  matchForte: { campo: CampoChave; valor: string } | null
  /** Match fraco detectado: existe produto no banco apenas via chave fraca (numérico curto). */
  matchFraco: { campo: CampoChave; valor: string } | null
  /** Classificação das próprias chaves do produto na planilha (independente do banco). */
  classificacaoSku: ForcaChave
  classificacaoBarcode: ForcaChave
}

/**
 * Snapshot do banco para resolver matches em batch.
 * Mantemos sets separados por campo para refletir "match por barcode" vs "match por sku".
 */
export type SnapshotBancoProdutos = {
  /** SKUs presentes no banco — chave: sku exato (case-insensitive já normalizado a lowercase). */
  skus: Set<string>
  /** Barcodes presentes no banco. */
  barcodes: Set<string>
}

/** Helper: normaliza para comparação (lowercase + trim). */
function norm(s: string): string {
  return (s ?? "").trim().toLowerCase()
}

/**
 * Resolve o match de um produto contra o snapshot do banco.
 *
 * Regras (deliberadamente conservadoras):
 *  1. Barcode forte (EAN/GTIN válido) presente no banco → match FORTE.
 *  2. SKU forte (alfanumérico ou ≥7 dígitos) presente no banco → match FORTE.
 *  3. Barcode fraco ou SKU fraco (curto numérico) presentes no banco → match FRACO.
 *  4. Nenhuma chave bate → sem match.
 *
 * Match forte ganha sobre fraco quando ambos existem.
 */
export function resolveProductImportMatch(
  p: ProdutoNormalizado,
  banco: SnapshotBancoProdutos,
): ResolucaoMatch {
  const sku = (p.sku ?? "").trim()
  const barcode = (p.barcode ?? "").trim()
  const cSku = classificarSku(sku)
  const cBc = classificarBarcode(barcode)

  let matchForte: ResolucaoMatch["matchForte"] = null
  let matchFraco: ResolucaoMatch["matchFraco"] = null

  // 1. Barcode forte
  if (cBc === "forte" && banco.barcodes.has(norm(barcode))) {
    matchForte = { campo: "barcode", valor: barcode }
  }

  // 2. SKU forte (só sobrescreve se não houver match por barcode forte ainda)
  if (!matchForte && cSku === "forte" && banco.skus.has(norm(sku))) {
    matchForte = { campo: "sku", valor: sku }
  }

  // 3. Matches fracos (apenas reportados, não autorizam update automático)
  if (!matchForte) {
    if (cBc === "fraca" && banco.barcodes.has(norm(barcode))) {
      matchFraco = { campo: "barcode", valor: barcode }
    } else if (cSku === "fraca" && banco.skus.has(norm(sku))) {
      matchFraco = { campo: "sku", valor: sku }
    }
  }

  return {
    matchForte,
    matchFraco,
    classificacaoSku: cSku,
    classificacaoBarcode: cBc,
  }
}

/**
 * Decisão final aplicada por linha durante a persistência.
 *
 *  - "criar":     gravar novo produto (sem match forte com chave confiável).
 *  - "atualizar": só ocorre em `modo === "atualizar"` E match forte presente.
 *  - "pular":     deixar como está (existente + modo "pular", ou match fraco em qualquer modo
 *                 que não autorize update por chave fraca).
 */
export type AcaoPersistencia = "criar" | "atualizar" | "pular"

export type ModoImportacao =
  /** Default seguro: cria novos; pula quando há match forte; cria mesmo com match fraco. */
  | "criar-novos"
  /** Atualiza quando há match forte; cria quando não há match; pula match fraco. */
  | "atualizar-existentes"
  /** Cria quando não há match; pula em qualquer match (forte ou fraco). */
  | "pular-existentes"

export function decidirAcao(
  resolucao: ResolucaoMatch,
  modo: ModoImportacao,
): { acao: AcaoPersistencia; motivo: string } {
  // Match forte presente
  if (resolucao.matchForte) {
    if (modo === "atualizar-existentes") {
      return {
        acao: "atualizar",
        motivo: `match forte por ${resolucao.matchForte.campo} (${resolucao.matchForte.valor})`,
      }
    }
    return {
      acao: "pular",
      motivo: `já existe no banco (match forte por ${resolucao.matchForte.campo}); modo "${modo}" não autoriza atualização`,
    }
  }
  // Match fraco presente
  if (resolucao.matchFraco) {
    if (modo === "pular-existentes") {
      return {
        acao: "pular",
        motivo: `possível duplicata por chave fraca (${resolucao.matchFraco.campo}=${resolucao.matchFraco.valor}); modo "pular" não cria`,
      }
    }
    // "criar-novos" e "atualizar-existentes" preferem criar do que atualizar por chave fraca
    return {
      acao: "criar",
      motivo: `chave ${resolucao.matchFraco.campo}=${resolucao.matchFraco.valor} é fraca (curto numérico); criando novo em vez de atualizar`,
    }
  }
  // Sem match — sempre cria
  return { acao: "criar", motivo: "sem chave de match no banco" }
}
