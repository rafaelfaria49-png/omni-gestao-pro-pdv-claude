/** Projeções de compatibilidade do HUB; autoridade monetária única em gastos/query. */
import { gestorMoneyAtivo } from "@/lib/gastos/ativacao"
import * as legado from "@/lib/financeiro/legado-main/relatorios-financeiros"
import { consultarFinanceiroEmpresa, reaisConsulta, filtroConsultaFinanceira, type ConsultaFinanceiraDTO } from "@/lib/gastos/query"
import { diaNoFusoConsulta, deslocarDiaConsulta, dataCivilConsulta, ConsultaFinanceiraError } from "@/lib/gastos/query-calculo"
import { safeMoney } from "@/lib/financeiro/contracts/valores"
import { isOrigemTransferenciaInterna, isOrigemEstornoPagar, isOrigemEstornoReceber, isOrigemDevolucaoPdv } from "./movimentacao-financeira-classify"
type MovLin = { tipo: string; origem: string | null; valor: number; descricao?: string | null; createdAt?: Date }

/** Receita/despesa líquidas alinhadas ao DRE (FASE 13): devoluções e estornos de recebimento abatem receita; estorno de pagamento abate despesa; transferências ignoradas. */
export function reduceNetResultadoMovs(rows: MovLin[]): { receita: number; despesa: number; qtdEntradasBrutas: number } {
  let receita = 0
  let despesa = 0
  let qtdEntradasBrutas = 0
  for (const m of rows) {
    const o = m.origem ?? ""
    const v = safeMoney(m.valor)
    if (isOrigemTransferenciaInterna(o)) continue

    if (m.tipo === "entrada") {
      if (isOrigemEstornoPagar(o)) {
        despesa = safeMoney(despesa - v)
        continue
      }
      receita = safeMoney(receita + v)
      qtdEntradasBrutas++
      continue
    }
    if (m.tipo === "saida") {
      if (isOrigemEstornoReceber(o) || isOrigemDevolucaoPdv(o)) {
        receita = safeMoney(receita - v)
        continue
      }
      despesa = safeMoney(despesa + v)
    }
  }
  return { receita, despesa, qtdEntradasBrutas }
}


export type PeriodoFiltro = {
  dataInicio?: string // yyyy-mm-dd
  dataFim?: string    // yyyy-mm-dd
  carteiraId?: string
  categoriaId?: string
  categoriaNome?: string
}

export type CategoriaLinha = {
  categoria: string
  total: number
  percentual: number
  qtd: number
  media: number
  crescimento?: number
}

export type RankingItem = {
  label: string
  valor: number
  percentual: number
  tipo: "entrada" | "saida"
}

export type IndicadoresExecutivos = {
  apuracao: ReturnType<typeof apuracaoConsulta>
  receitaTotal: number
  despesaTotal: number
  lucroLiquido: number
  margemLiquida: number
  ticketMedio: number
  saldoConsolidado: number
  crescimentoMensal: number
  crescimentoAnual: number
  inadimplencia: number
  receberPendente: number
  pagarPendente: number
  maiorDespesa: { descricao: string; valor: number } | null
  maiorCategoriaReceita: string | null
  carteiraTop: { nome: string; saldo: number } | null
}

export type ResumoExecutivo = {
  apuracao: Pick<ConsultaFinanceiraDTO, "base" | "timezone" | "moeda" | "asOf" | "versaoCalculo" | "criterios" | "semCarteira">
  periodo: { dataInicio: string; dataFim: string; dias: number }
  indicadores: IndicadoresExecutivos
  receitasPorCategoria: CategoriaLinha[]
  despesasPorCategoria: CategoriaLinha[]
  topReceitas: RankingItem[]
  topDespesas: RankingItem[]
}

export type FluxoPeriodo = {
  periodo: string
  label: string
  entrada: number
  saida: number
  saldo: number
  acumulado: number
}

export type ComparativoMensal = {
  asOf: string
  mes: string
  mesLabel: string
  ano: number
  entrada: number
  saida: number
  lucro: number
  margem: number
}

export type ComparativoAnual = {
  asOf: string
  ano: number
  entrada: number
  saida: number
  lucro: number
  margem: number
  crescimento: number
}

export type AnaliseCarteira = {
  id: string
  nome: string
  tipo: string
  saldoAtual: number
  saldoInicial: number
  totalEntradas: number
  totalSaidas: number
  qtdMovimentacoes: number
  participacao: number
}


function pct(v: number, base: number) { return base ? safeMoney(v / base * 100) : 0 }
function crescimento(a: string, b: string) { return BigInt(b) > BigInt(0) ? pct(reaisConsulta(a) - reaisConsulta(b), reaisConsulta(b)) : 0 }
export function projetarIndicadoresConsulta(q: ConsultaFinanceiraDTO): IndicadoresExecutivos {
  const receitaTotal = reaisConsulta(q.receitaRealizadaCentavos), despesaTotal = reaisConsulta(q.despesaRealizadaCentavos)
  const lucroLiquido = reaisConsulta(q.resultadoCentavos)
  const entradas = new Set(q.eventos.filter(e => BigInt(e.receitaCentavos) > BigInt(0)).map(e => e.movimentoId)).size
  const maior = q.eventos.filter(e => BigInt(e.despesaCentavos) > BigInt(0)).sort((a,b) => Number(BigInt(b.despesaCentavos) - BigInt(a.despesaCentavos)))[0]
  const topConta = q.contas.filter(c => c.ativo && c.tipo !== "credito").sort((a,b) => Number(BigInt(b.saldoCentavos) - BigInt(a.saldoCentavos)))[0]
  const hoje = diaNoFusoConsulta(new Date(q.asOf))
  const vencido = q.receber.filter(t => { try { return dataCivilConsulta(t.vencimento) < hoje } catch { return false } }).reduce((s,t) => s + BigInt(t.restanteCentavos), BigInt(0))
  const denom = q.receber.reduce((s,t) => s + (t.cancelado ? BigInt(0) : BigInt(t.valorCentavos)), BigInt(0))
  return { apuracao: apuracaoConsulta(q), receitaTotal, despesaTotal, lucroLiquido, margemLiquida: pct(lucroLiquido, receitaTotal), ticketMedio: entradas ? safeMoney(receitaTotal / entradas) : 0,
    saldoConsolidado: reaisConsulta(q.saldoCentavos), receberPendente: reaisConsulta(q.receberAbertoCentavos), pagarPendente: reaisConsulta(q.pagarAbertoCentavos),
    crescimentoMensal: crescimento(q.comparativos.receitaMesAtualCentavos, q.comparativos.receitaMesAnteriorCentavos),
    crescimentoAnual: crescimento(q.comparativos.receitaAnoAtualCentavos, q.comparativos.receitaAnoAnteriorCentavos), inadimplencia: pct(reaisConsulta(vencido), reaisConsulta(denom)),
    maiorDespesa: maior ? { descricao: maior.descricao, valor: reaisConsulta(maior.despesaCentavos) } : null,
    maiorCategoriaReceita: [...q.porCategoria].sort((a,b) => Number(BigInt(b.receitaCentavos) - BigInt(a.receitaCentavos)))[0]?.categoria ?? null,
    carteiraTop: topConta ? { nome: topConta.nome, saldo: reaisConsulta(topConta.saldoCentavos) } : null }
}
function categorias(q: ConsultaFinanceiraDTO, tipo: "receitaCentavos" | "despesaCentavos"): CategoriaLinha[] {
  const total = reaisConsulta(tipo === "receitaCentavos" ? q.receitaRealizadaCentavos : q.despesaRealizadaCentavos)
  return q.porCategoria.filter(c => BigInt(c[tipo]) !== BigInt(0)).map(c => ({ categoria: c.categoria, total: reaisConsulta(c[tipo]), percentual: pct(reaisConsulta(c[tipo]), Math.abs(total)), qtd: c.quantidade, media: c.quantidade ? safeMoney(reaisConsulta(c[tipo]) / c.quantidade) : 0 })).sort((a,b) => b.total-a.total)
}
export function projetarRankingConsulta(q: ConsultaFinanceiraDTO, tipo: "receitaCentavos" | "despesaCentavos", take: number): RankingItem[] {
  const total = reaisConsulta(tipo === "receitaCentavos" ? q.receitaRealizadaCentavos : q.despesaRealizadaCentavos)
  return q.eventos.filter(e => BigInt(e[tipo]) !== BigInt(0)).map(e => ({ label: e.descricao, valor: reaisConsulta(e[tipo]), percentual: pct(reaisConsulta(e[tipo]), Math.abs(total)), tipo: tipo === "receitaCentavos" ? "entrada" as const : "saida" as const })).sort((a,b) => b.valor-a.valor).slice(0,take)
}
export async function getIndicadoresExecutivos(storeId: string, filtro: PeriodoFiltro = {}) { if (!gestorMoneyAtivo()) return legado.getIndicadoresExecutivos(storeId, filtro); return projetarIndicadoresConsulta(await consultarFinanceiroEmpresa(storeId, filtro)) }
export async function getResultadoPorCategoria(storeId: string, filtro: PeriodoFiltro = {}) { if (!gestorMoneyAtivo()) return legado.getResultadoPorCategoria(storeId, filtro);
  const q = await consultarFinanceiroEmpresa(storeId, filtro)
  return { receitas: categorias(q, "receitaCentavos"), despesas: categorias(q, "despesaCentavos") }
}
export async function getTopReceitas(storeId: string, filtro: PeriodoFiltro = {}, take = 10) { if (!gestorMoneyAtivo()) return legado.getTopReceitas(storeId, filtro, take); return projetarRankingConsulta(await consultarFinanceiroEmpresa(storeId, filtro), "receitaCentavos", take) }
export async function getTopDespesas(storeId: string, filtro: PeriodoFiltro = {}, take = 10) { if (!gestorMoneyAtivo()) return legado.getTopDespesas(storeId, filtro, take); return projetarRankingConsulta(await consultarFinanceiroEmpresa(storeId, filtro), "despesaCentavos", take) }
export function projetarFluxoConsulta(q: ConsultaFinanceiraDTO, agrupamento: "dia" | "semana" | "mes" = "dia"): FluxoPeriodo[] {
  const buckets = new Map<string, { entrada: bigint; saida: bigint }>()
  for (const e of q.eventos) {
    if (e.transferencia) continue
    const date = new Date(e.dia + "T12:00:00Z")
    const key = agrupamento === "mes" ? e.dia.slice(0,7) : agrupamento === "semana" ? deslocarDiaConsulta(e.dia, -date.getUTCDay()) : e.dia
    const b = buckets.get(key) ?? { entrada: BigInt(0), saida: BigInt(0) }
    // Fluxo físico é distinto do resultado líquido: devolução entra/saí na direção real.
    b[e.tipo === "entrada" ? "entrada" : "saida"] += BigInt(e.valorCentavos)
    buckets.set(key,b)
  }
  let acumulado = BigInt(0)
  return [...buckets].sort(([a],[b]) => a.localeCompare(b)).map(([periodo,b]) => {
    const saldo = b.entrada-b.saida; acumulado += saldo
    return { periodo, label: periodo, entrada: reaisConsulta(b.entrada), saida: reaisConsulta(b.saida), saldo: reaisConsulta(saldo), acumulado: reaisConsulta(acumulado) }
  })
}
export async function getFluxoPorPeriodo(storeId: string, filtro: PeriodoFiltro = {}, agrupamento: "dia" | "semana" | "mes" = "dia") { if (!gestorMoneyAtivo()) return legado.getFluxoPorPeriodo(storeId, filtro, agrupamento); return projetarFluxoConsulta(await consultarFinanceiroEmpresa(storeId, filtro), agrupamento) }
export function apuracaoConsulta(q: ConsultaFinanceiraDTO) {
  return { base:q.base, timezone:q.timezone, moeda:q.moeda, asOf:q.asOf, versaoCalculo:q.versaoCalculo, criterios:q.criterios, semCarteira:q.semCarteira }
}
export function projetarAnaliseCarteirasConsulta(q: ConsultaFinanceiraDTO): AnaliseCarteira[] {
  return q.contas.filter(c => c.ativo).map(c => ({ id: c.id, nome: c.nome, tipo: c.tipo, saldoAtual: reaisConsulta(c.saldoCentavos), saldoInicial: reaisConsulta(c.saldoInicialCentavos), totalEntradas: reaisConsulta(c.entradasCentavos), totalSaidas: reaisConsulta(c.saidasCentavos), qtdMovimentacoes: c.quantidadeMovimentos, participacao: c.tipo === "credito" ? 0 : pct(reaisConsulta(c.saldoCentavos), reaisConsulta(q.saldoCentavos)) })).sort((a,b) => b.saldoAtual-a.saldoAtual)
}
export async function getAnaliseCarteiras(storeId: string, filtro: PeriodoFiltro = {}) { if (!gestorMoneyAtivo()) return legado.getAnaliseCarteiras(storeId, filtro); return projetarAnaliseCarteirasConsulta(await consultarFinanceiroEmpresa(storeId,filtro)) }
export function projetarComparativoMensalConsulta(q: ConsultaFinanceiraDTO, meses=12): ComparativoMensal[] {
  if(!Number.isInteger(meses)||meses<1||meses>24) throw new ConsultaFinanceiraError("periodo_invalido",422)
  const hoje=diaNoFusoConsulta(new Date(q.asOf)),date=new Date(hoje+"T12:00:00Z");date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()-meses+1)
  return Array.from({length:meses},(_,i)=>{const d=new Date(date);d.setUTCMonth(d.getUTCMonth()+i);const mes=d.toISOString().slice(0,7),v=q.calendario.find(c=>c.mes===mes)
    const entrada=reaisConsulta(v?.receitaCentavos??"0"),saida=reaisConsulta(v?.despesaCentavos??"0")
    return {asOf:q.asOf,mes,mesLabel:mes,ano:d.getUTCFullYear(),entrada,saida,lucro:safeMoney(entrada-saida),margem:pct(entrada-saida,entrada)} })
}
export function projetarComparativoAnualConsulta(q: ConsultaFinanceiraDTO, anos=3): ComparativoAnual[] {
  if(!Number.isInteger(anos)||anos<1||anos>10)throw new ConsultaFinanceiraError("periodo_invalido",422)
  const atual=Number(diaNoFusoConsulta(new Date(q.asOf)).slice(0,4)),result:ComparativoAnual[]=[]
  for(let ano=atual-anos+1;ano<=atual;ano++){const rows=q.calendario.filter(c=>c.mes.startsWith(String(ano))),entrada=reaisConsulta(rows.reduce((s,c)=>s+BigInt(c.receitaCentavos),BigInt(0))),saida=reaisConsulta(rows.reduce((s,c)=>s+BigInt(c.despesaCentavos),BigInt(0))),prev=result.at(-1)
    result.push({asOf:q.asOf,ano,entrada,saida,lucro:safeMoney(entrada-saida),margem:pct(entrada-saida,entrada),crescimento:prev?.entrada?pct(entrada-prev.entrada,prev.entrada):0}) }
  return result
}
export async function getComparativoMensal(storeId:string,meses=12){ if (!gestorMoneyAtivo()) return legado.getComparativoMensal(storeId, meses);return projetarComparativoMensalConsulta(await consultarFinanceiroEmpresa(storeId),meses)}
export async function getComparativoAnual(storeId:string,anos=3){ if (!gestorMoneyAtivo()) return legado.getComparativoAnual(storeId, anos);return projetarComparativoAnualConsulta(await consultarFinanceiroEmpresa(storeId),anos)}
export function projetarResumoConsulta(q: ConsultaFinanceiraDTO): ResumoExecutivo {
  return { periodo:{dataInicio:q.periodo.dataInicio,dataFim:q.periodo.dataFim,dias:Math.round((Date.parse(q.periodo.dataFim)-Date.parse(q.periodo.dataInicio))/86400000)+1}, indicadores:projetarIndicadoresConsulta(q), receitasPorCategoria:categorias(q,"receitaCentavos"),despesasPorCategoria:categorias(q,"despesaCentavos"),topReceitas:projetarRankingConsulta(q,"receitaCentavos",5),topDespesas:projetarRankingConsulta(q,"despesaCentavos",5), apuracao:apuracaoConsulta(q) }
}
export async function getResumoExecutivo(storeId: string, filtro: PeriodoFiltro = {}) { if (!gestorMoneyAtivo()) return legado.getResumoExecutivo(storeId, filtro); return projetarResumoConsulta(await consultarFinanceiroEmpresa(storeId,filtro)) }
export function buildFiltroPreset(preset: string): PeriodoFiltro {
  const hoje=diaNoFusoConsulta(new Date())
  if(preset==="hoje") return {dataInicio:hoje,dataFim:hoje}
  if(preset==="ontem") {const d=deslocarDiaConsulta(hoje,-1);return {dataInicio:d,dataFim:d}}
  if(preset==="7dias"||preset==="30dias") return {dataInicio:deslocarDiaConsulta(hoje,preset==="7dias"?-7:-30),dataFim:hoje}
  if(preset==="mespassado") {const d=new Date(hoje+"T12:00:00Z");d.setUTCDate(1);d.setUTCDate(0);const fim=d.toISOString().slice(0,10);return {dataInicio:fim.slice(0,7)+"-01",dataFim:fim}}
  if(preset==="estemes") {const f=filtroConsultaFinanceira();return {dataInicio:f.dataInicio,dataFim:f.dataFim}}
  throw new ConsultaFinanceiraError("periodo_exige_esclarecimento",422)
}
