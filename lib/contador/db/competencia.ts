/**
 * Contador HUB · serviço mínimo de persistência de competência. GOAL 009.
 *
 * Única responsabilidade: `getOrCreateCompetencia` — idempotente e seguro sob
 * concorrência. Não implementa fechamento, reabertura, documentos, pacote nem
 * comentário (fases futuras). Escreve SOMENTE em `ContadorCompetencia` e
 * `ContadorEvento`; nunca em tabela operacional.
 *
 * Cliente injetável (default = singleton `prisma`), espelhando o padrão dos
 * readers (`lib/contador/readers`) e das portas fiscais — mantém o serviço
 * testável sem banco real. Server-only: importa `@/lib/prisma`.
 */
import { prisma, prismaEnsureConnected } from "@/lib/prisma"
import type { Competencia } from "@/lib/contador/competencia"

/** Tipo do evento emitido na criação real de uma competência. */
export const EVENTO_COMPETENCIA_CRIADA = "competencia_criada" as const
/** Ator técnico estável do serviço (não é usuário — origem automática do domínio). */
export const ATOR_SISTEMA_TIPO = "sistema" as const
export const ATOR_SISTEMA_ID = "system:contador-db" as const
export const ORIGEM_SERVICE = "service" as const

/** Faixa operacional razoável de ano (rejeita lixo antes de tocar o Prisma). */
export const ANO_MIN = 2000
export const ANO_MAX = 2100

/** Erro tipado de entrada inválida — nunca chega ao Prisma. */
export class CompetenciaInvalidaError extends Error {
  readonly code = "COMPETENCIA_INVALIDA" as const
  constructor(message: string) {
    super(message)
    this.name = "CompetenciaInvalidaError"
  }
}

/** Projeção retornada da competência (subconjunto estável dos campos do model). */
export type CompetenciaPersistida = {
  id: string
  storeId: string
  ano: number
  mes: number
  status: string
  versao: number
  createdAt: Date
  updatedAt: Date
}

export type GetOrCreateResult = {
  competencia: CompetenciaPersistida
  /** `true` somente quando esta chamada criou a linha (e emitiu o evento). */
  criada: boolean
}

/**
 * Porta Prisma mínima usada pelo serviço. Injetável para testes; o `$transaction`
 * de callback recebe um cliente da mesma forma (subconjunto de `Prisma.TransactionClient`).
 */
export interface CompetenciaDbClient {
  contadorCompetencia: {
    findUnique(args: {
      where: { storeId_ano_mes: { storeId: string; ano: number; mes: number } }
    }): Promise<CompetenciaPersistida | null>
    create(args: {
      data: { storeId: string; ano: number; mes: number }
    }): Promise<CompetenciaPersistida>
  }
  contadorEvento: {
    create(args: {
      data: {
        storeId: string
        competenciaId: string
        tipo: string
        atorTipo: string
        atorId: string
        origem: string
        metadata: Record<string, unknown>
      }
    }): Promise<{ id: string }>
  }
  $transaction<T>(fn: (tx: CompetenciaDbClient) => Promise<T>): Promise<T>
}

/**
 * Retorna a competência (loja/ano/mês) criando-a apenas se ainda não existir.
 *
 * - Idempotente: segunda chamada cai no caminho de leitura, sem novo evento.
 * - Concorrência-segura: se duas chamadas correrem juntas, a que perde a corrida
 *   captura o `P2002` da unique `(storeId, ano, mes)`, relê e retorna a mesma
 *   competência — sem duplicar linha nem evento, sem vazar o erro ao chamador.
 * - `P2002` de constraint NÃO relacionada é repropagado.
 *
 * @param client injetável (default = `prisma`). Passe um mock em testes.
 */
export async function getOrCreateCompetencia(
  storeId: string,
  entrada: { ano: number; mes: number },
  deps: { client?: CompetenciaDbClient } = {},
): Promise<GetOrCreateResult> {
  const chave = validarEntrada(storeId, entrada)
  const client = deps.client ?? (await resolverClientePadrao())

  const existente = await buscar(client, chave)
  if (existente) return { competencia: existente, criada: false }

  try {
    const criada = await criarComEvento(client, chave)
    return { competencia: criada, criada: true }
  } catch (e) {
    if (isCompetenciaUniqueViolation(e)) {
      // Corrida concorrente: outra chamada criou primeiro. Relê e retorna sem novo evento.
      const apos = await buscar(client, chave)
      if (apos) return { competencia: apos, criada: false }
    }
    throw e
  }
}

/* ─────────────────────────── internos ─────────────────────────── */

type ChaveCompetencia = { storeId: string; ano: number; mes: number }

function validarEntrada(storeId: unknown, entrada: { ano: unknown; mes: unknown }): ChaveCompetencia {
  if (typeof storeId !== "string" || storeId.trim() === "") {
    throw new CompetenciaInvalidaError("storeId é obrigatório.")
  }
  const { ano, mes } = entrada
  if (typeof ano !== "number" || !Number.isInteger(ano) || ano < ANO_MIN || ano > ANO_MAX) {
    throw new CompetenciaInvalidaError(`ano inválido: esperado inteiro entre ${ANO_MIN} e ${ANO_MAX}.`)
  }
  if (typeof mes !== "number" || !Number.isInteger(mes) || mes < 1 || mes > 12) {
    throw new CompetenciaInvalidaError("mês inválido: esperado inteiro entre 1 e 12.")
  }
  return { storeId, ano, mes }
}

function buscar(client: CompetenciaDbClient, chave: ChaveCompetencia): Promise<CompetenciaPersistida | null> {
  return client.contadorCompetencia.findUnique({ where: { storeId_ano_mes: chave } })
}

function criarComEvento(client: CompetenciaDbClient, chave: ChaveCompetencia): Promise<CompetenciaPersistida> {
  return client.$transaction(async (tx) => {
    const competencia = await tx.contadorCompetencia.create({ data: chave })
    await tx.contadorEvento.create({
      data: {
        storeId: chave.storeId,
        competenciaId: competencia.id,
        tipo: EVENTO_COMPETENCIA_CRIADA,
        atorTipo: ATOR_SISTEMA_TIPO,
        atorId: ATOR_SISTEMA_ID,
        origem: ORIGEM_SERVICE,
        // Metadata saneada: apenas ano/mês. Sem PII, sem payload bruto, sem segredo.
        metadata: { ano: chave.ano, mes: chave.mes },
      },
    })
    return competencia
  })
}

/**
 * `true` somente para violação da unique `(storeId, ano, mes)` da competência.
 * Constraint não relacionada → `false` (o chamador repropaga o erro).
 */
function isCompetenciaUniqueViolation(e: unknown): boolean {
  const err = e as { code?: unknown; meta?: { target?: unknown } } | null
  if (!err || err.code !== "P2002") return false
  const target = err.meta?.target
  if (target == null) return true // única unique possível neste caminho de criação
  const alvo = Array.isArray(target) ? target.join(",") : String(target)
  return /storeId|ano|mes|contador_competencias_storeId_ano_mes/.test(alvo)
}

async function resolverClientePadrao(): Promise<CompetenciaDbClient> {
  await prismaEnsureConnected()
  return prisma as unknown as CompetenciaDbClient
}

/** Re-export para conveniência de chamadores (mesmo contrato do domínio). */
export type { Competencia }
