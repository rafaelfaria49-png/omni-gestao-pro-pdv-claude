/**
 * Cliente das rotas `/api/ops/trocas*` (OMNI-PDV-TROCAS-DEVOLUCOES-INTEGRIDADE-HISTORICO-P1-001).
 *
 * Nenhum efeito local otimista: a troca só é "concluída" com `ok: true` do servidor (após
 * COMMIT). Se a resposta se perder, a operação fica registrada AQUI com a mesma chave
 * (`operationId`) para "Verificar / reenviar" — o servidor devolve o mesmo resultado ou
 * executa uma única vez. O registro é apagado na confirmação ou no descarte explícito.
 */
import type { BuscaTrocaResultado, VendaTrocaView } from "@/lib/pdv/trocas/troca-consulta"
import type { ResultadoTroca } from "@/lib/pdv/trocas/troca-service"

export type { BuscaTrocaResultado, VendaTrocaView, ResultadoTroca }

export type TrocaRequestBody = {
  operationId: string
  pedidoIdOrigem: string
  modo: "troca" | "vale_credito" | "reembolso" | "somente_estoque"
  linhas: Array<{ lineIndex: number; quantidade: number }>
  novosItens?: Array<{ produtoId: string; quantidade: number }>
  formaDiferenca?: "dinheiro" | "pix" | "debito" | "credito"
  destinoExcedente?: "vale" | "dinheiro"
  formaReembolso?: "dinheiro" | "pix" | "estorno_cartao"
  clienteDoc?: string
  clienteNome?: string
  motivo?: string
  sessaoId?: string | null
  terminalId?: string | null
}

export function novoOperationId(): string {
  const uuid =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`
  return `trc_${uuid.replace(/[^A-Za-z0-9_-]/g, "")}`
}

function headers(lojaId: string): HeadersInit {
  return { "Content-Type": "application/json", "x-assistec-loja-id": lojaId }
}

export async function buscarVendasTroca(
  lojaId: string,
  q: string,
  opts: { dias: number; skip: number; take?: number; signal?: AbortSignal },
): Promise<BuscaTrocaResultado> {
  const u = new URLSearchParams({ q, dias: String(opts.dias), skip: String(opts.skip), take: String(opts.take ?? 10) })
  const res = await fetch(`/api/ops/trocas/buscar?${u}`, { headers: headers(lojaId), credentials: "include", cache: "no-store", signal: opts.signal })
  const body = (await res.json().catch(() => ({}))) as BuscaTrocaResultado & { error?: string }
  if (!res.ok) throw new Error(body.error || `Falha na busca (HTTP ${res.status}).`)
  return body
}

export async function carregarVendaTroca(lojaId: string, pedidoId: string, signal?: AbortSignal): Promise<VendaTrocaView | null> {
  const res = await fetch(`/api/ops/trocas/venda?pedidoId=${encodeURIComponent(pedidoId)}`, {
    headers: headers(lojaId),
    credentials: "include",
    cache: "no-store",
    signal,
  })
  if (res.status === 404) return null
  const body = (await res.json().catch(() => ({}))) as { venda?: VendaTrocaView; error?: string }
  if (!res.ok || !body.venda) throw new Error(body.error || `Falha ao carregar a venda (HTTP ${res.status}).`)
  return body.venda
}

export type EnvioTroca =
  | { status: "confirmada"; resultado: ResultadoTroca; replayed: boolean }
  | { status: "recusada"; code: string; message: string }
  /** Sem resposta conclusiva (rede/timeout/5xx): pode ou não ter gravado — verificar com a MESMA chave. */
  | { status: "indefinida"; message: string }

export async function enviarTroca(lojaId: string, body: TrocaRequestBody, timeoutMs = 30_000): Promise<EnvioTroca> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch("/api/ops/trocas", {
      method: "POST",
      headers: headers(lojaId),
      credentials: "include",
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    const json = (await res.json().catch(() => null)) as { ok?: boolean; resultado?: ResultadoTroca; replayed?: boolean; error?: string; code?: string } | null
    if (res.ok && json?.ok && json.resultado) return { status: "confirmada", resultado: json.resultado, replayed: json.replayed === true }
    if (res.status >= 400 && res.status < 500 && json) {
      return { status: "recusada", code: json.code ?? `HTTP_${res.status}`, message: json.error ?? "Operação recusada." }
    }
    return { status: "indefinida", message: json?.error ?? `Servidor sem confirmação (HTTP ${res.status}).` }
  } catch {
    return { status: "indefinida", message: "Sem resposta do servidor (rede ou tempo esgotado)." }
  } finally {
    clearTimeout(timer)
  }
}

// ─── Operação enviada sem confirmação (recuperação com a mesma chave) ────────────────

export type TrocaPendente = { body: TrocaRequestBody; enviadaEm: string }

function chavePendentes(lojaId: string): string {
  return `omnigestao:trocas-pendentes:${lojaId}`
}

export function lerTrocasPendentes(lojaId: string): TrocaPendente[] {
  try {
    const raw = window.localStorage.getItem(chavePendentes(lojaId))
    const arr = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(arr) ? (arr as TrocaPendente[]).filter((p) => p && p.body && typeof p.body.operationId === "string") : []
  } catch {
    return []
  }
}

function gravar(lojaId: string, list: TrocaPendente[]) {
  try {
    if (list.length === 0) window.localStorage.removeItem(chavePendentes(lojaId))
    else window.localStorage.setItem(chavePendentes(lojaId), JSON.stringify(list.slice(-20)))
  } catch {
    /* armazenamento indisponível: a recuperação continua possível pela venda no servidor */
  }
}

export function registrarTrocaPendente(lojaId: string, body: TrocaRequestBody) {
  const list = lerTrocasPendentes(lojaId).filter((p) => p.body.operationId !== body.operationId)
  list.push({ body, enviadaEm: new Date().toISOString() })
  gravar(lojaId, list)
}

export function removerTrocaPendente(lojaId: string, operationId: string) {
  gravar(lojaId, lerTrocasPendentes(lojaId).filter((p) => p.body.operationId !== operationId))
}
