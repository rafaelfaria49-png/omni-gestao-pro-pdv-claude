import type { DadosBasicosEditorV4 } from "./dados-basicos-form";
import type { EntradaEditorV4 } from "./entrada-form";
import type { ChavePendenciaEntradaV4, EstadoPendenciaEntradaV4, PendenciaEntradaV4 } from "./entrada-pendencias";

export const ENTRADA_SECTION_IDS = [
  "dados-basicos",
  "identificacao",
  "seguranca",
  "estado-fisico",
  "checklist",
  "acessorios",
  "fotos",
] as const;

export type EntradaSectionId = (typeof ENTRADA_SECTION_IDS)[number];

export const ENTRADA_GROUP_IDS = ["recepcao", "seguranca-custodia", "inspecao", "evidencias"] as const;

export type EntradaGroupId = (typeof ENTRADA_GROUP_IDS)[number];

export type EntradaSectionMeta = {
  id: EntradaSectionId;
  step: number;
  label: string;
  eyebrow: string;
  description: string;
  canSave: boolean;
};

/** Áreas independentes de complementação (GOAL 004): sem ordem obrigatória. */
export type EntradaGroupMeta = {
  id: EntradaGroupId;
  label: string;
  eyebrow: string;
  description: string;
  sections: readonly EntradaSectionId[];
  canSave: boolean;
};

/** Contratos internos de persistência — a UI navega por grupos, não por estas 7 chaves. */
export const ENTRADA_SECTIONS: readonly EntradaSectionMeta[] = [
  { id: "dados-basicos", step: 1, label: "Dados básicos", eyebrow: "Recepção", description: "Ajustes operacionais da recepção que ainda faltam após a abertura.", canSave: true },
  { id: "identificacao", step: 1, label: "Identificação", eyebrow: "Aparelho", description: "Complete só o identificador que faltou na abertura da OS.", canSave: true },
  { id: "seguranca", step: 2, label: "Acesso", eyebrow: "Credenciais", description: "Acesso temporário necessário para diagnóstico e testes.", canSave: true },
  { id: "estado-fisico", step: 3, label: "Estado físico", eyebrow: "Inspeção", description: "Condição externa do aparelho e avarias observadas.", canSave: true },
  { id: "checklist", step: 3, label: "Checklist", eyebrow: "Testes iniciais", description: "Verificação objetiva das funções do aparelho na entrada.", canSave: true },
  { id: "acessorios", step: 4, label: "Acessórios", eyebrow: "Custódia", description: "Itens entregues junto com o aparelho.", canSave: true },
  { id: "fotos", step: 4, label: "Fotos", eyebrow: "Evidências", description: "Registros fotográficos já vinculados à prova de entrada.", canSave: false },
] as const;

export const ENTRADA_GROUPS: readonly EntradaGroupMeta[] = [
  {
    id: "recepcao",
    label: "Recepção",
    eyebrow: "Recepção e aparelho",
    description: "Dados da abertura já registrados. Confira e complemente só o que faltou.",
    sections: ["dados-basicos", "identificacao"],
    canSave: true,
  },
  {
    id: "seguranca-custodia",
    label: "Segurança",
    eyebrow: "Acesso e custódia",
    description: "Acesso ao aparelho (opcional) e itens recebidos com ele.",
    sections: ["seguranca", "acessorios"],
    canSave: true,
  },
  {
    id: "inspecao",
    label: "Inspeção",
    eyebrow: "Condição e testes",
    description: "Condição física e testes funcionais na entrada.",
    sections: ["estado-fisico", "checklist"],
    canSave: true,
  },
  {
    id: "evidencias",
    label: "Evidências",
    eyebrow: "Fotos e assinatura",
    description: "Evidências adicionais da entrada — opcionais, gravadas na hora pelas próprias ações.",
    sections: ["fotos"],
    canSave: false,
  },
] as const;

export function getEntradaSection(id: EntradaSectionId): EntradaSectionMeta {
  return ENTRADA_SECTIONS.find((section) => section.id === id) ?? ENTRADA_SECTIONS[0];
}

export function getEntradaGroup(id: EntradaGroupId): EntradaGroupMeta {
  return ENTRADA_GROUPS.find((group) => group.id === id) ?? ENTRADA_GROUPS[0];
}

export function previousEntradaSection(id: EntradaSectionId): EntradaSectionId | null {
  const index = ENTRADA_SECTION_IDS.indexOf(id);
  return index > 0 ? ENTRADA_SECTION_IDS[index - 1] : null;
}

export function nextEntradaSection(id: EntradaSectionId): EntradaSectionId | null {
  const index = ENTRADA_SECTION_IDS.indexOf(id);
  return index >= 0 && index < ENTRADA_SECTION_IDS.length - 1 ? ENTRADA_SECTION_IDS[index + 1] : null;
}

export type EntradaSectionCompletion = Record<EntradaSectionId, boolean>;

export function entradaCompletionProgress(completion: EntradaSectionCompletion) {
  return {
    completed: ENTRADA_SECTION_IDS.filter((id) => completion[id]).length,
    total: ENTRADA_SECTION_IDS.length,
  };
}

// ---- Classificação por área (GOAL 004 — pura, derivada da OS real) ---------

/** Blocos de pendência exibidos em cada área da Entrada. */
export const ENTRADA_PENDENCIAS_POR_GRUPO: Record<EntradaGroupId, readonly ChavePendenciaEntradaV4[]> = {
  recepcao: ["dados-basicos", "identificacao"],
  "seguranca-custodia": ["acesso", "acessorios"],
  inspecao: ["estado-fisico", "checklist"],
  evidencias: ["fotos", "assinatura"],
};

export type EntradaGroupStatus = Record<EntradaGroupId, EstadoPendenciaEntradaV4>;

/**
 * Estado de cada área: falta complementar se algum bloco falta; senão
 * registrado se algum bloco tem dado real; senão opcional. Sem OS real
 * (lista vazia), `null` — nada é afirmado.
 */
export function classificarGruposEntradaV4(pendencias: PendenciaEntradaV4[]): EntradaGroupStatus | null {
  if (pendencias.length === 0) return null;
  const porChave = new Map(pendencias.map((p) => [p.chave, p.estado]));
  const out = {} as EntradaGroupStatus;
  for (const id of ENTRADA_GROUP_IDS) {
    const estados = ENTRADA_PENDENCIAS_POR_GRUPO[id]
      .map((chave) => porChave.get(chave))
      .filter((e): e is EstadoPendenciaEntradaV4 => e !== undefined);
    out[id] = estados.includes("falta_complementar")
      ? "falta_complementar"
      : estados.includes("registrado")
        ? "registrado"
        : "opcional";
  }
  return out;
}

/** Área inicial: a primeira com complemento faltando; tudo registrado → Recepção. */
export function primeiraAreaEntradaV4(status: EntradaGroupStatus | null): EntradaGroupId {
  if (!status) return "recepcao";
  return ENTRADA_GROUP_IDS.find((id) => status[id] === "falta_complementar") ?? "recepcao";
}

/** "Entrada já complementada": dado real e nenhuma área com complemento faltando. */
export function entradaComplementadaV4(status: EntradaGroupStatus | null): boolean {
  return status !== null && ENTRADA_GROUP_IDS.every((id) => status[id] !== "falta_complementar");
}

export const ROTULO_ESTADO_ENTRADA_V4: Record<EstadoPendenciaEntradaV4, string> = {
  registrado: "Registrado",
  falta_complementar: "Falta complementar",
  opcional: "Opcional",
};

export function isEntradaGroupDirty(
  id: EntradaGroupId,
  currentEditor: EntradaEditorV4,
  currentBasics: DadosBasicosEditorV4,
  savedEditor: EntradaEditorV4,
  savedBasics: DadosBasicosEditorV4,
): boolean {
  return getEntradaGroup(id).sections.some((section) =>
    isEntradaSectionDirty(section, currentEditor, currentBasics, savedEditor, savedBasics),
  );
}

function snapshot(id: EntradaSectionId, ed: EntradaEditorV4, db: DadosBasicosEditorV4): unknown {
  switch (id) {
    case "dados-basicos": return db;
    case "identificacao": return ed.identificacao;
    case "seguranca": return ed.credenciais;
    case "estado-fisico": return { estadoFisico: ed.estadoFisico, avarias: ed.avarias };
    case "checklist": return ed.checklist;
    case "acessorios": return ed.acessorios;
    case "fotos": return null;
  }
}

export function isEntradaSectionDirty(
  id: EntradaSectionId,
  currentEditor: EntradaEditorV4,
  currentBasics: DadosBasicosEditorV4,
  savedEditor: EntradaEditorV4,
  savedBasics: DadosBasicosEditorV4,
): boolean {
  return JSON.stringify(snapshot(id, currentEditor, currentBasics)) !== JSON.stringify(snapshot(id, savedEditor, savedBasics));
}
