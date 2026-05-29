import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/require-admin"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import { storeIdFromAssistecRequestForRead } from "@/lib/store-id-from-request"
import { getMarketingMediaCredits } from "@/lib/marketing-media-server"
import { validateCredits } from "@/lib/validateCredits"
import { deductCredits } from "@/lib/deductCredits"
import { checkDailyLimit } from "@/lib/usageLimiter"
import { getUserId } from "@/src/lib/auth/getUserId"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function storeIdFrom(req: Request): string | null {
  const h = req.headers.get(ASSISTEC_LOJA_HEADER)?.trim()
  if (h) return h
  return storeIdFromAssistecRequestForRead(req)
}

type Body = {
  style?: string
  imageName?: string
  imageSize?: number
  /** Opcional: id do mascote/imagem no ledger (job id). */
  image_id?: string
  /** Opcional: id do áudio/locução no ledger (job id). */
  audio_id?: string
}

export async function POST(req: Request) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res
  const storeId = storeIdFrom(req)
  if (!storeId) return NextResponse.json({ ok: false, error: "storeId obrigatório" }, { status: 400 })

  const userId = await getUserId()
  let cost = 0
  try {
    await checkDailyLimit({ userId, action: "video" })
    const validated = await validateCredits({ userId, action: "video" })
    cost = validated.cost
  } catch (e) {
    const msg = e instanceof Error ? e.message : "credits_error"
    const isLimit = msg.toLowerCase().includes("limite diário")
    return NextResponse.json(
      { ok: false, error: isLimit ? "daily_limit" : "sem_creditos", message: msg },
      { status: isLimit ? 429 : 402 }
    )
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const style = typeof body.style === "string" ? body.style.slice(0, 48) : "cinematic"
  const imageName = typeof body.imageName === "string" ? body.imageName.slice(0, 240) : ""
  const imageId = typeof body.image_id === "string" ? body.image_id.slice(0, 64) : ""
  const audioId = typeof body.audio_id === "string" ? body.audio_id.slice(0, 64) : ""

  const jobId = `video-${Date.now()}`

  try {
    // Créditos por LOJA não são debitados aqui (apenas ledger/log).
    const creditsRemaining = await getMarketingMediaCredits(storeId).catch(() => 0)
    const job = await prisma.marketingMediaJob.create({
      data: {
        storeId,
        kind: "VIDEO",
        kindV2: "VIDEO",
        creditsAfter: creditsRemaining,
        meta: {
          status: "PENDING",
          stage: "preparing",
          progress: 10,
          jobId,
          style,
          imageName,
          imageSize: body.imageSize,
          image_id: imageId || null,
          audio_id: audioId || null,
          hint: "Lip-sync será integrado via LivePortrait/Hedra; por enquanto mock mantém contrato e progresso.",
        },
      },
      select: { id: true },
    })

    // Mock pipeline com progresso (pontos de estágio exigidos).
    await prisma.marketingMediaJob.update({
      where: { id: job.id },
      data: { meta: { status: "RUNNING", stage: "lipSync", progress: 55, jobId, style, image_id: imageId, audio_id: audioId } },
    })

    await prisma.marketingMediaJob.update({
      where: { id: job.id },
      data: {
        meta: {
          status: "DONE",
          stage: "finalizing",
          progress: 100,
          jobId,
          style,
          image_id: imageId || null,
          audio_id: audioId || null,
          previewVideoUrl: null,
          message: "Job premium concluído (mock). Integração lip-sync real entra na próxima iteração.",
        },
      },
    })

    await deductCredits({ userId, action: "video", cost })

    return NextResponse.json({
      ok: true,
      mock: true,
      beta: true,
      creditsRemaining,
      jobId,
      /** Sem URL real no mock — o cliente usa poster local + estado “gerado”. */
      previewVideoUrl: null as string | null,
      message: "Job premium de vídeo/lip-sync registrado (mock).",
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "video_error"
    // Log best-effort (sem estornar crédito da loja, pois não debitamos).
    try {
      await prisma.marketingMediaJob.create({
        data: { storeId, kind: "VIDEO", kindV2: "VIDEO", meta: { status: "ERROR", error: msg, jobId } },
      })
    } catch {}
    const credits = await getMarketingMediaCredits(storeId).catch(() => 0)
    return NextResponse.json(
      { ok: false, error: "video_error", creditsRemaining: credits, message: "Falha ao gerar vídeo." },
      { status: 502 }
    )
  }
}
