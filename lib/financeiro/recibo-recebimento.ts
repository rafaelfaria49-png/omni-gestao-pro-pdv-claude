/**
 * Comprovante de recebimento reconstruído a partir do LIVRO-RAZÃO do título
 * (`payload.historico`) — base da 2ª via (reimpressão sem nova baixa).
 *
 * Módulo puro (sem Prisma/React): roda no harness `node` do Vitest.
 *
 * Regras:
 *  - só entradas `pagamento`/`liquidacao` geram comprovante; valor = o que o servidor
 *    gravou na entrada, nunca o valor bruto do título;
 *  - uma operação em lote (mesmo `loteId` em N títulos) vira UM comprovante consolidado;
 *  - pagamento estornado (`estorno_pagamento.refHistoricoIndex` ou `estorno_titulo`
 *    posterior) NÃO tem 2ª via — o dinheiro foi devolvido;
 *  - saldo restante do título = valor − soma líquida do ledger ATÉ aquela entrada
 *    (inclusive), na ordem gravada.
 */

import { normalizeNomeCliente } from "@/lib/contas-receber-cliente-match"

const EPS = 0.009

function money(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v)
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : ""
}

export type PagamentoLedger = {
  /** Índice da entrada no `historico` — identidade estável do pagamento no título. */
  index: number
  tipo: "pagamento" | "liquidacao"
  valor: number
  at: string | null
  formaPagamento: string | null
  /** Identidade da operação (lote PDV, recebimento do Financeiro ou chave do singular). */
  loteId: string | null
  estornado: boolean
  saldoDepois: number
}

/** Pagamentos registrados no título, com o saldo que sobrou depois de cada um. */
export function pagamentosDoLedger(payload: unknown, valorTitulo: number): PagamentoLedger[] {
  const hist = isRecord(payload) && Array.isArray(payload.historico) ? payload.historico : []
  const estornadosIdx = new Set<number>()
  /** Último `estorno_titulo`: todo pagamento ANTERIOR a ele foi devolvido. */
  let estornoTituloIdx = -1
  let totalEstornado = 0
  hist.forEach((e, i) => {
    if (!isRecord(e)) return
    const t = str(e.tipo).toLowerCase()
    if (t === "estorno_pagamento") {
      const v = Number(e.valor)
      totalEstornado += Number.isFinite(v) ? v : 0
      if (typeof e.refHistoricoIndex === "number") estornadosIdx.add(e.refHistoricoIndex)
    }
    if (t === "estorno_titulo") estornoTituloIdx = i
  })

  // Fail-closed: se o ledger devolveu mais dinheiro do que os pagamentos referenciados
  // somam (estorno sem ref, ref órfã, dois estornos no mesmo índice), não dá para saber
  // QUAL pagamento foi devolvido — nenhum deles ganha 2ª via.
  let referenciado = 0
  for (const i of estornadosIdx) {
    const e = hist[i]
    const t = isRecord(e) ? str(e.tipo).toLowerCase() : ""
    if (t === "pagamento" || t === "liquidacao") referenciado += Number((e as Record<string, unknown>).valor) || 0
  }
  const ambiguo = totalEstornado > referenciado + EPS

  const out: PagamentoLedger[] = []
  let pago = 0
  hist.forEach((e, i) => {
    if (!isRecord(e)) return
    const t = str(e.tipo).toLowerCase()
    const v = Number(e.valor)
    const valor = Number.isFinite(v) ? v : 0
    if (t === "pagamento" || t === "liquidacao") pago += valor
    if (t === "estorno_pagamento") pago -= valor
    if (t !== "pagamento" && t !== "liquidacao") return
    out.push({
      index: i,
      tipo: t,
      valor: money(valor),
      at: str(e.at) || null,
      formaPagamento: str(e.formaPagamento) || null,
      loteId: str(e.loteId) || null,
      estornado: ambiguo || estornadosIdx.has(i) || i < estornoTituloIdx,
      saldoDepois: money(Math.max(0, valorTitulo - pago)),
    })
  })
  return out
}

export type TituloLedger = {
  id: string
  localKey: string | null
  descricao: string
  cliente: string
  valor: number
  payload: unknown
}

export type ReciboReconstruido = {
  operacaoId: string | null
  cliente: string
  recebidoEm: string | null
  formaPagamento: string | null
  itens: Array<{ localKey: string; descricao: string; valorRecebido: number; saldoRestante: number }>
  totalRecebido: number
}

export type ReconstrucaoErro =
  | "pagamento_nao_encontrado"
  | "pagamento_estornado"
  | "operacao_incompleta"

/**
 * Monta o comprovante de UMA operação.
 *  - `loteId`: junta, em todos os títulos fornecidos, as entradas com essa identidade;
 *  - sem `loteId`: usa a entrada `index` do título `localKey` (pagamento avulso antigo).
 * Se qualquer entrada da operação foi estornada, a 2ª via é recusada.
 */
export function reconstruirReciboRecebimento(
  titulos: TituloLedger[],
  alvo: { loteId?: string | null; localKey?: string | null; index?: number | null },
): { ok: true; recibo: ReciboReconstruido } | { ok: false; code: ReconstrucaoErro } {
  const loteId = str(alvo.loteId)
  type Hit = { titulo: TituloLedger; pagamentos: PagamentoLedger[] }
  const hits: Hit[] = []
  for (const t of titulos) {
    const pags = pagamentosDoLedger(t.payload, Number(t.valor) || 0)
    const escolhidos = loteId
      ? pags.filter((p) => p.loteId === loteId)
      : (t.localKey ?? t.id) === str(alvo.localKey) || t.id === str(alvo.localKey)
        ? pags.filter((p) => p.index === alvo.index)
        : []
    if (escolhidos.length > 0) hits.push({ titulo: t, pagamentos: escolhidos })
  }
  if (hits.length === 0) return { ok: false, code: "pagamento_nao_encontrado" }
  if (hits.some((h) => h.pagamentos.some((p) => p.estornado))) return { ok: false, code: "pagamento_estornado" }

  const itens = hits.map((h) => {
    const ultimo = h.pagamentos[h.pagamentos.length - 1]!
    return {
      localKey: h.titulo.localKey ?? h.titulo.id,
      descricao: h.titulo.descricao || "Título",
      valorRecebido: money(h.pagamentos.reduce((s, p) => s + p.valor, 0)),
      saldoRestante: ultimo.saldoDepois,
    }
  })
  const todos = hits.flatMap((h) => h.pagamentos)
  const datas = todos.map((p) => p.at).filter((d): d is string => !!d).sort()
  const formas = [...new Set(todos.map((p) => p.formaPagamento).filter((f): f is string => !!f))]
  // Mesma pessoa com grafias diferentes ("João"/"Joao") não quebra a 2ª via.
  const nomes = new Set(hits.map((h) => normalizeNomeCliente(h.titulo.cliente)).filter(Boolean))
  if (nomes.size > 1) return { ok: false, code: "operacao_incompleta" }
  const clientes = hits.map((h) => h.titulo.cliente.trim()).filter(Boolean)

  return {
    ok: true,
    recibo: {
      operacaoId: loteId || null,
      cliente: clientes[0] ?? "—",
      recebidoEm: datas[0] ?? null,
      formaPagamento: formas.length === 1 ? formas[0]! : formas.length > 1 ? formas.join(" + ") : null,
      itens,
      totalRecebido: money(itens.reduce((s, i) => s + i.valorRecebido, 0)),
    },
  }
}

/** Lista as operações (comprovantes possíveis) de um título, mais recente primeiro. */
export function operacoesDoTitulo(
  titulo: TituloLedger,
): Array<{ index: number; loteId: string | null; valor: number; at: string | null; estornado: boolean }> {
  return pagamentosDoLedger(titulo.payload, Number(titulo.valor) || 0)
    .map((p) => ({ index: p.index, loteId: p.loteId, valor: p.valor, at: p.at, estornado: p.estornado }))
    .reverse()
}

/** Hora (ISO) gravada no ledger para a operação `loteId` neste título, ou `null`. */
export function momentoDaOperacao(payload: unknown, loteId: string | null | undefined): string | null {
  const key = str(loteId)
  if (!key) return null
  const ats = pagamentosDoLedger(payload, 0).filter((p) => p.loteId === key).map((p) => p.at).filter((a): a is string => !!a)
  return ats.sort()[0] ?? null
}

export const RECIBO_EPS = EPS
