import { afterEach, describe, expect, it, vi } from "vitest"
import { checkLocalVoiceSupport, installLocalVoicePack, localVoicePreflight, startLocalVoiceCapture } from "./local"
import { createFakeLocalSpeech, createGenericSpeech } from "./__fixtures__/fake-local-speech"
import type { VoiceCaptureEvent } from "./types"

// SIMULATED engine only: these tests prove the adapter contract, not recognition quality.
const query = { lang: "pt-BR", timeoutMs: 50 }
const win = (Ctor: unknown, secure = true) => ({ isSecureContext: secure, SpeechRecognition: Ctor })
function capture(fake = createFakeLocalSpeech(), extra: Partial<Parameters<typeof startLocalVoiceCapture>[0]> = {}) {
  const events: VoiceCaptureEvent[] = []
  const session = startLocalVoiceCapture({ win: win(fake.Ctor), emit: (e) => events.push(e), lang: "pt-BR", maxDurationMs: 30_000, maxChars: 2000, ...extra })
  return { fake, events, session, rec: fake.last() }
}
afterEach(() => { vi.useRealTimers() })

describe("pt-BR local compatibility (metadata only)", () => {
  it("refuses SSR, insecure context and missing API synchronously", () => {
    expect(localVoicePreflight(null)).toEqual({ status: "unavailable", reason: "ssr" })
    expect(localVoicePreflight(win(createFakeLocalSpeech().Ctor, false))).toEqual({ status: "unavailable", reason: "insecure-context" })
    expect(localVoicePreflight({ isSecureContext: true })).toEqual({ status: "unavailable", reason: "no-api" })
  })
  it("never treats generic SpeechRecognition (prefixed or not) as local", async () => {
    const generic = createGenericSpeech()
    for (const w of [win(generic.Ctor), { isSecureContext: true, webkitSpeechRecognition: generic.Ctor }]) {
      expect(await checkLocalVoiceSupport(w, query)).toEqual({ status: "unavailable", reason: "no-local-api" })
      expect(startLocalVoiceCapture({ win: w, emit: vi.fn(), lang: "pt-BR", maxDurationMs: 1000, maxChars: 10 })).toEqual({ ok: false, reason: "unavailable" })
    }
    expect(generic.instances).toHaveLength(0)
  })
  it("treats a throwing (tampered) getter as missing API", () => {
    const w = { isSecureContext: true, get SpeechRecognition() { throw new Error("tampered") } }
    expect(localVoicePreflight(w)).toEqual({ status: "unavailable", reason: "no-api" })
  })
  it.each(["available", "downloadable", "downloading"] as const)("maps %s, querying only pt-BR with processLocally and without constructing the engine", async (availability) => {
    const fake = createFakeLocalSpeech({ availability })
    expect(await checkLocalVoiceSupport(win(fake.Ctor), query)).toEqual({ status: availability })
    expect(fake.calls.available).toEqual([{ langs: ["pt-BR"], processLocally: true }])
    expect(fake.instances).toHaveLength(0)
    expect(fake.calls.install).toHaveLength(0)
  })
  it.each([
    ["unavailable", "language-unavailable"],
    ["reject-not-allowed", "policy-blocked"],
    ["reject", "query-failed"],
    ["never", "timeout"],
  ] as const)("%s keeps voice off (%s)", async (availability, reason) => {
    const fake = createFakeLocalSpeech({ availability })
    expect(await checkLocalVoiceSupport(win(fake.Ctor), query)).toEqual({ status: "unavailable", reason })
  })
})

describe("explicit language pack install", () => {
  it("installs only pt-BR local, never remote, and reports failure", async () => {
    const fake = createFakeLocalSpeech({ availability: "downloadable", afterInstall: "available" })
    expect(await installLocalVoicePack(win(fake.Ctor), "pt-BR")).toBe(true)
    expect(fake.calls.install).toEqual([{ langs: ["pt-BR"], processLocally: true }])
    expect(await checkLocalVoiceSupport(win(fake.Ctor), query)).toEqual({ status: "available" })
    expect(await installLocalVoicePack(win(createFakeLocalSpeech({ installResult: false }).Ctor), "pt-BR")).toBe(false)
    expect(await installLocalVoicePack(win(fake.Ctor, false), "pt-BR")).toBe(false)
    expect(fake.instances).toHaveLength(0)
  })
})

describe("local capture session", () => {
  it("sets processLocally=true and pt-BR before start and forwards shared machine events", () => {
    const { rec, events, session } = capture()
    expect(session.ok).toBe(true)
    expect(rec.configAtStart).toEqual({ processLocally: true, lang: "pt-BR", continuous: true, interimResults: true })
    rec.result("Novo cliente Lia", false)
    rec.result("Novo cliente Lia de Teste", true)
    expect(events).toEqual([{ type: "interim", text: "Novo cliente Lia" }, { type: "final-chunk", text: "Novo cliente Lia de Teste" }])
  })
  it("refuses an engine that ignores processLocally: no start and no fallback", () => {
    const fake = createFakeLocalSpeech({ acceptsProcessLocally: false })
    const { session, events } = capture(fake)
    expect(session).toEqual({ ok: false, reason: "unavailable" })
    expect(fake.instances).toHaveLength(1)
    expect(fake.instances[0].started).toBe(false)
    expect(events).toEqual([])
  })
  it("refuses insecure context even with the local API", () => {
    const fake = createFakeLocalSpeech()
    const result = startLocalVoiceCapture({ win: win(fake.Ctor, false), emit: vi.fn(), lang: "pt-BR", maxDurationMs: 1000, maxChars: 10 })
    expect(result).toEqual({ ok: false, reason: "unavailable" })
    expect(fake.instances).toHaveLength(0)
  })
  it("stop asks for final results and ends once", () => {
    const { rec, events, session } = capture()
    if (!session.ok) throw new Error("expected session")
    session.stop()
    expect(rec.stopped).toBe(true)
    rec.end(); rec.end()
    expect(events).toEqual([{ type: "stop-requested" }, { type: "end" }])
  })
  it("cancel aborts and drops every late event", () => {
    const { rec, events, session } = capture()
    if (!session.ok) throw new Error("expected session")
    session.cancel()
    expect(rec.aborted).toBe(true)
    rec.result("late synthetic", true); rec.error("aborted"); rec.end()
    expect(events).toEqual([{ type: "cancel" }])
  })
  it("dispose (unmount) aborts silently", () => {
    const { rec, events, session } = capture()
    if (!session.ok) throw new Error("expected session")
    session.dispose()
    rec.result("late synthetic", true); rec.end()
    expect(rec.aborted).toBe(true)
    expect(events).toEqual([])
  })
  it("stops automatically at the duration limit and aborts an engine that never ends", () => {
    vi.useFakeTimers()
    const onAutoStop = vi.fn()
    const { rec, events } = capture(undefined, { maxDurationMs: 30_000, endGraceMs: 2000, onAutoStop })
    vi.advanceTimersByTime(29_999)
    expect(rec.stopped).toBe(false)
    vi.advanceTimersByTime(1)
    expect(onAutoStop).toHaveBeenCalledWith("duration")
    expect(rec.stopped).toBe(true)
    vi.advanceTimersByTime(2000)
    expect(rec.aborted).toBe(true)
    expect(events).toEqual([{ type: "stop-requested" }, { type: "end" }])
  })
  it("stops at the character limit", () => {
    const onAutoStop = vi.fn()
    const { rec, events } = capture(undefined, { maxChars: 20, onAutoStop })
    rec.result("Nome Lia de Teste telefone", true)
    expect(onAutoStop).toHaveBeenCalledWith("chars")
    expect(rec.stopped).toBe(true)
    expect(events.map((e) => e.type)).toEqual(["final-chunk", "stop-requested"])
  })
  it("reports missing local pack as an error without restarting a remote engine", () => {
    vi.useFakeTimers()
    const { rec, events, fake } = capture(undefined, { endGraceMs: 100 })
    rec.error("language-not-supported")
    vi.advanceTimersByTime(100)
    expect(events).toEqual([{ type: "error", code: "language-not-supported" }, { type: "end" }])
    expect(fake.instances).toHaveLength(1)
    expect(fake.instances[0].processLocally).toBe(true)
  })
  it("start failure detaches the engine and emits nothing", () => {
    const fake = createFakeLocalSpeech({ startThrows: true })
    const { session, events } = capture(fake)
    expect(session).toEqual({ ok: false, reason: "start-failed" })
    fake.instances[0].result("late", true)
    expect(events).toEqual([])
  })
})
