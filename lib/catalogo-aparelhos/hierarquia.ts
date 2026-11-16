/**
 * COMPAT-PROFISSIONAL-001 — hierarquia padronizada do catálogo de aparelhos:
 *
 *   Fabricante › Marca comercial › Linha › Modelo
 *   Xiaomi     › Redmi           › A     › Redmi A7 Pro
 *   Samsung    › Galaxy          › A     › Galaxy A56 5G
 *   Motorola   › Moto            › G     › Moto G56 5G
 *
 * PURO (sem banco, sem `fs`). O catálogo global (CSV) guarda `brand` + `commercialLine`
 * com convenções mistas ("Samsung" + "Galaxy A"; "Redmi" + "Redmi Note"); aqui isso é
 * projetado na hierarquia acima SEM alterar o CSV. Modelos manuais da loja gravam
 * fabricante/linha explicitamente; registros antigos (sem fabricante) são derivados da marca.
 */

import { normalizeDeviceQuery } from "./catalogo-aparelhos"

/** Marca comercial → fabricante. Marca ausente do mapa = ela mesma é o fabricante. */
const FABRICANTE_POR_MARCA: Readonly<Record<string, string>> = Object.freeze({
  REDMI: "Xiaomi",
  POCO: "Xiaomi",
  MI: "Xiaomi",
  XIAOMI: "Xiaomi",
  GALAXY: "Samsung",
  SAMSUNG: "Samsung",
  MOTO: "Motorola",
  MOTOROLA: "Motorola",
  IPHONE: "Apple",
  APPLE: "Apple",
  REALME: "Realme",
  INFINIX: "Infinix",
  TECNO: "Tecno",
  LG: "LG",
})

/** Sugestões de fabricante exibidas no cadastro (o operador pode digitar outro). */
export const FABRICANTES_SUGERIDOS = Object.freeze([
  "Apple",
  "Samsung",
  "Motorola",
  "Xiaomi",
  "Realme",
  "Infinix",
  "Tecno",
  "LG",
  "Asus",
  "Nokia",
  "Positivo",
  "Multilaser",
])

/** Sugestões de marca comercial por fabricante (além das já presentes no catálogo). */
export const MARCAS_SUGERIDAS_POR_FABRICANTE: Readonly<Record<string, readonly string[]>> = Object.freeze({
  Apple: ["iPhone"],
  Samsung: ["Galaxy"],
  Motorola: ["Moto", "Motorola"],
  Xiaomi: ["Redmi", "POCO", "Xiaomi"],
  Realme: ["Realme"],
  Infinix: ["Infinix"],
  Tecno: ["Tecno"],
  LG: ["LG"],
})

export interface HierarquiaAparelho {
  fabricante: string
  marca: string
  linha: string
}

function titleKey(v: string): string {
  return normalizeDeviceQuery(v)
}

/** Fabricante de uma marca comercial (ex.: "POCO" → "Xiaomi"). */
export function fabricanteDaMarca(marca: string): string {
  const m = (marca ?? "").trim()
  if (!m) return ""
  return FABRICANTE_POR_MARCA[titleKey(m)] ?? m
}

/**
 * Projeta um modelo do catálogo global na hierarquia.
 *  - "Samsung" + "Galaxy A"     → Samsung › Galaxy › A
 *  - "Redmi" + "Redmi Note"     → Xiaomi › Redmi › Note
 *  - "Apple" + "iPhone"         → Apple › iPhone › ""
 *  - "Motorola" + "Moto G"      → Motorola › Moto › G
 *  - "Infinix" + "Infinix Hot"  → Infinix › Infinix › Hot
 */
export function hierarquiaDoModeloGlobal(model: { brand: string; commercialLine: string }): HierarquiaAparelho {
  const brand = (model.brand ?? "").trim()
  const tokens = (model.commercialLine ?? "").trim().split(/\s+/).filter(Boolean)
  const fabricante = fabricanteDaMarca(brand)
  if (tokens.length === 0) return { fabricante, marca: brand, linha: "" }
  if (tokens.length === 1) {
    const unico = tokens[0]
    return { fabricante, marca: unico, linha: "" }
  }
  return { fabricante, marca: tokens.slice(0, -1).join(" "), linha: tokens[tokens.length - 1] }
}

/** Hierarquia de um modelo manual da loja (fabricante vazio = derivado da marca). */
export function hierarquiaDoModeloLoja(m: { brand: string; manufacturer?: string; line?: string }): HierarquiaAparelho {
  const marca = (m.brand ?? "").trim()
  const fabricante = (m.manufacturer ?? "").trim() || fabricanteDaMarca(marca)
  return { fabricante, marca, linha: (m.line ?? "").trim() }
}

/**
 * Nome padronizado: "Marca Modelo", sem repetir a marca quando o operador já a digitou.
 * Ex.: ("Redmi", "A7 Pro") → "Redmi A7 Pro"; ("Galaxy", "Galaxy A56 5G") → "Galaxy A56 5G".
 * Espaços colapsados; a grafia do operador é preservada (sem forçar maiúsculas).
 */
export function nomePadronizado(marca: string, modelo: string): string {
  const b = (marca ?? "").replace(/\s+/g, " ").trim()
  const n = (modelo ?? "").replace(/\s+/g, " ").trim()
  if (!b) return n
  if (!n) return b
  const bk = titleKey(b)
  const nk = titleKey(n)
  return nk === bk || nk.startsWith(bk + " ") ? n : `${b} ${n}`
}

/** Chave canônica de comparação entre catálogos: nome sem o fabricante, normalizado. */
export function chaveNomeSemFabricante(fabricante: string, nomeCompleto: string): string {
  const fk = titleKey(fabricante)
  const nk = titleKey(nomeCompleto)
  return fk && nk.startsWith(fk + " ") ? nk.slice(fk.length + 1) : nk
}

/** Sugestões de marcas e linhas a partir do catálogo global (para os seletores do cadastro). */
export function sugestoesHierarquia(
  models: readonly { brand: string; commercialLine: string }[],
): { fabricante: string; marcas: { marca: string; linhas: string[] }[] }[] {
  const porFab = new Map<string, Map<string, Set<string>>>()
  const add = (fab: string, marca: string, linha: string) => {
    if (!fab || !marca) return
    const marcas = porFab.get(fab) ?? new Map<string, Set<string>>()
    const linhas = marcas.get(marca) ?? new Set<string>()
    if (linha) linhas.add(linha)
    marcas.set(marca, linhas)
    porFab.set(fab, marcas)
  }
  for (const m of models) {
    const h = hierarquiaDoModeloGlobal(m)
    add(h.fabricante, h.marca, h.linha)
  }
  for (const [fab, marcas] of Object.entries(MARCAS_SUGERIDAS_POR_FABRICANTE)) {
    for (const marca of marcas) add(fab, marca, "")
  }
  return [...porFab.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
    .map(([fabricante, marcas]) => ({
      fabricante,
      marcas: [...marcas.entries()]
        .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
        .map(([marca, linhas]) => ({ marca, linhas: [...linhas].sort((a, b) => a.localeCompare(b, "pt-BR")) })),
    }))
}
