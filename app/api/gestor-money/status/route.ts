import { NextResponse } from "next/server"
import { CONTRATOS_FUNDACAO_PADRAO } from "@/lib/gestor-money/gateway"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

/**
 * Sonda somente leitura de prontidão da fundação Gestor Money (G001–G006).
 *
 * - Não executa escrita nem migration.
 * - Não altera flags hospedadas.
 * - Não expõe segredos ou dados financeiros.
 * - Informa de forma honesta que a fundação PR #405 ainda precisa ser reconciliada.
 */
export async function GET() {
  const moduleEnabled = process.env.GESTOR_MONEY_ENABLED === "true"
  const foundationMerged = false

  const res = NextResponse.json(
    {
      ok: true,
      moduleEnabled,
      foundationMerged,
      state: foundationMerged
        ? moduleEnabled
          ? "READY"
          : "MODULE_DISABLED"
        : "FOUNDATION_PENDING_PR405",
      mensagem:
        "Fundação G001–G006 aguardando reconciliação definitiva da PR #405. Nenhum dado simulado é retornado no modo real.",
      contratos: CONTRATOS_FUNDACAO_PADRAO,
    },
    { status: 200 }
  )
  res.headers.set("Cache-Control", "private, no-store, max-age=0")
  return res
}
