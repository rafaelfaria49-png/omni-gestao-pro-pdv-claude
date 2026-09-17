import { describe, expect, it, vi } from "vitest"

import { parsePdvScanPrefix } from "./pdv-scan-prefix"
import {
  canAutoFocusPdvBipe,
  createPdvScanInlineNotFoundFeedback,
  createPdvScanNotFoundFeedback,
  isPdvScanLikeQuery,
  PDV_SCAN_NOT_FOUND_FEEDBACK_MS,
  type PdvScanInlineFeedbackState,
} from "./pdv-scan-input"

describe("isPdvScanLikeQuery — código é consumido, pesquisa manual é preservada", () => {
  it.each(["7891234567890", "1234455666666", "KD11C", "A05", "  7890000000017  ", "CAP-A05"])(
    "%s é código (limpa após Enter)",
    (q) => {
      expect(isPdvScanLikeQuery(q)).toBe(true)
    },
  )

  it.each(["capinha", "capinha samsung", "película a05", "carregador turbo", "samsung a05", "7890 123", "", "   "])(
    '"%s" é pesquisa manual (nunca apagada sozinha)',
    (q) => {
      expect(isPdvScanLikeQuery(q)).toBe(false)
    },
  )

  it("prefixo de quantidade não muda a classificação do código", () => {
    const parsed = parsePdvScanPrefix("3*7891234567890")
    expect(parsed.hasPrefix).toBe(true)
    expect(isPdvScanLikeQuery(parsed.query)).toBe(true)
  })
})

describe("createPdvScanNotFoundFeedback — um único aviso vivo", () => {
  function fakeShow() {
    const handles: Array<{ code: string; dismiss: ReturnType<typeof vi.fn> }> = []
    const show = vi.fn((code: string) => {
      const h = { code, dismiss: vi.fn() }
      handles.push(h)
      return h
    })
    return { show, handles }
  }

  it("aviso transitório tem duração curta (1,5–2 s)", () => {
    expect(PDV_SCAN_NOT_FOUND_FEEDBACK_MS).toBeGreaterThanOrEqual(1500)
    expect(PDV_SCAN_NOT_FOUND_FEEDBACK_MS).toBeLessThanOrEqual(2000)
  })

  it("novo aviso encerra o anterior na hora (scan seguinte não espera o timeout)", () => {
    const { show, handles } = fakeShow()
    const fb = createPdvScanNotFoundFeedback(show)
    fb.notify("111")
    fb.notify("222")
    expect(show).toHaveBeenCalledTimes(2)
    expect(handles[0]!.dismiss).toHaveBeenCalledTimes(1)
    expect(handles[1]!.dismiss).not.toHaveBeenCalled()
  })

  it("dismiss encerra o aviso vivo e é idempotente", () => {
    const { show, handles } = fakeShow()
    const fb = createPdvScanNotFoundFeedback(show)
    fb.dismiss()
    fb.notify("111")
    fb.dismiss()
    fb.dismiss()
    expect(handles[0]!.dismiss).toHaveBeenCalledTimes(1)
    fb.notify("333")
    expect(show).toHaveBeenLastCalledWith("333")
  })
})

describe("createPdvScanInlineNotFoundFeedback — aviso inline no próprio campo (GOAL 006)", () => {
  function harness(durationMs = PDV_SCAN_NOT_FOUND_FEEDBACK_MS) {
    const views: PdvScanInlineFeedbackState[] = []
    const fb = createPdvScanInlineNotFoundFeedback((state) => views.push(state), durationMs)
    return {
      fb,
      views,
      last: () => views[views.length - 1]!,
    }
  }

  it("duração do aviso inline é a mesma curta compartilhada (1,8–2,2 s)", () => {
    expect(PDV_SCAN_NOT_FOUND_FEEDBACK_MS).toBeGreaterThanOrEqual(1800)
    expect(PDV_SCAN_NOT_FOUND_FEEDBACK_MS).toBeLessThanOrEqual(2200)
  })

  it("notify mostra o código; o tempo esconde sozinho mantendo o seq", () => {
    vi.useFakeTimers()
    try {
      const { fb, last } = harness()
      fb.notify("6951454122135")
      expect(last()).toEqual({ code: "6951454122135", seq: 1 })
      vi.advanceTimersByTime(PDV_SCAN_NOT_FOUND_FEEDBACK_MS - 1)
      expect(last().code).toBe("6951454122135")
      vi.advanceTimersByTime(1)
      expect(last().code).toBeNull()
      expect(last().seq).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it("novo notify antes do timeout substitui na hora e o timer antigo não apaga o novo", () => {
    vi.useFakeTimers()
    try {
      const { fb, last } = harness()
      fb.notify("111")
      vi.advanceTimersByTime(1000)
      fb.notify("222")
      expect(last()).toEqual({ code: "222", seq: 2 })
      vi.advanceTimersByTime(PDV_SCAN_NOT_FOUND_FEEDBACK_MS - 1000)
      // o timer do 1º aviso venceria aqui — o 2º continua visível.
      expect(last().code).toBe("222")
      vi.advanceTimersByTime(1000)
      expect(last().code).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it("dismiss encerra na hora; notify→dismiss→notify re-anuncia com seq novo", () => {
    vi.useFakeTimers()
    try {
      const { fb, last } = harness()
      fb.notify("111")
      fb.dismiss()
      expect(last().code).toBeNull()
      vi.advanceTimersByTime(PDV_SCAN_NOT_FOUND_FEEDBACK_MS * 2)
      expect(last().code).toBeNull()
      fb.notify("111")
      expect(last()).toEqual({ code: "111", seq: 2 })
    } finally {
      vi.useRealTimers()
    }
  })

  it("mesmo código repetido mantém seq crescente (re-anúncio acessível)", () => {
    const { fb, last } = harness()
    fb.notify("999")
    fb.dismiss()
    fb.notify("999")
    expect(last().seq).toBe(2)
  })
})

describe("canAutoFocusPdvBipe — autofocus não rouba foco (GOAL 006)", () => {
  type FakeNode = { tagName?: string; isContentEditable?: boolean }
  function fakeDoc(active: FakeNode | null, dialog: Element | null = null) {
    return {
      activeElement: active as unknown as Element | null,
      querySelector: () => dialog,
    }
  }

  it("sem DOM (SSR/node puro) nunca foca", () => {
    expect(canAutoFocusPdvBipe(null)).toBe(false)
  })

  it("foca quando nada está ativo e não há modal", () => {
    expect(canAutoFocusPdvBipe(fakeDoc(null))).toBe(true)
    expect(canAutoFocusPdvBipe(fakeDoc({ tagName: "BODY" }))).toBe(true)
    expect(canAutoFocusPdvBipe(fakeDoc({ tagName: "button" }))).toBe(true)
  })

  it("não foca quando o operador está em outro campo de texto", () => {
    expect(canAutoFocusPdvBipe(fakeDoc({ tagName: "INPUT" }))).toBe(false)
    expect(canAutoFocusPdvBipe(fakeDoc({ tagName: "TEXTAREA" }))).toBe(false)
    expect(canAutoFocusPdvBipe(fakeDoc({ tagName: "SELECT" }))).toBe(false)
    expect(canAutoFocusPdvBipe(fakeDoc({ tagName: "DIV", isContentEditable: true }))).toBe(false)
  })

  it("não foca com modal aberto (qualquer tema/superfície)", () => {
    expect(canAutoFocusPdvBipe(fakeDoc(null, { tagName: "DIV" } as unknown as Element))).toBe(false)
  })
})
