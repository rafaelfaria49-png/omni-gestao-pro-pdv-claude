import type { PaymentBreakdownFull, SaleLineRecord, SaleRecord } from "@/lib/operations-sale-types"

export type SaleAttemptLine = {
  inventoryId: string
  quantity: number
  unitPrice?: number
}

export type SaleAttemptFingerprintInput = {
  lines: readonly SaleAttemptLine[]
  total: number
  paymentBreakdown: PaymentBreakdownFull
  linkedOsId?: string
  customerCpf?: string
}

function roundMoney(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100
}

/**
 * Impressão estável da tentativa — NÃO é identidade comercial.
 * Serve para coalescer duplo clique / reconfirmação do MESMO carrinho
 * na mesma loja sem gerar segundo `clientSaleId`.
 */
export function saleAttemptFingerprint(input: SaleAttemptFingerprintInput): string {
  const lines = [...input.lines]
    .map((line) => ({
      inventoryId: String(line.inventoryId ?? "").trim(),
      quantity: Number(line.quantity) || 0,
      unitPrice: roundMoney(Number(line.unitPrice) || 0),
    }))
    .sort((a, b) => {
      if (a.inventoryId !== b.inventoryId) return a.inventoryId < b.inventoryId ? -1 : 1
      if (a.quantity !== b.quantity) return a.quantity - b.quantity
      return a.unitPrice - b.unitPrice
    })
  return JSON.stringify({
    lines,
    total: roundMoney(input.total),
    paymentBreakdown: {
      dinheiro: roundMoney(input.paymentBreakdown.dinheiro),
      pix: roundMoney(input.paymentBreakdown.pix),
      cartaoDebito: roundMoney(input.paymentBreakdown.cartaoDebito),
      cartaoCredito: roundMoney(input.paymentBreakdown.cartaoCredito),
      carne: roundMoney(input.paymentBreakdown.carne),
      aPrazo: roundMoney(input.paymentBreakdown.aPrazo),
      creditoVale: roundMoney(input.paymentBreakdown.creditoVale),
    },
    linkedOsId: input.linkedOsId?.trim() || "",
    customerCpf: input.customerCpf?.trim() || "",
  })
}

export function saleRecordAttemptFingerprint(sale: Pick<SaleRecord, "lines" | "total" | "paymentBreakdown" | "linkedOsId" | "customerCpf">): string {
  return saleAttemptFingerprint({
    lines: sale.lines ?? [],
    total: sale.total,
    paymentBreakdown: sale.paymentBreakdown,
    linkedOsId: sale.linkedOsId,
    customerCpf: sale.customerCpf,
  })
}

export function findMatchingPendingSale(
  sales: readonly SaleRecord[],
  fingerprint: string,
): SaleRecord | undefined {
  return sales.find(
    (sale) =>
      sale.syncPending === true &&
      saleRecordAttemptFingerprint(sale) === fingerprint,
  )
}

export function lineRecordsFromAttempt(lines: readonly SaleLineRecord[]): SaleAttemptLine[] {
  return lines.map((line) => ({
    inventoryId: line.inventoryId,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
  }))
}

export type PersistedSaleAttempt = {
  fingerprint: string
  clientSaleId: string
  saleId: string
  at: string
}

export function saleAttemptStorageKey(storeId: string): string {
  return `omnigestao:pdv-sale-attempt:${storeId}`
}

function readAttemptMap(storeId: string): Record<string, PersistedSaleAttempt> {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(saleAttemptStorageKey(storeId))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    return parsed as Record<string, PersistedSaleAttempt>
  } catch {
    return {}
  }
}

function writeAttemptMap(storeId: string, map: Record<string, PersistedSaleAttempt>): void {
  if (typeof window === "undefined") return
  try {
    const entries = Object.entries(map)
    entries.sort((a, b) => (a[1].at < b[1].at ? 1 : -1))
    const trimmed = Object.fromEntries(entries.slice(0, 50))
    window.localStorage.setItem(saleAttemptStorageKey(storeId), JSON.stringify(trimmed))
  } catch {
    /* quota */
  }
}

export function readPersistedSaleAttempt(storeId: string, fingerprint: string): PersistedSaleAttempt | null {
  const row = readAttemptMap(storeId)[fingerprint]
  if (!row?.clientSaleId || !row.saleId) return null
  return row
}

export function writePersistedSaleAttempt(storeId: string, attempt: PersistedSaleAttempt): void {
  const map = readAttemptMap(storeId)
  map[attempt.fingerprint] = attempt
  writeAttemptMap(storeId, map)
}

export function clearPersistedSaleAttempt(storeId: string, fingerprint: string): void {
  const map = readAttemptMap(storeId)
  if (!map[fingerprint]) return
  delete map[fingerprint]
  writeAttemptMap(storeId, map)
}
