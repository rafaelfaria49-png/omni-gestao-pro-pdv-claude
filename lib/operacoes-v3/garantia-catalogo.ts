// ============================================================================
// Operações V3 — Fase 1E · BIBLIOTECA DE GARANTIAS (catálogo profissional)
// ----------------------------------------------------------------------------
// Fonte ÚNICA dos textos de garantia (título, prazo padrão, cobertura,
// exclusões, observações) + gerador do termo + sugestão por descrição.
// Texto longo vive AQUI (não espalhado em componentes). Módulo puro.
//
// Modelos: tela · bateria · conector · camera · alto_falante · microfone ·
//          software · placa · oxidacao · sem_garantia · personalizado
// ============================================================================

export type GarantiaModeloIdV3 =
  | "tela"
  | "bateria"
  | "conector"
  | "camera"
  | "alto_falante"
  | "microfone"
  | "software"
  | "placa"
  | "oxidacao"
  | "sem_garantia"
  | "personalizado"
  | "transferencia_dados"
  | "recuperacao_conta"
  | "instalacao_app"
  | "limpeza_tecnica"
  | "atualizacao_config";

export interface GarantiaModeloCatalogoV3 {
  id: GarantiaModeloIdV3;
  titulo: string;
  /** Prazo padrão em dias (0 quando não há cobertura). */
  prazoDiasPadrao: number;
  semCobertura: boolean;
  cobertura: string[];
  exclusoes: string[];
  observacoes?: string;
}

export interface TermoGarantiaV3 {
  modeloId: string;
  titulo: string;
  prazoDias?: number;
  semCobertura: boolean;
  cobertura: string[];
  exclusoes: string[];
  observacao?: string;
}

/** Exclusões comuns a qualquer garantia de reparo (claras, sem exagero jurídico). */
const EXCLUSOES_COMUNS: string[] = [
  "Danos por queda, impacto ou pressão (tela trincada, carcaça quebrada, entortamento).",
  "Contato com líquidos, umidade ou sinais de oxidação após a entrega.",
  "Mau uso, uso de carregadores/cabos não originais ou instalação de softwares indevidos.",
  "Violação do lacre ou intervenção de terceiros após a retirada do aparelho.",
  "Defeitos diferentes do serviço executado e descrito nesta Ordem de Serviço.",
];

// ----------------------------------------------------------------------------
// Catálogo profissional
// ----------------------------------------------------------------------------

export const GARANTIA_CATALOGO_V3: GarantiaModeloCatalogoV3[] = [
  {
    id: "tela",
    titulo: "Garantia — Troca de tela",
    prazoDiasPadrao: 90,
    semCobertura: false,
    cobertura: [
      "Tela/touch instalada nesta assistência contra defeitos de funcionamento (falhas de toque, linhas, manchas ou ausência de imagem) não decorrentes de mau uso.",
    ],
    exclusoes: EXCLUSOES_COMUNS,
  },
  {
    id: "bateria",
    titulo: "Garantia — Troca de bateria",
    prazoDiasPadrao: 90,
    semCobertura: false,
    cobertura: [
      "Bateria substituída contra defeito de fabricação (não carrega, descarga anormal, desligamento sem motivo) dentro do prazo.",
    ],
    exclusoes: EXCLUSOES_COMUNS,
  },
  {
    id: "conector",
    titulo: "Garantia — Conector de carga",
    prazoDiasPadrao: 90,
    semCobertura: false,
    cobertura: [
      "Conector/flex de carga substituído contra falha de carregamento não causada por mau uso do cabo ou da fonte.",
    ],
    exclusoes: EXCLUSOES_COMUNS,
  },
  {
    id: "camera",
    titulo: "Garantia — Câmera",
    prazoDiasPadrao: 90,
    semCobertura: false,
    cobertura: ["Módulo de câmera substituído contra defeito de captura ou foco que não tenha origem em impacto/queda."],
    exclusoes: EXCLUSOES_COMUNS,
  },
  {
    id: "alto_falante",
    titulo: "Garantia — Alto-falante",
    prazoDiasPadrao: 90,
    semCobertura: false,
    cobertura: ["Alto-falante substituído contra ausência ou distorção de áudio por defeito da peça."],
    exclusoes: EXCLUSOES_COMUNS,
  },
  {
    id: "microfone",
    titulo: "Garantia — Microfone",
    prazoDiasPadrao: 90,
    semCobertura: false,
    cobertura: ["Microfone substituído contra falha de captação de voz por defeito da peça."],
    exclusoes: EXCLUSOES_COMUNS,
  },
  {
    id: "software",
    titulo: "Garantia — Serviço de software",
    prazoDiasPadrao: 30,
    semCobertura: false,
    cobertura: ["Serviço de software executado (atualização, formatação, desbloqueio) contra falha do procedimento realizado."],
    exclusoes: EXCLUSOES_COMUNS,
    observacoes: "Não cobre perda de dados, aplicativos, contas ou senhas — a responsabilidade pelo backup é do cliente.",
  },
  {
    id: "placa",
    titulo: "Garantia — Reparo de placa",
    prazoDiasPadrao: 90,
    semCobertura: false,
    cobertura: [
      "Reparo de placa/componente realizado (reballing, troca de CI, correção de curto) contra reincidência do mesmo defeito tratado nesta OS.",
    ],
    exclusoes: EXCLUSOES_COMUNS,
    observacoes: "Reparos de placa podem ter limitação técnica; defeitos em outros componentes da placa não estão cobertos.",
  },
  {
    id: "oxidacao",
    titulo: "Sem garantia — Oxidação / contato com líquido",
    prazoDiasPadrao: 0,
    semCobertura: true,
    cobertura: [],
    exclusoes: [],
    observacoes:
      "O aparelho apresenta sinais de oxidação ou contato com líquido. O reparo é uma TENTATIVA de recuperação e pode apresentar falhas a qualquer momento. Por esse motivo, este serviço é entregue SEM GARANTIA.",
  },
  {
    id: "sem_garantia",
    titulo: "Sem garantia",
    prazoDiasPadrao: 0,
    semCobertura: true,
    cobertura: [],
    exclusoes: [],
    observacoes: "Conforme acordado na abertura desta Ordem de Serviço, este serviço é entregue SEM GARANTIA.",
  },
  {
    id: "personalizado",
    titulo: "Garantia — Personalizada",
    prazoDiasPadrao: 90,
    semCobertura: false,
    cobertura: ["Garantia limitada ao serviço/peça descritos nesta Ordem de Serviço."],
    exclusoes: EXCLUSOES_COMUNS,
  },
];


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

export const GARANTIA_TEMPLATES_BASE_V3: GarantiaTemplateV3[] = [
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


// Modelos exclusivos da Nova OS preservam textos e prazos publicados.
for (const t of GARANTIA_TEMPLATES_BASE_V3) {
  if (!GARANTIA_CATALOGO_V3.some((m) => m.id === t.id)) {
    GARANTIA_CATALOGO_V3.push({ id: t.id as GarantiaModeloIdV3, titulo: t.nome, prazoDiasPadrao: t.dias, semCobertura: t.dias === 0, cobertura: t.dias ? [t.texto] : [], exclusoes: [], observacoes: t.dias ? undefined : t.texto });
  }
}
