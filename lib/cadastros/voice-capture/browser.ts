/**
 * Adapter de captura via Web Speech API (Chrome/Edge).
 *
 * Não envia áudio pelo nosso servidor. Não grava blob. Não chama Whisper.
 * A disponibilidade depende do navegador — ver `detectVoiceCaptureCapability`.
 *
 * Chrome/Edge podem usar o serviço de reconhecimento do próprio navegador;
 * este módulo não introduz um provider STT novo no OmniGestão.
 */

import {
  getSpeechRecognitionConstructor,
  type SpeechRecognitionErrorEventLike,
  type SpeechRecognitionEventLike,
  type SpeechRecognitionInstance,
} from "@/lib/web-speech-recognition"
import type { VoiceCaptureEvent } from "./types"

export function getProdutoVoiceSpeechConstructor(): (new () => SpeechRecognitionInstance) | null {
  return getSpeechRecognitionConstructor()
}

export type VoiceBrowserSession = {
  ok: true
  stop: () => void
  cancel: () => void
  /** Encerra o motor sem emitir eventos (unmount). */
  dispose: () => void
}

export type VoiceBrowserStartResult =
  | VoiceBrowserSession
  | { ok: false; reason: "unavailable" | "start-failed" }

function coletarFinais(e: SpeechRecognitionEventLike): string {
  let text = ""
  for (let i = e.resultIndex; i < e.results.length; i++) {
    const result = e.results[i]
    if (!result) continue
    const piece = result[0]?.transcript ?? ""
    if (result.isFinal) text += piece
  }
  return text
}

function coletarInterim(e: SpeechRecognitionEventLike): string {
  let text = ""
  for (let i = e.resultIndex; i < e.results.length; i++) {
    const result = e.results[i]
    if (!result) continue
    if (!result.isFinal) text += result[0]?.transcript ?? ""
  }
  return text
}

/**
 * Inicia reconhecimento somente após ação explícita do caller.
 * O caller deve emitir `start` antes; este adapter só liga o motor nativo.
 */
export function startBrowserVoiceCapture(opts: {
  emit: (event: VoiceCaptureEvent) => void
  lang?: string
}): VoiceBrowserStartResult {
  const Ctor = getSpeechRecognitionConstructor()
  if (!Ctor) return { ok: false, reason: "unavailable" }

  const rec: SpeechRecognitionInstance = new Ctor()
  rec.lang = opts.lang ?? "pt-BR"
  rec.continuous = true
  rec.interimResults = true
  rec.maxAlternatives = 1

  let finished = false
  const finish = (mode: "stop" | "abort") => {
    try {
      if (mode === "abort") rec.abort()
      else rec.stop()
    } catch {
      try {
        rec.abort()
      } catch {
        /* ignore */
      }
    }
  }

  rec.onresult = (ev: Event) => {
    const e = ev as SpeechRecognitionEventLike
    const interim = coletarInterim(e).trim()
    if (interim) opts.emit({ type: "interim", text: interim })
    const finals = coletarFinais(e).trim()
    if (finals) opts.emit({ type: "final-chunk", text: finals })
  }
  rec.onerror = (ev: Event) => {
    const code = (ev as SpeechRecognitionErrorEventLike).error ?? "unknown"
    opts.emit({ type: "error", code })
  }
  rec.onend = () => {
    if (finished) return
    finished = true
    rec.onresult = null
    rec.onerror = null
    rec.onend = null
    opts.emit({ type: "end" })
  }

  try {
    rec.start()
  } catch {
    finish("abort")
    return { ok: false, reason: "start-failed" }
  }

  return {
    ok: true,
    stop: () => {
      opts.emit({ type: "stop-requested" })
      finish("stop")
    },
    cancel: () => {
      opts.emit({ type: "cancel" })
      finish("abort")
    },
    dispose: () => finish("abort"),
  }
}
