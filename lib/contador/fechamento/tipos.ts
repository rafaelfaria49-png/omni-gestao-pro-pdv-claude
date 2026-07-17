/**
 * Contador HUB · checklist de fechamento somente leitura (GOAL 007).
 *
 * Contrato puro: estados honestos derivados de evidência. Sem persistência,
 * sem snapshot, sem fechamento real (GOAL 012).
 */

/** Estado de um item do checklist — `nao_disponivel` é legítimo sem evidência. */
export type EstadoChecklistItem = "ok" | "atencao" | "pendente" | "nao_disponivel"

export type ChecklistItemFechamento = Readonly<{
  /** Identificador estável do sinal. */
  id: string
  /** Título curto exibido na UI. */
  titulo: string
  /** Estado honesto do sinal. */
  estado: EstadoChecklistItem
  /** Origem da evidência (tabela/campo/DTO). */
  origem: string
  /** Explicação objetiva do estado. */
  explicacao: string
  /** Evidência numérica/textual opcional (já formatada ou valor bruto serializável). */
  evidencia?: string
}>

export type ContagemChecklist = Readonly<{
  ok: number
  atencao: number
  pendente: number
  nao_disponivel: number
  total: number
}>

/**
 * DTO do checklist de fechamento — 100% derivado em memória do `ContadorDadosReais`.
 * Nunca afirma que a competência está oficialmente pronta ou fechada.
 */
export type ChecklistFechamento = Readonly<{
  competencia: Readonly<{ ano: number; mes: number }>
  itens: readonly ChecklistItemFechamento[]
  contagem: ContagemChecklist
  /**
   * Microcopy fixa: checklist é leitura de sinais, não fechamento oficial.
   */
  disclaimer: string
  /** ISO 8601 do instante usado na montagem (injetável via `agora`). */
  geradoEm: string
}>
