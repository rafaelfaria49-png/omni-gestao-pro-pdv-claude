import { prisma } from "@/lib/prisma"
import { LEGACY_PRIMARY_STORE_ID } from "@/lib/store-defaults"
import type { Prisma } from "@/generated/prisma"
import {
  assertValidWhatsAppRecipientDigits,
  firstOutboundWamid,
  sendMediaMessage as cloudSendMedia,
  sendTemplateMessage as cloudSendTemplate,
  sendTextMessage as cloudSendText,
  type TemplateComponent,
} from "@/lib/whatsapp"

export type ContactInput = {
  phoneDigits: string
  displayName?: string
  waExternalId?: string
  profilePicUrl?: string
  metadata?: Prisma.InputJsonValue
}

export type MessageInput = {
  direction: "inbound" | "outbound"
  body: string
  messageType?: string
  externalMessageId?: string
  payload?: Prisma.InputJsonValue
}

function normalizeDigits(raw: string): string {
  return String(raw || "").replace(/\D/g, "")
}

export function webhookDefaultStoreId(): string {
  const env = process.env.WHATSAPP_WEBHOOK_STORE_ID?.trim()
  return env && env.length > 0 ? env : LEGACY_PRIMARY_STORE_ID
}

export async function logWebhookPayload(storeId: string, raw: unknown): Promise<void> {
  const payload =
    raw !== null && typeof raw === "object"
      ? (raw as Prisma.InputJsonValue)
      : ({ _primitive: raw } as Prisma.InputJsonValue)
  await prisma.whatsAppAutomationLog.create({
    data: {
      storeId,
      automationId: null,
      level: "info",
      action: "webhook_ingress",
      message: "Payload recebido (Cloud API / provedor). Sem envio automático nesta camada.",
      payload,
    },
  })
}

export async function createOrUpdateContact(storeId: string, input: ContactInput) {
  const phoneDigits = normalizeDigits(input.phoneDigits)
  if (!phoneDigits) throw new Error("phoneDigits obrigatório")

  const displayName = (input.displayName ?? "").trim() || `WhatsApp ${phoneDigits}`
  const waExternalId = (input.waExternalId ?? "").trim()
  const profilePicUrl = (input.profilePicUrl ?? "").trim()

  return prisma.whatsAppContact.upsert({
    where: {
      whatsapp_contact_store_phone: { storeId, phoneDigits },
    },
    create: {
      storeId,
      phoneDigits,
      displayName,
      waExternalId,
      profilePicUrl,
      metadata: input.metadata === undefined ? undefined : input.metadata,
    },
    update: {
      displayName,
      ...(waExternalId ? { waExternalId } : {}),
      ...(profilePicUrl ? { profilePicUrl } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata as Prisma.InputJsonValue } : {}),
    },
  })
}

export async function createConversation(
  storeId: string,
  contactId: string,
  extra?: { externalThreadId?: string; metadata?: Prisma.InputJsonValue }
) {
  const contact = await prisma.whatsAppContact.findFirst({
    where: { id: contactId, storeId },
  })
  if (!contact) throw new Error("Contato não encontrado nesta loja")

  const externalThreadId = (extra?.externalThreadId ?? "").trim()

  return prisma.whatsAppConversation.create({
    data: {
      storeId,
      contactId,
      externalThreadId,
      metadata: extra?.metadata === undefined ? undefined : extra.metadata,
    },
    include: { contact: true },
  })
}

/**
 * Tenta encontrar um `Cliente` cadastrado cujo telefone (dígitos) corresponda
 * ao phoneDigits do contato WhatsApp. Usado para vincular `clienteId` na conversa.
 */
export async function matchClienteByPhone(storeId: string, phoneDigits: string): Promise<string | null> {
  if (!phoneDigits) return null
  const digits = normalizeDigits(phoneDigits)
  if (!digits) return null

  // Tenta sufixos: número completo, últimos 11 dígitos (com DDD), últimos 9 dígitos
  const suffixes = [digits, digits.slice(-11), digits.slice(-9)].filter((s) => s.length >= 8)

  for (const suffix of suffixes) {
    const cliente = await prisma.cliente.findFirst({
      where: {
        storeId,
        phone: { endsWith: suffix.replace(/\D/g, "") },
        active: true,
      },
      select: { id: true },
    })
    if (cliente) return cliente.id
  }
  return null
}

export async function findOrCreateOpenConversation(storeId: string, contactId: string, phoneDigits?: string) {
  const existing = await prisma.whatsAppConversation.findFirst({
    where: { storeId, contactId, status: "open" },
    orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
  })
  if (existing) {
    // Tenta vincular clienteId retroativamente se ainda não vinculado
    if (!existing.clienteId && phoneDigits) {
      const clienteId = await matchClienteByPhone(storeId, phoneDigits)
      if (clienteId) {
        await prisma.whatsAppConversation.update({
          where: { id: existing.id },
          data: { clienteId },
        })
      }
    }
    return existing
  }

  const clienteId = phoneDigits ? await matchClienteByPhone(storeId, phoneDigits) : null
  return prisma.whatsAppConversation.create({
    data: { storeId, contactId, status: "open", unreadCount: 0, clienteId },
  })
}

export async function addMessage(storeId: string, conversationId: string, msg: MessageInput) {
  const conv = await prisma.whatsAppConversation.findFirst({
    where: { id: conversationId, storeId },
  })
  if (!conv) throw new Error("Conversa não encontrada")

  const body = (msg.body ?? "").trim()
  if (!body) throw new Error("Mensagem vazia")

  const created = await prisma.$transaction(async (tx) => {
    const m = await tx.whatsAppMessage.create({
      data: {
        storeId,
        conversationId,
        direction: msg.direction,
        body,
        messageType: (msg.messageType ?? "text").trim() || "text",
        externalMessageId: (msg.externalMessageId ?? "").trim(),
        payload: msg.payload === undefined ? undefined : msg.payload,
      },
    })

    const preview = body.length > 140 ? `${body.slice(0, 137)}…` : body
    await tx.whatsAppConversation.update({
      where: { id: conversationId },
      data: {
        lastMessagePreview: preview,
        lastMessageAt: new Date(),
        ...(msg.direction === "inbound" ? { unreadCount: { increment: 1 } } : {}),
      },
    })

    return m
  })

  return created
}

export async function markConversationAsHuman(storeId: string, conversationId: string, human: boolean) {
  await prisma.whatsAppConversation.updateMany({
    where: { id: conversationId, storeId },
    data: { humanMode: human },
  })
}

export async function assignConversation(storeId: string, conversationId: string, assignedToUserId: string | null) {
  await prisma.whatsAppConversation.updateMany({
    where: { id: conversationId, storeId },
    data: { assignedToUserId: assignedToUserId ?? "" },
  })
}

type AutomationConditions = { keywords?: string[] }
type AutomationActions = { replyText?: string }

export async function runAutomationSimulation(
  storeId: string,
  automationId: string | undefined,
  incomingText: string
): Promise<{ matchedAutomationId: string | null; replyText: string; logs: string[] }> {
  const logs: string[] = []
  const text = incomingText.trim().toLowerCase()

  const where: Prisma.WhatsAppAutomationWhereInput = {
    storeId,
    enabled: true,
    ...(automationId ? { id: automationId } : {}),
  }

  const list = await prisma.whatsAppAutomation.findMany({
    where,
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
  })

  for (const auto of list) {
    const cond = (auto.conditions ?? {}) as AutomationConditions
    const keywords = Array.isArray(cond.keywords)
      ? cond.keywords.map((k) => String(k).trim().toLowerCase()).filter(Boolean)
      : []

    const match =
      keywords.length === 0 ? false : keywords.some((k) => k.length > 0 && text.includes(k))

    if (match || (automationId && auto.id === automationId)) {
      const actions = (auto.actions ?? {}) as AutomationActions
      const replyText =
        actions.replyText?.trim() ||
        `Olá! Recebemos sua mensagem. Em breve um atendente responde. (Automação: ${auto.name})`

      await prisma.whatsAppAutomationLog.create({
        data: {
          storeId,
          automationId: auto.id,
          level: "info",
          action: "automation_simulation",
          message: `Simulação disparada para "${auto.name}".`,
          payload: { incomingText, replyText, keywords },
        },
      })
      logs.push(`Matched automation ${auto.id}`)
      return { matchedAutomationId: auto.id, replyText, logs }
    }
  }

  await prisma.whatsAppAutomationLog.create({
    data: {
      storeId,
      automationId: automationId ?? null,
      level: "info",
      action: "automation_simulation_miss",
      message: "Nenhuma automação por palavra-chave correspondeu ao texto.",
      payload: { incomingText },
    },
  })
  logs.push("No automation matched")
  return {
    matchedAutomationId: null,
    replyText:
      "Obrigado pelo contato! Nossa equipe vai responder em instantes. Se preferir, diga se é assistência técnica ou orçamento.",
    logs,
  }
}

export { generateWhatsAppAiSuggestion as generateAiSuggestion } from "@/lib/whatsapp/ai-conversation-analysis"
export type { WhatsAppAiSuggestionResult } from "@/lib/whatsapp/ai-conversation-analysis"

/** Garante dados mínimos para o hub não abrir vazio. */
export async function ensureHubSeed(storeId: string): Promise<void> {
  // Usa findFirst em vez de count para evitar pânico do Prisma Query Engine
  // com pgBouncer em transaction mode (Supabase porta 6543).
  const [conv, qr, auto] = await Promise.all([
    prisma.whatsAppConversation.findFirst({ where: { storeId }, select: { id: true } }),
    prisma.whatsAppQuickReply.findFirst({ where: { storeId }, select: { id: true } }),
    prisma.whatsAppAutomation.findFirst({ where: { storeId }, select: { id: true } }),
  ])

  if (conv && qr && auto) return

  await prisma.$transaction(async (tx) => {
    const aiExisting = await tx.whatsAppAiSetting.findUnique({ where: { storeId } })
    if (!aiExisting) {
      await tx.whatsAppAiSetting.create({
        data: {
          storeId,
          tone: "consultivo",
          systemPrompt:
            "Você é o assistente da loja no WhatsApp: cordial, objetivo e focado em conversão sem pressão.",
          suggestionsEnabled: true,
          maxContextMessages: 12,
        },
      })
    }

    if (!(await tx.whatsAppQuickReply.findFirst({ where: { storeId }, select: { id: true } }))) {
      await tx.whatsAppQuickReply.createMany({
        data: [
          {
            storeId,
            shortcut: "/ola",
            title: "Saudação",
            body: "Olá! Bem-vindo à nossa loja. Como podemos ajudar hoje?",
            category: "geral",
            sortOrder: 1,
          },
          {
            storeId,
            shortcut: "/horario",
            title: "Horário",
            body: "Funcionamos de segunda a sexta, das 9h às 18h, e sábado das 9h às 13h.",
            category: "geral",
            sortOrder: 2,
          },
          {
            storeId,
            shortcut: "/orcamento",
            title: "Orçamento assistência",
            body: "Para orçamento preciso do modelo do aparelho e do defeito relatado. Se tiver fotos, pode enviar!",
            category: "assistencia",
            sortOrder: 3,
          },
        ],
      })
    }

    if (!(await tx.whatsAppAutomation.findFirst({ where: { storeId }, select: { id: true } }))) {
      await tx.whatsAppAutomation.createMany({
        data: [
          {
            storeId,
            name: "Boas-vindas — olá",
            triggerType: "keyword",
            enabled: true,
            priority: 10,
            conditions: { keywords: ["oi", "olá", "ola", "bom dia", "boa tarde"] },
            actions: {
              replyText:
                "Oi! Somos a equipe da loja. Em que podemos ajudar — assistência técnica, orçamento ou pedido?",
            },
          },
          {
            storeId,
            name: "Preços — palavras-chave",
            triggerType: "keyword",
            enabled: true,
            priority: 5,
            conditions: { keywords: ["preço", "valor", "quanto custa"] },
            actions: {
              replyText:
                "Sobre valores: depende do modelo e do serviço. Me diga qual produto ou aparelho que já te passo uma faixa e condições.",
            },
          },
        ],
      })
    }

    if (!(await tx.whatsAppConversation.findFirst({ where: { storeId }, select: { id: true } }))) {
      const c1 = await tx.whatsAppContact.create({
        data: {
          storeId,
          phoneDigits: "5511999990001",
          displayName: "Cliente Demonstração",
          waExternalId: "5511999990001",
        },
      })
      const conv = await tx.whatsAppConversation.create({
        data: {
          storeId,
          contactId: c1.id,
          lastMessagePreview: "Oi, quanto fica a troca de tela?",
          lastMessageAt: new Date(),
          unreadCount: 1,
        },
      })
      await tx.whatsAppMessage.createMany({
        data: [
          {
            storeId,
            conversationId: conv.id,
            direction: "inbound",
            body: "Oi, quanto fica a troca de tela?",
            messageType: "text",
          },
          {
            storeId,
            conversationId: conv.id,
            direction: "outbound",
            body: "Olá! Qual o modelo exato do aparelho para eu consultar a tabela?",
            messageType: "text",
          },
        ],
      })
    }
  })
}

/**
 * Cache de stores já garantidos neste processo do servidor.
 * Evita N queries por evento quando o motor já verificou esta loja.
 */
const _eventAutoEnsured = new Set<string>()

/** Seeds/upsert de automações por evento do sistema (PDV/OS) — por unidade. */
export async function ensureDefaultEventAutomations(storeId: string): Promise<void> {
  if (_eventAutoEnsured.has(storeId)) return
  _eventAutoEnsured.add(storeId)

  // Contato demo criado pelo ensureHubSeed (5511999990001) — usado como targetPhone padrão.
  // Em produção, configure o número real do gestor no campo targetPhone de cada automação.
  const DEMO_PHONE = "5511999990001"

  const DEFAULTS = [
    {
      name: "Venda finalizada — agradecimento",
      triggerType: "system_event",
      enabled: true,
      priority: 10,
      conditions: { event: "venda_finalizada" } as Prisma.InputJsonValue,
      actions: {
        replyText:
          "Venda realizada no valor de {{total}}. Obrigado pela compra, {{customerName}}! Qualquer dúvida estamos à disposição.",
        targetPhone: DEMO_PHONE,
      } as Prisma.InputJsonValue,
    },
    {
      name: "OS em análise",
      triggerType: "system_event",
      enabled: true,
      priority: 9,
      conditions: { event: "os_status_alterado", status: "EmAnalise" } as Prisma.InputJsonValue,
      actions: {
        replyText: "Sua ordem de serviço está em análise. Em breve atualizamos você.",
      } as Prisma.InputJsonValue,
    },
    {
      name: "OS pronta",
      triggerType: "system_event",
      enabled: true,
      priority: 9,
      conditions: { event: "os_status_alterado", status: "Pronto" } as Prisma.InputJsonValue,
      actions: {
        replyText: "Seu aparelho está pronto para retirada.",
      } as Prisma.InputJsonValue,
    },
    {
      name: "OS finalizada — cobrança",
      triggerType: "system_event",
      enabled: true,
      priority: 9,
      conditions: { event: "os_finalizada" } as Prisma.InputJsonValue,
      actions: {
        replyText: "Sua OS foi finalizada. Segue valor para pagamento.",
      } as Prisma.InputJsonValue,
    },
  ]

  // Upsert por (storeId, name, triggerType) para garantir que automações antigas
  // recebam o novo template sem duplicar registros.
  // IMPORTANTE: preserve campos customizados pelo usuário (targetPhone, etc).
  for (const def of DEFAULTS) {
    // Busca TODAS as automações com mesmo nome+tipo para detectar duplicatas
    const allMatching = await prisma.whatsAppAutomation.findMany({
      where: { storeId, name: def.name, triggerType: def.triggerType },
      select: { id: true, actions: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    })

    // Se houver duplicatas, desativa todas exceto a mais recente (com maior updatedAt)
    if (allMatching.length > 1) {
      const [_keep, ...dupes] = allMatching
      await prisma.whatsAppAutomation.updateMany({
        where: { id: { in: dupes.map((d) => d.id) } },
        data: { enabled: false },
      })
    }

    const existing = allMatching[0] ?? null
    if (existing) {
      const existingActions = (existing.actions ?? {}) as Record<string, unknown>
      const defaultActions = (def.actions ?? {}) as Record<string, unknown>

      // Mescla: template default → mas targetPhone existente tem precedência sobre o padrão.
      // Isso preserva o número configurado pelo usuário no HUB após reinicializações do servidor.
      const mergedActions: Record<string, unknown> = {
        ...defaultActions,
        ...(existingActions.targetPhone
          ? { targetPhone: existingActions.targetPhone }
          : {}),
      }

      await prisma.whatsAppAutomation.update({
        where: { id: existing.id },
        data: {
          enabled: def.enabled,
          priority: def.priority,
          conditions: def.conditions,
          actions: mergedActions as Prisma.InputJsonValue,
        },
      })
    } else {
      await prisma.whatsAppAutomation.create({
        data: { storeId, ...def },
      })
    }
  }
}

export async function sendWhatsAppMessage(input: {
  storeId: string
  contactId?: string
  phoneDigits?: string
  displayName?: string
  message: string
  meta?: Prisma.InputJsonValue
}): Promise<{ conversationId: string; messageId: string; contactId: string }> {
  const storeId = input.storeId.trim()
  if (!storeId) throw new Error("storeId obrigatório")
  const body = input.message.trim()
  if (!body) throw new Error("message vazio")

  let contactId = (input.contactId ?? "").trim()
  if (!contactId) {
    const phoneDigits = normalizeDigits(input.phoneDigits ?? "")
    if (!phoneDigits) throw new Error("contactId ou phoneDigits obrigatório")
    const c = await createOrUpdateContact(storeId, {
      phoneDigits,
      displayName: input.displayName,
    })
    contactId = c.id
  }

  const existingConv = await prisma.whatsAppConversation.findFirst({
    where: { storeId, contactId, status: "open" },
    orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
  })
  const conv =
    existingConv ??
    (await prisma.whatsAppConversation.create({
      data: { storeId, contactId, status: "open", unreadCount: 0 },
    }))

  const m = await addMessage(storeId, conv.id, {
    direction: "outbound",
    body,
    messageType: "text",
    payload: input.meta,
  })

  return { conversationId: conv.id, messageId: m.id, contactId }
}

export async function sendCloudApiTextAndRecord(storeId: string, conversationId: string, text: string) {
  const trimmed = text.trim()
  if (!trimmed) throw new Error("message vazio")

  const conv = await prisma.whatsAppConversation.findFirst({
    where: { id: conversationId, storeId },
    include: { contact: true },
  })
  if (!conv) throw new Error("Conversa não encontrada")

  const to = assertValidWhatsAppRecipientDigits(conv.contact.phoneDigits)
  const res = await cloudSendText(to, trimmed)
  const wamid = firstOutboundWamid(res)
  const m = await addMessage(storeId, conversationId, {
    direction: "outbound",
    body: trimmed,
    messageType: "text",
    externalMessageId: wamid,
    payload: { cloud: { kind: "text", wamid: wamid || undefined } } as Prisma.InputJsonValue,
  })
  return { message: m, wamid }
}

export async function sendCloudApiTemplateAndRecord(
  storeId: string,
  conversationId: string,
  input: { templateName: string; languageCode: string; components?: TemplateComponent[] }
) {
  const conv = await prisma.whatsAppConversation.findFirst({
    where: { id: conversationId, storeId },
    include: { contact: true },
  })
  if (!conv) throw new Error("Conversa não encontrada")

  const to = assertValidWhatsAppRecipientDigits(conv.contact.phoneDigits)
  const res = await cloudSendTemplate({
    toDigits: to,
    templateName: input.templateName,
    languageCode: input.languageCode,
    components: input.components,
  })
  const wamid = firstOutboundWamid(res)
  const preview = `Template: ${input.templateName}`
  const m = await addMessage(storeId, conversationId, {
    direction: "outbound",
    body: preview,
    messageType: "template",
    externalMessageId: wamid,
    payload: {
      cloud: { kind: "template", name: input.templateName, language: input.languageCode, wamid: wamid || undefined },
    } as Prisma.InputJsonValue,
  })
  return { message: m, wamid }
}

export async function sendCloudApiMediaAndRecord(
  storeId: string,
  conversationId: string,
  input: {
    mediaType: "image" | "document" | "audio" | "video"
    link: string
    caption?: string
    filename?: string
  }
) {
  const conv = await prisma.whatsAppConversation.findFirst({
    where: { id: conversationId, storeId },
    include: { contact: true },
  })
  if (!conv) throw new Error("Conversa não encontrada")

  const to = assertValidWhatsAppRecipientDigits(conv.contact.phoneDigits)
  const res = await cloudSendMedia({
    toDigits: to,
    mediaType: input.mediaType,
    link: input.link,
    caption: input.caption,
    filename: input.filename,
  })
  const wamid = firstOutboundWamid(res)
  const body = (input.caption?.trim() || `[${input.mediaType}]`).trim() || `[${input.mediaType}]`
  const m = await addMessage(storeId, conversationId, {
    direction: "outbound",
    body,
    messageType: input.mediaType,
    externalMessageId: wamid,
    payload: { cloud: { kind: input.mediaType, link: input.link, wamid: wamid || undefined } } as Prisma.InputJsonValue,
  })
  return { message: m, wamid }
}
