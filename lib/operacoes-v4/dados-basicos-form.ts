// ============================================================================
// Operações V4 — Dados básicos da OS · editor PURO ↔ contrato da V3 (slice 3B).
// ----------------------------------------------------------------------------
// Módulo PURO (sem I/O, sem React, sem Prisma). Semeia o editor de "dados básicos"
// da recepção a partir da OS real (reusando `lerDadosBasicosV3`) e mapeia o estado
// do editor para o input da action real `salvarDadosBasicosOSV3`. NÃO persiste,
// NÃO toca estoque/caixa/financeiro. Re-exporta as opções canônicas da V3 p/ a UI.
// ============================================================================

import type { OrdemServico } from "@/types/os";
import {
  LOCAL_FISICO_V3,
  ORIGEM_V3,
  PRIORIDADE_V3,
  lerDadosBasicosV3,
  type NovaOSLocalFisicoV3,
  type NovaOSOrigemV3,
  type OSPrioridade,
  type SalvarDadosBasicosInputV3,
} from "@/lib/operacoes-v3/dados-basicos-model";

export { LOCAL_FISICO_V3, ORIGEM_V3, PRIORIDADE_V3 };
export type { NovaOSLocalFisicoV3, NovaOSOrigemV3, OSPrioridade, SalvarDadosBasicosInputV3 };

/** Estado controlado do editor de dados básicos (campos sempre preenchidos). */
export interface DadosBasicosEditorV4 {
  defeitoRelatado: string;
  prioridade: OSPrioridade;
  origem: NovaOSOrigemV3;
  recebidoPor: string;
  localFisico: NovaOSLocalFisicoV3;
  /** Valor do <input type="datetime-local">: "YYYY-MM-DDTHH:mm" (ou ""). */
  previsaoLocal: string;
  observacoes: string;
}

// ---- Conversão ISO ↔ datetime-local (pura; round-trip estável no mesmo fuso) ----

export function isoToLocalInput(iso: string): string {
  const s = (iso ?? "").trim();
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function localInputToIso(local: string): string {
  const s = (local ?? "").trim();
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
}

/** Semeia o editor a partir da OS real (defaults seguros p/ os selects). */
export function seedDadosBasicos(os: OrdemServico | null | undefined): DadosBasicosEditorV4 {
  const d = lerDadosBasicosV3(os ?? null);
  return {
    defeitoRelatado: d.defeitoRelatado,
    prioridade: d.prioridade || "media",
    origem: d.origem || "balcao",
    recebidoPor: d.recebidoPor,
    localFisico: d.localFisico || "balcao",
    previsaoLocal: isoToLocalInput(d.previsaoEntrega),
    observacoes: d.observacoes,
  };
}

/** Mapeia o editor para o input da action V3 (trim + ISO da previsão). */
export function toDadosBasicosInput(editor: DadosBasicosEditorV4): SalvarDadosBasicosInputV3 {
  return {
    defeitoRelatado: editor.defeitoRelatado.trim(),
    prioridade: editor.prioridade,
    origem: editor.origem,
    recebidoPor: editor.recebidoPor.trim(),
    localFisico: editor.localFisico,
    previsaoEntrega: localInputToIso(editor.previsaoLocal),
    observacoes: editor.observacoes.trim(),
  };
}

/** Patch imutável de um campo do editor. */
export function setDadosBasicos<K extends keyof DadosBasicosEditorV4>(
  editor: DadosBasicosEditorV4,
  key: K,
  value: DadosBasicosEditorV4[K],
): DadosBasicosEditorV4 {
  return { ...editor, [key]: value };
}
