import "server-only"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { getPermissionsFromSession } from "@/lib/auth/enterprise-permissions"
import { resolveBusinessResource } from "@/lib/store-business-capabilities"
import { explicitCapabilityEnabled } from "@/lib/store-business-capabilities"
import type { StoreCapabilitiesV1 } from "@/lib/capabilities-persistence-v1"
import { validarComercialVenda, type ComercialFail, type ComercialVendaV1 } from "./contrato"

/**
 * Prepara `payload.comercial` no servidor ANTES da transação da venda (rotas V1/V2).
 * Sem `comercial` no pedido: só características derivadas, sem nenhuma leitura adicional de banco.
 */
export async function prepararComercialDaVenda(args: {
  storeId: string
  sale: { comercial?: unknown; sessaoId?: unknown; at?: unknown; lines?: unknown; paymentBreakdown?: Record<string, unknown> | null }
  operadorLabel?: string
  agora?: Date
  /** Identidade da tentativa: V2 = clientSaleId; V1 = pedidoId. */
  identidade: { clientSaleId?: string | null; pedidoId?: string | null }
}): Promise<{ ok: true; comercial: ComercialVendaV1 | null; allowClosedOriginalSession: boolean; replay?: boolean } | ComercialFail> {
  const agora = args.agora ?? new Date()
  const pedido = args.sale.comercial
  // Venda comum: nada é acrescentado ao payload (regressão zero); características são derivadas na leitura.
  if (pedido === undefined || pedido === null) return { ok: true, comercial: null, allowClosedOriginalSession: false }
  // Revisão independente P1-2: reenvio de venda JÁ GRAVADA (resposta perdida após o COMMIT) não é
  // revalidado contra relógio/permissão/flag de agora — segue para o replay idempotente do motor,
  // que devolve a venda existente sem reescrever o payload.
  const { clientSaleId, pedidoId } = args.identidade
  if (clientSaleId || pedidoId) {
    const existente = await prisma.venda.findFirst({
      where: { storeId: args.storeId, ...(clientSaleId ? { clientSaleId } : { pedidoId: pedidoId! }) },
      select: { id: true },
    })
    if (existente) return { ok: true, comercial: null, allowClosedOriginalSession: false, replay: true }
  }
  const settings = await prisma.storeSettings.findUnique({ where: { storeId: args.storeId }, select: { printerConfig: true } })
  const caps = (settings?.printerConfig as { capabilities?: StoreCapabilitiesV1 } | null)?.capabilities ?? null
  const override = caps?.overrides?.["sales.retroactive"]
  const limiteDias = override && typeof override === "object" && typeof override.limiteDias === "number" ? override.limiteDias : null
  const session = await auth()
  const perms = getPermissionsFromSession(session, args.storeId)
  const retro = (pedido && typeof pedido === "object" ? (pedido as { retroativa?: { modo?: unknown } }).retroativa : undefined)
  const sessaoId = typeof args.sale.sessaoId === "string" ? args.sale.sessaoId : null
  const sessao = retro?.modo === "regularizacao" && sessaoId
    ? await prisma.sessaoCaixa.findFirst({ where: { id: sessaoId, storeId: args.storeId }, select: { id: true, status: true, abertaEm: true, fechadaEm: true } })
    : null
  return validarComercialVenda(args.sale, {
    agora,
    operador: args.operadorLabel ?? "",
    recursos: {
      retroativa: resolveBusinessResource(caps, "sales.retroactive").operational && explicitCapabilityEnabled(override) === true,
      brindes: resolveBusinessResource(caps, "sales.gifts").operational,
    },
    limiteDias,
    podeRetroativa: perms.pdv.cancelarVenda === true,
    sessao: sessao ? { id: sessao.id, status: String(sessao.status), abertaEm: sessao.abertaEm, fechadaEm: sessao.fechadaEm } : null,
  })
}
