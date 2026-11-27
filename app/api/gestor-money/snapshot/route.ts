import { erroConsultaFinanceira } from "@/lib/gastos/query"
import {
  requireGestorMoneyApiContext,
  respostaPrivadaJson,
} from "@/lib/gestor-money/server/auth-boundary"
import { obterSnapshotReal } from "@/lib/gestor-money/server/snapshot-adapter"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(req: Request) {
  const url = new URL(req.url)
  const tipo = url.searchParams.get("tipo")
  const perfilId = url.searchParams.get("perfilId")
  const storeId = url.searchParams.get("storeId")
  const dataInicio = url.searchParams.get("dataInicio") || undefined
  const dataFim = url.searchParams.get("dataFim") || undefined

  // PESSOAL nunca aceita storeId (nem vazio) — qualquer envio de storeId em PESSOAL é rejeitado pelo schema estrito.
  const seletor =
    tipo === "PESSOAL"
      ? storeId !== null
        ? { tipo, perfilId, storeId }
        : { tipo, perfilId }
      : { tipo, perfilId, storeId }

  const authRes = await requireGestorMoneyApiContext(seletor, "view")
  if (!authRes.ok) return authRes.response

  try {
    const snapshot = await obterSnapshotReal(authRes.contexto, { dataInicio, dataFim })
    return respostaPrivadaJson({ ok: true, snapshot }, 200)
  } catch (error) {
    const mapped = erroConsultaFinanceira(error)
    return respostaPrivadaJson(mapped.body, mapped.status)
  }
}
