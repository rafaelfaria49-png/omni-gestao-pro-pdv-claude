/**
 * Catálogo inteligente — F1 UI · Sugestões do "Assistente IA" do Cadastro de Produto.
 *
 * Gera, de forma DETERMINÍSTICA (sem LLM/IO), o conjunto de sugestões editáveis exibidas
 * no painel: categoria, marca, modelo, sinônimos, palavras-chave, compatibilidade,
 * descrição curta/longa e tags. Tudo derivado de `normalizeProduto` (lib/catalog) — nenhuma
 * lógica nova de domínio é duplicada aqui.
 *
 * As sugestões são apenas ponto de partida; o operador edita e confirma. A persistência é
 * SEMPRE em `Produto.metadata` (contrato {@link ProdutoIAMetadata}) — nunca em colunas core.
 */

import {
  normalizeProduto,
  type ProdutoIAMetadata,
  type ProdutoNormalizado,
  type RawProdutoInput,
} from "@/lib/catalog/produto-catalogo"
import { rotuloCategoria } from "@/lib/catalog/produto-sinonimos"

export type ProdutoSugestoesIA = {
  categoria: string
  marca: string
  modelo: string
  sinonimos: string[]
  palavrasChave: string[]
  compatibilidade: string[]
  descricaoCurta: string
  descricaoLonga: string
  tags: string[]
}

const uniq = (xs: string[]): string[] => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const x of xs) {
    const t = x.trim()
    if (!t) continue
    const k = t.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(t)
  }
  return out
}

const listarHumano = (xs: string[]): string => {
  const a = xs.filter(Boolean)
  if (a.length === 0) return ""
  if (a.length === 1) return a[0]!
  return `${a.slice(0, -1).join(", ")} e ${a[a.length - 1]}`
}

/** Descrição curta/longa sugeridas a partir do produto normalizado (template, sem LLM). */
export function gerarDescricoesProduto(n: ProdutoNormalizado): { curta: string; longa: string } {
  const nome = n.nomePrincipal.trim()
  const catLabel = n.categoriaCanonica ? rotuloCategoria(n.categoriaCanonica) : n.categoria
  const compatMarca = n.compatibilidade.marca
  const modelos = n.compatibilidade.modelos
  const alvo = uniq([compatMarca ?? "", ...modelos]).slice(0, 4)

  // Curta
  let curta = nome
  if (alvo.length > 0) curta = `${nome} — compatível com ${listarHumano(alvo)}`
  else if (n.marca) curta = `${nome} (${n.marca})`
  curta = curta.slice(0, 140)

  // Longa
  const frases: string[] = []
  frases.push(catLabel ? `${nome}, da categoria ${catLabel}.` : `${nome}.`)
  if (alvo.length > 0) frases.push(`Compatível com ${listarHumano(alvo)}.`)
  else if (n.marca) frases.push(`Marca: ${n.marca}.`)
  const kw = n.palavrasChave.filter((k) => k && k !== n.marca).slice(0, 5)
  if (kw.length > 0) frases.push(`Indicado para: ${listarHumano(kw)}.`)
  const longa = frases.join(" ")

  return { curta, longa }
}

/** Tags sugeridas: categoria + marca/aparelho + modelos compatíveis (starter editável). */
function gerarTags(n: ProdutoNormalizado): string[] {
  const catLabel = n.categoriaCanonica ? rotuloCategoria(n.categoriaCanonica) : n.categoria
  return uniq([
    catLabel,
    n.compatibilidade.marca ?? "",
    n.marca,
    ...n.compatibilidade.modelos,
    n.subcategoria,
  ]).slice(0, 12)
}

/** Conjunto completo de sugestões editáveis do Assistente IA. */
export function gerarSugestoesProdutoIA(raw: RawProdutoInput): ProdutoSugestoesIA {
  const n = normalizeProduto(raw)
  const { curta, longa } = gerarDescricoesProduto(n)
  return {
    categoria: n.categoriaCanonica ? rotuloCategoria(n.categoriaCanonica) : n.categoria,
    marca: n.compatibilidade.marca ?? n.marca,
    modelo: n.modelo,
    sinonimos: n.sinonimos,
    palavrasChave: n.palavrasChave,
    compatibilidade: n.compatibilidade.modelos,
    descricaoCurta: curta,
    descricaoLonga: longa,
    tags: gerarTags(n),
  }
}

const arr = (xs: string[]): string[] => uniq(xs)

/**
 * Converte as sugestões (já editadas pelo operador) no bloco de `Produto.metadata`.
 * Só inclui campos com conteúdo (não polui o JSONB). NUNCA mapeia para colunas core:
 * `categoria`/`marca` viram `categoriaSugerida`/`marcaSugerida` dentro do metadata.
 */
export function sugestoesParaMetadata(s: ProdutoSugestoesIA): ProdutoIAMetadata {
  const out: ProdutoIAMetadata = {}
  if (s.sinonimos.length > 0) out.sinonimos = arr(s.sinonimos)
  if (s.palavrasChave.length > 0) out.palavrasChave = arr(s.palavrasChave)
  if (s.compatibilidade.length > 0) out.compatibilidade = arr(s.compatibilidade)
  if (s.tags.length > 0) out.tags = arr(s.tags)
  if (s.modelo.trim()) out.modelo = s.modelo.trim()
  if (s.descricaoCurta.trim()) out.descricaoCurta = s.descricaoCurta.trim()
  if (s.descricaoLonga.trim()) out.descricaoLonga = s.descricaoLonga.trim()
  if (s.categoria.trim()) out.categoriaSugerida = s.categoria.trim()
  if (s.marca.trim()) out.marcaSugerida = s.marca.trim()
  return out
}

/** Overlay: valores já salvos no metadata sobrescrevem as sugestões frescas (p/ exibição). */
export function mesclarSugestoesComMetadata(
  base: ProdutoSugestoesIA,
  meta: ProdutoIAMetadata | null | undefined,
): ProdutoSugestoesIA {
  if (!meta) return base
  const strArr = (v: unknown, fallback: string[]) =>
    Array.isArray(v) ? uniq(v.map((x) => String(x ?? ""))) : fallback
  const s = (v: unknown, fallback: string) => (typeof v === "string" && v.trim() ? v : fallback)
  return {
    categoria: s(meta.categoriaSugerida, base.categoria),
    marca: s(meta.marcaSugerida, base.marca),
    modelo: s(meta.modelo, base.modelo),
    sinonimos: strArr(meta.sinonimos, base.sinonimos),
    palavrasChave: strArr(meta.palavrasChave, base.palavrasChave),
    compatibilidade: strArr(meta.compatibilidade, base.compatibilidade),
    descricaoCurta: s(meta.descricaoCurta, base.descricaoCurta),
    descricaoLonga: s(meta.descricaoLonga, base.descricaoLonga),
    tags: strArr(meta.tags, base.tags),
  }
}
