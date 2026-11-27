/**
 * Tipos do motor conversacional do Gestor Money (OMNI-GESTOR-MONEY-CONVERSATIONAL-ENGINE-001).
 *
 * Fronteira: este namespace INTERPRETA e ORGANIZA. Escrita financeira só acontece
 * via PortaExecucao (adaptador sobre G004 `prepararRevisaoGasto` + `aplicarOperacaoGasto`),
 * após confirmação válida, com contexto opaco emitido pelo servidor (G001).
 * Valores de consulta vêm exclusivamente da PortaConsulta (G005 `consultarFinanceiro`).
 */
import type { PropostaGasto } from "@/lib/gastos/operacao-schema"

export const INTENCOES = [
  "DESPESA", "RECEITA", "DIVIDA", "PAGAMENTO", "RECEBIMENTO", "TRANSFERENCIA",
  "COMPRA_CREDITO", "PARCELAMENTO", "CONSULTA", "CORRECAO", "CANCELAMENTO",
  "CONFIRMACAO", "NEGACAO", "DESCONHECIDO",
] as const
export type Intencao = typeof INTENCOES[number]

/** Intenções que propõem um fato financeiro novo. */
export const INTENCOES_ESCRITA = ["DESPESA", "RECEITA", "DIVIDA", "PAGAMENTO", "RECEBIMENTO",
  "TRANSFERENCIA", "COMPRA_CREDITO", "PARCELAMENTO"] as const
export type IntencaoEscrita = typeof INTENCOES_ESCRITA[number]

/** Intenções com contrato de escrita no G004 hoje. As demais são classificadas, mas não gravadas. */
export const INTENCOES_COM_CONTRATO_G004 = ["DESPESA", "DIVIDA", "PAGAMENTO", "COMPRA_CREDITO", "PARCELAMENTO"] as const

export type FormaPagamento = "pix" | "dinheiro" | "debito" | "transferencia" | "boleto" | "credito"

export type PerfilRef =
  | { tipo: "PESSOAL"; perfilId: string; storeId?: never }
  | { tipo: "EMPRESA"; perfilId: string; storeId: string }

export type Proveniencia = "TEXTO" | "AUDIO" | "IMAGEM" | "COMPROVANTE" | "PADRAO" | "RESOLVIDO"

export type Extracao = {
  valorCentavos?: string
  /** Mais de um valor plausível no texto — nunca escolher sozinho. */
  valoresAmbiguos?: string[]
  categoria?: string
  descricao?: string
  dataEconomica?: string
  vencimento?: string
  formaPagamento?: FormaPagamento
  conta?: string
  contaDestino?: string
  parcelas?: number
  contraparte?: string
  perfil?: "PESSOAL" | "EMPRESA"
  /** Trecho livre que pode identificar um perfil EMPRESA pelo rótulo ("loja centro"). */
  perfilTexto?: string
  /** "daquela dívida", "da conta do fornecedor" — referência a título existente. */
  referenciaTitulo?: boolean
  quitar?: boolean
  documentoId?: string
}

export type PlanoConsulta = {
  tipo: "GASTOS" | "RECEITAS" | "RECEITAS_DESPESAS" | "SALDO" | "DIVIDAS" | "VENCIMENTOS"
    | "FATURAS" | "COMPARATIVO" | "A_RECEBER" | "POR_CATEGORIA"
  dataInicio: string
  dataFim: string
  rotulo: string
  categoria?: string
}

export type Interpretacao = {
  intencao: Intencao
  extracao: Extracao
  consulta?: PlanoConsulta
  /** Sinais de comando suspeito — bloqueiam a criação de rascunho. */
  sinaisSuspeitos: string[]
}

export type Campo = "valor" | "perfil" | "formaPagamento" | "conta" | "vencimento" | "cartao" | "parcelas" | "titulo"

export type EstadoRascunho = "COLETANDO" | "AGUARDANDO_CONFIRMACAO" | "EM_EXECUCAO" | "INCERTO"
  | "APLICADO" | "CANCELADO" | "EXPIRADO"

export type DadosRascunho = Extracao & {
  /** IDs resolvidos dentro do perfil do rascunho. Trocar de perfil limpa todos. */
  carteiraId?: string
  carteiraNome?: string
  categoriaId?: string
  cartaoId?: string
  cartaoNome?: string
  cicloIds?: string[]
  tituloId?: string
  tituloDescricao?: string
  tituloRestanteCentavos?: string
  /** Opções numeradas oferecidas na última pergunta (ex.: títulos candidatos). */
  opcoes?: Array<{ id: string; rotulo: string }>
  proveniencia?: Partial<Record<keyof Extracao, Proveniencia>>
}

export type Rascunho = {
  id: string
  versao: number
  intencao: IntencaoEscrita
  estado: EstadoRascunho
  perfil?: PerfilRef
  perfilRotulo?: string
  dados: DadosRascunho
  pendencias: Campo[]
  /** Campo perguntado por último — orienta a leitura da resposta complementar. */
  perguntaAtual?: Campo
  criadoEm: string
  atualizadoEm: string
  expiraEm: string
  mensagemOrigemId: string
  /** Token da confirmação vigente: vincula "sim"/botão à versão exata. */
  confirmacaoToken?: string
  confirmacaoMensagemId?: string
  /** Chaves G004 do último envio — reaproveitadas na reconciliação de falha incerta. */
  envio?: { grupoChave: string; chave: string; versao: number }
  resultado?: { operacaoId: string; valorCentavos: string }
  avisoDuplicidade?: string
}

export type EstadoConversa = {
  /** CAS otimista do repositório. */
  versaoEstado: number
  rascunho?: Rascunho
  /** Perfil escolhido por último — sugestão, nunca autorização. */
  ultimoPerfil?: PerfilRef
  aplicadosRecentes: Array<{ assinatura: string; em: string; operacaoId: string }>
}

export type RespostaAssistente = {
  mensagens: string[]
  codigo: string
  rascunho?: { id: string; versao: number; estado: EstadoRascunho; intencao: IntencaoEscrita; pendencias: Campo[] }
  confirmacao?: { rascunhoId: string; versao: number; token: string }
  escritaFinanceira?: { operacaoId: string; valorCentavos: string }
  consulta?: { tipo: PlanoConsulta["tipo"]; fonte: "G005_CONSULTA_CANONICA"; asOf: string; versaoCalculo?: string }
  duplicada?: boolean
  /** Id da mensagem de saída (para vínculo de reply/botão no canal). */
  respostaId: string
}

// ─── Portas (injetadas pelo servidor; nunca construídas pelo texto do usuário) ──

/** Identidade autenticada fora da mensagem (sessão web hoje; binding G007 no futuro). */
export type Principal = Readonly<{ userId: string; origem: "SESSAO_WEB" | "BINDING_G007" | "TESTE" }>

export type PerfilAutorizado = { ref: PerfilRef; rotulo: string; apelidos?: string[] }

export interface PortaAutorizacao {
  listarPerfis(principal: Principal): Promise<PerfilAutorizado[]>
  /** Retorna contexto OPACO (G001). O motor nunca inspeciona nem fabrica. */
  contexto(principal: Principal, ref: PerfilRef, acao: "view" | "edit"): Promise<{ ok: true; contexto: unknown } | { ok: false }>
}

export type ContaResumo = { id: string; nome: string; tipo: string; ativo: boolean }
export type CategoriaResumo = { id: string; nome: string }
export type CartaoResumo = { id: string; nome: string }
export type TituloResumo = { id: string; descricao: string; contraparte: string; restanteCentavos: string; vencimento: string }

export interface PortaCadastros {
  listarContas(ctx: unknown): Promise<ContaResumo[]>
  listarCategorias(ctx: unknown): Promise<CategoriaResumo[]>
  listarCartoes(ctx: unknown): Promise<CartaoResumo[]>
  /** IDs de ciclos G004 já cadastrados para cada parcela, ou null se não houver ciclos suficientes. */
  resolverCiclos(ctx: unknown, input: { cartaoId: string; dataCompra: string; parcelas: number }): Promise<string[] | null>
  listarTitulosAbertos(ctx: unknown): Promise<TituloResumo[]>
}

/** Subconjunto do ConsultaFinanceiraDTO (G005) usado pelo motor. */
export type ResumoConsulta = {
  asOf: string
  versaoCalculo: string
  despesaRealizadaCentavos: string
  receitaRealizadaCentavos: string
  resultadoCentavos: string
  quantidadeRegistros: number
  porCategoria: Array<{ categoria: string; despesaCentavos: string; receitaCentavos: string; quantidade: number }>
  saldoCentavos: string
  pagarAbertoCentavos: string
  receberAbertoCentavos: string
  contas: Array<{ nome: string; tipo: string; ativo: boolean; saldoCentavos: string }>
  pagar: Array<{ descricao: string; contraparte: string; restanteCentavos: string; vencimento: string; cancelado: boolean }>
}

export type FiltroConsulta = {
  base: "CAIXA_REALIZADO"; timezone: "America/Sao_Paulo"; moeda: "BRL"; dataInicio: string; dataFim: string
}

export interface PortaConsulta {
  consultar(ctx: unknown, filtro: FiltroConsulta): Promise<ResumoConsulta>
}

export type ResultadoExecucao =
  | { ok: true; operacaoId: string; valorCentavos: string }
  /** DEFINITIVO: o servidor recusou antes do COMMIT — nada foi gravado. */
  | { ok: false; tipo: "DEFINITIVO"; codigo: string }
  /** INCERTO: não se sabe se houve COMMIT — só a mesma chave pode ser reenviada. */
  | { ok: false; tipo: "INCERTO"; codigo: string }

export interface PortaExecucao {
  executar(ctx: unknown, input: { grupoChave: string; chave: string; proposta: PropostaGasto }): Promise<ResultadoExecucao>
}

export interface RepositorioConversa {
  carregar(chave: string): Promise<EstadoConversa | null>
  /** CAS: grava só se `versaoAnterior` coincidir; retorna false em conflito. */
  salvar(chave: string, estado: EstadoConversa, versaoAnterior: number): Promise<boolean>
  /** Registro idempotente por mensagem. Retorna a resposta anterior se já processada. */
  respostaRegistrada(chave: string, mensagemId: string): Promise<RespostaAssistente | null>
  registrarResposta(chave: string, mensagemId: string, resposta: RespostaAssistente): Promise<void>
}

export type DependenciasMotor = {
  autorizacao: PortaAutorizacao
  cadastros: PortaCadastros
  consulta: PortaConsulta
  execucao: PortaExecucao
  repositorio: RepositorioConversa
  agora: () => Date
  novoId: () => string
  /** Vida útil do rascunho (padrão 15 min; G004 limita a revisão a 24 h). */
  ttlRascunhoMs?: number
}
