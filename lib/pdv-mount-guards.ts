/**
 * Guards do mount do PDV (P0 PDV-RAFACELL-LOAD-CRASH-P0-001).
 *
 * Contrato: UM único registro com formato inesperado — escopado à loja
 * (pending local, retorno da API, settings, terminal, hold, carrinho) —
 * NUNCA pode derrubar a rota `/dashboard/vendas` inteira.
 *
 * Todo dado que entra no mount (localStorage, API, settings) passa por um
 * sanitizador deste módulo ANTES de qualquer `.map/.filter/.sort` ou acesso
 * direto a propriedade. Regras:
 *
 * - entradas nulas/não-objeto são descartadas (não carregam dado algum);
 * - objetos são NORMALIZADOS POR CÓPIA (nunca mutados — o input pode ser
 *   state React; nunca descartados): pending legítima, carrinho e caixa
 *   sobrevivem mesmo com campos ausentes;
 * - nenhum sanitizador lança, nunca (retorna `[]`/default em input inválido);
 * - nenhuma PII é registrada — só contagens para observabilidade.
 *
 * Puro e sem dependências de runtime (apenas tipos locais), para não criar
 * ciclos com `operations-store`, `pdv-catalog` e demais consumidores.
 */

export function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v)
}

/** Mantém só objetos (descarta `null`/primitivos, que não carregam dado). Nunca lança. */
export function keepRecords<T>(input: unknown): T[] {
  if (!Array.isArray(input)) return []
  const out: T[] = []
  for (const item of input) {
    if (isRecord(item)) out.push(item as T)
  }
  return out
}

/** Quantas entradas sem dado (`null`/primitivos) um array contém. Para observabilidade. Nunca lança. */
export function countNonRecords(input: unknown): number {
  if (!Array.isArray(input)) return 0
  let n = 0
  for (const item of input) {
    if (!isRecord(item)) n += 1
  }
  return n
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback
}

function asFiniteNumber(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback
}

// ─── Vendas / devoluções pendentes ────────────────────────────────────────────

export type MountSaleLike = {
  id?: unknown
  clientSaleId?: unknown
  at?: unknown
  lines?: unknown
  syncPending?: unknown
  [k: string]: unknown
}

/**
 * Normaliza registros de venda/devolução preservando TODOS os objetos (por cópia).
 * - `at` ausente → `""` (o sort usa comparador seguro);
 * - `lines` não-array → `[]` (o retry exibe a pendência; o servidor valida).
 * Nunca descarta um objeto: pending legítima sempre sobrevive.
 */
export function sanitizeSaleRecords<T>(input: unknown): T[] {
  const kept = keepRecords<Record<string, unknown>>(input)
  return kept.map((s) => ({
    ...s,
    at: typeof s.at === "string" ? s.at : "",
    lines: Array.isArray(s.lines) ? s.lines : [],
  })) as T[]
}

/** Comparador seguro para ordenar vendas por `at` (ausente = primeiro). Nunca lança. */
export function compareSaleAtAsc(a: unknown, b: unknown): number {
  const aAt = isRecord(a) ? asString(a.at) : ""
  const bAt = isRecord(b) ? asString(b.at) : ""
  return aAt.localeCompare(bAt)
}

// ─── Inventário / catálogo ───────────────────────────────────────────────────

export type MountInventoryLike = {
  id?: unknown
  name?: unknown
  stock?: unknown
  cost?: unknown
  price?: unknown
  category?: unknown
  [k: string]: unknown
}

/**
 * Normaliza itens de inventário preservando TODOS os objetos (por cópia).
 * Garante `id`/`name`/`category` como string (`category` vazia → `"Outros"`,
 * exigido pelo render que faz `p.category.toLowerCase()`).
 */
export function sanitizeInventoryItems<T>(input: unknown): T[] {
  const kept = keepRecords<Record<string, unknown>>(input)
  return kept.map((inv) => {
    const cat = asString(inv.category).trim()
    return {
      ...inv,
      id: asString(inv.id),
      name: asString(inv.name),
      stock: asFiniteNumber(inv.stock),
      cost: inv.cost === undefined ? inv.cost : asFiniteNumber(inv.cost),
      price: inv.price === undefined ? inv.price : asFiniteNumber(inv.price),
      category: cat ? inv.category : "Outros",
    }
  }) as T[]
}

/** `p.category.toLowerCase()` seguro para o render do catálogo. Nunca lança. */
export function safeCategoryLower(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value.toLowerCase()
  return "outros"
}

/** Mantém só strings não-vazias (ex.: `categoriasOcultasNoPdv`). Nunca lança. */
export function sanitizeStringList(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const out: string[] = []
  for (const item of input) {
    if (typeof item === "string" && item.trim()) out.push(item)
  }
  return out
}

// ─── Atalhos rápidos (settings por loja) ─────────────────────────────────────

export type MountAtalhoLike = {
  id?: unknown
  nome?: unknown
  preco?: unknown
  [k: string]: unknown
}

/** Normaliza atalhos preservando todos os objetos, por cópia (id/nome string, preço finito). */
export function sanitizeAtalhosRapidos<T>(input: unknown): T[] {
  const kept = keepRecords<Record<string, unknown>>(input)
  return kept.map((a) => ({
    ...a,
    id: asString(a.id),
    nome: asString(a.nome),
    preco: asFiniteNumber(a.preco),
  })) as T[]
}

// ─── Garantia (settings por loja) ────────────────────────────────────────────

export type MountGarantiaCategoriaLike = {
  id?: unknown
  servico?: unknown
  detalhes?: unknown
  [k: string]: unknown
}

/** Normaliza categorias de garantia por cópia (descarta só não-objetos, que não renderizam). */
export function sanitizeGarantiaCategorias<T>(input: unknown): T[] {
  const kept = keepRecords<Record<string, unknown>>(input)
  return kept.map((c) => ({
    ...c,
    id: asString(c.id),
    servico: asString(c.servico),
    detalhes: asString(c.detalhes),
  })) as T[]
}

// ─── Serviços (catálogo da Assistência) ──────────────────────────────────────

export type MountServicoRowLike = {
  id?: unknown
  nome?: unknown
  categoria?: unknown
  custo?: unknown
  preco?: unknown
  garantia?: unknown
  termo?: unknown
  active?: unknown
  status?: unknown
  [k: string]: unknown
}

/** Normaliza linhas de serviço da API por cópia (objetos preservados; disponibilidade decide exibição). */
export function sanitizeServicoRows<T>(input: unknown): T[] {
  const kept = keepRecords<Record<string, unknown>>(input)
  return kept.map((s) => ({
    ...s,
    id: asString(s.id),
    nome: asString(s.nome),
    categoria: asString(s.categoria),
    termo: asString(s.termo),
    custo: s.custo !== undefined && typeof s.custo !== "number" ? 0 : s.custo,
    preco: s.preco !== undefined && typeof s.preco !== "number" ? 0 : s.preco,
  })) as T[]
}

// ─── Terminais ───────────────────────────────────────────────────────────────

export type MountTerminalLockLike = {
  status?: unknown
  lockedByOperador?: unknown
  heartbeatAt?: unknown
  lockedAt?: unknown
  isMine?: unknown
  [k: string]: unknown
}

export type MountTerminalLike = {
  id?: unknown
  storeId?: unknown
  code?: unknown
  name?: unknown
  status?: unknown
  lock?: unknown
  [k: string]: unknown
}

const TERMINAL_LOCK_STATUSES = new Set(["LIVRE", "EM_USO", "OCUPADO", "EXPIRADO", "INATIVO"])

function sanitizeTerminalLock(raw: unknown): Record<string, unknown> {
  const lock = isRecord(raw) ? raw : {}
  const status = asString(lock.status)
  return {
    status: TERMINAL_LOCK_STATUSES.has(status) ? status : "INATIVO",
    lockedByOperador: typeof lock.lockedByOperador === "string" ? lock.lockedByOperador : null,
    heartbeatAt: typeof lock.heartbeatAt === "string" ? lock.heartbeatAt : null,
    lockedAt: typeof lock.lockedAt === "string" ? lock.lockedAt : null,
    isMine: lock.isMine === true,
  }
}

/**
 * Normaliza cartões de terminal (TerminalSelector) por cópia. Descarta só não-objetos.
 * Terminal sem `lock` válido cai para `INATIVO` (operador pode reativar —
 * nunca trava a seleção).
 */
export function sanitizeTerminalCards<T>(input: unknown): T[] {
  const kept = keepRecords<Record<string, unknown>>(input)
  return kept.map((t) => ({
    ...t,
    id: asString(t.id),
    storeId: asString(t.storeId),
    code: asString(t.code),
    name: asString(t.name),
    status: t.status === "ACTIVE" ? "ACTIVE" : "INACTIVE",
    lock: sanitizeTerminalLock(t.lock),
  })) as T[]
}

// ─── Holds / carrinho restaurado ─────────────────────────────────────────────

export type MountCartLineLike = {
  inventoryId?: unknown
  name?: unknown
  price?: unknown
  qty?: unknown
  quantity?: unknown
  [k: string]: unknown
}

/**
 * Normaliza linhas de carrinho restaurado (Assistencia) por cópia.
 * preço/qtd viram números finitos (NaN nunca entra em `reduce` de total).
 */
export function sanitizeCartLines<T>(input: unknown): T[] {
  const kept = keepRecords<Record<string, unknown>>(input)
  return kept.map((line) => ({
    ...line,
    inventoryId: asString(line.inventoryId),
    name: asString(line.name),
    price: asFiniteNumber(line.price),
    qty: line.qty === undefined ? line.qty : asFiniteNumber(line.qty),
    quantity: line.quantity === undefined ? line.quantity : asFiniteNumber(line.quantity),
  })) as T[]
}

export type MountHeldSaleLike = {
  id?: unknown
  label?: unknown
  savedAt?: unknown
  items?: unknown
  [k: string]: unknown
}

/** Normaliza vendas em espera por cópia (preserva objetos; `items` sempre array). */
export function sanitizeHeldSales<T>(input: unknown): T[] {
  const kept = keepRecords<Record<string, unknown>>(input)
  return kept.map((sale) => ({
    ...sale,
    id: asString(sale.id),
    label: asString(sale.label),
    items: Array.isArray(sale.items) ? sale.items : [],
  })) as T[]
}

// ─── Mesas / consumo ─────────────────────────────────────────────────────────

export type MountMesaLike = {
  id?: unknown
  label?: unknown
  itens?: unknown
  [k: string]: unknown
}

/** Normaliza mesas salvas por cópia (preserva objetos com id; `itens` sempre array). */
export function sanitizeMesas<T>(input: unknown): T[] {
  const kept = keepRecords<Record<string, unknown>>(input)
  const out: T[] = []
  for (const mesa of kept) {
    const id = asString(mesa.id).trim()
    if (!id) continue
    out.push({
      ...mesa,
      id,
      label: asString(mesa.label) || id,
      itens: Array.isArray(mesa.itens) ? mesa.itens : [],
    } as T)
  }
  return out
}
