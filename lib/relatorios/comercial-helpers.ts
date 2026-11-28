/** Helpers puros do relatório comercial (sem servidor/DB): testáveis sem PostgreSQL. */

/** Centavos inteiros → reais (2 casas). NULL permanece NULL: custo desconhecido nunca vira zero. */
export function centavosParaReais(value: number | string | bigint | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n) / 100 : null
}

/** Dias (fracionários, 1 casa) entre dois instantes; NULL se qualquer um faltar ou a ordem for inválida. */
export function diasEntre(inicio: Date | null | undefined, fim: Date | null | undefined): number | null {
  if (!inicio || !fim) return null
  const ms = fim.getTime() - inicio.getTime()
  return Number.isFinite(ms) && ms >= 0 ? Math.round((ms / 86_400_000) * 10) / 10 : null
}

/** Margem bruta histórica: só com preço e custo total CONHECIDOS e completos. */
export function margemHistorica(precoCentavos: number | null, custoTotalCentavos: number | null, completo: boolean): { valor: number; percentual: number | null } | null {
  if (!completo || precoCentavos === null || custoTotalCentavos === null) return null
  const valor = (precoCentavos - custoTotalCentavos) / 100
  return { valor, percentual: precoCentavos > 0 ? Math.round(((precoCentavos - custoTotalCentavos) / precoCentavos) * 10000) / 100 : null }
}

/** Custo total da unidade: nulo (incompleto) se a aquisição ou qualquer lançamento for desconhecido. */
export function custoTotalUnidadeCentavos(a: { aquisicaoCentavos: number | null; despesasCentavos: number; aplicadoCentavos: number; desconhecidos: number }): number | null {
  if (a.aquisicaoCentavos === null || a.desconhecidos > 0) return null
  return a.aquisicaoCentavos + a.despesasCentavos + a.aplicadoCentavos
}

export const ESTOQUE_PARADO_DIAS = 60
