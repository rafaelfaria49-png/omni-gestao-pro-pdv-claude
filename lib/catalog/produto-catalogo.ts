/**
 * Catálogo inteligente — F1 · Núcleo de normalização (fonte única de verdade).
 *
 * Transforma um produto cru (de QUALQUER fonte: ProdutoDTO, InventoryItem, PdvCatalogProduct
 * ou linha Prisma) numa forma rica e estável (`ProdutoNormalizado`) consumível por PDV,
 * WhatsApp IA, Marketplace, Marketing IA, Importador e Operações — sem alterar o schema.
 *
 * Campos "IA" (nomes alternativos, sinônimos, palavras-chave, compatibilidade, descrições,
 * tags) vivem em `Produto.metadata` (JSONB já existente; ncm/cest já moram lá). Quando o
 * cadastro ainda não os tiver, são DERIVADOS das colunas reais — nunca inventados além do
 * que o nome/categoria permitem. Este módulo define o CONTRATO dessas chaves para que F2+
 * (escrita no cadastro) e os leitores compartilhem o mesmo formato.
 *
 * PURE: sem IO, sem Prisma. Reutiliza a engine de texto do PDV e o dicionário de domínio.
 */

import { normalizePdvSearchText } from "@/lib/pdv-product-search"
import { slugFromCategoriaProdutoLabel } from "@/lib/categoria-produto-utils"
import { resolveCategoriaCanonica, type CategoriaCanonica } from "@/lib/catalog/produto-sinonimos"
import { buildCompatibilidade, type CompatibilidadeInfo } from "@/lib/catalog/produto-compatibilidade"

/**
 * CONTRATO das chaves "inteligentes" guardadas em `Produto.metadata` (JSONB).
 * Todas opcionais e aditivas — a ausência é tratada por derivação. NÃO é um novo schema:
 * é a tipagem do que já pode ser persistido no campo `metadata` existente.
 */
export type ProdutoIAMetadata = {
  nomesAlternativos?: string[]
  sinonimos?: string[]
  modelo?: string
  subcategoria?: string
  palavrasChave?: string[]
  /** Lista explícita de modelos de aparelho compatíveis (peças/acessórios). */
  compatibilidade?: string[]
  descricaoCurta?: string
  descricaoLonga?: string
  tags?: string[]
  /** Fiscais — já em uso pelo importador (docs). Mantidos aqui para o contrato completo. */
  ncm?: string
  cest?: string
  // Espaço reservado a chaves futuras (foto/voz/ocr) — ver produto-fontes.ts.
  [key: string]: unknown
}

/** Forma mínima e canônica aceita pelo normalizador (chaves PT, estilo ProdutoDTO). */
export type RawProdutoInput = {
  id: string
  nome: string
  sku?: string | null
  barcode?: string | null
  categoria?: string | null
  marca?: string | null
  fornecedor?: string | null
  preco?: number | null
  estoque?: number | null
  metadata?: unknown
}

export type ProdutoNormalizado = {
  id: string
  nomePrincipal: string
  nomesAlternativos: string[]
  sinonimos: string[]
  marca: string
  modelo: string
  categoria: string
  /** Slug estável da categoria (mesmo de CategoriaProduto.slug). */
  categoriaSlug: string
  /** Categoria canônica do domínio (capinha/pelicula/...), ou null. */
  categoriaCanonica: CategoriaCanonica | null
  subcategoria: string
  palavrasChave: string[]
  /** Blob normalizado (sem acento/minúsculo) com tudo que torna o produto pesquisável. */
  textoPesquisavel: string
  compatibilidade: CompatibilidadeInfo
  descricaoCurta: string
  descricaoLonga: string
  tags: string[]
  sku: string
  barcode: string
  preco: number
  estoque: number
}

/** Leitura-guard do metadata (mesmo contrato de `cadastros.produtoMetadataRecord`). */
export function readProdutoMetadata(v: unknown): ProdutoIAMetadata {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {}
  return v as ProdutoIAMetadata
}

const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x ?? "").trim()).filter(Boolean) : []

const str = (v: unknown): string => (v == null ? "" : String(v).trim())

const cleanCategoria = (c: string | null | undefined): string => {
  const s = str(c)
  return s === "—" ? "" : s
}

const cleanSku = (s: string | null | undefined): string => {
  const v = str(s)
  return v === "—" ? "" : v
}

function uniqNonEmpty(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of values) {
    const t = v.trim()
    if (!t) continue
    const k = t.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(t)
  }
  return out
}

/**
 * Normaliza um produto cru na forma rica reutilizável. Determinístico e idempotente.
 * Prefere valores explícitos do `metadata`; deriva o restante das colunas reais.
 */
export function normalizeProduto(raw: RawProdutoInput): ProdutoNormalizado {
  const meta = readProdutoMetadata(raw.metadata)

  const nomePrincipal = str(raw.nome)
  const marca = str(raw.marca) === "—" ? "" : str(raw.marca)
  const categoria = cleanCategoria(raw.categoria)
  const sku = cleanSku(raw.sku)
  const barcode = str(raw.barcode)
  const fornecedor = str(raw.fornecedor) === "—" ? "" : str(raw.fornecedor)

  const categoriaCanonica = resolveCategoriaCanonica(categoria) ?? resolveCategoriaCanonica(nomePrincipal)

  const nomesAlternativos = uniqNonEmpty(strArr(meta.nomesAlternativos))
  const modelo = str(meta.modelo)
  const subcategoria = str(meta.subcategoria)
  const descricaoCurta = str(meta.descricaoCurta)
  const descricaoLonga = str(meta.descricaoLonga)
  const tags = uniqNonEmpty(strArr(meta.tags))

  const compatibilidade = buildCompatibilidade({
    nome: nomePrincipal,
    categoria,
    metadataCompat: meta.compatibilidade,
  })

  // Sinônimos: explícitos do metadata + rótulo da categoria canônica.
  const sinonimos = uniqNonEmpty([
    ...strArr(meta.sinonimos),
    ...(categoriaCanonica ? [categoriaCanonica] : []),
  ])

  // Palavras-chave: explícitas + derivadas (marca, modelo, compat, fornecedor, tags).
  const palavrasChave = uniqNonEmpty([
    ...strArr(meta.palavrasChave),
    marca,
    modelo,
    subcategoria,
    ...compatibilidade.modelos,
    ...(compatibilidade.marca ? [compatibilidade.marca] : []),
    ...tags,
  ])

  // Texto pesquisável: tudo que ajuda a achar o produto, normalizado e sem duplicatas.
  const searchTokens = uniqNonEmpty([
    nomePrincipal,
    ...nomesAlternativos,
    sku,
    barcode,
    categoria,
    marca,
    modelo,
    subcategoria,
    fornecedor,
    ...sinonimos,
    ...palavrasChave,
    ...compatibilidade.modelos,
  ])
    .map((s) => normalizePdvSearchText(s))
    .filter(Boolean)
  const textoPesquisavel = [...new Set(searchTokens.join(" ").split(/\s+/).filter(Boolean))].join(" ")

  return {
    id: str(raw.id),
    nomePrincipal,
    nomesAlternativos,
    sinonimos,
    marca,
    modelo,
    categoria,
    categoriaSlug: categoria ? slugFromCategoriaProdutoLabel(categoria) : "",
    categoriaCanonica,
    subcategoria,
    palavrasChave,
    textoPesquisavel,
    compatibilidade,
    descricaoCurta,
    descricaoLonga,
    tags,
    sku,
    barcode,
    preco: Number.isFinite(Number(raw.preco)) ? Number(raw.preco) : 0,
    estoque: Number.isFinite(Number(raw.estoque)) ? Number(raw.estoque) : 0,
  }
}

// ─── Adaptadores de fonte → RawProdutoInput (evita duplicar mapeamento nos consumidores) ──

/** ProdutoDTO (app/actions/cadastros) → entrada canônica. */
export function fromProdutoDTO(p: {
  id: string
  nome: string
  sku?: string
  barras?: string
  categoria?: string
  marca?: string
  fornecedor?: string
  preco?: number
  estoque?: number
  metadata?: unknown
}): RawProdutoInput {
  return {
    id: p.id,
    nome: p.nome,
    sku: p.sku,
    barcode: p.barras,
    categoria: p.categoria,
    marca: p.marca,
    fornecedor: p.fornecedor,
    preco: p.preco,
    estoque: p.estoque,
    metadata: p.metadata,
  }
}

/** InventoryItem (lib/operations-store) → entrada canônica (sem marca/fornecedor no item). */
export function fromInventoryItem(p: {
  id: string
  name: string
  sku?: string
  barcode?: string
  codigoBarras?: string
  category?: string
  price?: number
  stock?: number
}): RawProdutoInput {
  return {
    id: p.id,
    nome: p.name,
    sku: p.sku,
    barcode: p.barcode ?? p.codigoBarras,
    categoria: p.category,
    preco: p.price,
    estoque: p.stock,
  }
}
