/**
 * CAD-R2-019 — Helpers PUROS de auditoria/backfill da chave canônica de
 * documento de Cliente.
 *
 * Módulo puro (sem `server-only`, sem Prisma, sem I/O): reutilizável pelos
 * scripts de preflight/backfill (`scripts/cad-r2-019-*.ts`) e por testes.
 *
 * - Classificação reaproveita `toStrongDocumentKey` de
 *   `lib/cadastros/client-identity/document.ts` — nenhum outro validador
 *   CPF/CNPJ existe aqui.
 * - Nenhuma PII é produzida: grupos de duplicidade carregam só IDs técnicos
 *   + hash opaco (sha256 truncado) da chave, nunca dígitos do documento.
 */

import { createHash } from "node:crypto"

import { normalizeDocumentDigits, toStrongDocumentKey } from "@/lib/cadastros/client-identity/document"

export type DocumentBucket = "empty" | "invalid" | "strong"

export function classifyDocumentBucket(raw: unknown): DocumentBucket {
  const digits = normalizeDocumentDigits(raw)
  if (!digits) return "empty"
  return toStrongDocumentKey(raw) === null ? "invalid" : "strong"
}

export type DocumentFormat = "canonical" | "masked" | "other"

function isCanonicalFormat(raw: string, digits: string): boolean {
  return raw === digits
}

function isMaskedFormat(raw: string, digits: string): boolean {
  if (raw === digits) return false
  return normalizeDocumentDigits(raw) === digits
}

/**
 * Formato de armazenamento do valor bruto (para o relatório
 * mascarado-vs-canônico). Só faz sentido para documentos fortes; para
 * vazio/inválido retorna "other".
 */
export function describeDocumentFormat(raw: unknown): DocumentFormat {
  const key = toStrongDocumentKey(raw)
  if (key === null) return "other"
  const text = typeof raw === "string" ? raw : String(raw ?? "")
  if (isCanonicalFormat(text, key)) return "canonical"
  if (isMaskedFormat(text, key)) return "masked"
  return "other"
}

export type AuditedClientRow = {
  id: string
  storeId: string
  document: string | null
}

export type StrongDuplicateGroup = {
  /** Hash opaco (nunca o documento): sha256(storeId + chave) truncado. */
  keyHash: string
  storeId: string
  memberIds: string[]
}

export type DocumentAuditSummary = {
  total: number
  empty: number
  invalid: number
  strong: number
  masked: number
  canonical: number
  /** Grupos com 2+ clientes da MESMA store compartilhando a chave forte. */
  sameStoreStrongGroups: StrongDuplicateGroup[]
  /** Chaves fortes presentes em 2+ stores distintas (permitido; só contagem). */
  crossStoreKeyCount: number
}

function opaqueKeyHash(storeId: string, key: string): string {
  return createHash("sha256").update(`cad-r2-019|${storeId}|${key}`).digest("hex").slice(0, 16)
}

/**
 * Agrega linhas já lidas (sem I/O). Determinístico: grupos e membros
 * ordenados por id. Sem PII no resultado.
 */
export function summarizeDocumentAudit(rows: readonly AuditedClientRow[]): DocumentAuditSummary {
  let empty = 0
  let invalid = 0
  let strong = 0
  let masked = 0
  let canonical = 0

  const byStoreKey = new Map<string, string[]>()
  const storesByKey = new Map<string, Set<string>>()

  for (const row of rows) {
    const bucket = classifyDocumentBucket(row.document)
    if (bucket === "empty") {
      empty += 1
      continue
    }
    if (bucket === "invalid") {
      invalid += 1
      continue
    }
    strong += 1
    const format = describeDocumentFormat(row.document)
    if (format === "masked") masked += 1
    if (format === "canonical") canonical += 1
    const key = toStrongDocumentKey(row.document) as string
    const storeId = (row.storeId ?? "").trim()
    const composite = `${storeId}|${key}`
    const members = byStoreKey.get(composite) ?? []
    members.push(row.id)
    byStoreKey.set(composite, members)
    const stores = storesByKey.get(key) ?? new Set<string>()
    stores.add(storeId)
    storesByKey.set(key, stores)
  }

  const sameStoreStrongGroups: StrongDuplicateGroup[] = [...byStoreKey.entries()]
    .filter(([, members]) => members.length > 1)
    .map(([composite, members]) => {
      const separator = composite.indexOf("|")
      const storeId = composite.slice(0, separator)
      const key = composite.slice(separator + 1)
      return {
        keyHash: opaqueKeyHash(storeId, key),
        storeId,
        memberIds: [...members].sort(),
      }
    })
    .sort((a, b) => (a.keyHash < b.keyHash ? -1 : a.keyHash > b.keyHash ? 1 : 0))

  let crossStoreKeyCount = 0
  for (const stores of storesByKey.values()) {
    if (stores.size > 1) crossStoreKeyCount += 1
  }

  return {
    total: rows.length,
    empty,
    invalid,
    strong,
    masked,
    canonical,
    sameStoreStrongGroups,
    crossStoreKeyCount,
  }
}

/**
 * Decide o resultado do preflight a partir do sumário agregado.
 * Qualquer grupo forte duplicado na mesma store bloqueia a constraint —
 * sem auto-merge, sem escolha de survivor, sem escrita.
 */
export function preflightResult(summary: DocumentAuditSummary): "PASS" | "BLOCKED" {
  return summary.sameStoreStrongGroups.length > 0 ? "BLOCKED" : "PASS"
}
