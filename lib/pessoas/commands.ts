import { Prisma } from "@/generated/prisma"
import { prisma } from "@/lib/prisma"
import { comandoId, hashComando, PessoasError } from "./domain"
import type { AtorPessoas } from "./scope"

type ResultadoComando = Readonly<{
  empregadorId: string
  entidade: string
  entidadeId: string
  justificativa?: string | null
  campos?: readonly string[]
}>

function codigoPrisma(e: unknown): string | null {
  return typeof e === "object" && e !== null && "code" in e && typeof e.code === "string" ? e.code : null
}

/** A linha de auditoria é também a chave idempotente, sempre na transação de negócio. */
export async function executarComando(
  ator: AtorPessoas,
  acao: string,
  chave: string,
  payload: unknown,
  executar: (tx: Prisma.TransactionClient) => Promise<ResultadoComando>,
  empregadorEsperado?: string,
): Promise<string> {
  const id = comandoId(chave)
  const hash = hashComando({ acao, payload })
  const where = { storeId_atorId_comandoId: { storeId: ator.storeId, atorId: ator.userId, comandoId: id } }
  const conferir = (anterior: { acao: string; payloadHash: string; entidadeId: string; empregadorId: string }) => {
    if (anterior.acao !== acao || anterior.payloadHash !== hash ||
        (empregadorEsperado && anterior.empregadorId !== empregadorEsperado)) {
      throw new PessoasError("IDEMPOTENCIA_CONFLITO", 409)
    }
    return anterior.entidadeId
  }
  const anterior = await prisma.dpAuditoria.findUnique({ where, select: { acao: true, payloadHash: true, entidadeId: true, empregadorId: true } })
  if (anterior) return conferir(anterior)

  for (let tentativa = 1; tentativa <= 3; tentativa += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const visto = await tx.dpAuditoria.findUnique({ where, select: { acao: true, payloadHash: true, entidadeId: true, empregadorId: true } })
        if (visto) return conferir(visto)
        const resultado = await executar(tx)
        if (empregadorEsperado && resultado.empregadorId !== empregadorEsperado) {
          throw new PessoasError("ESCOPO_NEGADO", 403)
        }
        await tx.dpAuditoria.create({
          data: {
            empregadorId: resultado.empregadorId,
            storeId: ator.storeId,
            atorId: ator.userId,
            comandoId: id,
            acao,
            entidade: resultado.entidade,
            entidadeId: resultado.entidadeId,
            payloadHash: hash,
            justificativa: resultado.justificativa ?? null,
            diffSaneado: { campos: resultado.campos ?? [] },
          },
        })
        return resultado.entidadeId
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 20_000 })
    } catch (e) {
      if (e instanceof PessoasError) throw e
      const codigo = codigoPrisma(e)
      if (codigo !== "P2002" && codigo !== "P2034") throw e
      // A transação abortou: replay sempre fora dela, inclusive na última tentativa.
      const replay = await prisma.dpAuditoria.findUnique({ where, select: { acao: true, payloadHash: true, entidadeId: true, empregadorId: true } })
      if (replay) return conferir(replay)
      if (codigo === "P2002") throw new PessoasError("DUPLICIDADE", 409)
      if (tentativa === 3) throw new PessoasError("VERSION_CONFLICT", 409)
    }
  }
  throw new PessoasError("VERSION_CONFLICT", 409)
}
