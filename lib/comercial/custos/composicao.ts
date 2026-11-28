/**
 * Composição de custo da unidade e indicadores de preço (ADR-0025). Puro.
 *
 * Regras de honestidade:
 * - custo desconhecido NUNCA vira zero: o total fica `null` e `completo = false`;
 * - custo estimado entra no total, mas marca `estimado = true`;
 * - só existe margem bruta / de contribuição ESTIMADA; nunca "lucro líquido" (tributos e
 *   despesas fixas não são conhecidos aqui).
 */
import { statusCustoAquisicao, type CustoCategoria, type CustoOrigem, type CustoStatus } from "./contracts"
import { reaisLegadoParaCentavos } from "./money"

export type LancamentoParaComposicao = {
  id: string
  categoria: CustoCategoria | string
  origem: CustoOrigem | string
  descricao: string
  quantidade: number
  valorCentavos: number | null
  custoStatus: CustoStatus | string
  status: "ativo" | "estornado" | string
}

export type UnidadeParaComposicao = {
  /** Float legado (reais). */
  custoAquisicao: number
  /** "Despesas" digitadas no cadastro legado (reais) — exibidas à parte, nunca somadas duas vezes. */
  despesas: number
  precoVenda: number
}

export type PerfilParaComposicao = {
  custoAquisicaoStatus: CustoStatus | string
  custoAquisicaoJustificativa?: string | null
} | null

export type ComponenteCusto = {
  tipo: "aquisicao" | "despesas_legado" | "lancamento"
  lancamentoId?: string
  categoria?: string
  origem?: string
  descricao: string
  valorCentavos: number | null
  custoStatus: CustoStatus
}

export type ComposicaoCusto = {
  aquisicaoCentavos: number | null
  aquisicaoStatus: CustoStatus
  despesasLegadoCentavos: number
  aplicadoCentavos: number
  porCategoria: Record<string, number>
  desconhecidos: number
  estimados: number
  totalCentavos: number | null
  completo: boolean
  estimado: boolean
  componentes: ComponenteCusto[]
}

function statusOf(s: string): CustoStatus {
  return s === "estimado" || s === "desconhecido" ? s : "conhecido"
}

export function comporCusto(
  unit: UnidadeParaComposicao,
  perfil: PerfilParaComposicao,
  lancamentos: readonly LancamentoParaComposicao[],
): ComposicaoCusto {
  const aquisicaoStatus = statusCustoAquisicao(unit.custoAquisicao, perfil)
  const aquisicaoCentavos = aquisicaoStatus === "desconhecido" ? null : reaisLegadoParaCentavos(unit.custoAquisicao)
  const despesasLegadoCentavos = reaisLegadoParaCentavos(unit.despesas)
  const componentes: ComponenteCusto[] = [
    { tipo: "aquisicao", descricao: "Custo de aquisição", valorCentavos: aquisicaoCentavos, custoStatus: aquisicaoStatus },
  ]
  if (despesasLegadoCentavos > 0) {
    componentes.push({ tipo: "despesas_legado", descricao: "Despesas informadas no cadastro", valorCentavos: despesasLegadoCentavos, custoStatus: "conhecido" })
  }
  let aplicadoCentavos = 0
  let desconhecidos = aquisicaoStatus === "desconhecido" ? 1 : 0
  let estimados = aquisicaoStatus === "estimado" ? 1 : 0
  const porCategoria: Record<string, number> = {}
  for (const l of lancamentos) {
    if (l.status !== "ativo") continue
    const st = statusOf(l.custoStatus)
    componentes.push({ tipo: "lancamento", lancamentoId: l.id, categoria: l.categoria, origem: l.origem, descricao: l.descricao, valorCentavos: st === "desconhecido" ? null : l.valorCentavos, custoStatus: st })
    if (st === "desconhecido" || l.valorCentavos == null) { desconhecidos += 1; continue }
    if (st === "estimado") estimados += 1
    aplicadoCentavos += l.valorCentavos
    porCategoria[l.categoria] = (porCategoria[l.categoria] ?? 0) + l.valorCentavos
  }
  const completo = desconhecidos === 0
  const totalCentavos = completo ? (aquisicaoCentavos ?? 0) + despesasLegadoCentavos + aplicadoCentavos : null
  return {
    aquisicaoCentavos, aquisicaoStatus, despesasLegadoCentavos, aplicadoCentavos, porCategoria,
    desconhecidos, estimados, totalCentavos, completo, estimado: estimados > 0, componentes,
  }
}

export type IndicadoresPreco = {
  precoVendaCentavos: number
  custoTotalCentavos: number | null
  /** preço − custo; null quando o custo é incompleto (não inventa margem). */
  margemBrutaCentavos: number | null
  margemBrutaPercent: number | null
  /** preço − custo − taxas conhecidas (ex.: cartão). Estimativa. */
  margemContribuicaoCentavos: number | null
  /** Menor preço que cobre custo + taxas conhecidas (gerencial, não é regra de venda). */
  precoMinimoCentavos: number | null
  /** custo × (1 + margem alvo), ajustado pelas taxas. */
  precoSugeridoCentavos: number | null
  avisos: string[]
}

/**
 * Indicadores gerenciais. `taxaPercent` = taxas conhecidas sobre o preço (0–50);
 * `margemAlvoPercent` = margem desejada sobre o custo (0–500). Nunca bloqueia direito do consumidor.
 */
export function indicadoresPreco(args: {
  composicao: Pick<ComposicaoCusto, "totalCentavos" | "completo" | "estimado">
  precoVendaCentavos: number
  taxaPercent?: number
  margemAlvoPercent?: number
}): IndicadoresPreco {
  const taxa = Math.min(Math.max(args.taxaPercent ?? 0, 0), 50) / 100
  const alvo = Math.min(Math.max(args.margemAlvoPercent ?? 0, 0), 500) / 100
  const custo = args.composicao.completo ? args.composicao.totalCentavos : null
  const preco = Math.max(0, Math.round(args.precoVendaCentavos))
  const avisos: string[] = []
  if (custo == null) avisos.push("Custo incompleto: há componente desconhecido. Margem não calculada.")
  if (args.composicao.estimado) avisos.push("Há custo estimado: margem é aproximada.")
  avisos.push("Margem bruta não é lucro líquido: tributos e despesas fixas não estão incluídos.")
  const taxas = Math.round(preco * taxa)
  return {
    precoVendaCentavos: preco,
    custoTotalCentavos: custo,
    margemBrutaCentavos: custo == null ? null : preco - custo,
    margemBrutaPercent: custo == null || preco === 0 ? null : Math.round(((preco - custo) / preco) * 10_000) / 100,
    margemContribuicaoCentavos: custo == null ? null : preco - custo - taxas,
    precoMinimoCentavos: custo == null ? null : Math.ceil(custo / (1 - taxa)),
    precoSugeridoCentavos: custo == null ? null : Math.ceil((custo * (1 + alvo)) / (1 - taxa)),
    avisos,
  }
}
