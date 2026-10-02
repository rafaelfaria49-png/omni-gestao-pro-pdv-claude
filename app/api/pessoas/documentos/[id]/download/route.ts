import { autorizarDownload } from "@/lib/pessoas/documentos/service"
import { lerJson, respostaErro, respostaJson } from "@/lib/pessoas/http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const body = await lerJson(req)
    const { id } = await ctx.params
    const data = await autorizarDownload(String(body.empregadorId ?? ""), id)
    return respostaJson({ ok: true, data })
  } catch (e) {
    return respostaErro(e)
  }
}
