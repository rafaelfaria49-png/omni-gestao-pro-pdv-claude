"use server"

import type { Prisma } from "@/generated/prisma"
import type { OrdemServico, OSStatus } from "@/types/os"
import { prisma, withPrismaSafe } from "@/lib/prisma"
import { hydrateOSRows } from "@/lib/operacoes/services/hydration-service"

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
  itens?: {
    id: string
    tipo: string
    descricao: string
    quantidade: number
    precoUnitario: number
    produtoId: string | null
  }[]
}

function mapRows(rows: DbOrdemRow[]): PrismaOSRow[] {
  return rows.map((r) => ({
    id: r.id,
    storeId: r.storeId,
    numero: r.numero ?? null,
    clienteId: r.clienteId ?? null,
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
      }) as Promise<DbOrdemRow[]>
    },
    [] as DbOrdemRow[]
  )

  return hydrateOSRows<OrdemServicoLeitura>(mapRows(rows as DbOrdemRow[]))
}

/**
 * Uma OS por id + loja (multi-tenant). Somente leitura.
 */
export async function getOrdem(lojaId: string, osId: string): Promise<OrdemServicoLeitura | null> {
  const storeId = normalizeLojaId(lojaId)
  const id = (osId ?? "").trim()
  if (!storeId || !id) return null

  const row = await withPrismaSafe(
    (db) =>
      db.ordemServico.findFirst({
        where: { id, storeId },
        include: {
          itens: { orderBy: { id: "asc" } },
        },
      }),
    null as (DbOrdemRow & { id: string }) | null,
  )

  if (!row) return null
  const [out] = hydrateOSRows<OrdemServicoLeitura>(mapRows([row as DbOrdemRow]))
  return out ?? null
}
