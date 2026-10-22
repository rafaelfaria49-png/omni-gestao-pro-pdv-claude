import { requireModuleApi } from "@/lib/auth/module-access"
import { listarDocumentos } from "@/lib/pessoas/documentos/service"
import { respostaErro, respostaJson } from "@/lib/pessoas/http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(req: Request) {
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
