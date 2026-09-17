/**
 * Timeline REAL da venda — GOAL CAIXA-CONFERENCIA-VENDAS-ACOES-REAIS-007 (§6).
 *
 * Constrói o histórico EXCLUSIVAMENTE a partir do que está persistido e chega em
 * `GET /api/vendas/[id]?full=1`. Regra inegociável do GOAL: **não inventar evento**.
 * Quando um campo não existe (venda antiga, operador não gravado, motivo em branco) o
 * evento sai com o campo ausente e a UI mostra "Informação não registrada na venda
 * original" — nunca um valor plausível fabricado.
 *
 * Função pura: sem React, sem fetch, sem Prisma.
 */

import type {
  VendaDetalhe,
  VendaDetalheDevolucao,
  VendaDetalheMovimentacao,
} from "@/lib/vendas/venda-detalhe-contract"

export type VendaEventoTipo =
  | "venda_criada"
  | "pagamento"
  | "titulo_gerado"
  | "recebimento"
  | "devolucao"
  | "troca"
  | "vale_gerado"
  | "correcao"
  | "estorno_financeiro"
  | "cancelamento"

export type VendaEvento = {
  /** ISO. Eventos sem data própria herdam a data do fato que os originou. */
  at: string
  tipo: VendaEventoTipo
  titulo: string
  /** Complemento factual (ex.: itens devolvidos, forma de pagamento). */
  descricao?: string
  valor?: number
  operador?: string
  motivo?: string
  /** Número/id do documento relacionado (devolução, título, movimentação). */
  referencia?: string
  /** Supervisor que co-assinou — só existe quando foi gravado. */
  autorizador?: string
}

/** Texto único para campo que a venda original simplesmente não registrou. */
export const SEM_REGISTRO = "Informação não registrada na venda original."

function limpar(v: string | null | undefined): string | undefined {
  const s = typeof v === "string" ? v.trim() : ""
  return s.length > 0 ? s : undefined
}

function valorPositivo(n: number | null | undefined): number | undefined {
  return typeof n === "number" && Number.isFinite(n) && n > 0.005 ? n : undefined
}

const DEVOLUCAO_LABEL: Record<string, string> = {
  troca: "Troca de produtos",
  vale_credito: "Devolução com vale-crédito",
  somente_estoque: "Devolução (somente estoque)",
  devolucao: "Devolução",
}

function descreverItens(itens: VendaDetalheDevolucao["itens"]): string | undefined {
  if (!Array.isArray(itens) || itens.length === 0) return undefined
  return itens.map((i) => `${i.quantidade}× ${i.nome}`).join(", ")
}

/**
 * Movimentação de estorno do cancelamento. Não vira evento próprio: é o detalhe
 * financeiro do evento de cancelamento (mesma operação, um registro só na timeline).
 */
function isEstornoCancelamento(m: VendaDetalheMovimentacao): boolean {
  return m.tipo === "saida" && m.origem === "cancelamento_pdv"
}

/** Entrada do ledger gerada pela própria venda — já representada por "Venda criada". */
function isEntradaDaVenda(m: VendaDetalheMovimentacao): boolean {
  return m.tipo === "entrada" && m.origem === "venda"
}

/** Saída de devolução — já representada pelo evento da devolução. */
function isSaidaDeDevolucao(m: VendaDetalheMovimentacao): boolean {
  return m.tipo === "saida" && m.origem === "devolucao_pdv"
}

/**
 * Monta a timeline em ordem cronológica crescente. Eventos com o mesmo instante
 * mantêm a ordem de inserção (criação → pagamento → títulos → pós-venda → cancelamento).
 */
export function buildVendaTimeline(d: VendaDetalhe): VendaEvento[] {
  const eventos: VendaEvento[] = []

  // 1. Criação da venda — sempre existe (é a própria linha).
  eventos.push({
    at: d.at,
    tipo: "venda_criada",
    titulo: "Venda criada",
    valor: d.total,
    operador: limpar(d.operador),
    referencia: d.id,
    descricao: limpar(d.terminal?.code) ?? undefined,
  })

  // 2. Formas de pagamento registradas na venda (payload.paymentBreakdown).
  for (const p of d.pagamentos ?? []) {
    const valor = valorPositivo(p.valor)
    if (valor === undefined) continue
    eventos.push({
      at: d.at,
      tipo: "pagamento",
      titulo: `Pagamento — ${p.label}`,
      valor,
    })
  }

  // 3. Títulos a receber gerados (venda à prazo/carnê) e o que já foi recebido deles.
  for (const t of d.titulos ?? []) {
    eventos.push({
      at: t.createdAt,
      tipo: "titulo_gerado",
      titulo: "Título a receber gerado",
      descricao: limpar(t.descricao),
      valor: t.valor,
      referencia: t.localKey,
    })
    const pago = valorPositivo(t.pago)
    if (pago !== undefined) {
      // O título guarda a SOMA recebida, não a data de cada baixa — a timeline mostra
      // o agregado ancorado no título, sem inventar uma data de recebimento.
      eventos.push({
        at: t.createdAt,
        tipo: "recebimento",
        titulo: "Recebimento do título",
        descricao: t.status === "pago" ? "Título quitado" : "Recebimento parcial",
        valor: pago,
        referencia: t.localKey,
      })
    }
  }

  // 4. Devoluções e trocas vinculadas — cada documento é um evento.
  for (const dev of d.devolucoes ?? []) {
    const ehTroca = dev.tipo === "troca" || dev.modo === "troca_imediata"
    eventos.push({
      at: dev.at,
      tipo: ehTroca ? "troca" : "devolucao",
      titulo: DEVOLUCAO_LABEL[dev.tipo] ?? "Devolução",
      descricao: descreverItens(dev.itens),
      valor: valorPositivo(dev.valorTotal),
      operador: limpar(dev.operador),
      motivo: limpar(dev.motivo),
      referencia: dev.localId,
    })
    const credito = valorPositivo(dev.creditoEmitido)
    if (credito !== undefined) {
      eventos.push({
        at: dev.at,
        tipo: "vale_gerado",
        titulo: "Vale-crédito emitido",
        valor: credito,
        referencia: dev.localId,
      })
    }
  }

  // 5. Correções registradas em payload.correcoes[] — trazem o supervisor autorizador.
  for (const c of d.correcoes ?? []) {
    eventos.push({
      at: c.at,
      tipo: "correcao",
      titulo: "Correção da venda",
      descricao: Array.isArray(c.campos) && c.campos.length > 0 ? c.campos.join(", ") : undefined,
      operador: limpar(c.operador),
      motivo: limpar(c.motivo),
      autorizador: limpar(c.supervisorNome),
    })
  }

  // 6. Estorno/cancelamento — um único evento com o efeito financeiro anexado.
  if (d.canceladaEm) {
    const estorno = (d.movimentacoesFinanceiras ?? []).find(isEstornoCancelamento)
    const efeitos: string[] = []
    if (d.estoqueReposto) efeitos.push("estoque reposto")
    if (estorno || d.estornoFinanceiro) efeitos.push("estorno financeiro")
    eventos.push({
      at: d.canceladaEm,
      tipo: "cancelamento",
      titulo: "Venda estornada",
      descricao: efeitos.length > 0 ? efeitos.join(" · ") : undefined,
      valor: estorno ? estorno.valor : undefined,
      operador: limpar(d.canceladaPor),
      motivo: limpar(d.motivoCancelamento),
      referencia: d.id,
    })
  }

  // 7. Demais movimentações do ledger que não são eco de eventos já listados.
  for (const m of d.movimentacoesFinanceiras ?? []) {
    if (isEntradaDaVenda(m) || isSaidaDeDevolucao(m) || isEstornoCancelamento(m)) continue
    eventos.push({
      at: m.createdAt,
      tipo: "estorno_financeiro",
      titulo: m.tipo === "saida" ? "Saída financeira" : "Entrada financeira",
      descricao: limpar(m.descricao),
      valor: valorPositivo(m.valor),
      referencia: m.origem,
    })
  }

  return eventos
    .map((e, i) => ({ e, i, t: Date.parse(e.at) }))
    .sort((a, b) => {
      const ta = Number.isFinite(a.t) ? a.t : 0
      const tb = Number.isFinite(b.t) ? b.t : 0
      return ta === tb ? a.i - b.i : ta - tb
    })
    .map((x) => x.e)
}
