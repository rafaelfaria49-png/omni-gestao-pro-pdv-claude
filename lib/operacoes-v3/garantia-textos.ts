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
  | "personalizado";

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

const CATALOGO_POR_ID = new Map<string, GarantiaModeloCatalogoV3>(GARANTIA_CATALOGO_V3.map((m) => [m.id, m]));

/** Modelo do catálogo por id (fallback: personalizado). */
export function garantiaCatalogoV3(id?: string): GarantiaModeloCatalogoV3 {
  return CATALOGO_POR_ID.get((id ?? "").trim()) ?? CATALOGO_POR_ID.get("personalizado")!;
}

export function prazoPadraoGarantiaV3(id?: string): number {
  return garantiaCatalogoV3(id).prazoDiasPadrao;
}

// ----------------------------------------------------------------------------
// Gerador do termo
// ----------------------------------------------------------------------------

export interface GerarTermoInputV3 {
  modeloId?: string;
  prazoDias?: number;
  /** Texto livre quando o modelo é "personalizado". */
  termoCustom?: string;
}

export function gerarTermoGarantiaV3(input: GerarTermoInputV3): TermoGarantiaV3 {
  const idBruto = (input.modeloId ?? "").trim();
  const conhecido = idBruto && CATALOGO_POR_ID.has(idBruto);
  const modeloId = conhecido ? idBruto : idBruto ? "desconhecido" : "sem_garantia";
  const def = garantiaCatalogoV3(conhecido ? idBruto : idBruto ? "personalizado" : "sem_garantia");
  const custom = (input.termoCustom ?? "").trim();
  const prazoDias =
    typeof input.prazoDias === "number" && input.prazoDias > 0 ? input.prazoDias : def.prazoDiasPadrao > 0 ? def.prazoDiasPadrao : undefined;

  if (def.semCobertura) {
    return { modeloId, titulo: def.titulo, semCobertura: true, cobertura: [], exclusoes: [], observacao: def.observacoes };
  }

  // Personalizado / desconhecido usam o texto livre quando houver.
  const cobertura = (idBruto === "personalizado" || !conhecido) && custom ? [custom] : [...def.cobertura];

  return {
    modeloId: conhecido ? modeloId : idBruto === "personalizado" ? "personalizado" : "desconhecido",
    titulo: conhecido ? def.titulo : idBruto === "personalizado" ? def.titulo : "Garantia do serviço",
    prazoDias,
    semCobertura: false,
    cobertura,
    exclusoes: [...def.exclusoes],
    observacao: custom && idBruto !== "personalizado" && conhecido ? `${def.observacoes ? def.observacoes + " " : ""}${custom}` : def.observacoes,
  };
}

/** Versão em texto corrido (impressão simples / testes / cópia). */
export function termoGarantiaTextoV3(termo: TermoGarantiaV3): string {
  const linhas: string[] = [termo.titulo];
  if (termo.prazoDias) linhas.push(`Prazo: ${termo.prazoDias} dias a partir da entrega.`);
  if (termo.semCobertura) {
    if (termo.observacao) linhas.push(termo.observacao);
    return linhas.join("\n");
  }
  if (termo.cobertura.length) {
    linhas.push("Cobre:");
    termo.cobertura.forEach((c) => linhas.push(`• ${c}`));
  }
  if (termo.exclusoes.length) {
    linhas.push("Não cobre:");
    termo.exclusoes.forEach((e) => linhas.push(`• ${e}`));
  }
  if (termo.observacao) linhas.push(termo.observacao);
  return linhas.join("\n");
}

// ----------------------------------------------------------------------------
// Sugestão automática de garantia por descrição de serviço (item 4)
// ----------------------------------------------------------------------------

const SUGESTAO_KEYWORDS: { id: GarantiaModeloIdV3; termos: string[] }[] = [
  { id: "tela", termos: ["tela", "display", "touch", "lcd", "frontal", "oled"] },
  { id: "bateria", termos: ["bateria", "battery", "pilha"] },
  { id: "conector", termos: ["conector", "carga", "flex de carga", "dock", "v8", "usb"] },
  { id: "camera", termos: ["camera", "câmera", "lente", "traseira"] },
  { id: "alto_falante", termos: ["alto-falante", "alto falante", "falante", "auto-falante", "speaker", "campainha", "auricular"] },
  { id: "microfone", termos: ["microfone", "mic ", " mic"] },
  { id: "placa", termos: ["placa", "reball", "reballing", "ci ", "curto", "chip", "solda"] },
  { id: "software", termos: ["software", "formatação", "formatacao", "desbloqueio", "atualização", "atualizacao", "sistema", "icloud", "frp", "senha"] },
];

/** Sugere o modelo de garantia a partir de uma descrição de serviço; null se nada bate. */
export function sugerirGarantiaPorDescricaoV3(descricao: string | null | undefined): GarantiaModeloIdV3 | null {
  const q = (descricao ?? "").toLowerCase();
  if (!q.trim()) return null;
  for (const { id, termos } of SUGESTAO_KEYWORDS) {
    if (termos.some((t) => q.includes(t))) return id;
  }
  return null;
}
