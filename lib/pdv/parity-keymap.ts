/**
 * Keymap dos 4 PDVs oficiais após a política aprovada em N5-B2.
 * Tabela, handlers, ajuda e provas comportamentais evoluem juntos. As diferenças
 * F2/F4/F5/F10 são intencionais; os auditRefs preservam a origem N5-A.
 * Todos os bindings globais bloqueiam repeat, evento consumido e overlays;
 * remoção/limpeza também respeitam o foco em campos editáveis.
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
  { key: "F12", surfaceId: "classic", action: "abre PaymentModal em modo múltiplo (split)", domain: "pagamento-multiplo", gate: { kind: "capability+runtime", key: "sales.paymentMethods", condition: "exige também pdv.multiplePayments; bloqueio com feedback" }, auditRefs: ["A.3", "GAP-P2-03"] },
  { key: "Insert", surfaceId: "classic", action: "abre Item Avulso", domain: "avulso", gate: { kind: "none" }, auditRefs: ["A.3"] },
  { key: "Delete", surfaceId: "classic", action: "remove item selecionado ou o último", domain: "remover-item", gate: { kind: "runtime", condition: "carrinho>0 e fora de input" }, auditRefs: ["A.3"] },
  { key: "End", surfaceId: "classic", action: "abre ajuda de atalhos", domain: "ajuda", gate: { kind: "none" }, auditRefs: ["A.3", "GAP-P3-01"] },
  { key: "Ctrl (keyup)", surfaceId: "classic", action: "abre menu de operações avançadas", domain: "menu", gate: { kind: "none" }, auditRefs: ["A.3"] },
  { key: "Esc", surfaceId: "classic", action: "fecha/limpa contexto; modo-rápido: remove último item", domain: "remover-item", gate: { kind: "runtime", condition: "remoção: isModoRapido, carrinho>0, busca vazia, fora de campos/modais/dropdowns, sem repeat" }, auditRefs: ["A.3"] },

  // ── assistencia (pdv-assistencia-enterprise.tsx: onKeyDown capture) ─────────
  { key: "F1", surfaceId: "assistencia", action: "abre PaymentModal com dinheiro ou 1ª forma ativa", domain: "pagamento", gate: { kind: "capability+runtime", key: "sales.paymentMethods", condition: "gate verificado em openPaymentModal" }, auditRefs: ["A.3"] },
  { key: "F2", surfaceId: "assistencia", action: "toggle picker de cliente", domain: "cliente", gate: CAP("pdv.customerSearch"), auditRefs: ["A.3"] },
  { key: "F3", surfaceId: "assistencia", action: "foca campo de busca", domain: "busca", gate: { kind: "none" }, auditRefs: ["A.3"] },
  { key: "F4", surfaceId: "assistencia", action: "edita quantidade (selecionada ou última)", domain: "quantidade", gate: { kind: "runtime", condition: "carrinho>0" }, auditRefs: ["A.3"] },
  { key: "F5", surfaceId: "assistencia", action: "confirma remoção do item selecionado ou último", domain: "remover-item", gate: { kind: "runtime", condition: "carrinho>0, fora de campos/modais, confirmação consciente" }, auditRefs: ["A.3", "GAP-P2-04"] },
  { key: "F6", surfaceId: "assistencia", action: "remove item selecionado ou último diretamente", domain: "remover-item", gate: { kind: "runtime", condition: "fora de input e carrinho>0" }, auditRefs: ["A.3"] },
  { key: "F7", surfaceId: "assistencia", action: "abre Venda em Espera", domain: "espera", gate: CAP("pdv.heldSales"), auditRefs: ["A.3"] },
  { key: "F8", surfaceId: "assistencia", action: "abre painel de trocas/devoluções", domain: "trocas", gate: { kind: "none" }, auditRefs: ["A.3"] },
  { key: "F9", surfaceId: "assistencia", action: "abre Recebimento de Contas", domain: "recebimento", gate: { kind: "none" }, auditRefs: ["A.3", "GAP-P3-06"] },
  { key: "F10", surfaceId: "assistencia", action: "abre PaymentModal para desconto (estado neutro)", domain: "pagamento", gate: { kind: "capability+runtime", key: "sales.paymentMethods", condition: "fora do modo-rápido; exige carrinho>0 e caixa com sessão" }, auditRefs: ["A.3", "GAP-P3-06"] },
  { key: "F11", surfaceId: "assistencia", action: "toggle fullscreen", domain: "sistema", gate: { kind: "none" }, auditRefs: ["A.3"] },
  { key: "F12", surfaceId: "assistencia", action: "abre PaymentModal em modo múltiplo", domain: "pagamento-multiplo", gate: { kind: "capability+runtime", key: "pdv.multiplePayments", condition: "exige forma 'multiplo' ativa; gate no openPaymentModal" }, auditRefs: ["A.3", "GAP-P2-03"] },
  { key: "Insert", surfaceId: "assistencia", action: "abre Item Avulso", domain: "avulso", gate: { kind: "none" }, auditRefs: ["A.3"] },
  { key: "Delete", surfaceId: "assistencia", action: "remove item selecionado ou o último", domain: "remover-item", gate: { kind: "runtime", condition: "fora de input/modal e carrinho>0" }, auditRefs: ["A.3"] },
  { key: "Ctrl+L", surfaceId: "assistencia", action: "limpar carrinho via AlertDialog", domain: "cancelar-venda", gate: { kind: "runtime", condition: "carrinho>0 e fora de input" }, auditRefs: ["A.3", "GAP-P3-06"] },
  { key: "End", surfaceId: "assistencia", action: "toggle ajuda", domain: "ajuda", gate: { kind: "none" }, auditRefs: ["A.3"] },
  { key: "Esc", surfaceId: "assistencia", action: "fecha/limpa contexto; modo-rápido: remove último item", domain: "remover-item", gate: { kind: "runtime", condition: "remoção: isModoRapido, carrinho>0, busca vazia, fora de campos/modais/dropdowns, sem repeat" }, auditRefs: ["A.3"] },

  // ── supermercado (pdv-supermercado.tsx: onKeyDown capture) ──────────────────
  { key: "F1", surfaceId: "supermercado", action: "pagamento — alias seguro do F2 com quick[0]", domain: "pagamento", gate: { kind: "capability+runtime", key: "sales.paymentMethods", condition: "primeira forma rápida ativa, carrinho>0, caixa com sessão; sem modal/repeat" }, auditRefs: ["A.3", "D-03"] },
  { key: "F2", surfaceId: "supermercado", action: "pagar com quick[0] (1ª forma rápida)", domain: "pagamento-rapido", gate: { kind: "capability+runtime", key: "sales.paymentMethods", condition: "gate verificado em openPaymentModal" }, auditRefs: ["A.3", "GAP-P2-04"] },
  { key: "F3", surfaceId: "supermercado", action: "pagar com quick[1]", domain: "pagamento-rapido", gate: { kind: "capability+runtime", key: "sales.paymentMethods", condition: "gate verificado em openPaymentModal" }, auditRefs: ["A.3"] },
  { key: "F4", surfaceId: "supermercado", action: "pagar com quick[2]", domain: "pagamento-rapido", gate: { kind: "capability+runtime", key: "sales.paymentMethods", condition: "gate verificado em openPaymentModal" }, auditRefs: ["A.3", "GAP-P2-04"] },
  { key: "F7", surfaceId: "supermercado", action: "abre Venda em Espera", domain: "espera", gate: CAP("pdv.heldSales"), auditRefs: ["A.3"] },
  { key: "F8", surfaceId: "supermercado", action: "abre painel de trocas/devoluções", domain: "trocas", gate: { kind: "none" }, auditRefs: ["A.3"] },
  { key: "F9", surfaceId: "supermercado", action: "abre Recebimento (só tecla, sem botão)", domain: "recebimento", gate: { kind: "none" }, auditRefs: ["A.3", "GAP-P3-12"] },
  { key: "F10", surfaceId: "supermercado", action: "abre picker Cliente/CPF (à prazo)", domain: "cliente", gate: CAP("pdv.customerSearch"), auditRefs: ["A.3", "GAP-P2-04"] },
  { key: "F12", surfaceId: "supermercado", action: "abre modal de Pagamento Múltiplo", domain: "pagamento-multiplo", gate: { kind: "capability+runtime", key: "pdv.multiplePayments", condition: "exige formasSupermercado.multiplo" }, auditRefs: ["A.3", "GAP-P2-03"] },
  { key: "Insert", surfaceId: "supermercado", action: "abre Item Avulso (só tecla, sem botão)", domain: "avulso", gate: { kind: "none" }, auditRefs: ["A.3", "GAP-P3-12"] },
  { key: "Esc", surfaceId: "supermercado", action: "fecha/limpa contexto; modo-rápido: remove último item pela política do clique", domain: "remover-item", gate: { kind: "runtime", condition: "remoção: isModoRapido, carrinho>0, busca vazia, fora de campos/modais/dropdowns, sem repeat" }, auditRefs: ["A.3"] },

  // ── venda-completa (venda-completa-enterprise.tsx: handleKeyDown) ───────────
  { key: "F1", surfaceId: "venda-completa", action: "finaliza venda (handleClickFinalize)", domain: "pagamento", gate: { kind: "runtime", condition: "claimSaleFinalizeLock (mutex), cliente, carrinho, total>0" }, auditRefs: ["A.3", "GAP-P2-06"] },
  { key: "F2", surfaceId: "venda-completa", action: "foca busca de cliente; se já há cliente, limpa", domain: "cliente", gate: { kind: "capability+runtime", key: "pdv.customerSearch", condition: "ou já existe cliente selecionado (limpeza)" }, auditRefs: ["A.3", "B-04"] },
  { key: "F3", surfaceId: "venda-completa", action: "foca campo de produto", domain: "busca", gate: { kind: "none" }, auditRefs: ["A.3"] },
  { key: "Insert", surfaceId: "venda-completa", action: "abre Item Avulso", domain: "avulso", gate: { kind: "none" }, auditRefs: ["A.3"] },
  { key: "F7", surfaceId: "venda-completa", action: "abre Venda em Espera", domain: "espera", gate: { kind: "capability+runtime", key: "pdv.heldSales", condition: "sem modal, dropdown, repeat ou finalização em voo" }, auditRefs: ["A.3", "GAP-P3-09"] },
  { key: "End", surfaceId: "venda-completa", action: "toggle ajuda", domain: "ajuda", gate: { kind: "none" }, auditRefs: ["A.3"] },
  { key: "Esc", surfaceId: "venda-completa", action: "fecha ajuda/entrada/modal pertinente", domain: "fechar", gate: { kind: "runtime", condition: "conforme contexto; sem finalização em voo" }, auditRefs: ["A.3"] },
] as const

/** Núcleo convergente segundo o audit (SHORTCUT_PARITY_STATUS núcleo). */
export const CORE_COHERENT_KEYS = ["F1", "F7", "Insert", "Esc"] as const

/** Diferenças de domínio aprovadas em N5-B2, originalmente GAP-P2-04. */
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
 * Notas do runtime N5-B2 e correções das divergências de ajuda extraídas em N5-A.
 */
export const KEYMAP_DOC_NOTES: readonly { key: string; note: string; auditRefs: string[] }[] = [
  {
    key: "F1",
    note: "Supermercado implementa F1 como alias de F2 para a primeira forma rápida ativa, pelos mesmos gates do clique.",
    auditRefs: ["A.3", "D-03"],
  },
  {
    key: "F12",
    note: "Venda Completa não tem F12 — múltiplo só via modal. Matriz N4 cita 'F12 / forma multiplo'; a nomenclatura não se aplica à VC (audit D-03/GAP-P2-04).",
    auditRefs: ["A.3", "D-03", "GAP-P2-04"],
  },
  {
    key: "Espaço/Ctrl+L",
    note: "Classic não anuncia Espaço nem Ctrl+L: não têm handler nesta superfície.",
    auditRefs: ["GAP-P3-02"],
  },
  {
    key: "End",
    note: "Classic anuncia End=ajuda e F1=pagamento.",
    auditRefs: ["GAP-P3-01"],
  },
  {
    key: "F5/F9/Ctrl+L",
    note: "Assistência anuncia F5=remover com confirmação, F9=recebimento e Ctrl+L=limpar com confirmação; F7/Insert/Arrows e F10=desconto no modo padrão aparecem na ajuda.",
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
