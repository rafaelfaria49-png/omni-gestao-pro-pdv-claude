/**
 * Contador HUB · reader de vendas (read-only). GOAL 006.
 *
 * Fonte canônica: `Venda` (nunca soma OS; OS que gera Venda já é representada pela Venda).
 * - Total de vendas = Σ `Venda.total` das vendas NÃO canceladas na competência.
 * - Cancelamentos são informativos (já excluídos do total).
 * - Forma de pagamento e desconto vêm do `payload` (parser defensivo; payload inválido
 *   nunca derruba o reader — vira "não identificado" / cobertura parcial).
 * - Devoluções são tratadas em `devolucoes.ts` (reduzem a competência da devolução).
 */
import type { PeriodoUtc } from "@/lib/contador/competencia"
import type { PaymentBreakdownFull } from "@/lib/operations-sale-types"
import {
  numericoReal,
  monetarioReal,
  monetarioParcial,
  monetarioIndisponivel,
  numericoParcial,
  arred,
  type VendasContador,
  type FormaPagamentoLinha,
  type DisponibilidadeDado,
} from "./tipos"

const FONTE = "Venda (PDV)"

/** Status que NÃO conta como faturamento. `null`/desconhecido = concluída (legado). */
const STATUS_CANCELADA = "cancelada"

const FORMAS: readonly { chave: keyof PaymentBreakdownFull; label: string }[] = [
  { chave: "dinheiro", label: "Dinheiro" },
  { chave: "pix", label: "Pix" },
  { chave: "cartaoDebito", label: "Cartão débito" },
  { chave: "cartaoCredito", label: "Cartão crédito" },
  { chave: "carne", label: "Carnê" },
  { chave: "aPrazo", label: "À prazo" },
  { chave: "creditoVale", label: "Crédito/vale" },
]

export type VendaRow = {
  total: number
  status: string | null
  payload: unknown
}

function numeroFinito(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null
}

/** Extrai um paymentBreakdown válido do payload, ou `null` se ausente/inválido. */
function lerBreakdown(payload: unknown): Partial<PaymentBreakdownFull> | null {
  if (!payload || typeof payload !== "object") return null
  const pb = (payload as { paymentBreakdown?: unknown }).paymentBreakdown
  if (!pb || typeof pb !== "object") return null
  const out: Partial<PaymentBreakdownFull> = {}
  for (const { chave } of FORMAS) {
    const n = numeroFinito((pb as Record<string, unknown>)[chave])
    if (n !== null) out[chave] = n
  }
  // Só é um breakdown válido se ao menos uma forma conhecida veio como número.
  return Object.keys(out).length > 0 ? out : null
}

/** Lê `payload.discountTotal` quando for número finito ≥ 0. */
function lerDiscountTotal(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null
  const d = numeroFinito((payload as { discountTotal?: unknown }).discountTotal)
  return d !== null && d >= 0 ? d : null
}

export function agregarVendas(rows: readonly VendaRow[]): VendasContador {
  const validas = rows.filter((r) => r.status !== STATUS_CANCELADA)
  const canceladas = rows.filter((r) => r.status === STATUS_CANCELADA)

  const total = validas.reduce((s, r) => s + (numeroFinito(r.total) ?? 0), 0)
  const canceladasTotal = canceladas.reduce((s, r) => s + (numeroFinito(r.total) ?? 0), 0)

  // Forma de pagamento (payload-derivada).
  const somaForma = new Map<string, number>()
  let classificadas = 0
  let naoIdentificadasQtd = 0
  let naoIdentificadoValor = 0
  for (const r of validas) {
    const pb = lerBreakdown(r.payload)
    if (!pb) {
      naoIdentificadasQtd += 1
      naoIdentificadoValor += numeroFinito(r.total) ?? 0
      continue
    }
    classificadas += 1
    for (const { chave } of FORMAS) {
      const v = pb[chave]
      if (typeof v === "number" && v !== 0) {
        somaForma.set(chave, (somaForma.get(chave) ?? 0) + v)
      }
    }
  }
  const formasPagamento: FormaPagamentoLinha[] = FORMAS.filter(({ chave }) => somaForma.has(chave)).map(
    ({ chave, label }) => ({ chave, label, valor: arred(somaForma.get(chave) ?? 0) }),
  )
  const formaPagamentoDisponibilidade: DisponibilidadeDado =
    classificadas === 0 ? "indisponivel" : naoIdentificadasQtd === 0 ? "real" : "parcial"

  // Desconto (informativo; nunca subtrai de total).
  let descontoCobertoQtd = 0
  let descontoSoma = 0
  for (const r of validas) {
    const d = lerDiscountTotal(r.payload)
    if (d !== null) {
      descontoCobertoQtd += 1
      descontoSoma += d
    }
  }

  const obsFonte = "Total autoritativo em Venda.total; canceladas excluídas."
  return Object.freeze({
    quantidade: numericoReal(validas.length, FONTE, obsFonte),
    total: monetarioReal(total, FONTE, obsFonte),
    canceladasQuantidade: numericoReal(canceladas.length, FONTE),
    canceladasTotal: monetarioReal(canceladasTotal, FONTE, "Informativo; não entra no faturamento."),
    descontoTotal:
      validas.length === 0
        ? monetarioIndisponivel("Venda.payload.discountTotal", "Sem vendas na competência.")
        : descontoCobertoQtd === 0
          ? monetarioIndisponivel(
              "Venda.payload.discountTotal",
              "Nenhuma venda da competência registrou desconto no payload.",
            )
          : descontoCobertoQtd === validas.length
            ? monetarioReal(descontoSoma, "Venda.payload.discountTotal", "Informativo; não subtrai de total.")
            : monetarioParcial(
                descontoSoma,
                "Venda.payload.discountTotal",
                `Desconto identificado em ${descontoCobertoQtd} de ${validas.length} vendas.`,
              ),
    descontoCoberturaQuantidade:
      validas.length === 0
        ? numericoReal(0, "Venda.payload.discountTotal")
        : descontoCobertoQtd === validas.length
          ? numericoReal(descontoCobertoQtd, "Venda.payload.discountTotal")
          : numericoParcial(
              descontoCobertoQtd,
              "Venda.payload.discountTotal",
              `${descontoCobertoQtd} de ${validas.length} vendas com desconto identificado.`,
            ),
    formasPagamento,
    formaPagamentoDisponibilidade,
    naoIdentificadoQuantidade:
      formaPagamentoDisponibilidade === "real"
        ? numericoReal(0, FONTE)
        : numericoParcial(naoIdentificadasQtd, FONTE, "Vendas sem paymentBreakdown válido no payload."),
    naoIdentificadoValor:
      naoIdentificadasQtd === 0
        ? monetarioReal(0, FONTE)
        : monetarioParcial(
            naoIdentificadoValor,
            FONTE,
            `${naoIdentificadasQtd} venda(s) sem forma de pagamento identificada.`,
          ),
  })
}
