import { reduceVoiceCapture, VOICE_CAPTURE_INITIAL } from "./session"

/** No approval evidence for browser speech processing exists. No caller can enable this gate. */
export const CLIENT_VOICE_PRIVACY_GATE = {
  enabled: false,
  code: "PRIVACY_REVIEW_REQUIRED",
  message: "Voz indisponível: aguarda autorização administrativa e jurídica para o processamento. O reconhecimento do navegador pode enviar áudio a serviços externos.",
} as const

/** Reuse the shared capture lifecycle, without constructing or starting a speech engine. */
export function clientVoiceCaptureSnapshot() {
  return {
    ...reduceVoiceCapture(VOICE_CAPTURE_INITIAL, { type: "capability", available: CLIENT_VOICE_PRIVACY_GATE.enabled }),
    message: CLIENT_VOICE_PRIVACY_GATE.message,
  }
}
