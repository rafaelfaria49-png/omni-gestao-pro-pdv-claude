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

export type LocalVoiceSupport =
  | { status: "available" }
  | { status: "downloadable" }
  | { status: "downloading" }
  | { status: "unavailable"; reason: LocalVoiceUnavailableReason }

type LocalOptions = { langs: string[]; processLocally: true }
type LocalRecognition = SpeechRecognitionInstance & { processLocally?: boolean }
type LocalSpeechCtor = (new () => LocalRecognition) & {
  available: (options: LocalOptions) => Promise<unknown>
  install?: (options: LocalOptions) => Promise<unknown>
}
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
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const result = await Promise.race([
      ctor.available({ langs: [opts.lang], processLocally: true }),
      new Promise<"TIMEOUT">((resolve) => { timer = setTimeout(() => resolve("TIMEOUT"), opts.timeoutMs) }),
    ])
    if (result === "available" || result === "downloadable" || result === "downloading") return { status: result }
    if (result === "unavailable") return { status: "unavailable", reason: "language-unavailable" }
    if (result === "TIMEOUT") return { status: "unavailable", reason: "timeout" }
    return { status: "unavailable", reason: "query-failed" }
  } catch (error) {
    const name = (error as { name?: unknown } | null)?.name
    return { status: "unavailable", reason: name === "NotAllowedError" ? "policy-blocked" : "query-failed" }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Pede ao navegador o pacote local do idioma. Ação separada e explícita do
 * operador: chamar de forma síncrona dentro do clique (ativação do usuário).
 * Baixa apenas o modelo do fornecedor do navegador; nenhum áudio é enviado.
 */
export function installLocalVoicePack(win: SpeechWindowLike | null | undefined, lang: string): Promise<boolean> {
  if (!win || win.isSecureContext !== true) return Promise.resolve(false)
  const ctor = localSpeechCtor(win)
  if (typeof ctor === "string" || typeof ctor.install !== "function") return Promise.resolve(false)
  try {
    return ctor.install({ langs: [lang], processLocally: true }).then((ok) => ok === true, () => false)
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
  }
  const abortEngine = () => {
    try { rec.abort() } catch { /* motor já encerrado */ }
  }
  const finishWithEnd = () => {
    if (finished) return
    finished = true
    detach()
    opts.emit({ type: "end" })
  }
  const requestStop = () => {
    if (finished || stopping) return
    stopping = true
    clearTimeout(durationTimer)
    opts.emit({ type: "stop-requested" })
    try { rec.stop() } catch { abortEngine() }
    // Motor que não devolve `end` não pode deixar o microfone aberto.
    graceTimer = setTimeout(() => { abortEngine(); finishWithEnd() }, opts.endGraceMs ?? 5000)
  }

  rec.onresult = (ev: Event) => {
    const e = ev as SpeechRecognitionEventLike
    const interim = coletar(e, false).trim()
    if (interim && !stopping) opts.emit({ type: "interim", text: interim })
    const finals = coletar(e, true).trim()
    if (!finals) return
    opts.emit({ type: "final-chunk", text: finals })
    finalChars += finals.length + 1
    if (finalChars >= opts.maxChars) {
      opts.onAutoStop?.("chars")
      requestStop()
    }
  }
  rec.onerror = (ev: Event) => {
    if (finished) return
    opts.emit({ type: "error", code: (ev as SpeechRecognitionErrorEventLike).error ?? "unknown" })
    clearTimeout(durationTimer)
    clearTimeout(graceTimer)
    graceTimer = setTimeout(() => { abortEngine(); finishWithEnd() }, opts.endGraceMs ?? 5000)
  }
  rec.onend = finishWithEnd

  try {
    rec.start()
  } catch {
    finished = true
    detach()
    abortEngine()
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
