import { describe, expect, it, vi } from "vitest"
import {
  closeAccessoryDialog,
  completeAccessoryDialogConfirmation,
  createEmptyAccessoryDialogState,
  shouldCloseAccessoryDialog,
} from "./selecionar-acessorio-dialog"

describe("SelecionarAcessorioDialog — ciclo de fechamento", () => {
  it("confirmar fecha somente depois que a linha foi adicionada", () => {
    const events: string[] = []
    const line = { cartLineKey: "capinha:a06:preto" }

    const confirmed = completeAccessoryDialogConfirmation(
      line,
      (received) => {
        expect(received).toBe(line)
        events.push("adicionou")
        return true
      },
      () => events.push("fechou"),
    )

    expect(confirmed).toBe(true)
    expect(events).toEqual(["adicionou", "fechou"])
  })

  it("falha ao adicionar mantém o modal aberto", () => {
    const close = vi.fn()

    expect(completeAccessoryDialogConfirmation({}, () => false, close)).toBe(false)
    expect(close).not.toHaveBeenCalled()
  })

  it.each(["Cancelar", "Close", "Esc"])("%s limpa a seleção e fecha sem adicionar", () => {
    // Close e Esc chegam pelo Radix como onOpenChange(false); Cancelar usa a
    // mesma rotina closeAndReset diretamente.
    expect(shouldCloseAccessoryDialog(false, false)).toBe(true)
    const events: string[] = []
    closeAccessoryDialog(
      () => events.push("limpou"),
      () => events.push("fechou"),
    )
    expect(events).toEqual(["limpou", "fechou"])
  })

  it("ignora fechamento concorrente apenas durante a inclusão", () => {
    expect(shouldCloseAccessoryDialog(false, true)).toBe(false)
    expect(shouldCloseAccessoryDialog(true, false)).toBe(false)
  })

  it("permanece compatível quando o PDV já limpa o alvo no callback de sucesso", () => {
    let open = true

    completeAccessoryDialogConfirmation(
      {},
      () => {
        open = false
        return true
      },
      () => {
        open = false
      },
    )

    expect(open).toBe(false)
  })

  it("reabrir começa com todo o estado temporário limpo", () => {
    const dirty = {
      ...createEmptyAccessoryDialogState(),
      query: "A06",
      searching: true,
      colorKey: "preto" as const,
      customColor: "Azul bebê",
      confirmErrors: ["erro anterior"],
      busy: true,
    }

    expect(dirty).not.toEqual(createEmptyAccessoryDialogState())
    expect(createEmptyAccessoryDialogState()).toEqual({
      query: "",
      results: [],
      searching: false,
      searchError: null,
      modelo: null,
      colorKey: null,
      customColor: "",
      confirmErrors: [],
      busy: false,
    })
  })
})
