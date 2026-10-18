/**
 * Ajuda do Clássico. As diferenças das outras superfícies são intencionais e
 * ficam em `pdv/parity-keymap.ts`; cada superfície mantém seus handlers reais.
 */
export type PdvShortcut = { key: string; desc: string }

export const PDV_KEYMAP: readonly PdvShortcut[] = [
  { key: "F1", desc: "Finalizar / pagamento" },
  { key: "F2", desc: "Buscar / selecionar cliente" },
  { key: "F3", desc: "Buscar produto / serviço" },
  { key: "F4", desc: "Editar quantidade do item selecionado" },
  { key: "F5", desc: "Receber conta (títulos a receber do cliente)" },
  { key: "Delete", desc: "Cancelar item selecionado (ou último do carrinho)" },
  { key: "F6", desc: "Cancelar venda" },
  { key: "F7", desc: "Venda em espera (colocar / retomar)" },
  { key: "F8", desc: "Foco no campo de bipe" },
  { key: "F9", desc: "Receber conta (atalho legado, mesmo fluxo do F5)" },
  { key: "F10", desc: "Desconto (abre pagamento com desconto)" },
  { key: "F12", desc: "Pagamento múltiplo (split em várias formas)" },
  { key: "Insert", desc: "Item avulso (venda de balcão sem cadastro)" },
  { key: "End", desc: "Ajuda de atalhos (este painel)" },
  { key: "ESC", desc: "Fechar modal / limpar busca; fora de campos e modais, remover último item somente no modo rápido" },
  { key: "Ctrl", desc: "Operações avançadas (trocas, contas, fechamento)" },
] as const

/** Inclui descendentes de contenteditable e o foco real, mesmo em eventos globais. */
export function isPdvEditableTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') !== null
}

export function isPdvTyping(e: KeyboardEvent): boolean {
  return isPdvEditableTarget(e.target) || isPdvEditableTarget(document.activeElement)
}

/** Flags locais cobrem os diálogos; o DOM também cobre menus/portais externos. */
export function hasPdvShortcutOverlay(localOpen = false): boolean {
  return localOpen || document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]') !== null
}

export function isPdvRepeatedOrHandled(e: KeyboardEvent): boolean {
  return e.defaultPrevented || e.repeat || e.isComposing
}

/** Um evento já consumido não pode alcançar outro listener ou o campo de busca. */
export function consumePdvShortcut(e: KeyboardEvent): void {
  e.preventDefault()
  e.stopImmediatePropagation()
}
