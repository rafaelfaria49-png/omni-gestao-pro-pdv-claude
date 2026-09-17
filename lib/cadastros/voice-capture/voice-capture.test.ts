import { describe, expect, it } from "vitest"
import {
  detectVoiceCaptureCapability,
  montarTextoCaptura,
  sanitizeCaptureSource,
} from "./detect"
import { reduceVoiceCapture, VOICE_CAPTURE_INITIAL } from "./session"

describe("detectVoiceCaptureCapability", () => {
  it("ssr: window ausente = indisponivel honesto", () => {
    expect(detectVoiceCaptureCapability(null)).toEqual({ available: false, reason: "ssr" })
    expect(detectVoiceCaptureCapability(undefined)).toEqual({ available: false, reason: "ssr" })
  })

  it("sem API = indisponivel (Firefox/Safari legado)", () => {
    expect(detectVoiceCaptureCapability({})).toEqual({ available: false, reason: "no-api" })
  })

  it("SpeechRecognition ou webkit = disponivel", () => {
    expect(detectVoiceCaptureCapability({ SpeechRecognition: function SpeechRecognition() {} })).toEqual({
      available: true,
      reason: "ok",
    })
    expect(detectVoiceCaptureCapability({ webkitSpeechRecognition: function webkitSpeechRecognition() {} })).toEqual({
      available: true,
      reason: "ok",
    })
  })
})

describe("sanitizeCaptureSource / montarTextoCaptura", () => {
  it("so aceita text|voice", () => {
    expect(sanitizeCaptureSource("voice")).toBe("voice")
    expect(sanitizeCaptureSource("text")).toBe("text")
    expect(sanitizeCaptureSource("whisper")).toBe("text")
    expect(sanitizeCaptureSource(null)).toBe("text")
  })

  it("junta base + sessao + interim e corta em 2000", () => {
    expect(montarTextoCaptura("Película", "custa 4", "reais")).toBe("Película custa 4 reais")
    expect(montarTextoCaptura("  ", "", "oi")).toBe("oi")
    expect(montarTextoCaptura("x".repeat(1990), "yyyyyyyyyyyy", "")).toHaveLength(2000)
  })
})

describe("reduceVoiceCapture: estados minimos", () => {
  it("capability false -> unavailable; true a partir de unavailable volta a ready", () => {
    const off = reduceVoiceCapture(VOICE_CAPTURE_INITIAL, { type: "capability", available: false })
    expect(off.status).toBe("unavailable")
    expect(reduceVoiceCapture(off, { type: "start" }).status).toBe("unavailable")
    expect(reduceVoiceCapture(off, { type: "capability", available: true }).status).toBe("ready")
  })

  it("start so apos evento explicito; nao inicia sozinho", () => {
    expect(VOICE_CAPTURE_INITIAL.status).toBe("ready")
    const listening = reduceVoiceCapture(VOICE_CAPTURE_INITIAL, { type: "start" })
    expect(listening.status).toBe("listening")
    expect(listening.sessionTranscript).toBe("")
  })

  it("interim e final; stop -> transcribing; end com texto -> completed", () => {
    let s = reduceVoiceCapture(VOICE_CAPTURE_INITIAL, { type: "start" })
    s = reduceVoiceCapture(s, { type: "interim", text: "película" })
    expect(s.interim).toBe("película")
    s = reduceVoiceCapture(s, { type: "final-chunk", text: "Película 3D iPhone" })
    expect(s.sessionTranscript).toBe("Película 3D iPhone")
    expect(s.interim).toBe("")
    s = reduceVoiceCapture(s, { type: "stop-requested" })
    expect(s.status).toBe("transcribing")
    s = reduceVoiceCapture(s, { type: "end" })
    expect(s.status).toBe("completed")
  })

  it("end sem transcript -> erro (vazio) sem perder a maquina", () => {
    let s = reduceVoiceCapture(VOICE_CAPTURE_INITIAL, { type: "start" })
    s = reduceVoiceCapture(s, { type: "end" })
    expect(s.status).toBe("error")
    expect(s.sessionTranscript).toBe("")
    expect(s.message).toMatch(/vazia/i)
  })

  it("permissao negada e cancelamento limpam a sessao", () => {
    let s = reduceVoiceCapture(VOICE_CAPTURE_INITIAL, { type: "start" })
    s = reduceVoiceCapture(s, { type: "final-chunk", text: "segredo" })
    s = reduceVoiceCapture(s, { type: "error", code: "not-allowed" })
    expect(s.status).toBe("permission-denied")
    expect(s.sessionTranscript).toBe("")

    s = reduceVoiceCapture(VOICE_CAPTURE_INITIAL, { type: "start" })
    s = reduceVoiceCapture(s, { type: "final-chunk", text: "segredo" })
    s = reduceVoiceCapture(s, { type: "cancel" })
    expect(s.status).toBe("cancelled")
    expect(s.sessionTranscript).toBe("")
  })

  it("no-speech e erro generico nao quebram o fluxo", () => {
    let s = reduceVoiceCapture(VOICE_CAPTURE_INITIAL, { type: "start" })
    s = reduceVoiceCapture(s, { type: "error", code: "no-speech" })
    expect(s.status).toBe("error")
    expect(s.message).toMatch(/Nenhuma fala/)

    s = reduceVoiceCapture(VOICE_CAPTURE_INITIAL, { type: "start" })
    s = reduceVoiceCapture(s, { type: "error", code: "audio-capture" })
    expect(s.status).toBe("error")
  })

  it("aborted -> cancelled", () => {
    let s = reduceVoiceCapture(VOICE_CAPTURE_INITIAL, { type: "start" })
    s = reduceVoiceCapture(s, { type: "error", code: "aborted" })
    expect(s.status).toBe("cancelled")
  })
})
