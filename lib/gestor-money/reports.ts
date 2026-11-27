import type {
  CentavosString,
  ConsultaFinanceiraSnapshot,
  EventoFinanceiroResumo,
} from "./contracts"
import {
  formatarCentavosBRL,
  formatarDataBR,
  parseBigIntCentavos,
  percentualCentavos,
  somarCentavos,
  subtrairCentavos,
  variacaoPercentual,
} from "./money"

export type GranularidadeRelatorio = "diario" | "semanal" | "mensal" | "periodo"

export interface SerieRelatorioPonto {
  chave: string
  label: string
  receitaCentavos: CentavosString
  despesaCentavos: CentavosString
  resultadoCentavos: CentavosString
  quantidade: number
}

export interface RelatorioPorContaLinha {
  carteiraId: string
  nome: string
  tipo: string
  entradasCentavos: CentavosString
  saidasCentavos: CentavosString
  saldoCentavos: CentavosString
  quantidade: number
}

export interface RelatorioPorCategoriaLinha {
  categoriaId: string | null
  categoria: string
  cor: string
  despesaCentavos: CentavosString
  receitaCentavos: CentavosString
  quantidade: number
  participacaoDespesa: number
}

export interface RelatorioComparativoResumo {
  receitaAtualCentavos: CentavosString
  receitaAnteriorCentavos: CentavosString
  variacaoReceitaPct: number | null
  despesaAtualCentavos: CentavosString
  despesaAnteriorCentavos: CentavosString
  variacaoDespesaPct: number | null
  resultadoAtualCentavos: CentavosString
  resultadoAnteriorCentavos: CentavosString
  variacaoResultadoPct: number | null
}

export interface RelatorioProjetado {
  granularidade: GranularidadeRelatorio
  dataInicio: string
  dataFim: string
  totalReceitasCentavos: CentavosString
  totalDespesasCentavos: CentavosString
  resultadoCentavos: CentavosString
  quantidadeRegistros: number
  serieTemporal: SerieRelatorioPonto[]
  porCategoria: RelatorioPorCategoriaLinha[]
  porConta: RelatorioPorContaLinha[]
  comparativo: RelatorioComparativoResumo
  eventosFiltrados: EventoFinanceiroResumo[]
}

function inicioSemanaISO(dia: string): string {
  const d = new Date(`${dia}T00:00:00.000Z`)
  if (!Number.isFinite(d.getTime())) return dia
  const day = d.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().slice(0, 10)
}

function labelMes(ym: string): string {
  const nomes = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
  const [y, m] = ym.split("-")
  const idx = Number(m) - 1
  return `${nomes[idx] ?? m}/${y?.slice(2) ?? ""}`
}

/**
 * Projeção puramente de leitura/apresentação sobre o snapshot já retornado pelo gateway.
 * Não cria motor contábil paralelo; preserva base CAIXA_REALIZADO e centavos exatos.
 */
export function projetarRelatorioFinanceiro(
  snapshot: ConsultaFinanceiraSnapshot,
  params: {
    granularidade: GranularidadeRelatorio
    dataInicio: string
    dataFim: string
    carteiraId?: string
    categoriaId?: string
  }
): RelatorioProjetado {
  const { granularidade, dataInicio, dataFim, carteiraId, categoriaId } = params

  const eventosFiltrados = snapshot.eventos.filter((ev) => {
    if (ev.transferencia) return false
    if (ev.dia < dataInicio || ev.dia > dataFim) return false
    if (carteiraId && carteiraId !== "todas" && ev.carteiraId !== carteiraId) return false
    if (categoriaId && categoriaId !== "todas" && ev.categoriaId !== categoriaId) return false
    return true
  })

  const totalReceitasCentavos = somarCentavos(eventosFiltrados.map((e) => e.receitaCentavos))
  const totalDespesasCentavos = somarCentavos(eventosFiltrados.map((e) => e.despesaCentavos))
  const resultadoCentavos = subtrairCentavos(totalReceitasCentavos, totalDespesasCentavos)

  // Série temporal agrupada por granularidade
  const buckets = new Map<string, { label: string; receita: bigint; despesa: bigint; count: number }>()

  if (granularidade === "mensal") {
    for (const ponto of snapshot.evolucaoMensal) {
      buckets.set(ponto.mes, {
        label: ponto.label,
        receita: parseBigIntCentavos(ponto.receitaCentavos),
        despesa: parseBigIntCentavos(ponto.despesaCentavos),
        count: 0,
      })
    }
    for (const ev of eventosFiltrados) {
      const key = ev.dia.slice(0, 7)
      const existing = buckets.get(key)
      if (existing) {
        existing.count += 1
      } else {
        buckets.set(key, {
          label: labelMes(key),
          receita: parseBigIntCentavos(ev.receitaCentavos),
          despesa: parseBigIntCentavos(ev.despesaCentavos),
          count: 1,
        })
      }
    }
  } else {
    for (const ev of eventosFiltrados) {
      const key = granularidade === "semanal" ? inicioSemanaISO(ev.dia) : ev.dia
      const label =
        granularidade === "semanal"
          ? `Sem. ${formatarDataBR(key).slice(0, 5)}`
          : formatarDataBR(key).slice(0, 5)
      const current = buckets.get(key) ?? { label, receita: BigInt(0), despesa: BigInt(0), count: 0 }
      current.receita += parseBigIntCentavos(ev.receitaCentavos)
      current.despesa += parseBigIntCentavos(ev.despesaCentavos)
      current.count += 1
      buckets.set(key, current)
    }
  }

  const serieTemporal: SerieRelatorioPonto[] = [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([chave, b]) => ({
      chave,
      label: b.label,
      receitaCentavos: b.receita.toString(),
      despesaCentavos: b.despesa.toString(),
      resultadoCentavos: (b.receita - b.despesa).toString(),
      quantidade: b.count,
    }))

  // Quebra por categoria
  const catColors = new Map(snapshot.categorias.map((c) => [c.id, c.cor]))
  const catMap = new Map<
    string,
    { categoriaId: string | null; categoria: string; cor: string; despesa: bigint; receita: bigint; count: number }
  >()
  for (const ev of eventosFiltrados) {
    const key = ev.categoriaId ?? "__sem_categoria__"
    const item = catMap.get(key) ?? {
      categoriaId: ev.categoriaId,
      categoria: ev.categoria || "Sem categoria",
      cor: (ev.categoriaId ? catColors.get(ev.categoriaId) : undefined) ?? "#64748b",
      despesa: BigInt(0),
      receita: BigInt(0),
      count: 0,
    }
    item.despesa += parseBigIntCentavos(ev.despesaCentavos)
    item.receita += parseBigIntCentavos(ev.receitaCentavos)
    item.count += 1
    catMap.set(key, item)
  }

  const porCategoria: RelatorioPorCategoriaLinha[] = [...catMap.values()]
    .map((item) => ({
      categoriaId: item.categoriaId,
      categoria: item.categoria,
      cor: item.cor,
      despesaCentavos: item.despesa.toString(),
      receitaCentavos: item.receita.toString(),
      quantidade: item.count,
      participacaoDespesa: percentualCentavos(item.despesa, totalDespesasCentavos),
    }))
    .sort((a, b) => Number(parseBigIntCentavos(b.despesaCentavos) - parseBigIntCentavos(a.despesaCentavos)))

  // Quebra por conta
  const porConta: RelatorioPorContaLinha[] = snapshot.contas
    .filter((c) => !carteiraId || carteiraId === "todas" || c.id === carteiraId)
    .map((conta) => {
      const movs = eventosFiltrados.filter((e) => e.carteiraId === conta.id)
      const entradas = somarCentavos(movs.map((m) => m.receitaCentavos))
      const saidas = somarCentavos(movs.map((m) => m.despesaCentavos))
      return {
        carteiraId: conta.id,
        nome: conta.nome,
        tipo: conta.tipo,
        entradasCentavos: entradas,
        saidasCentavos: saidas,
        saldoCentavos: conta.saldoCentavos,
        quantidade: movs.length,
      }
    })

  // Comparativo (mês atual vs mês anterior — G005)
  const recAtual = snapshot.comparativos.receitaMesAtualCentavos
  const recAnt = snapshot.comparativos.receitaMesAnteriorCentavos
  const despAtual = snapshot.comparativos.despesaMesAtualCentavos
  const despAnt = snapshot.comparativos.despesaMesAnteriorCentavos
  const resAtual = subtrairCentavos(recAtual, despAtual)
  const resAnt = subtrairCentavos(recAnt, despAnt)

  return {
    granularidade,
    dataInicio,
    dataFim,
    totalReceitasCentavos,
    totalDespesasCentavos,
    resultadoCentavos,
    quantidadeRegistros: eventosFiltrados.length,
    serieTemporal,
    porCategoria,
    porConta,
    comparativo: {
      receitaAtualCentavos: recAtual,
      receitaAnteriorCentavos: recAnt,
      variacaoReceitaPct: variacaoPercentual(recAtual, recAnt),
      despesaAtualCentavos: despAtual,
      despesaAnteriorCentavos: despAnt,
      variacaoDespesaPct: variacaoPercentual(despAtual, despAnt),
      resultadoAtualCentavos: resAtual,
      resultadoAnteriorCentavos: resAnt,
      variacaoResultadoPct: variacaoPercentual(resAtual, resAnt),
    },
    eventosFiltrados,
  }
}

export function gerarCsvRelatorio(
  snapshot: ConsultaFinanceiraSnapshot,
  relatorio: RelatorioProjetado
): string {
  const headerLines = [
    `# Gestor Money · Relatorio Financeiro (${snapshot.proveniencia})`,
    `# Perfil: ${snapshot.perfil.nomeExibicao} (${snapshot.perfil.tipo})`,
    `# Base: ${snapshot.base} | Moeda: ${snapshot.moeda} | Fuso: ${snapshot.timezone}`,
    `# Periodo: ${relatorio.dataInicio} a ${relatorio.dataFim}`,
    "Data;Descricao;Categoria;Conta;Tipo;Valor;Contraparte",
  ]
  const rows = relatorio.eventosFiltrados.map((ev) => {
    const clean = (s: string) => `"${s.replace(/"/g, '""')}"`
    return [
      formatarDataBR(ev.dia),
      clean(ev.descricao),
      clean(ev.categoria),
      clean(ev.carteiraNome),
      ev.tipo === "entrada" ? "Receita" : "Despesa",
      clean(formatarCentavosBRL(ev.valorCentavos)),
      clean(ev.contraparte || ""),
    ].join(";")
  })
  return [...headerLines, ...rows].join("\n")
}
