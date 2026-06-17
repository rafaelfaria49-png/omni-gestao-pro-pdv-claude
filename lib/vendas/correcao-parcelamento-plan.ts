/**
 * Planner PURO do REPARCELAMENTO do saldo à prazo de uma venda (Workspace F4).
 *
 * Dado o total à prazo + nº de parcelas + 1º vencimento + intervalo, produz a lista
 * de parcelas (valor, vencimento DD/MM/AAAA, localKey) — espelhando EXATAMENTE a
 * convenção de `upsertVendaInTransaction`:
 *   - valorBase = round2(total / parcelas); última parcela absorve o arredondamento;
 *   - localKey: 1 parcela → `pdv-aprazo-{pedidoId}`; N → `pdv-aprazo-{pedidoId}-{n}`.
 *
 * Isso mantém o cancelamento/estorno existente funcionando (varre `startsWith
 * pdv-aprazo-{pedidoId}`). NÃO toca o banco — a rota executa reusando
 * `cancelContaReceber` + `estornarMovimentacaoPorReferencia` + `upsertContaReceber`.
 */

const EPS = 0.005

export function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100
}

export interface ParcelaPlanejada {
  numero: number
  valor: number
  vencimento: string // DD/MM/AAAA
  localKey: string
}

export type ParcelamentoErrorCode = "valor_invalido" | "parcelas_invalidas" | "vencimento_invalido"

export interface ParcelamentoPlan {
  ok: boolean
  errorCode?: ParcelamentoErrorCode
  error?: string
  totalAPrazo: number
  parcelas: number
  intervaloDias: number
  itens: ParcelaPlanejada[]
}

/** Aceita Date ou "DD/MM/AAAA". Retorna a Date ou null. */
export function parseDataBr(input: string | Date | null | undefined): Date | null {
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input
  if (typeof input !== "string" || !input.trim()) return null
  const m = input.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  const dia = Number(m[1]), mes = Number(m[2]), ano = Number(m[3])
  const d = new Date(ano, mes - 1, dia)
  if (d.getFullYear() !== ano || d.getMonth() !== mes - 1 || d.getDate() !== dia) return null
  return d
}

function fmtBr(d: Date): string {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

export function computeParcelamentoPlan(input: {
  pedidoId: string
  totalAPrazo: number
  parcelas: number
  primeiroVencimento: string | Date | null | undefined
  intervaloDias?: number
  /** Valores manuais por parcela (opcional). Quando fornecido e somando o total, sobrepõe a divisão automática. */
  valoresManuais?: number[] | null
}): ParcelamentoPlan {
  const pedidoId = String(input.pedidoId || "").trim()
  const totalAPrazo = round2(input.totalAPrazo)
  const parcelas = Math.round(Number(input.parcelas) || 0)
  const intervaloDias = Math.max(1, Math.round(Number(input.intervaloDias) || 30))

  const fail = (code: ParcelamentoErrorCode, error: string): ParcelamentoPlan => ({
    ok: false, errorCode: code, error, totalAPrazo, parcelas, intervaloDias, itens: [],
  })

  if (!(totalAPrazo > EPS)) return fail("valor_invalido", "Não há saldo à prazo para parcelar.")
  if (parcelas < 1 || parcelas > 24) return fail("parcelas_invalidas", "Número de parcelas deve estar entre 1 e 24.")

  const primeiro = parseDataBr(input.primeiroVencimento)
  if (!primeiro) return fail("vencimento_invalido", "Primeiro vencimento inválido (use DD/MM/AAAA).")

  // Valores: manuais (se válidos e fecham o total) OU divisão automática.
  let valores: number[]
  const manuais = Array.isArray(input.valoresManuais) ? input.valoresManuais.map((v) => round2(Number(v) || 0)) : null
  if (manuais && manuais.length === parcelas && Math.abs(manuais.reduce((s, v) => s + v, 0) - totalAPrazo) <= 0.01 && manuais.every((v) => v > EPS)) {
    valores = manuais
  } else {
    const base = round2(totalAPrazo / parcelas)
    valores = []
    for (let n = 1; n <= parcelas; n++) {
      valores.push(n === parcelas ? round2(totalAPrazo - base * (parcelas - 1)) : base)
    }
  }

  const itens: ParcelaPlanejada[] = []
  for (let n = 1; n <= parcelas; n++) {
    const venc = new Date(primeiro)
    venc.setDate(venc.getDate() + (n - 1) * intervaloDias)
    const localKey = parcelas === 1 ? `pdv-aprazo-${pedidoId}` : `pdv-aprazo-${pedidoId}-${n}`
    itens.push({ numero: n, valor: valores[n - 1], vencimento: fmtBr(venc), localKey })
  }

  return { ok: true, totalAPrazo, parcelas, intervaloDias, itens }
}
