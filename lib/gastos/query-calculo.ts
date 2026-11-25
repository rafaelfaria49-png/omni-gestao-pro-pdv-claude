/** Regras puras da consulta G005. Nenhuma função grava ou autoriza acesso. */
export const VERSAO_CALCULO_FINANCEIRO = "g005-caixa-1"
export const FUSO_FINANCEIRO = "America/Sao_Paulo"
const LIMITE = BigInt("9000000000000")

export class ConsultaFinanceiraError extends Error {
  constructor(public readonly code: string, public readonly status = 409) {
    super("Não foi possível apurar os dados financeiros com segurança.")
    this.name = "ConsultaFinanceiraError"
  }
}

export function centavosConsulta(valor: number, exato?: { toString(): string } | null): bigint {
  if (!Number.isFinite(valor)) throw new ConsultaFinanceiraError("precisao_legada_exige_revisao")
  const n = Math.round(valor * 100)
  const tolerancia = Math.max(1e-10, Math.abs(valor) * Number.EPSILON * 2)
  if (!Number.isSafeInteger(n) || Math.abs(valor - n / 100) > tolerancia || Math.abs(n) > Number(LIMITE)) {
    throw new ConsultaFinanceiraError("precisao_legada_exige_revisao")
  }
  const cents = BigInt(n)
  if (exato != null && (!/^-?\d+$/.test(exato.toString()) || BigInt(exato.toString()) !== cents)) {
    throw new ConsultaFinanceiraError("precisao_legada_exige_revisao")
  }
  return cents
}

/** Somente adapter dos contratos antigos em reais; o DTO oficial permanece em centavos. */
export function reaisConsulta(centavos: string | bigint): number {
  const v = BigInt(centavos)
  if (v > LIMITE || v < -LIMITE) throw new ConsultaFinanceiraError("total_fora_limite_do_consumidor")
  return Number(v) / 100
}

export function objetoConsulta(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export type TituloParaConsulta = {
  valor: number
  valorCentavos?: { toString(): string } | null
  status: string
  ativo?: boolean
  payload?: unknown
  alocacoesPagamento?: readonly {
    pagamentoId: string
    valorCentavos: { toString(): string }
    pagamento: { tipo: string }
  }[]
}

export function saldoTituloConsulta(row: TituloParaConsulta) {
  const total = centavosConsulta(row.valor, row.valorCentavos)
  if (total < BigInt(0)) throw new ConsultaFinanceiraError("titulo_exige_revisao")
  const cancelado = row.ativo === false || ["cancelado", "cancelada", "estornado", "estornada"].includes(row.status)
  if (cancelado) return { total, pago: BigInt(0), restante: BigInt(0), cancelado: true }
  const alocacoes = row.alocacoesPagamento ?? []
  const ids = new Set(alocacoes.map(a => a.pagamentoId))
  let pago = BigInt(0), eventos = 0
  for (const a of alocacoes) {
    if (!/^[1-9]\d*$/.test(a.valorCentavos.toString()) || !["PAGAMENTO", "ESTORNO"].includes(a.pagamento.tipo)) {
      throw new ConsultaFinanceiraError("alocacao_exige_revisao")
    }
    pago += BigInt(a.valorCentavos.toString()) * (a.pagamento.tipo === "ESTORNO" ? -BigInt(1) : BigInt(1))
    eventos++
  }
  const historico = objetoConsulta(row.payload).historico
  const legado = new Map<number, { valor: bigint; compensado: bigint }>()
  for (const [index, raw] of (Array.isArray(historico) ? historico : []).entries()) {
    const e = objetoConsulta(raw)
    if (!["pagamento", "liquidacao", "estorno_pagamento"].includes(String(e.tipo))) continue
    if (e.pagamentoId) {
      if (!ids.has(String(e.pagamentoId))) throw new ConsultaFinanceiraError("pagamento_estruturado_ausente")
      continue // espelho de compatibilidade G004, nunca outro pagamento
    }
    if (typeof e.valor !== "number") throw new ConsultaFinanceiraError("historico_exige_revisao")
    const v = centavosConsulta(e.valor)
    if (v <= BigInt(0)) throw new ConsultaFinanceiraError("historico_exige_revisao")
    if (e.tipo === "estorno_pagamento") {
      const origem = typeof e.refHistoricoIndex === "number" && Number.isInteger(e.refHistoricoIndex) ? legado.get(e.refHistoricoIndex) : undefined
      if (!origem || origem.compensado + v > origem.valor) throw new ConsultaFinanceiraError("compensacao_legada_exige_revisao")
      origem.compensado += v
    } else legado.set(index, { valor: v, compensado: BigInt(0) })
    pago += v * (e.tipo === "estorno_pagamento" ? -BigInt(1) : BigInt(1))
    eventos++
  }
  // Legado quitado sem histórico comprova a posição atual, jamais caixa realizado.
  const quitado = ["pago", "paga", "quitado", "quitada", "liquidado", "liquidada", "recebido", "recebida", "baixado", "baixada"].includes(row.status)
  if (!eventos && quitado) pago = total
  if (!eventos && row.status === "parcial") throw new ConsultaFinanceiraError("historico_exige_revisao")
  if (pago < BigInt(0) || pago > total || (quitado && pago !== total)) throw new ConsultaFinanceiraError("historico_exige_revisao")
  return { total, pago, restante: total - pago, cancelado: false }
}

export function dataCivilConsulta(input: string): string {
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(input)
  const iso = br ? `${br[3]}-${br[2]}-${br[1]}` : input
  const date = new Date(`${iso}T12:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || iso < "1900-01-01" || iso > "9998-12-31"
    || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== iso) {
    throw new ConsultaFinanceiraError("periodo_invalido", 422)
  }
  return iso
}

export function deslocarDiaConsulta(dia: string, dias: number): string {
  const d = new Date(`${dataCivilConsulta(dia)}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

export function diaNoFusoConsulta(instante: Date, timezone = FUSO_FINANCEIRO): string {
  try {
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instante)
    const get = (tipo: string) => p.find(x => x.type === tipo)!.value
    return `${get("year")}-${get("month")}-${get("day")}`
  } catch { throw new ConsultaFinanceiraError("timezone_invalido", 422) }
}

/** Primeiro instante civil do dia, inclusive dias históricos com transição DST à meia-noite. */
export function inicioDiaConsulta(dia: string, timezone = FUSO_FINANCEIRO): Date {
  const target = dataCivilConsulta(dia), utc = Date.parse(`${target}T12:00:00Z`)
  let lo = utc - 48 * 3600000, hi = utc + 48 * 3600000
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (diaNoFusoConsulta(new Date(mid), timezone) < target) lo = mid + 1
    else hi = mid
  }
  if (diaNoFusoConsulta(new Date(lo), timezone) !== target) throw new ConsultaFinanceiraError("dia_inexistente_no_fuso", 422)
  return new Date(lo)
}

export function intervaloConsulta(inicio: string, fim: string, timezone = FUSO_FINANCEIRO) {
  inicio = dataCivilConsulta(inicio); fim = dataCivilConsulta(fim)
  if (inicio > fim) throw new ConsultaFinanceiraError("periodo_invalido", 422)
  return { gte: inicioDiaConsulta(inicio, timezone), lt: inicioDiaConsulta(deslocarDiaConsulta(fim, 1), timezone) }
}
