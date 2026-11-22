import { requireModuleApi } from "@/lib/auth/module-access"
import { exigirModulo } from "@/lib/pessoas/domain"
import { autorizarDownload } from "@/lib/pessoas/documentos/service"
import { lerJson, respostaErro, respostaJson } from "@/lib/pessoas/http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  // Flag OFF responde 404 no-store antes de ler sessão ou banco (contrato do módulo Pessoas).
  try {
    exigirModulo()
  } catch (e) {
    return respostaErro(e)
  }
  const moduleDenied = await requireModuleApi(req, "platform")
  if (moduleDenied) return moduleDenied

  try {
    const body = await lerJson(req)
    const { id } = await ctx.params
    const data = await autorizarDownload(String(body.empregadorId ?? ""), id)
    return respostaJson({ ok: true, data })
  } catch (e) {
    return respostaErro(e)
  }
}
