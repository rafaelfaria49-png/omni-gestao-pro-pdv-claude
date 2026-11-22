import { requireModuleApi } from "@/lib/auth/module-access"
import { exigirModulo } from "@/lib/pessoas/domain"
import { criarUploadIntent } from "@/lib/pessoas/documentos/service"
import { lerJson, respostaErro, respostaJson } from "@/lib/pessoas/http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function POST(req: Request) {
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
    const data = await criarUploadIntent(body as Parameters<typeof criarUploadIntent>[0])
    return respostaJson({ ok: true, data }, 201)
  } catch (e) {
    return respostaErro(e)
  }
}
