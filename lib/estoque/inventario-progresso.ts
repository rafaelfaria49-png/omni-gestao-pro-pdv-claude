/**
 * INVENTARIO_CONTINUO_V01 — Progresso e saneamento. Núcleo PURO e testável.
 *
 * Camada OPERACIONAL que acompanha uma campanha de inventário ao longo de dias/semanas até a loja
 * inteira ser conferida. NÃO altera o motor de contagem/ajuste — apenas AGREGA e CLASSIFICA dados
 * já produzidos pelo Inventário Assistido (contagens) e pela conciliação dinâmica:
 *
 *   - `percentualConcluido` → quanto do catálogo já foi conferido (0–100).
 *   - `classificarDiaSaneamento` / `agruparSaneamentoPorDia` → timeline "hoje / ontem / semana".
 *
 * Princípios (espelham `inventario-core.ts` / `inventario-conciliacao.ts`):
 *   - PURO: sem Prisma, sem rede, sem efeito colateral. As Server Actions injetam os dados.
 *   - Determinístico: o "agora" é sempre injetável para testes; o dia é o dia-calendário LOCAL.
 *   - Nunca decide ajuste nenhum — é só observabilidade.
 */

/** Percentual de catálogo conferido: 0–100, inteiro arredondado e travado. total 0 → 0. */
export function percentualConcluido(conferidos: number, total: number): number {
  const c = Math.max(0, Math.trunc(Number(conferidos)) || 0)
  const t = Math.trunc(Number(total)) || 0
  if (t <= 0) return 0
  const pct = Math.round((Math.min(c, t) / t) * 100)
  return Math.max(0, Math.min(100, pct))
}

// ─── Timeline de saneamento (hoje / ontem / semana) ─────────────────────────────

export type DiaSaneamento = "hoje" | "ontem" | "semana" | "anterior"

export type TipoEventoSaneamento = "conferido" | "novo" | "reconciliado"

/** Um evento datado do saneamento (produto conferido, novo cadastrado, pendência reconciliada). */
export type EventoSaneamento = {
  em: Date | string
  tipo: TipoEventoSaneamento
}

export type ContadoresSaneamento = {
  /** Produtos do catálogo conferidos (status "encontrado"). */
  conferidos: number
  /** Pendências fechadas cadastrando um produto novo. */
  novos: number
  /** Pendências fechadas associando a um produto existente. */
  reconciliados: number
}

export type SaneamentoPorDia = {
  /** Eventos do dia-calendário de hoje. */
  hoje: ContadoresSaneamento
  /** Eventos do dia-calendário de ontem. */
  ontem: ContadoresSaneamento
  /** Acumulado dos últimos 7 dias-calendário (inclui hoje e ontem). */
  semana: ContadoresSaneamento
}

function inicioDoDiaMs(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function toDate(d: Date | string | null | undefined): Date | null {
  if (d == null) return null
  const dt = d instanceof Date ? d : new Date(d)
  return Number.isNaN(dt.getTime()) ? null : dt
}

/**
 * Diferença em dias-calendário LOCAIS entre `agora` e `em` (0 = mesmo dia, 1 = ontem, …).
 * Futuro (em > agora) devolve número negativo. Datas inválidas → +Infinity (cai em "anterior").
 */
export function diffDiasCalendario(em: Date | string, agora: Date | string): number {
  const a = toDate(agora)
  const e = toDate(em)
  if (!a || !e) return Number.POSITIVE_INFINITY
  return Math.round((inicioDoDiaMs(a) - inicioDoDiaMs(e)) / 86_400_000)
}

/** Classifica um instante em hoje / ontem / semana / anterior (faixas exclusivas). PURO. */
export function classificarDiaSaneamento(em: Date | string, agora: Date | string): DiaSaneamento {
  const d = diffDiasCalendario(em, agora)
  if (!Number.isFinite(d)) return "anterior"
  if (d <= 0) return "hoje"
  if (d === 1) return "ontem"
  if (d <= 6) return "semana"
  return "anterior"
}

const ZERO: ContadoresSaneamento = { conferidos: 0, novos: 0, reconciliados: 0 }

function acumular(acc: ContadoresSaneamento, tipo: TipoEventoSaneamento): void {
  if (tipo === "conferido") acc.conferidos += 1
  else if (tipo === "novo") acc.novos += 1
  else if (tipo === "reconciliado") acc.reconciliados += 1
}

/**
 * Agrupa eventos de saneamento em hoje / ontem / semana (7 dias acumulados). PURO.
 * "semana" é CUMULATIVA: inclui os eventos de hoje e de ontem (faixa de 0 a 6 dias atrás).
 */
export function agruparSaneamentoPorDia(
  eventos: ReadonlyArray<EventoSaneamento>,
  agora: Date | string = new Date(),
): SaneamentoPorDia {
  const hoje = { ...ZERO }
  const ontem = { ...ZERO }
  const semana = { ...ZERO }
  for (const ev of eventos) {
    const d = diffDiasCalendario(ev.em, agora)
    if (!Number.isFinite(d)) continue
    if (d <= 0) acumular(hoje, ev.tipo)
    else if (d === 1) acumular(ontem, ev.tipo)
    if (d >= 0 && d <= 6) acumular(semana, ev.tipo)
  }
  return { hoje, ontem, semana }
}
