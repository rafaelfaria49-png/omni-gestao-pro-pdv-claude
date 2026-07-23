/**
 * Portas de numeração fiscal sobre Prisma (GOAL_010) — adapter de I/O.
 *
 * Liga o orquestrador PURO (`allocateFiscalNumber`) ao banco. O coração da concorrência
 * segura é `reserveNextNumber`: um UPDATE atômico e condicionado pela chave completa
 * `(storeId, modelo, serie, ambiente)`, atividade e faixa do contador. O vínculo na nota usa
 * compare-and-swap (`numero IS NULL`) para impedir overwrite sob concorrência.
 *
 * DORMENTE: só toca `SerieFiscal` (contador) e `NotaFiscal` (serieFiscalId/serie/numero).
 * NÃO emite XML/DANFE, NÃO acessa SEFAZ, NÃO toca PDV/Caixa/Financeiro/Estoque/Produto.
 */
import { prisma } from "@/lib/prisma"
import type { AmbienteFiscal, ModeloFiscal } from "@/generated/prisma"
import {
  FISCAL_NUMERO_MAXIMO,
  FISCAL_NUMERO_MINIMO,
  type FiscalNumberingPorts,
  type NumberingBindResult,
  type NumberingReservationFailure,
} from "./numbering.types"

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
      localKey: string | null
    } | null>
    update: (args: unknown) => Promise<unknown>
  }
  serieFiscal: {
    findFirst: (args: unknown) => Promise<{
      id: string
      storeId: string
      serie: number
      modelo: unknown
      ambiente: unknown
      ativo: boolean
      proximoNumero: number
    } | null>
    update: (args: unknown) => Promise<{
      id: string
      storeId: string
      proximoNumero: number
      serie: number
      modelo: unknown
      ambiente: unknown
      ativo: boolean
    }>
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
          localKey: true,
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
        localKey: n.localKey ?? null,
      }
    },

    findActiveSerie: async ({ storeId, modelo, ambiente, serie, serieFiscalId }) => {
      const modeloEnum = modelo as ModeloFiscal
      const ambienteEnum = ambiente as AmbienteFiscal
      const where = serieFiscalId
        ? { id: serieFiscalId }
        : serie != null
          ? { storeId, modelo: modeloEnum, ambiente: ambienteEnum, serie }
          : { storeId, modelo: modeloEnum, ambiente: ambienteEnum, ativo: true }
      // Sem série previamente vinculada, usa a menor série ATIVA da configuração da própria loja;
      // não há literal/fallback global. Com id/série explícitos, retorna também inativa/incompatível
      // para que o orquestrador produza o erro específico antes do incremento.
      const found = await client.serieFiscal.findFirst({
        where,
        orderBy: { serie: "asc" },
        select: {
          id: true,
          storeId: true,
          modelo: true,
          ambiente: true,
          serie: true,
          ativo: true,
          proximoNumero: true,
        },
      })
      if (!found) return null
      return {
        id: found.id,
        storeId: found.storeId,
        serie: found.serie,
        modelo: String(found.modelo ?? ""),
        ambiente: String(found.ambiente ?? ""),
        ativo: found.ativo,
        proximoNumero: found.proximoNumero,
      }
    },

    reserveNextNumber: async ({ serieFiscalId, storeId, modelo, ambiente, serie }) => {
      const modeloEnum = modelo as ModeloFiscal
      const ambienteEnum = ambiente as AmbienteFiscal
      try {
        // UPDATE único/atômico. O Postgres serializa concorrentes na mesma linha; linhas de
        // loja/modelo/série/ambiente diferentes não compartilham contador nem lock.
        const reserved = await client.serieFiscal.update({
          where: {
            id: serieFiscalId,
            storeId,
            modelo: modeloEnum,
            ambiente: ambienteEnum,
            serie,
            ativo: true,
            proximoNumero: {
              gte: FISCAL_NUMERO_MINIMO,
              lte: FISCAL_NUMERO_MAXIMO,
            },
          },
          data: { proximoNumero: { increment: 1 } },
          select: {
            id: true,
            storeId: true,
            modelo: true,
            ambiente: true,
            serie: true,
            ativo: true,
            proximoNumero: true,
          },
        })
        return {
          serieFiscalId: reserved.id || serieFiscalId,
          serie: reserved.serie,
          numero: reserved.proximoNumero - 1,
        }
      } catch (e) {
        const code = errorCode(e)
        if (code === "P2034" || code === "P2028") {
          return {
            ok: false,
            errorCode: "reserva_conflito",
            mensagem: "Conflito transitório ao reservar número fiscal.",
            retryable: true,
          } satisfies NumberingReservationFailure
        }
        if (code !== "P2025") {
          return {
            ok: false,
            errorCode: "reserva_falhou",
            mensagem: e instanceof Error ? e.message : "Falha ao reservar número fiscal.",
          } satisfies NumberingReservationFailure
        }

        const current = await client.serieFiscal.findFirst({
          where: { id: serieFiscalId },
          select: {
            id: true,
            storeId: true,
            modelo: true,
            ambiente: true,
            serie: true,
            ativo: true,
            proximoNumero: true,
          },
        })
        let failure: NumberingReservationFailure
        if (!current) {
          failure = { ok: false, errorCode: "serie_nao_encontrada", mensagem: "Série fiscal não encontrada." }
        } else if (current.storeId !== storeId) {
          failure = { ok: false, errorCode: "serie_outra_loja", mensagem: "Série fiscal pertence a outra loja." }
        } else if (String(current.modelo) !== modelo) {
          failure = { ok: false, errorCode: "modelo_incompativel", mensagem: "Modelo fiscal incompatível." }
        } else if (String(current.ambiente) !== ambiente) {
          failure = { ok: false, errorCode: "ambiente_incompativel", mensagem: "Ambiente fiscal incompatível." }
        } else if (current.serie !== serie) {
          failure = { ok: false, errorCode: "serie_invalida", mensagem: "Número da série fiscal incompatível." }
        } else if (!current.ativo) {
          failure = { ok: false, errorCode: "serie_inativa", mensagem: "Série fiscal inativa." }
        } else if (!Number.isSafeInteger(current.proximoNumero) || current.proximoNumero < FISCAL_NUMERO_MINIMO) {
          failure = { ok: false, errorCode: "sequencia_invalida", mensagem: "Próximo número fiscal inválido." }
        } else if (current.proximoNumero > FISCAL_NUMERO_MAXIMO) {
          failure = { ok: false, errorCode: "sequencia_esgotada", mensagem: "Série fiscal esgotada." }
        } else {
          failure = { ok: false, errorCode: "reserva_falhou", mensagem: "A reserva atômica foi rejeitada." }
        }
        return failure
      }
    },

    bindNotaNumero: async ({
      notaFiscalId,
      storeId,
      modelo,
      ambiente,
      serieFiscalId,
      serie,
      numero,
    }): Promise<NumberingBindResult> => {
      try {
        await client.notaFiscal.update({
          where: {
            id: notaFiscalId,
            storeId,
            modelo: modelo as ModeloFiscal,
            ambiente: ambiente as AmbienteFiscal,
            vigente: true,
            numero: null,
            OR: [{ serie: null }, { serie }],
          },
          data: { serieFiscalId, serie, numero },
        })
        return { ok: true }
      } catch (e) {
        // P2002 = violação de unicidade (storeId, modelo, serie, numero, ambiente) → colisão de número.
        if (errorCode(e) === "P2002") {
          return {
            ok: false,
            conflito: true,
            motivo: "numero_em_uso",
            mensagem: "Número fiscal já utilizado na mesma loja/modelo/série/ambiente.",
          }
        }
        // P2025 = o CAS não encontrou a nota ainda sem número; outra chamada pode tê-la numerado.
        if (errorCode(e) === "P2025") {
          return {
            ok: false,
            conflito: false,
            motivo: "nota_ja_numerada",
            mensagem: "NotaFiscal já numerada por outra chamada ou fora do contexto esperado.",
          }
        }
        return {
          ok: false,
          conflito: false,
          motivo: "falha",
          mensagem: e instanceof Error ? e.message : "Falha ao gravar o número na NotaFiscal.",
        }
      }
    },
  }
}
