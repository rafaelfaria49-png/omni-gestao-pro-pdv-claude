/**
 * GOAL 007A · BLOCKER-2 — elegibilidade do estorno diante das Contas a Receber.
 *
 * Predicado ÚNICO usado pelo servidor (`/cancelar`) e pela política do menu, então
 * estes casos travam as duas portas de uma vez.
 */
import { describe, expect, it } from "vitest"
import {
  ESTORNO_BLOQUEIO_RECEBIVEL_CODE,
  ESTORNO_BLOQUEIO_RECEBIVEL_QUITADO,
  avaliarRecebiveisParaEstorno,
  tituloQuitado,
} from "./estorno-recebivel-guard"

const t = (status: string, valor: number, pago: number) => ({ status, valor, pago })

describe("tituloQuitado", () => {
  it("status 'pago' é quitado, qualquer que seja o histórico", () => {
    expect(tituloQuitado(t("pago", 100, 0))).toBe(true)
    expect(tituloQuitado(t("PAGO", 100, 100))).toBe(true)
    expect(tituloQuitado(t("quitado", 100, 100))).toBe(true)
    expect(tituloQuitado(t("liquidado", 100, 100))).toBe(true)
  })

  it("baixas cobrindo o valor contam como quitado mesmo com status legado", () => {
    expect(tituloQuitado(t("parcial", 100, 100))).toBe(true)
    expect(tituloQuitado(t("pendente", 100, 100))).toBe(true)
  })

  it("tolera centavo de float na soma das baixas", () => {
    expect(tituloQuitado(t("parcial", 100, 99.999))).toBe(true)
    expect(tituloQuitado(t("parcial", 100, 99.5))).toBe(false)
  })

  it("pendente e parcial NÃO são quitados (§12 — não regredir)", () => {
    expect(tituloQuitado(t("pendente", 100, 0))).toBe(false)
    expect(tituloQuitado(t("parcial", 100, 40))).toBe(false)
    expect(tituloQuitado(t("vencido", 100, 0))).toBe(false)
  })

  it("título CANCELADO ou ESTORNADO não conta como quitado — já foi neutralizado", () => {
    expect(tituloQuitado(t("cancelado", 100, 100))).toBe(false)
    expect(tituloQuitado(t("estornado", 100, 100))).toBe(false)
  })

  it("valor zero/negativo não vira quitado por acidente", () => {
    expect(tituloQuitado(t("pendente", 0, 0))).toBe(false)
    expect(tituloQuitado(t("pendente", -10, 0))).toBe(false)
  })

  it("status ausente ou lixo não quebra e não bloqueia sozinho", () => {
    expect(tituloQuitado({ status: null, valor: 100, pago: 0 })).toBe(false)
    expect(tituloQuitado({ status: undefined, valor: 100, pago: 100 })).toBe(true)
    expect(tituloQuitado({ status: "???", valor: 100, pago: 0 })).toBe(false)
  })

  it("NaN em valor/pago não bloqueia", () => {
    expect(tituloQuitado({ status: "pendente", valor: NaN, pago: NaN })).toBe(false)
  })
})

describe("avaliarRecebiveisParaEstorno (§23 · matriz de recebíveis)", () => {
  it("SEM título: libera — venda à vista não tem recebível", () => {
    expect(avaliarRecebiveisParaEstorno([])).toEqual({ bloqueado: false })
  })

  it("PENDENTE: libera (§11 — comportamento comprovado preservado)", () => {
    expect(avaliarRecebiveisParaEstorno([t("pendente", 100, 0)])).toEqual({ bloqueado: false })
  })

  it("PARCIALMENTE PAGO: libera (§12 — reconcilia; não mudar regra comercial)", () => {
    expect(avaliarRecebiveisParaEstorno([t("parcial", 100, 40)])).toEqual({ bloqueado: false })
  })

  it("TOTALMENTE PAGO: BLOQUEIA com motivo e código reais", () => {
    const v = avaliarRecebiveisParaEstorno([t("pago", 100, 100)])
    expect(v).toEqual({
      bloqueado: true,
      motivo: ESTORNO_BLOQUEIO_RECEBIVEL_QUITADO,
      code: ESTORNO_BLOQUEIO_RECEBIVEL_CODE,
      titulosQuitados: 1,
    })
  })

  it("MÚLTIPLOS títulos todos pendentes: libera", () => {
    expect(
      avaliarRecebiveisParaEstorno([t("pendente", 50, 0), t("pendente", 50, 0)]),
    ).toEqual({ bloqueado: false })
  })

  it("MISTURA pendente + pago: BLOQUEIA — a parcela quitada é dinheiro que entrou", () => {
    const v = avaliarRecebiveisParaEstorno([t("pendente", 50, 0), t("pago", 50, 50)])
    expect(v.bloqueado).toBe(true)
    expect(v.bloqueado && v.titulosQuitados).toBe(1)
  })

  it("MÚLTIPLOS quitados são contados para a trilha", () => {
    const v = avaliarRecebiveisParaEstorno([t("pago", 50, 50), t("pago", 50, 50)])
    expect(v.bloqueado && v.titulosQuitados).toBe(2)
  })

  it("títulos já cancelados não bloqueiam — venda cancelada antes não trava a nova", () => {
    expect(avaliarRecebiveisParaEstorno([t("cancelado", 100, 100)])).toEqual({ bloqueado: false })
  })

  it("a razão é operacional e diz o que fazer — nunca 'Em breve'", () => {
    expect(ESTORNO_BLOQUEIO_RECEBIVEL_QUITADO).toMatch(/Financeiro/)
    expect(ESTORNO_BLOQUEIO_RECEBIVEL_QUITADO).not.toMatch(/em breve/i)
  })
})
