import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { autorizarCron } from "@/lib/saas/cron-auth"
import { executarCronSaas } from "@/lib/saas/cron"

/**
 * Cron comercial da plataforma (OMNI-SAAS-001A). Chamado pelo Vercel Cron com
 * `Authorization: Bearer $CRON_SECRET`. Sem segredo → 503; segredo errado → 401 — em ambos os
 * casos NENHUMA consulta ao banco é feita. Resposta só com contagens (sem dado pessoal).
 */

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

const NO_STORE = { "Cache-Control": "no-store, max-age=0" }

export async function GET(req: Request) {
  const decisao = autorizarCron(req.headers.get("authorization"), process.env.CRON_SECRET)
  if (!decisao.ok) return NextResponse.json({ ok: false, erro: decisao.erro }, { status: decisao.status, headers: NO_STORE })
  try {
    const resumo = await executarCronSaas(prisma)
    return NextResponse.json({ ok: true, ...resumo }, { headers: NO_STORE })
  } catch {
    console.error("[saas] cron_falhou")
    return NextResponse.json({ ok: false, erro: "falha_interna" }, { status: 500, headers: NO_STORE })
  }
}
