import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * CAD-R2-017 — a UI de Cadastros V2 reusa o 016; voz é só capture adapter.
 */

const ROOT = process.cwd()

function ler(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8")
}

function semComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1")
}

describe("CAD-R2-017 UI: um interpretador, sem persistir audio", () => {
  const ui = ler("components/cadastros/lovable/components/cadastros/produto-ia.tsx")
  const uiCode = semComentarios(ui)

  it("reusa interpretarProdutoTextoLivre e nao cria segundo parser", () => {
    expect(ui).toContain("interpretarProdutoTextoLivre")
    expect(ui).toContain("startBrowserVoiceCapture")
    expect(uiCode).not.toMatch(/extractProductFormFromTranscript|extractProductMetadataFromTranscript/)
    expect(uiCode).not.toMatch(/voiceProductParser|product-voice-metadata|voice-form-text|\/api\/product\/voice/)
    expect(uiCode).not.toMatch(/transcribeAudioBuffer|transcribe-openai/)
  })

  it("microfone so apos clique: sem start automatico no mount", () => {
    expect(ui).toContain("startBrowserVoiceCapture")
    expect(ui).not.toMatch(/useEffect\([^)]*startBrowserVoiceCapture/)
    expect(ui).toContain("detectVoiceCaptureCapability")
  })

  it("salvar produto nao inclui transcript/audio no metadata", () => {
    const idx = ui.indexOf("await upsertProduto")
    expect(idx).toBeGreaterThan(0)
    const save = semComentarios(ui.slice(idx, idx + 2500))
    expect(save).not.toMatch(/textoLivre|sessionTranscript|audioBlob|MediaRecorder/)
    expect(save).not.toMatch(/\btranscript\b/)
    expect(save).toContain("upsertProduto")
    expect(save).not.toContain("textoCaptureSource")
  })

  it("nao persiste captura de voz como write direto", () => {
    expect(uiCode).not.toMatch(/prisma\s*\.\s*produto/)
    expect(uiCode).not.toMatch(/applyStockMutation|stock-ledger/)
  })
})
