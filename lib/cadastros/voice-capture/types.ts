/**
 * Capture Adapter de voz para Cadastro Inteligente de Produto (CAD-R2-017).
 *
 * VOZ = CAPTURA. Não interpreta Produto. A transcrição temporária segue para
 * `interpretarProdutoTextoLivre` (CAD-R2-016), o único interpretador canônico.
 *
 * Sem Prisma, sem ProductWriteService, sem StockLedger, sem prompt de Produto,
 * sem segundo schema de sugestão.
 */

/** Estados mínimos da captura — união fechada, sem score inventado. */
export type VoiceCaptureStatus =
  | "ready"
  | "listening"
  | "transcribing"
  | "completed"
  | "permission-denied"
  | "unavailable"
  | "error"
  | "cancelled"

export type VoiceCaptureSnapshot = {
  status: VoiceCaptureStatus
  /** Trecho desta sessão (ainda não mesclado ao textarea pelo caller). */
  sessionTranscript: string
  interim: string
  message: string | null
}

export type VoiceCaptureEvent =
  | { type: "capability"; available: boolean }
  | { type: "start" }
  | { type: "interim"; text: string }
  | { type: "final-chunk"; text: string }
  | { type: "stop-requested" }
  | { type: "end" }
  | { type: "cancel" }
  | { type: "error"; code: string }
  | { type: "reset" }

export const VOICE_CAPTURE_MESSAGES: Record<VoiceCaptureStatus, string> = {
  ready: "Pronto para gravar. O microfone só liga se você tocar no botão.",
  listening: "Ouvindo… fale a descrição do produto e encerre quando terminar.",
  transcribing: "Finalizando transcrição…",
  completed: "Transcrição pronta. Revise o texto e interprete com IA.",
  "permission-denied":
    "Permissão do microfone negada. O cadastro continua disponível por texto.",
  unavailable:
    "Reconhecimento de voz não está disponível neste navegador. Use Chrome ou Edge em HTTPS (ou localhost). Você pode descrever o produto por texto.",
  error: "Não foi possível transcrever. O cadastro atual foi preservado.",
  cancelled: "Captura cancelada. O cadastro atual foi preservado.",
}
