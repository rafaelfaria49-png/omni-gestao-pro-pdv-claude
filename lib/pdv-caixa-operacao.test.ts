import { afterEach, expect, it, vi } from "vitest"
import { registrarOperacaoCaixaServer } from "./pdv-caixa-operacao"

afterEach(() => { vi.unstubAllGlobals() })

const params = { lojaId: "loja-a", sessaoId: "sessao-a", tipo: "sangria" as const, valor: 7, motivo: "Sintética", localId: "op-1", maxAttempts: 4 }

it("recusa do Caixa Seguro STORE vira approval_required, sem retentar", async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined)
  for (const code of ["store_admin_reauth_required", "store_admin_required"]) {
    const fetchMock = vi.fn(async () => Response.json({ code }, { status: 403 }))
    vi.stubGlobal("fetch", fetchMock)
    expect(await registrarOperacaoCaixaServer(params)).toEqual({ ok: false, reason: "approval_required" })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  }
})

it("outro 403 (permissão comum) segue como client_error", async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined)
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "Sem permissão" }, { status: 403 })))
  expect(await registrarOperacaoCaixaServer(params)).toEqual({ ok: false, reason: "client_error" })
})
