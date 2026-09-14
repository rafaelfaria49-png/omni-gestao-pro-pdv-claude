/**
 * CAIXA-RESUMO-KPI-VALORES-TRUNCAMENTO-REGRESSION-004 — contrato estrutural (prova por leitura).
 *
 * A faixa de indicadores da CaixaStatusBar (Abertura · Entradas · Saídas · Saldo Atual) mostrava
 * "R$ 17…" porque o bloco de indicadores era o ÚNICO item encolhível de uma linha com identidade e
 * ações `shrink-0`: `min-w-0` + colunas `grid-cols-4` (= repeat(4, minmax(0, 1fr))) + `truncate`
 * nos valores. A correção anterior (PDV-RESUMO-CAIXA-VISUAL-FIX-001, `71b934c`) nunca chegou à
 * main e o sintoma voltou.
 *
 * Este teste trava as invariantes que impedem o corte em qualquer largura:
 * 1. valor: `whitespace-nowrap`, sem `truncate`/ellipsis/overflow/line-clamp/`min-w-0`;
 * 2. rótulo: `whitespace-nowrap`, sem corte;
 * 3. card e grade: sem `min-w-0`/`overflow-hidden` e sem `min-w-<fixo>` (min-width explícito substitui
 *    o mínimo de conteúdo do item — valor longo vaza); colunas sem mínimo zero (`grid-cols-N`);
 * 4. linha da faixa: `flex-wrap` — faltando espaço, a faixa quebra em vez de espremer os valores.
 *
 * A prova renderizada (Playwright em 1920/1600/1366/1280/1024/768) fica na revisão visual do GOAL.
 */
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "caixa-status-bar.tsx"), "utf8")

const KPIS = [
  { label: "Abertura", valor: "formatCurrency(caixa.saldoInicial)" },
  { label: "Entradas", valor: "formatCurrency(entradas)" },
  { label: "Saídas", valor: "formatCurrency(saidas)" },
  { label: "Saldo Atual", valor: "formatCurrency(saldoEsperado)" },
] as const

/** Utilitários que cortam o conteúdo ou deixam o item ser espremido até sumir (com ou sem variante). */
const CORTE =
  /(?:^|\s)(?:[\w-]+:)*(?:truncate|text-ellipsis|text-clip|overflow-hidden|overflow-x-hidden|line-clamp-\d+|min-w-0)(?=\s|$)/

/** `min-w-*` que não seja de conteúdo (`min-w-min`/`max`/`fit`): troca o mínimo de conteúdo por um piso fixo. */
const MIN_WIDTH_FIXO = /(?:^|\s)(?:[\w-]+:)*min-w-(?!(?:min|max|fit)(?:\s|$))\S+/

function countOf(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

/** `className` literal da última tag `<tag className="…">` aberta antes de `index`. */
function classNameBefore(tag: "p" | "div", index: number): { classes: string; start: number } {
  const marker = `<${tag} className="`
  const start = source.lastIndexOf(marker, index)
  if (start < 0) throw new Error(`<${tag} className="…"> não encontrado antes do índice ${index}`)
  const from = start + marker.length
  return { classes: source.slice(from, source.indexOf('"', from)), start }
}

/** Valor → rótulo → card de um indicador, lidos de dentro para fora. */
function kpiNodes(valor: string) {
  const at = source.indexOf(valor)
  const value = classNameBefore("p", at)
  const label = classNameBefore("p", value.start - 1)
  const card = classNameBefore("div", label.start - 1)
  return { at, value, label, card }
}

function kpiGrid() {
  return classNameBefore("div", kpiNodes(KPIS[0].valor).card.start - 1)
}

describe("CaixaStatusBar · valores do resumo nunca truncam (regressão 004)", () => {
  it("cada indicador aparece uma única vez (o contrato mira o bloco certo)", () => {
    for (const { valor } of KPIS) expect(countOf(source, valor), valor).toBe(1)
  })

  it.each(KPIS)("$label: valor completo em uma linha, sem corte", ({ valor }) => {
    const { value } = kpiNodes(valor)
    expect(value.classes).toContain("whitespace-nowrap")
    expect(value.classes).not.toMatch(CORTE)
  })

  it.each(KPIS)("$label: rótulo inteiro e card sem encolher abaixo do conteúdo", ({ label: texto, valor }) => {
    const { at, label, card } = kpiNodes(valor)
    expect(source.slice(label.start, at)).toContain(texto)
    expect(label.classes).toContain("whitespace-nowrap")
    expect(label.classes).not.toMatch(CORTE)
    expect(card.classes).not.toMatch(CORTE)
    expect(card.classes).not.toMatch(MIN_WIDTH_FIXO)
  })

  it("grade dos indicadores: colunas nunca menores que o conteúdo", () => {
    const grid = kpiGrid()
    expect(grid.classes).toMatch(/(?:^|\s)grid(?=\s|$)/)
    expect(grid.classes).not.toMatch(CORTE)
    expect(grid.classes).not.toMatch(MIN_WIDTH_FIXO)
    // `grid-cols-N` do Tailwind = repeat(N, minmax(0, 1fr)): a coluna pode chegar a zero.
    expect(grid.classes).not.toMatch(/(?:^|\s)(?:[\w-]+:)*grid-cols-\d+(?=\s|$)/)
    expect(grid.classes).not.toContain("minmax(0")
    const bloco = source.slice(grid.start, source.indexOf(KPIS[3].valor))
    for (const { label } of KPIS) expect(bloco).toContain(label)
  })

  it("linha da faixa quebra (flex-wrap) em vez de espremer os indicadores", () => {
    const rowAt = source.lastIndexOf("className={cn(", kpiGrid().start)
    const open = source.indexOf('"', rowAt)
    const rowClasses = source.slice(open + 1, source.indexOf('"', open + 1))
    expect(rowClasses).toMatch(/(?:^|\s)flex(?=\s|$)/)
    expect(rowClasses).toContain("flex-wrap")
    expect(rowClasses).not.toMatch(CORTE)
  })
})
