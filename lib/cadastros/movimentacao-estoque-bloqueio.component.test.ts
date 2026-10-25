// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"

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
const INVALIDA = { comercial: { version: 2, modoVenda: "unidade", unidade: "UN", basePreco: "UN" } }

function modal(metadata: unknown) {
  return render(React.createElement(MovimentacaoEstoqueModal, {
    open: true, onClose: vi.fn(), storeId: "loja-a",
    produto: { id: "p-1", nome: "Produto", estoque: 4, metadata },
  }))
}

describe("Modal de movimentação com produto bloqueado e saldo divergente", () => {
  it.each([
    ["peso em preparação, reconciliação automática possível", KG, true, /venda por peso em preparação/],
    ["peso em preparação, exige ajuste", KG, false, /venda por peso em preparação/],
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
})
