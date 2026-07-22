/**
 * Alerta estruturado de vencimento do certificado A1 (GOAL-008 · item 8).
 *
 * PURO: sem I/O, sem segredo. Recebe apenas a data de validade (metadado público) e devolve um
 * alerta com nível determinístico para exibir ao administrador (FiscalSection / API).
 */

export type VencimentoNivel = "ok" | "aviso" | "critico" | "vencido" | "desconhecido"

export type VencimentoAlerta = {
  nivel: VencimentoNivel
  /** Dias inteiros até o vencimento (negativo se já venceu; `null` se desconhecido). */
  diasRestantes: number | null
  /** Data de validade em ISO, ou `null`. */
  validoAte: string | null
  /** Mensagem curta, pronta para UI (sem segredo). */
  mensagem: string
}

export type AlertaLimites = {
  /** ≤ este número de dias ⇒ `critico`. Default 7. */
  criticoDias?: number
  /** ≤ este número de dias ⇒ `aviso`. Default 30. */
  avisoDias?: number
}

const MS_DIA = 24 * 60 * 60 * 1000

function toDate(v: Date | string | null | undefined): Date | null {
  if (v == null) return null
  const d = v instanceof Date ? v : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Calcula o alerta de vencimento. `diasRestantes` usa o "chão" da diferença em dias
 * (ex.: falta 0 dias e algumas horas ⇒ 0 ⇒ `critico`, ainda não vencido).
 */
export function calcularAlertaVencimento(
  validoAte: Date | string | null | undefined,
  agora: Date = new Date(),
  limites: AlertaLimites = {},
): VencimentoAlerta {
  const criticoDias = limites.criticoDias ?? 7
  const avisoDias = limites.avisoDias ?? 30

  const ate = toDate(validoAte)
  if (!ate) {
    return { nivel: "desconhecido", diasRestantes: null, validoAte: null, mensagem: "Validade do certificado desconhecida." }
  }

  const diasRestantes = Math.floor((ate.getTime() - agora.getTime()) / MS_DIA)
  const iso = ate.toISOString()

  if (diasRestantes < 0) {
    return { nivel: "vencido", diasRestantes, validoAte: iso, mensagem: `Certificado vencido há ${Math.abs(diasRestantes)} dia(s).` }
  }
  if (diasRestantes <= criticoDias) {
    return { nivel: "critico", diasRestantes, validoAte: iso, mensagem: `Certificado vence em ${diasRestantes} dia(s) — renovação urgente.` }
  }
  if (diasRestantes <= avisoDias) {
    return { nivel: "aviso", diasRestantes, validoAte: iso, mensagem: `Certificado vence em ${diasRestantes} dia(s).` }
  }
  return { nivel: "ok", diasRestantes, validoAte: iso, mensagem: `Certificado válido por mais ${diasRestantes} dia(s).` }
}
