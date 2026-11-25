import type { CodigoTecnico } from "./messaging-types"

export type FalhaTransporte =
  | { tipo: "TEMPORARIA_LOCAL" }
  | { tipo: "HTTP"; status: number; rejeicaoComprovada?: boolean; retryAfterMs?: number }
  | { tipo: "TIMEOUT" | "CONFIG" | "PAYLOAD" | "POISON" | "DESCONHECIDA" }
export type DecisaoFalha = { acao: "RETRY" | "DLQ" | "INCERTO"; codigo: CodigoTecnico; esperaMs: number }

/** Jitter injetável nos testes; prazo/contadores e comparação de datas são do DB. */
export function decidirFalha(falha: FalhaTransporte, tentativa: number, iniciouEnvio: boolean, aleatorio = Math.random()): DecisaoFalha {
  const fim = (acao: DecisaoFalha["acao"], codigo: CodigoTecnico, esperaMs = 0): DecisaoFalha => ({ acao, codigo, esperaMs })
  if (falha.tipo === "CONFIG") return fim("DLQ", "CONFIG_INVALIDA")
  if (falha.tipo === "PAYLOAD") return fim("DLQ", "PAYLOAD_PERMANENTE")
  if (falha.tipo === "POISON") return fim("DLQ", "POISON_JOB")
  if (falha.tipo === "HTTP" && [401, 403].includes(falha.status)) return fim("DLQ", "AUTH_401_403")
  if (falha.tipo === "HTTP" && falha.status >= 400 && falha.status < 500 && falha.status !== 429) return fim("DLQ", "PAYLOAD_PERMANENTE")
  const retry429 = falha.tipo === "HTTP" && falha.status === 429 && falha.rejeicaoComprovada === true
  if (iniciouEnvio && !retry429 && falha.tipo !== "TEMPORARIA_LOCAL") {
    return fim("INCERTO", falha.tipo === "TIMEOUT" ? "TIMEOUT" : falha.tipo === "HTTP" && falha.status >= 500 ? "HTTP_5XX" : "EXTERNO_AMBIGUO")
  }
  // TEMPORARIA_LOCAL só é prova de não envio ANTES da fronteira externa.
  if (iniciouEnvio && falha.tipo === "TEMPORARIA_LOCAL") return fim("INCERTO", "EXTERNO_AMBIGUO")
  const exp = Math.min(300_000, 1000 * 2 ** Math.max(0, Math.min(20, tentativa - 1)))
  const jitter = Number.isFinite(aleatorio) ? Math.max(0, Math.min(1, aleatorio)) : 0.5
  const retryAfter = retry429 && Number.isFinite(falha.retryAfterMs) ? Math.max(0, Math.min(3_600_000, falha.retryAfterMs!)) : 0
  return fim("RETRY", retry429 ? "REJEICAO_429" : "TEMPORARIO", Math.max(retryAfter, Math.ceil(exp * (0.5 + jitter / 2))))
}
