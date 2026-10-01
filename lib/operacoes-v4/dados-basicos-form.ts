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

// ---- Conversão ISO ↔ datetime-local (T09: fuso explícito da loja) ----------
//
// Fuso canônico da loja (mesmo padrão do repositório: America/Sao_Paulo).
// O <input type="datetime-local"> carrega HORA DE PAREDE da loja; o servidor
// persiste INSTANTE (ISO UTC). A conversão é determinística e não depende do
// fuso da máquina que roda o navegador ou a suíte de testes.

/** Fuso canônico da loja para previsão/entrega. */
export const FUSO_LOJA_V4 = "America/Sao_Paulo" as const;
/** Rótulo exibido junto à previsão para explicitar o fuso aplicado. */
export const FUSO_LOJA_LABEL_V4 = "Horário da loja (America/Sao_Paulo)";

function partesEmFuso(d: Date, timeZone: string): { ano: number; mes: number; dia: number; hora: number; minuto: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const partes = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  return {
    ano: Number(partes.year),
    mes: Number(partes.month),
    dia: Number(partes.day),
    hora: Number(partes.hour),
    minuto: Number(partes.minute),
  };
}

function offsetMinutosEm(timeZone: string, utcMs: number): number {
  const p = partesEmFuso(new Date(utcMs), timeZone);
  return (Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto) - utcMs) / 60000;
}

const LOCAL_INPUT_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** ISO (instante) → "YYYY-MM-DDTHH:mm" em hora de parede do fuso informado. */
export function isoToLocalInputInTZ(iso: string, timeZone: string = FUSO_LOJA_V4): string {
  const s = (iso ?? "").trim();
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  const tz = (timeZone ?? "").trim() || FUSO_LOJA_V4;
  const p = partesEmFuso(d, tz);
  const n = (v: number) => String(v).padStart(2, "0");
  return `${p.ano}-${n(p.mes)}-${n(p.dia)}T${n(p.hora)}:${n(p.minuto)}`;
}

/** "YYYY-MM-DDTHH:mm" (parede no fuso informado) → ISO UTC. */
export function localInputToIsoInTZ(local: string, timeZone: string = FUSO_LOJA_V4): string {
  const s = (local ?? "").trim();
  const m = LOCAL_INPUT_RE.exec(s);
  if (!m) return "";
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  const hora = Number(m[4]);
  const minuto = Number(m[5]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || hora > 23 || minuto > 59) return "";
  const tz = (timeZone ?? "").trim() || FUSO_LOJA_V4;
  const paredeUtc = Date.UTC(ano, mes - 1, dia, hora, minuto);
  let utc = paredeUtc;
  for (let i = 0; i < 2; i += 1) utc = paredeUtc - offsetMinutosEm(tz, utc) * 60000;
  const out = new Date(utc);
  if (Number.isNaN(out.getTime())) return "";
  // Revalida o round-trip (recusa 31/02 e afins normalizados pelo Date.UTC).
  if (isoToLocalInputInTZ(out.toISOString(), tz) !== s) return "";
  return out.toISOString();
}

export function isoToLocalInput(iso: string): string {
  return isoToLocalInputInTZ(iso, FUSO_LOJA_V4);
}

export function localInputToIso(local: string): string {
  return localInputToIsoInTZ(local, FUSO_LOJA_V4);
}

/** Formata a previsão com o fuso explícito ("dd/mm/aaaa HH:mm (America/Sao_Paulo)"). */
export function formatPrevisaoComFuso(iso: string, timeZone: string = FUSO_LOJA_V4): string {
  const s = (iso ?? "").trim();
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  const tz = (timeZone ?? "").trim() || FUSO_LOJA_V4;
  const p = partesEmFuso(d, tz);
  const n = (v: number) => String(v).padStart(2, "0");
  return `${n(p.dia)}/${n(p.mes)}/${p.ano} ${n(p.hora)}:${n(p.minuto)} (${tz})`;
}

/**
 * T10: previsão no passado exige aviso — nunca correção silenciosa.
 * ISO inválido/vazio → false (sem dado, sem aviso).
 */
export function isPrevisaoVencida(iso: string, agora: Date = new Date()): boolean {
  const s = (iso ?? "").trim();
  if (!s) return false;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < agora.getTime();
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

// ---- Intenção tocada (R02 — pura, testável) -------------------------------
//
// Baseline em TERMOS DO SERVIDOR (input × input): campo diferente da base
// entra em `esperados` com o valor antigo. `previsaoEntrega` vazia significa
// "manter" (nunca tocada). Sem baseline, o servidor preserva (modo estrito).

const CAMPOS_DB_TOCAVEIS = [
  "defeitoRelatado",
  "prioridade",
  "origem",
  "localFisico",
  "recebidoPor",
  "observacoes",
] as const;

export function intencaoDadosBasicos(
  input: SalvarDadosBasicosInputV3,
  base: SalvarDadosBasicosInputV3,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of CAMPOS_DB_TOCAVEIS) {
    if ((input[k] ?? "") !== (base[k] ?? "")) out[k] = base[k] ?? "";
  }
  if (input.previsaoEntrega !== "" && input.previsaoEntrega !== base.previsaoEntrega) {
    out.previsaoEntrega = base.previsaoEntrega ?? "";
  }
  return out;
}

/** Patch imutável de um campo do editor. */
export function setDadosBasicos<K extends keyof DadosBasicosEditorV4>(
  editor: DadosBasicosEditorV4,
  key: K,
  value: DadosBasicosEditorV4[K],
): DadosBasicosEditorV4 {
  return { ...editor, [key]: value };
}
