import { reduceVoiceCapture, VOICE_CAPTURE_INITIAL } from "./session"
import type { LocalVoiceSupport } from "./local"
import type { VoiceDiagnostic, VoiceDiagnosticCode } from "./diagnostic"
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
  /** Espera pelo `end` do motor depois de parar ou de um erro. */
  endGraceMs: 5000,
  /** Escuta do teste mínimo do navegador (diagnóstico, sem texto guardado). */
  probeListenMs: 8000,
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
  ready: "Voz local pronta. O microfone só liga quando você tocar no microfone do campo.",
  listening: "Dite nome, telefone, CPF/CNPJ, email, cidade e endereço. Toque em Parar ditado ao terminar.",
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
  // With processLocally the spec reports a missing local engine as service-not-allowed:
  // this is not a microphone permission problem.
  "service-not-allowed": "O navegador recusou o reconhecimento local neste momento. O cadastro continua disponível por texto.",
}
const EMPTY_TRANSCRIPT = "Nenhuma fala reconhecida. Tente de novo ou digite — o cadastro atual foi preservado."
const PROVISIONAL_ONLY = "O navegador não confirmou o texto. Há um trecho provisório abaixo: use-o só se estiver correto."
const COMPLETED_WITH_PROVISIONAL = "Transcrição pronta no campo. Um trecho final ficou provisório (não confirmado pelo navegador)."

export const CLIENT_VOICE_SUPPORT_MESSAGES: Record<"checking" | "disabled" | "downloadable" | "downloading" | Extract<LocalVoiceSupport, { status: "unavailable" }>["reason"], string> = {
  checking: "Verificando se este navegador reconhece pt-BR no próprio dispositivo…",
  disabled: "Voz desativada pela política do OmniGestão. Continue por texto.",
  downloadable: "O navegador oferece reconhecimento local pt-BR, mas o pacote de idioma não está ativo. A instalação baixa só o modelo de voz do navegador, que pode passar de 100 MB (se já estiver no dispositivo, apenas o reativa); nenhum áudio é enviado.",
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

/**
 * Snapshot de Clientes: a máquina compartilhada + o último texto provisório.
 * `session.ts` (também usado por Produto) descarta o provisório ao parar; aqui
 * ele fica guardado só para recuperação explícita e revisável — nunca vira
 * dado cadastral sozinho.
 */
export type ClientVoiceSnapshot = VoiceCaptureSnapshot & { provisional: string }

/** Estado inicial de Clientes: nada é capturável antes da verificação local. */
export const CLIENT_VOICE_INITIAL: ClientVoiceSnapshot = Object.freeze({
  ...reduceVoiceCapture(VOICE_CAPTURE_INITIAL, { type: "capability", available: false }),
  message: CLIENT_VOICE_SUPPORT_MESSAGES.checking,
  provisional: "",
})

const DISCARDS_TRANSCRIPT: ReadonlySet<VoiceCaptureStatus> = new Set(["error", "cancelled", "permission-denied", "unavailable"])
const ACTIVE: ReadonlySet<VoiceCaptureStatus> = new Set(["listening", "transcribing"])

function nextProvisional(prev: ClientVoiceSnapshot, event: VoiceCaptureEvent): string {
  if (event.type === "start" || event.type === "reset" || event.type === "cancel" || event.type === "capability") return ""
  if (event.type === "error" && (event.code === "not-allowed" || event.code === "service-not-allowed")) return ""
  // Final text supersedes what was provisional until then.
  if (event.type === "final-chunk") return ""
  if (event.type === "interim" && ACTIVE.has(prev.status)) return event.text.replace(/\s+/g, " ").trim().slice(0, CLIENT_VOICE_POLICY.maxChars)
  return prev.provisional
}

/**
 * Máquina compartilhada (`session.ts`) com regras de Clientes: mensagens
 * próprias, descarte do trecho confirmado em término sem sucesso e retenção
 * do provisório (exceto cancelamento ou recusa do navegador).
 */
export function reduceClientVoiceCapture(prev: ClientVoiceSnapshot, event: VoiceCaptureEvent): ClientVoiceSnapshot {
  const shared = reduceVoiceCapture(prev, event)
  const provisional = nextProvisional(prev, event)
  if (shared === prev && provisional === prev.provisional) return prev
  const changed = shared.status !== prev.status || event.type === "error"
  let message = prev.message
  if (changed) {
    message = STATUS_MESSAGES[shared.status]
    if (event.type === "error") message = ERROR_MESSAGES[event.code] ?? message
    if (event.type === "end" && shared.status === "error") message = provisional ? PROVISIONAL_ONLY : EMPTY_TRANSCRIPT
    if (event.type === "end" && shared.status === "completed" && provisional) message = COMPLETED_WITH_PROVISIONAL
  }
  return {
    ...shared,
    ...(DISCARDS_TRANSCRIPT.has(shared.status) ? { sessionTranscript: "", interim: "" } : {}),
    provisional: shared.status === "permission-denied" || shared.status === "cancelled" ? "" : provisional,
    message,
  }
}

/** Texto honesto da etapa durante a escuta: "Ouvindo" sozinho não prova áudio nem texto. */
export function clientVoiceStage(d: VoiceDiagnostic | null): string {
  if (!d || d.steps.audiostart === undefined) return "Iniciando o microfone…"
  if (d.counts.results > 0) return "Recebendo texto"
  if (d.steps.speechstart !== undefined) return "Fala detectada — aguardando o texto"
  if (d.steps.soundstart !== undefined) return "Som detectado"
  return "Microfone ativo — aguardando som"
}

export const CLIENT_VOICE_DIAGNOSTIC_TEXT: Record<VoiceDiagnosticCode, string> = {
  MIC_NOT_STARTED: "o microfone não chegou a iniciar (permissão, dispositivo ocupado ou falha ao iniciar).",
  NO_AUDIO: "o microfone iniciou, mas o navegador não recebeu som.",
  NO_SPEECH: "houve som, mas o navegador não detectou fala.",
  NO_RESULTS: "o navegador detectou fala, mas o reconhecedor local não devolveu nenhum texto.",
  INTERIM_ONLY: "o reconhecedor devolveu só texto provisório, sem confirmação final.",
  FINAL_RECEIVED: "o reconhecedor devolveu texto confirmado.",
  ENGINE_FAILURE: "o reconhecedor local falhou ou não respondeu a tempo.",
  CANCELLED: "captura cancelada antes do fim (botão, fechamento ou aba oculta).",
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
