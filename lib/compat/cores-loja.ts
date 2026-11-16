/**
 * COMPAT-PROFISSIONAL-001 — cores POR LOJA (camada pura).
 *
 * A paleta padrão (`lib/acessorios/cores.ts`, 18 cores) continua a fonte canônica: a loja só
 * pode DESATIVAR uma cor padrão para si. Cores novas da loja ganham rótulo próprio
 * (cadastrar/renomear/ativar/desativar). Na venda, a cor própria viaja como `colorKey: "outra"`
 * + `customColorLabel` — o mesmo contrato já aceito e congelado no histórico da venda, então
 * renomear/desativar uma cor nunca altera vendas antigas.
 */

import { ACESSORIO_CORES_PADRAO, type AcessorioColorKey } from "@/lib/acessorios/cores"
import { catalogKey, cleanCatalogText } from "@/lib/catalogo-aparelhos/loja-catalogo"

export const COR_LOJA_LIMITS = Object.freeze({ label: 40, coresPorLoja: 200 })

/** Linha persistida (já desserializada). `baseKey` = cor da paleta padrão; null = cor própria. */
export interface CorLoja {
  id: string
  baseKey: AcessorioColorKey | null
  label: string
  ativo: boolean
  ordem: number
  version: number
}

/** Cor exibida no Compat / PDV. */
export interface CorEfetiva {
  /** Paleta: a própria key ("preto"). Própria da loja: o id da linha. */
  id: string
  label: string
  origem: "padrao" | "loja"
  ativo: boolean
  baseKey: AcessorioColorKey | null
  version: number
  /** Id da linha persistida (cor padrão nunca configurada = null). */
  rowId: string | null
}

/** Chave de duplicidade: "Azul Bebê", "azul  bebe" e "AZUL BEBÊ" colidem. */
export function corLabelKey(label: string): string {
  return catalogKey(label)
}

export function sanitizeCorLabel(raw: unknown): { ok: true; label: string } | { ok: false; error: string } {
  const label = cleanCatalogText(raw, COR_LOJA_LIMITS.label)
  if (!label || corLabelKey(label).length < 2) return { ok: false, error: "Informe o nome da cor." }
  return { ok: true, label }
}

const PALETA_POR_LABEL_KEY = new Map(ACESSORIO_CORES_PADRAO.map((c) => [corLabelKey(c.label), c.key]))

/** Cor padrão com o mesmo nome (ex.: "preto" → "preto"). Impede cor própria duplicando a paleta. */
export function corPadraoComMesmoNome(label: string): AcessorioColorKey | null {
  return PALETA_POR_LABEL_KEY.get(corLabelKey(label)) ?? null
}

/**
 * Lista efetiva da loja: 18 cores da paleta (com o estado ativo/inativo da loja) + cores próprias.
 * "Outra" (texto livre) fica sempre por último na paleta e não é desativável pela loja.
 */
export function coresEfetivas(linhas: readonly CorLoja[]): CorEfetiva[] {
  const porBase = new Map(linhas.filter((l) => l.baseKey).map((l) => [l.baseKey as string, l]))
  const padrao: CorEfetiva[] = ACESSORIO_CORES_PADRAO.map((c) => {
    const row = porBase.get(c.key)
    return {
      id: c.key,
      label: c.label,
      origem: "padrao",
      ativo: c.key === "outra" ? true : (row?.ativo ?? true),
      baseKey: c.key,
      version: row?.version ?? 0,
      rowId: row?.id ?? null,
    }
  })
  const proprias: CorEfetiva[] = linhas
    .filter((l) => !l.baseKey)
    .sort((a, b) => a.ordem - b.ordem || a.label.localeCompare(b.label, "pt-BR"))
    .map((l) => ({ id: l.id, label: l.label, origem: "loja", ativo: l.ativo, baseKey: null, version: l.version, rowId: l.id }))
  return [...padrao, ...proprias]
}

/**
 * Opções de cor no PDV para um produto: paleta permitida pelo produto MENOS as desativadas
 * pela loja, MAIS as cores próprias ativas permitidas pelo produto (`coresLoja`; null = todas).
 */
export function opcoesDeCorParaProduto(
  paletaDoProduto: readonly { key: AcessorioColorKey; label: string }[],
  linhas: readonly CorLoja[],
  coresLojaDoProduto: readonly string[] | null | undefined,
): { id: string; label: string; origem: "padrao" | "loja"; key: AcessorioColorKey }[] {
  const desativadas = new Set(linhas.filter((l) => l.baseKey && !l.ativo).map((l) => l.baseKey as string))
  const padrao = paletaDoProduto
    .filter((c) => c.key === "outra" || !desativadas.has(c.key))
    .map((c) => ({ id: c.key as string, label: c.label, origem: "padrao" as const, key: c.key }))
  if (paletaDoProduto.length === 0) return []
  const permitidas = coresLojaDoProduto == null ? null : new Set(coresLojaDoProduto)
  const proprias = linhas
    .filter((l) => !l.baseKey && l.ativo && (!permitidas || permitidas.has(l.id)))
    .sort((a, b) => a.ordem - b.ordem || a.label.localeCompare(b.label, "pt-BR"))
    .map((l) => ({ id: l.id, label: l.label, origem: "loja" as const, key: "outra" as AcessorioColorKey }))
  // "Outra" (texto livre) sempre por último.
  const outra = padrao.filter((c) => c.key === "outra")
  return [...padrao.filter((c) => c.key !== "outra"), ...proprias, ...outra]
}
