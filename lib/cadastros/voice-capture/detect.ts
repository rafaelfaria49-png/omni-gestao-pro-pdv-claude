/**
 * Feature detection honesta do Capture Adapter (Web Speech API).
 * Sem falsa promessa de compatibilidade universal.
 */

export type VoiceCapability = {
  available: boolean
  reason: "ok" | "ssr" | "no-api"
}

type SpeechWindowLike = {
  SpeechRecognition?: unknown
  webkitSpeechRecognition?: unknown
}

export function detectVoiceCaptureCapability(
  win: SpeechWindowLike | null | undefined | object,
): VoiceCapability {
  if (!win) return { available: false, reason: "ssr" }
  const w = win as SpeechWindowLike
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
  if (typeof Ctor !== "function") return { available: false, reason: "no-api" }
  return { available: true, reason: "ok" }
}

export function sanitizeCaptureSource(raw: unknown): "text" | "voice" {
  return raw === "voice" ? "voice" : "text"
}

/** Junta base (já no formulário) + sessão + interim, sem persistir. */
export function montarTextoCaptura(base: string, session: string, interim = ""): string {
  const parts = [base, session, interim]
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean)
  return parts.join(" ").slice(0, 2000)
}
