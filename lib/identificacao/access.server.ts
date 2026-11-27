import "server-only"
import { requireModuleAction } from "@/lib/auth/module-access"
import { requireCadastrosActionAccess } from "@/lib/cadastros/cadastros-action-access"
import { cadastrosAuditPrincipalFromSession } from "@/lib/cadastros/cadastros-audit-principal"
import type { CatalogContext } from "@/lib/vestuario/catalog-service"
import type { Result } from "./contracts"
import { identificationEnabled } from "./feature-flags.server"

export async function identificationAccess(storeId: unknown): Promise<Result<CatalogContext>> {
  const sid = typeof storeId === "string" ? storeId.trim() : ""
  const denied = { ok: false as const, code: "UNTRUSTED", message: "Identificação e etiquetas não estão disponíveis para esta loja/sessão." }
  // Gate de loja e ambiente antes da sessão, do banco e do motor de PDF.
  if (!sid || !identificationEnabled(sid)) return denied
  try {
    await requireModuleAction(sid, "catalog")
    const access = await requireCadastrosActionAccess(sid, "hub")
    const principal = cadastrosAuditPrincipalFromSession(access.session)
    if (!principal || !identificationEnabled(access.storeId)) return denied
    return { ok: true, value: { storeId: access.storeId, principal } }
  } catch { return denied }
}
