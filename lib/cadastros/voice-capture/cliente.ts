import { reduceVoiceCapture, VOICE_CAPTURE_INITIAL } from "./session"
import type { LocalVoiceSupport } from "./local"
import type { VoiceCaptureEvent, VoiceCaptureSnapshot, VoiceCaptureStatus } from "./types"

/**
 * Voz de Clientes liberada pelo responsável do produto em 19/10/2026, somente
 * com processamento LOCAL no dispositivo. Decisão de código, não flag de env,
 * query, storage ou capacidade do navegador; congelada também em runtime.
 * Suspender = `enabled: false` (desliga UI e a origem `voice` na Action).
 * Processamento remoto (serviço do navegador ou fornecedor contratado) não
 * está aprovado: não existe caminho para ele, nem como fallback.
 */
export const CLIENT_VOICE_POLICY = Object.freeze({
  enabled: true,
  processing: "local-only",
  remoteFallback: false,
  lang: "pt-BR",
  maxDurationMs: 30_000,
  maxChars: 2000,
  availabilityTimeoutMs: 5000,
  storesAudio: false,
  autoSave: false,
} as const)

export type ClientCaptureSource = "text" | "voice"

/** A origem é só rótulo: não autoriza, não muda o parser nem a persistência. */
export function isClientCaptureSource(raw: unknown): raw is ClientCaptureSource {
  return raw === "text" || (raw === "voice" && CLIENT_VOICE_POLICY.enabled)
}
export const CLIENT_CAPTURE_SOURCE_INVALID_MESSAGE = "Origem de captura inválida. Descreva o cliente por texto."

const STATUS_MESSAGES: Record<VoiceCaptureStatus, string> = {
  ready: "Voz local pronta. O microfone só liga quando você tocar em Ditar por voz.",
  listening: "Ouvindo… dite nome, telefone, CPF/CNPJ, email, cidade e endereço. Toque em Parar ditado ao terminar.",
  transcribing: "Finalizando a transcrição no dispositivo…",
  completed: "Transcrição pronta no campo acima. Corrija se precisar e toque em Interpretar texto.",
  "permission-denied": "Microfone bloqueado pelo navegador. O cadastro continua disponível por texto.",
  unavailable: "Reconhecimento local pt-BR indisponível neste navegador. Continue por texto.",
  error: "Não foi possível transcrever no dispositivo. O cadastro atual foi preservado.",
  cancelled: "Ditado cancelado. Nada foi levado ao cadastro.",
}
const ERROR_MESSAGES: Record<string, string> = {
  "no-speech": "Nenhuma fala detectada. Tente de novo ou digite — o cadastro atual foi preservado.",
  "audio-capture": "Microfone indisponível ou ocupado. O cadastro continua disponível por texto.",
  "language-not-supported": "Pacote local pt-BR indisponível neste dispositivo. Continue por texto.",
}
const EMPTY_TRANSCRIPT = "Nenhuma fala reconhecida. Tente de novo ou digite — o cadastro atual foi preservado."

export const CLIENT_VOICE_SUPPORT_MESSAGES: Record<"checking" | "disabled" | "downloadable" | "downloading" | Extract<LocalVoiceSupport, { status: "unavailable" }>["reason"], string> = {
  checking: "Verificando se este navegador reconhece pt-BR no próprio dispositivo…",
  disabled: "Voz desativada pela política do OmniGestão. Continue por texto.",
  downloadable: "O navegador oferece reconhecimento local pt-BR, mas o pacote de idioma não está instalado. A instalação baixa só o modelo de voz do navegador; nenhum áudio é enviado.",
  downloading: "O navegador está baixando o pacote local pt-BR. Verifique novamente em instantes.",
  ssr: STATUS_MESSAGES.unavailable,
  "insecure-context": "Voz local exige conexão segura (HTTPS). Continue por texto.",
  "no-api": "Este navegador não oferece reconhecimento de voz. Continue por texto.",
  "no-local-api": "Este navegador só oferece reconhecimento que pode enviar o áudio a serviços externos. Por privacidade, a voz fica desligada; continue por texto.",
  "language-unavailable": "Reconhecimento local em português (pt-BR) indisponível neste dispositivo. Continue por texto.",
  "policy-blocked": "Reconhecimento local bloqueado pela política do navegador ou da organização. Continue por texto.",
  timeout: "Não foi possível verificar o reconhecimento local. Continue por texto.",
  "query-failed": "Não foi possível verificar o reconhecimento local. Continue por texto.",
}

/** Estado inicial de Clientes: nada é capturável antes da verificação local. */
export const CLIENT_VOICE_INITIAL: VoiceCaptureSnapshot = Object.freeze({
  ...reduceVoiceCapture(VOICE_CAPTURE_INITIAL, { type: "capability", available: false }),
  message: CLIENT_VOICE_SUPPORT_MESSAGES.checking,
})

const DISCARDS_TRANSCRIPT: ReadonlySet<VoiceCaptureStatus> = new Set(["error", "cancelled", "permission-denied", "unavailable"])

/**
 * Máquina compartilhada (`session.ts`) com duas regras de Clientes: mensagens
 * próprias e descarte do trecho temporário em qualquer término sem sucesso.
 */
export function reduceClientVoiceCapture(prev: VoiceCaptureSnapshot, event: VoiceCaptureEvent): VoiceCaptureSnapshot {
  const next = reduceVoiceCapture(prev, event)
  if (next === prev) return prev
  const changed = next.status !== prev.status || event.type === "error"
  let message = prev.message
  if (changed) {
    message = STATUS_MESSAGES[next.status]
    if (event.type === "error") message = ERROR_MESSAGES[event.code] ?? message
    if (event.type === "end" && next.status === "error") message = EMPTY_TRANSCRIPT
  }
  return {
    ...next,
    ...(DISCARDS_TRANSCRIPT.has(next.status) ? { sessionTranscript: "", interim: "" } : {}),
    message,
  }
}

// Rótulos do parser de Cliente que, ditos no meio da frase, iniciam outro campo.
// Fortes nunca fazem parte de endereço; fracos (cidade/estado/UF) podem fazer.
const STRONG = "telefone|celular|whatsapp|cpf|cnpj|e-mail|email|mora em|reside em|endereço|endereco"
const WEAK = "cidade|estado|uf"
const LABEL = new RegExp(`(^|[\\s,;:.]+)(${STRONG}|${WEAK})(?=[\\s,;:.]|$)`, "giu")

/**
 * Formatação visível e editável da transcrição: pontuação falada e separação
 * dos rótulos que o parser canônico já conhece. Não extrai campos — o
 * interpretador continua sendo `interpretarTextoCliente`.
 */
export function formatarTranscricaoCliente(raw: string): string {
  let text = raw.replace(/\s+/g, " ").trim()
  text = text.replace(/\s*\bponto e v[íi]rgula\b\s*/giu, "; ")
  text = text.replace(/\s*\bv[íi]rgula\b\s*/giu, ", ")
  text = text.replace(/\s*\bdois pontos\b\s*/giu, ": ")
  text = text.replace(/\be mail\b/giu, "email")
  text = text.replace(/(\S+)\s+arroba\s+(\S+)/giu, "$1@$2")
  for (let prev = ""; prev !== text;) {
    prev = text
    text = text.replace(/(@[\p{L}\p{N}.-]+)\s+ponto\s+([\p{L}\p{N}-]+)/giu, "$1.$2")
  }
  let inAddress = false
  text = text.replace(LABEL, (match: string, before: string, label: string, offset: number) => {
    const lower = label.toLowerCase()
    const weak = lower === "cidade" || lower === "estado" || lower === "uf"
    const isAddress = lower.startsWith("endere")
    if (before.includes(";") || before.includes(":")) inAddress = false
    let out = match
    // A sentence period from the engine becomes the field separator ("Teste. Telefone" → "Teste, Telefone").
    if (offset > 0 && !/[,;:]/.test(before) && !(inAddress && weak && !before.includes("."))) {
      out = `${inAddress ? ";" : ","} ${label}`
      if (inAddress) inAddress = false
    }
    if (isAddress) inAddress = true
    else if (!weak) inAddress = false
    return out
  })
  return text.replace(/^[\s,;:]+/, "").replace(/\s+([,;:])/g, "$1").replace(/[,;]\s*$/, "").trim()
}

/** Acrescenta a transcrição em linha própria, preservando o texto já digitado. */
export function juntarTranscricaoCliente(base: string, transcript: string, limit = CLIENT_VOICE_POLICY.maxChars): string {
  const before = base.replace(/\s+$/, "")
  const dictated = transcript.trim()
  if (!dictated) return base
  return (before ? `${before}\n${dictated}` : dictated).slice(0, limit)
}
