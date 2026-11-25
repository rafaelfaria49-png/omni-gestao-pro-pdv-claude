import { centavosConsulta, saldoTituloConsulta, reaisConsulta, type TituloParaConsulta } from "@/lib/gastos/query-calculo"
/**
 * Contador HUB · agregação financeira read-only.
 *
 * Realizados vêm de MovimentacaoFinanceira; títulos abertos são uma posição separada.
 * Transferências são neutras e toda reversão conhecida fica em `estornos`, nunca como
 * entrada/saída operacional normal.
 */
import {
  isOrigemDevolucaoPdv,
  isOrigemEstorno,
  isOrigemTransferenciaInterna,
} from "@/lib/financeiro/services/movimentacao-financeira-classify"
import {
  monetarioParcial,
  monetarioReal,
  numericoParcial,
  numericoReal,
  type FinanceiroContador,
} from "./tipos"

const FONTE_MOV = "MovimentacaoFinanceira"
const FONTE_CR = "ContaReceberTitulo"
const FONTE_CP = "ContaPagarTitulo"

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

export type MovimentacaoRow = { tipo: string; origem: string | null; valor: number; valorCentavos?: { toString(): string } | null }
export type TituloRow = TituloParaConsulta & { vencimento: string }

function dataCalendarioValida(ano: number, mes: number, dia: number): boolean {
  if (!Number.isInteger(ano) || ano < 1 || ano > 9999) return false
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) return false
  if (!Number.isInteger(dia) || dia < 1) return false
  return dia <= new Date(Date.UTC(ano, mes, 0)).getUTCDate()
}

/** Parse estrito de vencimento real (`YYYY-MM-DD` ou `DD/MM/YYYY`). */
export function parseVencimento(venc: string): { ano: number; mes: number } | null {
  if (typeof venc !== "string") return null
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(venc)
  if (iso) {
    const ano = Number(iso[1])
    const mes = Number(iso[2])
    const dia = Number(iso[3])
    return dataCalendarioValida(ano, mes, dia) ? { ano, mes } : null
  }

  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(venc)
  if (br) {
    const dia = Number(br[1])
    const mes = Number(br[2])
    const ano = Number(br[3])
    return dataCalendarioValida(ano, mes, dia) ? { ano, mes } : null
  }

  return null
}

function isOrigemReversao(origem: string): boolean {
  const normalizada = origem.toLowerCase().trim()
  return (
    isOrigemEstorno(normalizada) ||
    normalizada === "estorno" ||
    normalizada.startsWith("estorno_") ||
    isOrigemDevolucaoPdv(normalizada) ||
    normalizada === "cancelamento_pdv"
  )
}

type ClassificacaoMovimento =
  | "entrada"
  | "saida"
  | "estorno"
  | "transferencia"
  | "nao_classificado"

const ORIGENS_ENTRADA = new Set(["venda", "pdv", "os", "marketplace"])
const ORIGENS_BIDIRECIONAIS = new Set(["manual", "ajuste", "importacao", "sistema", "legado"])

/** `tipo` somente decide a direcao depois que a origem passa pela allowlist. */
function classificarMovimento(m: MovimentacaoRow): ClassificacaoMovimento {
  const origem = (m.origem ?? "").toLowerCase().trim()
  const tipo = (m.tipo ?? "").toLowerCase().trim()

  if (isOrigemReversao(origem)) return "estorno"
  if (isOrigemTransferenciaInterna(origem)) return "transferencia"
  if (ORIGENS_ENTRADA.has(origem)) return tipo === "entrada" ? "entrada" : "nao_classificado"
  if (origem === "receber" || origem.startsWith("receber_")) {
    return tipo === "entrada" ? "entrada" : "nao_classificado"
  }
  if (origem === "pagar" || origem.startsWith("pagar_")) {
    return tipo === "saida" ? "saida" : "nao_classificado"
  }
  if (ORIGENS_BIDIRECIONAIS.has(origem)) {
    if (tipo === "entrada") return "entrada"
    if (tipo === "saida") return "saida"
  }
  return "nao_classificado"
}

function agregarTitulos(
  rows: readonly TituloRow[],
  competencia: { ano: number; mes: number },
  fonte: string,
): {
  total: FinanceiroContador["titulosReceberAberto"]
  quantidade: FinanceiroContador["titulosReceberQuantidade"]
} {
  const abertos = rows.filter((r) => !STATUS_TITULO_FECHADO.has((r.status ?? "").toLowerCase().trim()))
  let somaCentavos = BigInt(0)
  let qtd = 0
  let semVencimento = 0
  let inconsistentes = 0

  for (const r of abertos) {
    const p = parseVencimento(r.vencimento)
    if (!p) {
      semVencimento += 1
      continue
    }
    if (p.ano === competencia.ano && p.mes === competencia.mes) {
      try { const saldo=saldoTituloConsulta(r); if(saldo.restante>BigInt(0)){somaCentavos+=saldo.restante;qtd+=1} } catch { inconsistentes+=1 }
    }
  }

  const soma=reaisConsulta(somaCentavos)
  const obs = "Posição atual: saldo restante dos títulos em aberto com vencimento na competência."
  if (semVencimento > 0 || inconsistentes > 0) {
    const nota = `${obs} ${semVencimento} título(s) aberto(s) sem vencimento reconhecível ficaram fora.${inconsistentes ? ` ${inconsistentes} título(s) com precisão/histórico que exige revisão ficaram fora.` : ""}`
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
  let entradas = BigInt(0)
  let saidas = BigInt(0)
  let estornos = BigInt(0)
  let transferencias = BigInt(0)
  let transferenciasQuantidade = 0
  let naoClassificados = BigInt(0)
  let naoClassificadosQuantidade = 0
  let anomalias = 0

  for (const m of input.movimentacoes) {
    let valor: bigint
    try { valor = centavosConsulta(m.valor, m.valorCentavos) } catch { anomalias++; continue }
    const classificacao = classificarMovimento(m)
    if (classificacao === "entrada") entradas += valor
    else if (classificacao === "saida") saidas += valor
    else if (classificacao === "estorno") estornos += valor
    else if (classificacao === "transferencia") {
      transferencias += valor
      transferenciasQuantidade += 1
    } else {
      naoClassificados += valor
      naoClassificadosQuantidade += 1
    }
  }

  const cr = agregarTitulos(input.receber, input.competencia, FONTE_CR)
  const cp = agregarTitulos(input.pagar, input.competencia, FONTE_CP)
  const obsMov = "Realizados via movimentações; exclui transferências e reversões."
  const monetario = (v: bigint, obs: string) => anomalias
    ? monetarioParcial(reaisConsulta(v), FONTE_MOV, `${obs} ${anomalias} movimento(s) com precisão que exige revisão ficaram fora.`)
    : monetarioReal(reaisConsulta(v), FONTE_MOV, obs)

  return Object.freeze({
    entradasRealizadas: monetario(entradas, obsMov),
    saidasRealizadas: monetario(saidas, obsMov),
    estornos: monetario(estornos, "Classificado à parte; fora de entradas/saídas."),
    transferencias: monetario(
      transferencias,
      "Volume das pernas de transferencias internas; neutro no resultado economico.",
    ),
    transferenciasQuantidade: numericoReal(transferenciasQuantidade, FONTE_MOV),
    naoClassificados:
      naoClassificadosQuantidade === 0
        ? monetarioReal(0, FONTE_MOV)
        : monetarioParcial(
            reaisConsulta(naoClassificados),
            FONTE_MOV,
            "Origens fora da allowlist economica; nao incorporadas a entradas/saidas.",
          ),
    naoClassificadosQuantidade:
      naoClassificadosQuantidade === 0
        ? numericoReal(0, FONTE_MOV)
        : numericoParcial(
            naoClassificadosQuantidade,
            FONTE_MOV,
            "Origens fora da allowlist economica.",
          ),
    titulosReceberAberto: cr.total,
    titulosReceberQuantidade: cr.quantidade,
    titulosPagarAberto: cp.total,
    titulosPagarQuantidade: cp.quantidade,
  })
}
