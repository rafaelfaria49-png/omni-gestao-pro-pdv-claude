"use server"

import type { Prisma } from "@/generated/prisma"
import type { OrdemServico, OSStatus } from "@/types/os"
import { prisma, withPrismaSafe } from "@/lib/prisma"
import { hydrateOSRows, type PrismaOSRow } from "@/lib/operacoes/services/hydration-service"
import { expirarGarantiasVencidas } from "@/lib/operacoes/services/garantia-operacional-service"

/** Payload lido do Prisma + hidratação (mesmo shape usado pelo Operações HUB). */
export type OrdemServicoLeitura = OrdemServico & { operacaoStatus?: OSStatus }

export type ListOrdensFilters = {
  /** Filtro opcional pelo enum colapsado do Prisma. */
  statusPrisma?: "Aberto" | "EmAnalise" | "Pronto" | "Entregue"
  /** Busca simples em número e defeito (colunas indexadas / texto). */
  q?: string
}

function normalizeLojaId(lojaId: string): string | null {
  const id = (lojaId ?? "").trim()
  return id.length > 0 ? id : null
}

type DbOrdemRow = {
  id: string
  storeId: string
  numero: string | null
  clienteId: string | null
  defeito: string
  status: "Aberto" | "EmAnalise" | "Pronto" | "Entregue"
  payload: unknown
  createdAt: Date
  updatedAt: Date
  valorTotal: unknown
  valorBase: unknown
  cliente?: { id: string; name: string; phone: string | null; email: string | null } | null
  itens?: {
    id: string
    tipo: string
    descricao: string
    quantidade: number
    precoUnitario: number
    produtoId: string | null
  }[]
  garantiasOperacionais?: {
    id: string
    storeId: string
    ordemServicoId: string
    prazoDias: number
    cobertura: string
    observacoes: string
    dataInicio: Date
    dataFim: Date
    status: string
    createdAt: Date
  }[]
}

function mapRows(rows: DbOrdemRow[]): PrismaOSRow[] {
  return rows.map((r) => ({
    id: r.id,
    storeId: r.storeId,
    numero: r.numero ?? null,
    clienteId: r.clienteId ?? null,
    cliente: r.cliente
      ? { id: r.cliente.id, nome: r.cliente.name }
      : undefined,
    defeito: r.defeito ?? "",
    status: r.status,
    payload: r.payload as unknown,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    valorTotal: Number(r.valorTotal ?? 0) || 0,
    valorBase: Number(r.valorBase ?? 0) || 0,
    itensPersistidos:
      Array.isArray(r.itens) && r.itens.length > 0
        ? r.itens.map((it) => ({
            id: it.id,
            tipo: it.tipo,
            descricao: it.descricao,
            quantidade: it.quantidade,
            precoUnitario: it.precoUnitario,
            produtoId: it.produtoId ?? null,
          }))
        : undefined,
    garantiasOperacionais: r.garantiasOperacionais,
  }))
}

/**
 * Listagem real (Prisma) para o Operações HUB — somente leitura.
 * Não lança: em falha de DB retorna array vazio.
 */
export async function listOrdens(lojaId: string, filters?: ListOrdensFilters): Promise<OrdemServicoLeitura[]> {
  const storeId = normalizeLojaId(lojaId)
  if (!storeId) return []

  const q = (filters?.q ?? "").trim()

  const rows = await withPrismaSafe(
    async (db) => {
      const where: Prisma.OrdemServicoWhereInput = { storeId }
      if (filters?.statusPrisma !== undefined) {
        where.status = filters.statusPrisma
      }
      if (q.length > 0) {
        where.OR = [
          { numero: { contains: q, mode: "insensitive" } },
          { defeito: { contains: q, mode: "insensitive" } },
        ]
      }
      return db.ordemServico.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        take: 500,
        include: { cliente: true },
      }) as Promise<DbOrdemRow[]>
    },
    [] as DbOrdemRow[]
  )

  return hydrateOSRows<OrdemServicoLeitura>(mapRows(rows as DbOrdemRow[]))
}

/**
 * Uma OS por id + loja (multi-tenant). Somente leitura.
 *
 * `opts.readOnly` (default `false`): quando `true`, NÃO executa a manutenção de garantias vencidas
 * (`expirarGarantiasVencidas`, que é um `updateMany`). Caminho usado pela Operações V4 Preview, que
 * precisa ser estritamente sem efeito colateral de escrita. O fluxo normal (V3 e demais leitores)
 * mantém a expiração automática inalterada.
 */
export async function getOrdem(
  lojaId: string,
  osId: string,
  opts?: { readOnly?: boolean },
): Promise<OrdemServicoLeitura | null> {
  const storeId = normalizeLojaId(lojaId)
  const id = (osId ?? "").trim()
  if (!storeId || !id) return null

  const row = await withPrismaSafe(
    async (db) => {
      // Preview (readOnly) é estritamente leitura: pula a manutenção de garantias (write).
      if (!opts?.readOnly) {
        await expirarGarantiasVencidas(db, { storeId, ordemServicoId: id })
      }
      return db.ordemServico.findFirst({
        where: { id, storeId },
        include: {
          itens: { orderBy: { id: "asc" } },
          garantiasOperacionais: { orderBy: { createdAt: "desc" } },
        },
      })
    },
    null as (DbOrdemRow & { id: string }) | null,
  )

  if (!row) return null
  const [out] = hydrateOSRows<OrdemServicoLeitura>(mapRows([row as DbOrdemRow]))
  return out ?? null
}
