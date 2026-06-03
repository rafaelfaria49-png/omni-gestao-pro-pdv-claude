// ============================================================================
// Operações V3 — Fase 1D · Textos de GARANTIA (centralizado, puro)
// ----------------------------------------------------------------------------
// Gera um termo de garantia profissional, claro e SEM linguagem abusiva, a
// partir do modelo escolhido na Nova OS. Texto longo vive AQUI (não espalhado
// nos componentes). Módulo puro (sem I/O, sem React).
//
// Modelos = os mesmos ids de `GARANTIA_MODELOS_V3` (nova-os-model):
//   tela · bateria · conector · camera · alto_falante · microfone · software ·
//   oxidacao · sem_garantia · personalizado
// ============================================================================

export interface TermoGarantiaV3 {
  /** id do modelo (ou "personalizado"/"desconhecido"). */
  modeloId: string;
  /** Título amigável do termo. */
  titulo: string;
  /** Prazo em dias (quando aplicável). */
  prazoDias?: number;
  /** true quando NÃO há cobertura (oxidação / sem garantia). */
  semCobertura: boolean;
  /** O que a garantia cobre (linhas curtas). */
  cobertura: string[];
  /** O que a garantia NÃO cobre (exclusões). */
  exclusoes: string[];
  /** Observação adicional (ex.: texto personalizado). */
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

interface ModeloDef {
  titulo: string;
  cobertura: string[];
}

const MODELOS: Record<string, ModeloDef> = {
  tela: {
    titulo: "Garantia — Troca de tela",
    cobertura: [
      "Tela/touch instalada nesta assistência contra defeitos de funcionamento (falhas de toque, linhas, manchas ou ausência de imagem) não decorrentes de mau uso.",
    ],
  },
  bateria: {
    titulo: "Garantia — Troca de bateria",
    cobertura: [
      "Bateria substituída contra defeito de fabricação (não carrega, descarga anormal, desligamento sem motivo) dentro do prazo.",
    ],
  },
  conector: {
    titulo: "Garantia — Conector de carga",
    cobertura: [
      "Conector/flex de carga substituído contra falha de carregamento não causada por mau uso do cabo ou da fonte.",
    ],
  },
  camera: {
    titulo: "Garantia — Câmera",
    cobertura: [
      "Módulo de câmera substituído contra defeito de captura ou foco que não tenha origem em impacto/queda.",
    ],
  },
  alto_falante: {
    titulo: "Garantia — Alto-falante",
    cobertura: [
      "Alto-falante substituído contra ausência ou distorção de áudio por defeito da peça.",
    ],
  },
  microfone: {
    titulo: "Garantia — Microfone",
    cobertura: [
      "Microfone substituído contra falha de captação de voz por defeito da peça.",
    ],
  },
  software: {
    titulo: "Garantia — Serviço de software",
    cobertura: [
      "Serviço de software executado (atualização, formatação, desbloqueio) contra falha do procedimento realizado.",
      "Não cobre perda de dados, aplicativos, contas ou senhas — a responsabilidade pelo backup é do cliente.",
    ],
  },
};

const SEM_COBERTURA: Record<string, ModeloDef & { motivo: string }> = {
  oxidacao: {
    titulo: "Sem garantia — Oxidação / contato com líquido",
    cobertura: [],
    motivo:
      "O aparelho apresenta sinais de oxidação ou contato com líquido. O reparo é uma TENTATIVA de recuperação e pode apresentar falhas a qualquer momento. Por esse motivo, este serviço é entregue SEM GARANTIA.",
  },
  sem_garantia: {
    titulo: "Sem garantia",
    cobertura: [],
    motivo: "Conforme acordado na abertura desta Ordem de Serviço, este serviço é entregue SEM GARANTIA.",
  },
};

export interface GerarTermoInputV3 {
  modeloId?: string;
  prazoDias?: number;
  /** Texto livre quando o modelo é "personalizado". */
  termoCustom?: string;
}

/** Gera o termo estruturado a partir do modelo/prazo/observação. */
export function gerarTermoGarantiaV3(input: GerarTermoInputV3): TermoGarantiaV3 {
  const modeloId = (input.modeloId ?? "").trim() || "sem_garantia";
  const prazoDias = typeof input.prazoDias === "number" && input.prazoDias > 0 ? input.prazoDias : undefined;
  const custom = (input.termoCustom ?? "").trim();

  // Sem cobertura (oxidação / sem garantia)
  const semDef = SEM_COBERTURA[modeloId];
  if (semDef) {
    return {
      modeloId,
      titulo: semDef.titulo,
      semCobertura: true,
      cobertura: [],
      exclusoes: [],
      observacao: semDef.motivo,
    };
  }

  // Personalizado
  if (modeloId === "personalizado") {
    return {
      modeloId,
      titulo: "Garantia — Personalizada",
      prazoDias,
      semCobertura: false,
      cobertura: custom
        ? [custom]
        : ["Garantia limitada ao serviço/peça descritos nesta Ordem de Serviço."],
      exclusoes: [...EXCLUSOES_COMUNS],
      observacao: undefined,
    };
  }

  // Modelos padrão (ou desconhecido → genérico)
  const def = MODELOS[modeloId];
  if (!def) {
    return {
      modeloId: "desconhecido",
      titulo: "Garantia do serviço",
      prazoDias,
      semCobertura: false,
      cobertura: ["Garantia limitada ao serviço/peça descritos nesta Ordem de Serviço, contra defeito de funcionamento."],
      exclusoes: [...EXCLUSOES_COMUNS],
      observacao: custom || undefined,
    };
  }

  return {
    modeloId,
    titulo: def.titulo,
    prazoDias,
    semCobertura: false,
    cobertura: [...def.cobertura],
    exclusoes: [...EXCLUSOES_COMUNS],
    observacao: custom || undefined,
  };
}

/** Versão em texto corrido (útil para impressão simples / testes / cópia). */
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
