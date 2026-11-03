"use client"

import { getDeviceId } from "@/lib/pdv-terminal"
import type { JobView } from "./status"

/** Browser client of the 004C direct-print API. Store context is explicit (header); no bytes, host or printer leave the browser. */
export type DirectTerminalStatus =
  | { configured: false }
  | { configured: true; printerName: string; profileId: string; agentOnline: boolean; printerOnline: boolean | null; destinationBlocked: boolean }
export type ReprintQuote = { consent: string; possibleAdditionalCopy: boolean; uncertainCopies: number; acceptedCopies: number; browserCopies: number }
export type BrowserFallback =
  | { requiresConfirmation: true; possibleAdditionalCopy: true; uncertainCopies: number; acceptedCopies: number; browserCopies: number }
  | { requiresConfirmation: false; mark: string; html: string }
export type DirectResult<T> = { ok: true; value: T } | { ok: false; error: string; status: number }

async function request<T>(storeId: string, path: string, body?: unknown, signal?: AbortSignal): Promise<DirectResult<T>> {
  try {
    const device = getDeviceId()
    const res = await fetch(path, {
      method: body === undefined ? "GET" : "POST", credentials: "same-origin", cache: "no-store", signal,
      headers: { "x-assistec-loja-id": storeId, ...(device ? { "x-omni-device-id": device } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok || json.ok !== true) return { ok: false, error: typeof json.error === "string" ? json.error : `HTTP_${res.status}`, status: res.status }
    return { ok: true, value: json as T }
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e
    return { ok: false, error: "NETWORK", status: 0 }
  }
}

export const directPrintClient = {
  terminalStatus: (storeId: string, terminalId: string, signal?: AbortSignal) =>
    request<{ status: DirectTerminalStatus }>(storeId, `/api/print/direct/terminal-status?terminalId=${encodeURIComponent(terminalId)}`, undefined, signal),
  createInitial: (storeId: string, input: { saleId: string; terminalId: string; copies: number; uiContextId: string }) =>
    request<{ job: JobView }>(storeId, "/api/print/direct/jobs", { ...input, kind: "INITIAL" }),
  latest: (storeId: string, saleId: string) => request<{ job: JobView | null }>(storeId, `/api/print/direct/jobs?saleId=${encodeURIComponent(saleId)}`),
  getJob: (storeId: string, jobId: string, signal?: AbortSignal) =>
    request<{ job: JobView }>(storeId, `/api/print/direct/jobs/${encodeURIComponent(jobId)}`, undefined, signal),
  retry: (storeId: string, jobId: string) => request<{ job: JobView }>(storeId, `/api/print/direct/jobs/${encodeURIComponent(jobId)}/retry`, {}),
  quoteReprint: (storeId: string, saleId: string) => request<{ quote: ReprintQuote }>(storeId, "/api/print/direct/reprint-quote", { saleId }),
  createReprint: (storeId: string, input: { saleId: string; terminalId: string; reasonCode: string; consent: string; uiContextId: string }) =>
    request<{ job: JobView }>(storeId, "/api/print/direct/jobs", { ...input, kind: "REPRINT" }),
  browserFallback: (storeId: string, input: { saleId: string; confirm: boolean }) =>
    request<{ fallback: BrowserFallback }>(storeId, "/api/print/direct/browser-fallback", input),
  adminList: (storeId: string) => request<{ installations: AdminInstallation[]; bindings: AdminBinding[] }>(storeId, "/api/print/direct/admin"),
  adminAction: <T>(storeId: string, body: Record<string, unknown>) => request<T>(storeId, "/api/print/direct/admin", body),
}
export type AdminInstallation = { installationId: string; label: string; revoked: boolean; paired: boolean; pairingPending: boolean; online: boolean
  lastSeenAt: string | null; agentVersion: string | null; printers: Array<{ name: string; online: boolean; status: string; isDefault: boolean; portKind: string }> }
export type AdminBinding = { bindingId: string; terminalId: string; terminalLabel: string; installationId: string; printerName: string; profileId: string; restrictedToBrowser: boolean }

/** Transient failures keep the last known state; definitive answers replace it. */
export const isTransientDirectError = (r: { error: string; status: number }) => r.error === "NETWORK" || r.status === 0 || r.status >= 500 || r.status === 429

/** User-facing message for an API error code. Never claims that paper came out. */
export function directPrintErrorMessage(code: string): string {
  switch (code) {
    case "NETWORK": return "Sem conexão com o servidor. A venda continua confirmada."
    case "TERMINAL_PRINTER_NOT_CONFIGURED": return "Este caixa não tem impressora vinculada."
    case "TERMINAL_UNAVAILABLE": return "Este terminal está inativo ou não pertence à loja."
    case "BINDING_UNAVAILABLE": return "A impressora deste caixa está indisponível (agente revogado ou não pareado)."
    case "DEVICE_NOT_AUTHORIZED": return "Este navegador não está autorizado a imprimir neste caixa. Peça ao administrador para vinculá-lo."
    case "TERMINAL_MISMATCH": return "Esta venda foi feita em outro caixa. Use a segunda via."
    case "INITIAL_WINDOW_EXPIRED": return "A impressão automática desta venda já expirou. Use a segunda via."
    case "BROWSER_COPY_ALREADY_ISSUED": return "Já foi impressa uma via pelo navegador. Use a segunda via."
    case "DOCUMENT_INELIGIBLE": case "NOT_FOUND": return "Esta venda não está confirmada para impressão."
    case "UNAUTHENTICATED": case "SESSION_REVOKED": return "Sua sessão expirou. Entre novamente para imprimir."
    case "FORBIDDEN": return "Seu usuário não tem permissão para imprimir nesta loja."
    case "RATE_LIMIT": return "Muitas solicitações de impressão. Aguarde um instante."
    case "AUTHORIZATION_EXPIRED": case "COPY_NOT_RETRYABLE": return "Não é possível tentar novamente esta via. Use a segunda via."
    case "STALE_RISK": case "RISK_CONFIRMATION_REQUIRED": return "A situação das vias mudou. Confirme a segunda via novamente."
    case "DIRECT_PRINT_DISABLED": return "Impressão direta indisponível neste ambiente."
    default: return "Não foi possível registrar a impressão. A venda continua confirmada."
  }
}
