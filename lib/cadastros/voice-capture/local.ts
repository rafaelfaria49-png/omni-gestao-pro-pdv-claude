/**
 * Capture Adapter de voz ESTRITAMENTE LOCAL (CAD-R2-021 · Clientes).
 *
 * Exige a API on-device do Web Speech: `processLocally`, `available()` e
 * `install()`. O reconhecimento genérico (`SpeechRecognition` sem essas
 * peças) NÃO é aceito: o navegador pode enviar o áudio ao serviço do
 * fornecedor. Sem fallback remoto — indisponível encerra e o texto continua.
 *
 * Não grava áudio, não passa pelo servidor do OmniGestão, não registra
 * transcrição em log/storage. Emite os mesmos `VoiceCaptureEvent` da máquina
 * compartilhada (`session.ts`); o adapter de Produto (`browser.ts`) não muda.
 */

import type {
  SpeechRecognitionErrorEventLike,
  SpeechRecognitionEventLike,
  SpeechRecognitionInstance,
} from "@/lib/web-speech-recognition"
import type { VoiceBrowserStartResult } from "./browser"
import { createVoiceDiagnosticRecorder, type VoiceDiagnostic, type VoiceQuality } from "./diagnostic"
import type { VoiceCaptureEvent } from "./types"

export type LocalVoiceUnavailableReason =
  | "ssr"
  | "insecure-context"
  | "no-api"
  | "no-local-api"
  | "language-unavailable"
  | "policy-blocked"
  | "timeout"
  | "query-failed"

/**
 * `quality` (spec: command < dictation < conversation) só existe nas opções de
 * `available()`/`install()`. "default" = navegador sem esse membro (padrão do motor).
 */
export type LocalVoiceSupport =
  | { status: "available"; quality: VoiceQuality }
  | { status: "downloadable"; quality: VoiceQuality }
  | { status: "downloading"; quality: VoiceQuality }
  | { status: "unavailable"; reason: LocalVoiceUnavailableReason }

type LocalOptions = { langs: string[]; processLocally: true; quality?: "command" | "dictation" | string }
type AudioStep = "audiostart" | "soundstart" | "speechstart" | "speechend" | "soundend" | "audioend"
type LocalRecognition = SpeechRecognitionInstance & { processLocally?: boolean; quality?: string; onnomatch?: (() => void) | null }
  & Partial<Record<`on${AudioStep}`, (() => void) | null>>
type LocalSpeechCtor = (new () => LocalRecognition) & {
  available: (options: LocalOptions) => Promise<unknown>
  install?: (options: LocalOptions) => Promise<unknown>
}
const AUDIO_STEPS: readonly AudioStep[] = ["audiostart", "soundstart", "speechstart", "speechend", "soundend", "audioend"]
const optionsFor = (lang: string, quality: VoiceQuality): LocalOptions =>
  quality === "default" ? { langs: [lang], processLocally: true } : { langs: [lang], processLocally: true, quality }
type SpeechWindowLike = { isSecureContext?: boolean; SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }

/** Construtor com API local completa, ou null. Getter adulterado conta como ausente. */
function localSpeechCtor(win: SpeechWindowLike): LocalSpeechCtor | "no-api" | "no-local-api" {
  try {
    const ctor = (win.SpeechRecognition ?? win.webkitSpeechRecognition) as LocalSpeechCtor | undefined
    if (typeof ctor !== "function") return "no-api"
    if (!ctor.prototype || !("processLocally" in ctor.prototype) || typeof ctor.available !== "function") return "no-local-api"
    return ctor
  } catch {
    return "no-api"
  }
}

/** Recusas decidíveis sem consultar o motor (síncrono). `null` = consultar `available`. */
export function localVoicePreflight(win: SpeechWindowLike | null | undefined): LocalVoiceSupport | null {
  if (!win) return { status: "unavailable", reason: "ssr" }
  if (win.isSecureContext !== true) return { status: "unavailable", reason: "insecure-context" }
  const ctor = localSpeechCtor(win)
  return typeof ctor === "string" ? { status: "unavailable", reason: ctor } : null
}

/**
 * Consulta somente metadados (`available`): não constrói reconhecedor, não liga
 * microfone e não instala pacote. `downloadable`/`downloading` não autorizam captura.
 */
export async function checkLocalVoiceSupport(
  win: SpeechWindowLike | null | undefined,
  opts: { lang: string; timeoutMs: number },
): Promise<LocalVoiceSupport> {
  const refused = localVoicePreflight(win)
  if (refused) return refused
  const ctor = localSpeechCtor(win as SpeechWindowLike) as LocalSpeechCtor
  const timers: ReturnType<typeof setTimeout>[] = []
  const query = (options: LocalOptions) => Promise.race([
    ctor.available(options),
    new Promise<"TIMEOUT">((resolve) => { timers.push(setTimeout(() => resolve("TIMEOUT"), opts.timeoutMs)) }),
  ])
  // A browser that knows the `quality` enum rejects an unknown value with TypeError;
  // one that does not simply ignores the member. Metadata only, no download.
  const qualityKnown = query({ langs: [opts.lang], processLocally: true, quality: "__unsupported__" })
    .then(() => false, (error) => (error as { name?: unknown } | null)?.name === "TypeError")
  try {
    const [knowsQuality, base] = await Promise.all([qualityKnown, query({ langs: [opts.lang], processLocally: true })])
    const mapped = (result: unknown, quality: VoiceQuality): LocalVoiceSupport => {
      if (result === "available" || result === "downloadable" || result === "downloading") return { status: result, quality }
      if (result === "unavailable") return { status: "unavailable", reason: "language-unavailable" }
      if (result === "TIMEOUT") return { status: "unavailable", reason: "timeout" }
      return { status: "unavailable", reason: "query-failed" }
    }
    if (!knowsQuality) return mapped(base, "default")
    // Dictation only when the browser declares it for this language; otherwise the
    // spec default ("command") keeps working exactly as before. Never remote.
    const dictation = await query(optionsFor(opts.lang, "dictation")).catch(() => "unavailable")
    if (dictation === "available") return { status: "available", quality: "dictation" }
    if (base === "available") return { status: "available", quality: "command" }
    if (dictation === "downloadable" || dictation === "downloading") return { status: dictation, quality: "dictation" }
    return mapped(base, "command")
  } catch (error) {
    const name = (error as { name?: unknown } | null)?.name
    return { status: "unavailable", reason: name === "NotAllowedError" ? "policy-blocked" : "query-failed" }
  } finally {
    timers.forEach(clearTimeout)
  }
}

/**
 * Pede ao navegador o pacote local do idioma. Ação separada e explícita do
 * operador: chamar de forma síncrona dentro do clique (ativação do usuário).
 * Baixa apenas o modelo do fornecedor do navegador; nenhum áudio é enviado.
 */
export function installLocalVoicePack(win: SpeechWindowLike | null | undefined, lang: string, quality: VoiceQuality = "default"): Promise<boolean> {
  if (!win || win.isSecureContext !== true) return Promise.resolve(false)
  const ctor = localSpeechCtor(win)
  if (typeof ctor === "string" || typeof ctor.install !== "function") return Promise.resolve(false)
  try {
    return ctor.install(optionsFor(lang, quality)).then((ok) => ok === true, () => false)
  } catch {
    return Promise.resolve(false)
  }
}

function coletar(e: SpeechRecognitionEventLike, finais: boolean): string {
  let text = ""
  for (let i = e.resultIndex; i < e.results.length; i++) {
    const result = e.results[i]
    if (result && result.isFinal === finais) text += result[0]?.transcript ?? ""
  }
  return text
}

/**
 * Liga o motor local somente após clique explícito. O caller emite `start`
 * antes. Recusa iniciar se a instância não aceitar `processLocally = true`.
 */
export function startLocalVoiceCapture(opts: {
  win: SpeechWindowLike | null | undefined
  emit: (event: VoiceCaptureEvent) => void
  lang: string
  maxDurationMs: number
  maxChars: number
  /** Tempo máximo entre o pedido de parada e o `end` do motor. */
  endGraceMs?: number
  onAutoStop?: (reason: "duration" | "chars") => void
  /** Qualidade declarada disponível por `checkLocalVoiceSupport`. */
  quality?: VoiceQuality
  /** Diagnóstico sanitizado a cada etapa (tempos, contagens, código de erro). */
  onDiagnostic?: (snapshot: VoiceDiagnostic) => void
}): VoiceBrowserStartResult {
  if (!opts.win || opts.win.isSecureContext !== true) return { ok: false, reason: "unavailable" }
  const ctor = localSpeechCtor(opts.win)
  if (typeof ctor === "string") return { ok: false, reason: "unavailable" }

  let rec: LocalRecognition
  try {
    rec = new ctor()
    rec.processLocally = true
  } catch {
    return { ok: false, reason: "unavailable" }
  }
  // Sem confirmação de processamento local, não há captura (nem fallback).
  if (rec.processLocally !== true) return { ok: false, reason: "unavailable" }
  rec.lang = opts.lang
  rec.continuous = true
  rec.interimResults = true
  rec.maxAlternatives = 1
  // Chrome also exposes `quality` on the instance; a refusal keeps the local default.
  if (opts.quality === "dictation" && "quality" in rec) { try { rec.quality = "dictation" } catch { /* padrão local */ } }
  const diag = createVoiceDiagnosticRecorder("editor", rec.quality === "dictation" ? "dictation" : opts.quality ?? "default", opts.onDiagnostic)

  let finished = false
  let stopping = false
  let finalChars = 0
  let durationTimer: ReturnType<typeof setTimeout> | undefined
  let graceTimer: ReturnType<typeof setTimeout> | undefined

  const detach = () => {
    clearTimeout(durationTimer)
    clearTimeout(graceTimer)
    rec.onresult = null
    rec.onerror = null
    rec.onend = null
    rec.onnomatch = null
    for (const step of AUDIO_STEPS) rec[`on${step}`] = null
  }
  const abortEngine = () => {
    try { rec.abort() } catch { /* motor já encerrado */ }
  }
  const finishWithEnd = (reason: "engine-end" | "grace-timeout") => {
    if (finished) return
    finished = true
    detach()
    diag.end(reason)
    opts.emit({ type: "end" })
  }
  const startGrace = () => {
    clearTimeout(graceTimer)
    // Motor que não devolve `end` não pode deixar o microfone aberto.
    graceTimer = setTimeout(() => { abortEngine(); finishWithEnd("grace-timeout") }, opts.endGraceMs ?? 5000)
  }
  const requestStop = () => {
    if (finished || stopping) return
    stopping = true
    clearTimeout(durationTimer)
    diag.step("stop-requested")
    opts.emit({ type: "stop-requested" })
    try { rec.stop() } catch { abortEngine() }
    startGrace()
  }

  for (const step of AUDIO_STEPS) rec[`on${step}`] = () => diag.step(step)
  rec.onnomatch = () => diag.nomatch()
  rec.onresult = (ev: Event) => {
    const e = ev as SpeechRecognitionEventLike
    let interimParts = 0, finalParts = 0
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i]?.isFinal) finalParts++
      else if (e.results[i]) interimParts++
    }
    diag.result(interimParts, finalParts)
    // Finals first: the provisional tail of the same event must survive them.
    const finals = coletar(e, true).trim()
    if (finals) {
      opts.emit({ type: "final-chunk", text: finals })
      finalChars += finals.length + 1
    }
    // Provisional text after stop is still forwarded: the caller keeps it for an
    // explicit, reviewable recovery instead of silently losing it.
    const interim = coletar(e, false).trim()
    if (interim) opts.emit({ type: "interim", text: interim })
    if (finals && finalChars >= opts.maxChars) {
      opts.onAutoStop?.("chars")
      requestStop()
    }
  }
  rec.onerror = (ev: Event) => {
    if (finished) return
    const code = (ev as SpeechRecognitionErrorEventLike).error ?? "unknown"
    diag.error(code)
    opts.emit({ type: "error", code })
    clearTimeout(durationTimer)
    startGrace()
  }
  rec.onend = () => finishWithEnd("engine-end")

  try {
    rec.start()
  } catch {
    finished = true
    detach()
    abortEngine()
    diag.end("start-failed")
    return { ok: false, reason: "start-failed" }
  }
  durationTimer = setTimeout(() => {
    opts.onAutoStop?.("duration")
    requestStop()
  }, opts.maxDurationMs)

  return {
    ok: true,
    stop: requestStop,
    cancel: () => {
      if (finished) return
      finished = true
      detach()
      diag.end("cancelled")
      opts.emit({ type: "cancel" })
      abortEngine()
    },
    dispose: () => {
      finished = true
      detach()
      abortEngine()
    },
  }
}
