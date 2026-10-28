import { lerDisponibilidade } from "@/lib/pessoas/readers/disponibilidade"
import { respostaErro, respostaJson } from "@/lib/pessoas/http"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0
export async function GET() {
  try { return respostaJson(await lerDisponibilidade()) }
  catch (error) { return respostaErro(error) }
}
