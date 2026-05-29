/**
 * POST /api/vendas/[id]/corrigir
 *
 * Correção segura de venda — permite alterar:
 *   - forma de pagamento (com ajuste em MovimentacaoFinanceira)
 *   - cliente vinculado
 *   - observação
 *
 * NÃO altera itens, total, estoque nem status.
 * Exige PIN de supervisor quando há correção financeira.
 * Registra auditoria completa em Venda.payload.correcoes[].
 */
import { NextResponse } from "next/server"
import { prisma, prismaEnsureConnected } from "@/lib/prisma"
import { opsLojaIdFromRequest } from "@/lib/ops-api-gate"
import { auth } from "@/auth"
import { getOperatorLabelFromSession } from "@/lib/auth/session-operator"
import type { PaymentBreakdownFull } from "@/lib/operations-sale-types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const PAYMENT_KEYS: (keyof PaymentBreakdownFull)[] = [
  "dinheiro", "pix", "cartaoDebito", "cartaoCredito", "carne", "aPrazo", "creditoVale",
]

const PAYMENT_LABELS: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  cartaoDebito: "Débito",
  cartaoCredito: "Crédito",
  carne: "Carnê",
  aPrazo: "A Prazo",
  creditoVale: "Vale/Crédito",
}

function arredonda2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100
}

function describePayment(pb: Partial<PaymentBreakdownFull>): string {
  return PAYMENT_KEYS
    .filter((k) => (pb[k] ?? 0) > 0)
    .map((k) => PAYMENT_LABELS[k] ?? k)
    .join(" + ") || "—"
}

type CorrigirBody = {
  motivo: string
  supervisorPin?: string
  novaFormaPagamento?: Partial<PaymentBreakdownFull>
  novoClienteId?: string | null
  novoClienteNome?: string | null
  novaObservacao?: string | null
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const storeId = opsLojaIdFromRequest(req)
  if (!storeId) return NextResponse.json({ error: "storeId obrigatório" }, { status: 400 })
  const { id: rawId } = await params
  const pedidoId = rawId?.trim()

  if (!pedidoId) {
    return NextResponse.json({ ok: false, error: "ID da venda obrigatório" }, { status: 400 })
  }

  let body: CorrigirBody
  try {
    body = (await req.json()) as CorrigirBody
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 })
  }

  const { motivo, supervisorPin, novaFormaPagamento, novoClienteId, novoClienteNome, novaObservacao } = body

  if (!motivo?.trim()) {
    return NextResponse.json({ ok: false, error: "Motivo da correção é obrigatório" }, { status: 400 })
  }

  const hasPaymentChange = !!novaFormaPagamento
  const hasClienteChange = novoClienteId !== undefined
  const hasObsChange = novaObservacao !== undefined

  if (!hasPaymentChange && !hasClienteChange && !hasObsChange) {
    return NextResponse.json({ ok: false, error: "Nenhuma alteração informada" }, { status: 400 })
  }

  try {
    await prismaEnsureConnected()

    // Validar PIN de supervisor para correção financeira
    let supervisorName = "Supervisor"
    if (hasPaymentChange) {
      if (!supervisorPin?.trim()) {
        return NextResponse.json(
          { ok: false, error: "PIN de supervisor obrigatório para correção financeira", code: "pin_required" },
          { status: 403 },
        )
      }
      const admin = await prisma.user.findFirst({
        where: { pin: supervisorPin.trim(), OR: [{ role: "ADMIN" }, { role: "admin" }] },
        select: { id: true, name: true },
      })
      if (!admin) {
        return NextResponse.json(
          { ok: false, error: "PIN de supervisor inválido", code: "pin_invalid" },
          { status: 401 },
        )
      }
      supervisorName = admin.name || "Supervisor"
    }

    const session = await auth()
    const operador = session?.user ? getOperatorLabelFromSession(session) : "Operador"

    const venda = await prisma.venda.findFirst({
      where: { pedidoId, storeId },
    })

    if (!venda) {
      return NextResponse.json({ ok: false, error: "Venda não encontrada" }, { status: 404 })
    }

    if (venda.status === "cancelada") {
      return NextResponse.json({ ok: false, error: "Não é possível corrigir uma venda cancelada" }, { status: 409 })
    }

    const payload = (venda.payload && typeof venda.payload === "object" ? venda.payload : {}) as Record<string, unknown>
    const oldPb = (payload.paymentBreakdown ?? {}) as Partial<PaymentBreakdownFull>
    const now = new Date()

    const correcao: Record<string, unknown> = {
      at: now.toISOString(),
      operador,
      motivo: motivo.trim(),
      campos: [] as string[],
    }
    const campos = correcao.campos as string[]

    const updateData: Record<string, unknown> = {}
    const newPayload = { ...payload }

    // --- Correção de forma de pagamento ---
    let financeiroCorrected = false
    if (hasPaymentChange) {
      const newPb: Partial<PaymentBreakdownFull> = {}
      let newTotal = 0
      for (const k of PAYMENT_KEYS) {
        const v = arredonda2(Number(novaFormaPagamento[k]) || 0)
        if (v > 0) newPb[k] = v
        newTotal += v
      }

      if (arredonda2(newTotal) !== arredonda2(venda.total)) {
        return NextResponse.json(
          {
            ok: false,
            error: `Total da nova forma de pagamento (R$ ${arredonda2(newTotal).toFixed(2)}) difere do total da venda (R$ ${arredonda2(venda.total).toFixed(2)}). Itens e total não podem ser alterados.`,
            code: "total_mismatch",
          },
          { status: 422 },
        )
      }

      correcao.pagamentoAnterior = describePayment(oldPb)
      correcao.pagamentoNovo = describePayment(newPb)
      correcao.pagamentoAnteriorDetalhe = { ...oldPb }
      correcao.pagamentoNovoDetalhe = { ...newPb }
      correcao.supervisorNome = supervisorName
      campos.push("formaPagamento")

      newPayload.paymentBreakdown = newPb

      // Ajustar MovimentacaoFinanceira: a descrição da movimentação original (origem:"venda")
      // é atualizada para refletir a nova forma. NÃO criamos nem deletamos movimentações —
      // o valor total permanece igual, apenas a descrição muda.
      await prisma.$transaction(async (tx) => {
        const movFin = await tx.movimentacaoFinanceira.findFirst({
          where: { storeId, referenciaId: pedidoId, tipo: "entrada", origem: "venda" },
        })
        if (movFin) {
          const newDesc = `Venda ${pedidoId} — ${describePayment(newPb)}` +
            ` (corrigido de ${describePayment(oldPb)} em ${now.toLocaleDateString("pt-BR")})`
          await tx.movimentacaoFinanceira.update({
            where: { id: movFin.id },
            data: { descricao: newDesc },
          })
          financeiroCorrected = true
        }
      })
    }

    // --- Correção de cliente ---
    if (hasClienteChange) {
      correcao.clienteAnterior = venda.clienteNome ?? null
      correcao.clienteNovo = novoClienteNome ?? null
      correcao.clienteIdAnterior = venda.clienteId ?? null
      correcao.clienteIdNovo = novoClienteId ?? null
      campos.push("cliente")

      updateData.clienteNome = novoClienteNome ?? null
      updateData.clienteId = novoClienteId ?? null

      if (novoClienteId) {
        const cpfPayload = payload.customerCpf
        const cliente = await prisma.cliente.findUnique({
          where: { id: novoClienteId },
          select: { document: true, name: true },
        })
        if (cliente) {
          newPayload.customerCpf = cliente.document ?? cpfPayload ?? null
          newPayload.customerName = cliente.name ?? novoClienteNome ?? null
        }
      } else {
        newPayload.customerCpf = null
        newPayload.customerName = novoClienteNome ?? null
      }
    }

    // --- Correção de observação ---
    if (hasObsChange) {
      correcao.observacaoAnterior = (payload.observacao as string) ?? null
      correcao.observacaoNova = novaObservacao ?? null
      campos.push("observacao")
      newPayload.observacao = novaObservacao ?? null
    }

    // Append correção ao histórico
    const correcoes = Array.isArray(newPayload.correcoes) ? [...(newPayload.correcoes as unknown[])] : []
    correcoes.push(correcao)
    newPayload.correcoes = correcoes

    await prisma.venda.update({
      where: { id: venda.id },
      data: {
        ...updateData,
        payload: newPayload as unknown as import("@/generated/prisma").Prisma.InputJsonValue,
      },
    })

    return NextResponse.json({
      ok: true,
      pedidoId,
      campos,
      financeiroCorrected,
      correcao,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[vendas/corrigir]", msg)
    return NextResponse.json(
      { ok: false, error: "Falha ao corrigir venda", detail: process.env.NODE_ENV === "development" ? msg : undefined },
      { status: 503 },
    )
  }
}
