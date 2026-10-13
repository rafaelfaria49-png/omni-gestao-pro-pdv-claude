// Fachada V3; textos publicados e templates no catálogo canônico.
import { GARANTIA_CATALOGO_V3, type GarantiaModeloCatalogoV3, type GarantiaModeloIdV3, type TermoGarantiaV3 } from "./garantia-catalogo";
export { GARANTIA_CATALOGO_V3, type GarantiaModeloCatalogoV3, type GarantiaModeloIdV3, type TermoGarantiaV3 } from "./garantia-catalogo";

const CATALOGO_POR_ID = new Map<string, GarantiaModeloCatalogoV3>(GARANTIA_CATALOGO_V3.map((m) => [m.id, m]));

/** Modelo do catálogo por id (fallback: personalizado). */
export function garantiaCatalogoV3(id?: string): GarantiaModeloCatalogoV3 {
  return CATALOGO_POR_ID.get((id ?? "").trim()) ?? CATALOGO_POR_ID.get("personalizado")!;
}

export function prazoPadraoGarantiaV3(id?: string): number {
  return garantiaCatalogoV3(id).prazoDiasPadrao;
}

/** Snapshot coerente de modelo e prazo, inclusive para callers sem UI. */
export function normalizarGarantiaPrevistaV3(input: { modeloId: string; prazoDias?: number }): {
  modelo: GarantiaModeloCatalogoV3;
  prazoDias: number;
} {
  if (!CATALOGO_POR_ID.has((input.modeloId ?? "").trim())) throw new Error("Modelo de garantia desconhecido. Confirme um modelo válido.");
  const modelo = garantiaCatalogoV3(input.modeloId);
  if (modelo.semCobertura) return { modelo, prazoDias: 0 };
  const prazo = input.prazoDias;
  return {
    modelo,
    prazoDias: typeof prazo === "number" && Number.isFinite(prazo) && prazo > 0
      ? Math.trunc(prazo) || modelo.prazoDiasPadrao
      : modelo.prazoDiasPadrao,
  };
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
  if (idBruto && !conhecido) return {
    modeloId: "desconhecido", titulo: "Garantia do serviço", semCobertura: false,
    ...(typeof input.prazoDias === "number" && Number.isFinite(input.prazoDias) && input.prazoDias > 0 ? { prazoDias: input.prazoDias } : {}),
    cobertura: custom ? [custom] : [], exclusoes: [], observacao: "Modelo legado não identificado; consulte o registro existente. Nenhum prazo é presumido.",
  };
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
