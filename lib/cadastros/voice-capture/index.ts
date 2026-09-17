/**
 * Barrel público do Capture Adapter de voz (CAD-R2-017).
 * Não interpreta Produto — só captura transcrição temporária.
 */

export type {
  VoiceCaptureStatus,
  VoiceCaptureSnapshot,
  VoiceCaptureEvent,
} from "./types"
export { VOICE_CAPTURE_MESSAGES } from "./types"

export {
  detectVoiceCaptureCapability,
  sanitizeCaptureSource,
  montarTextoCaptura,
} from "./detect"
export type { VoiceCapability } from "./detect"

export { reduceVoiceCapture, VOICE_CAPTURE_INITIAL } from "./session"

export {
  getProdutoVoiceSpeechConstructor,
  startBrowserVoiceCapture,
} from "./browser"
export type { VoiceBrowserSession, VoiceBrowserStartResult } from "./browser"
