// @vitest-environment jsdom
/**
 * OMNI-FINANCEIRO-F9-HUB-HOMOLOGACAO-FINAL-001 — ciclo de impressão do comprovante
 * (revisão independente P2-1 / P2-2). O navegador não informa se a impressora imprimiu;
 * o que dá para garantir é: um diálogo por pedido, nunca depois de a UI dizer que falhou,
 * e o cupom montado no instante do `print()`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { imprimirReciboLote } from "@/lib/contas-receber-recibo"

const payload = {
  lojaNome: "Loja QA",
  cliente: "Ana QA",
  dataPagamento: new Date("2026-11-08T13:45:00.000Z"),
  formaPagamento: "PIX",
  itens: [{ descricao: "Crediário #1", valorRecebido: 10, saldoRestante: 0 }],
  totalRecebido: 10,
  saldoDevedorAtual: 0,
}

describe("impressão do comprovante — ciclo do diálogo", () => {
  let frames: FrameRequestCallback[]
  let printSpy: ReturnType<typeof vi.fn>
  const mount = () => document.getElementById("recibo-print-mount")

  beforeEach(() => {
    vi.useFakeTimers()
    frames = []
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb)
      return frames.length
    })
    printSpy = vi.fn(() => {
      // No instante do print o cupom precisa estar montado (não foi limpo antes).
      expect(mount()?.innerHTML).toContain("COMPROVANTE NÃO FISCAL")
    })
    window.print = printSpy as unknown as typeof window.print
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    mount()?.remove()
    document.documentElement.removeAttribute("data-printing-recibo")
  })

  it("caminho normal: um print, resolve true e só limpa DEPOIS do print", async () => {
    const p = imprimirReciboLote(payload)
    await vi.advanceTimersByTimeAsync(0)
    // Frame demora 2 s (> 1,2 s da limpeza antiga): o cupom continua montado.
    await vi.advanceTimersByTimeAsync(2_000)
    expect(mount()?.innerHTML).toContain("COMPROVANTE NÃO FISCAL")
    frames.shift()!(0)
    await expect(p).resolves.toBe(true)
    expect(printSpy).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1_300)
    expect(mount()?.innerHTML).toBe("")
    expect(document.documentElement.hasAttribute("data-printing-recibo")).toBe(false)
  })

  it("frame atrasado além do limite: resolve false e o diálogo NÃO abre depois (sem 2º cupom)", async () => {
    const p = imprimirReciboLote(payload)
    await vi.advanceTimersByTimeAsync(5_001)
    await expect(p).resolves.toBe(false)
    frames.shift()!(0)
    expect(printSpy).not.toHaveBeenCalled()
    expect(mount()?.innerHTML).toBe("")
    expect(document.documentElement.hasAttribute("data-printing-recibo")).toBe(false)
  })

  it("na impressão o resto da app sai do fluxo (sem folhas em branco) e a página tem a bobina", async () => {
    const p = imprimirReciboLote(payload, { bobina: "58mm" })
    await vi.advanceTimersByTimeAsync(0)
    const css = mount()?.querySelector("style")?.textContent ?? ""
    expect(css).toContain('html[data-printing-recibo="true"] body > *:not(#recibo-print-mount) { display: none !important; }')
    expect(css).toMatch(/size: 58mm \d+mm/)
    frames.shift()!(0)
    await p
  })
})
