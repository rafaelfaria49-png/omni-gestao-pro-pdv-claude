import { afterAll, describe, expect, it } from "vitest"
import { periodoCaixaParaConsulta } from "./historico-periodo"

// Os limites dependem do fuso do processo. O CI roda em UTC, onde o bug de meia-noite
// UTC fica invisível: por isso este arquivo fixa Brasília (Node aplica `TZ` em tempo de
// execução) e devolve o fuso original no fim, sem afetar outros arquivos do worker.
const tzOriginal = process.env.TZ
process.env.TZ = "America/Sao_Paulo"
afterAll(() => {
  if (tzOriginal === undefined) delete process.env.TZ
  else process.env.TZ = tzOriginal
})
const brasilia = new Date("2026-11-07T12:00:00").getTimezoneOffset() === 180

describe("periodoCaixaParaConsulta", () => {
  it("o fuso de Brasília está ativo neste arquivo (senão a prova do bug real seria pulada)", () => {
    expect(brasilia).toBe(true)
  })

  it("sem datas = sem filtro", () => {
    expect(periodoCaixaParaConsulta("", "")).toEqual({ ok: true })
  })

  it("limites do dia no fuso local, nunca meia-noite UTC", () => {
    const r = periodoCaixaParaConsulta("2026-11-07", "2026-11-07")
    expect(r).toEqual({
      ok: true,
      from: new Date(2026, 10, 7, 0, 0, 0, 0).toISOString(),
      to: new Date(2026, 10, 7, 23, 59, 59, 999).toISOString(),
    })
    // A forma ingênua (`new Date("AAAA-MM-DD")`) só coincide quando o fuso é UTC.
    if (new Date().getTimezoneOffset() !== 0 && r.ok) {
      expect(r.from).not.toBe(new Date("2026-11-07").toISOString())
    }
  })

  it.runIf(brasilia)("em Brasília, 07/11 = 07/11 03:00Z até 08/11 02:59:59.999Z", () => {
    expect(periodoCaixaParaConsulta("2026-11-07", "2026-11-07")).toEqual({
      ok: true,
      from: "2026-11-07T03:00:00.000Z",
      to: "2026-11-08T02:59:59.999Z",
    })
  })

  it("só início ou só fim", () => {
    const so = periodoCaixaParaConsulta("2026-11-01", "")
    expect(so.ok && so.from && !("to" in so)).toBe(true)
    const ate = periodoCaixaParaConsulta("", "2026-11-30")
    expect(ate.ok && ate.to && !("from" in ate)).toBe(true)
  })

  it("início depois do fim e data malformada são recusados", () => {
    expect(periodoCaixaParaConsulta("2026-11-08", "2026-11-07")).toEqual({ ok: false, motivo: "inicio-depois-do-fim" })
    expect(periodoCaixaParaConsulta("07/11/2026", "")).toEqual({ ok: false, motivo: "data-invalida" })
    expect(periodoCaixaParaConsulta("2026-13-40", "")).toEqual({ ok: false, motivo: "data-invalida" })
    // Dia inexistente no calendário (o V8 rolaria para 03/03).
    expect(periodoCaixaParaConsulta("2026-02-31", "")).toEqual({ ok: false, motivo: "data-invalida" })
    expect(periodoCaixaParaConsulta("", "2026-04-31")).toEqual({ ok: false, motivo: "data-invalida" })
    expect(periodoCaixaParaConsulta("2028-02-29", "2028-02-29").ok).toBe(true)
  })
})
