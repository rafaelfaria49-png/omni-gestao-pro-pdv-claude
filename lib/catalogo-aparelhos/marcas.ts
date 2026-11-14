/**
 * COMPAT-CATALOGO-BRASIL-2023-2026-002 — marcas do catálogo e visibilidade POR LOJA.
 *
 * Prioritárias (ativas por padrão): Apple, Samsung, Motorola, Xiaomi, Redmi, POCO, realme, Infinix.
 * Demais (OPPO, HONOR, TECNO, vivo, Nokia/HMD, ASUS, Google, Nothing/CMF, OnePlus, Huawei, Sony,
 * TCL, ZTE/nubia, LG…) ficam DISPONÍVEIS mas ocultas por padrão; a loja ativa/desativa quando quiser.
 *
 * Ocultar uma marca só a tira das BUSCAS operacionais. Modelos continuam no catálogo e resolvíveis
 * por `modelKey`: produtos vinculados, vendas antigas e relatórios não mudam. Modelos cadastrados
 * pela própria loja nunca são ocultados por esta regra. PURO (sem banco).
 */

import { normalizeDeviceQuery } from "./catalogo-aparelhos"
import type { CatalogoIndex } from "./types"

export const MARCAS_PRIORITARIAS = Object.freeze([
  "Apple",
  "Samsung",
  "Motorola",
  "Xiaomi",
  "Redmi",
  "POCO",
  "Realme",
  "Infinix",
])

const PRIORITARIAS_KEYS = new Set(MARCAS_PRIORITARIAS.map((m) => normalizeDeviceQuery(m)))

export type NivelMarca = "prioritaria" | "secundaria"

export interface MarcaCatalogo {
  /** Chave normalizada (sem acento, maiúscula): identidade estável da marca. */
  key: string
  /** Nome exibido (grafia do catálogo). */
  nome: string
  nivel: NivelMarca
  /** Visível por padrão quando a loja nunca configurou. */
  padraoVisivel: boolean
  /** Modelos operacionais da marca no catálogo global. */
  modelos: number
}

/** Configuração da loja: chave da marca → visível (true) / oculta (false). Ausente = padrão. */
export type MarcasConfig = Readonly<Record<string, boolean>>

export function marcaKey(nome: string): string {
  return normalizeDeviceQuery(nome)
}

export function nivelDaMarca(nome: string, tierDoCsv?: string): NivelMarca {
  const tier = (tierDoCsv ?? "").trim().toLowerCase()
  if (tier === "prioritaria" || tier === "secundaria") return tier
  return PRIORITARIAS_KEYS.has(marcaKey(nome)) ? "prioritaria" : "secundaria"
}

/** Marcas presentes no catálogo global, com nível e contagem de modelos operacionais. */
export function listarMarcasDoCatalogo(
  index: CatalogoIndex,
  operacional: (m: CatalogoIndex["models"][number]) => boolean,
): MarcaCatalogo[] {
  const porKey = new Map<string, MarcaCatalogo>()
  for (const m of index.models) {
    const key = marcaKey(m.brand)
    if (!key) continue
    const atual = porKey.get(key)
    const conta = operacional(m) ? 1 : 0
    if (atual) {
      atual.modelos += conta
      continue
    }
    const nivel = nivelDaMarca(m.brand, m.visibilityTier)
    porKey.set(key, { key, nome: m.brand, nivel, padraoVisivel: nivel === "prioritaria", modelos: conta })
  }
  return [...porKey.values()].sort(
    (a, b) =>
      (a.nivel === b.nivel ? 0 : a.nivel === "prioritaria" ? -1 : 1) || a.nome.localeCompare(b.nome, "pt-BR"),
  )
}

/** Saneia a configuração vinda do banco/requisição (só booleanos, chaves normalizadas). */
export function sanitizeMarcasConfig(raw: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const key = marcaKey(k)
    if (!key || key.length > 40 || typeof v !== "boolean") continue
    out[key] = v
    if (Object.keys(out).length >= 200) break
  }
  return out
}

/** A marca aparece nas buscas desta loja? */
export function marcaVisivel(marca: Pick<MarcaCatalogo, "key" | "padraoVisivel">, config: MarcasConfig): boolean {
  const v = config[marca.key]
  return typeof v === "boolean" ? v : marca.padraoVisivel
}

/** Conjunto de marcas OCULTAS da loja (para `SearchDeviceOptions.marcasOcultas`). */
export function marcasOcultasDaLoja(marcas: readonly MarcaCatalogo[], config: MarcasConfig): Set<string> {
  return new Set(marcas.filter((m) => !marcaVisivel(m, config)).map((m) => m.key))
}
