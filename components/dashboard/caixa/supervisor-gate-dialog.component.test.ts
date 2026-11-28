// @vitest-environment jsdom
/**
 * GOAL OMNI-CAIXA-SUPERVISOR-PIN-PROD-DIAGNOSTICO-001 — a recusa do servidor não pode
 * ser apresentada como "Senha inválida" quando o PIN nem chegou a ser comparado.
 * Credenciais sintéticas; nenhum PIN real.
 */
import React from "react"
import { afterEach, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { mensagemRecusaSupervisor, SupervisorGateDialog } from "./supervisor-gate-dialog"

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const PIN = "PIN-SINTETICO-9876"

function abrir(resposta: () => Response) {
  const fetchMock = vi.fn(async () => resposta())
  vi.stubGlobal("fetch", fetchMock)
  const onAuthorized = vi.fn()
  render(React.createElement(SupervisorGateDialog, { open: true, onOpenChange: vi.fn(), onAuthorized }))
  return { fetchMock, onAuthorized }
}

async function enviar() {
  fireEvent.change(document.querySelector("input") as HTMLInputElement, { target: { value: PIN } })
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Autorizar" })) })
}

const casos: Array<[string, number, Record<string, unknown>, RegExp]> = [
  ["PIN incorreto", 401, { error: "invalid_pin" }, /Senha inválida\./],
  ["sessão ausente/expirada", 401, { error: "auth_required" }, /sessão expirou/],
  ["gate de módulo sem sessão", 401, { ok: false, error: "Não autenticado" }, /sessão expirou/],
  ["unidade não resolvida", 400, { error: "store_required" }, /Selecione a unidade ativa/],
  ["unidade não autorizada", 403, { error: "store_forbidden" }, /não tem acesso a esta unidade/],
  ["módulo negado", 403, { ok: false, error: "Sem permissão para este módulo ou unidade." }, /não tem permissão/],
  ["segredo/banco indisponível", 503, { error: "unavailable" }, /indisponível/],
  ["bloqueio temporário", 429, { error: "rate_limited" }, /Muitas tentativas/],
]

for (const [nome, status, corpo, esperado] of casos) {
  it(`${nome} (${status}) mostra mensagem própria e não libera`, async () => {
    const { onAuthorized } = abrir(() => Response.json(corpo, { status }))
    await enviar()
    expect(onAuthorized).not.toHaveBeenCalled()
    const texto = document.body.textContent ?? ""
    expect(texto).toMatch(esperado)
    if (!(corpo.error === "invalid_pin")) expect(texto).not.toMatch(/Senha inválida/)
    expect(texto).not.toContain(PIN)
  })
}

it("sucesso libera com o supervisor devolvido pelo servidor", async () => {
  const { onAuthorized, fetchMock } = abrir(() => Response.json({ ok: true, admin: { id: "sup-1", name: "Sup" } }))
  await enviar()
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(onAuthorized).toHaveBeenCalledWith({ id: "sup-1", name: "Sup" })
})

it("resposta não-JSON cai em mensagem genérica, nunca em senha inválida", () => {
  expect(mensagemRecusaSupervisor(400)).toBe("Não foi possível validar a senha. Tente novamente.")
  expect(mensagemRecusaSupervisor(502)).toMatch(/indisponível/)
})
