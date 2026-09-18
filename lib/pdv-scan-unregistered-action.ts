/**
 * Ação do PDV ao bipar um produto NÃO cadastrado (GOAL PDV-SCAN-UNREGISTERED-ACTION-SETTINGS-007).
 *
 * Preferência por loja, server-first (`StoreSettings.printerConfig.pdvScanUnregisteredAction`),
 * aplicada de forma uniforme às superfícies compatíveis (Clássico/Rápido, Assistência/Rápido,
 * Supermercado/Rápido e Venda Completa). Este módulo é puro: nenhuma importação de React,
 * DOM real ou storage — a superfície só age DEPOIS que o fluxo existente (GOAL 005/006)
 * determina "produto não encontrado" para uma consulta scan-like. Match exato, resultados
 * parciais e pesquisa textual válida NUNCA chegam aqui.
 *
 * - `warn_continue`     — comportamento do GOAL 006: feedback inline e campo livre/focado.
 * - `warn_offer_avulso` — mesmo runtime do GOAL 006 + hint de Insert no feedback; Insert abre
 *                         o Item Avulso com o código não encontrado como contexto (quando o
 *                         campo segue vazio — nada digitado depois do miss).
 * - `open_avulso`       — OPT-IN: abre o Item Avulso automaticamente, uma única vez por scan,
 *                         com o código transportado como contexto inicial.
 *
 * DEFAULT = `warn_offer_avulso`: não muda comportamento operacional material além da copy —
 * o runtime (feedback inline, campo vazio/focado, próximo bipe imediato, Insert já abrir
 * Item Avulso) é exatamente o do GOAL 006; a única diferença é o hint e o código
 * pré-preenchido no modal. Autoabertura nunca é default (decisão documentada no relatório).
 */

export type PdvScanUnregisteredAction = "warn_continue" | "warn_offer_avulso" | "open_avulso"

export const PDV_SCAN_UNREGISTERED_ACTIONS: readonly PdvScanUnregisteredAction[] = [
  "warn_continue",
  "warn_offer_avulso",
  "open_avulso",
] as const

/** Default canônico quando a configuração está ausente ou inválida (fail-safe). */
export const DEFAULT_PDV_SCAN_UNREGISTERED_ACTION: PdvScanUnregisteredAction = "warn_offer_avulso"

/**
 * Normaliza o valor bruto (servidor, blob, draft de UI). Qualquer coisa fora dos três
 * valores canônicos — ausente, null, tipado errado, valor legado desconhecido — cai no
 * default: preferência nova nunca quebra o PDV nem ativa autoabertura silenciosa.
 */
export function normalizePdvScanUnregisteredAction(v: unknown): PdvScanUnregisteredAction {
  if (v === "warn_continue" || v === "warn_offer_avulso" || v === "open_avulso") return v
  return DEFAULT_PDV_SCAN_UNREGISTERED_ACTION
}

export type PdvScanUnregisteredPolicy = {
  /** Ação configurada, já normalizada. */
  action: PdvScanUnregisteredAction
  /** Modo B: feedback inline indica que Insert abre o Item Avulso. */
  showInsertHint: boolean
  /** Modos B/C: Insert/abertura do Item Avulso carrega o código do último miss como contexto. */
  offersAvulsoContext: boolean
  /** Modo C: abrir o Item Avulso automaticamente após o miss confirmado. */
  autoOpenAvulso: boolean
}

const POLICIES: Record<PdvScanUnregisteredAction, PdvScanUnregisteredPolicy> = {
  warn_continue: { action: "warn_continue", showInsertHint: false, offersAvulsoContext: false, autoOpenAvulso: false },
  warn_offer_avulso: { action: "warn_offer_avulso", showInsertHint: true, offersAvulsoContext: true, autoOpenAvulso: false },
  open_avulso: { action: "open_avulso", showInsertHint: false, offersAvulsoContext: true, autoOpenAvulso: true },
}

/** Política derivada da ação normalizada — decisão única compartilhada pelas 4 superfícies. */
export function resolvePdvScanUnregisteredPolicy(
  action: unknown,
): PdvScanUnregisteredPolicy {
  return POLICIES[normalizePdvScanUnregisteredAction(action)]
}

/**
 * Guarda da autoabertura (modo C): nenhum Item Avulso automático POR CIMA de outro modal
 * crítico (pagamento, cliente, quantidade, etc.). Mesmo detector do
 * `canAutoFocusPdvBipe`; `doc` injetável para teste sem DOM.
 */
export function hasBlockingPdvDialog(
  doc: Pick<Document, "querySelector"> | null = typeof document === "undefined" ? null : document,
): boolean {
  if (!doc) return false
  return doc.querySelector('[role="dialog"], [role="alertdialog"]') !== null
}
