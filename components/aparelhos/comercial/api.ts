"use client"

/**
 * Cliente HTTP de /api/comercial (prontuário comercial da unidade · ADR-0025).
 * Loja sempre explícita no header; erros do servidor (inclusive 403 RECURSO_DESATIVADO e
 * 503 COMERCIAL_NAO_INSTALADO) chegam como `ApiError` com a mensagem original.
 */
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import type { AparelhoDTO } from "@/lib/aparelhos/service"
import type { ComposicaoCusto, IndicadoresPreco } from "@/lib/comercial/custos/composicao"
import type { ConferenciaKey, CONFERENCIA_VALORES, CustoCategoria, CustoOrigem, CustoStatus } from "@/lib/comercial/custos/contracts"
import { ApiError } from "../api"

export { ApiError }

export async function apiComercial<T>(storeId: string, path: string, init?: { method?: string; body?: unknown; signal?: AbortSignal }): Promise<T> {
  const res = await fetch(`/api/comercial${path}`, {
    method: init?.method ?? "GET",
    headers: { [ASSISTEC_LOJA_HEADER]: storeId, ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
    credentials: "same-origin",
    signal: init?.signal,
  })
  const data = (await res.json().catch(() => null)) as (T & { ok?: boolean; error?: string; code?: string; field?: string }) | null
  if (!res.ok || !data || data.ok === false) {
    throw new ApiError(data?.error ?? (res.status === 403 ? "Sem permissão." : "Não foi possível concluir. Tente novamente."), data?.code, res.status, data?.field)
  }
  return data
}

/** Chave de idempotência de UMA submissão (reutilizada em nova tentativa / clique duplo). */
export function novoOperationId(): string {
  const uuid = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`
  return `custo_${uuid.replace(/-/g, "")}`.slice(0, 100)
}

export type ConferenciaValor = (typeof CONFERENCIA_VALORES)[number]

export type PerfilComercial = {
  categoria: string
  funcionamento: string
  finalidade: string
  etapaPreparacao: string
  custoAquisicaoStatus: CustoStatus | string
  custoAquisicaoJustificativa: string
  preexistente: boolean
  defeitos: string
  classeEstetica: string
  conferencias: Partial<Record<ConferenciaKey, ConferenciaValor>> | Record<string, unknown> | null
  version: number
}

export type LancamentoCusto = {
  id: string
  categoria: CustoCategoria | string
  origem: CustoOrigem | string
  descricao: string
  quantidade: number
  /** null quando desconhecido OU quando o usuário não vê custo. */
  valorCentavos: number | null
  custoStatus: CustoStatus | string
  produtoId: string | null
  origemFinanceiraId: string | null
  contaPagarTituloId: string | null
  justificativa: string
  status: "ativo" | "estornado" | string
  estornadoEm: string | null
  estornadoPor: string | null
  motivoEstorno: string | null
  operador: string
  createdAt: string
}

export type EventoComercial = { id: string; tipo: string; deStatus: string | null; paraStatus: string | null; operador: string; createdAt: string; dados: unknown }

export type VendaComercial = {
  id: string; pedidoId: string; status: string; precoVenda: number; dataVenda: string; dataEntrega: string
  numeroGarantia: string; coberturaFim: string; custoHistorico: unknown
}

export type Prontuario = {
  ok: true
  aparelho: AparelhoDTO
  perfil: PerfilComercial
  perfilPersistido: boolean
  lancamentos: LancamentoCusto[]
  /** null = usuário sem permissão de ver custo (valores ocultos por inteiro). */
  composicao: ComposicaoCusto | null
  indicadores: IndicadoresPreco | null
  eventos: EventoComercial[]
  vendas: VendaComercial[]
}

export type TituloOrigem = {
  id: string; descricao: string; status: string; vencimento: string | null; numeroDocumento: string | null
  valorCentavos: number; quantidadeTotal: number | null; usadoCentavos: number; usadoQuantidade: number
}

export type ProdutoBusca = { id: string; name: string; sku: string | null; barcode: string | null; stock: number }

/** Mesma fonte de busca do Cadastro de Produtos (`GET /api/produtos?q=`), sem rota nova. */
export async function buscarProdutos(storeId: string, q: string, signal?: AbortSignal): Promise<ProdutoBusca[]> {
  const res = await fetch(`/api/produtos?q=${encodeURIComponent(q)}&activeOnly=1`, {
    credentials: "same-origin",
    cache: "no-store",
    headers: { [ASSISTEC_LOJA_HEADER]: storeId },
    signal,
  })
  const data = (await res.json().catch(() => null)) as { produtos?: ProdutoBusca[]; error?: string } | null
  if (!res.ok) throw new ApiError(data?.error ?? (res.status === 403 ? "Sem permissão para consultar produtos." : "Não foi possível buscar produtos."), undefined, res.status)
  return Array.isArray(data?.produtos) ? data.produtos.slice(0, 20) : []
}
