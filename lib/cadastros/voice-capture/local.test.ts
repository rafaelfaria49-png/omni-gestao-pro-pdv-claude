import { afterEach, describe, expect, it, vi } from "vitest"
import { checkLocalVoiceSupport, installLocalVoicePack, localVoicePreflight, startLocalVoiceCapture } from "./local"
import { createFakeLocalSpeech, createGenericSpeech } from "./__fixtures__/fake-local-speech"
import { classifyVoiceDiagnostic, type VoiceDiagnostic } from "./diagnostic"
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
    expect(await checkLocalVoiceSupport(win(fake.Ctor), query)).toEqual({ status: availability, quality: "default" })
    expect(fake.calls.available).toContainEqual({ langs: ["pt-BR"], processLocally: true })
    for (const call of fake.calls.available) expect(call).toMatchObject({ langs: ["pt-BR"], processLocally: true })
    expect(fake.instances).toHaveLength(0)
    expect(fake.calls.install).toHaveLength(0)
  })
  it("Chrome 155 pt-BR shape: knows `quality`, dictation unavailable → keeps the local command level", async () => {
    const fake = createFakeLocalSpeech({ availability: "downloadable", qualities: { dictation: "unavailable" } })
    expect(await checkLocalVoiceSupport(win(fake.Ctor), query)).toEqual({ status: "downloadable", quality: "command" })
    expect(fake.calls.available).toContainEqual({ langs: ["pt-BR"], processLocally: true, quality: "dictation" })
    expect(await installLocalVoicePack(win(fake.Ctor), "pt-BR", "command")).toBe(true)
    expect(fake.calls.install).toEqual([{ langs: ["pt-BR"], processLocally: true, quality: "command" }])
  })
  it.each([
    [{ availability: "available", qualities: { dictation: "available" } }, { status: "available", quality: "dictation" }],
    [{ availability: "available", qualities: { dictation: "downloadable" } }, { status: "available", quality: "command" }],
    [{ availability: "downloadable", qualities: { dictation: "downloadable" } }, { status: "downloadable", quality: "dictation" }],
    [{ availability: "unavailable", qualities: { dictation: "unavailable" } }, { status: "unavailable", reason: "language-unavailable" }],
  ] as const)("dictation only when declared local: %j → %j", async (options, expected) => {
    const fake = createFakeLocalSpeech(options)
    expect(await checkLocalVoiceSupport(win(fake.Ctor), query)).toEqual(expected)
    for (const call of fake.calls.available) expect(call).toMatchObject({ processLocally: true })
    expect(fake.instances).toHaveLength(0)
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
    expect(await checkLocalVoiceSupport(win(fake.Ctor), query)).toEqual({ status: "available", quality: "default" })
    expect(await installLocalVoicePack(win(createFakeLocalSpeech({ installResult: false }).Ctor), "pt-BR")).toBe(false)
    expect(await installLocalVoicePack(win(fake.Ctor, false), "pt-BR")).toBe(false)
    expect(fake.instances).toHaveLength(0)
  })
})

describe("local capture session", () => {
  it("sets processLocally=true and pt-BR before start and forwards shared machine events", () => {
    const { rec, events, session } = capture()
    expect(session.ok).toBe(true)
    expect(rec.configAtStart).toMatchObject({ processLocally: true, lang: "pt-BR", continuous: true, interimResults: true, quality: "command" })
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
  it("applies dictation quality only when declared, staying local", () => {
    const dictation = capture(createFakeLocalSpeech({ qualities: { dictation: "available" } }), { quality: "dictation" })
    expect(dictation.rec.configAtStart).toMatchObject({ processLocally: true, quality: "dictation" })
    const command = capture(createFakeLocalSpeech({ qualities: { dictation: "unavailable" } }), { quality: "command" })
    expect(command.rec.configAtStart).toMatchObject({ processLocally: true, quality: "command" })
  })
  it("forwards provisional text that arrives after stop (it used to be dropped)", () => {
    const { rec, events, session } = capture()
    if (!session.ok) throw new Error("expected session")
    session.stop()
    rec.result("trecho provisório tardio", false)
    rec.end()
    expect(events).toEqual([{ type: "stop-requested" }, { type: "interim", text: "trecho provisório tardio" }, { type: "end" }])
  })
  it("emits the final part before the provisional tail of the same event", () => {
    const { rec, events } = capture()
    rec.mixed("Nome Lia de Teste", "telefone quatorze")
    expect(events).toEqual([{ type: "final-chunk", text: "Nome Lia de Teste" }, { type: "interim", text: "telefone quatorze" }])
  })
})

describe("sanitized diagnostic of the editor session", () => {
  const withDiag = (extra: Partial<Parameters<typeof startLocalVoiceCapture>[0]> = {}) => {
    const snapshots: VoiceDiagnostic[] = []
    return { snapshots, ...capture(undefined, { onDiagnostic: (d) => snapshots.push(d), ...extra }) }
  }
  it("records audio/sound/speech steps, result counts and the end, never text", () => {
    const { rec, snapshots, session } = withDiag()
    if (!session.ok) throw new Error("expected session")
    rec.audio("audiostart", "soundstart", "speechstart")
    rec.result("SYNTHETIC-PII Lia 52998224725", false)
    rec.mixed("SYNTHETIC-FINAL", "SYNTHETIC-TAIL")
    session.stop()
    rec.end()
    const last = snapshots[snapshots.length - 1]
    expect(Object.keys(last.steps)).toEqual(expect.arrayContaining(["audiostart", "soundstart", "speechstart", "first-interim", "first-final", "stop-requested", "end"]))
    expect(last.counts).toEqual({ results: 2, interim: 2, final: 1, nomatch: 0 })
    expect(last).toMatchObject({ source: "editor", endReason: "engine-end", error: null })
    expect(classifyVoiceDiagnostic(last)).toBe("FINAL_RECEIVED")
    expect(JSON.stringify(snapshots)).not.toMatch(/SYNTHETIC|Lia|52998224725/)
  })
  it("speech detected without any result, and an engine that never ends", () => {
    vi.useFakeTimers()
    const { rec, snapshots, session } = withDiag({ endGraceMs: 1000 })
    if (!session.ok) throw new Error("expected session")
    rec.audio("audiostart", "soundstart", "speechstart")
    session.stop()
    vi.advanceTimersByTime(1000)
    const last = snapshots[snapshots.length - 1]
    expect(last.endReason).toBe("grace-timeout")
    expect(classifyVoiceDiagnostic(last)).toBe("ENGINE_FAILURE")
    expect(rec.aborted).toBe(true)
  })
  it("cancel and start failure are classified without inventing results", () => {
    const cancelled = withDiag()
    if (!cancelled.session.ok) throw new Error("expected session")
    cancelled.session.cancel()
    expect(classifyVoiceDiagnostic(cancelled.snapshots[cancelled.snapshots.length - 1])).toBe("CANCELLED")
    const failed: VoiceDiagnostic[] = []
    capture(createFakeLocalSpeech({ startThrows: true }), { onDiagnostic: (d) => failed.push(d) })
    expect(classifyVoiceDiagnostic(failed[failed.length - 1])).toBe("MIC_NOT_STARTED")
  })
  it("sanitizes an unexpected engine error string", () => {
    const { rec, snapshots } = withDiag()
    rec.error("SYNTHETIC free text from engine")
    expect(snapshots[snapshots.length - 1].error).toBe("unknown")
  })
})
