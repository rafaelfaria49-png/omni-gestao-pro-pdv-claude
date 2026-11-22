import { requireModuleApi } from "@/lib/auth/module-access"
import { exigirModulo } from "@/lib/pessoas/domain"
import { listarDocumentos } from "@/lib/pessoas/documentos/service"
import { respostaErro, respostaJson } from "@/lib/pessoas/http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(req: Request) {
  // Flag OFF responde 404 no-store antes de ler sessão ou banco (contrato do módulo Pessoas).
  try {
    exigirModulo()
  } catch (e) {
    return respostaErro(e)
  }
  const moduleDenied = await requireModuleApi(req, "platform")
  if (moduleDenied) return moduleDenied

  try {
    const url = new URL(req.url)
    const data = await listarDocumentos(
      url.searchParams.get("empregadorId") ?? "",
      url.searchParams.get("vinculoId") ?? "",
    )
    return respostaJson({ ok: true, data })
  } catch (e) {
    return respostaErro(e)
  }
}
