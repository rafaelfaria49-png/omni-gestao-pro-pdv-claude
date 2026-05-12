// ============================================================================
// Operações HUB — Domínio de Ordens de Serviço (OS)
// ----------------------------------------------------------------------------
// Modelo único de dados consumido por todas as telas do módulo.
// Pronto para mapear 1:1 contra um schema Prisma/SQL futuro.
// ============================================================================

export type OSStatus =
  | "aberta"
  | "diagnostico"
  | "aguardando_aprovacao"
  | "aprovado"
  | "em_execucao"
  | "aguardando_peca"
  | "pronta"
  | "entregue"
  | "cancelada";

export type OSPrioridade = "baixa" | "media" | "alta" | "critica";

export type OSOrigem = "manual" | "whatsapp" | "site" | "telefone" | "email" | "balcao";

export type OrcamentoStatus =
  | "rascunho"
  | "enviado"
  | "aprovado"
  | "recusado"
  | "expirado";

export type SLAStatus = "ok" | "atencao" | "estourado";

export interface Cliente {
  id: string;
  nome: string;
  documento?: string; // CPF/CNPJ
  telefone?: string;
  email?: string;
  whatsapp?: string;
}

export interface Equipamento {
  id: string;
  tipo: string;          // Notebook, Smartphone, Impressora...
  marca: string;
  modelo: string;
  numeroSerie?: string;
  acessorios?: string[]; // Carregador, capa, cabo...
  defeitoRelatado: string;
  /** Dados opcionais vindos do Cadastros HUB (EquipamentoModelo). */
  defeitosComuns?: string[];
  checklistRecomendado?: string[];
}

export interface Tecnico {
  id: string;
  nome: string;
  avatarUrl?: string;
  especialidades: string[];
  online: boolean;
}

export interface SLA {
  prazo: string;          // ISO datetime
  alertaEm?: string;      // ISO datetime para disparar atenção
  status: SLAStatus;      // calculado: ok | atencao | estourado
}

export interface PecaUsada {
  id: string;
  /** Id real do Produto (Prisma) quando disponível. */
  produtoId?: string;
  nome: string;
  sku?: string;
  barcode?: string;
  /** Origem do vínculo com o cadastro de produto. */
  produtoOrigem?: "prisma" | "mock" | "manual";
  quantidade: number;
  valorUnitario: number;
  custoUnitario?: number;
  /** Desconto em valor (R$) aplicado à linha, após qtd × unitário. */
  desconto?: number;
  observacao?: string;
  /** Dias de garantia do cadastro de produto (quando aplicável). */
  prazoGarantiaDias?: number;
}

export interface Servico {
  id: string;
  descricao: string;
  valor: number;
  desconto?: number;
  observacao?: string;
  prazoGarantiaDias?: number;
  termoGarantia?: string;
}

export interface Orcamento {
  id: string;
  status: OrcamentoStatus;
  pecas: PecaUsada[];
  servicos: Servico[];
  desconto: number;
  total: number;
  criadoEm: string;
  atualizadoEm?: string;
  enviadoEm?: string;
  respondidoEm?: string;
  validoAte?: string;
  /** Observação geral do orçamento (campo principal persistido). */
  observacao?: string;
  observacoes?: string;
}

export type AnexoTipo =
  | "foto_antes"
  | "foto_depois"
  | "foto_defeito"
  | "video"
  | "audio"
  | "laudo"
  | "nota"
  | "comprovante"
  | "documento_tecnico"
  | "outro";

export interface Anexo {
  id: string;
  tipo: AnexoTipo;
  nome: string;
  url: string;
  tamanho?: number;
  mimeType?: string;
  enviadoPor: string;
  enviadoEm: string;
  publico?: boolean; // true = visível ao cliente no portal
  /** Categoria operacional do anexo (HUB V2). */
  categoria?: "diagnostico" | "bancada" | "cliente" | "comprovante" | "garantia" | "equipamento" | "outros";
  /** Provider do storage (nesta fase: local-idb / legacy-blob / external-url). */
  storageProvider?: "local-idb" | "legacy-blob" | "external-url";
  /** true quando o blob está persistido no provider (IndexedDB/external). */
  persisted?: boolean;
  checksum?: string;
  metadata?: Record<string, unknown>;
}

export type EventoTipo =
  | "criacao"
  | "mudanca_status"
  | "atribuicao_tecnico"
  | "orcamento_criado"
  | "orcamento_enviado"
  | "orcamento_item_adicionado"
  | "orcamento_item_removido"
  | "orcamento_atualizado"
  | "orcamento_aprovado"
  | "orcamento_aprovado_editado_sem_valor"
  | "orcamento_aprovado_revisado"
  | "orcamento_recusado"
  | "diagnostico_registrado"
  | "servico_iniciado"
  | "servico_concluido"
  | "entrega_cliente"
  | "os_cancelada"
  | "faturamento_os_pendente"
  | "faturamento_os_cancelado"
  | "faturamento_os_revisado"
  | "estoque_consumido"
  | "estoque_item_consumido"
  | "estoque_sync_erro"
  | "estoque_restaurado"
  | "estoque_restaurado_automaticamente"
  | "estoque_delta_aplicado"
  | "estoque_delta_erro"
  | "financeiro_conta_receber_criada"
  | "financeiro_conta_receber_atualizada"
  | "financeiro_conta_receber_cancelada"
  | "financeiro_sync_erro"
  | "operacao_cobranca_gerada"
  | "anexo_adicionado"
  | "anexo_removido"
  | "observacao"
  | "mensagem_cliente"
  | "mensagem_interna"
  | "peca_adicionada"
  | "garantia_acionada"
  | "garantia_gerada"
  | "checklist_finalizado"
  | "retirada_confirmada"
  | "documento_impresso"
  | "ia_sugestao";

export interface EventoTimeline {
  id: string;
  tipo: EventoTipo;
  /** Título curto para exibição na timeline (opcional). */
  titulo?: string;
  autor: string;            // nome ou "Sistema" / "IA"
  autorTipo: "usuario" | "cliente" | "sistema" | "ia";
  conteudo: string;
  metadata?: Record<string, unknown>;
  criadoEm: string;
}

export interface Garantia {
  ativa: boolean;
  prazoDias?: number;       // 90, 180...
  inicioEm?: string;        // data da entrega
  fimEm?: string;           // calculado
  termo?: string;           // texto/condições
  acionamentos?: number;    // quantas vezes voltou
}

/** Modo de cálculo do prazo ao registrar garantia na entrega. */
export type GarantiaOperacionalModo = "catalogo" | "dias_30" | "dias_90" | "personalizada";

export interface GarantiaOrdemServicoLeitura {
  id: string;
  ordemServicoId: string;
  storeId: string;
  prazoDias: number;
  cobertura: string;
  observacoes: string;
  dataInicio: string;
  dataFim: string;
  status: "ativa" | "expirada" | "cancelada";
  createdAt: string;
}

/** Checklist técnico de bancada (pós-reparo). */
export interface ChecklistTecnicoItem {
  id: string;
  label: string;
  ok: boolean;
}

/** Retirada / conferência na mão do cliente. */
export interface RetiradaCliente {
  confirmado: boolean;
  retiradoPor?: string;
  retiradoEm?: string;
  observacao?: string;
  /** Assinatura em texto (fase simples — sem canvas biométrico). */
  assinaturaTexto?: string;
}

export interface ObservacaoTecnica {
  id: string;
  autor: string;
  conteudo: string;
  interna: boolean;         // true = não visível ao cliente
  criadoEm: string;
}

export interface OrdemServico {
  id: string;
  codigo: string;            // OS-2026-00123
  storeId: string;           // multi-loja: toda OS pertence a uma loja
  clienteId: string;         // referência ao registro real em clientes
  cliente: Cliente;          // snapshot denormalizado (mantém UI estável)
  equipamento: Equipamento;
  status: OSStatus;
  prioridade: OSPrioridade;
  origem: OSOrigem;
  tecnico?: Tecnico;
  sla: SLA;
  orcamento?: Orcamento;
  pecas: PecaUsada[];
  observacoes: ObservacaoTecnica[];
  anexos: Anexo[];
  timeline: EventoTimeline[];
  garantia: Garantia;
  tags?: string[];
  criadoEm: string;
  atualizadoEm: string;
  entregueEm?: string;

  // Novos campos operacionais
  checklist?: ChecklistItem[];
  servicosCatalogo?: { servicoId: string; descricao: string; custoInterno: number; valorVenda: number; prazoGarantiaDias: number; termoGarantia: string }[];
  senhaEquipamento?: string;
  observacaoCliente?: string;

  /** Base para faturamento real (payload apenas; sem modelo financeiro ainda). */
  faturamentoPendente?: boolean;
  faturamentoStatus?: "pendente" | "cancelado";
  faturamentoOrigem?: "orcamento_os";
  faturamentoTotal?: number;
  faturamentoCriadoEm?: string;
  /** Referência humana + id estável da OS (ex.: código · uuid). */
  faturamentoReferencia?: string;
  /** Modo escolhido em “Gerar cobrança” (espelhado no payload da Conta a Receber). */
  faturamentoModoCobranca?: "avista" | "parcelado" | "carteira" | "dinheiro_pix_cartao";
  faturamentoParcelas?: { numero: number; valor: number; vencimentoIso: string }[];
  /** Rótulo auxiliar para forma de quitação (carteira / dinheiro-PIX-cartão / etc.). */
  faturamentoFormaPagamento?: string;

  /** Espelho de `ordem_servico_item` (rascunho do orçamento; após entrega vira ledger de baixa). */
  itensPersistidos?: {
    id: string;
    tipo: string;
    descricao: string;
    quantidade: number;
    precoUnitario: number;
    produtoId?: string | null;
  }[];

  /** Política: histórico de revisões quando orçamento já aprovado é alterado. */
  orcamentoHistorico?: {
    orcamento: Orcamento;
    revisadoEm: string;
    motivo: "aprovado_editado_sem_valor" | "aprovado_revisado";
    totalAnterior: number;
    totalNovo: number;
  }[];
  /** Política: revisão atual (quando houver). */
  orcamentoRevisaoAtual?: {
    revisadoEm: string;
    totalAnterior: number;
    totalNovo: number;
    revisadoAposAprovacao: boolean;
  };
  /** Política: marcadores de revisão do faturamento derivado do orçamento. */
  faturamentoRevisadoEm?: string;
  faturamentoValorAnterior?: number;
  faturamentoValorAtual?: number;

  /** Valores persistidos nas colunas Prisma (fonte quando o payload não reflete). */
  prismaValorBase?: number;
  prismaValorTotal?: number;

  /** Estoque (real) — marcadores/idempotência no payload. */
  estoqueConsumido?: boolean;
  estoqueConsumidoEm?: string;
  estoqueMovimentos?: {
    id: string;
    produtoId: string;
    nome: string;
    quantidade: number;
    estoqueAnterior: number;
    estoqueDepois: number;
    origem: "operacoes-hub-v2";
    ordemServicoId: string;
    createdAt: string;
  }[];
  estoqueRestaurado?: boolean;
  estoqueRestauradoEm?: string;
  estoqueUltimaRevisaoEm?: string;
  estoqueDeltaHistorico?: {
    produtoId: string;
    quantidadeAnterior: number;
    quantidadeNova: number;
    diferenca: number;
    tipo: "consumo" | "restauracao";
    createdAt: string;
  }[];

  /** Modo de prazo da garantia operacional ao entregar (30 / 90 / personalizada / catálogo). */
  garantiaOperacionalModo?: GarantiaOperacionalModo;
  /** Dias quando `garantiaOperacionalModo = personalizada`. */
  garantiaOperacionalPrazoCustom?: number;

  /** Checklist técnico (bancada). */
  checklistTecnico?: ChecklistTecnicoItem[];

  /** Retirada confirmada pelo cliente. */
  retirada?: RetiradaCliente;

  /** Garantias persistidas no Prisma (leitura enriquecida). */
  garantiasOperacionais?: GarantiaOrdemServicoLeitura[];
}

// ----------------------------------------------------------------------------
// Pipeline padrão
// ----------------------------------------------------------------------------

export const PIPELINE: { id: OSStatus; label: string; descricao: string }[] = [
  { id: "aberta", label: "Aberto", descricao: "OS recém-criada, aguardando triagem" },
  { id: "diagnostico", label: "Diagnóstico", descricao: "Técnico avaliando o equipamento" },
  { id: "aguardando_aprovacao", label: "Aguardando aprovação", descricao: "Orçamento enviado ou aguardando resposta" },
  { id: "aprovado", label: "Aprovado", descricao: "Orçamento aprovado; aguardando início do serviço" },
  { id: "em_execucao", label: "Em execução", descricao: "Reparo em andamento" },
  { id: "aguardando_peca", label: "Aguardando peça", descricao: "Serviço pausado aguardando peça" },
  { id: "pronta", label: "Pronto", descricao: "Pronto para retirada/entrega" },
  { id: "entregue", label: "Entregue", descricao: "Equipamento devolvido ao cliente" },
  { id: "cancelada", label: "Cancelada", descricao: "OS encerrada sem conclusão" },
];

// ----------------------------------------------------------------------------
// Checklist visual de entrada do equipamento
// ----------------------------------------------------------------------------

export type ChecklistEstado = "ok" | "ruim" | "nao_testado";

export interface ChecklistItem {
  id: string;
  label: string;
  estado: ChecklistEstado;
  observacao?: string;
  fotoUrl?: string;
}

export const CHECKLIST_PADRAO: { id: string; label: string }[] = [
  { id: "tela", label: "Tela" },
  { id: "touch", label: "Touch" },
  { id: "camera", label: "Câmera" },
  { id: "wifi", label: "Wi-Fi" },
  { id: "bluetooth", label: "Bluetooth" },
  { id: "som", label: "Som" },
  { id: "microfone", label: "Microfone" },
  { id: "botoes", label: "Botões" },
  { id: "biometria", label: "Biometria / Face ID" },
  { id: "carregamento", label: "Carregamento" },
  { id: "bateria", label: "Bateria" },
  { id: "outros", label: "Outros" },
];

/** Itens padrão do checklist técnico (pós-reparo). */
export const CHECKLIST_TECNICO_PADRAO: { id: string; label: string }[] = [
  { id: "liga", label: "Aparelho liga" },
  { id: "touch_ok", label: "Touch OK" },
  { id: "biometria_ok", label: "Biometria OK" },
  { id: "camera_ok", label: "Câmera OK" },
  { id: "wifi_ok", label: "Wi-Fi OK" },
  { id: "bluetooth_ok", label: "Bluetooth OK" },
  { id: "carregando_ok", label: "Carregando OK" },
];

export const PRIORIDADE_CONFIG: Record<
  OSPrioridade,
  { label: string; color: string; ordem: number }
> = {
  baixa: { label: "Baixa", color: "bg-slate-500/10 text-slate-500 border-slate-500/20", ordem: 0 },
  media: { label: "Média", color: "bg-sky-500/10 text-sky-500 border-sky-500/20", ordem: 1 },
  alta: { label: "Alta", color: "bg-amber-500/10 text-amber-500 border-amber-500/20", ordem: 2 },
  critica: { label: "Crítica", color: "bg-rose-500/10 text-rose-500 border-rose-500/20", ordem: 3 },
};

export const ORIGEM_LABEL: Record<OSOrigem, string> = {
  manual: "Manual",
  whatsapp: "WhatsApp",
  site: "Site",
  telefone: "Telefone",
  email: "E-mail",
  balcao: "Balcão",
};
