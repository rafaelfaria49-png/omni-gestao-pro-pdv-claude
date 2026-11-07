// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

/**
 * Modal real de movimentação com produto bloqueado (peso em preparação / declaração
 * inválida) e saldo divergente: nenhuma orientação pode apontar para Entrada/Ajuste,
 * que não existem para o produto. Server Actions mockadas; nada é gravado.
 */
const h = vi.hoisted(() => ({
  entradaPodeReconciliar: false,
  diagnosticar: vi.fn(),
  entrada: vi.fn(),
  ajuste: vi.fn(),
}))
vi.mock("@/app/actions/estoque", () => ({
  registrarEntradaEstoque: h.entrada,
  registrarAjusteEstoque: h.ajuste,
  listMovimentacoesEstoque: vi.fn(async () => []),
  diagnosticarSaldoEstoque: h.diagnosticar,
}))

import { MovimentacaoEstoqueModal } from "@/components/cadastros/lovable/components/cadastros/MovimentacaoEstoqueModal"

beforeEach(() => {
  h.diagnosticar.mockReset().mockImplementation(async () => ({
    ok: true, aligned: false, stock: 4, somaDepositos: 6, gap: 2, driftReason: "x", authority: "y",
    lastLedgerEstoqueDepois: null, depositCount: 1, positiveDepositCount: 1,
    entradaPodeReconciliar: h.entradaPodeReconciliar,
    operatorMessage: "Faça um ajuste para alinhar o saldo.", detalhe: "",
  }))
  h.entrada.mockReset()
  h.ajuste.mockReset()
})
afterEach(cleanup)

const KG = { comercial: { version: 1, modoVenda: "peso", unidade: "KG", basePreco: "KG" } }
const G = { comercial: { version: 1, modoVenda: "peso", unidade: "G", basePreco: "G" } }
const INVALIDA = { comercial: { version: 2, modoVenda: "unidade", unidade: "UN", basePreco: "UN" } }

function modal(metadata: unknown, estoque = 4) {
  return render(React.createElement(MovimentacaoEstoqueModal, {
    open: true, onClose: vi.fn(), storeId: "loja-a",
    produto: { id: "p-1", nome: "Produto", estoque, metadata },
  }))
}

describe("Modal de movimentação com produto bloqueado e saldo divergente", () => {
  it.each([
    ["peso em G, reconciliação automática possível", G, true, /venda por peso em preparação/],
    ["peso em G, exige ajuste", G, false, /venda por peso em preparação/],
    ["declaração inválida, reconciliação automática possível", INVALIDA, true, /declaração comercial inválida/],
    ["declaração inválida, exige ajuste", INVALIDA, false, /declaração comercial inválida/],
  ])("%s: só informação compatível com as ações disponíveis", async (_label, metadata, reconcile, reason) => {
    h.entradaPodeReconciliar = reconcile
    modal(metadata)
    await screen.findByText("Saldo do cadastro e dos depósitos divergem.")
    expect(document.querySelector("[data-estoque-bloqueio]")?.textContent).toMatch(reason)
    const text = document.body.textContent ?? ""
    expect(text).not.toMatch(/aba Ajuste|corrigida automaticamente|Faça um ajuste/)
    expect(screen.queryByRole("button", { name: "Resolver saldo" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Entrada" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Ajuste" })).toBeNull()
    expect(screen.getByRole("button", { name: "Histórico" })).toBeTruthy()
    expect(text).toMatch(/A correção fica disponível quando a movimentação for liberada/)
    expect(h.entrada).not.toHaveBeenCalled()
    expect(h.ajuste).not.toHaveBeenCalled()
  })

  it("produto UN com divergência mantém a orientação de reconciliação existente", async () => {
    h.entradaPodeReconciliar = false
    modal({})
    await waitFor(() => expect(document.body.textContent).toMatch(/Faça um ajuste para alinhar o saldo/))
    expect(document.body.textContent).toMatch(/Confirme primeiro o saldo físico na aba Ajuste/)
    expect(screen.getByRole("button", { name: "Resolver saldo" })).toBeTruthy()
    expect(document.querySelector("[data-estoque-bloqueio]")).toBeNull()
  })

  it("KG divergente sem reconciliação: Entrada travada e nenhuma orientação para o Ajuste inexistente", async () => {
    h.entradaPodeReconciliar = false
    modal(KG)
    await waitFor(() => expect(document.body.textContent).toMatch(/O ajuste de saldo em KG ainda não está disponível/))
    expect(screen.queryByRole("button", { name: "Ajuste" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Resolver saldo" })).toBeNull()
    expect(document.body.textContent).not.toMatch(/aba Ajuste/)
    expect((screen.getByRole("button", { name: "Registrar entrada" }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe("Entrada manual em KG", () => {
  beforeEach(() => {
    h.diagnosticar.mockReset().mockImplementation(async () => ({ ok: true, aligned: true }))
  })

  it("aceita 2,500 kg, mostra a prévia em milésimos e envia o valor exato", async () => {
    h.entrada.mockResolvedValue({ ok: true, movimentacaoId: "m1", estoqueDepois: 2.5, custoMedioDepois: 0 })
    const onSaved = vi.fn()
    render(React.createElement(MovimentacaoEstoqueModal, {
      open: true, onClose: vi.fn(), storeId: "loja-a", onSaved,
      produto: { id: "p-1", nome: "PAO FRANCES", estoque: 0, metadata: KG },
    }))
    expect(screen.queryByRole("button", { name: "Ajuste" })).toBeNull()
    expect(document.querySelector("[data-estoque-ajuste-kg]")?.textContent).toMatch(/Ajuste de saldo em KG ainda não está disponível/)
    const input = screen.getByLabelText("Quantidade a entrar (kg) *")
    fireEvent.change(input, { target: { value: "2,500" } })
    expect(document.body.textContent).toMatch(/Novo saldo2,500 kg/)
    fireEvent.click(screen.getByRole("button", { name: "Registrar entrada" }))
    await waitFor(() => expect(h.entrada).toHaveBeenCalledTimes(1))
    expect(h.entrada.mock.calls[0][1]).toMatchObject({ produtoId: "p-1", quantidade: 2.5 })
    await screen.findByText(/Entrada registrada\. Saldo: 2,500 kg/)
    expect(onSaved).toHaveBeenCalledWith({ estoqueDepois: 2.5 })
  })

  it("prévia de 2,500 + 0,750 soma em milésimos: 3,250 kg", () => {
    modal(KG, 2.5)
    expect(document.querySelector("[data-saldo-atual]")?.textContent).toBe("2,500")
    fireEvent.change(screen.getByLabelText("Quantidade a entrar (kg) *"), { target: { value: "0,750" } })
    expect(document.body.textContent).toMatch(/Novo saldo3,250 kg/)
  })

  it.each([
    ["2.500", /Use vírgula para os decimais/],
    ["0,7505", /no máximo 3 casas decimais/],
    ["1/2", /Quantidade inválida/],
    ["0,000", /maior que zero/],
  ])("recusa %s sem chamar o servidor", async (valor, erro) => {
    modal(KG, 0)
    fireEvent.change(screen.getByLabelText("Quantidade a entrar (kg) *"), { target: { value: valor } })
    fireEvent.click(screen.getByRole("button", { name: "Registrar entrada" }))
    expect((await screen.findByRole("alert")).textContent).toMatch(erro)
    expect(h.entrada).not.toHaveBeenCalled()
  })
})
