import "server-only"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { resolveAparelhoApi } from "@/lib/aparelhos/api-gate"
import { resolveBusinessResource, type BusinessResourceKey } from "@/lib/store-business-capabilities"
import type { StoreCapabilitiesV1 } from "@/lib/capabilities-persistence-v1"
import type { AparelhoCtx } from "@/lib/aparelhos/service"
import { comercialInstalado } from "./instalacao"
import { auth } from "@/auth"
import { getPermissionsFromSession } from "@/lib/auth/enterprise-permissions"
import type { FinanceiroAcesso } from "./custos/service"

/**
 * Gate HTTP comercial (OMNI-COMMERCIAL-ENTERPRISE-EVOLUTION-001).
 * Herda TODA a prova do gate de Aparelhos (sessão, módulo `deviceCatalog`, loja autorizada pelo
 * servidor, recurso de IMEI ligado, migration de aparelhos instalada) e acrescenta:
 *   recurso comercial explícito da loja → migration comercial instalada (senão 503, nunca 500).
 * Hierarquia preservada: plano contratado → recurso disponível → configuração da loja → permissão.
 */
export async function resolveComercialApi(
  req: Request,
  write: boolean,
  recurso: BusinessResourceKey,
): Promise<{ ok: true; ctx: AparelhoCtx; capabilities: StoreCapabilitiesV1 | null; financeiro: FinanceiroAcesso } | { ok: false; response: NextResponse }> {
  const gate = await resolveAparelhoApi(req, "hub", write)
  if (!gate.ok) return gate
  const settings = await prisma.storeSettings.findUnique({ where: { storeId: gate.ctx.storeId }, select: { printerConfig: true } })
  const capabilities = (settings?.printerConfig as { capabilities?: StoreCapabilitiesV1 } | null)?.capabilities ?? null
  const r = resolveBusinessResource(capabilities, recurso)
  if (!r.operational) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, code: "RECURSO_DESATIVADO", error: "Recurso desligado nesta unidade. Ative em Configurações → Ramo e recursos.", recurso, faltando: r.missing },
        { status: 403 },
      ),
    }
  }
  if (!(await comercialInstalado(prisma))) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, code: "COMERCIAL_NAO_INSTALADO", error: "Os recursos comerciais ainda não foram instalados no banco desta implantação. Procure o administrador." },
        { status: 503 },
      ),
    }
  }
  // Permissão financeira pelo papel enterprise (revisão P2-7): ratear/criar obrigação exige Financeiro.
  const perms = getPermissionsFromSession(await auth(), gate.ctx.storeId)
  return { ok: true, ctx: gate.ctx, capabilities, financeiro: { view: perms.financeiro.view === true, edit: perms.financeiro.edit === true } }
}
