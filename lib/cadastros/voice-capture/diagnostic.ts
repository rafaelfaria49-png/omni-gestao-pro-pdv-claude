/**
 * Diagnóstico sanitizado da voz local (CAD-R2-021).
 *
 * Só deslocamentos de tempo, contagens e códigos de erro conhecidos: nunca
 * áudio, transcrição, nomes, documentos ou telefones. Nada vai para log,
 * storage, URL ou rede — o resultado só é exibido na tela do operador.
 *
 * `runNativeLocalProbe` é a chamada mínima à API nativa (sem o adapter do
 * editor) para comparar, no mesmo navegador, editor × motor do navegador.
 */

export type VoiceQuality = "dictation" | "command" | "default"
export type VoiceDiagStep =
  | "audiostart" | "soundstart" | "speechstart" | "speechend" | "soundend" | "audioend"
  | "first-interim" | "first-final" | "stop-requested" | "end"
export type VoiceEndReason = "engine-end" | "grace-timeout" | "cancelled" | "start-failed"

export type VoiceDiagnostic = {
  source: "editor" | "native-probe"
  quality: VoiceQuality
  /** Milissegundos desde o início da sessão, na primeira ocorrência. */
  steps: Partial<Record<VoiceDiagStep, number>>
  counts: { results: number; interim: number; final: number; nomatch: number }
  error: string | null
  endReason: VoiceEndReason | null
  durationMs: number
}

export type VoiceDiagnosticCode =
  | "MIC_NOT_STARTED" | "NO_AUDIO" | "NO_SPEECH" | "NO_RESULTS"
  | "INTERIM_ONLY" | "FINAL_RECEIVED" | "ENGINE_FAILURE" | "CANCELLED"

const KNOWN_ERRORS = new Set([
  "no-speech", "aborted", "audio-capture", "network", "not-allowed", "service-not-allowed",
  "language-not-supported", "bad-grammar", "phrases-not-supported",
])
/** Código de erro do motor reduzido a uma lista fechada (texto livre nunca passa). */
export function sanitizeVoiceErrorCode(raw: unknown): string {
  return typeof raw === "string" && KNOWN_ERRORS.has(raw) ? raw : "unknown"
}

export function createVoiceDiagnosticRecorder(
  source: VoiceDiagnostic["source"],
  quality: VoiceQuality,
  onChange?: (snapshot: VoiceDiagnostic) => void,
  now: () => number = () => Date.now(),
) {
  const t0 = now()
  const d: VoiceDiagnostic = { source, quality, steps: {}, counts: { results: 0, interim: 0, final: 0, nomatch: 0 }, error: null, endReason: null, durationMs: 0 }
  const snapshot = (): VoiceDiagnostic => ({ ...d, steps: { ...d.steps }, counts: { ...d.counts } })
  const changed = () => { d.durationMs = Math.max(0, Math.round(now() - t0)); onChange?.(snapshot()) }
  const mark = (step: VoiceDiagStep) => { if (d.steps[step] === undefined) d.steps[step] = Math.max(0, Math.round(now() - t0)) }
  return {
    step(step: VoiceDiagStep) { mark(step); changed() },
    /** Um evento `result`: quantas partes provisórias e finais trouxe (sem o texto). */
    result(interimParts: number, finalParts: number) {
      d.counts.results++
      if (interimParts > 0) { d.counts.interim += interimParts; mark("first-interim") }
      if (finalParts > 0) { d.counts.final += finalParts; mark("first-final") }
      changed()
    },
    nomatch() { d.counts.nomatch++; changed() },
    error(code: unknown) { d.error ??= sanitizeVoiceErrorCode(code); changed() },
    end(reason: VoiceEndReason) { d.endReason ??= reason; mark("end"); changed() },
    snapshot,
  }
}

/** Do mais conclusivo para o mais elementar; "Ouvindo" sozinho não prova nada. */
export function classifyVoiceDiagnostic(d: VoiceDiagnostic): VoiceDiagnosticCode {
  if (d.counts.final > 0) return "FINAL_RECEIVED"
  if (d.counts.interim > 0) return "INTERIM_ONLY"
  if (d.endReason === "cancelled") return "CANCELLED"
  if (d.endReason === "start-failed" || d.error === "not-allowed" || d.error === "audio-capture" || d.steps.audiostart === undefined) return "MIC_NOT_STARTED"
  if (d.endReason === "grace-timeout" || (d.error && d.error !== "no-speech" && d.error !== "aborted")) return "ENGINE_FAILURE"
  if (d.steps.soundstart === undefined) return "NO_AUDIO"
  if (d.steps.speechstart === undefined || d.error === "no-speech") return "NO_SPEECH"
  return "NO_RESULTS"
}

type ProbeRecognition = {
  lang: string; continuous: boolean; interimResults: boolean; processLocally?: boolean; quality?: string
  onresult: ((e: Event) => void) | null; onerror: ((e: Event) => void) | null; onend: (() => void) | null
  onnomatch?: (() => void) | null
  start: () => void; stop: () => void; abort: () => void
} & Partial<Record<`on${"audiostart" | "soundstart" | "speechstart" | "speechend" | "soundend" | "audioend"}`, (() => void) | null>>
type ProbeWindow = { isSecureContext?: boolean; SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }
const AUDIO_STEPS = ["audiostart", "soundstart", "speechstart", "speechend", "soundend", "audioend"] as const

/**
 * Chamada mínima à API nativa: processLocally + pt-BR, escuta por `listenMs`
 * e devolve só o diagnóstico. Não guarda nem expõe o texto reconhecido.
 * Chamar somente após clique explícito (liga o microfone). `null` = sem API local.
 */
export function runNativeLocalProbe(opts: {
  win: ProbeWindow | null | undefined
  lang: string
  quality: VoiceQuality
  listenMs: number
  endGraceMs?: number
  onChange?: (snapshot: VoiceDiagnostic) => void
}): { done: Promise<VoiceDiagnostic>; cancel: () => void } | null {
  if (!opts.win || opts.win.isSecureContext !== true) return null
  let Ctor: (new () => ProbeRecognition) | undefined
  try { Ctor = (opts.win.SpeechRecognition ?? opts.win.webkitSpeechRecognition) as typeof Ctor } catch { return null }
  if (typeof Ctor !== "function" || !Ctor.prototype || !("processLocally" in Ctor.prototype)) return null
  let rec: ProbeRecognition
  try {
    rec = new Ctor()
    rec.processLocally = true
  } catch { return null }
  if (rec.processLocally !== true) return null
  rec.lang = opts.lang
  rec.continuous = true
  rec.interimResults = true
  if (opts.quality === "dictation" && "quality" in rec) { try { rec.quality = "dictation" } catch { /* mantém o padrão local */ } }
  const diag = createVoiceDiagnosticRecorder("native-probe", rec.quality === "dictation" ? "dictation" : opts.quality, opts.onChange)

  let settle!: (d: VoiceDiagnostic) => void
  const done = new Promise<VoiceDiagnostic>((resolve) => { settle = resolve })
  let finished = false
  let listenTimer: ReturnType<typeof setTimeout> | undefined
  let graceTimer: ReturnType<typeof setTimeout> | undefined
  const finish = (reason: VoiceEndReason) => {
    if (finished) return
    finished = true
    clearTimeout(listenTimer); clearTimeout(graceTimer)
    rec.onresult = null; rec.onerror = null; rec.onend = null; rec.onnomatch = null
    for (const step of AUDIO_STEPS) rec[`on${step}`] = null
    if (reason !== "engine-end") { try { rec.abort() } catch { /* já encerrado */ } }
    diag.end(reason)
    settle(diag.snapshot())
  }
  for (const step of AUDIO_STEPS) rec[`on${step}`] = () => diag.step(step)
  rec.onresult = (ev: Event) => {
    const e = ev as unknown as { resultIndex: number; results: { length: number; [i: number]: { isFinal: boolean } } }
    let interim = 0, final = 0
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i]?.isFinal) final++
      else interim++
    }
    diag.result(interim, final)
  }
  rec.onnomatch = () => diag.nomatch()
  rec.onerror = (ev: Event) => diag.error((ev as unknown as { error?: unknown }).error)
  rec.onend = () => finish("engine-end")
  try {
    rec.start()
  } catch {
    finish("start-failed")
    return { done, cancel: () => {} }
  }
  listenTimer = setTimeout(() => {
    diag.step("stop-requested")
    try { rec.stop() } catch { /* encerrado */ }
    graceTimer = setTimeout(() => finish("grace-timeout"), opts.endGraceMs ?? 5000)
  }, opts.listenMs)
  return { done, cancel: () => finish("cancelled") }
}
