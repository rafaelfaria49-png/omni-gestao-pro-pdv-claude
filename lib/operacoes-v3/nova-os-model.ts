// ============================================================================
// Operações V3 — Nova OS Enterprise · MODELO puro (fonte de verdade do balcão)
// ----------------------------------------------------------------------------
// Módulo PURO (sem I/O, sem React, sem Prisma) — importável por cliente e
// servidor. Descreve o rascunho de abertura completa de uma OS, calcula os
// totais (com a mesma regra de brindes do orçamento) e valida o mínimo
// obrigatório antes de persistir.
//
// Relação com o orçamento (Fase 1C): cada item tem `kind`
// (cobrado | brinde | interno) idêntico a `OrcamentoLinhaKindV3`:
//   • cobrado → impacta custo E valor ao cliente.
//   • brinde  → impacta custo, valor ao cliente = 0 (exibido ao cliente).
//   • interno → impacta custo, valor ao cliente = 0 (uso interno).
//
// IMPORTANTE: este modelo NÃO baixa estoque, NÃO cria Conta a Receber e NÃO
// registra recebimento. O pagamento é apenas PREVISTO (o recebimento real é
// feito depois no PDV de Serviço).
// ============================================================================

import type { OSPrioridade } from "@/types/os";
import type { OrcamentoLinhaKindV3 } from "./orcamento-model";

export type NovaOSClienteKindV3 = "PF" | "PJ";
export type NovaOSItemCategoriaV3 = "servico" | "peca";
export type NovaOSSenhaTipoV3 = "numerica" | "texto" | "padrao";
export type NovaOSOrigemV3 = "balcao" | "whatsapp" | "retorno" | "garantia";
export type NovaOSLocalFisicoV3 = "balcao" | "bancada" | "aguardando_diagnostico";
export type NovaOSPagamentoFormaV3 =
  | "a_combinar"
  | "dinheiro"
  | "pix"
  | "debito"
  | "credito"
  | "parcelado"
  | "crediario";

// ----------------------------------------------------------------------------
// Estruturas do rascunho (A → J)
// ----------------------------------------------------------------------------

export interface NovaOSClienteV3 {
  /** Preenchido quando um cliente existente é selecionado (FK real). */
  id?: string;
  nome: string;
  telefone?: string;
  documento?: string;
  email?: string;
  endereco?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
  tipo: NovaOSClienteKindV3;
}

export interface NovaOSEquipamentoV3 {
  tipo: string;
  marca: string;
  modelo: string;
  /** IMEI / número de série. */
  imei?: string;
  senha?: string;
  senhaTipo: NovaOSSenhaTipoV3;
  acessorios: string[];
}

export interface NovaOSRecepcaoV3 {
  dataEntrada: string; // ISO
  previsaoEntrega?: string; // ISO
  origem: NovaOSOrigemV3;
  recebidoPor?: string;
  prioridade: OSPrioridade;
  localFisico: NovaOSLocalFisicoV3;
}

export interface NovaOSProblemaV3 {
  defeitoRelatado: string;
  condicaoAparelho?: string;
  observacoesInternas?: string;
}

export interface NovaOSDiagnosticoV3 {
  diagnosticoTecnico?: string;
  solucaoPrevista?: string;
}

export interface NovaOSItemV3 {
  id: string;
  categoria: NovaOSItemCategoriaV3;
  descricao: string;
  quantidade: number;
  /** Custo interno (oculto do cliente) por unidade. */
  custoUnitario: number;
  /** Valor ao cliente por unidade (ignorado quando kind ≠ cobrado). */
  valorUnitario: number;
  kind: OrcamentoLinhaKindV3;
  /** Marcação para baixa de estoque (NÃO executada nesta fase). */
  baixaEstoque: boolean;
  /** Garantia em dias (apenas serviços). */
  garantiaDias?: number;
  /** Vínculo opcional com o catálogo oficial (SPRINT_3D.1B): habilita a baixa
   *  real de estoque quando a OS é entregue. Ausente = item manual. */
  produtoId?: string;
  sku?: string;
  barcode?: string;
}

export interface NovaOSPagamentoPrevistoV3 {
  forma: NovaOSPagamentoFormaV3;
  vencimentoPrevisto?: string; // ISO (data)
  observacao?: string;
  /** Sinal/entrada apenas informado (não recebido). */
  sinal?: number;
}

export interface NovaOSGarantiaPrevistaV3 {
  /** id do modelo em GARANTIA_MODELOS_V3. */
  modelo: string;
  label: string;
  prazoDias?: number;
  termo?: string;
}

export interface NovaOSDraftV3 {
  cliente: NovaOSClienteV3;
  equipamento: NovaOSEquipamentoV3;
  recepcao: NovaOSRecepcaoV3;
  problema: NovaOSProblemaV3;
  diagnostico: NovaOSDiagnosticoV3;
  itens: NovaOSItemV3[];
  desconto: number;
  pagamento: NovaOSPagamentoPrevistoV3;
  garantia: NovaOSGarantiaPrevistaV3;
}

// ----------------------------------------------------------------------------
// Opções de UI (rótulos canônicos)
// ----------------------------------------------------------------------------

export const TIPO_EQUIPAMENTO_V3: string[] = ["Smartphone", "Notebook", "Tablet", "Impressora", "Console", "Outro"];

export const ACESSORIOS_PADRAO_V3: string[] = ["Chip", "Capinha", "Película", "Carregador", "Cabo", "Cartão / Memória"];

export const ORIGEM_V3: { value: NovaOSOrigemV3; label: string }[] = [
  { value: "balcao", label: "Balcão" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "retorno", label: "Retorno" },
  { value: "garantia", label: "Garantia" },
];

export const LOCAL_FISICO_V3: { value: NovaOSLocalFisicoV3; label: string }[] = [
  { value: "balcao", label: "Balcão" },
  { value: "bancada", label: "Bancada" },
  { value: "aguardando_diagnostico", label: "Aguardando diagnóstico" },
];

export const PRIORIDADE_V3: { value: OSPrioridade; label: string }[] = [
  { value: "baixa", label: "Baixa" },
  { value: "media", label: "Média" },
  { value: "alta", label: "Alta" },
  { value: "critica", label: "Crítica" },
];

export const FORMA_PAGAMENTO_V3: { value: NovaOSPagamentoFormaV3; label: string }[] = [
  { value: "a_combinar", label: "A combinar" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "pix", label: "PIX" },
  { value: "debito", label: "Débito" },
  { value: "credito", label: "Crédito" },
  { value: "parcelado", label: "Parcelado" },
  { value: "crediario", label: "Crediário" },
];

export const ITEM_CATEGORIA_V3: { value: NovaOSItemCategoriaV3; label: string }[] = [
  { value: "servico", label: "Serviço" },
  { value: "peca", label: "Peça" },
];

export const ITEM_KIND_V3: { value: OrcamentoLinhaKindV3; label: string }[] = [
  { value: "cobrado", label: "Cobrado" },
  { value: "brinde", label: "Brinde" },
  { value: "interno", label: "Interno" },
];

/**
 * Tabela de resolução id → label/prazo da garantia prevista (item I).
 * prazoDias undefined = personalizado. Os textos completos dos modelos vivem no
 * catálogo oficial `garantia-templates.ts` (passo Garantia da Nova OS); esta
 * tabela mantém os ids alinhados para resolução de rótulo/prazo na persistência.
 */
export const GARANTIA_MODELOS_V3: { id: string; label: string; prazoDias?: number }[] = [
  { id: "tela", label: "Troca de Tela", prazoDias: 90 },
  { id: "bateria", label: "Troca de Bateria", prazoDias: 90 },
  { id: "conector", label: "Conector de Carga", prazoDias: 90 },
  { id: "camera", label: "Câmera", prazoDias: 90 },
  { id: "alto_falante", label: "Alto-falante", prazoDias: 90 },
  { id: "microfone", label: "Microfone", prazoDias: 90 },
  { id: "placa", label: "Placa", prazoDias: 90 },
  { id: "software", label: "Software", prazoDias: 30 },
  { id: "transferencia_dados", label: "Transferência de Dados", prazoDias: 0 },
  { id: "recuperacao_conta", label: "Criação / Recuperação de Conta", prazoDias: 0 },
  { id: "instalacao_app", label: "Instalação de Aplicativo", prazoDias: 0 },
  { id: "limpeza_tecnica", label: "Limpeza Técnica", prazoDias: 0 },
  { id: "atualizacao_config", label: "Atualização / Configuração", prazoDias: 30 },
  { id: "oxidacao", label: "Oxidação", prazoDias: 0 },
  { id: "sem_garantia", label: "Sem garantia", prazoDias: 0 },
  { id: "personalizado", label: "Personalizado" },
];

export function garantiaModeloV3(id: string): { id: string; label: string; prazoDias?: number } {
  return GARANTIA_MODELOS_V3.find((g) => g.id === id) ?? GARANTIA_MODELOS_V3[0];
}

export function pagamentoFormaLabelV3(forma: NovaOSPagamentoFormaV3): string {
  return FORMA_PAGAMENTO_V3.find((f) => f.value === forma)?.label ?? forma;
}

// ----------------------------------------------------------------------------
// Totais (mesma regra de brindes do orçamento)
// ----------------------------------------------------------------------------

export interface NovaOSTotaisV3 {
  subtotal: number;
  desconto: number;
  total: number;
  custo: number;
  lucro: number;
}

export function itemValorClienteV3(it: NovaOSItemV3): number {
  if (it.kind !== "cobrado") return 0;
  const qtd = Math.max(0, it.quantidade || 0);
  return Math.max(0, qtd * (it.valorUnitario || 0));
}

export function itemCustoV3(it: NovaOSItemV3): number {
  const qtd = Math.max(0, it.quantidade || 0);
  return Math.max(0, qtd * (it.custoUnitario || 0));
}

export function computeTotaisNovaOSV3(itens: NovaOSItemV3[], desconto: number): NovaOSTotaisV3 {
  const lista = Array.isArray(itens) ? itens : [];
  const subtotal = lista.reduce((acc, it) => acc + itemValorClienteV3(it), 0);
  const desc = Math.max(0, Number(desconto) || 0);
  const total = Math.max(0, subtotal - desc);
  const custo = lista.reduce((acc, it) => acc + itemCustoV3(it), 0);
  const lucro = total - custo;
  return { subtotal, desconto: desc, total, custo, lucro };
}

// ----------------------------------------------------------------------------
// Validação (mínimo obrigatório para abrir a OS)
// ----------------------------------------------------------------------------

/** Retorna a 1ª mensagem de erro, ou null quando o rascunho é válido. */
export function validarNovaOSDraftV3(draft: NovaOSDraftV3): string | null {
  const temClienteExistente = !!draft.cliente.id?.trim();
  const temNomeNovo = !!draft.cliente.nome.trim();
  if (!temClienteExistente && !temNomeNovo) {
    return "Selecione um cliente existente ou informe ao menos o nome de um novo.";
  }
  if (!draft.equipamento.marca.trim() || !draft.equipamento.modelo.trim()) {
    return "Informe marca e modelo do equipamento.";
  }
  if (!draft.problema.defeitoRelatado.trim()) {
    return "Descreva o defeito relatado pelo cliente.";
  }
  for (const it of draft.itens) {
    if (!it.descricao.trim()) return "Há um item sem descrição. Preencha ou remova.";
    if ((it.quantidade || 0) <= 0) return `Quantidade inválida em "${it.descricao}".`;
  }
  return null;
}

/** Quais passos (índice) têm pendência — para destacar no wizard. Ordem A..J. */
export function novaOSDraftVazioV3(now = new Date()): NovaOSDraftV3 {
  return {
    cliente: { nome: "", tipo: "PF" },
    equipamento: { tipo: "Smartphone", marca: "", modelo: "", senhaTipo: "numerica", acessorios: [] },
    recepcao: {
      dataEntrada: now.toISOString(),
      origem: "balcao",
      prioridade: "media",
      localFisico: "balcao",
    },
    problema: { defeitoRelatado: "" },
    diagnostico: {},
    itens: [],
    desconto: 0,
    pagamento: { forma: "a_combinar" },
    garantia: { modelo: "sem_garantia", label: "Sem garantia", prazoDias: 0 },
  };
}
