"use server"

import type { Prisma } from "@/generated/prisma"
import type { OrdemServico, OSStatus } from "@/types/os"
import { prisma, withPrismaSafe } from "@/lib/prisma"
import { hydrateOSRows, type PrismaOSRow } from "@/lib/operacoes/services/hydration-service"

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

function mapRows(rows: Awaited<ReturnType<typeof prisma.ordemServico.findMany>>): PrismaOSRow[] {
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
      })
    },
    [] as Awaited<ReturnType<typeof prisma.ordemServico.findMany>>
  )

  return hydrateOSRows<OrdemServicoLeitura>(mapRows(rows))
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
      }),
    null as Awaited<ReturnType<typeof prisma.ordemServico.findFirst>>
  )

  if (!row) return null
  const [out] = hydrateOSRows<OrdemServicoLeitura>(mapRows([row]))
  return out ?? null
}
