import { describe, expect, it } from "vitest"
import {
  REGRAS_DATA_POR_FONTE,
  TIMEZONE_CONTADOR,
  competenciaAnterior,
  competenciaAtual,
  competenciaProxima,
  formatCompetencia,
  formatCompetenciaMmYyyy,
  isCompetencia,
  labelCompetencia,
  labelCompetenciaCurta,
  parseCompetencia,
  resolveCompetenciaFromSearchParam,
  resolvePeriodoUtc,
  type Competencia,
} from "./competencia"

describe("parseCompetencia", () => {
  it("aceita AAAA-MM estrito", () => {
    expect(parseCompetencia("2026-06")).toEqual({ ano: 2026, mes: 6 })
    expect(parseCompetencia("2026-01")).toEqual({ ano: 2026, mes: 1 })
    expect(parseCompetencia("2026-12")).toEqual({ ano: 2026, mes: 12 })
    expect(parseCompetencia("1999-10")).toEqual({ ano: 1999, mes: 10 })
  })

  it("rejeita formatos inválidos", () => {
    const invalid = [
      "",
      "2026-6",
      "2026-00",
      "2026-13",
      "26-06",
      "2026/06",
      "2026-06-01",
      " 2026-06",
      "2026-06 ",
      "2026-06\n",
      "junho/2026",
      "null",
      null,
      undefined,
      202606,
      { ano: 2026, mes: 6 },
      ["2026-06"],
    ]
    for (const v of invalid) {
      expect(parseCompetencia(v), String(v)).toBeNull()
    }
  })
})

describe("formatCompetencia / labels", () => {
  const c: Competencia = { ano: 2026, mes: 6 }

  it("formata canônico AAAA-MM com zero à esquerda", () => {
    expect(formatCompetencia(c)).toBe("2026-06")
    expect(formatCompetencia({ ano: 2026, mes: 1 })).toBe("2026-01")
  })

  it("label em português", () => {
    expect(labelCompetencia(c)).toBe("Junho / 2026")
    expect(labelCompetenciaCurta(c)).toBe("Junho/2026")
    expect(formatCompetenciaMmYyyy(c)).toBe("06/2026")
    expect(labelCompetencia({ ano: 2026, mes: 1 })).toBe("Janeiro / 2026")
    expect(labelCompetencia({ ano: 2026, mes: 3 })).toBe("Março / 2026")
  })

  it("round-trip parse ↔ format", () => {
    const raw = "2018-02"
    const parsed = parseCompetencia(raw)
    expect(parsed).not.toBeNull()
    expect(formatCompetencia(parsed!)).toBe(raw)
  })
})

describe("competenciaAtual (America/Sao_Paulo)", () => {
  it("usa o fuso canônico", () => {
    expect(TIMEZONE_CONTADOR).toBe("America/Sao_Paulo")
  })

  it("resolve o mês local de SP — mesmo UTC pode ser mês anterior/seguinte no fuso", () => {
    // 2026-07-01 02:30 UTC ainda é 30/06 23:30 em SP (UTC-3) → junho
    const aindaJunho = new Date("2026-07-01T02:30:00.000Z")
    expect(competenciaAtual(aindaJunho)).toEqual({ ano: 2026, mes: 6 })

    // 2026-07-01 03:00 UTC = 01/07 00:00 SP → julho
    const jaJulho = new Date("2026-07-01T03:00:00.000Z")
    expect(competenciaAtual(jaJulho)).toEqual({ ano: 2026, mes: 7 })

    // Fronteira de ano em SP
    const aindaDez = new Date("2027-01-01T02:59:59.000Z")
    expect(competenciaAtual(aindaDez)).toEqual({ ano: 2026, mes: 12 })

    const jaJan = new Date("2027-01-01T03:00:00.000Z")
    expect(competenciaAtual(jaJan)).toEqual({ ano: 2027, mes: 1 })
  })
})

describe("resolvePeriodoUtc — semiaberto e DST histórico", () => {
  it("2026-06 (sem horário de verão): [2026-06-01T03:00Z, 2026-07-01T03:00Z)", () => {
    const p = resolvePeriodoUtc({ ano: 2026, mes: 6 })
    expect(p.inicio.toISOString()).toBe("2026-06-01T03:00:00.000Z")
    expect(p.fimExclusivo.toISOString()).toBe("2026-07-01T03:00:00.000Z")
    expect(p.inicio.getTime()).toBeLessThan(p.fimExclusivo.getTime())
  })

  it("2017-12 (horário de verão BR, UTC-2): meia-noite local = 02:00Z", () => {
    // Brasil em horário de verão em dez/2017 (UTC-2).
    const p = resolvePeriodoUtc({ ano: 2017, mes: 12 })
    expect(p.inicio.toISOString()).toBe("2017-12-01T02:00:00.000Z")
    // Jan/2018 ainda em DST até fev/2018 → também UTC-2
    expect(p.fimExclusivo.toISOString()).toBe("2018-01-01T02:00:00.000Z")
  })

  it("2018-02 → 2018-03: fim pode cruzar saída do horário de verão", () => {
    // DST BR 2017/2018 encerrou em 2018-02-18 (domingo).
    // 2018-02-01 00:00 SP = UTC-2; 2018-03-01 00:00 SP = UTC-3.
    const p = resolvePeriodoUtc({ ano: 2018, mes: 2 })
    expect(p.inicio.toISOString()).toBe("2018-02-01T02:00:00.000Z")
    expect(p.fimExclusivo.toISOString()).toBe("2018-03-01T03:00:00.000Z")
  })

  it("intervalo semiaberto: instante do fimExclusivo não pertence ao mês", () => {
    const p = resolvePeriodoUtc({ ano: 2026, mes: 6 })
    // Último ms do intervalo ainda é junho
    const lastMs = new Date(p.fimExclusivo.getTime() - 1)
    expect(competenciaAtual(lastMs)).toEqual({ ano: 2026, mes: 6 })
    // O próprio fimExclusivo já é julho
    expect(competenciaAtual(p.fimExclusivo)).toEqual({ ano: 2026, mes: 7 })
  })

  it("virada de ano: dezembro → janeiro", () => {
    const p = resolvePeriodoUtc({ ano: 2025, mes: 12 })
    expect(p.inicio.toISOString()).toBe("2025-12-01T03:00:00.000Z")
    expect(p.fimExclusivo.toISOString()).toBe("2026-01-01T03:00:00.000Z")
  })
})

describe("navegação anterior/próxima", () => {
  it("avança e retrocede dentro do ano", () => {
    expect(competenciaProxima({ ano: 2026, mes: 6 })).toEqual({ ano: 2026, mes: 7 })
    expect(competenciaAnterior({ ano: 2026, mes: 6 })).toEqual({ ano: 2026, mes: 5 })
  })

  it("cruza virada de ano", () => {
    expect(competenciaProxima({ ano: 2026, mes: 12 })).toEqual({ ano: 2027, mes: 1 })
    expect(competenciaAnterior({ ano: 2026, mes: 1 })).toEqual({ ano: 2025, mes: 12 })
  })

  it("round-trip anterior ↔ próxima", () => {
    const base: Competencia = { ano: 2026, mes: 6 }
    expect(competenciaProxima(competenciaAnterior(base))).toEqual(base)
    expect(competenciaAnterior(competenciaProxima(base))).toEqual(base)
  })
})

describe("resolveCompetenciaFromSearchParam", () => {
  const fixedNow = new Date("2026-06-15T15:00:00.000Z")

  it("usa c válido", () => {
    expect(resolveCompetenciaFromSearchParam("2025-03", fixedNow)).toEqual({
      ano: 2025,
      mes: 3,
    })
  })

  it("array (Next.js) usa o primeiro valor", () => {
    expect(resolveCompetenciaFromSearchParam(["2024-11", "2024-12"], fixedNow)).toEqual({
      ano: 2024,
      mes: 11,
    })
  })

  it("ausente ou inválido → competência atual em SP", () => {
    expect(resolveCompetenciaFromSearchParam(undefined, fixedNow)).toEqual({
      ano: 2026,
      mes: 6,
    })
    expect(resolveCompetenciaFromSearchParam("2026-6", fixedNow)).toEqual({
      ano: 2026,
      mes: 6,
    })
    expect(resolveCompetenciaFromSearchParam("foo", fixedNow)).toEqual({
      ano: 2026,
      mes: 6,
    })
  })
})

describe("isCompetencia / tabela de regras", () => {
  it("valida shape", () => {
    expect(isCompetencia({ ano: 2026, mes: 6 })).toBe(true)
    expect(isCompetencia({ ano: 2026, mes: 0 })).toBe(false)
    expect(isCompetencia({ ano: 2026, mes: 13 })).toBe(false)
    expect(isCompetencia({ ano: 2026.5, mes: 6 })).toBe(false)
    expect(isCompetencia(null)).toBe(false)
  })

  it("tabela documental de regras de data existe e menciona NF autorizada", () => {
    expect(REGRAS_DATA_POR_FONTE.length).toBeGreaterThanOrEqual(4)
    const nf = REGRAS_DATA_POR_FONTE.find((r) => r.fonte === "nota_fiscal")
    expect(nf).toBeDefined()
    expect(nf!.campoData).toBe("dataEmissao")
    expect(nf!.filtroStatus).toBe("autorizado")
    expect(nf!.notas).toMatch(/CONTADOR_FISCAL_READER/)
  })
})
