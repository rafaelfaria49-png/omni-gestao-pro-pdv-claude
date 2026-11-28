import {
  requireGestorMoneyApiContext,
  respostaPrivadaJson,
} from "@/lib/gestor-money/server/auth-boundary"
import {
  listarHistoricoLimiteCartaoReal,
  mapearErroIntegracaoReal,
} from "@/lib/gestor-money/server/operations-adapter"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

/**
 * Histórico auditável e imutável de alterações de limite do cartão no perfil autorizado
 * (`consultarHistoricoLimiteCartaoGasto` — `cartoes_limites_eventos`).
 */
export async function GET(
  req: Request,
  context: { params: Promise<{ cartaoId: string }> }
) {
  const { cartaoId } = await context.params
  const url = new URL(req.url)
  const tipo = url.searchParams.get("tipo")
  const perfilId = url.searchParams.get("perfilId")
  const storeId = url.searchParams.get("storeId")
  const seletor =
    tipo === "PESSOAL"
      ? storeId !== null
        ? { tipo, perfilId, storeId }
        : { tipo, perfilId }
      : { tipo, perfilId, storeId }

  const authRes = await requireGestorMoneyApiContext(seletor, "view")
  if (!authRes.ok) return authRes.response

  try {
    const historicoLimites = await listarHistoricoLimiteCartaoReal(authRes.contexto, cartaoId)
    return respostaPrivadaJson({ ok: true, historicoLimites }, 200)
  } catch (error) {
    const mapped = mapearErroIntegracaoReal(error)
    return respostaPrivadaJson({ ok: false, code: mapped.code, error: mapped.message }, mapped.status)
  }
}
