import type { Prisma, PrismaClient } from "@/generated/prisma"

export type MensageriaDb = Prisma.TransactionClient
export type MensageriaClient = PrismaClient

export const codigosTecnicos = [
  "CANAL_INVALIDO", "CANAL_ALTERADO", "INGRESSO_INVALIDO", "REPLAY_DIVERGENTE",
  "VINCULO_AUSENTE", "ACESSO_REVOGADO", "ORIGEM_INVALIDA", "RESULTADO_INVALIDO",
  "CONFIG_INVALIDA", "TEMPORARIO", "REJEICAO_429", "AUTH_401_403", "PAYLOAD_PERMANENTE",
  "POISON_JOB", "TIMEOUT", "HTTP_5XX", "EXTERNO_AMBIGUO", "ENVIO_INCERTO",
  "LEASE_PERDIDA", "LEASE_RECUPERADA", "LIMITE_TENTATIVAS", "PRAZO_ESGOTADO",
  "STAGING_PRIVADO", "ENVIO_ACEITO", "ENTREGA_CONFIRMADA", "NAO_ENVIADO_COMPROVADO",
  "REPROCESSAMENTO_AUTORIZADO", "OPERADOR_NEGADO", "DB_INDISPONIVEL", "WORKER_PARADO",
] as const
export type CodigoTecnico = typeof codigosTecnicos[number]

/** Nunca carregar mensagem/cause de erro de provider ou de SQL para logs. */
export class MensageriaError extends Error {
  constructor(readonly codigo: CodigoTecnico) { super(codigo); this.name = "MensageriaError" }
}
export function codigoRedigido(error: unknown): CodigoTecnico {
  return error instanceof MensageriaError && codigosTecnicos.includes(error.codigo)
    ? error.codigo : "DB_INDISPONIVEL"
}

export type VinculoVerificado = Readonly<{ userId: string; bindingRef: string; versao: number }>
/** G007 fornecerá este port. Ausência nunca vira owner global ou sessão de browser. */
export type VerificadorVinculo = (input: Readonly<{
  canalId: string; phoneNumberId: string; remetenteE164: string;
}>, tx: MensageriaDb) => Promise<VinculoVerificado | null>

export function exigirId(value: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_.:@-]{1,260}$/.test(value)) throw new MensageriaError("INGRESSO_INVALIDO")
  return value
}
export const e164 = /^\+[1-9][0-9]{7,14}$/
