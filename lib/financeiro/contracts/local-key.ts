/**
 * Chaves locais idempotentes (`ContaReceberTitulo.localKey`, etc.).
 *
 * Compatibilidade: o adapter OS → receber usa obrigatoriamente
 * `os-faturamento:{storeId}:{ordemServicoId}` (não alterar sem migração).
 *
 * Prefixos `receber:*` / `pagar:*` / `venda:*` são o contrato oficial para novos fluxos.
 */

import type { FinanceiroOrigem } from "./origem"
import { normalizeFinanceiroOrigem } from "./origem"

/** Prefixo legado exigido pelo adapter em `lib/financeiro/adapters/os-faturamento.ts`. */
export const LOCAL_KEY_PREFIX_OS_FATURAMENTO = "os-faturamento" as const

export type BuildContaReceberLocalKeyInput =
  | { kind: "adapter_os_faturamento"; storeId: string; ordemServicoId: string }
  | { kind: "receber_os"; storeId: string; ordemServicoId: string }
  | { kind: "receber_pdv"; storeId: string; pedidoId: string }
  | { kind: "receber_manual"; storeId: string; uuid: string }

export function buildContaReceberLocalKey(input: BuildContaReceberLocalKeyInput): string {
  switch (input.kind) {
    case "adapter_os_faturamento":
      return `${LOCAL_KEY_PREFIX_OS_FATURAMENTO}:${trimSeg(input.storeId)}:${trimSeg(input.ordemServicoId)}`
    case "receber_os":
      return `receber:os:${trimSeg(input.storeId)}:${trimSeg(input.ordemServicoId)}`
    case "receber_pdv":
      return `receber:pdv:${trimSeg(input.storeId)}:${trimSeg(input.pedidoId)}`
    case "receber_manual":
      return `receber:manual:${trimSeg(input.storeId)}:${trimSeg(input.uuid)}`
  }
}

export type BuildContaPagarLocalKeyInput =
  | { kind: "pagar_manual"; storeId: string; uuid: string }
  | { kind: "pagar_fornecedor"; storeId: string; fornecedorId: string; referencia: string }

export function buildContaPagarLocalKey(input: BuildContaPagarLocalKeyInput): string {
  switch (input.kind) {
    case "pagar_manual":
      return `pagar:manual:${trimSeg(input.storeId)}:${trimSeg(input.uuid)}`
    case "pagar_fornecedor":
      return `pagar:fornecedor:${trimSeg(input.storeId)}:${trimSeg(input.fornecedorId)}:${trimSeg(input.referencia)}`
  }
}

export function buildVendaLocalKey(storeId: string, pedidoId: string): string {
  return `venda:${trimSeg(storeId)}:${trimSeg(pedidoId)}`
}

/**
 * Movimento: `movimento:{storeId}:{origem}:{referencia}`
 * `origem` é normalizada para slug sem `:` para não quebrar o parse.
 */
export function buildMovimentoLocalKey(storeId: string, origem: FinanceiroOrigem | string, referencia: string): string {
  const o = normalizeFinanceiroOrigem(origem) ?? safeSlug(origem)
  return `movimento:${trimSeg(storeId)}:${o}:${trimSeg(referencia)}`
}

export type ParsedFinanceiroLocalKey =
  | { type: "os_faturamento"; storeId: string; ordemServicoId: string }
  | { type: "receber_os"; storeId: string; ordemServicoId: string }
  | { type: "receber_pdv"; storeId: string; pedidoId: string }
  | { type: "receber_manual"; storeId: string; uuid: string }
  | { type: "pagar_manual"; storeId: string; uuid: string }
  | { type: "pagar_fornecedor"; storeId: string; fornecedorId: string; referencia: string }
  | { type: "venda"; storeId: string; pedidoId: string }
  | { type: "movimento"; storeId: string; origem: string; referencia: string }
  | { type: "unknown"; raw: string }

export function parseFinanceiroLocalKey(raw: string | null | undefined): ParsedFinanceiroLocalKey {
  if (raw == null || raw.trim() === "") return { type: "unknown", raw: "" }
  const s = raw.trim()

  if (s.startsWith(`${LOCAL_KEY_PREFIX_OS_FATURAMENTO}:`)) {
    const rest = s.slice(LOCAL_KEY_PREFIX_OS_FATURAMENTO.length + 1)
    const { head, tail } = splitFirst(rest)
    const ordemServicoId = tail
    if (head && ordemServicoId !== undefined) return { type: "os_faturamento", storeId: head, ordemServicoId }
  }

  if (s.startsWith("receber:os:")) {
    const rest = s.slice("receber:os:".length)
    const { head, tail } = splitFirst(rest)
    if (head && tail !== undefined) return { type: "receber_os", storeId: head, ordemServicoId: tail }
  }
  if (s.startsWith("receber:pdv:")) {
    const rest = s.slice("receber:pdv:".length)
    const { head, tail } = splitFirst(rest)
    if (head && tail !== undefined) return { type: "receber_pdv", storeId: head, pedidoId: tail }
  }
  if (s.startsWith("receber:manual:")) {
    const rest = s.slice("receber:manual:".length)
    const { head, tail } = splitFirst(rest)
    if (head && tail !== undefined) return { type: "receber_manual", storeId: head, uuid: tail }
  }
  if (s.startsWith("pagar:manual:")) {
    const rest = s.slice("pagar:manual:".length)
    const { head, tail } = splitFirst(rest)
    if (head && tail !== undefined) return { type: "pagar_manual", storeId: head, uuid: tail }
  }
  if (s.startsWith("pagar:fornecedor:")) {
    const rest = s.slice("pagar:fornecedor:".length)
    const { head: storeId, rest: r1 } = splitFirst(rest)
    if (storeId && r1) {
      const i = r1.indexOf(":")
      if (i !== -1) {
        const fornecedorId = r1.slice(0, i)
        const referencia = r1.slice(i + 1)
        if (fornecedorId && referencia !== "") {
          return { type: "pagar_fornecedor", storeId, fornecedorId, referencia }
        }
      }
    }
  }
  if (s.startsWith("venda:")) {
    const rest = s.slice("venda:".length)
    const { head, tail } = splitFirst(rest)
    if (head && tail !== undefined) return { type: "venda", storeId: head, pedidoId: tail }
  }
  if (s.startsWith("movimento:")) {
    const rest = s.slice("movimento:".length)
    const { head: storeId, rest: r1 } = splitFirst(rest)
    const { head: origem, rest: referencia } = splitFirst(r1)
    if (storeId && origem && referencia !== "") {
      return { type: "movimento", storeId, origem, referencia }
    }
  }

  return { type: "unknown", raw: s }
}

function trimSeg(s: string): string {
  return String(s ?? "").trim()
}

function safeSlug(s: string): string {
  return trimSeg(s)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/:+/g, "_")
    .slice(0, 64)
}

/** Primeiro segmento até `:`, resto após o primeiro `:`. */
function splitFirst(s: string): { head: string; tail: string; rest: string } {
  const i = s.indexOf(":")
  if (i === -1) return { head: s, tail: "", rest: "" }
  return { head: s.slice(0, i), tail: s.slice(i + 1), rest: s.slice(i + 1) }
}
