import {
  requireGestorMoneyApiContext,
  respostaPrivadaJson,
} from "@/lib/gestor-money/server/auth-boundary"
import { obterDownloadComprovantePrivadoReal } from "@/lib/gestor-money/server/documents-adapter"
import { mapearErroIntegracaoReal } from "@/lib/gestor-money/server/operations-adapter"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

/**
 * Emite URL temporária assinada (TTL <= 60s) para download privado de comprovante G003.
 * Exige autorização server-side no perfil dono (`requireGestorMoneyApiContext` + RLS) e
 * verificação SHA-256 dos bytes antes de emitir a capability temporária.
 */
export async function GET(
  req: Request,
  context: { params: Promise<{ documentoId: string }> }
) {
  const { documentoId } = await context.params
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
    const download = await obterDownloadComprovantePrivadoReal(authRes.contexto, documentoId)
    return respostaPrivadaJson(
      {
        ok: true,
        documento: download.documento,
        signedUrl: download.signedUrl,
        expiresInSec: download.expiresInSec,
      },
      200
    )
  } catch (error) {
    const mapped = mapearErroIntegracaoReal(error)
    return respostaPrivadaJson({ ok: false, code: mapped.code, error: mapped.message }, mapped.status)
  }
}
