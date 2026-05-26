import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { guardIaMestreApiRead } from "@/lib/ia-mestre/api-guard"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(req: Request) {
  const guard = await guardIaMestreApiRead(req)
  if (!guard.ok) return guard.response

  const url = new URL(req.url)
  const take = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? "30") || 30))

  try {
    const rows = await prisma.iaConversation.findMany({
      where: { storeId: guard.storeId },
      orderBy: { updatedAt: "desc" },
      take,
      select: {
        id: true,
        title: true,
        model: true,
        brandVoiceEnabled: true,
        updatedAt: true,
        createdAt: true,
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { content: true, role: true },
        },
      },
    })

    const conversations = rows.map((c) => {
      const last = c.messages[0]
      const preview = last
        ? `${last.role === "user" ? "Você" : "IA"}: ${String(last.content).slice(0, 80)}`
        : ""
      return {
        id: c.id,
        title: c.title || "Nova conversa",
        model: c.model,
        brandVoiceEnabled: c.brandVoiceEnabled,
        updatedAt: c.updatedAt.toISOString(),
        createdAt: c.createdAt.toISOString(),
        preview,
      }
    })

    return NextResponse.json({ ok: true, storeId: guard.storeId, conversations })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao listar conversas"
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
