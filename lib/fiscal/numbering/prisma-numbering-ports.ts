/**
 * Portas de numeração fiscal sobre Prisma (GOAL_008) — adapter de I/O.
 *
 * Liga o orquestrador PURO (`allocateFiscalNumber`) ao banco. O coração da concorrência
 * segura é `reserveNextNumber`: um UPDATE atômico `proximoNumero = proximoNumero + 1`
 * (linha travada pelo Postgres). O número reservado é o valor ANTERIOR ao incremento.
 *
 * DORMENTE: só toca `SerieFiscal` (contador) e `NotaFiscal` (serieFiscalId/serie/numero).
 * NÃO emite XML/DANFE, NÃO acessa SEFAZ, NÃO toca PDV/Caixa/Financeiro/Estoque/Produto.
 */
import { prisma } from "@/lib/prisma"
import type { AmbienteFiscal, ModeloFiscal } from "@/generated/prisma"
import type { FiscalNumberingPorts, NumberingBindResult } from "./numbering.types"

/** Subconjunto estrutural do Prisma usado pela numeração (permite injeção em teste). */
export type NumberingPrismaClient = {
  notaFiscal: {
    findFirst: (args: unknown) => Promise<{
      id: string
      storeId: string
      vendaId: string
      modelo: unknown
      ambiente: unknown
      serie: number | null
      numero: number | null
      serieFiscalId: string | null
    } | null>
    update: (args: unknown) => Promise<unknown>
  }
  serieFiscal: {
    findFirst: (args: unknown) => Promise<{
      id: string
      serie: number
      modelo: unknown
      ambiente: unknown
    } | null>
    update: (args: unknown) => Promise<{ proximoNumero: number; serie: number }>
  }
}

function errorCode(e: unknown): string | undefined {
  return (e as { code?: string } | null)?.code
}

/**
 * Cria as portas de numeração ligadas ao Prisma. `client` é injetável para testes
 * (default = singleton `prisma`).
 */
export function createPrismaFiscalNumberingPorts(
  client: NumberingPrismaClient = prisma as unknown as NumberingPrismaClient,
): FiscalNumberingPorts {
  return {
    getNota: async ({ storeId, notaFiscalId }) => {
      const n = await client.notaFiscal.findFirst({
        where: { id: notaFiscalId, storeId, vigente: true },
        select: {
          id: true,
          storeId: true,
          vendaId: true,
          modelo: true,
          ambiente: true,
          serie: true,
          numero: true,
          serieFiscalId: true,
        },
      })
      if (!n) return null
      return {
        id: n.id,
        storeId: n.storeId,
        vendaId: n.vendaId,
        modelo: String(n.modelo ?? ""),
        ambiente: String(n.ambiente ?? ""),
        serie: n.serie ?? null,
        numero: n.numero ?? null,
        serieFiscalId: n.serieFiscalId ?? null,
      }
    },

    findActiveSerie: async ({ storeId, modelo, ambiente, serie }) => {
      const modeloEnum = modelo as ModeloFiscal
      const ambienteEnum = ambiente as AmbienteFiscal
      const where =
        serie != null
          ? { storeId, modelo: modeloEnum, ambiente: ambienteEnum, serie, ativo: true }
          : { storeId, modelo: modeloEnum, ambiente: ambienteEnum, ativo: true }
      // Quando a nota não fixa a série, escolhe deterministicamente a menor série ativa.
      const s = await client.serieFiscal.findFirst({ where, orderBy: { serie: "asc" } })
      if (!s) return null
      return { id: s.id, serie: s.serie, modelo: String(s.modelo ?? ""), ambiente: String(s.ambiente ?? "") }
    },

    reserveNextNumber: async ({ serieFiscalId }) => {
      // INCREMENTO ATÔMICO (row-locked): SET proximoNumero = proximoNumero + 1.
      // O retorno é o valor PÓS-incremento; o número reservado é o anterior.
      const r = await client.serieFiscal.update({
        where: { id: serieFiscalId },
        data: { proximoNumero: { increment: 1 } },
        select: { proximoNumero: true, serie: true },
      })
      return { serieFiscalId, serie: r.serie, numero: r.proximoNumero - 1 }
    },

    bindNotaNumero: async ({ notaFiscalId, serieFiscalId, serie, numero }): Promise<NumberingBindResult> => {
      try {
        await client.notaFiscal.update({
          where: { id: notaFiscalId },
          data: { serieFiscalId, serie, numero },
        })
        return { ok: true }
      } catch (e) {
        // P2002 = violação de unicidade (storeId, modelo, serie, numero, ambiente) → colisão de número.
        if (errorCode(e) === "P2002") {
          return { ok: false, conflito: true, mensagem: "Número fiscal já utilizado (colisão de série/número)." }
        }
        return {
          ok: false,
          conflito: false,
          mensagem: e instanceof Error ? e.message : "Falha ao gravar o número na NotaFiscal.",
        }
      }
    },
  }
}
