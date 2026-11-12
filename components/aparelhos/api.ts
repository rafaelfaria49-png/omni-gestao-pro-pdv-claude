"use client"

/** Cliente HTTP de /api/aparelhos — loja sempre explícita no header (escrita exige). */
import type { AparelhoDTO } from "@/lib/aparelhos/service"
import type { PoliticaAparelhos } from "@/lib/aparelhos/policy"
import type { AparelhoPermissions } from "@/lib/aparelhos/permissions"

export type { AparelhoDTO, PoliticaAparelhos, AparelhoPermissions }

export class ApiError extends Error {
  constructor(message: string, readonly code: string | undefined, readonly status: number, readonly field?: string) {
    super(message)
  }
}

export async function apiAparelhos<T>(storeId: string, path: string, init?: { method?: string; body?: unknown; signal?: AbortSignal }): Promise<T> {
  const res = await fetch(`/api/aparelhos${path}`, {
    method: init?.method ?? "GET",
    headers: { "x-assistec-loja-id": storeId, ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}) },
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

export type Resumo = {
  ok: true
  emEstoque: number; novos: number; usados: number; reservados: number; emPreparo: number; aquisicoesPendentes: number
  vendidosPeriodo: number; receitaPeriodo: number; valorReservados: number
  custoEstoque: number | null; custoNovos: number | null; custoUsados: number | null; resultadoPeriodo: number | null
  politica: PoliticaAparelhos
  permissoes: AparelhoPermissions
}

export type Lista = { ok: true; total: number; page: number; pageSize: number; itens: AparelhoDTO[] }

export type Evento = { id: string; tipo: string; deStatus: string | null; paraStatus: string | null; dados: unknown; operador: string; createdAt: string }

export type Detalhe = {
  ok: true
  aparelho: AparelhoDTO
  produto: { id: string; name: string; stock: number }
  eventos: Evento[]
  fotos: Array<{ id: string; dataUrl: string; legenda: string }>
  vendas: Array<{ id: string; pedidoId: string; numeroGarantia: string; status: string; dataVenda: string; dataEntrega: string; contratualDias: number; coberturaFim: string; precoVenda: number; cliente: string }>
  aquisicao: null | { id: string; protocolo: string; tipo: string; status: string; vendedorNome: string; vendedorDocMascarado: string; documentoOrigemTipo: string; documentoOrigemNumero: string; valorTotal: number | null; formaPagamento: string; pagamentoStatus: string; fornecedor: string }
  ordensServico: Array<{ id: string; numero: string | null; createdAt: string }>
}

export type AquisicaoItem = {
  id: string; protocolo: string; tipo: string; status: string; vendedor: string; vendedorDocMascarado: string
  documentoOrigemTipo: string; documentoOrigemNumero: string; valorTotal: number | null; formaPagamento: string; pagamentoStatus: string
  criadoPorMim: boolean; aprovadaPor: string | null; aprovadaEm: string | null; motivoRecusa: string; createdAt: string
  aparelhos: Array<{ id: string; codigoInterno: string; marca: string; modelo: string; armazenamento: string; cor: string; imei1: string | null; status: string }>
}

export type GarantiaItem = {
  id: string; numeroGarantia: string; pedidoId: string; status: string; dataVenda: string; dataEntrega: string; legalDias: number
  contratualDias: number; contratualFim: string | null; coberturaFim: string; precoVenda: number; cliente: string; vigente: boolean
  aparelho: { id: string; codigoInterno: string; marca: string; modelo: string; armazenamento: string; cor: string; imei1: string | null }
}

export type HistoricoItem = { id: string; tipo: string; deStatus: string | null; paraStatus: string | null; operador: string; createdAt: string; dados: unknown; aparelho: { id: string; codigoInterno: string; marca: string; modelo: string; armazenamento: string } }

/**
 * Abre o documento numa janela própria navegando direto para a URL do servidor: a resposta
 * traz CSP restritiva (sem herdar o contexto do app). Erros aparecem na própria janela.
 */
export async function abrirDocumento(storeId: string, params: Record<string, string>, canal: "hub" | "venda" = "hub"): Promise<void> {
  const q = new URLSearchParams({ ...params, storeId, ...(canal === "venda" ? { canal: "venda" } : {}) })
  const w = window.open(`/api/aparelhos/documentos?${q.toString()}`, "_blank")
  if (!w) throw new ApiError("O navegador bloqueou a janela de impressão. Permita pop-ups para este site.", "POPUP", 0)
}

export async function abrirPrevia(storeId: string, body: Record<string, unknown>): Promise<void> {
  const params: Record<string, string> = { previa: "1" }
  for (const [k, v] of Object.entries(body)) {
    if (v === undefined || v === null || v === "") continue
    params[k] = typeof v === "object" ? JSON.stringify(v) : String(v)
  }
  await abrirDocumento(storeId, params, "venda")
}

/** Reduz a foto no navegador (máx. 1280 px, JPEG ~0,8) para caber no limite de 400 KB. */
export async function reduzirFoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  for (const q of [0.8, 0.65, 0.5]) {
    const url = canvas.toDataURL("image/jpeg", q)
    if (url.length <= 540_000) return url
  }
  throw new ApiError("Foto muito grande mesmo após redução.", "FOTO", 0)
}
