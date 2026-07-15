/**
 * Contador HUB · reader financeiro (read-only). GOAL 006.
 *
 * DECISÃO 2 (realizados x títulos):
 * - Entradas/saídas REALIZADAS vêm de `MovimentacaoFinanceira` (não de títulos pagos).
 * - Títulos EM ABERTO vêm de `ContaReceberTitulo` / `ContaPagarTitulo` — relatório separado.
 * - Transferências entre carteiras NÃO são receita nem despesa (excluídas).
 * - Estornos são classificados à parte (não entram em entradas/saídas).
 * - Posição de títulos = títulos abertos com VENCIMENTO na competência (semântica de data-parede;
 *   `vencimento` é String, comparado por ano/mês — não usa o período UTC de vendas).
 */
import {
  monetarioReal,
  monetarioParcial,
  numericoReal,
  numericoParcial,
  type FinanceiroContador,
} from "./tipos"

const FONTE_MOV = "MovimentacaoFinanceira"
const FONTE_CR = "ContaReceberTitulo"
const FONTE_CP = "ContaPagarTitulo"

/** `origem` de transferência entre carteiras — nunca é receita/despesa. */
const ORIGENS_TRANSFERENCIA = new Set(["transferencia", "transfer", "transferencia_carteira"])
/** `origem` de estorno — classificado à parte. */
const ORIGENS_ESTORNO = new Set(["estorno", "estorno_venda", "estorno_recebimento"])

/** Status que fecham um título (não conta como "em aberto"). */
const STATUS_TITULO_FECHADO = new Set([
  "pago",
  "paga",
  "quitado",
  "quitada",
  "liquidado",
  "liquidada",
  "baixado",
  "baixada",
  "recebido",
  "recebida",
  "cancelado",
  "cancelada",
])

export type MovimentacaoRow = { tipo: string; origem: string; valor: number }
export type TituloRow = { valor: number; status: string; vencimento: string }

function numeroFinito(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0
}

/** Parse defensivo de vencimento (`YYYY-MM-DD` ou `DD/MM/YYYY`) → {ano, mes} | null. */
export function parseVencimento(venc: string): { ano: number; mes: number } | null {
  if (typeof venc !== "string") return null
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(venc.trim())
  if (iso) {
    const ano = Number(iso[1])
    const mes = Number(iso[2])
    if (mes >= 1 && mes <= 12) return { ano, mes }
    return null
  }
  const br = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(venc.trim())
  if (br) {
    const mes = Number(br[2])
    const ano = Number(br[3])
    if (mes >= 1 && mes <= 12) return { ano, mes }
    return null
  }
  return null
}

function agregarTitulos(
  rows: readonly TituloRow[],
  competencia: { ano: number; mes: number },
  fonte: string,
): { total: FinanceiroContador["titulosReceberAberto"]; quantidade: FinanceiroContador["titulosReceberQuantidade"] } {
  const abertos = rows.filter((r) => !STATUS_TITULO_FECHADO.has((r.status ?? "").toLowerCase().trim()))
  let soma = 0
  let qtd = 0
  let semVencimento = 0
  for (const r of abertos) {
    const p = parseVencimento(r.vencimento)
    if (!p) {
      semVencimento += 1
      continue
    }
    if (p.ano === competencia.ano && p.mes === competencia.mes) {
      soma += numeroFinito(r.valor)
      qtd += 1
    }
  }
  const obs = "Posição atual: títulos em aberto com vencimento na competência."
  if (semVencimento > 0) {
    const nota = `${obs} ${semVencimento} título(s) aberto(s) sem vencimento reconhecível ficaram fora.`
    return {
      total: monetarioParcial(soma, fonte, nota),
      quantidade: numericoParcial(qtd, fonte, nota),
    }
  }
  return {
    total: monetarioReal(soma, fonte, obs),
    quantidade: numericoReal(qtd, fonte, obs),
  }
}

export function agregarFinanceiro(input: {
  movimentacoes: readonly MovimentacaoRow[]
  receber: readonly TituloRow[]
  pagar: readonly TituloRow[]
  competencia: { ano: number; mes: number }
}): FinanceiroContador {
  let entradas = 0
  let saidas = 0
  let estornos = 0
  for (const m of input.movimentacoes) {
    const origem = (m.origem ?? "").toLowerCase().trim()
    const tipo = (m.tipo ?? "").toLowerCase().trim()
    const valor = numeroFinito(m.valor)
    if (ORIGENS_ESTORNO.has(origem)) {
      estornos += valor
      continue
    }
    if (ORIGENS_TRANSFERENCIA.has(origem)) continue
    if (tipo === "entrada") entradas += valor
    else if (tipo === "saida") saidas += valor
  }

  const cr = agregarTitulos(input.receber, input.competencia, FONTE_CR)
  const cp = agregarTitulos(input.pagar, input.competencia, FONTE_CP)

  const obsMov = "Realizados via movimentações; exclui transferências e estornos."
  return Object.freeze({
    entradasRealizadas: monetarioReal(entradas, FONTE_MOV, obsMov),
    saidasRealizadas: monetarioReal(saidas, FONTE_MOV, obsMov),
    estornos: monetarioReal(estornos, FONTE_MOV, "Classificado à parte; fora de entradas/saídas."),
    titulosReceberAberto: cr.total,
    titulosReceberQuantidade: cr.quantidade,
    titulosPagarAberto: cp.total,
    titulosPagarQuantidade: cp.quantidade,
  })
}
