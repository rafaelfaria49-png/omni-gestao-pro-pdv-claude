import { SETTINGS_SECTIONS, type SectionId } from "./sections";

const SECTION_IDS = new Set<SectionId>(SETTINGS_SECTIONS.map((s) => s.id));

export function isSectionId(value: string): value is SectionId {
  return SECTION_IDS.has(value as SectionId);
}

/** Query `sec` → aba válida ou `geral`. */
export function parseSectionFromSearchParam(raw: string | null | undefined): SectionId {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v && isSectionId(v)) return v;
  return "geral";
}

const CONFIG_PATH = "/dashboard/configuracoes";

/** URL interna com deep-link `?sec=` (sem reload). */
export function configuracoesSectionHref(id: SectionId): string {
  return `${CONFIG_PATH}?sec=${encodeURIComponent(id)}`;
}
