import { describe, expect, it } from "vitest"
import { leituraEmpresaWhere, respostaFinanceiraPrivada } from "./read-scope"

describe("G003 contrato de leitura (unitário; PostgreSQL prova o isolamento)", () => {
  it.each([undefined, null, "", "  ", 42])("loja ausente/inválida %s nunca vira consulta global", input => {
    expect(() => Reflect.apply(leituraEmpresaWhere, undefined, [input, {}])).toThrow()
  })
  it("resposta preserva Vary existente e impede cache inclusive de recusa", () => {
    const response = respostaFinanceiraPrivada(new Response("negado", { status: 403,
      headers: { Vary: "Accept-Encoding", "Cache-Control": "public, max-age=3600" } }))
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0")
    expect(response.headers.get("vary")).toContain("Accept-Encoding")
    expect(response.headers.get("vary")).toContain("Cookie")
    expect(response.headers.get("pragma")).toBe("no-cache")
  })
})
