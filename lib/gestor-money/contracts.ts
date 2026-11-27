import { z } from "zod"

/**
 * Contratos de domínio do Gestor Money (G006-5) espelhando fielmente
 * a fundação G001–G006 da PR #405 sem criar motor financeiro paralelo
 * e sem sobreposição de arquivos com `lib/gastos/*`.
 *
 * Regras estruturais preservadas:
 * - G001: PESSOAL nunca possui storeId (sem loja fictícia); EMPRESA exige storeId real.
 * - G002: Contas e categorias pertencem ao perfil; normalização NFKC pt-BR.
 * - G003: Documentos/comprovantes privados por perfil (PDF/PNG/JPEG/TXT, <= 10 MB).
 * - G004: Operações em centavos inteiros positivos (BigInt-safe), sem drift de ponto flutuante.
 * - G005: Base CAIXA_REALIZADO, fuso America/Sao_Paulo, moeda BRL.
 * - G006/G007: Canal WhatsApp GESTAO sem storeId; conexão real depende de G007.
 */

export const GESTOR_MONEY_TIMEZONE = "America/Sao_Paulo" as const
export const GESTOR_MONEY_CURRENCY = "BRL" as const
export const GESTOR_MONEY_BASE = "CAIXA_REALIZADO" as const
export const LIMITE_CENTAVOS = BigInt("9000000000000")

export type CentavosString = string

/** G001: Escopos estritamente separados — PESSOAL nunca pertence a uma loja. */
export type FinanceiroPerfilSeletor =
  | { tipo: "PESSOAL"; perfilId: string; storeId?: never }
  | { tipo: "EMPRESA"; perfilId: string; storeId: string }

export type TipoPerfilFinanceiro = FinanceiroPerfilSeletor["tipo"]

export type PerfilResumo =
  | {
      tipo: "PESSOAL"
      perfilId: string
      ownerAdminUserId: string
      storeId?: never
      nomeExibicao: string
      subtitulo: string
      ativo: boolean
    }
  | {
      tipo: "EMPRESA"
      perfilId: string
      storeId: string
      ownerAdminUserId?: never
      nomeExibicao: string
      subtitulo: string
      ativo: boolean
    }

export const MEIOS_PAGAMENTO_GASTO = [
  "pix",
  "dinheiro",
  "debito",
  "transferencia",
  "boleto",
] as const

export type MeioPagamentoGasto = (typeof MEIOS_PAGAMENTO_GASTO)[number]

export const TIPOS_CONTA_CARTEIRA = [
  "dinheiro",
  "banco",
  "pix",
  "carteira_digital",
  "caixa",
  "investimento",
] as const

export type TipoContaCarteira = (typeof TIPOS_CONTA_CARTEIRA)[number]

/** Mapeamento do tipo visual para o enum de persistência G002 `carteiraFinanceira.tipo`. */
export const CONTA_PARA_TIPO_G002: Record<
  TipoContaCarteira,
  "caixa" | "banco" | "dinheiro" | "debito" | "investimento"
> = {
  dinheiro: "dinheiro",
  banco: "banco",
  pix: "banco",
  carteira_digital: "debito",
  caixa: "caixa",
  investimento: "investimento",
}

export interface ContaCarteira {
  id: string
  perfilId: string
  tipoPerfil: TipoPerfilFinanceiro
  storeId: string | null
  nome: string
  tipo: TipoContaCarteira
  tipoG002: "caixa" | "banco" | "dinheiro" | "credito" | "debito" | "investimento"
  instituicao: string | null
  identificadorInstrumento: string | null
  cor: string
  ativo: boolean
  saldoInicialCentavos: CentavosString
  saldoCentavos: CentavosString
  entradasCentavos: CentavosString
  saidasCentavos: CentavosString
  quantidadeMovimentos: number
  createdAt: string
  updatedAt: string
}

export type NaturezaCategoria = "DESPESA" | "RECEITA"

export interface CategoriaGestorMoney {
  id: string
  perfilId: string
  tipoPerfil: TipoPerfilFinanceiro
  nome: string
  nomeNormalizado: string
  natureza: NaturezaCategoria
  icone: string
  cor: string
  padrao: boolean
  ativo: boolean
  totalPeriodoCentavos: CentavosString
  quantidadeRegistros: number
}

export const CATEGORIAS_PADRAO_DESPESA = [
  { slug: "supermercado", nome: "Supermercado", icone: "ShoppingCart", cor: "#10b981" },
  { slug: "alimentacao", nome: "Alimentação", icone: "Utensils", cor: "#f59e0b" },
  { slug: "moradia", nome: "Moradia", icone: "Home", cor: "#6366f1" },
  { slug: "energia", nome: "Energia", icone: "Zap", cor: "#eab308" },
  { slug: "agua", nome: "Água", icone: "Droplets", cor: "#0ea5e9" },
  { slug: "internet", nome: "Internet", icone: "Wifi", cor: "#8b5cf6" },
  { slug: "transporte", nome: "Transporte", icone: "Car", cor: "#ec4899" },
  { slug: "saude", nome: "Saúde", icone: "HeartPulse", cor: "#ef4444" },
  { slug: "lazer", nome: "Lazer", icone: "Sparkles", cor: "#14b8a6" },
  { slug: "fornecedores", nome: "Fornecedores", icone: "Package", cor: "#3b82f6" },
] as const

export const DOCUMENTO_MIME_PERMITIDOS = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "text/plain",
] as const

export const DOCUMENTO_MAX_BYTES = 10 * 1024 * 1024

export interface DocumentoComprovante {
  id: string
  perfilId: string
  nomeArquivo: string
  mime: (typeof DOCUMENTO_MIME_PERMITIDOS)[number]
  bytes: number
  estado: "DISPONIVEL" | "RETIDO" | "QUARENTENA"
  criadoEm: string
  alvoTipo?: "PAGAR" | "RECEBER" | "CONTA" | "MOVIMENTACAO"
  alvoId?: string
}

export interface ComprovanteUploadDraft {
  nomeArquivo: string
  mime: (typeof DOCUMENTO_MIME_PERMITIDOS)[number]
  bytes: number
  /** Conteúdo em base64 para envio autenticado ao endpoint G003 (`POST /api/gestor-money/documentos`). */
  conteudoBase64?: string
}

export type StorageG003BloqueioCodigo =
  | "flag_desligada"
  | "provider_invalido"
  | "config_r2_incompleta"
  | "segredo_em_next_public"
  | "bucket_inexistente"
  | "privacidade_bucket_nao_comprovada"
  | "bucket_publico_detectado"
  | "escopo_credencial_invalido"
  | "verificador_indisponivel"
  | "ambiente_sintetico_sem_r2"

export interface StorageComprovantesDiagnostico {
  gate: "G003-STORAGE"
  runtimeLiberado: boolean
  bloqueioCodigo: StorageG003BloqueioCodigo | null
  flagHabilitada: boolean
  providerDeclaradoValido: boolean
  configR2Completa: boolean
  variaveisObrigatorias: readonly string[]
  variaveisFaltando: readonly string[]
  privacidadeComprovadaNoRuntime: boolean
  reutilizaAdapter: "lib/contador/documentos/storage-r2.ts"
  liberadoNoMotorG003: boolean
  variaveisR2Presentes: boolean
  motivo: string
}

export interface ComprovanteUploadInput {
  nomeArquivo: string
  conteudoBase64: string
  alvo?: { tipo: "PAGAR" | "RECEBER" | "CONTA" | "MOVIMENTACAO"; id: string }
}

export interface ComprovanteDownloadResult {
  documento: DocumentoComprovante
  signedUrl: string
  expiresInSec: number
}

export interface DocumentosPerfilResponse {
  documentos: DocumentoComprovante[]
  storagePrivadoProvisionado: boolean
  storageDiagnostico: StorageComprovantesDiagnostico
}

export type StatusTitulo = "aberto" | "parcial" | "pago" | "vencido" | "cancelado"

export interface TituloFinanceiroResumo {
  id: string
  natureza: "PAGAR" | "RECEBER"
  descricao: string
  contraparte: string
  categoriaId: string | null
  categoriaNome: string
  carteiraId: string | null
  valorCentavos: CentavosString
  pagoCentavos: CentavosString
  restanteCentavos: CentavosString
  vencimento: string // YYYY-MM-DD
  status: StatusTitulo
  parcelaTexto?: string
  documentoIds: string[]
  createdAt: string
}

export interface PagamentoDividaHistoricoItem {
  id: string
  tipo: "PAGAMENTO_PARCIAL" | "QUITACAO" | "CRIACAO"
  valorCentavos: CentavosString
  dataPagamento: string
  formaPagamento?: MeioPagamentoGasto
  carteiraId?: string
  carteiraNome?: string
  observacao?: string
  documentoId?: string
}

export interface DividaResumo {
  id: string
  perfilId: string
  credor: string
  descricao: string
  categoriaId: string | null
  categoriaNome: string
  valorOriginalCentavos: CentavosString
  valorPagoCentavos: CentavosString
  saldoRestanteCentavos: CentavosString
  vencimento: string // YYYY-MM-DD
  parcelasPagas: number
  parcelasTotal: number
  status: "aberta" | "parcial" | "vencida" | "quitada"
  observacao?: string
  createdAt: string
  historico: PagamentoDividaHistoricoItem[]
}

export interface CartaoCicloResumo {
  id: string
  cartaoId: string
  identificador: string // ex: "2026-11"
  competencia: string // YYYY-MM
  fechamentoEm: string // YYYY-MM-DD
  vencimento: string // YYYY-MM-DD
  totalCentavos: CentavosString
  pagoCentavos: CentavosString
  restanteCentavos: CentavosString
  quantidadeTitulos?: number
  status: "aberta" | "fechada" | "paga" | "futura"
}

export interface CartaoLimiteEventoResumo {
  id: string
  acao: "CADASTRO" | "ALTERACAO" | "REMOCAO"
  limiteAnteriorCentavos: CentavosString | null
  limiteNovoCentavos: CentavosString | null
  motivo: string | null
  autorAdminUserId: string
  criadoEm: string
}

export interface CompraParceladaCartao {
  id: string
  cartaoId: string
  cicloId: string
  descricao: string
  estabelecimento: string
  categoriaId: string | null
  categoriaNome: string
  dataCompra: string // YYYY-MM-DD
  valorTotalCentavos: CentavosString
  valorParcelaCentavos: CentavosString
  parcelaAtual: number
  parcelasTotal: number
  ativa: boolean
}

export interface HistoricoCartaoItem {
  id: string
  cartaoId: string
  tipo: "COMPRA" | "PAGAMENTO_FATURA"
  descricao: string
  valorCentavos: CentavosString
  data: string // YYYY-MM-DD
  competencia: string // YYYY-MM
  parcelaTexto?: string
  categoriaNome?: string
}

export type PoliticaComprometimentoCartao =
  "COMPROMETIMENTO_INTEGRAL_COMPRA_RECOMPOSICAO_NO_PAGAMENTO"

export interface CartaoCreditoResumo {
  id: string
  perfilId: string
  nome: string
  bandeira: string
  ultimos4: string
  corGradiente: string
  politicaComprometimento?: PoliticaComprometimentoCartao
  /** `null` quando o limite não foi informado (nunca exibir R$ 0,00 por ausência de dado). */
  limiteCentavos: CentavosString | null
  usadoCentavos: CentavosString
  /** `null` quando `limiteCentavos === null`; fornecido diretamente pelo backend canônico. */
  disponivelCentavos: CentavosString | null
  /** `null` quando `limiteCentavos === null`; `"0"` quando dentro do limite. */
  limiteExcedidoCentavos: CentavosString | null
  /** Percentual comprometido com 2 casas decimais fornecido pelo backend canônico, ou `null`. */
  limiteComprometidoPercentual: number | null
  limitePersistenciaDisponivel?: boolean
  fechamentoDia: number
  vencimentoDia: number
  ativo: boolean
  ciclos: CartaoCicloResumo[]
  comprasParceladas: CompraParceladaCartao[]
  historico: HistoricoCartaoItem[]
  historicoLimites: CartaoLimiteEventoResumo[]
}

export interface EventoFinanceiroResumo {
  id: string
  movimentoId: string
  carteiraId: string | null
  carteiraNome: string
  categoriaId: string | null
  categoria: string
  descricao: string
  contraparte: string
  origem: string
  dia: string // YYYY-MM-DD
  ocorridoEm: string // ISO
  tipo: "entrada" | "saida"
  valorCentavos: CentavosString
  transferencia: boolean
  despesaCentavos: CentavosString
  receitaCentavos: CentavosString
  formaPagamento?: MeioPagamentoGasto
  documentoId?: string
}

export interface EvolucaoMensalPonto {
  mes: string // YYYY-MM
  label: string // ex: "Nov/26"
  receitaCentavos: CentavosString
  despesaCentavos: CentavosString
  resultadoCentavos: CentavosString
}

export interface GastoPorCategoriaResumo {
  categoriaId: string | null
  categoria: string
  cor: string
  despesaCentavos: CentavosString
  receitaCentavos: CentavosString
  quantidade: number
  participacaoPercentual: number
}

export interface ComparativosFinanceiros {
  criterio: "CALENDARIO_ATUAL_VS_ANTERIOR_COMPLETO"
  receitaMesAtualCentavos: CentavosString
  receitaMesAnteriorCentavos: CentavosString
  despesaMesAtualCentavos: CentavosString
  despesaMesAnteriorCentavos: CentavosString
  receitaAnoAtualCentavos: CentavosString
  receitaAnoAnteriorCentavos: CentavosString
}

export interface ProximoVencimentoItem {
  id: string
  origem: "PAGAR" | "RECEBER" | "DIVIDA" | "FATURA"
  titulo: string
  contraparte: string
  vencimento: string // YYYY-MM-DD
  valorCentavos: CentavosString
  diasRestantes: number
  vencido: boolean
  status: string
}

export interface ConsultaFinanceiraSnapshot {
  proveniencia: "REAL" | "SINTETICO_ISOLADO"
  base: typeof GESTOR_MONEY_BASE
  moeda: typeof GESTOR_MONEY_CURRENCY
  timezone: typeof GESTOR_MONEY_TIMEZONE
  asOf: string
  perfil: PerfilResumo
  periodo: {
    dataInicio: string
    dataFim: string
  }
  saldoDisponivelCentavos: CentavosString
  receitasCentavos: CentavosString
  despesasCentavos: CentavosString
  resultadoCentavos: CentavosString
  dividasAbertasCentavos: CentavosString
  contasPagarCentavos: CentavosString
  contasReceberCentavos: CentavosString
  quantidadeRegistros: number
  proximosVencimentos: ProximoVencimentoItem[]
  evolucaoMensal: EvolucaoMensalPonto[]
  gastosPorCategoria: GastoPorCategoriaResumo[]
  comparativos: ComparativosFinanceiros
  contas: ContaCarteira[]
  pagar: TituloFinanceiroResumo[]
  receber: TituloFinanceiroResumo[]
  dividas: DividaResumo[]
  cartoes: CartaoCreditoResumo[]
  categorias: CategoriaGestorMoney[]
  eventos: EventoFinanceiroResumo[]
  documentos: DocumentoComprovante[]
  storageDiagnostico?: StorageComprovantesDiagnostico
}

export type EstadoConexaoWhatsApp =
  | "DESCONECTADO_AGUARDANDO_G007"
  | "CANAL_INATIVO"
  | "ATIVO"
  | "ERRO_CREDENCIAIS"

export interface AssistenteWhatsAppConfig {
  estadoConexao: EstadoConexaoWhatsApp
  estadoDescricao: string
  canalPapel: "GESTAO"
  canalAtivo: boolean
  workerFilaAtivo: boolean
  numeroVinculadoMascarado: string | null
  podeAlterarConexaoReal: boolean
  motivoConexaoIndisponivel: string | null
  preferenciasConfirmacao: {
    exigirConfirmacaoSempre: boolean
    limiteConfirmacaoDuplaCentavos: CentavosString
    confirmarTrocaPerfil: boolean
    exigirComprovanteAcimaCentavos: CentavosString | null
  }
  notificacoes: {
    alertasVencimento: boolean
    diasAntecedenciaVencimento: 1 | 3 | 7
    resumoDiario: boolean
    horarioResumoDiario: string
    alertasFaturaCartao: boolean
    alertasDividaVencida: boolean
  }
  dependenciasPendentes: Array<{
    codigo: string
    titulo: string
    status:
      | "PENDENTE_PR_405"
      | "PENDENTE_G007"
      | "BLOQUEADO_G003_STORAGE"
      | "DISPONIVEL_NO_RUNTIME"
      | "DISPONIVEL_EM_SANDBOX"
    detalhe: string
  }>
  /** Alinhamento visual somente leitura com os contratos G006/G007 e motor G008 (PR #417). */
  alinhamentoG007?: {
    principalAutorizadoAtual: "SESSAO_WEB" | "VINCULO_TELEFONE_G007"
    verificadorVinculoDisponivel: boolean
    canalGestaoRegistrado: boolean
    canalVersao: number | null
    motorConversacionalPr417: "DORMENTE_PR_417" | "ATIVO"
    homologacoes: {
      whatsappOficial: boolean
      audioStt: boolean
      imagemOcr: boolean
    }
  }
}

export type ReadinessState =
  | "READY"
  | "FOUNDATION_PENDING_PR405"
  | "MODULE_DISABLED"
  | "UNAVAILABLE"

export interface IntegrationContractStatus {
  id: "G001" | "G002" | "G003" | "G004" | "G005" | "G006" | "G007"
  nome: string
  disponivelNoRuntime: boolean
  origem: string
  detalhe: string
}

export interface IntegrationReadiness {
  mode: "real" | "synthetic"
  state: ReadinessState
  moduleEnabled: boolean
  foundationMerged: boolean
  mensagem: string
  contratos: IntegrationContractStatus[]
  storageG003?: StorageComprovantesDiagnostico
}

/** Schemas de entrada alinhados com G002/G003/G004 */
const centavosPositivosSchema = z
  .string()
  .regex(/^\d{1,16}$/, "Informe um valor válido em centavos.")
  .refine((v) => {
    try {
      const n = BigInt(v)
      return n > BigInt(0) && n <= LIMITE_CENTAVOS
    } catch {
      return false
    }
  }, "O valor deve ser maior que zero.")

const dataCivilSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a data no formato AAAA-MM-DD.")

const comprovanteDraftSchema = z
  .object({
    nomeArquivo: z
      .string()
      .trim()
      .min(1)
      .max(180)
      .refine((n) => !n.includes("/") && !n.includes("\\"), "Nome de arquivo inválido."),
    mime: z.enum(DOCUMENTO_MIME_PERMITIDOS, {
      errorMap: () => ({ message: "Aceito apenas PDF, PNG, JPG ou TXT." }),
    }),
    bytes: z.number().int().min(1).max(DOCUMENTO_MAX_BYTES, "Arquivo excede o limite de 10 MB."),
  })
  .optional()

const limiteCartaoCentavosSchema = z
  .union([
    z.null(),
    z
      .string()
      .trim()
      .regex(/^\d{1,16}$/, "Informe um limite válido em centavos.")
      .refine((v) => {
        try {
          const n = BigInt(v)
          return n >= BigInt(0) && n <= LIMITE_CENTAVOS
        } catch {
          return false
        }
      }, "Limite fora da faixa permitida."),
  ])
  .optional()

const documentoIdOpcionalSchema = z
  .string()
  .regex(/^[a-zA-Z0-9_-]{1,191}$/)
  .optional()

export const registrarDespesaInputSchema = z.object({
  descricao: z.string().trim().min(2, "Informe a descrição.").max(500),
  valorCentavos: centavosPositivosSchema,
  dataGasto: dataCivilSchema,
  pagoAgora: z.boolean().default(true),
  vencimento: dataCivilSchema.optional(),
  categoriaId: z.string().min(1, "Selecione uma categoria."),
  carteiraId: z.string().min(1, "Selecione uma conta."),
  formaPagamento: z.enum(MEIOS_PAGAMENTO_GASTO),
  contraparte: z.string().trim().max(180).optional(),
  comprovante: comprovanteDraftSchema,
  documentoId: documentoIdOpcionalSchema,
})

export type RegistrarDespesaInput = z.infer<typeof registrarDespesaInputSchema>

export const registrarReceitaInputSchema = z.object({
  descricao: z.string().trim().min(2, "Informe a descrição.").max(500),
  valorCentavos: centavosPositivosSchema,
  dataRecebimento: dataCivilSchema,
  recebidoAgora: z.boolean().default(true),
  vencimento: dataCivilSchema.optional(),
  categoriaId: z.string().min(1, "Selecione uma categoria."),
  carteiraId: z.string().min(1, "Selecione uma conta."),
  formaPagamento: z.enum(MEIOS_PAGAMENTO_GASTO),
  contraparte: z.string().trim().max(180).optional(),
  comprovante: comprovanteDraftSchema,
})

export type RegistrarReceitaInput = z.infer<typeof registrarReceitaInputSchema>

export const registrarDividaInputSchema = z.object({
  credor: z.string().trim().min(2, "Informe o credor.").max(180),
  descricao: z.string().trim().min(2, "Informe a descrição.").max(500),
  valorOriginalCentavos: centavosPositivosSchema,
  vencimento: dataCivilSchema,
  parcelasTotal: z.number().int().min(1).max(120),
  categoriaId: z.string().min(1, "Selecione uma categoria."),
  observacao: z.string().trim().max(500).optional(),
  comprovante: comprovanteDraftSchema,
  documentoId: documentoIdOpcionalSchema,
})

export type RegistrarDividaInput = z.infer<typeof registrarDividaInputSchema>

export const pagarDividaInputSchema = z.object({
  dividaId: z.string().min(1),
  quitar: z.boolean().default(false),
  valorCentavos: centavosPositivosSchema.optional(),
  carteiraId: z.string().min(1, "Selecione a conta de saída."),
  formaPagamento: z.enum(MEIOS_PAGAMENTO_GASTO),
  dataPagamento: dataCivilSchema,
  observacao: z.string().trim().max(300).optional(),
  comprovante: comprovanteDraftSchema,
  documentoId: documentoIdOpcionalSchema,
})

export type PagarDividaInput = z.infer<typeof pagarDividaInputSchema>

export const transferirInputSchema = z
  .object({
    carteiraOrigemId: z.string().min(1, "Selecione a conta de origem."),
    carteiraDestinoId: z.string().min(1, "Selecione a conta de destino."),
    valorCentavos: centavosPositivosSchema,
    dataTransferencia: dataCivilSchema,
    descricao: z.string().trim().min(2, "Informe uma descrição.").max(300),
    comprovante: comprovanteDraftSchema,
  })
  .refine((d) => d.carteiraOrigemId !== d.carteiraDestinoId, {
    message: "A conta de destino deve ser diferente da conta de origem.",
    path: ["carteiraDestinoId"],
  })

export type TransferirInput = z.infer<typeof transferirInputSchema>

export const criarContaInputSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome da conta.").max(120),
  tipo: z.enum(TIPOS_CONTA_CARTEIRA),
  saldoInicialCentavos: z.string().regex(/^\d{1,16}$/, "Saldo inicial inválido."),
  instituicao: z.string().trim().max(120).optional(),
  identificadorInstrumento: z.string().trim().max(120).optional(),
})

export type CriarContaInput = z.infer<typeof criarContaInputSchema>

export const criarCategoriaInputSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome da categoria.").max(120),
  natureza: z.enum(["DESPESA", "RECEITA"]),
  cor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#6366f1"),
  icone: z.string().trim().min(1).max(40).default("Tag"),
})

export type CriarCategoriaInput = z.infer<typeof criarCategoriaInputSchema>

export const criarCartaoInputSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome do cartão.").max(120),
  bandeira: z.string().trim().min(2, "Informe a bandeira.").max(40),
  ultimos4: z.string().regex(/^\d{4}$/, "Informe os 4 últimos dígitos."),
  limiteCentavos: limiteCartaoCentavosSchema,
  motivo: z.string().trim().min(1).max(500).optional(),
  fechamentoDia: z.number().int().min(1).max(28),
  vencimentoDia: z.number().int().min(1).max(28),
})

export type CriarCartaoInput = z.infer<typeof criarCartaoInputSchema>

export const editarCartaoInputSchema = z
  .object({
    cartaoId: z.string().trim().min(1, "Selecione o cartão.").max(191),
    nome: z.string().trim().min(2, "Informe o nome do cartão.").max(120).optional(),
    bandeira: z.string().trim().min(1).max(40).nullable().optional(),
    ultimos4: z.string().regex(/^\d{4}$/, "Informe os 4 últimos dígitos.").nullable().optional(),
    ativo: z.boolean().optional(),
    limiteCentavos: limiteCartaoCentavosSchema,
    motivo: z.string().trim().min(1).max(500).optional(),
  })
  .refine(
    (d) =>
      d.nome !== undefined ||
      d.bandeira !== undefined ||
      d.ultimos4 !== undefined ||
      d.ativo !== undefined ||
      d.limiteCentavos !== undefined,
    { message: "Informe ao menos uma alteração para salvar no cartão." }
  )

export type EditarCartaoInput = z.infer<typeof editarCartaoInputSchema>

export const registrarCompraCartaoInputSchema = z.object({
  cartaoId: z.string().min(1, "Selecione o cartão."),
  descricao: z.string().trim().min(2, "Informe a descrição.").max(300),
  estabelecimento: z.string().trim().min(2, "Informe o estabelecimento.").max(180),
  valorTotalCentavos: centavosPositivosSchema,
  parcelasTotal: z.number().int().min(1).max(24),
  categoriaId: z.string().min(1, "Selecione uma categoria."),
  dataCompra: dataCivilSchema,
})

export type RegistrarCompraCartaoInput = z.infer<typeof registrarCompraCartaoInputSchema>

export const pagarFaturaInputSchema = z.object({
  cartaoId: z.string().min(1),
  cicloId: z.string().min(1),
  carteiraId: z.string().min(1, "Selecione a conta para pagamento."),
  formaPagamento: z.enum(MEIOS_PAGAMENTO_GASTO),
  dataPagamento: dataCivilSchema,
  /** Opcional: quando informado, realiza pagamento parcial da fatura (recompondo o limite na mesma proporção). */
  valorCentavos: centavosPositivosSchema.optional(),
})

export type PagarFaturaInput = z.infer<typeof pagarFaturaInputSchema>

export interface OperacaoFeedback {
  ok: true
  operacaoId: string
  contratoG004: string
  mensagem: string
}
