// ============================================================================
// Operações V3 — Nova OS Enterprise · CATÁLOGO OFICIAL DE GARANTIAS (templates)
// ----------------------------------------------------------------------------
// Fonte ÚNICA dos templates pré-preenchidos do passo "Garantia" da Nova OS.
// Cada template carrega: id, nome, prazo (dias) e o TEXTO completo do termo.
// Ao selecionar um modelo, o passo Garantia preenche automaticamente o prazo
// e o texto — sem clique adicional — e o operador pode editar livremente.
//
// Módulo PURO (sem React / sem efeitos). Não tocar Prisma/Financeiro/PDV.
// ============================================================================

export interface GarantiaTemplateV3 {
  /** Identificador estável (alinhado a GARANTIA_MODELOS_V3 em nova-os-model). */
  id: string;
  /** Rótulo exibido no seletor do passo Garantia. */
  nome: string;
  /** Prazo padrão em dias (0 = serviço sem garantia). */
  dias: number;
  /** Texto completo do termo, pronto para impressão / edição. */
  texto: string;
}

// ----------------------------------------------------------------------------
// Catálogo oficial (ordem = ordem de exibição no seletor)
// ----------------------------------------------------------------------------

export const GARANTIA_TEMPLATES_V3: GarantiaTemplateV3[] = [
  {
    id: "tela",
    nome: "Troca de Tela",
    dias: 90,
    texto: `GARANTIA LEGAL DE 90 DIAS

A garantia cobre exclusivamente defeitos de fabricação da peça instalada ou falhas de instalação realizadas pela assistência técnica.

Não cobre:

• Quebras
• Trincas
• Riscos
• Impactos
• Pressão sobre a tela
• Contato com líquidos
• Oxidação
• Mau uso
• Uso de acessórios inadequados
• Violação por terceiros

Aparelhos com chassi torto, estrutura danificada ou histórico de impacto podem apresentar falhas futuras sem relação com a peça instalada.

Ao retirar o aparelho o cliente declara ter testado imagem, touch e funcionamento geral da tela.`,
  },
  {
    id: "bateria",
    nome: "Troca de Bateria",
    dias: 90,
    texto: `GARANTIA LEGAL DE 90 DIAS

A garantia cobre defeitos da bateria instalada e falhas de instalação.

Não cobre:

• Oxidação
• Quedas
• Impactos
• Violação por terceiros
• Carregadores inadequados
• Danos causados por mau uso`,
  },
  {
    id: "conector",
    nome: "Conector de Carga",
    dias: 90,
    texto: `GARANTIA LEGAL DE 90 DIAS

A garantia cobre defeitos do componente substituído e falhas de instalação.

Não cobre:

• Oxidação
• Danos por líquidos
• Mau uso do conector
• Cabos ou carregadores inadequados
• Violação por terceiros`,
  },
  {
    id: "camera",
    nome: "Câmera",
    dias: 90,
    texto: `GARANTIA LEGAL DE 90 DIAS

A garantia cobre defeitos da peça instalada e falhas de instalação.

Não cobre:

• Riscos na lente
• Impactos
• Líquidos
• Oxidação
• Violação por terceiros`,
  },
  {
    id: "alto_falante",
    nome: "Alto-falante",
    dias: 90,
    texto: `GARANTIA LEGAL DE 90 DIAS

A garantia cobre defeitos do componente instalado e falhas de instalação.

Não cobre:

• Líquidos
• Oxidação
• Acúmulo de sujeira
• Violação por terceiros`,
  },
  {
    id: "microfone",
    nome: "Microfone",
    dias: 90,
    texto: `GARANTIA LEGAL DE 90 DIAS

A garantia cobre defeitos do componente instalado e falhas de instalação.

Não cobre:

• Líquidos
• Oxidação
• Acúmulo de sujeira
• Violação por terceiros`,
  },
  {
    id: "placa",
    nome: "Placa",
    dias: 90,
    texto: `GARANTIA LEGAL DE 90 DIAS

O reparo em placa eletrônica é realizado sobre equipamento previamente danificado.

A garantia cobre exclusivamente o defeito reparado.

Não cobre falhas futuras em outros setores da placa ou componentes não relacionados ao reparo executado.`,
  },
  {
    id: "software",
    nome: "Software",
    dias: 30,
    texto: `GARANTIA DE 30 DIAS

A garantia cobre exclusivamente o procedimento realizado.

Não cobre:

• Atualizações posteriores
• Redefinições realizadas pelo usuário
• Problemas de hardware
• Aplicativos instalados após o serviço`,
  },
  {
    id: "transferencia_dados",
    nome: "Transferência de Dados",
    dias: 0,
    texto: `SERVIÇO SEM GARANTIA

O serviço consiste na tentativa de migração dos dados disponíveis entre dispositivos.

Não há garantia sobre:

• Aplicativos de terceiros
• Senhas
• Contas
• Arquivos corrompidos
• Arquivos inacessíveis
• Conteúdo protegido

Após conferência do cliente o serviço é considerado concluído.`,
  },
  {
    id: "recuperacao_conta",
    nome: "Criação / Recuperação de Conta",
    dias: 0,
    texto: `SERVIÇO SEM GARANTIA

O serviço consiste na configuração ou recuperação da conta solicitada.

Bloqueios futuros, alterações de senha, verificações de segurança ou decisões da plataforma não são cobertos.`,
  },
  {
    id: "instalacao_app",
    nome: "Instalação de Aplicativo",
    dias: 0,
    texto: `SERVIÇO SEM GARANTIA

O aplicativo foi instalado e testado no momento da entrega.

Alterações futuras do sistema operacional ou do fabricante não são cobertas.`,
  },
  {
    id: "limpeza_tecnica",
    nome: "Limpeza Técnica",
    dias: 0,
    texto: `SERVIÇO SEM GARANTIA

O procedimento consiste em limpeza preventiva.

Não há garantia de correção definitiva de defeitos existentes.`,
  },
  {
    id: "atualizacao_config",
    nome: "Atualização / Configuração",
    dias: 30,
    texto: `GARANTIA DE 30 DIAS

A garantia cobre apenas o procedimento executado.

Não cobre alterações posteriores realizadas pelo usuário.`,
  },
  {
    id: "oxidacao",
    nome: "Oxidação",
    dias: 0,
    texto: `SERVIÇO SEM GARANTIA

Equipamentos com histórico de contato com líquidos possuem risco elevado de falhas futuras.

O reparo possui caráter de tentativa técnica.

Novos defeitos poderão surgir devido ao processo corrosivo já existente.`,
  },
];

const TEMPLATE_POR_ID = new Map<string, GarantiaTemplateV3>(GARANTIA_TEMPLATES_V3.map((t) => [t.id, t]));

/** Template oficial por id; `null` quando o id não corresponde a um modelo do catálogo. */
export function garantiaTemplateV3(id?: string | null): GarantiaTemplateV3 | null {
  return TEMPLATE_POR_ID.get((id ?? "").trim()) ?? null;
}

// ----------------------------------------------------------------------------
// Pré-preenchimento do passo Garantia (com proteção da edição manual)
// ----------------------------------------------------------------------------

export interface GarantiaPreenchidaV3 {
  modelo: string;
  label: string;
  prazoDias: number;
  termo: string;
}

export interface PreencherGarantiaOpcoesV3 {
  /** Texto atual no campo (preservado quando o operador já editou). */
  termoAtual?: string;
  /** `true` quando o operador já digitou/alterou o termo manualmente. */
  termoEditadoManual?: boolean;
}

/**
 * Resolve o preenchimento do passo Garantia para um `templateId`.
 *
 * - Sempre devolve `prazoDias` e `label` do template selecionado.
 * - O `termo` recebe o texto completo do template, EXCETO quando o operador já
 *   editou manualmente (`termoEditadoManual`): nesse caso o texto digitado é
 *   preservado, conforme a regra "não sobrescrever texto do usuário".
 *
 * Retorna `null` quando `templateId` não pertence ao catálogo oficial.
 */
export function preencherGarantiaPorTemplateV3(
  templateId: string,
  opcoes: PreencherGarantiaOpcoesV3 = {},
): GarantiaPreenchidaV3 | null {
  const template = garantiaTemplateV3(templateId);
  if (!template) return null;
  const preservarTexto = opcoes.termoEditadoManual === true;
  return {
    modelo: template.id,
    label: template.nome,
    prazoDias: template.dias,
    termo: preservarTexto ? (opcoes.termoAtual ?? "") : template.texto,
  };
}
