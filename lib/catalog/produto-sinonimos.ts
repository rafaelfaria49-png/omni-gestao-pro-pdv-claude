/**
 * Catálogo inteligente — F1 · Dicionário léxico (sinônimos + categorias canônicas).
 *
 * FONTE ÚNICA de conhecimento de domínio (assistência + varejo de celular) reutilizada
 * por busca inteligente, compatibilidade e normalização para IA. É PURE DATA: sem schema,
 * sem IO, sem dependência de Prisma/Next — importável em qualquer runtime e testável puro.
 *
 * Não duplica a engine de busca do PDV: apenas fornece EXPANSÃO de termos. A pontuação
 * continua sendo de `scorePdvSearch` (lib/pdv-product-search).
 */

import { normalizePdvSearchText } from "@/lib/pdv-product-search"

/** Categorias canônicas do domínio (chave estável reutilizável por todos os módulos). */
export type CategoriaCanonica =
  | "pelicula"
  | "capinha"
  | "tela"
  | "bateria"
  | "conector"
  | "flex"
  | "cabo"
  | "carregador"
  | "fone"
  | "acessorio"

/**
 * Sinônimos/variantes por categoria canônica. A 1ª entrada é o rótulo preferido.
 * Todos comparados de forma normalizada (sem acento, minúsculo) — pode escrever com acento.
 */
export const CATEGORIA_SINONIMOS: Record<CategoriaCanonica, string[]> = {
  pelicula: ["película", "pelicula", "film", "glass", "vidro", "hidrogel", "3d", "9d", "fosca", "privacidade"],
  capinha: ["capinha", "capa", "case", "capa de silicone", "anti impacto", "capa transparente", "bumper"],
  tela: ["tela", "display", "frontal", "lcd", "oled", "amoled", "touch", "combo", "modulo"],
  bateria: ["bateria", "battery", "pilha", "amperagem"],
  conector: ["conector", "conector de carga", "dock", "entrada de carga", "porta de carga"],
  flex: ["flex", "cabo flex", "flex de carga", "flex botao", "flex botão", "flex power"],
  cabo: ["cabo", "cabo usb", "cabo de dados", "usb c", "usb-c", "tipo c", "lightning", "micro usb"],
  carregador: ["carregador", "fonte", "adaptador", "turbo", "carga rapida", "carga rápida"],
  fone: ["fone", "fone de ouvido", "headphone", "earphone", "headset", "ouvido"],
  acessorio: ["acessorio", "acessório", "suporte", "popsocket", "anel", "cabo organizador", "veicular"],
}

/** Índice reverso (termo normalizado → categoria) construído uma vez. */
const TERMO_PARA_CATEGORIA: Map<string, CategoriaCanonica> = (() => {
  const map = new Map<string, CategoriaCanonica>()
  for (const [cat, termos] of Object.entries(CATEGORIA_SINONIMOS) as [CategoriaCanonica, string[]][]) {
    for (const t of termos) {
      const n = normalizePdvSearchText(t)
      if (n && !map.has(n)) map.set(n, cat)
    }
  }
  return map
})()

/**
 * Resolve a categoria canônica de um termo livre (ex.: "capa" → "capinha").
 * Casa por igualdade normalizada e, em seguida, por "o termo contém um sinônimo de 1 palavra".
 * Retorna null quando nada bate (nunca inventa).
 */
export function resolveCategoriaCanonica(termo: string): CategoriaCanonica | null {
  const n = normalizePdvSearchText(termo)
  if (!n) return null
  const exact = TERMO_PARA_CATEGORIA.get(n)
  if (exact) return exact
  // Match por palavra contida (apenas sinônimos de 1 palavra, evita ruído).
  for (const word of n.split(/\s+/).filter(Boolean)) {
    const hit = TERMO_PARA_CATEGORIA.get(word)
    if (hit) return hit
  }
  return null
}

/**
 * Expande um termo para o conjunto de sinônimos normalizados da sua categoria.
 * Se o termo não mapear nenhuma categoria, devolve apenas ele mesmo (normalizado).
 * Sempre inclui o próprio termo. Sem duplicatas, sem vazios.
 */
export function expandTermoSinonimos(termo: string): string[] {
  const n = normalizePdvSearchText(termo)
  const out = new Set<string>()
  if (n) out.add(n)
  const cat = resolveCategoriaCanonica(termo)
  if (cat) {
    for (const t of CATEGORIA_SINONIMOS[cat]) {
      const tn = normalizePdvSearchText(t)
      if (tn) out.add(tn)
    }
  }
  return [...out]
}

/** Rótulo preferido (1ª entrada) de uma categoria canônica. */
export function rotuloCategoria(cat: CategoriaCanonica): string {
  return CATEGORIA_SINONIMOS[cat][0] ?? cat
}
