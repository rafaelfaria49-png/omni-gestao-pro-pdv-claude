/**
 * Fila "Produtos a cadastrar" — itens avulsos (Venda Avulsa via INSERT) vendidos no balcão
 * que ainda não existem no catálogo e precisam de cadastro definitivo depois.
 *
 * Por que client/localStorage e NÃO `Venda.payload`:
 *  - Persistir o código bipado dentro da venda exigiria alterar `finalizeSaleTransaction`
 *    (reconstrói cada `SaleLineRecord` campo a campo) — função PROTEGIDA (motor da venda).
 *  - Criar tabela nova exigiria migration/schema — fora de escopo sem autorização.
 *  Logo, a captura acontece no PDV **após** a venda confirmada (sem tocar o motor) e a fila vive
 *  em `localStorage` por loja. É só uma lista de REVISÃO: não altera estoque, venda, caixa nem cria
 *  produto. Limitação consciente: é por-dispositivo (não sincroniza entre terminais) — documentado.
 *
 * Este módulo separa LÓGICA PURA (testável) da camada fina de `localStorage`.
 */

export type ProdutoACadastrarStatus = "pendente" | "cadastrado" | "ignorado"

export interface ProdutoACadastrarRecord {
  /** Id estável da linha na fila (idempotente por venda+linha). */
  id: string
  storeId: string
  vendaId: string
  /** Descrição digitada no Item Avulso (vira nome sugerido do produto). */
  nome: string
  /** Código de barras / SKU informado no balcão. `null` quando não informado. */
  codigo: string | null
  precoVenda: number
  /** Custo unitário informado. `null` = desconhecido. */
  custo: number | null
  quantidade: number
  operador: string | null
  /** ISO da venda/registro. */
  criadoEm: string
  status: ProdutoACadastrarStatus
}

/** Item avulso vendido, vindo do carrinho do PDV no momento da finalização. */
export interface AvulsoVendidoInput {
  /** `lineId` do carrinho — garante idempotência ao reprocessar a mesma venda. */
  lineId?: string | null
  nome: string
  codigo?: string | null
  precoVenda: number
  custo?: number | null
  quantidade: number
}

const STORAGE_PREFIX = "assistec-produtos-a-cadastrar-v1-"

// ─── Helpers puros ─────────────────────────────────────────────────────────────

/** Normaliza o código (trim + colapsa espaços). Vazio → `null`. */
export function normalizarCodigoCadastro(codigo: string | null | undefined): string | null {
  const c = String(codigo ?? "").trim().replace(/\s+/g, " ")
  return c.length > 0 ? c : null
}

function arredonda2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100
}

function sanitizaQuantidade(n: number): number {
  const v = Math.trunc(Number(n))
  return Number.isFinite(v) && v >= 1 ? v : 1
}

function sanitizaCusto(n: number | null | undefined): number | null {
  if (n === null || n === undefined) return null
  const v = Number(n)
  return Number.isFinite(v) && v >= 0 ? arredonda2(v) : null
}

/**
 * Constrói os registros da fila a partir dos itens avulsos de UMA venda. PURO.
 * Id estável = `${vendaId}:${lineId}` (ou índice quando sem lineId) → enfileirar é idempotente.
 */
export function construirProdutosACadastrar(params: {
  storeId: string
  vendaId: string
  operador?: string | null
  itens: ReadonlyArray<AvulsoVendidoInput>
  criadoEm?: string
}): ProdutoACadastrarRecord[] {
  const storeId = (params.storeId ?? "").trim()
  const vendaId = (params.vendaId ?? "").trim()
  if (!storeId || !vendaId) return []
  const operador = (params.operador ?? "").trim() || null
  const criadoEm = params.criadoEm ?? new Date().toISOString()

  return params.itens
    .filter((i) => (i?.nome ?? "").trim().length > 0)
    .map((i, idx) => {
      const linha = (i.lineId ?? "").trim() || String(idx)
      return {
        id: `${vendaId}:${linha}`,
        storeId,
        vendaId,
        nome: i.nome.trim(),
        codigo: normalizarCodigoCadastro(i.codigo),
        precoVenda: arredonda2(i.precoVenda),
        custo: sanitizaCusto(i.custo),
        quantidade: sanitizaQuantidade(i.quantidade),
        operador,
        criadoEm,
        status: "pendente" as const,
      }
    })
}

/**
 * Mescla novos registros à fila existente sem duplicar (chave = `id`). Mantém o status já
 * definido para um id que se repita (não "ressuscita" item já cadastrado/ignorado). PURO.
 */
export function mesclarProdutosACadastrar(
  existentes: ReadonlyArray<ProdutoACadastrarRecord>,
  novos: ReadonlyArray<ProdutoACadastrarRecord>
): ProdutoACadastrarRecord[] {
  const porId = new Map<string, ProdutoACadastrarRecord>()
  for (const r of existentes) porId.set(r.id, r)
  for (const n of novos) {
    if (!porId.has(n.id)) porId.set(n.id, n)
  }
  return Array.from(porId.values())
}

/**
 * Conta quantas vezes cada código aparece (só códigos informados). PURO.
 * Usado para sinalizar "Mesmo código vendido X vezes" sem esconder linhas.
 */
export function contarOcorrenciasPorCodigo(
  registros: ReadonlyArray<ProdutoACadastrarRecord>
): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of registros) {
    const c = normalizarCodigoCadastro(r.codigo)
    if (!c) continue
    m.set(c, (m.get(c) ?? 0) + 1)
  }
  return m
}

/** Aplica novo status a um id (imutável). PURO. */
export function aplicarStatusProdutoACadastrar(
  registros: ReadonlyArray<ProdutoACadastrarRecord>,
  id: string,
  status: ProdutoACadastrarStatus
): ProdutoACadastrarRecord[] {
  return registros.map((r) => (r.id === id ? { ...r, status } : r))
}

/** Ordena por data desc (mais recentes primeiro). PURO. */
export function ordenarProdutosACadastrar(
  registros: ReadonlyArray<ProdutoACadastrarRecord>
): ProdutoACadastrarRecord[] {
  return [...registros].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
}

type CatalogoItemLike = {
  id?: unknown
  name?: unknown
  barcode?: unknown
  sku?: unknown
  codigo?: unknown
  codigoBarras?: unknown
}

/**
 * Procura um produto JÁ cadastrado por código EXATO (barcode/sku/codigo/codigoBarras/id). PURO.
 * Usado pelo modal para alertar "este código já existe". Não decide nada — só informa.
 */
export function acharProdutoPorCodigoExato(
  itens: ReadonlyArray<CatalogoItemLike>,
  codigo: string | null | undefined
): { nome: string } | null {
  const alvo = normalizarCodigoCadastro(codigo)
  if (!alvo) return null
  const alvoLc = alvo.toLowerCase()
  const eq = (v: unknown) => typeof v === "string" && v.trim().toLowerCase() === alvoLc
  for (const it of itens) {
    if (eq(it.barcode) || eq(it.sku) || eq(it.codigo) || eq(it.codigoBarras) || eq(it.id)) {
      const nome = typeof it.name === "string" && it.name.trim() ? it.name.trim() : alvo
      return { nome }
    }
  }
  return null
}

// ─── Camada localStorage (fina) ────────────────────────────────────────────────

function storageKey(storeId: string): string {
  return `${STORAGE_PREFIX}${storeId}`
}

/** Lê a fila da loja (ordenada por data desc). Nunca lança. */
export function lerProdutosACadastrar(storeId: string): ProdutoACadastrarRecord[] {
  const sid = (storeId ?? "").trim()
  if (!sid || typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(storageKey(sid))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return ordenarProdutosACadastrar(parsed as ProdutoACadastrarRecord[])
  } catch {
    return []
  }
}

function salvar(storeId: string, registros: ReadonlyArray<ProdutoACadastrarRecord>): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(storageKey(storeId), JSON.stringify(registros))
  } catch {
    /* quota/serialização — ignora (fila é auxiliar, não pode quebrar o PDV) */
  }
}

/**
 * Enfileira os itens avulsos de uma venda na fila da loja (idempotente, sem duplicar).
 * Nunca lança — chamada após a venda já confirmada, não pode afetar o fluxo do PDV.
 */
export function enfileirarProdutosACadastrar(
  storeId: string,
  novos: ReadonlyArray<ProdutoACadastrarRecord>
): void {
  const sid = (storeId ?? "").trim()
  if (!sid || novos.length === 0) return
  const atual = lerProdutosACadastrar(sid)
  salvar(sid, mesclarProdutosACadastrar(atual, novos))
}

/** Atualiza o status de um item e persiste. Retorna a fila atualizada. */
export function definirStatusProdutoACadastrar(
  storeId: string,
  id: string,
  status: ProdutoACadastrarStatus
): ProdutoACadastrarRecord[] {
  const sid = (storeId ?? "").trim()
  if (!sid) return []
  const atualizada = aplicarStatusProdutoACadastrar(lerProdutosACadastrar(sid), id, status)
  salvar(sid, atualizada)
  return ordenarProdutosACadastrar(atualizada)
}
