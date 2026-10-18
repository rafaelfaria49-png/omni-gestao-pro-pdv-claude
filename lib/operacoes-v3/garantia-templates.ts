// Compatibilidade Nova OS: preserva templates publicados, sem backfill.
import { GARANTIA_TEMPLATES_BASE_V3, type GarantiaTemplateV3 } from "./garantia-catalogo";
export type { GarantiaTemplateV3 } from "./garantia-catalogo";
export const GARANTIA_TEMPLATES_V3: GarantiaTemplateV3[] = GARANTIA_TEMPLATES_BASE_V3;

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
