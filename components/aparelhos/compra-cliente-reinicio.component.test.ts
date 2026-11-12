// @vitest-environment jsdom
/**
 * Regressão (CI PR #347 · E2E 02): o painel recarrega o resumo depois de cada ação e a política
 * chega com nova identidade. O assistente de compra zerava e perdia a tela do protocolo.
 */
import React, { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { POLITICA_PADRAO, type PoliticaAparelhos } from "@/lib/aparelhos/policy"
import { aparelhoPermissionsForRole } from "@/lib/aparelhos/permissions"

const h = vi.hoisted(() => ({
  api: vi.fn(async (_storeId: string, _path: string, _init?: unknown) => ({ aquisicao: { id: "aq-1", protocolo: "AQ-2026-0001" } })),
}))
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock("@/app/actions/cadastros", () => ({ listFornecedores: vi.fn(async () => []) }))
vi.mock("@/components/aparelhos/api", async (orig) => ({ ...(await orig<object>()), apiAparelhos: h.api, abrirDocumento: vi.fn() }))

import { CompraClienteDialog } from "@/components/aparelhos/CompraClienteDialog"
import { useReiniciarAoAbrir } from "@/components/aparelhos/use-reiniciar-ao-abrir"

afterEach(() => { cleanup(); h.api.mockClear() })

function luhn(body14: string): string {
  let sum = 0
  for (let i = 0; i < 14; i++) { let d = Number(body14[i]); if ((14 - i) % 2 === 1) { d *= 2; if (d > 9) d -= 9 } sum += d }
  return body14 + String((10 - (sum % 10)) % 10)
}

const perms = aparelhoPermissionsForRole("vendedor")

/** Igual ao painel: `onDone` recarrega o resumo, e a política volta como objeto novo. */
function Painel({ inicial }: { inicial: PoliticaAparelhos }) {
  const [politica, setPolitica] = useState(inicial)
  const [open, setOpen] = useState(true)
  return React.createElement(React.Fragment, null,
    React.createElement("button", { type: "button", onClick: () => setPolitica((p) => ({ ...p })) }, "recarregar resumo"),
    React.createElement("button", { type: "button", onClick: () => setOpen(true) }, "abrir de novo"),
    React.createElement(CompraClienteDialog, { open, onOpenChange: setOpen, storeId: "loja-a", perms, politica, onDone: () => setPolitica((p) => ({ ...p })) }))
}

const campo = (id: string) => document.getElementById(id) as HTMLInputElement
const preencher = (id: string, value: string) => fireEvent.change(campo(id), { target: { value } })
const continuar = () => fireEvent.click(screen.getByRole("button", { name: "Continuar" }))

describe("assistente de compra de cliente × recarga do resumo", () => {
  it("compra registrada continua mostrando o protocolo quando o resumo recarrega", async () => {
    render(React.createElement(Painel, { inicial: POLITICA_PADRAO }))
    preencher("cc-nome", "Maria Vendedora Sintética"); preencher("cc-doc", "529.982.247-25"); continuar()
    preencher("cc-marca", "Samsung"); preencher("cc-modelo", "Galaxy S22"); preencher("cc-arm", "256 GB")
    preencher("cc-imei1", luhn("35467812345603")); preencher("cc-preco", "2799"); continuar()
    preencher("cc-valor", "2100"); continuar()
    fireEvent.click(screen.getByRole("button", { name: "Registrar compra" }))
    await waitFor(() => expect(h.api).toHaveBeenCalledOnce())
    expect(await screen.findByText("Protocolo AQ-2026-0001 registrado")).toBeTruthy()
    expect(document.getElementById("cc-nome")).toBeNull()
  })
  it("recarga do resumo com o assistente aberto não apaga o que foi digitado", () => {
    render(React.createElement(Painel, { inicial: POLITICA_PADRAO }))
    preencher("cc-nome", "Maria Vendedora Sintética")
    fireEvent.click(screen.getByRole("button", { name: "recarregar resumo", hidden: true }))
    expect(campo("cc-nome").value).toBe("Maria Vendedora Sintética")
  })
})

describe("useReiniciarAoAbrir", () => {
  function Sonda({ open, valor, onReinicio }: { open: boolean; valor: object; onReinicio: (v: object) => void }) {
    useReiniciarAoAbrir(open, () => onReinicio(valor))
    return null
  }
  it("reinicia só na transição fechado → aberto, com os valores do momento da abertura", () => {
    const onReinicio = vi.fn()
    const a = { v: 1 }, b = { v: 1 }, c = { v: 2 }
    const ui = render(React.createElement(Sonda, { open: false, valor: a, onReinicio }))
    expect(onReinicio).not.toHaveBeenCalled()
    ui.rerender(React.createElement(Sonda, { open: true, valor: a, onReinicio }))
    ui.rerender(React.createElement(Sonda, { open: true, valor: b, onReinicio }))
    expect(onReinicio.mock.calls).toEqual([[a]])
    ui.rerender(React.createElement(Sonda, { open: false, valor: b, onReinicio }))
    ui.rerender(React.createElement(Sonda, { open: true, valor: c, onReinicio }))
    expect(onReinicio.mock.calls).toEqual([[a], [c]])
  })
})
