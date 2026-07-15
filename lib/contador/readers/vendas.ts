/** Agregação read-only de Venda para o Contador HUB. */
import type { PaymentBreakdownFull } from "@/lib/operations-sale-types"
import {
  arred,
  monetarioIndisponivel,
  monetarioParcial,
  monetarioReal,
  numericoParcial,
  numericoReal,
  type DisponibilidadeDado,
  type FormaPagamentoLinha,
  type VendasContador,
} from "./tipos"

const FONTE = "Venda (PDV)"
const STATUS_CANCELADA = "cancelada"
const TOLERANCIA_CENTAVO = 0.01

const FORMAS: readonly { chave: keyof PaymentBreakdownFull; label: string }[] = [
  { chave: "dinheiro", label: "Dinheiro" },
  { chave: "pix", label: "Pix" },
  { chave: "cartaoDebito", label: "Cartão débito" },
  { chave: "cartaoCredito", label: "Cartão crédito" },
  { chave: "carne", label: "Carnê" },
  { chave: "aPrazo", label: "À prazo" },
  { chave: "creditoVale", label: "Crédito/vale" },
]

const CHAVES_CONHECIDAS = new Set<string>([...FORMAS.map((f) => f.chave), "cartao"])

export type VendaRow = {
  total: number
  status: string | null
  payload: unknown
}

type BreakdownLido = {
  conhecidos: Partial<PaymentBreakdownFull>
  somaConhecida: number
  somaDesconhecida: number
  temChaveDesconhecida: boolean
  temValorInvalido: boolean
}

function numeroFinito(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null
}

function lerBreakdown(payload: unknown): BreakdownLido | null {
  if (!payload || typeof payload !== "object") return null
  const pb = (payload as { paymentBreakdown?: unknown }).paymentBreakdown
  if (!pb || typeof pb !== "object" || Array.isArray(pb)) return null

  const entrada = pb as Record<string, unknown>
  const conhecidos: Partial<PaymentBreakdownFull> = {}
  let somaConhecida = 0
  let somaDesconhecida = 0
  let temChaveDesconhecida = false
  let temValorInvalido = false

  // Formato histórico real da plataforma: `cartao` era normalizado como débito
  // quando `cartaoDebito` ainda não existia no payload.
  if (!("cartaoDebito" in entrada) && "cartao" in entrada) {
    const legado = numeroFinito(entrada.cartao)
    if (legado === null || legado < 0) temValorInvalido = true
    else {
      conhecidos.cartaoDebito = legado
      somaConhecida += legado
    }
  }

  for (const { chave } of FORMAS) {
    if (!(chave in entrada)) continue
    const n = numeroFinito(entrada[chave])
    if (n === null || n < 0) {
      temValorInvalido = true
      continue
    }
    conhecidos[chave] = n
    somaConhecida += n
  }

  for (const [chave, bruto] of Object.entries(entrada)) {
    if (CHAVES_CONHECIDAS.has(chave)) continue
    temChaveDesconhecida = true
    const n = numeroFinito(bruto)
    if (n !== null && n > 0) somaDesconhecida += n
    else if (n === null) temValorInvalido = true
  }

  if (Object.keys(entrada).length === 0) return null
  return { conhecidos, somaConhecida, somaDesconhecida, temChaveDesconhecida, temValorInvalido }
}

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

  const somaForma = new Map<string, number>()
  let comAlgumaCobertura = 0
  let naoIdentificadasQtd = 0
  let naoIdentificadoValor = 0

  for (const r of validas) {
    const totalVenda = Math.max(0, numeroFinito(r.total) ?? 0)
    const pb = lerBreakdown(r.payload)
    if (!pb) {
      naoIdentificadasQtd += 1
      naoIdentificadoValor += totalVenda
      continue
    }

    comAlgumaCobertura += 1
    for (const { chave } of FORMAS) {
      const valor = pb.conhecidos[chave]
      if (typeof valor === "number" && valor !== 0) {
        somaForma.set(chave, (somaForma.get(chave) ?? 0) + valor)
      }
    }

    const residual = Math.max(0, totalVenda - pb.somaConhecida)
    const reconciliado = Math.abs(totalVenda - pb.somaConhecida) <= TOLERANCIA_CENTAVO
    const incompleto =
      pb.temChaveDesconhecida || pb.temValorInvalido || !reconciliado || Object.keys(pb.conhecidos).length === 0

    if (incompleto) {
      naoIdentificadasQtd += 1
      // O residual reconcilia a quebra com Venda.total; a soma desconhecida impede
      // que uma forma nova desapareça quando ela representa esse residual.
      naoIdentificadoValor += Math.min(totalVenda, Math.max(residual, pb.somaDesconhecida))
    }
  }

  const formasPagamento: FormaPagamentoLinha[] = FORMAS.filter(({ chave }) => somaForma.has(chave)).map(
    ({ chave, label }) => ({ chave, label, valor: arred(somaForma.get(chave) ?? 0) }),
  )
  const formaPagamentoDisponibilidade: DisponibilidadeDado =
    validas.length === 0 || comAlgumaCobertura === 0
      ? "indisponivel"
      : naoIdentificadasQtd === 0
        ? "real"
        : "parcial"

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
  const obsNaoIdentificado = "Vendas sem paymentBreakdown completo e reconciliado com Venda.total."
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
      naoIdentificadasQtd === 0
        ? numericoReal(0, FONTE)
        : numericoParcial(naoIdentificadasQtd, FONTE, obsNaoIdentificado),
    naoIdentificadoValor:
      naoIdentificadasQtd === 0
        ? monetarioReal(0, FONTE)
        : monetarioParcial(naoIdentificadoValor, FONTE, obsNaoIdentificado),
  })
}
