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
  | "em_execucao"
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
  nome: string;
  sku?: string;
  quantidade: number;
  valorUnitario: number;
}

export interface Servico {
  id: string;
  descricao: string;
  valor: number;
}

export interface Orcamento {
  id: string;
  status: OrcamentoStatus;
  pecas: PecaUsada[];
  servicos: Servico[];
  desconto: number;
  total: number;
  criadoEm: string;
  enviadoEm?: string;
  respondidoEm?: string;
  validoAte?: string;
  observacoes?: string;
}

export type AnexoTipo = "foto_antes" | "foto_depois" | "video" | "laudo" | "nota" | "outro";

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
}

export type EventoTipo =
  | "criacao"
  | "mudanca_status"
  | "atribuicao_tecnico"
  | "orcamento_criado"
  | "orcamento_enviado"
  | "orcamento_aprovado"
  | "orcamento_recusado"
  | "anexo_adicionado"
  | "observacao"
  | "mensagem_cliente"
  | "mensagem_interna"
  | "peca_adicionada"
  | "garantia_acionada"
  | "ia_sugestao";

export interface EventoTimeline {
  id: string;
  tipo: EventoTipo;
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
}

// ----------------------------------------------------------------------------
// Pipeline padrão
// ----------------------------------------------------------------------------

export const PIPELINE: { id: OSStatus; label: string; descricao: string }[] = [
  { id: "aberta", label: "Aberto", descricao: "OS recém-criada, aguardando triagem" },
  { id: "diagnostico", label: "Em análise", descricao: "Técnico avaliando o equipamento" },
  { id: "aguardando_aprovacao", label: "Aguardando peça", descricao: "Aguardando aprovação ou chegada de peça" },
  { id: "em_execucao", label: "Em reparo", descricao: "Reparo em andamento" },
  { id: "pronta", label: "Pronto", descricao: "Pronto para retirada/entrega" },
  { id: "entregue", label: "Entregue", descricao: "Equipamento devolvido ao cliente" },
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
