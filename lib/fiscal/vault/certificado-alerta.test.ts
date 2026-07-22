/**
 * GOAL-008 — Alerta estruturado de vencimento (item 8). Níveis determinísticos e puros.
 */
import { describe, it, expect } from "vitest"
import { calcularAlertaVencimento } from "./certificado-alerta"

const AGORA = new Date("2026-07-22T12:00:00.000Z")
const emDias = (n: number) => new Date(AGORA.getTime() + n * 24 * 60 * 60 * 1000)

describe("calcularAlertaVencimento", () => {
  it("sem data ⇒ desconhecido", () => {
    const a = calcularAlertaVencimento(null, AGORA)
    expect(a.nivel).toBe("desconhecido")
    expect(a.diasRestantes).toBeNull()
    expect(a.validoAte).toBeNull()
  })

  it("mais de 30 dias ⇒ ok", () => {
    const a = calcularAlertaVencimento(emDias(120), AGORA)
    expect(a.nivel).toBe("ok")
    expect(a.diasRestantes).toBe(120)
  })

  it("entre 8 e 30 dias ⇒ aviso", () => {
    expect(calcularAlertaVencimento(emDias(30), AGORA).nivel).toBe("aviso")
    expect(calcularAlertaVencimento(emDias(8), AGORA).nivel).toBe("aviso")
  })

  it("de 0 a 7 dias ⇒ critico", () => {
    expect(calcularAlertaVencimento(emDias(7), AGORA).nivel).toBe("critico")
    expect(calcularAlertaVencimento(emDias(0.5), AGORA).nivel).toBe("critico")
  })

  it("no passado ⇒ vencido (diasRestantes negativo)", () => {
    const a = calcularAlertaVencimento(emDias(-3), AGORA)
    expect(a.nivel).toBe("vencido")
    expect(a.diasRestantes).toBeLessThan(0)
  })

  it("respeita limites customizados", () => {
    const a = calcularAlertaVencimento(emDias(10), AGORA, { avisoDias: 5, criticoDias: 2 })
    expect(a.nivel).toBe("ok") // 10 > 5
  })

  it("aceita ISO string", () => {
    expect(calcularAlertaVencimento(emDias(60).toISOString(), AGORA).nivel).toBe("ok")
  })
})
