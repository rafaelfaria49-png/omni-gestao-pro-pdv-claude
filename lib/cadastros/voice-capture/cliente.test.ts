import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import {
  CLIENT_VOICE_INITIAL, CLIENT_VOICE_POLICY, formatarTranscricaoCliente, isClientCaptureSource, juntarTranscricaoCliente, reduceClientVoiceCapture,
} from "./cliente"
import { reduceVoiceCapture, VOICE_CAPTURE_INITIAL } from "./session"
import type { VoiceCaptureEvent, VoiceCaptureSnapshot } from "./types"
import { interpretarTextoCliente } from "../natural-text/cliente"

const run = (events: VoiceCaptureEvent[], from: VoiceCaptureSnapshot = CLIENT_VOICE_INITIAL) => events.reduce(reduceClientVoiceCapture, from)
const ready = run([{ type: "capability", available: true }])

describe("client voice policy", () => {
  it("is local-only, without remote fallback, audio storage or autosave, and frozen at runtime", () => {
    expect(CLIENT_VOICE_POLICY).toMatchObject({ enabled: true, processing: "local-only", remoteFallback: false, lang: "pt-BR", maxDurationMs: 30_000, maxChars: 2000, storesAudio: false, autoSave: false })
    expect(Object.isFrozen(CLIENT_VOICE_POLICY)).toBe(true)
    expect(Reflect.set(CLIENT_VOICE_POLICY, "remoteFallback", true)).toBe(false)
    expect(Reflect.set(CLIENT_VOICE_POLICY, "processing", "remote")).toBe(false)
    expect(CLIENT_VOICE_POLICY.remoteFallback).toBe(false)
  })
  it.each([
    ["text", true], ["voice", true],
    ["audio", false], ["local", false], ["remote", false], ["whisper", false], ["TEXT", false], ["Voice", false], [" voice", false], ["", false],
    [null, false], [undefined, false], [true, false], [1, false], [["voice"], false], [{ captureSource: "voice" }, false],
  ])("accepts only the literal capture labels: %j → %s", (raw, ok) => {
    expect(isClientCaptureSource(raw)).toBe(ok)
  })
})

describe("client lifecycle over the shared capture machine", () => {
  it("starts unavailable until local support is confirmed; generic start is refused", () => {
    expect(CLIENT_VOICE_INITIAL.status).toBe("unavailable")
    expect(reduceClientVoiceCapture(CLIENT_VOICE_INITIAL, { type: "start" }).status).toBe("unavailable")
    expect(ready).toMatchObject({ status: "ready", sessionTranscript: "", interim: "" })
    expect(ready.message).toMatch(/Ditar por voz/)
  })
  it("listening → stop → end produces a temporary transcript only on success", () => {
    const listening = run([{ type: "start" }, { type: "interim", text: "Novo" }], ready)
    expect(listening).toMatchObject({ status: "listening", interim: "Novo" })
    const done = run([{ type: "final-chunk", text: "Novo cliente Lia de Teste" }, { type: "stop-requested" }, { type: "end" }], listening)
    expect(done).toMatchObject({ status: "completed", sessionTranscript: "Novo cliente Lia de Teste", interim: "" })
    expect(done.message).toMatch(/Interpretar texto/)
  })
  it.each([
    [{ type: "cancel" }, "cancelled", /cancelado/],
    [{ type: "error", code: "not-allowed" }, "permission-denied", /Microfone bloqueado/],
    [{ type: "error", code: "service-not-allowed" }, "permission-denied", /Microfone bloqueado/],
    [{ type: "error", code: "audio-capture" }, "error", /Microfone indisponível/],
    [{ type: "error", code: "no-speech" }, "error", /Nenhuma fala detectada/],
    [{ type: "error", code: "language-not-supported" }, "error", /pt-BR indisponível/],
    [{ type: "error", code: "network" }, "error", /preservado/],
  ] as const)("%j discards the partial transcript (%s)", (event, status, message) => {
    const partial = run([{ type: "start" }, { type: "final-chunk", text: "SYNTHETIC-PARTIAL" }], ready)
    const next = run([event, { type: "end" }], partial)
    expect(next).toMatchObject({ status, sessionTranscript: "", interim: "" })
    expect(next.message).toMatch(message)
  })
  it("an empty session ends as a constant error, and messages never mention Produto", () => {
    const empty = run([{ type: "start" }, { type: "stop-requested" }, { type: "end" }], ready)
    expect(empty).toMatchObject({ status: "error", sessionTranscript: "" })
    expect(empty.message).toMatch(/Nenhuma fala reconhecida/)
    for (const state of [ready, empty, run([{ type: "start" }], ready)]) expect(state.message).not.toMatch(/produto|\bIA\b/i)
  })
  it("reuses the shared machine unchanged for Produto", () => {
    expect(reduceVoiceCapture(VOICE_CAPTURE_INITIAL, { type: "start" }).message).toMatch(/produto/)
  })
})

describe("visible transcript formatting for the canonical parser", () => {
  it.each([
    ["novo cliente Lia de Teste telefone 14 99999 8888 mora em Itaí", "novo cliente Lia de Teste, telefone 14 99999 8888, mora em Itaí"],
    ["Nome Lia de Teste vírgula CPF 529 982 247 25 ponto e vírgula cidade Itaí", "Nome Lia de Teste, CPF 529 982 247 25; cidade Itaí"],
    ["cliente Lia email lia arroba exemplo ponto com ponto br", "cliente Lia, email lia@exemplo.com.br"],
    ["Lia de Teste e mail lia@exemplo.com", "Lia de Teste, email lia@exemplo.com"],
    ["Lia de Teste endereço Rua Cidade Jardim 100 telefone 14999998888", "Lia de Teste, endereço Rua Cidade Jardim 100; telefone 14999998888"],
    ["Nome: Lia de Teste, telefone 14999998888", "Nome: Lia de Teste, telefone 14999998888"],
    ["Novo cliente Lia de Teste. Telefone 14 99999-8888. Mora em Itaí.", "Novo cliente Lia de Teste, Telefone 14 99999-8888, Mora em Itaí."],
    ["Endereço Rua do Estado 10. Cidade Itaí estado SP", "Endereço Rua do Estado 10; Cidade Itaí, estado SP"],
    ["  Lia   de Teste  vírgula ", "Lia de Teste"],
  ])("%s", (raw, formatted) => {
    expect(formatarTranscricaoCliente(raw)).toBe(formatted)
  })
  it("a dictated sentence reaches the canonical parser as separate fields", () => {
    const s = interpretarTextoCliente(formatarTranscricaoCliente("novo cliente Lia de Teste telefone 14 99999 8888 CPF 529 982 247 25 mora em Itaí"))
    expect(s.campos.nome).toMatchObject({ valor: "Lia de Teste", estado: "extraido" })
    expect(s.campos.telefone).toMatchObject({ valor: "(14) 99999-8888", estado: "extraido" })
    expect(s.campos.documento).toMatchObject({ valor: "52998224725", estado: "extraido" })
    expect(s.campos.cidade).toMatchObject({ valor: "Itaí", estado: "extraido" })
  })
  it("keeps typed text and appends the dictation on its own line, within the limit", () => {
    expect(juntarTranscricaoCliente("Nome: Manual", "telefone 14999998888")).toBe("Nome: Manual\ntelefone 14999998888")
    expect(juntarTranscricaoCliente("", "Lia")).toBe("Lia")
    expect(juntarTranscricaoCliente("Base", "   ")).toBe("Base")
    expect(juntarTranscricaoCliente("a".repeat(1999), "bbbb")).toHaveLength(2000)
  })
})

describe("static privacy boundary of the client voice path", () => {
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1")
  for (const file of ["local.ts", "cliente.ts"]) {
    it(`${file}: no network, storage, logs, recording, database or product interpreter`, () => {
      const src = strip(readFileSync(resolve(__dirname, file), "utf8"))
      expect(src).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource/)
      expect(src).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/)
      expect(src).not.toMatch(/console\.|MediaRecorder|getUserMedia|AudioContext/)
      expect(src).not.toMatch(/@\/lib\/prisma|generated\/prisma|interpretarProdutoTextoLivre|interpretarTextoProduto|OPENAI|OPENROUTER|NEXT_PUBLIC/)
      expect(src).not.toMatch(/processLocally\s*=\s*false|processLocally:\s*false/)
    })
  }
})
