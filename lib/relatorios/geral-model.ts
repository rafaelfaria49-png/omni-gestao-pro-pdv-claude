/**
 * Relatório Geral da Loja — modelo puro (sem banco).
 *
 * Recebe os agregados já lidos do PostgreSQL e monta os blocos. Toda regra de
 * conciliação que não depende de SQL mora aqui para ser testável isoladamente:
 *  - Vendas são competência (Venda.at). Recebimentos/pagamentos são caixa (ledger).
 *    Os dois universos nunca são somados entre si.
 *  - Cada movimento do ledger é contado uma vez, numa única classe.
 *  - Transferências e sangria/suprimento ficam fora de receitas e despesas.
 *  - CMV/lucro ficam indisponíveis (sem custo histórico por linha).
 */
import { money, type Cell, type Column, type Metric, type ReportSection } from "./contracts"

export const SALE_TYPES = ["produto", "acessorio", "aparelho", "servico", "os", "avulso", "nao_classificado"] as const
export type SaleType = typeof SALE_TYPES[number]
export const SALE_TYPE_LABEL: Record<SaleType, string> = {
  produto: "Produtos", acessorio: "Acessórios", aparelho: "Aparelhos (celulares)", servico: "Serviços",
  os: "Ordens de serviço", avulso: "Itens avulsos", nao_classificado: "Não classificado",
}

/** Classes do ledger. Uma e só uma por movimento. */
export const LEDGER_CLASSES = ["venda_avista", "recebimento_titulo", "os_direto", "marketplace", "estorno_recebimento", "cancelamento_venda",
  "devolucao", "pagamento_titulo", "estorno_pagamento", "tesouraria", "transferencia", "nao_classificado"] as const
export type LedgerClass = typeof LEDGER_CLASSES[number]
export const LEDGER_LABEL: Record<LedgerClass, string> = {
  venda_avista: "Vendas à vista (PDV)", recebimento_titulo: "Recebimentos de títulos", os_direto: "Recebimentos diretos de OS",
  marketplace: "Marketplace", estorno_recebimento: "Estornos de recebimento", cancelamento_venda: "Estornos por cancelamento de venda",
  devolucao: "Devoluções pagas ao cliente", pagamento_titulo: "Pagamentos de contas", estorno_pagamento: "Estornos de pagamento",
  tesouraria: "Sangria / suprimento (tesouraria)", transferencia: "Transferências entre carteiras", nao_classificado: "Não classificado",
}
/** Subclasse de recebimento de título, pela origem comprovada do título. */
export const RECEIPT_SUB_LABEL: Record<string, string> = {
  parcela_venda_periodo: "Parcelas de vendas a prazo do período",
  parcela_venda_anterior: "Parcelas de vendas anteriores ao período",
  parcela_sem_venda: "Parcelas a prazo sem venda localizada",
  os: "Recebimentos de OS (títulos)",
  titulo_pdv: "Títulos do PDV",
  titulo_manual: "Títulos lançados manualmente",
  titulo_nao_classificado: "Títulos sem origem comprovada (Não classificado)",
  titulo_nao_encontrado: "Recebimento sem título na loja (Não classificado)",
}
export const RECEIVABLE_ORIGIN_LABEL: Record<string, string> = {
  venda_prazo: "Vendas a prazo (PDV)", os: "Ordens de serviço", titulo_pdv: "Títulos do PDV", titulo_manual: "Lançamento manual",
  titulo_nao_classificado: "Não classificado",
}
export const ORIGIN_LABEL: Record<string, string> = {
  pdv: "PDV", os: "Ordem de serviço", receber: "Contas a receber", pagar: "Contas a pagar", marketplace: "Marketplace", manual: "Manual",
  tesouraria: "Tesouraria", transferencia: "Transferência interna", estorno: "Estorno / devolução", nao_classificado: "Não classificado",
}
export const RECORD_LABEL: Record<string, string> = {
  venda: "Venda", movimento: "Movimento financeiro", receber: "Título a receber", pagar: "Título a pagar", devolucao: "Devolução",
}
export const STATUS_LABEL: Record<string, string> = {
  concluida: "Concluída", cancelada: "Cancelada", parcialmente_devolvida: "Parcialmente devolvida", devolvida: "Devolvida", outro: "Outro status",
  realizado: "Realizado no ledger", em_aberto: "Em aberto", vencido: "Vencido", quitado: "Quitado", cancelado: "Cancelado",
  indeterminado: "Indisponível (saldo não comprovado)", devolvido: "Devolvido",
}
/** Mesmo conjunto de categorias de custo usado em lib/financeiro/services/dre-service.ts (CATEGORIAS_CUSTO). */
export const PURCHASE_CATEGORIES = ["peças", "pecas", "insumos", "material", "materiais", "compras", "estoque", "mercadoria", "mercadorias", "custo", "custos",
  "produto", "produtos", "reposicao", "reposição", "componente", "componentes"]

export const label = (map: Record<string, string>, key: unknown) => typeof key === "string" ? map[key] ?? key : "Não classificado"

export type SalesTypeRow = { tipo: string; vendas: number; quantidade: number; bruto: number }
export type ReturnTypeRow = { tipo: string; quantidade: number; valor: number }
export type SalesTotals = { vendas: number; total: number; linhas: number; canceladas: number; totalCanceladas: number; devolvidas: number; parciais: number }
export type ReturnTotals = { documentos: number; total: number; itens: number; semVenda: number; divergentes: number }
export type PaymentSplit = {
  total: number; avista: number; aprazo: number; credito: number; osDoc: number; osDocCount: number
  semComprovacao: number; semComprovacaoCount: number; excedente: number; excedenteCount: number
  dinheiro: number; pix: number; debito: number; creditoCartao: number; carne: number; aprazoDeclarado: number
  semBreakdown: number; divergenciaAvista: number; divergenciaAvistaValor: number; aprazoSemTitulo: number
}
export type LedgerRow = { classe: string; sub: string | null; categoria: string | null; compra: boolean | null; registros: number; valor: number; invalidos: number }
export type OpenRow = { lado: "receber" | "pagar"; grupo: string; titulos: number; aberto: number; vencido: number; noPeriodo: number; indeterminados: number }
export type FlowMetrics = { initial: number | null; incoming: number; outgoing: number; openingAdjustments: number | null; final: number | null }
export type Conference = {
  cancelSemEstorno: number; cancelSemEstornoValor: number; osDupla: number; osDuplaValor: number
  caixaRecebimentos: number; caixaEstornos: number; aprazoAbertoCoorte: number | null
  osCriadas: number | null; aparelhosUnidades: number; aparelhosValor: number
}
export type GeneralRaw = {
  salesTypes: SalesTypeRow[]; salesTotals: SalesTotals; returnTypes: ReturnTypeRow[]; returnTotals: ReturnTotals
  split: PaymentSplit; ledger: LedgerRow[]; open: OpenRow[]; flow: FlowMetrics; conference: Conference
}

/** Não se aplica (diferente de Indisponível, que é ausência de cobertura). */
const NA = "—"
const m = (key: string, labelText: string, value: number | null, reason?: string, format: Metric["format"] = "money"): Metric =>
  ({ key, label: labelText, value: value === null ? null : format === "money" ? money(value) : value, format, ...(reason ? { reason } : {}) })
const sum = (rows: { valor: number }[]) => money(rows.reduce((s, r) => s + r.valor, 0))
const cols = (...c: [string, string, Column["format"]?][]): Column[] => c.map(([key, l, format]) => ({ key, label: l, ...(format ? { format } : {}) }))

/** Recebido líquido = entradas de clientes − estornos/devoluções. Sem tesouraria, transferência ou não classificado. */
export const RECEIPT_CLASSES: LedgerClass[] = ["venda_avista", "recebimento_titulo", "os_direto", "marketplace", "estorno_recebimento", "cancelamento_venda", "devolucao"]
export const PAYMENT_CLASSES: LedgerClass[] = ["pagamento_titulo", "estorno_pagamento"]

export function ledgerTotals(rows: LedgerRow[]) {
  const by = (classes: string[]) => rows.filter(r => classes.includes(r.classe))
  const receipts = sum(by(RECEIPT_CLASSES))
  // Pagamentos: valor com sinal é negativo; exibido como positivo.
  const payments = money(-sum(by(PAYMENT_CLASSES)))
  const treasury = sum(by(["tesouraria"]))
  const transfers = sum(by(["transferencia"]))
  const unclassifiedRows = by(["nao_classificado"])
  return {
    receipts, payments, treasury, transfers,
    unclassifiedIn: money(unclassifiedRows.filter(r => r.valor > 0).reduce((s, r) => s + r.valor, 0)),
    unclassifiedOut: money(-unclassifiedRows.filter(r => r.valor < 0).reduce((s, r) => s + r.valor, 0)),
    unclassifiedCount: unclassifiedRows.reduce((s, r) => s + r.registros, 0),
    invalid: rows.reduce((s, r) => s + r.invalidos, 0),
    net: money(sum(rows.filter(r => r.classe !== "transferencia"))),
  }
}

export function buildGeneralSections(raw: GeneralRaw, options: { service: boolean }): { metrics: Metric[]; sections: ReportSection[]; limitations: string[] } {
  const { salesTypes, salesTotals: st, returnTypes, returnTotals: rt, split: sp, ledger, open, flow, conference: cf } = raw
  const lt = ledgerTotals(ledger)
  const returnsBy = new Map(returnTypes.map(r => [r.tipo, r]))
  const typesPresent = SALE_TYPES.filter(t => salesTypes.some(r => r.tipo === t) || returnsBy.has(t))
  const adjustment = money(st.total - st.linhas)
  const receivable = open.filter(o => o.lado === "receber"), payable = open.filter(o => o.lado === "pagar")
  const openSum = (rows: OpenRow[], k: "aberto" | "vencido" | "noPeriodo") => money(rows.reduce((s, r) => s + r[k], 0))
  const indet = (rows: OpenRow[]) => rows.reduce((s, r) => s + r.indeterminados, 0)
  const unknown = (rows: OpenRow[]) => `${indet(rows)} título(s) sem saldo comprovado: total indisponível.`
  const receiptRows = ledger.filter(r => r.classe === "recebimento_titulo")
  const receiptBySub = new Map<string, LedgerRow[]>()
  for (const r of receiptRows) receiptBySub.set(r.sub ?? "titulo_nao_encontrado", [...receiptBySub.get(r.sub ?? "titulo_nao_encontrado") ?? [], r])
  const ledgerOf = (c: LedgerClass) => ledger.filter(r => r.classe === c)
  const count = (rows: LedgerRow[]) => rows.reduce((s, r) => s + r.registros, 0)
  const osReceipts = money(sum(receiptBySub.get("os") ?? []) + sum(ledgerOf("os_direto")))
  const osSales = salesTypes.find(r => r.tipo === "os")
  const paymentCats = new Map<string, { valor: number; registros: number; compra: boolean }>()
  for (const r of ledger.filter(r => PAYMENT_CLASSES.includes(r.classe as LedgerClass))) {
    const key = r.categoria ?? "Sem categoria", cur = paymentCats.get(key) ?? { valor: 0, registros: 0, compra: !!r.compra }
    paymentCats.set(key, { valor: cur.valor - r.valor, registros: cur.registros + r.registros, compra: cur.compra || !!r.compra })
  }
  const purchases = money([...paymentCats.values()].filter(c => c.compra).reduce((s, c) => s + c.valor, 0))
  const caixaLiquido = money(cf.caixaRecebimentos - cf.caixaEstornos)
  const titleReceipts = money(sum(receiptRows) + sum(ledgerOf("estorno_recebimento")))
  const flowCheck = money(flow.incoming - flow.outgoing - lt.net)

  const sections: ReportSection[] = [
    { key: "resumo", title: "Resumo geral", note: "Vendas por competência (data da venda). Recebimentos e pagamentos por caixa (data do lançamento no ledger). Os dois universos não são somados.",
      metrics: [
        m("salesGross", "Vendas do período (Venda.total, sem canceladas)", st.total), m("salesReturns", "Devoluções registradas no período", rt.total),
        m("salesNet", "Vendas líquidas de devoluções do período", st.total - rt.total), m("salesCount", "Quantidade de vendas", st.vendas, undefined, "number"),
        m("receipts", "Recebimentos efetivos líquidos (caixa)", lt.receipts), m("payments", "Pagamentos efetivos líquidos (caixa)", lt.payments),
        m("operatingCash", "Recebido − pago (sem tesouraria, transferências e não classificados)", lt.receipts - lt.payments),
        m("receivableOpen", "Contas a receber em aberto (posição atual)", indet(receivable) ? null : openSum(receivable, "aberto"), `${indet(receivable)} título(s) sem saldo comprovado.`),
        m("payableOpen", "Contas a pagar em aberto (posição atual)", indet(payable) ? null : openSum(payable, "aberto"), `${indet(payable)} título(s) sem saldo comprovado.`),
        m("cmv", "CMV / lucro", null, "Indisponível: ItemVenda não preserva custo histórico. Compras de estoque não são CMV."),
      ] },
    { key: "vendas-tipo", title: "Vendas por tipo", note: "Tipo pela linha gravada: O.S./serviço/avulso pelo identificador virtual; aparelho pelo vínculo de unidade vendida (IMEI) ou modelo serializado; acessório pela configuração de acessório do produto ou pela categoria atual do catálogo; demais itens como produto. Linha sem produto localizado: Não classificado.",
      metrics: [m("adjustment", "Desconto/acréscimo geral não rateado", adjustment), m("cancelled", "Vendas canceladas (fora dos totais)", st.totalCanceladas),
        m("cancelledCount", "Quantidade de vendas canceladas", st.canceladas, undefined, "number")],
      columns: cols(["tipo", "Tipo"], ["vendas", "Vendas com o tipo", "number"], ["quantidade", "Qtd. vendida", "number"], ["bruto", "Valor bruto das linhas", "money"],
        ["devolvidoQtd", "Qtd. devolvida no período", "number"], ["devolvido", "Devolvido no período", "money"], ["liquido", "Bruto − devolvido", "money"]),
      rows: [...typesPresent.map(t => {
        const s = salesTypes.find(r => r.tipo === t), d = returnsBy.get(t)
        return { id: t, tipo: SALE_TYPE_LABEL[t], vendas: s?.vendas ?? 0, quantidade: s?.quantidade ?? 0, bruto: money(s?.bruto ?? 0),
          devolvidoQtd: d?.quantidade ?? 0, devolvido: money(d?.valor ?? 0), liquido: money((s?.bruto ?? 0) - (d?.valor ?? 0)) }
      }), { id: "ajuste", tipo: "Ajuste geral não rateado", vendas: NA, quantidade: NA, bruto: adjustment, devolvidoQtd: NA, devolvido: NA, liquido: adjustment },
      { id: "total", tipo: "Total (Venda.total)", vendas: st.vendas, quantidade: NA, bruto: money(st.total), devolvidoQtd: NA, devolvido: money(rt.total), liquido: money(st.total - rt.total) }] },
    { key: "vista-prazo", title: "Vendas à vista e a prazo", note: "Comprovado: entrada do ledger vinculada à venda (à vista) e títulos a receber da venda (a prazo, principal). Declarado: formas gravadas pelo PDV, não comprovam recebimento.",
      metrics: [m("avista", "À vista comprovado no ledger", sp.avista), m("aprazo", "A prazo comprovado em títulos", sp.aprazo),
        m("credito", "Crédito/vale utilizado (não é dinheiro novo)", sp.credito), m("osDoc", "Vendas geradas de OS com título da OS (pagamento acompanhado na OS)", sp.osDoc),
        m("semComprovacao", "Sem pagamento comprovado vinculado", sp.semComprovacao)],
      columns: cols(["forma", "Forma declarada no PDV"], ["valor", "Valor declarado", "money"]),
      rows: ([["dinheiro", "Dinheiro", sp.dinheiro], ["pix", "PIX", sp.pix], ["debito", "Cartão de débito", sp.debito], ["credito", "Cartão de crédito", sp.creditoCartao],
        ["carne", "Carnê", sp.carne], ["aprazo", "A prazo", sp.aprazoDeclarado], ["vale", "Crédito/vale", sp.credito]] as const).map(([id, forma, valor]) => ({ id, forma, valor: money(valor) })) },
    { key: "recebimentos", title: "Recebimentos efetivos", note: "Ledger por data do lançamento. Parcelas antigas entram quando pagas, sem virar nova venda. Recebimento de OS pelo título não se soma à venda do PDV: cada movimento é contado uma vez.",
      metrics: [m("receiptsNet", "Recebimentos líquidos", lt.receipts), m("oldInstallments", "Parcelas de vendas anteriores ao período", sum(receiptBySub.get("parcela_venda_anterior") ?? []))],
      columns: cols(["classe", "Classe"], ["registros", "Lançamentos", "number"], ["valor", "Valor com sinal", "money"]),
      rows: [
        ...ledgerOf("venda_avista").map(r => ({ id: "venda_avista", classe: LEDGER_LABEL.venda_avista, registros: r.registros, valor: money(r.valor) })),
        ...[...receiptBySub.entries()].map(([sub, rows]) => ({ id: `receber:${sub}`, classe: label(RECEIPT_SUB_LABEL, sub), registros: count(rows), valor: sum(rows) })),
        ...(["os_direto", "marketplace", "estorno_recebimento", "cancelamento_venda", "devolucao"] as LedgerClass[]).flatMap(c => ledgerOf(c).length
          ? [{ id: c, classe: LEDGER_LABEL[c], registros: count(ledgerOf(c)), valor: sum(ledgerOf(c)) }] : []),
      ] },
    { key: "receber", title: "Contas a receber e saldo devedor", note: "Posição atual dos títulos (principal menos pagamentos/estornos do histórico), sem reconstrução histórica. Vencido: vencimento anterior a hoje (São Paulo).",
      metrics: [m("receivableOpen2", "Saldo devedor total", indet(receivable) ? null : openSum(receivable, "aberto"), `${indet(receivable)} título(s) sem saldo comprovado.`),
        m("receivableOverdue", "Vencido", indet(receivable) ? null : openSum(receivable, "vencido"), unknown(receivable)), m("receivableDue", "Vence no período", indet(receivable) ? null : openSum(receivable, "noPeriodo"), unknown(receivable)),
        m("receivableCohort", "Em aberto de vendas a prazo deste período", cf.aprazoAbertoCoorte, "Há título dessas vendas sem saldo comprovado."), m("receivableUnknown", "Títulos sem saldo comprovado", indet(receivable), undefined, "number")],
      columns: cols(["grupo", "Origem do título"], ["titulos", "Títulos em aberto", "number"], ["aberto", "Em aberto", "money"], ["vencido", "Vencido", "money"], ["noPeriodo", "Vence no período", "money"], ["indeterminados", "Sem saldo comprovado", "number"]),
      rows: receivable.map(r => ({ id: r.grupo, grupo: label(RECEIVABLE_ORIGIN_LABEL, r.grupo), titulos: r.titulos, aberto: money(r.aberto), vencido: money(r.vencido), noPeriodo: money(r.noPeriodo), indeterminados: r.indeterminados })) },
    { key: "despesas", title: "Despesas e pagamentos efetivos", note: "Pagamentos efetivos do ledger, por categoria atual do título. Categorias de compra/insumo são compras de estoque, não CMV do período. Saídas manuais sem título não têm categoria comprovada: ficam em Não classificado (fora destes totais) e na conferência.",
      metrics: [m("paymentsNet", "Pagamentos líquidos", lt.payments), m("purchases", "Compras/insumos pagos (não é CMV)", purchases),
        m("expenses", "Demais despesas pagas", lt.payments - purchases), m("unclassifiedOut", "Saídas não classificadas (fora dos totais)", lt.unclassifiedOut)],
      columns: cols(["categoria", "Categoria do título"], ["natureza", "Natureza"], ["registros", "Lançamentos", "number"], ["valor", "Pago líquido", "money"]),
      rows: [...paymentCats.entries()].sort((a, b) => b[1].valor - a[1].valor).map(([categoria, c]) => ({ id: categoria, categoria, natureza: c.compra ? "Compra/insumo (não é CMV)" : "Despesa", registros: c.registros, valor: money(c.valor) })) },
    { key: "pagar", title: "Contas a pagar", note: "Títulos pendentes separados dos pagos. Posição atual do título, sem reconstrução histórica.",
      metrics: [m("payableOpen2", "Total a pagar em aberto", indet(payable) ? null : openSum(payable, "aberto"), `${indet(payable)} título(s) sem saldo comprovado.`),
        m("payableOverdue", "Vencido", indet(payable) ? null : openSum(payable, "vencido"), unknown(payable)), m("payableDue", "Vence no período", indet(payable) ? null : openSum(payable, "noPeriodo"), unknown(payable)), m("payableUnknown", "Títulos sem saldo comprovado", indet(payable), undefined, "number")],
      columns: cols(["grupo", "Categoria"], ["titulos", "Títulos em aberto", "number"], ["aberto", "Em aberto", "money"], ["vencido", "Vencido", "money"], ["noPeriodo", "Vence no período", "money"], ["indeterminados", "Sem saldo comprovado", "number"]),
      rows: payable.map(r => ({ id: r.grupo, grupo: r.grupo, titulos: r.titulos, aberto: money(r.aberto), vencido: money(r.vencido), noPeriodo: money(r.noPeriodo), indeterminados: r.indeterminados })) },
    { key: "fluxo", title: "Fluxo de entradas, saídas e saldos", note: "Mesmo cálculo do relatório Fluxo de Caixa (consolidado). Transferências são neutras; sangria/suprimento são tesouraria.",
      metrics: [m("flowInitial", "Saldo inicial do ledger", flow.initial), m("flowIn", "Entradas realizadas", flow.incoming), m("flowOut", "Saídas realizadas", flow.outgoing),
        m("flowOpening", "Saldo inicial de carteiras criadas no período", flow.openingAdjustments), m("flowFinal", "Saldo final do ledger", flow.final),
        m("treasury", "Tesouraria (suprimento − sangria)", lt.treasury), m("transfers", "Transferências (soma das pernas, neutra)", lt.transfers)],
      columns: cols(["classe", "Classe do lançamento"], ["registros", "Lançamentos", "number"], ["valor", "Valor com sinal", "money"]),
      rows: LEDGER_CLASSES.flatMap(c => ledgerOf(c).length ? [{ id: c, classe: LEDGER_LABEL[c], registros: count(ledgerOf(c)), valor: sum(ledgerOf(c)) }] : []) },
    { key: "os", title: "Ordens de serviço e aparelhos", note: "Faturamento de OS pela venda (competência) e recebimento pelo ledger (caixa) são mostrados lado a lado, sem soma.",
      metrics: [m("osSales", "Vendas de OS (linhas, competência)", osSales?.bruto ?? 0), m("osReceipts", "Recebimentos de OS no ledger (caixa)", osReceipts),
        m("osCreated", "OS criadas no período", options.service ? cf.osCriadas : null, "Exige acesso ao módulo de Operações.", "number"),
        m("devices", "Aparelhos vendidos com unidade vinculada", cf.aparelhosUnidades, undefined, "number"), m("devicesValue", "Valor dos aparelhos vinculados", cf.aparelhosValor)] },
  ]
  const check = (id: string, conferencia: string, registros: number, valor: number | null, ok: boolean) => ({ id, conferencia, registros, valor: valor === null ? NA : money(valor), situacao: ok ? "OK" : "Verificar" })
  sections.push({ key: "conferencia", title: "Conferência de lançamentos e divergências", note: "Itens a verificar não são corrigidos nem descontados automaticamente: o relatório só aponta.",
    metrics: [m("divergences", "Verificações com pendência", null, "Ver tabela.")],
    columns: cols(["conferencia", "Conferência"], ["registros", "Registros", "number"], ["valor", "Valor", "money"], ["situacao", "Situação"]),
    rows: [
      check("avista", "Venda com entrada no ledger diferente do à vista declarado", sp.divergenciaAvista, sp.divergenciaAvistaValor, sp.divergenciaAvista === 0),
      check("aprazo", "Venda com a prazo declarado sem título a receber", sp.aprazoSemTitulo, null, sp.aprazoSemTitulo === 0),
      check("semComprovacao", "Venda sem pagamento comprovado vinculado", sp.semComprovacaoCount, sp.semComprovacao, sp.semComprovacaoCount === 0),
      check("excedente", "Venda com pagamentos vinculados acima do total", sp.excedenteCount, sp.excedente, sp.excedenteCount === 0),
      check("semBreakdown", "Venda sem formas de pagamento gravadas", sp.semBreakdown, null, sp.semBreakdown === 0),
      check("cancel", "Venda cancelada com entrada sem estorno", cf.cancelSemEstorno, cf.cancelSemEstornoValor, cf.cancelSemEstorno === 0),
      check("osDupla", "OS faturada no PDV e também recebida pelo título (possível duplicidade)", cf.osDupla, cf.osDuplaValor, cf.osDupla === 0),
      check("ledgerNc", "Lançamentos do ledger não classificados", lt.unclassifiedCount, lt.unclassifiedIn - lt.unclassifiedOut, lt.unclassifiedCount === 0),
      check("ledgerInvalid", "Lançamentos com direção inválida", lt.invalid, null, lt.invalid === 0),
      check("orfao", "Recebimento sem título correspondente na loja", count(receiptBySub.get("titulo_nao_encontrado") ?? []), sum(receiptBySub.get("titulo_nao_encontrado") ?? []), !receiptBySub.has("titulo_nao_encontrado")),
      check("linhaNc", "Linhas de venda sem tipo comprovado", salesTypes.find(r => r.tipo === "nao_classificado")?.vendas ?? 0, salesTypes.find(r => r.tipo === "nao_classificado")?.bruto ?? 0, !salesTypes.some(r => r.tipo === "nao_classificado")),
      check("devSemVenda", "Devolução sem venda vinculada", rt.semVenda, null, rt.semVenda === 0),
      check("devItens", "Devolução com itens diferentes do total do documento", rt.divergentes, money(rt.total - rt.itens), rt.divergentes === 0),
      check("fluxo", "Classes do ledger × Fluxo de Caixa (diferença)", 0, flowCheck, Math.abs(flowCheck) < 0.01),
      { id: "caixa", conferencia: "Caixa: recebimentos de contas registrados nas sessões (informativo, não somado)", registros: NA, valor: caixaLiquido, situacao: "Informativo" },
      { id: "caixaLedger", conferencia: "Ledger: recebimentos de títulos no período (mesmo fato, fonte canônica)", registros: NA, valor: titleReceipts, situacao: "Informativo" },
    ] })
  const pending = sections.at(-1)!.rows!.filter(r => r.situacao === "Verificar").length
  sections.at(-1)!.metrics = [m("divergences", "Verificações com pendência", pending, undefined, "number")]

  return {
    metrics: sections[0].metrics,
    sections,
    limitations: [
      "Competência × caixa: vendas usam a data da venda; recebimentos e pagamentos usam a data do lançamento no ledger. Recebimento de venda a prazo não é nova venda.",
      "Cada movimento financeiro é contado uma vez. Operações de caixa (sessões) e o histórico dos títulos registram os mesmos fatos e aparecem só na conferência, sem soma.",
      "Transferências entre carteiras, sangria e suprimento não são receita, despesa nem lucro.",
      "CMV, margem e lucro são indisponíveis: não há custo histórico por linha. O custo atual do cadastro não é usado. Compras de estoque pagas não são CMV.",
      "Tipo de produto/acessório usa a configuração de acessório e a categoria atuais do catálogo. Títulos e categorias refletem a posição atual, sem reconstrução histórica.",
      "Origem não comprovada aparece como Não classificado ou Indisponível, sem estimativa. Devoluções entram pela data da devolução; não são rateadas sobre desconto geral.",
      `Lançamentos não classificados no período: ${lt.unclassifiedCount}. Títulos sem saldo comprovado: ${indet(receivable) + indet(payable)}.`,
    ],
  }
}

export function cellRows(rows: Record<string, unknown>[]): Record<string, Cell>[] {
  return rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "number" || typeof v === "string" || v === null ? v : v === undefined ? null : String(v)])))
}
