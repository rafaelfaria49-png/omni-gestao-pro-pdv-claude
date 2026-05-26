import { prisma } from "@/lib/prisma"
import type { Prisma } from "@/generated/prisma"

export type IaHistoryMessage = { role: "user" | "assistant"; content: string }

export type IaCachedTurn = {
  type: "text" | "image"
  message: string
  imageUrl?: string
  userMessageId: string
  assistantMessageId: string
}

type MessageMeta = Record<string, unknown>

function metaClientMessageId(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null
  const id = (meta as MessageMeta).clientMessageId
  return typeof id === "string" && id.trim() ? id.trim() : null
}

function metaReplyTo(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null
  const id = (meta as MessageMeta).replyToClientMessageId
  return typeof id === "string" && id.trim() ? id.trim() : null
}

function metaImageUrl(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null
  const url = (meta as MessageMeta).imageUrl
  return typeof url === "string" && url.trim() ? url.trim() : null
}

function metaType(meta: unknown): "text" | "image" {
  if (!meta || typeof meta !== "object") return "text"
  return (meta as MessageMeta).type === "image" ? "image" : "text"
}

function titleFromText(text: string): string {
  const t = text.replace(/\s+/g, " ").trim()
  if (!t) return "Nova conversa"
  return t.length > 72 ? `${t.slice(0, 69)}…` : t
}

async function assertConversationBelongsToStore(storeId: string, conversationId: string) {
  const row = await prisma.iaConversation.findFirst({
    where: { id: conversationId, storeId },
    select: { id: true, model: true, brandVoiceEnabled: true, title: true },
  })
  return row
}

async function findCachedAssistant(
  storeId: string,
  conversationId: string,
  clientMessageId: string,
): Promise<IaCachedTurn | null> {
  const userMsg = await prisma.iaMessage.findFirst({
    where: {
      storeId,
      conversationId,
      role: "user",
      meta: { path: ["clientMessageId"], equals: clientMessageId },
    },
    select: { id: true, createdAt: true },
  })
  if (!userMsg) return null

  const assistant = await prisma.iaMessage.findFirst({
    where: {
      storeId,
      conversationId,
      role: "assistant",
      createdAt: { gte: userMsg.createdAt },
      meta: { path: ["replyToClientMessageId"], equals: clientMessageId },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, content: true, meta: true },
  })
  if (!assistant) return null

  const type = metaType(assistant.meta)
  const imageUrl = metaImageUrl(assistant.meta)
  return {
    type,
    message: assistant.content,
    imageUrl: imageUrl ?? undefined,
    userMessageId: userMsg.id,
    assistantMessageId: assistant.id,
  }
}

async function loadHistoryForLlm(storeId: string, conversationId: string, excludeUserMessageId?: string) {
  const rows = await prisma.iaMessage.findMany({
    where: {
      storeId,
      conversationId,
      role: { in: ["user", "assistant"] },
      ...(excludeUserMessageId ? { id: { not: excludeUserMessageId } } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: 40,
    select: { role: true, content: true },
  })
  const history: IaHistoryMessage[] = rows
    .map((r) => ({
      role: r.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: String(r.content || "").trim(),
    }))
    .filter((m) => m.content)
  return history.slice(-18)
}

export type PrepareTurnInput = {
  storeId: string
  conversationId?: string | null
  clientMessageId: string
  userContent: string
  model: string
  brandVoice: boolean
}

export type PrepareTurnResult =
  | {
      ok: true
      conversationId: string
      userMessageId: string
      history: IaHistoryMessage[]
      cached: IaCachedTurn
    }
  | {
      ok: true
      conversationId: string
      userMessageId: string
      history: IaHistoryMessage[]
      cached: null
    }
  | { ok: false; error: string; status: number }

export async function prepareIaMestreTurn(input: PrepareTurnInput): Promise<PrepareTurnResult> {
  const clientMessageId = input.clientMessageId.trim()
  if (!clientMessageId) {
    return { ok: false, error: "clientMessageId obrigatório", status: 400 }
  }

  const userContent = input.userContent.trim()
  if (!userContent) {
    return { ok: false, error: "Mensagem vazia", status: 400 }
  }

  let conversationId = typeof input.conversationId === "string" ? input.conversationId.trim() : ""

  if (conversationId) {
    const conv = await assertConversationBelongsToStore(input.storeId, conversationId)
    if (!conv) {
      return { ok: false, error: "Conversa não encontrada nesta unidade", status: 404 }
    }
  } else {
    const created = await prisma.iaConversation.create({
      data: {
        storeId: input.storeId,
        title: titleFromText(userContent),
        model: input.model,
        brandVoiceEnabled: input.brandVoice,
      },
      select: { id: true },
    })
    conversationId = created.id
  }

  const cachedEarly = await findCachedAssistant(input.storeId, conversationId, clientMessageId)
  if (cachedEarly) {
    return {
      ok: true,
      conversationId,
      userMessageId: cachedEarly.userMessageId,
      history: await loadHistoryForLlm(input.storeId, conversationId),
      cached: cachedEarly,
    }
  }

  let userMessageId: string
  const existingUser = await prisma.iaMessage.findFirst({
    where: {
      storeId: input.storeId,
      conversationId,
      role: "user",
      meta: { path: ["clientMessageId"], equals: clientMessageId },
    },
    select: { id: true },
  })

  if (existingUser) {
    userMessageId = existingUser.id
  } else {
    const createdUser = await prisma.iaMessage.create({
      data: {
        storeId: input.storeId,
        conversationId,
        role: "user",
        content: userContent,
        meta: { clientMessageId } as Prisma.InputJsonValue,
      },
      select: { id: true },
    })
    userMessageId = createdUser.id
    await prisma.iaConversation.update({
      where: { id: conversationId },
      data: {
        updatedAt: new Date(),
        model: input.model,
        brandVoiceEnabled: input.brandVoice,
      },
    })
  }

  const cachedAfter = await findCachedAssistant(input.storeId, conversationId, clientMessageId)
  if (cachedAfter) {
    return {
      ok: true,
      conversationId,
      userMessageId,
      history: await loadHistoryForLlm(input.storeId, conversationId, userMessageId),
      cached: cachedAfter,
    }
  }

  const history = await loadHistoryForLlm(input.storeId, conversationId, userMessageId)

  return {
    ok: true,
    conversationId,
    userMessageId,
    history,
    cached: null,
  }
}

export type SaveAssistantInput = {
  storeId: string
  conversationId: string
  clientMessageId: string
  content: string
  type: "text" | "image"
  imageUrl?: string
}

export async function saveIaMestreAssistantTurn(input: SaveAssistantInput): Promise<{ assistantMessageId: string }> {
  const existing = await prisma.iaMessage.findFirst({
    where: {
      storeId: input.storeId,
      conversationId: input.conversationId,
      role: "assistant",
      meta: { path: ["replyToClientMessageId"], equals: input.clientMessageId.trim() },
    },
    select: { id: true },
  })
  if (existing) return { assistantMessageId: existing.id }

  const meta = {
    replyToClientMessageId: input.clientMessageId.trim(),
    type: input.type,
    ...(input.type === "image" && input.imageUrl ? { imageUrl: input.imageUrl } : {}),
  } satisfies MessageMeta

  const row = await prisma.iaMessage.create({
    data: {
      storeId: input.storeId,
      conversationId: input.conversationId,
      role: "assistant",
      content: input.content,
      meta: meta as Prisma.InputJsonValue,
    },
    select: { id: true },
  })

  await prisma.iaConversation.update({
    where: { id: input.conversationId },
    data: { updatedAt: new Date() },
  })

  return { assistantMessageId: row.id }
}

export function mapDbMessagesToClient(
  rows: Array<{
    id: string
    role: string
    content: string
    meta: unknown
    createdAt: Date
  }>,
) {
  return rows.map((r) => {
    const type = metaType(r.meta)
    const imageUrl = metaImageUrl(r.meta)
    return {
      id: r.id,
      role: r.role === "assistant" ? ("ai" as const) : ("user" as const),
      content: r.content,
      type,
      imageUrl: imageUrl ?? undefined,
      ...(type === "image" && imageUrl
        ? { image: { url: imageUrl, tool: "API de imagem (servidor)" } }
        : {}),
      createdAt: r.createdAt.toISOString(),
    }
  })
}
