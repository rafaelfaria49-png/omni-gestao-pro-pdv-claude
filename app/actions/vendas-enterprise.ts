"use server"

import { prisma } from "@/lib/prisma"

type ItemDetalhe = {
  inventoryId: string
  nome?: string
  imei?: string
  serial?: string
  garantiaDias?: number
  observacao?: string
}

type EnterpriseEnrichInput = {
  pedidoId: string
  storeId: string
  clienteId?: string
  clienteNome?: string
  clienteDocument?: string
  clienteTelefone?: string
  clienteEmail?: string
  observacoesVenda?: string
  linhasDetalhe?: ItemDetalhe[]
}

const MAX_RETRIES = 6
const RETRY_DELAY_MS = 700

/**
 * Enriquece o payload JSONB de uma Venda já persistida com dados enterprise
 * (IMEI, serial, garantia por item, dados completos do cliente).
 * Usa retry porque `/api/ops/venda-persist` é fire-and-forget e pode chegar
 * alguns centésimos depois da transação local.
 */
export async function enrichVendaEnterprise(
  input: EnterpriseEnrichInput
): Promise<{ ok: boolean }> {
  const { pedidoId, storeId, ...enterpriseData } = input
  if (!pedidoId || !storeId) return { ok: false }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
    }

    const venda = await prisma.venda.findFirst({
      where: { pedidoId, storeId },
      select: { id: true, payload: true },
    })

    if (!venda) continue

    const payloadAtual = (venda.payload as Record<string, unknown>) ?? {}
    const novoPayload: Record<string, unknown> = {
      ...payloadAtual,
      enterprise: {
        ...enterpriseData,
        enrichedAt: new Date().toISOString(),
      },
    }

    await prisma.venda.update({
      where: { id: venda.id },
      data: { payload: novoPayload as never },
    })

    return { ok: true }
  }

  return { ok: false }
}
