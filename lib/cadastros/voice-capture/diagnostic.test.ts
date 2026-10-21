import { afterEach, describe, expect, it, vi } from "vitest"
import { classifyVoiceDiagnostic, createVoiceDiagnosticRecorder, runNativeLocalProbe, sanitizeVoiceErrorCode, type VoiceDiagnostic } from "./diagnostic"
import { createFakeLocalSpeech, createGenericSpeech } from "./__fixtures__/fake-local-speech"

// SIMULATED engine only: proves the probe contract and the classifier, not recognition.
const win = (Ctor: unknown, secure = true) => ({ isSecureContext: secure, SpeechRecognition: Ctor })
const base = (patch: Partial<VoiceDiagnostic> = {}): VoiceDiagnostic => ({
  source: "editor", quality: "command", steps: {}, counts: { results: 0, interim: 0, final: 0, nomatch: 0 }, error: null, endReason: "engine-end", durationMs: 9000, ...patch,
})
afterEach(() => { vi.useRealTimers() })

describe("classifier distinguishes each failing stage", () => {
  it.each([
    [base({ endReason: "start-failed" }), "MIC_NOT_STARTED"],
    [base({ error: "not-allowed" }), "MIC_NOT_STARTED"],
    [base({ steps: { audiostart: 5 }, error: "audio-capture" }), "MIC_NOT_STARTED"],
    [base(), "MIC_NOT_STARTED"],
    [base({ steps: { audiostart: 5 } }), "NO_AUDIO"],
    [base({ steps: { audiostart: 5, soundstart: 9 } }), "NO_SPEECH"],
    [base({ steps: { audiostart: 5, soundstart: 9, speechstart: 12 }, error: "no-speech" }), "NO_SPEECH"],
    [base({ steps: { audiostart: 5, soundstart: 9, speechstart: 12 } }), "NO_RESULTS"],
    [base({ steps: { audiostart: 5, soundstart: 9, speechstart: 12 }, counts: { results: 1, interim: 1, final: 0, nomatch: 0 } }), "INTERIM_ONLY"],
    [base({ counts: { results: 2, interim: 1, final: 1, nomatch: 0 } }), "FINAL_RECEIVED"],
    [base({ steps: { audiostart: 5, soundstart: 9, speechstart: 12 }, endReason: "grace-timeout" }), "ENGINE_FAILURE"],
    [base({ steps: { audiostart: 5 }, error: "network" }), "ENGINE_FAILURE"],
    [base({ steps: { audiostart: 5 }, error: "service-not-allowed" }), "ENGINE_FAILURE"],
    [base({ steps: { audiostart: 5, soundstart: 9 }, endReason: "cancelled" }), "CANCELLED"],
  ] as const)("%j → %s", (d, code) => {
    expect(classifyVoiceDiagnostic(d)).toBe(code)
  })
  it("keeps only closed-list error codes", () => {
    expect(sanitizeVoiceErrorCode("no-speech")).toBe("no-speech")
    expect(sanitizeVoiceErrorCode("Lia 52998224725")).toBe("unknown")
    expect(sanitizeVoiceErrorCode({ error: "x" })).toBe("unknown")
  })
  it("recorder keeps first occurrence times and counts", () => {
    let t = 1000
    const d = createVoiceDiagnosticRecorder("editor", "command", undefined, () => t)
    t = 1100; d.step("audiostart")
    t = 1300; d.step("audiostart")
    t = 1400; d.result(1, 0)
    t = 1500; d.result(0, 2)
    t = 1600; d.error("SYNTHETIC free text"); d.error("network")
    t = 1700; d.end("engine-end"); d.end("grace-timeout")
    expect(d.snapshot()).toEqual({
      source: "editor", quality: "command", steps: { audiostart: 100, "first-interim": 400, "first-final": 500, end: 700 },
      counts: { results: 2, interim: 1, final: 2, nomatch: 0 }, error: "unknown", endReason: "engine-end", durationMs: 700,
    })
  })
})

describe("minimal native probe (same browser, without the editor adapter)", () => {
  it("refuses insecure context, generic engines and engines that ignore processLocally", () => {
    expect(runNativeLocalProbe({ win: win(createFakeLocalSpeech().Ctor, false), lang: "pt-BR", quality: "command", listenMs: 10 })).toBeNull()
    const generic = createGenericSpeech()
    expect(runNativeLocalProbe({ win: win(generic.Ctor), lang: "pt-BR", quality: "command", listenMs: 10 })).toBeNull()
    expect(generic.instances).toHaveLength(0)
    expect(runNativeLocalProbe({ win: win(createFakeLocalSpeech({ acceptsProcessLocally: false }).Ctor), lang: "pt-BR", quality: "command", listenMs: 10 })).toBeNull()
  })
  it("listens locally in pt-BR, stops after the window and reports counts but never the text", async () => {
    vi.useFakeTimers()
    const fake = createFakeLocalSpeech()
    const probe = runNativeLocalProbe({ win: win(fake.Ctor), lang: "pt-BR", quality: "command", listenMs: 8000 })
    if (!probe) throw new Error("expected probe")
    const rec = fake.last()
    expect(rec.configAtStart).toMatchObject({ processLocally: true, lang: "pt-BR", continuous: true, interimResults: true })
    rec.audio("audiostart", "soundstart", "speechstart")
    rec.result("SYNTHETIC-PII Lia 52998224725", false)
    rec.result("SYNTHETIC-PII final", true)
    vi.advanceTimersByTime(8000)
    expect(rec.stopped).toBe(true)
    rec.end()
    const result = await probe.done
    expect(result).toMatchObject({ source: "native-probe", endReason: "engine-end", counts: { results: 2, interim: 1, final: 1, nomatch: 0 } })
    expect(classifyVoiceDiagnostic(result)).toBe("FINAL_RECEIVED")
    expect(JSON.stringify(result)).not.toMatch(/SYNTHETIC|Lia|52998224725/)
  })
  it("reproduces the field symptom: speech detected, no result, engine ends", async () => {
    vi.useFakeTimers()
    const fake = createFakeLocalSpeech()
    const probe = runNativeLocalProbe({ win: win(fake.Ctor), lang: "pt-BR", quality: "command", listenMs: 8000 })
    if (!probe) throw new Error("expected probe")
    fake.last().audio("audiostart", "soundstart", "speechstart", "speechend", "soundend", "audioend")
    vi.advanceTimersByTime(8000)
    fake.last().end()
    expect(classifyVoiceDiagnostic(await probe.done)).toBe("NO_RESULTS")
  })
  it("engine without end is aborted after the grace period; cancel aborts immediately", async () => {
    vi.useFakeTimers()
    const silent = createFakeLocalSpeech()
    const timedOut = runNativeLocalProbe({ win: win(silent.Ctor), lang: "pt-BR", quality: "command", listenMs: 100, endGraceMs: 50 })
    if (!timedOut) throw new Error("expected probe")
    silent.last().audio("audiostart")
    vi.advanceTimersByTime(150)
    expect((await timedOut.done).endReason).toBe("grace-timeout")
    expect(silent.last().aborted).toBe(true)
    const cancelled = createFakeLocalSpeech()
    const probe = runNativeLocalProbe({ win: win(cancelled.Ctor), lang: "pt-BR", quality: "command", listenMs: 8000 })
    if (!probe) throw new Error("expected probe")
    probe.cancel()
    cancelled.last().result("late", true)
    const result = await probe.done
    expect(result.endReason).toBe("cancelled")
    expect(result.counts.results).toBe(0)
    expect(cancelled.last().aborted).toBe(true)
  })
  it("uses dictation only when requested and supported; start failure is reported", async () => {
    const fake = createFakeLocalSpeech({ qualities: { dictation: "available" } })
    const probe = runNativeLocalProbe({ win: win(fake.Ctor), lang: "pt-BR", quality: "dictation", listenMs: 8000 })
    expect(fake.last().configAtStart).toMatchObject({ processLocally: true, quality: "dictation" })
    probe?.cancel()
    const failing = runNativeLocalProbe({ win: win(createFakeLocalSpeech({ startThrows: true }).Ctor), lang: "pt-BR", quality: "command", listenMs: 10 })
    expect(classifyVoiceDiagnostic(await failing!.done)).toBe("MIC_NOT_STARTED")
  })
})
