/**
 * Keymap canônico ATUAL dos 4 PDVs oficiais (N5-A, F-02 do audit).
 *
 * EXTRAÇÃO SOMENTE-LEITURA: cada linha descreve o comportamento existente dos
 * handlers `keydown` em HEAD (audit §A.3 + código vivo). Nada aqui decide
 * tecla nova, resolve colisão ou declara fluxo vencedor — GAP-P2-04 permanece
 * registrado. A decisão de produto futura (keymap-base unificado) deve ser
 * aplicada ALTERANDO ESTA TABELA JUNTO com os handlers; os drift guards de
 * `parity-keymap.test.ts` falham se um dos dois mudar sozinho.
 *
 * `domain` é o domínio funcional da ação (normalizado) — só serve para
 * evidenciar colisões objetivamente, não para julgá-las.
 */

import type { OfficialPdvSurfaceId } from "@/lib/pdv/surface-ids"

export type ShortcutGate =
  | { kind: "capability"; key: string }
  | { kind: "capability+runtime"; key: string; condition: string }
  | { kind: "runtime"; condition: string }
  | { kind: "none" }

export type SurfaceShortcut = {
  key: string
  surfaceId: OfficialPdvSurfaceId
  /** Ação atual, na linguagem do código (handler/estado acionado). */
  action: string
  /** Domínio funcional normalizado (cliente, pagamento-rapido, remover-item…). */
  domain: string
  gate: ShortcutGate
  /** Referências do audit canônico (§A.3, GAP-*, P3-*, B-*, D-*). */
  auditRefs: string[]
}

const CAP = (key: string): ShortcutGate => ({ kind: "capability", key })

export const PDV_PARITY_KEYMAP: readonly SurfaceShortcut[] = [
  // ── classic (pdv-classic.tsx: openShellShortcut + efeitos keydown) ──────────
  { key: "F1", surfaceId: "classic", action: "abre PaymentModal (openPaymentFlow null/false)", domain: "pagamento", gate: { kind: "capability+runtime", key: "sales.paymentMethods", condition: "carrinho>0, caixa com sessão, estoque válido" }, auditRefs: ["A.3", "GAP-P2-03"] },
  { key: "F2", surfaceId: "classic", action: "abre busca/seleção de cliente (shell)", domain: "cliente", gate: CAP("pdv.customerSearch"), auditRefs: ["A.3"] },
  { key: "F3", surfaceId: "classic", action: "abre busca de produto (shell)", domain: "busca", gate: { kind: "none" }, auditRefs: ["A.3"] },
  { key: "F4", surfaceId: "classic", action: "edita quantidade da linha selecionada", domain: "quantidade", gate: { kind: "runtime", condition: "linha selecionada" }, auditRefs: ["A.3"] },
  { key: "F5", surfaceId: "classic", action: "abre Recebimento de Contas (shellReceivablesOpen)", domain: "recebimento", gate: { kind: "runtime", condition: "caixa aberto + sessão (senão reconsulta)" }, auditRefs: ["A.3", "GAP-P2-04"] },
  { key: "F6", surfaceId: "classic", action: "abre diálogo Cancelar Venda (limpa tudo ao confirmar)", domain: "cancelar-venda", gate: { kind: "none" }, auditRefs: ["A.3"] },
  { key: "F7", surfaceId: "classic", action: "abre Venda em Espera", domain: "espera", gate: CAP("pdv.heldSales"), auditRefs: ["A.3"] },
  { key: "F8", surfaceId: "classic", action: "foco no campo bipe", domain: "foco", gate: { kind: "none" }, auditRefs: ["A.3"] },
  { key: "F9", surfaceId: "classic", action: "abre Recebimento de Contas (alias legado do F5)", domain: "recebimento", gate: { kind: "runtime", condition: "caixa aberto + sessão (senão reconsulta)" }, auditRefs: ["A.3"] },
  { key: "F10", surfaceId: "classic", action: "abre PaymentModal — alias exato do F1 (desconto no modal)", domain: "pagamento", gate: { kind: "capability+runtime", key: "sales.paymentMethods", condition: "idêntico ao F1" }, auditRefs: ["A.3", "GAP-P2-04", "GAP-P3-03"] },
  { key: "F12", surfaceId: "classic", action: "abre PaymentModal em modo múltiplo (split)", domain: "pagamento-multiplo", gate: { kind: "capability+runtime", key: "sales.paymentMethods", condition: "exige também pdv.multiplePayments; return silencioso (GAP-P2-03)" }, auditRefs: ["A.3", "GAP-P2-03"] },
  { key: "Insert", surfaceId: "classic", action: "abre Item Avulso", domain: "avulso", gate: { kind: "none" }, auditRefs: ["A.3"] },
  { key: "Delete", surfaceId: "classic", action: "remove item selecionado ou o último", domain: "remover-item", gate: { kind: "runtime", condition: "carrinho>0 e fora de input" }, auditRefs: ["A.3"] },
  { key: "End", surfaceId: "classic", action: "abre ajuda de atalhos", domain: "ajuda", gate: { kind: "none" }, auditRefs: ["A.3", "GAP-P3-01"] },
  { key: "Ctrl (keyup)", surfaceId: "classic", action: "abre menu de operações avançadas", domain: "menu", gate: { kind: "none" }, auditRefs: ["A.3"] },
  { key: "Esc", surfaceId: "classic", action: "modo-rápido: remove último item", domain: "remover-item", gate: { kind: "runtime", condition: "isModoRapido e carrinho>0" }, auditRefs: ["A.3"] },

  // ── assistencia (pdv-assistencia-enterprise.tsx: onKeyDown capture) ─────────
  { key: "F1", surfaceId: "assistencia", action: "abre PaymentModal com dinheiro ou 1ª forma ativa", domain: "pagamento", gate: { kind: "capability+runtime", key: "sales.paymentMethods", condition: "gate verificado em openPaymentModal" }, auditRefs: ["A.3"] },
  { key: "F2", surfaceId: "assistencia", action: "toggle picker de cliente", domain: "cliente", gate: CAP("pdv.customerSearch"), auditRefs: ["A.3"] },
  { key: "F3", surfaceId: "assistencia", action: "foca campo de busca", domain: "busca", gate: { kind: "none" }, auditRefs: ["A.3"] },
  { key: "F4", surfaceId: "assistencia", action: "edita quantidade (selecionada ou última)", domain: "quantidade", gate: { kind: "runtime", condition: "carrinho>0" }, auditRefs: ["A.3"] },
  { key: "F5", surfaceId: "assistencia", action: "remove item selecionado ou o último", domain: "remover-item", gate: { kind: "runtime", condition: "fora de input e carrinho>0" }, auditRefs: ["A.3", "GAP-P2-04"] },
  { key: "F6", surfaceId: "assistencia", action: "remove item (redundante com F5)", domain: "remover-item", gate: { kind: "runtime", condition: "fora de input e carrinho>0" }, auditRefs: ["A.3"] },
  { key: "F7", surfaceId: "assistencia", action: "abre Venda em Espera", domain: "espera", gate: CAP("pdv.heldSales"), auditRefs: ["A.3"] },
  { key: "F8", surfaceId: "assistencia", action: "abre painel de trocas/devoluções", domain: "trocas", gate: { kind: "none" }, auditRefs: ["A.3"] },
  { key: "F9", surfaceId: "assistencia", action: "abre Recebimento de Contas", domain: "recebimento", gate: { kind: "none" }, auditRefs: ["A.3", "GAP-P3-06"] },
  { key: "F10", surfaceId: "assistencia", action: "abre PaymentModal para desconto (estado neutro)", domain: "pagamento", gate: { kind: "runtime", condition: "fora do modo-rápido; exige carrinho>0 e caixa aberto" }, auditRefs: ["A.3", "GAP-P3-06"] },
  { key: "F11", surfaceId: "assistencia", action: "toggle fullscreen", domain: "sistema", gate: { kind: "none" }, auditRefs: ["A.3"] },
  { key: "F12", surfaceId: "assistencia", action: "abre PaymentModal em modo múltiplo", domain: "pagamento-multiplo", gate: { kind: "capability+runtime", key: "pdv.multiplePayments", condition: "exige forma 'multiplo' ativa; gate no openPaymentModal" }, auditRefs: ["A.3", "GAP-P2-03"] },
  { key: "Insert", surfaceId: "assistencia", action: "abre Item Avulso", domain: "avulso", gate: { kind: "none" }, auditRefs: ["A.3"] },
  { key: "Delete", surfaceId: "assistencia", action: "remove item selecionado ou o último", domain: "remover-item", gate: { kind: "runtime", condition: "fora de input/modal e carrinho>0" }, auditRefs: ["A.3"] },
  { key: "Ctrl+L", surfaceId: "assistencia", action: "limpar carrinho via AlertDialog", domain: "cancelar-venda", gate: { kind: "runtime", condition: "carrinho>0 e fora de input" }, auditRefs: ["A.3", "GAP-P3-06"] },
  { key: "End", surfaceId: "assistencia", action: "toggle ajuda", domain: "ajuda", gate: { kind: "none" }, auditRefs: ["A.3"] },
  { key: "Esc", surfaceId: "assistencia", action: "modo-rápido: remove último item", domain: "remover-item", gate: { kind: "runtime", condition: "isModoRapido e carrinho>0" }, auditRefs: ["A.3"] },

  // ── supermercado (pdv-supermercado.tsx: onKeyDown capture) ──────────────────
  { key: "F2", surfaceId: "supermercado", action: "pagar com quick[0] (1ª forma rápida)", domain: "pagamento-rapido", gate: { kind: "capability+runtime", key: "sales.paymentMethods", condition: "gate verificado em openPaymentModal" }, auditRefs: ["A.3", "GAP-P2-04"] },
  { key: "F3", surfaceId: "supermercado", action: "pagar com quick[1]", domain: "pagamento-rapido", gate: { kind: "capability+runtime", key: "sales.paymentMethods", condition: "gate verificado em openPaymentModal" }, auditRefs: ["A.3"] },
  { key: "F4", surfaceId: "supermercado", action: "pagar com quick[2]", domain: "pagamento-rapido", gate: { kind: "capability+runtime", key: "sales.paymentMethods", condition: "gate verificado em openPaymentModal" }, auditRefs: ["A.3", "GAP-P2-04"] },
  { key: "F7", surfaceId: "supermercado", action: "abre Venda em Espera", domain: "espera", gate: CAP("pdv.heldSales"), auditRefs: ["A.3"] },
  { key: "F8", surfaceId: "supermercado", action: "abre painel de trocas/devoluções", domain: "trocas", gate: { kind: "none" }, auditRefs: ["A.3"] },
  { key: "F9", surfaceId: "supermercado", action: "abre Recebimento (só tecla, sem botão)", domain: "recebimento", gate: { kind: "none" }, auditRefs: ["A.3", "GAP-P3-12"] },
  { key: "F10", surfaceId: "supermercado", action: "abre picker Cliente/CPF (à prazo)", domain: "cliente", gate: CAP("pdv.customerSearch"), auditRefs: ["A.3", "GAP-P2-04"] },
  { key: "F12", surfaceId: "supermercado", action: "abre modal de Pagamento Múltiplo", domain: "pagamento-multiplo", gate: { kind: "capability+runtime", key: "pdv.multiplePayments", condition: "exige formasSupermercado.multiplo" }, auditRefs: ["A.3", "GAP-P2-03"] },
  { key: "Insert", surfaceId: "supermercado", action: "abre Item Avulso (só tecla, sem botão)", domain: "avulso", gate: { kind: "none" }, auditRefs: ["A.3", "GAP-P3-12"] },
  { key: "Esc", surfaceId: "supermercado", action: "modo-rápido: remove último item", domain: "remover-item", gate: { kind: "runtime", condition: "isModoRapido e carrinho>0" }, auditRefs: ["A.3"] },

  // ── venda-completa (venda-completa-enterprise.tsx: handleKeyDown) ───────────
  { key: "F1", surfaceId: "venda-completa", action: "finaliza venda (handleClickFinalize)", domain: "pagamento", gate: { kind: "runtime", condition: "claimSaleFinalizeLock (mutex), cliente, carrinho, total>0" }, auditRefs: ["A.3", "GAP-P2-06"] },
  { key: "F2", surfaceId: "venda-completa", action: "foca busca de cliente; se já há cliente, limpa", domain: "cliente", gate: { kind: "capability+runtime", key: "pdv.customerSearch", condition: "ou já existe cliente selecionado (limpeza)" }, auditRefs: ["A.3", "B-04"] },
  { key: "F3", surfaceId: "venda-completa", action: "foca campo de produto", domain: "busca", gate: { kind: "none" }, auditRefs: ["A.3"] },
  { key: "Insert", surfaceId: "venda-completa", action: "abre Item Avulso", domain: "avulso", gate: { kind: "none" }, auditRefs: ["A.3"] },
  { key: "F7", surfaceId: "venda-completa", action: "abre Venda em Espera (guard parcial — GAP-P3-09)", domain: "espera", gate: { kind: "capability+runtime", key: "pdv.heldSales", condition: "ignora showItemAvulsoModal/accessoryProduct que anyModalOpen cobre" }, auditRefs: ["A.3", "GAP-P3-09"] },
  { key: "End", surfaceId: "venda-completa", action: "toggle ajuda", domain: "ajuda", gate: { kind: "none" }, auditRefs: ["A.3"] },
  { key: "Esc", surfaceId: "venda-completa", action: "fecha ajuda", domain: "fechar", gate: { kind: "runtime", condition: "helpOpen" }, auditRefs: ["A.3"] },
] as const

/** Núcleo convergente segundo o audit (SHORTCUT_PARITY_STATUS núcleo). */
export const CORE_COHERENT_KEYS = ["F1", "F7", "Insert", "Esc"] as const

/** Teclas nomeadas pelo GAP-P2-04 (decisão de keymap-base pendente). */
export const GAP_P2_04_CONFLICT_KEYS = ["F2", "F4", "F5", "F10"] as const

/**
 * Marcas `≠` da tabela §A.3 do audit (mesma tecla, semântica diferente),
 * por tecla → superfícies marcadas. Fonte: audit, não reinterpretação.
 */
export const A3_COLLISION_MARKS: Readonly<Record<string, readonly OfficialPdvSurfaceId[]>> = {
  F2: ["supermercado"],
  F3: ["supermercado"],
  F4: ["supermercado"],
  F5: ["assistencia"],
  F10: ["supermercado"],
}

/**
 * Notas doc×código registradas pela extração (audit D-03 permite divergência
 * de documentação; aqui ficam congeladas para a decisão futura de keymap).
 */
export const KEYMAP_DOC_NOTES: readonly { key: string; note: string; auditRefs: string[] }[] = [
  {
    key: "F1",
    note: "Tabela A.3 lista F1 no Supermercado como 'pagar quick[0]', mas o handler de keydown do Super não intercepta F1 (só F2/F3/F4/F7/F8/F9/F10/F12/Insert). Código vivo prevalece (precedência §1 do audit).",
    auditRefs: ["A.3", "D-03"],
  },
  {
    key: "F12",
    note: "Venda Completa não tem F12 — múltiplo só via modal. Matriz N4 cita 'F12 / forma multiplo'; a nomenclatura não se aplica à VC (audit D-03/GAP-P2-04).",
    auditRefs: ["A.3", "D-03", "GAP-P2-04"],
  },
  {
    key: "Espaço/Ctrl+L",
    note: "PDV_KEYMAP do Classic lista Espaço=Finalizar e Ctrl+L=Limpar sem handler correspondente (mortos).",
    auditRefs: ["GAP-P3-02"],
  },
  {
    key: "End",
    note: "Help do Classic diz 'F1 ou End' abre ajuda; código: End=ajuda, F1=pagamento.",
    auditRefs: ["GAP-P3-01"],
  },
  {
    key: "F5/F9/Ctrl+L",
    note: "HELP_SHORTCUTS da Assistência omite F5/F7/Insert/Ctrl+L/Arrows e documenta F9=Limpar (runtime F9=Recebimento); mensagem de desconto aponta F7 em vez de F10.",
    auditRefs: ["GAP-P3-06"],
  },
] as const

export function shortcutsForSurface(surfaceId: OfficialPdvSurfaceId): SurfaceShortcut[] {
  return PDV_PARITY_KEYMAP.filter((row) => row.surfaceId === surfaceId)
}

export function shortcutsForKey(key: string): SurfaceShortcut[] {
  return PDV_PARITY_KEYMAP.filter((row) => row.key === key)
}

/**
 * Domínios de ação distintos vinculados à mesma tecla nas superfícies que a
 * prendem. Evidência objetiva de colisão — não decide qual fluxo deve vencer.
 */
export function distinctActionDomains(key: string): { domain: string; surfaces: OfficialPdvSurfaceId[] }[] {
  const byDomain = new Map<string, OfficialPdvSurfaceId[]>()
  for (const row of shortcutsForKey(key)) {
    const surfaces = byDomain.get(row.domain) ?? []
    surfaces.push(row.surfaceId)
    byDomain.set(row.domain, surfaces)
  }
  return [...byDomain.entries()].map(([domain, surfaces]) => ({ domain, surfaces }))
}

/** Teclas (F-keys) presas em ≥1 superfície oficial. */
export function boundShortcutKeys(): string[] {
  return [...new Set(PDV_PARITY_KEYMAP.map((row) => row.key))].sort()
}

/**
 * Chaves de capability envolvidas nos atalhos de uma superfície — conecta a
 * coluna "gate/capability relacionado" exigida pela suite. Gates puramente
 * runtime (sem capability) não entram.
 */
export function capabilityKeysInKeymap(surfaceId: OfficialPdvSurfaceId): string[] {
  const keys = shortcutsForSurface(surfaceId).flatMap((row) => {
    if (row.gate.kind === "capability" || row.gate.kind === "capability+runtime") {
      return [row.gate.key]
    }
    return []
  })
  return [...new Set(keys)].sort()
}

/** Chave de capability declarada por um atalho (null quando gate runtime/none). */
export function capabilityKeyOf(row: SurfaceShortcut): string | null {
  if (row.gate.kind === "capability" || row.gate.kind === "capability+runtime") {
    return row.gate.key
  }
  return null
}
