/**
 * Blocos de APRESENTAÇÃO do fechamento de caixa (GOAL CAIXA-FECHAMENTO-ORIGENS-PAGAMENTO-003A).
 *
 * Fonte única dos quatro conceitos exibidos no modal, na impressão/cópia, no comprovante
 * pós-fechamento e na reimpressão do histórico:
 *  1. Vendas da sessão (competência) — à prazo e crédito/vale apenas informativos;
 *  2. Recebido na sessão por origem — vendas à vista + contas + O.S. − estornos;
 *  3. Recebido na sessão por forma — a mesma soma, aberta pela forma usada;
 *  4. Gaveta — dinheiro físico esperado (fórmula preservada).
 *
 * Substitui a apresentação de "Receita total do dia" (`totalLiquido + recebimentosContas`),
 * que contava duas vezes a venda à prazo recebida na mesma sessão. O campo legado continua
 * gravado no snapshot — só deixou de ser exibido.
 *
 * Snapshots antigos (sem `recebidoPorOrigem`/`recebidoPorForma`/`gavetaDinheiro`) continuam
 * renderizando: com as operações da sessão, a separação é recalculada a partir delas; sem
 * elas, cai no total legado de `recebimento_cr`, sem inventar divisão.
 */
import type { CaixaOperacaoLinha, FechamentoResumo, OrigemVendaKey } from "@/lib/caixa-fechamento-resumo"
import { escapeHtml } from "@/lib/thermal-print"
import { FORMA_CANONICA_LABEL } from "./formas-pagamento-caixa"
import {
  aggregateRecebimentosSessao,
  calcularRecebidoSessao,
  recebimentosDeTotaisLegados,
  type RecebimentosSessao,
  type ResumoGavetaDinheiro,
  type ResumoRecebidoPorForma,
  type ResumoRecebidoPorOrigem,
} from "./recebimentos-sessao"

export const ORIGEM_VENDA_LABEL: Record<OrigemVendaKey, string> = {
  pdv: "PDV / Balcão",
  avulso: "Itens avulsos",
  os: "O.S. faturadas no PDV",
}

type CamposRecebido = "recebidoPorOrigem" | "recebidoPorForma" | "gavetaDinheiro"

/** Resumo gravado em `payload.resumoFechamento` — snapshots antigos não têm os campos do 003A. */
export type ResumoFechamentoPersistido = Omit<FechamentoResumo, CamposRecebido> &
  Partial<Pick<FechamentoResumo, CamposRecebido>>

export type TipoLinhaBloco = "item" | "deducao" | "total" | "info"

export interface LinhaBloco {
  id: string
  rotulo: string
  /** `deducao` guarda a magnitude e é exibida com sinal de menos; `item` pode ser negativo. */
  valor: number
  tipo: TipoLinhaBloco
  /** Parcela somada na composição da gaveta (exibida com "+"). */
  soma?: boolean
  qtd?: number
  unidade?: readonly [singular: string, plural: string]
}

export interface BlocoFechamento {
  titulo: string
  /** Contexto curto do bloco (ex.: quantidade de vendas e ticket médio). */
  meta?: string
  linhas: LinhaBloco[]
  notas: string[]
}

export interface BlocosFechamento {
  vendas: BlocoFechamento
  recebidoPorOrigem: BlocoFechamento
  recebidoPorForma: BlocoFechamento
  gaveta: BlocoFechamento
  /** Snapshot sem os campos do 003A — recebidos recalculados a partir do legado/operações. */
  legado: boolean
  totais: { vendasLiquidas: number; recebidoSessao: number; dinheiroEsperado: number }
}

const EPS = 0.009
const UN_ITEM = ["item", "itens"] as const
const UN_RECEBIMENTO = ["recebimento", "recebimentos"] as const
const UN_ESTORNO = ["estorno", "estornos"] as const
const FORMAS_BLOCO = ["dinheiro", "pix", "cartaoDebito", "cartaoCredito", "carne", "creditoVale", "aPrazo"] as const
const BLOCOS_ORDEM = ["vendas", "recebidoPorOrigem", "recebidoPorForma", "gaveta"] as const

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0
}

function fmtBRL(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number.isFinite(v) ? v : 0,
  )
}

/**
 * Recebido por origem/forma e gaveta do resumo. Snapshot novo: usa o que foi gravado.
 * Snapshot antigo: recalcula das operações da sessão quando disponíveis; senão, do total legado.
 */
export function recebidoDoResumo(
  resumo: ResumoFechamentoPersistido,
  opts?: { operacoes?: ReadonlyArray<CaixaOperacaoLinha> },
): {
  recebidoPorOrigem: ResumoRecebidoPorOrigem
  recebidoPorForma: ResumoRecebidoPorForma
  gavetaDinheiro: ResumoGavetaDinheiro
  legado: boolean
} {
  if (resumo.recebidoPorOrigem && resumo.recebidoPorForma && resumo.gavetaDinheiro) {
    return {
      recebidoPorOrigem: resumo.recebidoPorOrigem,
      recebidoPorForma: resumo.recebidoPorForma,
      gavetaDinheiro: resumo.gavetaDinheiro,
      legado: false,
    }
  }
  const pg = resumo.porPagamento
  const recebimentos: RecebimentosSessao = opts?.operacoes
    ? aggregateRecebimentosSessao(opts.operacoes)
    : recebimentosDeTotaisLegados(resumo)
  return {
    ...calcularRecebidoSessao({
      pagamentosVendas: {
        dinheiro: num(pg?.dinheiro),
        pix: num(pg?.pix),
        cartaoDebito: num(pg?.cartaoDebito),
        cartaoCredito: num(pg?.cartaoCredito),
        carne: num(pg?.carne),
      },
      vendasAVista: num(resumo.totalRecebido),
      recebimentos,
      saldoInicial: num(resumo.saldoInicial),
      suprimentos: num(resumo.suprimentos),
      sangrias: num(resumo.sangrias),
      dinheiroEsperado: num(resumo.saldoDinheiroEsperado),
    }),
    legado: true,
  }
}

function linhasContasOsEstornos(ro: {
  contasRecebidas: number
  qtdContasRecebidas: number
  osRecebidas: number
  qtdOsRecebidas: number
  estornosRecebimento: number
  qtdEstornosRecebimento: number
}): LinhaBloco[] {
  const linhas: LinhaBloco[] = []
  if (ro.qtdContasRecebidas > 0 || ro.contasRecebidas > EPS) {
    linhas.push({
      id: "recebido.contas",
      rotulo: "Contas recebidas",
      valor: ro.contasRecebidas,
      tipo: "item",
      qtd: ro.qtdContasRecebidas,
      unidade: UN_RECEBIMENTO,
    })
  }
  if (ro.qtdOsRecebidas > 0 || ro.osRecebidas > EPS) {
    linhas.push({
      id: "recebido.os",
      rotulo: "O.S. recebidas",
      valor: ro.osRecebidas,
      tipo: "item",
      qtd: ro.qtdOsRecebidas,
      unidade: UN_RECEBIMENTO,
    })
  }
  if (ro.qtdEstornosRecebimento > 0 || ro.estornosRecebimento > EPS) {
    linhas.push({
      id: "recebido.estornos",
      rotulo: "Estornos de recebimento",
      valor: ro.estornosRecebimento,
      tipo: "deducao",
      qtd: ro.qtdEstornosRecebimento,
      unidade: UN_ESTORNO,
    })
  }
  return linhas
}

export function montarBlocosFechamento(
  resumo: ResumoFechamentoPersistido,
  opts?: { operacoes?: ReadonlyArray<CaixaOperacaoLinha> },
): BlocosFechamento {
  const { recebidoPorOrigem: ro, recebidoPorForma: rf, gavetaDinheiro: gv, legado } = recebidoDoResumo(
    resumo,
    opts,
  )
  const totalLiquido = num(resumo.totalLiquido)
  const aPrazo = num(resumo.aPrazo)
  const creditoVale = num(resumo.porPagamento?.creditoVale)
  const descontos = num(resumo.descontos)

  // 1. Vendas da sessão (competência).
  const linhasVendas: LinhaBloco[] = []
  for (const o of Array.isArray(resumo.porOrigem) ? resumo.porOrigem : []) {
    const valor = num(o.valorBruto)
    const qtd = num(o.qtdItens)
    if (!(Math.abs(valor) > EPS) && !(qtd > 0)) continue
    linhasVendas.push({
      id: `vendas.${o.key}`,
      rotulo: (ORIGEM_VENDA_LABEL as Record<string, string>)[o.key] ?? o.label,
      valor,
      tipo: "item",
      qtd,
      unidade: UN_ITEM,
    })
  }
  if (descontos > EPS) {
    linhasVendas.push({ id: "vendas.descontos", rotulo: "Descontos", valor: descontos, tipo: "deducao" })
  }
  linhasVendas.push({ id: "vendas.liquidas", rotulo: "Vendas líquidas", valor: totalLiquido, tipo: "total" })
  if (aPrazo > EPS) {
    linhasVendas.push({ id: "vendas.a-prazo", rotulo: "A receber (à prazo)", valor: aPrazo, tipo: "info" })
  }
  if (creditoVale > EPS) {
    linhasVendas.push({
      id: "vendas.credito-vale",
      rotulo: "Pago com crédito/vale",
      valor: creditoVale,
      tipo: "info",
    })
  }
  const qtdVendas = num(resumo.qtdVendas)
  const vendas: BlocoFechamento = {
    titulo: "Vendas da sessão",
    meta: `${qtdVendas} ${qtdVendas === 1 ? "venda" : "vendas"} · ticket médio ${fmtBRL(num(resumo.ticketMedio))}`,
    linhas: linhasVendas,
    notas:
      aPrazo > EPS || creditoVale > EPS
        ? ["À prazo e crédito/vale fazem parte da venda, mas não do recebido nem da gaveta."]
        : [],
  }

  // 2. Recebido na sessão — por origem.
  const linhasOrigem: LinhaBloco[] = [
    { id: "recebido.vendas-a-vista", rotulo: "Vendas à vista", valor: ro.vendasAVista, tipo: "item" },
  ]
  if (ro.origemSeparada) {
    linhasOrigem.push(...linhasContasOsEstornos(ro))
  } else if (ro.contasRecebidas > EPS) {
    linhasOrigem.push({
      id: "recebido.contas-os",
      rotulo: "Contas e O.S. recebidas",
      valor: ro.contasRecebidas,
      tipo: "item",
      ...(ro.qtdContasRecebidas > 0 ? { qtd: ro.qtdContasRecebidas, unidade: UN_RECEBIMENTO } : {}),
    })
  }
  linhasOrigem.push({ id: "recebido.total", rotulo: "Total recebido na sessão", valor: ro.total, tipo: "total" })
  const recebidoPorOrigem: BlocoFechamento = {
    titulo: "Recebido na sessão · por origem",
    linhas: linhasOrigem,
    notas: ro.origemSeparada
      ? []
      : ["Registro anterior à separação entre contas e O.S. (valor já líquido de estornos)."],
  }

  // 3. Recebido na sessão — por forma (formas zeradas ficam ocultas).
  const linhasForma: LinhaBloco[] = []
  for (const f of FORMAS_BLOCO) {
    const valor = num(rf[f])
    if (Math.abs(valor) > EPS) {
      linhasForma.push({ id: `forma.${f}`, rotulo: FORMA_CANONICA_LABEL[f], valor, tipo: "item" })
    }
  }
  if (rf.formaNaoIdentificada > EPS) {
    linhasForma.push({
      id: "forma.nao-identificada",
      rotulo: ro.origemSeparada ? "Forma não identificada" : "Contas e O.S. sem forma",
      valor: rf.formaNaoIdentificada,
      tipo: "item",
    })
  }
  if (Math.abs(rf.vendasSemForma) > EPS) {
    linhasForma.push({
      id: "forma.vendas-sem-forma",
      rotulo: "Vendas sem forma",
      valor: rf.vendasSemForma,
      tipo: "item",
    })
  }
  if (rf.estornosSemForma > EPS) {
    linhasForma.push({
      id: "forma.estornos-sem-forma",
      rotulo: "Estornos sem forma",
      valor: rf.estornosSemForma,
      tipo: "deducao",
    })
  }
  linhasForma.push({ id: "forma.total", rotulo: "Total por forma", valor: rf.total, tipo: "total" })
  const notasForma: string[] = []
  if (num(rf.carne) > EPS) {
    notasForma.push("Carnê/boleto segue a regra atual do PDV: entra como recebido na venda, sem conta a receber.")
  }
  if (rf.estornosSemForma > EPS) {
    notasForma.push("Estorno sem forma registrada não é atribuído a nenhuma forma nem abatido da gaveta.")
  }
  const recebidoPorForma: BlocoFechamento = {
    titulo: "Recebido na sessão · por forma",
    linhas: linhasForma,
    notas: notasForma,
  }

  // 4. Gaveta — dinheiro físico.
  const linhasGaveta: LinhaBloco[] = [
    { id: "gaveta.abertura", rotulo: "Abertura", valor: gv.abertura, tipo: "item" },
    { id: "gaveta.dinheiro-vendas", rotulo: "Dinheiro das vendas", valor: gv.dinheiroVendas, tipo: "item", soma: true },
  ]
  if (gv.dinheiroContas > EPS) {
    linhasGaveta.push({
      id: "gaveta.dinheiro-contas",
      rotulo: ro.origemSeparada ? "Dinheiro das contas recebidas" : "Dinheiro de contas e O.S. recebidas",
      valor: gv.dinheiroContas,
      tipo: "item",
      soma: true,
    })
  }
  if (gv.dinheiroOs > EPS) {
    linhasGaveta.push({
      id: "gaveta.dinheiro-os",
      rotulo: "Dinheiro das O.S. recebidas",
      valor: gv.dinheiroOs,
      tipo: "item",
      soma: true,
    })
  }
  if (gv.estornosDinheiro > EPS) {
    linhasGaveta.push({
      id: "gaveta.estornos-dinheiro",
      rotulo: "Estornos em dinheiro",
      valor: gv.estornosDinheiro,
      tipo: "deducao",
    })
  }
  linhasGaveta.push(
    { id: "gaveta.suprimentos", rotulo: "Suprimentos", valor: gv.suprimentos, tipo: "item", soma: true },
    { id: "gaveta.sangrias", rotulo: "Sangrias", valor: gv.sangrias, tipo: "deducao" },
    { id: "gaveta.esperado", rotulo: "Dinheiro esperado", valor: gv.esperado, tipo: "total" },
  )
  const gaveta: BlocoFechamento = { titulo: "Gaveta · dinheiro físico", linhas: linhasGaveta, notas: [] }

  return {
    vendas,
    recebidoPorOrigem,
    recebidoPorForma,
    gaveta,
    legado,
    totais: { vendasLiquidas: totalLiquido, recebidoSessao: ro.total, dinheiroEsperado: gv.esperado },
  }
}

/**
 * Contas, O.S. e estornos lidos direto das operações — para sessões antigas sem resumo gravado
 * (só ledger), onde não há como montar vendas à vista nem gaveta com segurança.
 */
export function blocoRecebimentosDasOperacoes(
  operacoes: ReadonlyArray<CaixaOperacaoLinha>,
): BlocoFechamento {
  const r = aggregateRecebimentosSessao(operacoes)
  const linhas = linhasContasOsEstornos({
    contasRecebidas: r.contas.valor,
    qtdContasRecebidas: r.contas.qtd,
    osRecebidas: r.os.valor,
    qtdOsRecebidas: r.os.qtd,
    estornosRecebimento: r.estornos.valor,
    qtdEstornosRecebimento: r.estornos.qtd,
  })
  linhas.push({
    id: "recebido.contas-os-liquido",
    rotulo: "Contas e O.S. (líquido)",
    valor: Math.round((r.contas.valor + r.os.valor - r.estornos.valor) * 100) / 100 || 0,
    tipo: "total",
  })
  return { titulo: "Contas e O.S. recebidas na sessão", linhas, notas: [] }
}

/** `3 itens`, `1 recebimento` — vazio quando a linha não tem quantidade. */
export function quantidadeLinhaBloco(l: LinhaBloco): string {
  if (l.qtd == null || !l.unidade) return ""
  return `${l.qtd} ${l.qtd === 1 ? l.unidade[0] : l.unidade[1]}`
}

/** Rótulo com o operador da composição, no padrão da impressão: `(+)`, `(-)`, `=`. */
export function rotuloTextoLinha(l: LinhaBloco): string {
  const prefixo =
    l.tipo === "deducao" ? "(-) " : l.tipo === "total" ? "= " : l.soma ? "(+) " : l.tipo === "info" ? "  " : ""
  const qtd = quantidadeLinhaBloco(l)
  return `${prefixo}${l.rotulo}${qtd ? ` (${qtd})` : ""}`
}

function textoBloco(b: BlocoFechamento): string[] {
  return [
    `--- ${b.titulo.toUpperCase()} ---`,
    ...(b.meta ? [b.meta] : []),
    ...b.linhas.map((l) => `${`${rotuloTextoLinha(l)}:`.padEnd(32)} ${fmtBRL(l.valor)}`),
    ...b.notas.map((n) => `* ${n}`),
  ]
}

/** Linhas de texto (impressão/cópia) dos quatro blocos, na ordem oficial. */
export function linhasTextoFechamento(blocos: BlocosFechamento): string[] {
  return BLOCOS_ORDEM.flatMap((chave) => textoBloco(blocos[chave]))
}

export function htmlBlocoFechamento(b: BlocoFechamento): string {
  const meta = b.meta ? `<p>${escapeHtml(b.meta)}</p>` : ""
  const linhas = b.linhas
    .map((l) => {
      const texto = `${escapeHtml(rotuloTextoLinha(l))}: ${fmtBRL(l.valor)}`
      return l.tipo === "total" ? `<p><strong>${texto}</strong></p>` : `<p>${texto}</p>`
    })
    .join("")
  const notas = b.notas.map((n) => `<p style="font-size:10px">* ${escapeHtml(n)}</p>`).join("")
  return `<hr><strong>${escapeHtml(b.titulo.toUpperCase())}</strong>${meta}${linhas}${notas}`
}

/** HTML (comprovante térmico / relatório) dos quatro blocos, na ordem oficial. */
export function htmlBlocosFechamento(blocos: BlocosFechamento): string {
  return BLOCOS_ORDEM.map((chave) => htmlBlocoFechamento(blocos[chave])).join("")
}
