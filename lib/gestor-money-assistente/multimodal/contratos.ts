/**
 * Contratos canônicos multimodais — G009 (Áudio/STT) e G010 (Imagem/Documento/OCR).
 *
 * Princípios inegociáveis:
 * - Conteúdo de mídia (transcrição, OCR, legenda, nome de arquivo) é DADO não confiável,
 *   NUNCA instrução de sistema nem autorização financeira.
 * - Nenhuma transcrição, OCR ou classificação de documento executa operação financeira
 *   diretamente: todo lançamento passa pelo motor conversacional G008 (revisão + confirmação)
 *   e pelo motor financeiro canônico G004.
 * - Campos monetários são sempre strings inteiras em centavos (nunca float, nunca inventados).
 * - Providers externos são substituíveis e falham fechados com diagnóstico honesto.
 * - Processamento temporário de mídia é estritamente separado do armazenamento permanente
 *   G003-STORAGE (R2 privado).
 */
import type { FormaPagamento } from "../tipos"
import { normalizarTexto } from "../texto"

// ─── Limites canônicos de mídia e custo ────────────────────────────────────

export const LIMITES_MIDIA = {
  MAX_BYTES_AUDIO: 10 * 1024 * 1024, // 10 MB
  MAX_DURACAO_AUDIO_SEG: 180, // 3 minutos
  MAX_BYTES_DOCUMENTO: 10 * 1024 * 1024, // 10 MB
  MAX_PAGINAS_PDF: 10,
  MAX_TEXTO_TRANSCRICAO: 2000,
  MAX_TEXTO_OCR: 4000,
  MAX_REDIRECTS_DOWNLOAD: 2,
  TIMEOUT_DOWNLOAD_MS: 15_000,
  TIMEOUT_PROVIDER_MS: 25_000,
  MAX_MIDIAS_POR_HORA_USUARIO: 30,
} as const

export const MIMES_AUDIO_ACEITOS = [
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/webm",
  "audio/amr",
] as const
export type MimeAudioAceito = (typeof MIMES_AUDIO_ACEITOS)[number]

export const MIMES_DOCUMENTO_ACEITOS = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const
export type MimeDocumentoAceito = (typeof MIMES_DOCUMENTO_ACEITOS)[number]

export type MimeMidiaAceito = MimeAudioAceito | MimeDocumentoAceito

// ─── Diagnóstico honesto de infraestrutura multimodal ──────────────────────

export type ProvedorAudioId = "OPENAI_WHISPER" | "SIMULADO" | "INDISPONIVEL"
export type ProvedorDocumentoId = "OPENAI_VISION" | "SIMULADO" | "INDISPONIVEL"

export type DiagnosticoCapacidadeMultimodal = {
  providerId: ProvedorAudioId | ProvedorDocumentoId
  /** Chave/configuração do provider presente no ambiente. */
  providerConfigurado: boolean
  /** Processamento efetivamente executável no runtime atual. */
  processamentoDisponivel: boolean
  /** Homologação externa real concluída (nunca true sem prova real). */
  homologacaoConcluida: boolean
  /** Canal oficial WhatsApp GESTAO ativo e habilitado. */
  canalOficialDisponivel: boolean
  motivoIndisponivel?: string
}

export type DiagnosticoMultimodalCompleto = {
  audioG009: DiagnosticoCapacidadeMultimodal
  documentoG010: DiagnosticoCapacidadeMultimodal
  storagePermanenteG003: {
    disponivel: boolean
    privacidadeComprovada: boolean
    motivo: string
  }
}

// ─── Download seguro de mídia (WhatsApp Meta / Fixture) ────────────────────

export type MidiaBaixada = {
  bytes: Buffer
  mimeReal: MimeMidiaAceito
  tamanhoBytes: number
  sha256: string
  extensao: string
  /** Quantidade de páginas detectadas quando PDF. */
  paginasPdf?: number
  /** Limpa o buffer temporário em memória (zero-fill). */
  descartar: () => void
}

export type CodigoErroMidia =
  | "MIDIA_MUITO_GRANDE"
  | "MIME_NAO_SUPORTADO"
  | "CONTEUDO_INVALIDO"
  | "DURACAO_EXCEDIDA"
  | "PDF_MUITAS_PAGINAS"
  | "DESTINO_NAO_AUTORIZADO"
  | "REDIRECT_NAO_AUTORIZADO"
  | "DOWNLOAD_TIMEOUT"
  | "DOWNLOAD_TEMPORARIO"
  | "DOWNLOAD_NAO_ENCONTRADO"
  | "LIMITE_PROCESSAMENTO_EXCEDIDO"
  | "PROVEDOR_INDISPONIVEL"
  | "PROVEDOR_TIMEOUT"
  | "PROVEDOR_ERRO_TEMPORARIO"
  | "PROVEDOR_RESPOSTA_INVALIDA"

export type ResultadoDownloadMidia =
  | { ok: true; midia: MidiaBaixada }
  | { ok: false; codigo: CodigoErroMidia; transitorio: boolean; mensagemUsuario: string }

export interface PortaDownloadMidiaWhatsApp {
  baixar(input: {
    mediaId: string
    tipoEsperado: "AUDIO" | "DOCUMENTO"
    credenciais?: { phoneNumberId: string; accessToken: string }
    mimeDeclarado?: string
    duracaoSegundos?: number
    signal?: AbortSignal
  }): Promise<ResultadoDownloadMidia>
}

// ─── G009 — Transcrição e interpretação de áudio ───────────────────────────

export type ResultadoTranscricaoProvider =
  | {
      ok: true
      transcricao: string
      idioma: "pt-BR"
      confianca?: number
      duracaoSegundos?: number
      provedor: "OPENAI_WHISPER" | "SIMULADO"
      homologado: boolean
    }
  | {
      ok: false
      codigo: CodigoErroMidia
      transitorio: boolean
      mensagemUsuario: string
    }

export interface PortaTranscricaoAudio {
  readonly id: ProvedorAudioId
  readonly homologado: boolean
  transcrever(input: {
    bytes: Buffer
    mime: MimeAudioAceito
    nomeArquivo: string
    duracaoSegundos?: number
    signal?: AbortSignal
  }): Promise<ResultadoTranscricaoProvider>
}

export type ResultadoAudioG009 =
  | {
      ok: true
      transcricao: string
      transcricaoSanitizada: string
      resumoTranscricao: string
      idioma: "pt-BR"
      confianca?: number
      duracaoSegundos?: number
      sha256: string
      provedor: "OPENAI_WHISPER" | "SIMULADO"
      homologado: boolean
      sinaisInjecao: string[]
      baixaConfianca: boolean
      /** Quantidade mencionada para compra de itens (ex.: "duas telas"). */
      quantidadeItens?: number
      naturezaMercadoria?: boolean
    }
  | {
      ok: false
      codigo: CodigoErroMidia | "AUDIO_ILEGIVEL" | "INJECAO_DETECTADA"
      transitorio: boolean
      mensagemUsuario: string
      sinaisInjecao?: string[]
    }

// ─── G010 — Extração estruturada de imagens, PDFs e comprovantes ───────────

export const TIPOS_DOCUMENTO_FINANCEIRO = [
  "COMPROVANTE_PIX",
  "RECIBO",
  "CUPOM_FISCAL",
  "NOTA_FISCAL",
  "BOLETO",
  "CONTA_A_PAGAR",
  "FATURA",
  "COMPROVANTE_BANCARIO",
  "EXTRATO",
  "DOCUMENTO_COMERCIAL",
  "NAO_FINANCEIRO",
] as const
export type TipoDocumentoFinanceiro = (typeof TIPOS_DOCUMENTO_FINANCEIRO)[number]

export type EfeitoFinanceiroDocumento =
  | "COMPRA_A_CONFIRMAR_PAGAMENTO"
  | "OBRIGACAO_NAO_PAGA"
  | "COMPROVANTE_PAGAMENTO_DECLARADO"
  | "RECEBIMENTO_DECLARADO"
  | "EXTRATO_INFORMATIVO"
  | "SEM_EFEITO_FINANCEIRO"

export type LegibilidadeDocumento = "LEGIVEL" | "PARCIAL" | "ILEGIVEL" | "CORTADA"

export type ItemDocumentoExtraido = {
  descricao: string
  quantidade?: number
  valorCentavos?: string
}

/**
 * Campos estruturados extraídos de imagem/PDF.
 * Regra estrita: campos desconhecidos ficam `undefined` — NUNCA inventados.
 */
export type DocumentoExtraido = {
  legibilidade: LegibilidadeDocumento
  tipoDocumento: TipoDocumentoFinanceiro
  efeitoFinanceiro: EfeitoFinanceiroDocumento
  emitente?: string
  destinatario?: string
  fornecedor?: string
  data?: string
  vencimento?: string
  /** Centavos exatos (inteiro positivo em string), ausente se incerto ou múltiplos valores ambíguos. */
  valorTotalCentavos?: string
  /** Quando o documento traz vários valores plausíveis sem total inequívoco. */
  valoresCandidatosCentavos?: string[]
  descontoCentavos?: string
  jurosCentavos?: string
  multaCentavos?: string
  formaPagamento?: FormaPagamento
  identificadorTransacao?: string
  numeroDocumento?: string
  itens?: ItemDocumentoExtraido[]
  referenciasFinanceiras?: string[]
  /** Texto resumido sanitizado (nunca instrução). */
  textoResumo?: string
  /** Indica compra de mercadoria/peça para referência estável futura (compras/estoque/aparelhos/OS). */
  naturezaMercadoria?: boolean
  /** Sinais de prompt injection encontrados no texto do documento. */
  sinaisInjecao?: string[]
}

export type ResultadoExtracaoDocumentoProvider =
  | {
      ok: true
      documento: DocumentoExtraido
      textoBruto?: string
      provedor: "OPENAI_VISION" | "SIMULADO"
      homologado: boolean
    }
  | {
      ok: false
      codigo: CodigoErroMidia
      transitorio: boolean
      mensagemUsuario: string
    }

export interface PortaExtracaoDocumento {
  readonly id: ProvedorDocumentoId
  readonly homologado: boolean
  extrair(input: {
    bytes: Buffer
    mime: MimeDocumentoAceito
    nomeArquivo: string
    legendaUsuario?: string
    paginasPdf?: number
    signal?: AbortSignal
  }): Promise<ResultadoExtracaoDocumentoProvider>
}

export type ResultadoDocumentoG010 =
  | {
      ok: true
      documento: DocumentoExtraido
      sha256: string
      mime: MimeDocumentoAceito
      tamanhoBytes: number
      paginasPdf?: number
      provedor: "OPENAI_VISION" | "SIMULADO"
      homologado: boolean
      sinaisInjecao: string[]
      avisoHonestidade: string
      /** Referência estável para integração futura (compras/estoque/aparelhos/OS), sem gravar estoque fictício. */
      referenciaIntegracaoFutura?: {
        categoriaFluxo: "COMPRA_MERCADORIA" | "DOCUMENTO_COMERCIAL" | "COMPROVANTE_FINANCEIRO"
        documentoHash: string
        numeroDocumento?: string
        identificadorTransacao?: string
        fornecedor?: string
        itens?: ItemDocumentoExtraido[]
      }
    }
  | {
      ok: false
      codigo: CodigoErroMidia | "DOCUMENTO_ILEGIVEL" | "DOCUMENTO_CORTADO" | "INJECAO_DETECTADA"
      transitorio: boolean
      mensagemUsuario: string
      sinaisInjecao?: string[]
    }

// ─── Prevenção de duplicidade (isolada por perfil e loja autorizados) ──────

export type MotivoDuplicidade =
  | "MESMA_MENSAGEM"
  | "MESMO_HASH_ARQUIVO"
  | "MESMO_ID_TRANSACAO"
  | "MESMO_DOCUMENTO"
  | "CORRESPONDENCIA_APROXIMADA"

export type CandidatoDuplicidade = {
  alvoTipo: "MOVIMENTACAO" | "PAGAR" | "RECEBER"
  alvoId: string
  operacaoId?: string
  descricao: string
  valorCentavos: string
  data: string
  contraparte?: string
  contaNome?: string
  motivo: MotivoDuplicidade
  /** Correspondência exata (hash/transação/documento) vs aproximada (valor+data+fornecedor). */
  correspondenciaExata: boolean
}

export interface PortaDuplicidadeFinanceira {
  /**
   * Busca candidatos EXCLUSIVAMENTE dentro do contexto `ctx` (perfil + loja autorizados via G001).
   * Nunca consulta dados de outro usuário, perfil ou loja.
   */
  buscarCandidatos(
    ctx: unknown,
    criterios: {
      sha256?: string
      identificadorTransacao?: string
      numeroDocumento?: string
      valorCentavos?: string
      dataReferencia?: string
      contraparte?: string
      contaNome?: string
    }
  ): Promise<CandidatoDuplicidade[]>
}

// ─── Arquivamento permanente G003-STORAGE (estritamente separado do temp) ──

export type ResultadoArquivamentoDocumento =
  | { arquivado: true; documentoId: string }
  | { arquivado: false; motivo: "STORAGE_BLOQUEADO" | "NAO_FORNECIDO" | "ERRO_STORAGE"; mensagemUsuario: string }

export interface PortaArquivamentoDocumento {
  arquivarEVincular(
    ctx: unknown,
    input: {
      nomeArquivo: string
      conteudo: Uint8Array
      alvo?: { tipo: "PAGAR" | "RECEBER" | "CONTA" | "MOVIMENTACAO"; id: string }
    }
  ): Promise<ResultadoArquivamentoDocumento>
}

// ─── Defesa contra prompt injection em conteúdo multimodal ─────────────────

const PADROES_INJECAO_MIDIA: Array<[RegExp, string]> = [
  [/\bignor\w* (as |todas |suas |)?(instruc|regra|ordem|anterior|politica)/, "instrucao_sobrescrita"],
  [/\b(instrucoes|prompt) (anteriores|do sistema)\b|\bsystem prompt\b|\bdeveloper mode\b|\bjailbreak\b/, "instrucao_sobrescrita"],
  [/\b(aprove|confirme|registre|execute|aplique) (automaticamente|imediatamente|sem confirmacao|sem perguntar)\b/, "bypass_confirmacao"],
  [/\bsem pedir confirmacao\b|\bpule a confirmacao\b|\bbypass\b/, "bypass_confirmacao"],
  [/\bvoce (agora )?e (o |um |uma )?(admin|administrador|sistema|root)\b|\bsudo\b/, "elevacao"],
  [/\b(perfilid|storeid|userid|owneradminuserid|adminuserid|tituloid|carteiraid)\b/, "identificador_interno"],
  [/\b(de|do|da) outro usuario\b|\btodos os usuarios\b|\boutra loja que nao\b/, "escopo_alheio"],
  [/\b(drop|truncate|alter) table\b|\bdelete from\b|\binsert into\b|\bselect \S+ from\b|<script|\$\{|\bunion select\b/, "injecao_tecnica"],
  [/\b(api key|token de acesso|access token|openai_api_key|webhook secret)\b/, "credencial"],
]

/**
 * Inspeciona texto proveniente de áudio, OCR, PDF ou legenda como dado não confiável.
 * Retorna lista de sinais de prompt injection detectados e versão sanitizada sem caracteres de controle.
 */
export function inspecionarPromptInjectionMidia(bruto: string | null | undefined): {
  sinais: string[]
  sanitizado: string
} {
  if (!bruto) return { sinais: [], sanitizado: "" }
  const limpo = bruto
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  const norm = normalizarTexto(limpo)
  const sinais: string[] = []
  for (const [re, codigo] of PADROES_INJECAO_MIDIA) {
    if (re.test(norm) && !sinais.includes(codigo)) sinais.push(codigo)
  }
  return { sinais, sanitizado: limpo }
}

/**
 * Classifica efeito financeiro canônico a partir do tipo de documento.
 * Regras de negócio:
 * - Nota fiscal / cupom fiscal / documento comercial NÃO comprovam pagamento sozinhos.
 * - Boleto / conta a pagar / fatura são obrigações ainda não pagas.
 * - Comprovante Pix / recibo / bancário são declarações de pagamento (Pix não comprova liquidação bancária autenticada).
 * - Extrato e não financeiro nunca geram lançamento automático.
 */
export function efeitoFinanceiroDoDocumento(tipo: TipoDocumentoFinanceiro): EfeitoFinanceiroDocumento {
  switch (tipo) {
    case "NOTA_FISCAL":
    case "CUPOM_FISCAL":
    case "DOCUMENTO_COMERCIAL":
      return "COMPRA_A_CONFIRMAR_PAGAMENTO"
    case "BOLETO":
    case "CONTA_A_PAGAR":
    case "FATURA":
      return "OBRIGACAO_NAO_PAGA"
    case "COMPROVANTE_PIX":
    case "RECIBO":
    case "COMPROVANTE_BANCARIO":
      return "COMPROVANTE_PAGAMENTO_DECLARADO"
    case "EXTRATO":
      return "EXTRATO_INFORMATIVO"
    case "NAO_FINANCEIRO":
      return "SEM_EFEITO_FINANCEIRO"
  }
}

/** Diagnostica honestamente as capacidades multimodais a partir das variáveis de ambiente. */
export function diagnosticarCapacidadesMultimodais(
  env: Record<string, string | undefined>,
  opcoes: {
    canalOficialDisponivel: boolean
    storagePermanenteDisponivel: boolean
    storageMotivo: string
  }
): DiagnosticoMultimodalCompleto {
  const openaiKey = Boolean(env.OPENAI_API_KEY?.trim())
  const sttHomologado = env.GESTOR_MONEY_AUDIO_STT_HOMOLOGADO === "true" && openaiKey
  const ocrHomologado = env.GESTOR_MONEY_IMAGEM_OCR_HOMOLOGADO === "true" && openaiKey

  return {
    audioG009: {
      providerId: openaiKey ? "OPENAI_WHISPER" : "INDISPONIVEL",
      providerConfigurado: openaiKey,
      processamentoDisponivel: openaiKey,
      homologacaoConcluida: sttHomologado,
      canalOficialDisponivel: opcoes.canalOficialDisponivel,
      ...(!openaiKey ? { motivoIndisponivel: "OPENAI_API_KEY não configurada no ambiente." } : {}),
    },
    documentoG010: {
      providerId: openaiKey ? "OPENAI_VISION" : "INDISPONIVEL",
      providerConfigurado: openaiKey,
      processamentoDisponivel: openaiKey,
      homologacaoConcluida: ocrHomologado,
      canalOficialDisponivel: opcoes.canalOficialDisponivel,
      ...(!openaiKey ? { motivoIndisponivel: "OPENAI_API_KEY não configurada no ambiente." } : {}),
    },
    storagePermanenteG003: {
      disponivel: opcoes.storagePermanenteDisponivel,
      privacidadeComprovada: opcoes.storagePermanenteDisponivel,
      motivo: opcoes.storageMotivo,
    },
  }
}
