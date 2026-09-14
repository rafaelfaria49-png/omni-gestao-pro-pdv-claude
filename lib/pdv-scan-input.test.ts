import { describe, expect, it, vi } from "vitest"

import { parsePdvScanPrefix } from "./pdv-scan-prefix"
import {
  createPdvScanNotFoundFeedback,
  isPdvScanLikeQuery,
  PDV_SCAN_NOT_FOUND_FEEDBACK_MS,
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
