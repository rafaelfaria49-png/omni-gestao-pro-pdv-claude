import { describe, expect, it } from "vitest"
import { buildPrintDocument, DuplicateGuard, validatePrintRequest, validateStation } from "../../src/shared/print-protocol"

describe("print-protocol", () => {
  it("valida estação", () => {
    expect(validateStation({ deviceName: " POS-80 ", bobina: "80mm" })).toEqual({ deviceName: "POS-80", bobina: "80mm" })
    expect(validateStation({ deviceName: "POS-80", bobina: "100mm" })).toBeNull()
    expect(validateStation({ deviceName: "a\nb", bobina: "58mm" })).toBeNull()
    expect(validateStation({ deviceName: "", bobina: "58mm" })).toBeNull()
    expect(validateStation(null)).toBeNull()
  })
  it("valida pedido de impressão", () => {
    expect(validatePrintRequest({ html: "<p>x</p>" })?.kind).toBe("receipt")
    expect(validatePrintRequest({ html: "" })).toBeNull()
    expect(validatePrintRequest({ html: "x".repeat(300 * 1024) })).toBeNull()
    expect(validatePrintRequest({ html: "x", kind: "cmd" })).toBeNull()
    expect(validatePrintRequest({ html: "x", bobina: "100mm" })).toBeNull()
    expect(validatePrintRequest({ html: "<p>ignorado</p>", kind: "test" })).toMatchObject({ kind: "test", html: "" })
  })
  it("documento bloqueia scripts por CSP e não força página", () => {
    const doc = buildPrintDocument("<script>alert(1)</script>", "80mm")
    expect(doc).toContain("script-src 'none'")
    expect(doc).toContain("width: 64mm")
    expect(buildPrintDocument("x", "58mm")).toContain("width: 46mm")
  })
  it("suprime duplicata só dentro da janela", () => {
    const g = new DuplicateGuard(5000)
    expect(g.isDuplicate("a", 0)).toBe(false)
    expect(g.isDuplicate("a", 1000)).toBe(true)
    expect(g.isDuplicate("a", 7000)).toBe(false)
    g.forget("a")
    expect(g.isDuplicate("a", 7001)).toBe(false)
  })
})
