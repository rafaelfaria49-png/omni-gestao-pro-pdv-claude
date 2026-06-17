/**
 * Planner PURO da correção de ITENS de uma venda (Workspace F2).
 *
 * Recebe as linhas ANTIGAS e as NOVAS (draft) + total e breakdown atuais, e decide:
 *   1. o novo total (recalculado server-side, NÃO confia no lineTotal do cliente);
 *   2. o delta de estoque por produto (baixar a mais / devolver), pulando linhas virtuais;
 *   3. a reconciliação financeira mínima (à vista) — o delta de total cai em `dinheiro`;
 *   4. a trilha de auditoria (adicionados / removidos / alterados).
 *
 * NÃO toca o banco. A rota executa o plano reusando o padrão de
 * `upsertVendaInTransaction` (resolução id|sku|barcode, baixa anti-negativa) e o
 * ledger `MovimentacaoEstoque`.
 *
 * Fronteira de segurança da F2 (à vista pura):
 *  - venda com `aPrazo > 0` ou `creditoVale > 0` é BLOQUEADA aqui — ajustar itens
 *    com saldo a prazo/vale exige o motor de pagamento/cliente (fases futuras).
 *  - o financeiro à vista é UMA movimentação agregada (= total). Ao mudar o total,
 *    o delta é absorvido por `dinheiro`. Se isso deixaria `dinheiro` negativo, BLOQUEIA.
 */

import type { PaymentBreakdownFull } from "@/lib/operations-sale-types"
import { isVirtualSaleLine } from "@/lib/os-pdv-virtual-lines"
import { normalizeBreakdown } from "@/lib/financeiro/correcao-pagamento-plan"

const EPS = 0.005

export function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100
}

export interface CorrecaoLineInput {
  inventoryId: string
  nome: string
  quantidade: number
  precoUnitario: number
  /** Desconto absoluto (R$) aplicado na linha. lineTotal = qty*unit − desconto. */
  desconto?: number
  /** Item avulso (INSERT) — não baixa estoque mesmo com inventoryId. */
  isAvulso?: boolean
}

export interface CorrecaoLineResolved {
  inventoryId: string
  nome: string
  quantidade: number
  precoUnitario: number
  desconto: number
  lineTotal: number
  isAvulso: boolean
  /** true quando a linha NÃO toca estoque (avulso ou OS). */
  virtual: boolean
}

export interface StockDelta {
  inventoryId: string
  nome: string
  /** > 0 = baixar a mais do estoque; < 0 = devolver ao estoque. */
  deltaQty: number
}

export type CorrecaoItensErrorCode =
  | "sem_itens"
  | "linha_invalida"
  | "no_change"
  | "aprazo_ou_vale_bloqueado"
  | "caixa_nao_absorve"

export interface CorrecaoItensPlan {
  ok: boolean
  errorCode?: CorrecaoItensErrorCode
  error?: string

  oldTotal: number
  newTotal: number
  deltaTotal: number

  oldLines: CorrecaoLineResolved[]
  newLines: CorrecaoLineResolved[]

  stockDeltas: StockDelta[]
  /** true se há algum delta de baixa (> 0) — exige checagem anti-negativa no servidor. */
  requiresStockCheck: boolean

  oldBreakdown: PaymentBreakdownFull
  /** Breakdown reconciliado: delta de total absorvido por `dinheiro`. */
  newBreakdown: PaymentBreakdownFull
  /** Valor-alvo da MovimentacaoFinanceira(origem:"venda") à vista = newTotal. */
  cashEntryTarget: number

  changes: {
    added: CorrecaoLineResolved[]
    removed: CorrecaoLineResolved[]
    modified: Array<{ antes: CorrecaoLineResolved; depois: CorrecaoLineResolved }>
  }
}

function resolveLine(l: CorrecaoLineInput): CorrecaoLineResolved | null {
  const inventoryId = typeof l.inventoryId === "string" ? l.inventoryId.trim() : ""
  const nome = typeof l.nome === "string" ? l.nome.trim() : ""
  const quantidade = Math.max(0, Math.round(Number(l.quantidade) || 0))
  const precoUnitario = round2(Number(l.precoUnitario) || 0)
  const desconto = round2(Math.max(0, Number(l.desconto) || 0))
  if (!inventoryId || !nome || quantidade <= 0) return null
  const lineTotal = round2(Math.max(0, precoUnitario * quantidade - desconto))
  const virtual = isVirtualSaleLine(inventoryId) || l.isAvulso === true
  return { inventoryId, nome, quantidade, precoUnitario, desconto, lineTotal, isAvulso: l.isAvulso === true, virtual }
}

function qtyByInventory(lines: CorrecaoLineResolved[]): Map<string, { qty: number; nome: string }> {
  const m = new Map<string, { qty: number; nome: string }>()
  for (const l of lines) {
    if (l.virtual) continue // avulso/OS não tocam estoque
    const cur = m.get(l.inventoryId)
    if (cur) cur.qty += l.quantidade
    else m.set(l.inventoryId, { qty: l.quantidade, nome: l.nome })
  }
  return m
}

function lineSignature(l: CorrecaoLineResolved): string {
  return `${l.inventoryId}|${l.quantidade}|${l.precoUnitario}|${l.desconto}|${l.nome}`
}

export function computeCorrecaoItensPlan(input: {
  oldLines: CorrecaoLineInput[]
  newLines: CorrecaoLineInput[]
  oldTotal: number
  oldBreakdown?: Partial<PaymentBreakdownFull> | null
}): CorrecaoItensPlan {
  const oldBreakdown = normalizeBreakdown(input.oldBreakdown)
  const oldResolved: CorrecaoLineResolved[] = []
  for (const l of input.oldLines ?? []) {
    const r = resolveLine(l)
    if (r) oldResolved.push(r)
  }

  const newResolved: CorrecaoLineResolved[] = []
  for (const l of input.newLines ?? []) {
    const r = resolveLine(l)
    if (!r) {
      return baseFail("linha_invalida", "Há item inválido (nome/quantidade/preço). Revise as linhas.", input.oldTotal, oldBreakdown, oldResolved)
    }
    newResolved.push(r)
  }

  if (newResolved.length === 0) {
    return baseFail("sem_itens", "A venda precisa ter pelo menos um item.", input.oldTotal, oldBreakdown, oldResolved)
  }

  const oldTotal = round2(input.oldTotal)
  const newTotal = round2(newResolved.reduce((s, l) => s + l.lineTotal, 0))
  const deltaTotal = round2(newTotal - oldTotal)

  // Nada mudou (idempotência / duplo-clique).
  const oldSig = oldResolved.map(lineSignature).sort().join("§")
  const newSig = newResolved.map(lineSignature).sort().join("§")
  if (oldSig === newSig) {
    return baseFail("no_change", "Nenhuma alteração nos itens.", oldTotal, oldBreakdown, oldResolved)
  }

  // Fronteira F2: só à vista pura.
  if (oldBreakdown.aPrazo > EPS || oldBreakdown.creditoVale > EPS) {
    return baseFail(
      "aprazo_ou_vale_bloqueado",
      "Esta venda tem valor à prazo ou vale/crédito. A correção de itens com saldo a prazo/vale chega em fase futura — use Cancelamento ou Devolução/Troca.",
      oldTotal, oldBreakdown, oldResolved,
    )
  }

  // Delta de estoque por inventoryId (real, não-virtual).
  const oldQty = qtyByInventory(oldResolved)
  const newQty = qtyByInventory(newResolved)
  const allIds = new Set<string>([...oldQty.keys(), ...newQty.keys()])
  const stockDeltas: StockDelta[] = []
  for (const id of allIds) {
    const before = oldQty.get(id)?.qty ?? 0
    const after = newQty.get(id)?.qty ?? 0
    const deltaQty = after - before
    if (deltaQty === 0) continue
    const nome = newQty.get(id)?.nome ?? oldQty.get(id)?.nome ?? id
    stockDeltas.push({ inventoryId: id, nome, deltaQty })
  }
  const requiresStockCheck = stockDeltas.some((d) => d.deltaQty > 0)

  // Reconciliação financeira à vista: delta de total absorvido por `dinheiro`.
  const newBreakdown = normalizeBreakdown(oldBreakdown)
  newBreakdown.dinheiro = round2(newBreakdown.dinheiro + deltaTotal)
  if (newBreakdown.dinheiro < -EPS) {
    return baseFail(
      "caixa_nao_absorve",
      "A redução de itens é maior que a parcela em dinheiro do pagamento. Ajuste o pagamento (fase futura) ou faça uma Devolução.",
      oldTotal, oldBreakdown, oldResolved,
    )
  }
  newBreakdown.dinheiro = round2(Math.max(0, newBreakdown.dinheiro))

  // Auditoria: added / removed / modified (casado por inventoryId).
  const oldByKey = new Map<string, CorrecaoLineResolved>()
  for (const l of oldResolved) oldByKey.set(l.inventoryId, l)
  const newByKey = new Map<string, CorrecaoLineResolved>()
  for (const l of newResolved) newByKey.set(l.inventoryId, l)

  const added: CorrecaoLineResolved[] = []
  const removed: CorrecaoLineResolved[] = []
  const modified: Array<{ antes: CorrecaoLineResolved; depois: CorrecaoLineResolved }> = []
  for (const [id, nl] of newByKey) {
    const ol = oldByKey.get(id)
    if (!ol) added.push(nl)
    else if (lineSignature(ol) !== lineSignature(nl)) modified.push({ antes: ol, depois: nl })
  }
  for (const [id, ol] of oldByKey) {
    if (!newByKey.has(id)) removed.push(ol)
  }

  return {
    ok: true,
    oldTotal,
    newTotal,
    deltaTotal,
    oldLines: oldResolved,
    newLines: newResolved,
    stockDeltas,
    requiresStockCheck,
    oldBreakdown,
    newBreakdown,
    cashEntryTarget: newTotal, // à vista pura ⇒ entrada = total
    changes: { added, removed, modified },
  }
}

function baseFail(
  code: CorrecaoItensErrorCode,
  error: string,
  oldTotal: number,
  oldBreakdown: PaymentBreakdownFull,
  oldLines: CorrecaoLineResolved[],
): CorrecaoItensPlan {
  return {
    ok: false,
    errorCode: code,
    error,
    oldTotal: round2(oldTotal),
    newTotal: round2(oldTotal),
    deltaTotal: 0,
    oldLines,
    newLines: [],
    stockDeltas: [],
    requiresStockCheck: false,
    oldBreakdown,
    newBreakdown: oldBreakdown,
    cashEntryTarget: round2(oldTotal),
    changes: { added: [], removed: [], modified: [] },
  }
}
