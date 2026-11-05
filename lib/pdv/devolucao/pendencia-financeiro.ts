/**
 * PDV-F8-FINALIZACAO-COMPLETA-001 — encaminhamento AUDITÁVEL de devoluções pendentes
 * (fila offline legada, recusas definitivas, venda de origem que nunca chegou).
 *
 * O que isto É: um registro append-only em `AuditoriaFinanceira` (tabela existente,
 * sem schema novo) com referência única, valor, categoria e operador autenticado,
 * para o Financeiro tratar manualmente.
 *
 * O que isto NÃO é: lançamento financeiro. Nenhuma `MovimentacaoFinanceira`, nenhum
 * vale, nenhum estoque e nenhuma devolução são criados aqui — reembolso em dinheiro
 * segue BLOQUEADO por política (G-H01..03). Nunca fabrica venda de origem.
 *
 * Idempotência: chave `devolucao-pendencia:{storeId}:{localId}` sob advisory lock
 * transacional — reenvio devolve a MESMA referência, nunca um segundo registro.
 */
import type { Prisma } from "@/generated/prisma"
import { fatorValorPago } from "@/lib/pdv/devolucao/registrar-devolucao"
import { saleProductKeyResolver } from "@/lib/pdv/devolucao/product-keys"

export const PENDENCIA_ENTIDADE = "devolucao_pdv_pendencia"
export const PENDENCIA_ACAO = "encaminhar_financeiro"

export const CATEGORIAS_PENDENCIA = ["DINHEIRO_ENTREGUE", "VALE_EMITIDO", "INTENCAO_SEM_EFEITO"] as const
export type CategoriaPendencia = (typeof CATEGORIAS_PENDENCIA)[number]

export const ESTADOS_ENCAMINHAVEIS = ["RECUSA_DEFINITIVA", "BLOQUEIO_PERSISTENTE", "AGUARDANDO_VENDA_ORIGEM"] as const
export type EstadoEncaminhavel = (typeof ESTADOS_ENCAMINHAVEIS)[number]

export type EncaminharPendenciaInput = {
  storeId: string
  localId: string
  vendaLocalId: string
  categoria: CategoriaPendencia
  estado: EstadoEncaminhavel
  /** Valor que o TERMINAL diz ter entregue/emitido — só declaração, nunca autoridade. */
  valorDeclarado: number
  motivoRecusa: string
  justificativa: string
  /** Operador autenticado (sessão do servidor), nunca o rótulo do navegador. */
  usuarioId: string
  usuarioNome: string
  itens: Array<{ inventoryId?: string; produtoId?: string; nome?: string; quantidade: number }>
}

export type PendenciaRegistro = {
  ref: string
  idempotente: boolean
  localId: string
  vendaLocalId: string
  categoria: string
  estado: string
  valorDeclarado: number
  /** Valor recalculado da venda no servidor; `null` quando a venda de origem não existe. */
  valorReferenciaServidor: number | null
  vendaOrigemNoServidor: boolean
  operador: string
  at: string
}

export class PendenciaError extends Error {
  constructor(readonly code: "DEVOLUCAO_JA_GRAVADA" | "JUSTIFICATIVA_OBRIGATORIA", message: string) {
    super(message)
    this.name = "PendenciaError"
  }
}

const chave = (storeId: string, localId: string) => `devolucao-pendencia:${storeId}:${localId}`

const arred = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100

type Depois = Omit<PendenciaRegistro, "ref" | "idempotente" | "at">

function toRegistro(row: { id: string; createdAt: Date; depois: unknown }, idempotente: boolean): PendenciaRegistro {
  const d = (row.depois ?? {}) as Partial<Depois>
  return {
    ref: row.id,
    idempotente,
    localId: String(d.localId ?? ""),
    vendaLocalId: String(d.vendaLocalId ?? ""),
    categoria: String(d.categoria ?? ""),
    estado: String(d.estado ?? ""),
    valorDeclarado: arred(Number(d.valorDeclarado ?? 0)),
    valorReferenciaServidor: typeof d.valorReferenciaServidor === "number" ? d.valorReferenciaServidor : null,
    vendaOrigemNoServidor: d.vendaOrigemNoServidor === true,
    operador: String(d.operador ?? ""),
    at: row.createdAt.toISOString(),
  }
}

/** Valor que o servidor creditaria pelos itens (mesma regra do escritor), sem gravar nada. */
async function valorReferencia(
  tx: Prisma.TransactionClient,
  storeId: string,
  vendaLocalId: string,
  itens: EncaminharPendenciaInput["itens"],
): Promise<number | null> {
  const venda = await tx.venda.findFirst({
    where: { storeId, pedidoId: vendaLocalId },
    select: { total: true, payload: true, itens: { select: { id: true, inventoryId: true, nome: true, quantidade: true, lineTotal: true } } },
  })
  if (!venda) return null
  const keys = await saleProductKeyResolver(tx, storeId, venda, itens.flatMap((i) => [i.inventoryId, i.produtoId]))
  const fator = fatorValorPago(venda.total, venda.itens)
  let total = 0
  for (const req of itens) {
    const k = keys.resolve(req.inventoryId, req.produtoId)
    if (!k) continue
    const linhas = venda.itens.filter((i) => (i.inventoryId ?? "").trim() === k)
    const q = linhas.reduce((s, i) => s + (i.quantidade || 0), 0)
    const lt = linhas.reduce((s, i) => s + (i.lineTotal || 0), 0)
    if (q > 0) total += (lt / q) * Math.min(q, Math.max(0, Math.round(req.quantidade))) * fator
  }
  return arred(total)
}

export async function encaminharPendenciaDevolucao(
  tx: Prisma.TransactionClient,
  input: EncaminharPendenciaInput,
): Promise<PendenciaRegistro> {
  const key = chave(input.storeId, input.localId)
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`

  const existente = await tx.auditoriaFinanceira.findFirst({
    where: { storeId: input.storeId, entidade: PENDENCIA_ENTIDADE, entidadeId: key },
    select: { id: true, createdAt: true, depois: true },
    orderBy: { createdAt: "asc" },
  })
  if (existente) return toRegistro(existente, true)

  // Devolução que o servidor JÁ gravou não é pendência: é real (vale/estoque já feitos).
  const gravada = await tx.devolucaoVenda.findUnique({
    where: { storeId_localId: { storeId: input.storeId, localId: input.localId } },
    select: { id: true },
  })
  if (gravada) {
    throw new PendenciaError(
      "DEVOLUCAO_JA_GRAVADA",
      `A devolução ${input.localId} já está gravada no servidor — não há pendência a encaminhar.`,
    )
  }
  if (!input.justificativa.trim()) {
    throw new PendenciaError("JUSTIFICATIVA_OBRIGATORIA", "Descreva o que aconteceu com o cliente (justificativa obrigatória).")
  }

  const ref = await valorReferencia(tx, input.storeId, input.vendaLocalId, input.itens)
  const depois: Depois = {
    localId: input.localId,
    vendaLocalId: input.vendaLocalId,
    categoria: input.categoria,
    estado: input.estado,
    valorDeclarado: arred(input.valorDeclarado),
    valorReferenciaServidor: ref,
    vendaOrigemNoServidor: ref !== null,
    operador: input.usuarioNome,
  }
  const row = await tx.auditoriaFinanceira.create({
    data: {
      storeId: input.storeId,
      entidade: PENDENCIA_ENTIDADE,
      entidadeId: key,
      acao: PENDENCIA_ACAO,
      antes: { motivoRecusa: input.motivoRecusa.slice(0, 500), itens: input.itens.slice(0, 50) } as Prisma.InputJsonValue,
      depois: { ...depois, justificativa: input.justificativa.trim().slice(0, 1000) } as Prisma.InputJsonValue,
      usuarioId: input.usuarioId,
      usuarioNome: input.usuarioNome,
    },
    select: { id: true, createdAt: true, depois: true },
  })
  return toRegistro(row, false)
}

export async function listarPendenciasEncaminhadas(
  client: Pick<Prisma.TransactionClient, "auditoriaFinanceira">,
  storeId: string,
  limit = 100,
): Promise<PendenciaRegistro[]> {
  const rows = await client.auditoriaFinanceira.findMany({
    where: { storeId, entidade: PENDENCIA_ENTIDADE },
    select: { id: true, createdAt: true, depois: true },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(1, limit), 500),
  })
  return rows.map((r) => toRegistro(r, true))
}
