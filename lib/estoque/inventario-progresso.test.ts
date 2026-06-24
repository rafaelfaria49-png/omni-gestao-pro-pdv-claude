/**
 * INVENTARIO_CONTINUO_V01 — Testes do núcleo PURO de progresso/saneamento (sem Prisma).
 */
import { describe, expect, it } from "vitest"
import {
  percentualConcluido,
  diffDiasCalendario,
  classificarDiaSaneamento,
  agruparSaneamentoPorDia,
  type EventoSaneamento,
} from "./inventario-progresso"

describe("percentualConcluido", () => {
  it("calcula a fração conferida do catálogo (arredondada)", () => {
    expect(percentualConcluido(0, 100)).toBe(0)
    expect(percentualConcluido(50, 100)).toBe(50)
    expect(percentualConcluido(1245, 4683)).toBe(27) // exemplo do GOAL
    expect(percentualConcluido(100, 100)).toBe(100)
  })
  it("total 0 → 0 (sem divisão por zero); trava em 0–100; ignora excesso", () => {
    expect(percentualConcluido(10, 0)).toBe(0)
    expect(percentualConcluido(-5, 100)).toBe(0)
    expect(percentualConcluido(150, 100)).toBe(100)
  })
})

describe("diffDiasCalendario / classificarDiaSaneamento", () => {
  const agora = new Date(2026, 5, 23, 15, 0, 0) // 23/06/2026 15:00 local

  it("conta dias-calendário locais (ignora hora)", () => {
    expect(diffDiasCalendario(new Date(2026, 5, 23, 1, 0, 0), agora)).toBe(0)
    expect(diffDiasCalendario(new Date(2026, 5, 22, 23, 0, 0), agora)).toBe(1)
    expect(diffDiasCalendario(new Date(2026, 5, 17, 12, 0, 0), agora)).toBe(6)
  })

  it("classifica hoje / ontem / semana / anterior em faixas exclusivas", () => {
    expect(classificarDiaSaneamento(new Date(2026, 5, 23, 8, 0, 0), agora)).toBe("hoje")
    expect(classificarDiaSaneamento(new Date(2026, 5, 22, 8, 0, 0), agora)).toBe("ontem")
    expect(classificarDiaSaneamento(new Date(2026, 5, 19, 8, 0, 0), agora)).toBe("semana")
    expect(classificarDiaSaneamento(new Date(2026, 5, 10, 8, 0, 0), agora)).toBe("anterior")
  })

  it("futuro cai em hoje; data inválida cai em anterior", () => {
    expect(classificarDiaSaneamento(new Date(2026, 5, 24, 8, 0, 0), agora)).toBe("hoje")
    expect(classificarDiaSaneamento("nao-e-data", agora)).toBe("anterior")
  })
})

describe("agruparSaneamentoPorDia", () => {
  const agora = new Date(2026, 5, 23, 18, 0, 0)
  const ev = (em: Date, tipo: EventoSaneamento["tipo"]): EventoSaneamento => ({ em, tipo })

  it("separa hoje/ontem e acumula a semana (inclui hoje+ontem)", () => {
    const eventos: EventoSaneamento[] = [
      // hoje: 2 conferidos, 1 novo, 1 reconciliado
      ev(new Date(2026, 5, 23, 9, 0, 0), "conferido"),
      ev(new Date(2026, 5, 23, 10, 0, 0), "conferido"),
      ev(new Date(2026, 5, 23, 11, 0, 0), "novo"),
      ev(new Date(2026, 5, 23, 12, 0, 0), "reconciliado"),
      // ontem: 1 conferido
      ev(new Date(2026, 5, 22, 9, 0, 0), "conferido"),
      // 3 dias atrás (entra só na semana)
      ev(new Date(2026, 5, 20, 9, 0, 0), "conferido"),
      // 10 dias atrás (anterior — fora de tudo)
      ev(new Date(2026, 5, 13, 9, 0, 0), "conferido"),
    ]
    const r = agruparSaneamentoPorDia(eventos, agora)
    expect(r.hoje).toEqual({ conferidos: 2, novos: 1, reconciliados: 1 })
    expect(r.ontem).toEqual({ conferidos: 1, novos: 0, reconciliados: 0 })
    // semana = hoje(2) + ontem(1) + 3-dias(1) = 4 conferidos, 1 novo, 1 reconciliado
    expect(r.semana).toEqual({ conferidos: 4, novos: 1, reconciliados: 1 })
  })

  it("lista vazia → tudo zero; usa new Date() como padrão sem quebrar", () => {
    const r = agruparSaneamentoPorDia([])
    expect(r.hoje).toEqual({ conferidos: 0, novos: 0, reconciliados: 0 })
    expect(r.semana).toEqual({ conferidos: 0, novos: 0, reconciliados: 0 })
  })
})
