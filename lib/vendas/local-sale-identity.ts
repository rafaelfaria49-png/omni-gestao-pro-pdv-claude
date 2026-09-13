/**
 * Identidade LOCAL de venda (GOAL PDV-VENDAS-SERVER-NUMBERING-RECOVERY-P0-003).
 *
 * O cliente gera `clientSaleId` (opaco, estável entre retries). O número comercial
 * `VDA-…` só existe depois que o servidor aloca. Enquanto isso a UI usa uma
 * referência provisória `PEND-…` que NUNCA casa com `^VDA-`.
 *
 * Este módulo pode usar relógio/aleatoriedade — ao contrário de
 * `sale-identity-contracts.ts`, que é contrato puro.
 */

import {
  isValidClientSaleId,
  looksLikeSaleNumber,
  parseClientSaleId,
} from "@/lib/vendas/sale-identity-contracts"
import { isSaleIdentityConflictCode } from "@/lib/vendas/sale-identity-conflict"

export const PROVISIONAL_SALE_REF_PREFIX = "PEND-"

export type LocalSaleSyncKind = "REMOTE_CONFIRMED" | "LOCAL_PENDING" | "LOCAL_QUARANTINED"

export function assertGeneratedClientSaleId(value: string): string {
  if (!isValidClientSaleId(value)) {
    throw new Error("clientSaleId gerado localmente é inválido.")
  }
  if (looksLikeSaleNumber(value) || isProvisionalSaleRef(value)) {
    throw new Error("clientSaleId local não pode parecer número comercial.")
  }
  return value
}

export function generateClientSaleId(): string {
  const uuid = globalThis.crypto.randomUUID().replace(/-/g, "")
  return assertGeneratedClientSaleId(`cs_${uuid}`)
}

export function buildProvisionalSaleRef(clientSaleId: string): string {
  const parsed = parseClientSaleId(clientSaleId)
  const token = parsed.ok ? parsed.clientSaleId : clientSaleId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 48)
  return `${PROVISIONAL_SALE_REF_PREFIX}${token}`
}

export function isProvisionalSaleRef(raw: unknown): boolean {
  if (typeof raw !== "string") return false
  const value = raw.trim()
  if (!value.startsWith(PROVISIONAL_SALE_REF_PREFIX)) return false
  return !looksLikeSaleNumber(value)
}

export function saleLocalKey(sale: { clientSaleId?: string; id: string }): string {
  const parsed = parseClientSaleId(sale.clientSaleId)
  if (parsed.ok) return parsed.clientSaleId
  return sale.id
}

export function classifyLocalSaleSync(sale: {
  syncPending?: boolean
  syncBlockedCode?: string
}): LocalSaleSyncKind {
  if (isSaleIdentityConflictCode(sale.syncBlockedCode)) return "LOCAL_QUARANTINED"
  if (sale.syncPending === true) return "LOCAL_PENDING"
  return "REMOTE_CONFIRMED"
}

export function displaySaleNumber(saleId: string, pending?: boolean): string {
  if (pending || isProvisionalSaleRef(saleId)) return "PENDENTE — AGUARDANDO NÚMERO"
  return saleId
}

/** FNV-1a 32 bits com semente — determinístico em qualquer navegador e no Node. */
function fnv1a32Hex(input: string, seed: number): string {
  let hash = (0x811c9dc5 ^ seed) >>> 0
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, "0")
}

const LEGACY_CLIENT_SALE_ID_SEEDS = [0, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35] as const

/**
 * Identidade técnica DETERMINÍSTICA para venda local legada que ainda não tem
 * `clientSaleId` (vendas do writer v1 presas em conflito de identificação).
 *
 * Determinística de propósito: a reconciliação automática roda em toda aba aberta do
 * PDV. Duas abas — ou uma tentativa antes e outra depois de um crash — que cunhassem
 * valores ALEATÓRIOS diferentes para a mesma venda criariam duas vendas no servidor.
 * Derivando da loja + fatos imutáveis da venda, todas chegam ao mesmo valor e a unique
 * `(storeId, clientSaleId)` garante uma única criação.
 */
export function deriveLegacySaleClientSaleId(
  storeId: string,
  sale: {
    readonly id: string
    readonly at?: string
    readonly total?: number
    readonly lines?: ReadonlyArray<{
      readonly inventoryId?: string
      readonly quantity?: number
      readonly unitPrice?: number
    }>
    readonly paymentBreakdown?: object | null
  },
): string {
  const payments =
    sale.paymentBreakdown && typeof sale.paymentBreakdown === "object"
      ? Object.entries(sale.paymentBreakdown as Record<string, unknown>).sort(([a], [b]) =>
          a.localeCompare(b),
        )
      : []
  const canonical = JSON.stringify([
    storeId,
    sale.id,
    sale.at ?? "",
    sale.total ?? 0,
    (sale.lines ?? []).map((line) => [line.inventoryId ?? "", line.quantity ?? 0, line.unitPrice ?? 0]),
    payments,
  ])
  const digest = LEGACY_CLIENT_SALE_ID_SEEDS.map((seed) => fnv1a32Hex(canonical, seed)).join("")
  return assertGeneratedClientSaleId(`lq_${digest}`)
}
