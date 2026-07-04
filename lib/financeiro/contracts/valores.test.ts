import { describe, it, expect } from "vitest"
import { formatDateBR, parseDateStringSafe, isOverdueDateString } from "./valores"

// ============================================================================
// FINANCEIRO-RECEBER-CLIENTE-DATEFIX-002
// ----------------------------------------------------------------------------
// A UI do Financeiro HUB fazia `new Date(r.venc)` sobre vencimentos gravados
// como texto `dd/mm/aaaa` (adapter OS e venda PDV à prazo). O construtor nativo
// `Date` interpreta strings `xx/yy/zzzz` como `mm/dd/aaaa`: quando o dia > 12 o
// "mês" fica inválido e o resultado vira "Invalid Date"; quando o dia <= 12 o
// valor é lido silenciosamente errado (mês e dia trocados). Estes testes travam
// o comportamento do parser/formatador seguro reaproveitado pela UI.
// ============================================================================

describe("parseDateStringSafe", () => {
  it("interpreta ISO yyyy-mm-dd corretamente", () => {
    const d = parseDateStringSafe("2026-07-25")
    expect(d).not.toBeNull()
    expect(d!.getFullYear()).toBe(2026)
    expect(d!.getMonth()).toBe(6) // julho = índice 6
    expect(d!.getDate()).toBe(25)
  })

  it("interpreta dd/mm/aaaa com dia > 12 sem virar inválido", () => {
    const d = parseDateStringSafe("25/07/2026")
    expect(d).not.toBeNull()
    expect(d!.getDate()).toBe(25)
    expect(d!.getMonth()).toBe(6) // julho, não "mês 25"
    expect(d!.getFullYear()).toBe(2026)
  })

  it("interpreta dd/mm/aaaa com dia <= 12 sem inverter mês/dia", () => {
    const d = parseDateStringSafe("03/07/2026")
    expect(d).not.toBeNull()
    expect(d!.getDate()).toBe(3)
    expect(d!.getMonth()).toBe(6) // julho — não deve virar "dia 7 de março"
    expect(d!.getFullYear()).toBe(2026)
  })

  it("retorna null para vazio/nulo/indefinido", () => {
    expect(parseDateStringSafe("")).toBeNull()
    expect(parseDateStringSafe(null)).toBeNull()
    expect(parseDateStringSafe(undefined)).toBeNull()
  })

  it("retorna null para texto não interpretável como data", () => {
    expect(parseDateStringSafe("não é uma data")).toBeNull()
  })
})

describe("formatDateBR", () => {
  it("formata ISO para pt-BR", () => {
    expect(formatDateBR("2026-07-25")).toBe("25/07/2026")
  })

  it("formata dd/mm/aaaa com dia > 12 sem virar Invalid Date", () => {
    const out = formatDateBR("25/07/2026")
    expect(out).not.toMatch(/invalid/i)
    expect(out).toBe("25/07/2026")
  })

  it("formata dd/mm/aaaa com dia <= 12 sem inverter mês/dia", () => {
    expect(formatDateBR("03/07/2026")).toBe("03/07/2026")
  })

  it("usa o fallback honesto para vencimento vazio", () => {
    expect(formatDateBR("", "Sem vencimento")).toBe("Sem vencimento")
    expect(formatDateBR(null, "Sem vencimento")).toBe("Sem vencimento")
  })

  it("usa o fallback honesto para vencimento inválido (nunca 'Invalid Date')", () => {
    const out = formatDateBR("lixo-invalido")
    expect(out).not.toMatch(/invalid/i)
    expect(out).toBe("—")
  })

  it("aceita fallback default '—' quando não informado", () => {
    expect(formatDateBR(undefined)).toBe("—")
  })
})

describe("isOverdueDateString (regressão de parsing)", () => {
  it("não lança e não trata dd/mm/aaaa com dia > 12 como data inválida", () => {
    const hoje = new Date(2026, 6, 1) // 01/07/2026
    expect(isOverdueDateString("25/07/2026", hoje)).toBe(false) // no futuro
    expect(isOverdueDateString("25/06/2026", hoje)).toBe(true) // no passado
  })
})
