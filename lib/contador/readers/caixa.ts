/**
 * Contador HUB · reader de caixa (read-only). GOAL 006.
 *
 * Caixa FÍSICO ≠ resultado contábil — estes números descrevem a operação de caixa
 * (sessões, sangrias, suprimentos, diferenças de conferência), nunca receita/lucro.
 * - Sessões filtradas por `abertaEm` no período; operações por `at` no período.
 * - Diferença = Σ(saldoContado − saldoFinal) das sessões FECHADAS com ambos os campos;
 *   sessões sem conferência não viram 0 — reduzem a disponibilidade para "parcial".
 */
import {
  numericoReal,
  monetarioReal,
  monetarioIndisponivel,
  monetarioParcial,
  type CaixaContador,
} from "./tipos"

const FONTE_SESSAO = "SessaoCaixa"
const FONTE_OP = "CaixaOperacao"

export type SessaoRow = {
  status: string
  saldoFinal: number | null
  saldoContado: number | null
}

export type CaixaOperacaoRow = {
  tipo: string
  valor: number
}

function numeroFinito(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null
}

export function agregarCaixa(input: {
  sessoes: readonly SessaoRow[]
  operacoes: readonly CaixaOperacaoRow[]
}): CaixaContador {
  const sessoes = input.sessoes
  const abertas = sessoes.filter((s) => (s.status ?? "").toUpperCase() === "ABERTA")

  let sangriasSoma = 0
  let sangriasQtd = 0
  let suprimentosSoma = 0
  let suprimentosQtd = 0
  for (const op of input.operacoes) {
    const tipo = (op.tipo ?? "").toLowerCase().trim()
    const valor = numeroFinito(op.valor) ?? 0
    if (tipo === "sangria") {
      sangriasSoma += valor
      sangriasQtd += 1
    } else if (tipo === "suprimento") {
      suprimentosSoma += valor
      suprimentosQtd += 1
    }
  }

  // Diferenças de conferência: só sessões fechadas com saldoContado E saldoFinal.
  const fechadas = sessoes.filter((s) => (s.status ?? "").toUpperCase() === "FECHADA")
  const comConferencia = fechadas.filter(
    (s) => numeroFinito(s.saldoContado) !== null && numeroFinito(s.saldoFinal) !== null,
  )
  const somaDiferenca = comConferencia.reduce(
    (acc, s) => acc + ((numeroFinito(s.saldoContado) ?? 0) - (numeroFinito(s.saldoFinal) ?? 0)),
    0,
  )

  const diferencas =
    fechadas.length === 0
      ? monetarioIndisponivel(FONTE_SESSAO, "Nenhuma sessão fechada na competência.")
      : comConferencia.length === 0
        ? monetarioIndisponivel(FONTE_SESSAO, "Sessões fechadas sem conferência de saldo (saldoContado).")
        : comConferencia.length === fechadas.length
          ? monetarioReal(somaDiferenca, FONTE_SESSAO, "Σ(saldoContado − saldoFinal) das sessões conferidas.")
          : monetarioParcial(
              somaDiferenca,
              FONTE_SESSAO,
              `Conferência disponível em ${comConferencia.length} de ${fechadas.length} sessões fechadas.`,
            )

  return Object.freeze({
    sessoes: numericoReal(sessoes.length, FONTE_SESSAO),
    sessoesAbertas: numericoReal(abertas.length, FONTE_SESSAO),
    sangriasTotal: monetarioReal(sangriasSoma, FONTE_OP),
    sangriasQuantidade: numericoReal(sangriasQtd, FONTE_OP),
    suprimentosTotal: monetarioReal(suprimentosSoma, FONTE_OP),
    suprimentosQuantidade: numericoReal(suprimentosQtd, FONTE_OP),
    diferencas,
  })
}
