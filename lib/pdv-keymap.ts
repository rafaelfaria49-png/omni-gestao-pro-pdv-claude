/**
 * Keymap-base compartilhado dos PDVs — fonte única dos atalhos canônicos.
 *
 * Referência = PDV Clássico (shell omni-smart), o mais completo. Por enquanto cada
 * PDV mantém seu próprio handler de `keydown`; este módulo é a BASE para adoção
 * incremental (sem reescrever os PDVs) — começando pela ajuda de atalhos do Clássico.
 *
 * Próximo passo da convergência: supermercado/assistência/black migrarem seus
 * keydowns para despachar a partir deste mapa (não feito aqui para não reescrever).
 */
export type PdvShortcut = { key: string; desc: string }

export const PDV_KEYMAP: readonly PdvShortcut[] = [
  { key: "F1", desc: "Finalizar / pagamento" },
  { key: "F2", desc: "Buscar / selecionar cliente" },
  { key: "F3", desc: "Buscar produto / serviço" },
  { key: "F4", desc: "Editar quantidade do item selecionado" },
  { key: "F5", desc: "Cancelar item selecionado" },
  { key: "F6", desc: "Cancelar venda" },
  { key: "F7", desc: "Venda em espera (colocar / retomar)" },
  { key: "F9", desc: "Contas a receber" },
  { key: "F10", desc: "Desconto (abre pagamento com desconto)" },
  { key: "F12", desc: "Pagamento múltiplo (split em várias formas)" },
  { key: "Insert", desc: "Item avulso (venda de balcão sem cadastro)" },
  { key: "End", desc: "Ajuda de atalhos (este painel)" },
  { key: "Espaço", desc: "Finalizar venda" },
  { key: "ESC", desc: "Fechar modal / remover último item (modo rápido)" },
  { key: "Ctrl", desc: "Operações avançadas (trocas, contas, fechamento)" },
] as const
