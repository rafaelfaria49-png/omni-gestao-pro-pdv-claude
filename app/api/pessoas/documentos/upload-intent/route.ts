import { criarUploadIntent } from "@/lib/pessoas/documentos/service"
import { lerJson, respostaErro, respostaJson } from "@/lib/pessoas/http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function POST(req: Request) {
  try {
    const body = await lerJson(req)
    const data = await criarUploadIntent(body as Parameters<typeof criarUploadIntent>[0])
    return respostaJson({ ok: true, data }, 201)
  } catch (e) {
    return respostaErro(e)
  }
}
