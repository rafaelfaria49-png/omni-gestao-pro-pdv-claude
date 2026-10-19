import { reduceVoiceCapture, VOICE_CAPTURE_INITIAL } from "./session"

/**
 * No administrative/legal approval exists. This is a code decision, never an
 * environment, browser-capability or caller-controlled feature flag.
 * Freeze at runtime too: TypeScript's `as const` alone does not prevent mutation.
 */
export const CLIENT_VOICE_PRIVACY_GATE = Object.freeze({
  enabled: false,
  code: "PRIVACY_REVIEW_REQUIRED",
  message: "Voz indisponível: aguarda autorização administrativa e jurídica para o processamento. O reconhecimento do navegador pode enviar áudio a serviços externos.",
} as const)

/** Reuse the shared capture lifecycle, without constructing or starting a speech engine. */
export function clientVoiceCaptureSnapshot() {
  return {
    ...reduceVoiceCapture(VOICE_CAPTURE_INITIAL, { type: "capability", available: CLIENT_VOICE_PRIVACY_GATE.enabled }),
    message: CLIENT_VOICE_PRIVACY_GATE.message,
  }
}
