/**
 * RELATORIOS-PRODUTOS-VENDIDOS-REAL-001 — detalhamento por variante (modelo/cor
 * do acessório) de UM produto. Pura, sem Prisma.
 *
 * A variante só existe em `Venda.payload.lines[].accessorySelection` (não há coluna
 * em `ItemVenda`). Só é usada quando é CONFIÁVEL: a soma das quantidades do produto
 * no payload da venda bate com a soma em `ItemVenda` (fonte relacional). Vendas que
 * não batem (ex.: payload antigo, correção posterior) entram no grupo
 * "Sem detalhe confiável" — nunca se inventa variante.
 * Quantidades são BRUTAS: a devolução é registrada por produto, não por variante.
 */
import { readAccessorySelectionForDisplay } from "@/lib/vendas/accessory-selection-readback"
import { normalizarTexto } from "./produtos-vendidos"

export type VendaParaVariantes = {
  payload: unknown
  /** Linhas de `ItemVenda` do produto nesta venda. */
  itens: Array<{ quantidade: number; lineTotal: number }>
}

export type VarianteResumo = {
  chave: string
  rotulo: string
  modelo: string | null
  cor: string | null
  quantidade: number
  receita: number
  /** "variante" = seleção registrada; "sem_variante" = venda confiável sem seleção; "nao_confiavel" = payload diverge. */
  origem: "variante" | "sem_variante" | "nao_confiavel"
}

export const LIMITE_VENDAS_VARIANTES = 2000

const round2 = (n: number) => Math.round(n * 100) / 100

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v)
}

export function agregarVariantes(vendas: VendaParaVariantes[], refs: Iterable<string>) {
  const ids = new Set([...refs].map((r) => r.trim()).filter(Boolean))
  const grupos = new Map<string, VarianteResumo>()
  const somar = (g: Omit<VarianteResumo, "quantidade" | "receita">, quantidade: number, receita: number) => {
    const cur = grupos.get(g.chave) ?? { ...g, quantidade: 0, receita: 0 }
    cur.quantidade += quantidade
    cur.receita += receita
    grupos.set(g.chave, cur)
  }
  const SEM = { chave: "__sem_variante__", rotulo: "Sem modelo/cor registrado", modelo: null, cor: null, origem: "sem_variante" as const }
  const NAO = { chave: "__nao_confiavel__", rotulo: "Sem detalhe confiável", modelo: null, cor: null, origem: "nao_confiavel" as const }

  let quantidadeTotal = 0
  for (const v of vendas) {
    const qtdItens = v.itens.reduce((s, i) => s + (Number.isFinite(i.quantidade) ? i.quantidade : 0), 0)
    const receitaItens = v.itens.reduce((s, i) => s + (Number.isFinite(i.lineTotal) ? i.lineTotal : 0), 0)
    if (qtdItens <= 0) continue
    quantidadeTotal += qtdItens

    const linhasPayload =
      isRecord(v.payload) && Array.isArray(v.payload.lines)
        ? v.payload.lines.filter(
            (l): l is Record<string, unknown> =>
              isRecord(l) && typeof l.inventoryId === "string" && ids.has(l.inventoryId.trim()),
          )
        : []
    const qtdPayload = linhasPayload.reduce(
      (s, l) => s + (typeof l.quantity === "number" && Number.isFinite(l.quantity) && l.quantity > 0 ? l.quantity : 0),
      0,
    )
    if (qtdPayload !== qtdItens) {
      somar(NAO, qtdItens, receitaItens)
      continue
    }
    for (const l of linhasPayload) {
      const qtd = l.quantity as number
      if (!(qtd > 0)) continue
      const receita = (receitaItens * qtd) / qtdItens
      const sel = readAccessorySelectionForDisplay(l)
      if (!sel.hasSelection) {
        somar(SEM, qtd, receita)
        continue
      }
      const modelo = sel.modelLabel?.trim() || null
      const cor = sel.colorLabel?.trim() || null
      const rotulo = [modelo, cor].filter(Boolean).join(" · ") || SEM.rotulo
      somar(
        { chave: `v:${normalizarTexto(modelo)}|${normalizarTexto(cor)}`, rotulo, modelo, cor, origem: "variante" },
        qtd,
        receita,
      )
    }
  }

  const variantes = [...grupos.values()]
    .map((g) => ({ ...g, receita: round2(g.receita) }))
    .sort((a, b) => {
      // Variantes reais primeiro; grupos sem detalhe por último.
      const peso = (o: VarianteResumo["origem"]) => (o === "variante" ? 0 : o === "sem_variante" ? 1 : 2)
      return peso(a.origem) - peso(b.origem) || b.quantidade - a.quantidade || a.rotulo.localeCompare(b.rotulo, "pt-BR")
    })

  return { variantes, quantidadeTotal, vendasAnalisadas: vendas.length }
}
