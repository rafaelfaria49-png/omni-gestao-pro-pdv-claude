import { describe, expect, it } from "vitest"
import {
  TROCA_BUSINESS_TIMEZONE,
  formatInstantBusinessPtBr,
  formatInstantToBusinessDateTimeLocal,
  parseBusinessDateTimeLocal,
  resolveBusinessDayBounds,
  selectCoveringCashSessionId,
  type CashSessionWindow,
} from "./troca-regularizacao-tempo"

function filterSessionsForBusinessDay(
  allSessions: ReadonlyArray<CashSessionWindow & { storeId: string }>,
  storeId: string,
  dia: string,
  timeZone?: string,
) {
  const bounds = resolveBusinessDayBounds(dia, timeZone)
  if (!bounds.ok) return []
  return allSessions.filter((s) => {
    if (s.storeId !== storeId) return false
    const start = new Date(s.abertaEm).getTime()
    const end = s.fechadaEm ? new Date(s.fechadaEm).getTime() : Number.POSITIVE_INFINITY
    return start <= bounds.fim.getTime() && end >= bounds.inicio.getTime()
  })
}

describe("troca-regularizacao-tempo — contrato canônico de fuso comercial (Cenários 01–15)", () => {
  it("CENÁRIOS 01–05: fronteira exata 23:59:59Z → 00:00:00Z → 00:39:00Z → 02:59:59Z → 03:00:00Z em America/Sao_Paulo", () => {
    expect(TROCA_BUSINESS_TIMEZONE).toBe("America/Sao_Paulo")

    const cases = [
      { id: "01", utc: "2026-11-26T23:59:59.000Z", expectedWall: "2026-11-26T20:59", expectedDia: "2026-11-26", expectedRoundTripIso: "2026-11-26T23:59:00.000Z" },
      { id: "02", utc: "2026-11-27T00:00:00.000Z", expectedWall: "2026-11-26T21:00", expectedDia: "2026-11-26", expectedRoundTripIso: "2026-11-27T00:00:00.000Z" },
      { id: "03", utc: "2026-11-27T00:39:00.000Z", expectedWall: "2026-11-26T21:39", expectedDia: "2026-11-26", expectedRoundTripIso: "2026-11-27T00:39:00.000Z" },
      { id: "04", utc: "2026-11-27T02:59:59.000Z", expectedWall: "2026-11-26T23:59", expectedDia: "2026-11-26", expectedRoundTripIso: "2026-11-27T02:59:00.000Z" },
      { id: "05", utc: "2026-11-27T03:00:00.000Z", expectedWall: "2026-11-27T00:00", expectedDia: "2026-11-27", expectedRoundTripIso: "2026-11-27T03:00:00.000Z" },
    ] as const

    for (const c of cases) {
      const wall = formatInstantToBusinessDateTimeLocal(c.utc)
      expect(wall, `Cenário ${c.id} wall`).toBe(c.expectedWall)

      const parsed = parseBusinessDateTimeLocal(wall)
      expect(parsed.ok, `Cenário ${c.id} parsed.ok`).toBe(true)
      if (!parsed.ok) continue
      expect(parsed.dia, `Cenário ${c.id} dia`).toBe(c.expectedDia)
      expect(parsed.iso, `Cenário ${c.id} iso`).toBe(c.expectedRoundTripIso)

      const bounds = resolveBusinessDayBounds(parsed.dia)
      expect(bounds.ok).toBe(true)
      if (!bounds.ok) continue
      expect(parsed.timestampMs).toBeGreaterThanOrEqual(bounds.inicio.getTime())
      expect(parsed.timestampMs).toBeLessThanOrEqual(bounds.fim.getTime())
    }
  })

  it("CENÁRIO 06: virada de mês (Nov → Dez e Fev bissexto → Mar) preserva o dia comercial correto", () => {
    // 2026-12-01T00:39:00Z = 2026-11-30 21:39 em São Paulo
    expect(formatInstantToBusinessDateTimeLocal("2026-12-01T00:39:00.000Z")).toBe("2026-11-30T21:39")
    const nov30 = parseBusinessDateTimeLocal("2026-11-30T21:39")
    expect(nov30).toMatchObject({ ok: true, dia: "2026-11-30", iso: "2026-12-01T00:39:00.000Z" })

    // 2026-12-01T02:59:59Z ainda é 2026-11-30 23:59; 03:00:00Z vira 2026-12-01 00:00
    expect(formatInstantToBusinessDateTimeLocal("2026-12-01T02:59:59.000Z")).toBe("2026-11-30T23:59")
    expect(formatInstantToBusinessDateTimeLocal("2026-12-01T03:00:00.000Z")).toBe("2026-12-01T00:00")

    // Ano bissexto: 2028-03-01T01:15:00Z = 2028-02-29 22:15 em São Paulo
    expect(formatInstantToBusinessDateTimeLocal("2028-03-01T01:15:00.000Z")).toBe("2028-02-29T22:15")
    const feb29 = parseBusinessDateTimeLocal("2028-02-29T22:15")
    expect(feb29).toMatchObject({ ok: true, dia: "2028-02-29", iso: "2028-03-01T01:15:00.000Z" })

    // Rejeita dia inexistente no calendário (sem normalização silenciosa)
    expect(resolveBusinessDayBounds("2026-02-30")).toEqual({ ok: false })
    expect(parseBusinessDateTimeLocal("2026-02-30T10:00")).toEqual({ ok: false, reason: "invalid_date" })
  })

  it("CENÁRIO 07: virada de ano (31/12 → 01/01) preserva o ano comercial correto", () => {
    expect(formatInstantToBusinessDateTimeLocal("2027-01-01T00:39:00.000Z")).toBe("2026-12-31T21:39")
    expect(formatInstantToBusinessDateTimeLocal("2027-01-01T02:59:59.000Z")).toBe("2026-12-31T23:59")
    expect(formatInstantToBusinessDateTimeLocal("2027-01-01T03:00:00.000Z")).toBe("2027-01-01T00:00")

    const dec31 = parseBusinessDateTimeLocal("2026-12-31T21:39")
    expect(dec31).toMatchObject({ ok: true, dia: "2026-12-31", iso: "2027-01-01T00:39:00.000Z" })

    const boundsDec31 = resolveBusinessDayBounds("2026-12-31")
    expect(boundsDec31.ok).toBe(true)
    if (boundsDec31.ok) {
      expect(boundsDec31.inicio.toISOString()).toBe("2026-12-31T03:00:00.000Z")
      expect(boundsDec31.fim.toISOString()).toBe("2027-01-01T02:59:59.999Z")
    }
  })

  it("CENÁRIOS 08, 09, 10: invariante ao fuso do navegador/servidor (UTC vs America/Sao_Paulo) e reproduz a falha legada na janela 00:00–02:59 UTC", () => {
    // Sessão aberta 00:37Z e fechada 00:40Z (21:37–21:40 BRT de 26/11/2026) — falha exata da CI #409/#410.
    const sessaoCi = {
      id: "sessao-ci-utc-midnight",
      storeId: "loja-b",
      abertaEm: "2026-11-27T00:37:12.000Z",
      fechadaEm: "2026-11-27T00:40:10.000Z",
    }
    const targetInstant = "2026-11-27T00:39:00.000Z"

    // Prova da falha anterior quando um navegador UTC derivava o dia pelo fuso UTC ("2026-11-27"):
    const legacyDiaUtc = targetInstant.slice(0, 10) // "2026-11-27"
    expect(filterSessionsForBusinessDay([sessaoCi], "loja-b", legacyDiaUtc)).toEqual([])

    // Com o contrato canônico, tanto em runtime UTC quanto America/Sao_Paulo, o resultado é idêntico:
    const wall = formatInstantToBusinessDateTimeLocal(targetInstant)
    expect(wall).toBe("2026-11-26T21:39")

    const parsed = parseBusinessDateTimeLocal(wall)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const returned = filterSessionsForBusinessDay([sessaoCi], "loja-b", parsed.dia)
    expect(returned.map((s) => s.id)).toEqual(["sessao-ci-utc-midnight"])
    expect(selectCoveringCashSessionId(returned, parsed.timestampMs)).toBe("sessao-ci-utc-midnight")
    expect(formatInstantBusinessPtBr(sessaoCi.abertaEm)).toContain("26/11/2026")
    expect(formatInstantBusinessPtBr(sessaoCi.abertaEm)).toContain("21:37")
  })

  it("CENÁRIO 11: seleção manual de data histórica (incluindo horário de verão histórico -02:00) sem offset fixo e sem substituir por hoje", () => {
    // 15/11/2018 em America/Sao_Paulo estava em horário de verão (UTC-2, não UTC-3!).
    const dstParsed = parseBusinessDateTimeLocal("2018-11-15T14:30")
    expect(dstParsed).toMatchObject({
      ok: true,
      dia: "2018-11-15",
      iso: "2018-11-15T16:30:00.000Z", // UTC-2, demonstrando ausência de offset fixo -03:00!
    })
    const dstBounds = resolveBusinessDayBounds("2018-11-15")
    expect(dstBounds.ok).toBe(true)
    if (dstBounds.ok) {
      expect(dstBounds.inicio.toISOString()).toBe("2018-11-15T02:00:00.000Z")
      expect(dstBounds.fim.toISOString()).toBe("2018-11-16T01:59:59.999Z")
    }

    // Data histórica recente permanece intacta (nunca substituída pela data atual).
    const hist = parseBusinessDateTimeLocal("2026-08-10T15:20")
    expect(hist).toMatchObject({ ok: true, dia: "2026-08-10", iso: "2026-08-10T18:20:00.000Z" })

    // Respeita fuso customizado caso uma loja utilize outro fuso IANA (ex.: America/Manaus = UTC-4).
    const manaus = parseBusinessDateTimeLocal("2026-11-26T21:39", "America/Manaus")
    expect(manaus).toMatchObject({ ok: true, dia: "2026-11-26", iso: "2026-11-27T01:39:00.000Z" })
  })

  it("CENÁRIOS 12, 13, 14, 15: sessões de dias distintos, ausência legítima, isolamento multiloja e preservação exata do timestamp UTC no banco", () => {
    const allSessions = [
      { id: "s-dia-25", storeId: "loja-b", abertaEm: "2026-11-25T12:00:00.000Z", fechadaEm: "2026-11-25T22:00:00.000Z" },
      { id: "s-dia-26-b", storeId: "loja-b", abertaEm: "2026-11-27T00:10:00.000Z", fechadaEm: "2026-11-27T01:00:00.000Z" },
      { id: "s-dia-26-outra-loja", storeId: "loja-a", abertaEm: "2026-11-27T00:10:00.000Z", fechadaEm: "2026-11-27T01:00:00.000Z" },
      { id: "s-dia-27", storeId: "loja-b", abertaEm: "2026-11-27T11:00:00.000Z", fechadaEm: "2026-11-27T20:00:00.000Z" },
    ]

    // Cenário 12 + 14: dia 2026-11-26 na loja-b retorna APENAS s-dia-26-b (nunca loja-a, nunca dia 25/27).
    const parsed26 = parseBusinessDateTimeLocal("2026-11-26T21:39")
    expect(parsed26.ok).toBe(true)
    if (!parsed26.ok) return
    const sessoes26 = filterSessionsForBusinessDay(allSessions, "loja-b", parsed26.dia)
    expect(sessoes26.map((s) => s.id)).toEqual(["s-dia-26-b"])
    expect(selectCoveringCashSessionId(sessoes26, parsed26.timestampMs)).toBe("s-dia-26-b")

    // Cenário 13: ausência legítima de sessão no dia 2026-11-24.
    const sessoes24 = filterSessionsForBusinessDay(allSessions, "loja-b", "2026-11-24")
    expect(sessoes24).toEqual([])
    const parsed24 = parseBusinessDateTimeLocal("2026-11-24T15:00")
    expect(parsed24.ok).toBe(true)
    if (parsed24.ok) {
      expect(selectCoveringCashSessionId(sessoes24, parsed24.timestampMs)).toBe("")
    }

    // Cenário 15: timestamp absoluto preservado exatamente em UTC para persistência no banco.
    expect(parsed26.iso).toBe("2026-11-27T00:39:00.000Z")
    expect(new Date(parsed26.iso).getTime()).toBe(Date.parse("2026-11-27T00:39:00.000Z"))
  })

  it("cobre virada de sessão noturna cruzando 03:00Z, lacuna/ambiguidade de horário de verão histórico e múltiplas sessões sobrepostas", () => {
    // Sessão noturna única: aberta 26/11 22:00 BRT (27/11 01:00Z) e fechada 27/11 02:00 BRT (27/11 05:00Z).
    const overnight = {
      id: "s-noturna",
      storeId: "loja-b",
      abertaEm: "2026-11-27T01:00:00.000Z",
      fechadaEm: "2026-11-27T05:00:00.000Z",
    }
    expect(filterSessionsForBusinessDay([overnight], "loja-b", "2026-11-26").map((s) => s.id)).toEqual(["s-noturna"])
    expect(filterSessionsForBusinessDay([overnight], "loja-b", "2026-11-27").map((s) => s.id)).toEqual(["s-noturna"])
    const beforeMidnight = parseBusinessDateTimeLocal("2026-11-26T23:30")
    const afterMidnight = parseBusinessDateTimeLocal("2026-11-27T01:30")
    expect(beforeMidnight.ok && selectCoveringCashSessionId([overnight], beforeMidnight.timestampMs)).toBe("s-noturna")
    expect(afterMidnight.ok && selectCoveringCashSessionId([overnight], afterMidnight.timestampMs)).toBe("s-noturna")

    // Horário de verão histórico em America/Sao_Paulo: lacuna (04/11/2018 00:30) e ambíguo (16/02/2019 23:30).
    expect(parseBusinessDateTimeLocal("2018-11-04T00:30")).toEqual({ ok: false, reason: "ambiguous_or_nonexistent" })
    expect(parseBusinessDateTimeLocal("2019-02-16T23:30")).toEqual({ ok: false, reason: "ambiguous_or_nonexistent" })

    // Múltiplas sessões sobrepostas (ex.: dois terminais simultâneos) nunca escolhem arbitrariamente.
    const overlapping: CashSessionWindow[] = [
      { id: "s-term-1", abertaEm: "2026-11-26T12:00:00.000Z", fechadaEm: "2026-11-26T22:00:00.000Z" },
      { id: "s-term-2", abertaEm: "2026-11-26T13:00:00.000Z", fechadaEm: "2026-11-26T21:00:00.000Z" },
    ]
    expect(selectCoveringCashSessionId(overlapping, Date.parse("2026-11-26T15:00:00.000Z"))).toBe("")
  })
})
