import { NextResponse } from "next/server"
import { getDesktopDownloadState } from "@/lib/desktop-distribution/download-state"

/**
 * Manifesto de atualização lido pelo programa Windows (`apps/desktop/src/main/updates.ts`).
 *
 * Fica na MESMA origem do sistema porque o desktop só aceita manifesto da origem fixada no
 * empacotamento. Só JSON: o executável é servido pela CDN de downloads, nunca por esta função.
 * Sem release pública aprovada (assinada, conferida, flag ligada) → 404, e o programa diz
 * "nenhuma versão publicada" sem avisar nada.
 */
export async function GET(request: Request) {
  const state = await getDesktopDownloadState()
  if (state.status !== "available") {
    return NextResponse.json({ error: "sem release pública" }, { status: 404, headers: { "Cache-Control": "no-store" } })
  }
  const { release } = state
  return NextResponse.json(
    {
      channel: "production",
      version: release.version,
      downloadPageUrl: new URL("/baixar", request.url).toString(),
      sha256: release.sha256,
      signed: true,
      notes: release.notes ?? undefined,
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}
