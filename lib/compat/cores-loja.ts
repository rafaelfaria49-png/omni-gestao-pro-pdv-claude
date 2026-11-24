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

export const COR_VISUAL_ESPECIAIS = ["transparente", "fume", "colorida"] as const
export type CorVisualEspecial = (typeof COR_VISUAL_ESPECIAIS)[number]

/** Representação visual canônica das 18 cores padrão (domínio visual para preview/swatch). */
export const COR_PADRAO_VISUAL: Readonly<Record<AcessorioColorKey, string>> = Object.freeze({
  transparente: "transparente",
  preto: "#171717",
  branco: "#FAFAFA",
  azul: "#2563EB",
  azul_claro: "#60A5FA",
  azul_escuro: "#1E3A8A",
  verde: "#16A34A",
  verde_claro: "#86EFAC",
  verde_escuro: "#14532D",
  rosa: "#EC4899",
  lilas: "#A855F7",
  vermelho: "#DC2626",
  amarelo: "#EAB308",
  fume: "fume",
  dourado: "#CA8A04",
  prata: "#94A3B8",
  colorida: "colorida",
  outra: "outra",
})

export const COR_VISUAL_DEFAULT_LOJA = "#64748B"

/** Paleta de atalhos rápidos no seletor visual de cores. */
export const COR_VISUAL_PRESETS: ReadonlyArray<{ label: string; visual: string }> = Object.freeze([
  { label: "Preto", visual: "#171717" },
  { label: "Branco", visual: "#FAFAFA" },
  { label: "Azul-marinho", visual: "#1E3A8A" },
  { label: "Azul", visual: "#2563EB" },
  { label: "Azul bebê", visual: "#93C5FD" },
  { label: "Verde", visual: "#16A34A" },
  { label: "Rosa", visual: "#EC4899" },
  { label: "Lilás", visual: "#A855F7" },
  { label: "Roxo", visual: "#7C3AED" },
  { label: "Vermelho", visual: "#DC2626" },
  { label: "Vinho", visual: "#881337" },
  { label: "Amarelo", visual: "#EAB308" },
  { label: "Laranja", visual: "#EA580C" },
  { label: "Dourado", visual: "#CA8A04" },
  { label: "Prata", visual: "#94A3B8" },
  { label: "Bege", visual: "#D6C7B2" },
  { label: "Transparente", visual: "transparente" },
  { label: "Fumê", visual: "fume" },
  { label: "Colorida", visual: "colorida" },
])

/** Chave reservada no JSONB de `compat_preferencias_loja.marcasConfig` (não-booleana; ignorada por `sanitizeMarcasConfig`). */
export const CORES_VISUAL_CONFIG_KEY = "__coresVisual"

const HEX_6_RE = /^#[0-9a-fA-F]{6}$/

/** Valida e normaliza a representação visual: `#RRGGBB` ou estilo especial (`transparente`/`fume`/`colorida`). */
export function sanitizeCorVisual(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const v = raw.trim()
  if (HEX_6_RE.test(v)) return v.toUpperCase()
  const lower = v.toLowerCase()
  if ((COR_VISUAL_ESPECIAIS as readonly string[]).includes(lower)) return lower
  return null
}

/** Sugere uma representação visual coerente a partir do nome digitado (pode ser editada livremente). */
export function sugerirVisualParaCor(label: string): string {
  const k = corEquivalenciaKey(label)
  if (!k) return COR_VISUAL_DEFAULT_LOJA
  if (k.includes("TRANSPARENTE") || k.includes("CRISTAL")) return "transparente"
  if (k.includes("FUME")) return "fume"
  if (k.includes("COLORID") || k.includes("ESTAMPAD") || k.includes("MULTICOR")) return "colorida"
  if (k.includes("MARINHO")) return "#1E3A8A"
  if (k.includes("BEBE") && k.includes("AZUL")) return "#93C5FD"
  if (k.includes("AZUL") && k.includes("ESCURO")) return "#1E3A8A"
  if (k.includes("AZUL") && k.includes("CLARO")) return "#60A5FA"
  if (k.includes("AZUL")) return "#2563EB"
  if (k.includes("PRETO") || k.includes("GRAFITE") || k.includes("ONIX")) return "#171717"
  if (k.includes("BRANCO") || k.includes("OFF WHITE")) return "#FAFAFA"
  if (k.includes("VERDE") && k.includes("ESCURO")) return "#14532D"
  if (k.includes("VERDE") && k.includes("CLARO")) return "#86EFAC"
  if (k.includes("VERDE") || k.includes("MENTA") || k.includes("OLIVA")) return "#16A34A"
  if (k.includes("ROSA") || k.includes("PINK") || k.includes("ROSE")) return "#EC4899"
  if (k.includes("LILAS") || k.includes("LAVANDA")) return "#A855F7"
  if (k.includes("ROXO") || k.includes("VIOLETA")) return "#7C3AED"
  if (k.includes("VINHO") || k.includes("BORDO") || k.includes("MARSALA")) return "#881337"
  if (k.includes("VERMELHO") || k.includes("CORAL")) return "#DC2626"
  if (k.includes("LARANJA") || k.includes("TERRACOTA")) return "#EA580C"
  if (k.includes("AMARELO")) return "#EAB308"
  if (k.includes("DOURADO") || k.includes("OURO")) return "#CA8A04"
  if (k.includes("PRATA") || k.includes("CINZA") || k.includes("TITANIO")) return "#94A3B8"
  if (k.includes("BEGE") || k.includes("NUDE") || k.includes("AREIA")) return "#D6C7B2"
  if (k.includes("MARROM") || k.includes("CAFE") || k.includes("CARAMELO")) return "#78350F"
  return COR_VISUAL_DEFAULT_LOJA
}

/** Extrai o mapa `{ [corId]: visual }` armazenado em `compat_preferencias_loja.marcasConfig`. */
export function extractCoresVisualFromConfig(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out
  const nested = (raw as Record<string, unknown>)[CORES_VISUAL_CONFIG_KEY]
  if (!nested || typeof nested !== "object" || Array.isArray(nested)) return out
  for (const [k, v] of Object.entries(nested as Record<string, unknown>)) {
    const id = k.trim()
    const visual = sanitizeCorVisual(v)
    if (!id || id.length > 64 || !visual) continue
    out[id] = visual
    if (Object.keys(out).length >= COR_LOJA_LIMITS.coresPorLoja + ACESSORIO_CORES_PADRAO.length) break
  }
  return out
}

/** Mescla atualizações de visual preservando todas as chaves de marca (`Record<string, boolean>`). */
export function mergeCoresVisualIntoConfig(
  raw: unknown,
  patch: Record<string, string | null>,
): Record<string, unknown> {
  const base: Record<string, unknown> =
    raw && typeof raw === "object" && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {}
  const atual = extractCoresVisualFromConfig(base)
  for (const [k, v] of Object.entries(patch)) {
    const id = k.trim()
    if (!id || id.length > 64) continue
    if (v === null) delete atual[id]
    else {
      const ok = sanitizeCorVisual(v)
      if (ok) atual[id] = ok
    }
  }
  if (Object.keys(atual).length > 0) base[CORES_VISUAL_CONFIG_KEY] = atual
  else delete base[CORES_VISUAL_CONFIG_KEY]
  return base
}

/** Linha persistida (já desserializada). `baseKey` = cor da paleta padrão; null = cor própria. */
export interface CorLoja {
  id: string
  baseKey: AcessorioColorKey | null
  label: string
  ativo: boolean
  ordem: number
  version: number
  /** Representação visual (`#RRGGBB` ou estilo especial), quando configurada pela loja. */
  visual?: string
}

/** Cor exibida no Compat / PDV / Cadastros. */
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
  /** Representação visual efetiva (`#RRGGBB`, `"transparente"`, `"fume"`, `"colorida"`, `"outra"`). */
  visual: string
}

/** Chave de duplicidade gravada na coluna `labelKey`: "Azul Bebê", "azul  bebe" e "AZUL BEBÊ" colidem. */
export function corLabelKey(label: string): string {
  return catalogKey(label)
}

/**
 * Chave de equivalência forte para duplicidade/busca: além de caixa, acento e espaços,
 * trata hífen/barra como espaço ("Azul-marinho" ≡ "azul marinho" ≡ "AZUL  MARINHO").
 */
export function corEquivalenciaKey(label: string): string {
  return corLabelKey(label).replace(/[-_/]+/g, " ").replace(/\s+/g, " ").trim()
}

export function sanitizeCorLabel(raw: unknown): { ok: true; label: string } | { ok: false; error: string } {
  const label = cleanCatalogText(raw, COR_LOJA_LIMITS.label)
  if (!label || corEquivalenciaKey(label).length < 2) return { ok: false, error: "Informe o nome da cor." }
  return { ok: true, label }
}

const PALETA_POR_EQUIV_KEY = new Map(ACESSORIO_CORES_PADRAO.map((c) => [corEquivalenciaKey(c.label), c.key]))

/** Cor padrão com o mesmo nome (ex.: "preto" → "preto"; "azul-claro" → "azul_claro"). Impede duplicar a paleta. */
export function corPadraoComMesmoNome(label: string): AcessorioColorKey | null {
  return PALETA_POR_EQUIV_KEY.get(corEquivalenciaKey(label)) ?? null
}

/** Pesquisa local tolerante a caixa, acentos, espaços extras e hífen ("azul mar" acha "Azul-marinho"). */
export function filtrarCoresPorBusca<T extends { label: string }>(cores: readonly T[], query: string): T[] {
  const termos = corEquivalenciaKey(query).split(" ").filter(Boolean)
  if (termos.length === 0) return [...cores]
  return cores.filter((c) => {
    const k = corEquivalenciaKey(c.label)
    return termos.every((t) => k.includes(t))
  })
}

/**
 * Lista efetiva da loja: 18 cores da paleta (com o estado ativo/inativo e visual da loja) + cores próprias.
 * "Outra" (texto livre) fica sempre por último na paleta e não é desativável pela loja.
 */
export function coresEfetivas(linhas: readonly CorLoja[], visuais: Readonly<Record<string, string>> = {}): CorEfetiva[] {
  const porBase = new Map(linhas.filter((l) => l.baseKey).map((l) => [l.baseKey as string, l]))
  const padrao: CorEfetiva[] = ACESSORIO_CORES_PADRAO.map((c) => {
    const row = porBase.get(c.key)
    const visualCustom = c.key === "outra" ? null : sanitizeCorVisual(visuais[c.key] ?? row?.visual)
    return {
      id: c.key,
      label: c.label,
      origem: "padrao",
      ativo: c.key === "outra" ? true : (row?.ativo ?? true),
      baseKey: c.key,
      version: row?.version ?? 0,
      rowId: row?.id ?? null,
      visual: visualCustom ?? COR_PADRAO_VISUAL[c.key],
    }
  })
  const proprias: CorEfetiva[] = linhas
    .filter((l) => !l.baseKey)
    .sort((a, b) => a.ordem - b.ordem || a.label.localeCompare(b.label, "pt-BR"))
    .map((l) => ({
      id: l.id,
      label: l.label,
      origem: "loja",
      ativo: l.ativo,
      baseKey: null,
      version: l.version,
      rowId: l.id,
      visual: sanitizeCorVisual(visuais[l.id] ?? l.visual) ?? sugerirVisualParaCor(l.label),
    }))
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
