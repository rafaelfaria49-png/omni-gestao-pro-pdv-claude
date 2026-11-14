/**
 * COMPAT-PROFISSIONAL-001 — regras PURAS da organização física de capinhas.
 *
 * Painel → Fileira → (posição opcional). Endereço físico, NUNCA quantidade: o estoque
 * continua só em `Produto.stock`. Sem banco (testável); persistência em `compat-store.ts`.
 */

import { catalogKey, cleanCatalogText } from "@/lib/catalogo-aparelhos/loja-catalogo"
import type { AcessorioModoCaptura } from "@/lib/acessorios/types"
import { ACESSORIO_MODOS_CAPTURA } from "@/lib/acessorios/types"

export const COMPAT_LIMITS = Object.freeze({
  nome: 40,
  descricao: 80,
  posicao: 20,
  notes: 200,
  paineisPorLoja: 100,
  fileirasPorPainel: 50,
  localizacoesPorAlvo: 10,
})

export type LocalInputErrors = Partial<Record<"nome" | "descricao", string>>

export interface LocalInput {
  nome: string
  descricao: string
}

/** Valida nome/descrição de painel ou fileira (ex.: "Painel A", "iPhone / Samsung"). */
export function sanitizeLocalInput(
  raw: unknown,
  partial = false,
): { ok: true; value: Partial<LocalInput> } | { ok: false; errors: LocalInputErrors } {
  const input = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const errors: LocalInputErrors = {}
  const value: Partial<LocalInput> = {}
  if (!partial || "nome" in input) {
    const nome = cleanCatalogText(input.nome, COMPAT_LIMITS.nome)
    if (!nome) errors.nome = "Informe o nome."
    else value.nome = nome
  }
  if (!partial || "descricao" in input) {
    value.descricao = cleanCatalogText(input.descricao, COMPAT_LIMITS.descricao)
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value }
}

/** Chave de duplicidade de nome (sem acento, maiúscula, espaços colapsados). */
export function localNomeKey(nome: string): string {
  return catalogKey(nome)
}

/** Posição individual ("3", "A-2"). Vazia quando a loja não usa posições. */
export function sanitizePosicao(raw: unknown, habilitadas: boolean): string {
  if (!habilitadas) return ""
  return cleanCatalogText(raw, COMPAT_LIMITS.posicao)
}

/** Nova ordem (0..n-1) movendo `id` uma casa para cima/baixo. Ids desconhecidos = sem mudança. */
export function reordenar<T extends { id: string; ordem: number }>(
  itens: readonly T[],
  id: string,
  direcao: "cima" | "baixo",
): { id: string; ordem: number }[] {
  const ordenados = [...itens].sort((a, b) => a.ordem - b.ordem || a.id.localeCompare(b.id))
  const i = ordenados.findIndex((x) => x.id === id)
  const j = direcao === "cima" ? i - 1 : i + 1
  if (i === -1 || j < 0 || j >= ordenados.length) return ordenados.map((x, k) => ({ id: x.id, ordem: k }))
  ;[ordenados[i], ordenados[j]] = [ordenados[j], ordenados[i]]
  return ordenados.map((x, k) => ({ id: x.id, ordem: k }))
}

/** Texto do endereço físico: "Painel A · Fileira 2 · Pos. 3". */
export function rotuloLocalizacao(l: {
  painelNome: string
  fileiraNome?: string | null
  posicao?: string | null
}): string {
  return [l.painelNome, l.fileiraNome || "", l.posicao ? `Pos. ${l.posicao}` : ""].filter(Boolean).join(" · ")
}

// ---------------------------------------------------------------------------
// Preferências da loja
// ---------------------------------------------------------------------------

export interface CompatPreferencias {
  posicoesHabilitadas: boolean
  modoModeloPadrao: AcessorioModoCaptura
  modoCorPadrao: AcessorioModoCaptura
  version: number
}

/** Padrões quando a loja nunca configurou: posições DESLIGADAS, captura opcional. */
export const COMPAT_PREFERENCIAS_PADRAO: Readonly<CompatPreferencias> = Object.freeze({
  posicoesHabilitadas: false,
  modoModeloPadrao: "opcional",
  modoCorPadrao: "opcional",
  version: 0,
})

function modo(v: unknown, fallback: AcessorioModoCaptura): AcessorioModoCaptura {
  return typeof v === "string" && (ACESSORIO_MODOS_CAPTURA as readonly string[]).includes(v)
    ? (v as AcessorioModoCaptura)
    : fallback
}

/** Mescla um PATCH parcial nas preferências atuais (campos inválidos são ignorados). */
export function mergePreferencias(atual: CompatPreferencias, raw: unknown): CompatPreferencias {
  const input = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  return {
    posicoesHabilitadas:
      typeof input.posicoesHabilitadas === "boolean" ? input.posicoesHabilitadas : atual.posicoesHabilitadas,
    modoModeloPadrao: modo(input.modoModeloPadrao, atual.modoModeloPadrao),
    modoCorPadrao: modo(input.modoCorPadrao, atual.modoCorPadrao),
    version: atual.version,
  }
}
