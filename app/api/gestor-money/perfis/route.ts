import {
  listarPerfisAutorizadosServidor,
  respostaPrivadaJson,
} from "@/lib/gestor-money/server/auth-boundary"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

/**
 * Lista perfis financeiros (PESSOAL e EMPRESA) autorizados exclusivamente
 * a partir da sessão do servidor e vínculos reais no PostgreSQL (G001).
 */
export async function GET() {
  const res = await listarPerfisAutorizadosServidor()
  if (!res.ok) return res.response
  return respostaPrivadaJson({ ok: true, perfis: res.perfis }, 200)
}
