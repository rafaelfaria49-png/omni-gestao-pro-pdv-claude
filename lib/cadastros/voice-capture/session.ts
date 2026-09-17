/**
 * Máquina de estados pura da captura de voz.
 * Não transcreve ela mesma; só classifica eventos do adapter de browser.
 */

import {
  VOICE_CAPTURE_MESSAGES,
  type VoiceCaptureEvent,
  type VoiceCaptureSnapshot,
  type VoiceCaptureStatus,
} from "./types"

export const VOICE_CAPTURE_INITIAL: VoiceCaptureSnapshot = {
  status: "ready",
  sessionTranscript: "",
  interim: "",
  message: VOICE_CAPTURE_MESSAGES.ready,
}

function comStatus(
  prev: VoiceCaptureSnapshot,
  status: VoiceCaptureStatus,
  patch?: Partial<VoiceCaptureSnapshot>,
): VoiceCaptureSnapshot {
  return {
    ...prev,
    status,
    message: VOICE_CAPTURE_MESSAGES[status],
    ...patch,
  }
}

function statusDeErro(code: string | undefined): VoiceCaptureStatus {
  if (code === "not-allowed" || code === "service-not-allowed") return "permission-denied"
  if (code === "aborted") return "cancelled"
  return "error"
}

const ATIVOS: ReadonlySet<VoiceCaptureStatus> = new Set(["listening", "transcribing"])

export function reduceVoiceCapture(
  prev: VoiceCaptureSnapshot,
  event: VoiceCaptureEvent,
): VoiceCaptureSnapshot {
  switch (event.type) {
    case "capability":
      if (!event.available) {
        return comStatus(prev, "unavailable", { sessionTranscript: "", interim: "" })
      }
      if (prev.status === "unavailable") return comStatus(prev, "ready", { sessionTranscript: "", interim: "" })
      return prev

    case "start":
      if (prev.status === "unavailable") return prev
      return comStatus(prev, "listening", { sessionTranscript: "", interim: "" })

    case "interim":
      if (prev.status !== "listening") return prev
      return { ...prev, interim: event.text }

    case "final-chunk": {
      if (!ATIVOS.has(prev.status) && prev.status !== "listening") return prev
      const chunk = event.text.replace(/\s+/g, " ").trim()
      if (!chunk) return prev
      const sessionTranscript = [prev.sessionTranscript, chunk].filter(Boolean).join(" ").slice(0, 2000)
      return { ...prev, sessionTranscript, interim: "" }
    }

    case "stop-requested":
      if (prev.status !== "listening") return prev
      return comStatus(prev, "transcribing", { interim: "" })

    case "cancel":
      if (prev.status === "unavailable") return prev
      return comStatus(prev, "cancelled", { sessionTranscript: "", interim: "" })

    case "error": {
      const status = statusDeErro(event.code)
      const extra =
        event.code === "no-speech"
          ? "Nenhuma fala detectada. O cadastro atual foi preservado."
          : undefined
      return comStatus(prev, status, {
        interim: "",
        sessionTranscript: status === "cancelled" || status === "permission-denied" ? "" : prev.sessionTranscript,
        ...(extra ? { message: extra } : {}),
      })
    }

    case "end": {
      if (prev.status === "cancelled" || prev.status === "permission-denied" || prev.status === "error") {
        return { ...prev, interim: "" }
      }
      if (!ATIVOS.has(prev.status) && prev.status !== "listening") return prev
      if (!prev.sessionTranscript.trim()) {
        return comStatus(prev, "error", {
          interim: "",
          sessionTranscript: "",
          message: "Transcrição vazia. Revise ou fale de novo — o cadastro atual foi preservado.",
        })
      }
      return comStatus(prev, "completed", { interim: "" })
    }

    case "reset":
      if (prev.status === "unavailable") return prev
      return { ...VOICE_CAPTURE_INITIAL }

    default:
      return prev
  }
}
