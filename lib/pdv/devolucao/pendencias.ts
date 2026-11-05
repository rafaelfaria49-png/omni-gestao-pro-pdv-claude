/**
 * PDV-F8-FINALIZACAO-COMPLETA-001 — classificação das devoluções do terminal que NÃO
 * estão (ou não estão mais) confirmadas pelo servidor. Puro: sem IO, sem React.
 *
 * Categoria (o que já aconteceu com o cliente):
 *  - DINHEIRO_ENTREGUE   — reembolso legado (`tipo: "devolucao"`): o dinheiro já saiu da gaveta.
 *  - VALE_EMITIDO        — vale local entregue ao cliente (pode ter sido impresso).
 *  - INTENCAO_SEM_EFEITO — só estoque/intenção: nada financeiro foi entregue.
 *
 * Estado (onde a pendência está):
 *  - AGUARDANDO_SINCRONIZACAO — na fila, tentando normalmente.
 *  - AGUARDANDO_VENDA_ORIGEM  — o servidor não conhece a venda de origem; espera a venda chegar.
 *  - BLOQUEIO_PERSISTENTE     — a venda de origem não chegou dentro do limite: a retentativa
 *                               automática PARA e exige reconciliação supervisionada.
 *  - RECUSA_DEFINITIVA        — o servidor recusou (nada gravado).
 *  - ENCAMINHADA_FINANCEIRO   — já tem referência de conciliação no servidor.
 */
import type { DevolucaoRecord, SaleRecord } from "@/lib/operations-sale-types"

export type CategoriaPendencia = "DINHEIRO_ENTREGUE" | "VALE_EMITIDO" | "INTENCAO_SEM_EFEITO"
export type EstadoPendencia =
  | "AGUARDANDO_SINCRONIZACAO"
  | "AGUARDANDO_VENDA_ORIGEM"
  | "BLOQUEIO_PERSISTENTE"
  | "RECUSA_DEFINITIVA"
  | "ENCAMINHADA_FINANCEIRO"

export const AGUARDANDO_VENDA_ORIGEM = "AGUARDANDO_VENDA_ORIGEM"

/**
 * Limite da espera pela venda de origem. Com a venda ainda na fila DESTE navegador a
 * espera é natural (ela vai subir) até 24 h; sem ela aqui, 5 tentativas em 30 min.
 */
export const LIMITE_ESPERA_VENDA_ORIGEM = { tentativas: 5, minMs: 30 * 60 * 1000, maxMs: 24 * 60 * 60 * 1000 }

const arred = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100

export function categoriaPendencia(d: Pick<DevolucaoRecord, "tipo" | "mode" | "creditIssued">): CategoriaPendencia {
  if (d.tipo === "devolucao") return "DINHEIRO_ENTREGUE"
  if ((d.creditIssued ?? 0) > 0) return "VALE_EMITIDO"
  return "INTENCAO_SEM_EFEITO"
}

/** Valor que o terminal diz ter entregue (dinheiro) ou emitido (vale). Só declaração. */
export function valorDeclaradoPendencia(d: Pick<DevolucaoRecord, "tipo" | "mode" | "creditIssued" | "lines">): number {
  const cat = categoriaPendencia(d)
  if (cat === "VALE_EMITIDO") return arred(d.creditIssued)
  if (cat === "DINHEIRO_ENTREGUE") return arred(d.lines.reduce((s, l) => s + (l.valor || 0), 0))
  return 0
}

export function bloqueioPersistenteVendaOrigem(
  d: Pick<DevolucaoRecord, "syncWaitingCode" | "syncWaitingSince" | "syncAttempts">,
  nowMs: number,
  vendaOrigemNaFilaLocal: boolean,
): boolean {
  if (d.syncWaitingCode !== AGUARDANDO_VENDA_ORIGEM || !d.syncWaitingSince) return false
  const desde = Date.parse(d.syncWaitingSince)
  if (!Number.isFinite(desde)) return true // data corrompida: não tenta para sempre
  const idade = nowMs - desde
  if (idade >= LIMITE_ESPERA_VENDA_ORIGEM.maxMs) return true
  if (vendaOrigemNaFilaLocal) return false
  return (d.syncAttempts ?? 0) >= LIMITE_ESPERA_VENDA_ORIGEM.tentativas && idade >= LIMITE_ESPERA_VENDA_ORIGEM.minMs
}

export function estadoPendencia(d: DevolucaoRecord): EstadoPendencia | null {
  // Outra aba/terminal encaminhou: o servidor recusa a gravação com este código.
  if (d.conciliacao?.ref || d.syncRejectedCode === "DEVOLUCAO_ENCAMINHADA_FINANCEIRO") return "ENCAMINHADA_FINANCEIRO"
  if (d.syncRejectedCode) return "RECUSA_DEFINITIVA"
  if (d.syncPending !== true) return null
  if (d.syncBlocked) return "BLOQUEIO_PERSISTENTE"
  if (d.syncWaitingCode === AGUARDANDO_VENDA_ORIGEM) return "AGUARDANDO_VENDA_ORIGEM"
  return "AGUARDANDO_SINCRONIZACAO"
}

export type PendenciaDevolucao = {
  dev: DevolucaoRecord
  categoria: CategoriaPendencia
  estado: EstadoPendencia
  valorDeclarado: number
  /** Exige ação humana: recusa/bloqueio com dinheiro ou vale já entregue, sem encaminhamento. */
  exigeConciliacaoManual: boolean
  motivo: string
}

const MOTIVO: Record<EstadoPendencia, string> = {
  AGUARDANDO_SINCRONIZACAO: "Aguardando confirmação do servidor.",
  AGUARDANDO_VENDA_ORIGEM: "A venda de origem ainda não chegou ao servidor; a devolução espera por ela (nada gravado).",
  BLOQUEIO_PERSISTENTE:
    "A venda de origem não chegou ao servidor dentro do prazo: a retentativa automática parou. Exige reconciliação supervisionada.",
  RECUSA_DEFINITIVA: "Recusada pelo servidor — nada foi gravado.",
  ENCAMINHADA_FINANCEIRO: "Encaminhada ao Financeiro para conciliação manual.",
}

export function listarPendenciasDevolucao(devolucoes: DevolucaoRecord[]): PendenciaDevolucao[] {
  const out: PendenciaDevolucao[] = []
  for (const dev of devolucoes) {
    const estado = estadoPendencia(dev)
    if (!estado) continue
    const categoria = categoriaPendencia(dev)
    const exige =
      (estado === "RECUSA_DEFINITIVA" || estado === "BLOQUEIO_PERSISTENTE") && categoria !== "INTENCAO_SEM_EFEITO"
    const motivo =
      estado === "RECUSA_DEFINITIVA"
        ? `${MOTIVO[estado]} ${dev.syncRejectedReason || dev.syncRejectedCode || ""}`.trim()
        : estado === "AGUARDANDO_VENDA_ORIGEM" || estado === "BLOQUEIO_PERSISTENTE"
          ? `${MOTIVO[estado]}${dev.syncAttempts ? ` (${dev.syncAttempts} tentativa(s))` : ""}`
          : MOTIVO[estado]
    out.push({
      dev,
      categoria,
      estado,
      valorDeclarado: valorDeclaradoPendencia(dev),
      exigeConciliacaoManual: exige,
      motivo,
    })
  }
  return out
}

/** Quantidade devolvida por linha de venda, respeitando linhas repetidas do mesmo item. */
export function distribuirQtyReturned<L extends { inventoryId: string; quantity: number; qtyReturned?: number }>(
  lines: L[],
  inventoryId: string,
  delta: number,
): L[] {
  let resto = Math.round(delta)
  const out = lines.map((l) => ({ ...l }))
  if (resto > 0) {
    for (const l of out) {
      if (resto <= 0) break
      if (l.inventoryId !== inventoryId) continue
      const livre = Math.max(0, l.quantity - (l.qtyReturned ?? 0))
      const usa = Math.min(livre, resto)
      if (usa > 0) {
        l.qtyReturned = (l.qtyReturned ?? 0) + usa
        resto -= usa
      }
    }
  } else if (resto < 0) {
    for (let i = out.length - 1; i >= 0 && resto < 0; i--) {
      const l = out[i]!
      if (l.inventoryId !== inventoryId) continue
      const tira = Math.min(l.qtyReturned ?? 0, -resto)
      if (tira > 0) {
        l.qtyReturned = (l.qtyReturned ?? 0) - tira
        resto += tira
      }
    }
  }
  return out
}

export type ResumoTrocasSessao = {
  trocas: number
  devolucoesConfirmadas: number
  creditosEmitidos: number
  creditosUtilizados: number
  /** Recebido além do vale nas vendas que usaram vale nesta sessão. */
  diferencasRecebidas: number
  pendentes: number
  aguardandoVendaOrigem: number
  /** Bloqueio persistente (retentativa parada) — qualquer categoria. */
  bloqueados: number
  recusasDefinitivas: number
  conciliacaoManual: number
  encaminhadas: number
}

/**
 * Resumo informativo para a conferência/fechamento: NÃO altera saldo, não lança nada.
 * Créditos e devoluções contam só o que o servidor confirmou (`syncPending !== true`
 * e sem recusa); o resto aparece como pendência.
 */
export function resumoTrocasDevolucoesSessao(
  devolucoes: DevolucaoRecord[],
  sales: SaleRecord[],
  sessaoId: string | null | undefined,
): ResumoTrocasSessao {
  const daSessao = (s?: string) => !sessaoId || s === sessaoId
  const devs = devolucoes.filter((d) => daSessao(d.sessaoId))
  // Encaminhada ao Financeiro NÃO foi gravada (vale local estornado): não conta como confirmada.
  const confirmadas = devs.filter((d) => d.syncPending !== true && !d.syncRejectedCode && !d.conciliacao?.ref)
  const pend = listarPendenciasDevolucao(devs)
  let creditosUtilizados = 0
  let diferencasRecebidas = 0
  for (const s of sales) {
    if (!daSessao(s.sessaoId) || s.syncPending === true) continue
    const vale = Number(s.paymentBreakdown?.creditoVale) || 0
    if (vale <= 0) continue
    creditosUtilizados += vale
    diferencasRecebidas += Math.max(0, (Number(s.total) || 0) - vale)
  }
  return {
    trocas: confirmadas.filter((d) => d.tipo === "troca").length,
    devolucoesConfirmadas: confirmadas.length,
    creditosEmitidos: arred(confirmadas.reduce((t, d) => t + (d.creditIssued || 0), 0)),
    creditosUtilizados: arred(creditosUtilizados),
    diferencasRecebidas: arred(diferencasRecebidas),
    pendentes: pend.filter((p) => p.estado === "AGUARDANDO_SINCRONIZACAO").length,
    aguardandoVendaOrigem: pend.filter((p) => p.estado === "AGUARDANDO_VENDA_ORIGEM").length,
    bloqueados: pend.filter((p) => p.estado === "BLOQUEIO_PERSISTENTE").length,
    recusasDefinitivas: pend.filter((p) => p.estado === "RECUSA_DEFINITIVA").length,
    conciliacaoManual: pend.filter((p) => p.exigeConciliacaoManual).length,
    encaminhadas: pend.filter((p) => p.estado === "ENCAMINHADA_FINANCEIRO").length,
  }
}
