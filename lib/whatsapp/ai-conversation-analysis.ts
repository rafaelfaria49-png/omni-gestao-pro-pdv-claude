import { StatusOrdemServico } from "@/generated/prisma"
import { llmJsonCompletion } from "@/lib/llm-json"
import { resolveLlmEnv } from "@/lib/resolve-llm-env"
import { prisma } from "@/lib/prisma"

export type WhatsAppAiAnalysis = {
  resumoOperacional: string
  intencao: string
  tomEmocional: string
  prioridade: "baixa" | "media" | "alta" | "urgente"
  risco: string
  oportunidade: string
  proximaMelhorAcao: string
  sugestaoResposta: string
  confianca: number
  motivo: string
}

export type WhatsAppAiAnalysisResult = {
  ok: true
  available: boolean
  source: "llm" | "unavailable"
  cached: boolean
  generatedAt: string
  analysis: WhatsAppAiAnalysis | null
  reason?: string
}

const CACHE_TTL_MS = 5 * 60 * 1000
const MAX_MESSAGES_HARD = 24

type CacheEntry = { at: number; result: WhatsAppAiAnalysisResult }
const serverCache = new Map<string, CacheEntry>()

function stripEnv(v: string | undefined): string {
  if (!v) return ""
  return v.replace(/^[\s'"]+|[\s'"]+$/g, "").trim()
}

function openrouterApiKey(): string {
  return stripEnv(process.env.OPENROUTER_API_KEY)
}

function stripToJsonObject(raw: string): string {
  const t = (raw || "").trim()
  if (!t) return ""
  const noFences = t
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim()
  const firstBrace = noFences.indexOf("{")
  const lastBrace = noFences.lastIndexOf("}")
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return noFences
  return noFences.slice(firstBrace, lastBrace + 1).trim()
}

function llmConfigured(): boolean {
  if (openrouterApiKey().length > 0) return true
  return resolveLlmEnv().ok
}

function buildSystemPrompt(tone: string, systemPrompt: string): string {
  const base =
    systemPrompt.trim() ||
    "Você é o assistente da loja no WhatsApp: cordial, objetivo e focado em conversão sem pressão."
  return `${base}

Tom configurado da loja: ${tone}.

Tarefa: analisar o contexto operacional de uma conversa WhatsApp e retornar EXCLUSIVAMENTE um objeto JSON válido, SEM markdown, SEM texto fora do JSON.

Estrutura obrigatória:
{
  "resumoOperacional": "string (2-4 frases, pt-BR)",
  "intencao": "string curta",
  "tomEmocional": "string (ex.: neutro, ansioso, satisfeito, irritado)",
  "prioridade": "baixa" | "media" | "alta" | "urgente",
  "risco": "string (risco comercial/operacional ou 'nenhum relevante')",
  "oportunidade": "string (upsell, fidelização, orçamento etc.)",
  "proximaMelhorAcao": "string (ação para o operador humano)",
  "sugestaoResposta": "string (mensagem pronta para WhatsApp, revisada pelo operador — NÃO enviar automaticamente)",
  "confianca": number entre 0 e 100,
  "motivo": "string breve explicando a confiança"
}

Regras:
- Baseie-se apenas nos dados fornecidos; não invente OS, valores ou compromissos.
- Se faltar contexto, reduza confianca e diga no motivo.
- sugestaoResposta deve ser profissional, em português do Brasil, adequada ao tom da loja.
- O operador humano sempre revisa antes de enviar.`
}

function normalizePrioridade(v: unknown): WhatsAppAiAnalysis["prioridade"] {
  const s = String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
  if (s === "urgente" || s === "alta" || s === "media" || s === "baixa") return s
  if (/urgent/.test(s)) return "urgente"
  if (/alt/.test(s)) return "alta"
  if (/med/.test(s)) return "media"
  return "baixa"
}

function parseAnalysis(input: unknown): WhatsAppAiAnalysis {
  if (!input || typeof input !== "object") throw new Error("IA retornou payload inválido")
  const o = input as Record<string, unknown>
  const confRaw = typeof o.confianca === "number" ? o.confianca : Number(o.confianca)
  const confianca = Number.isFinite(confRaw)
    ? Math.min(100, Math.max(0, Math.round(confRaw)))
    : 50

  const pick = (key: keyof WhatsAppAiAnalysis) => String(o[key] ?? "").trim()

  const analysis: WhatsAppAiAnalysis = {
    resumoOperacional: pick("resumoOperacional"),
    intencao: pick("intencao"),
    tomEmocional: pick("tomEmocional"),
    prioridade: normalizePrioridade(o.prioridade),
    risco: pick("risco") || "nenhum relevante",
    oportunidade: pick("oportunidade"),
    proximaMelhorAcao: pick("proximaMelhorAcao"),
    sugestaoResposta: pick("sugestaoResposta"),
    confianca,
    motivo: pick("motivo") || "Análise gerada a partir do contexto disponível.",
  }

  if (!analysis.resumoOperacional || !analysis.sugestaoResposta) {
    throw new Error("IA retornou campos obrigatórios vazios")
  }
  return analysis
}

async function completeViaOpenRouter(system: string, userText: string): Promise<string> {
  const key = openrouterApiKey()
  if (!key) throw new Error("OPENROUTER_KEY_MISSING")
  const model =
    stripEnv(process.env.OPENROUTER_WHATSAPP_MODEL) ||
    stripEnv(process.env.OPENROUTER_FINANCE_MODEL) ||
    "openrouter/auto"

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000",
      "X-Title": "OmniGestão WhatsApp",
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      max_tokens: 900,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userText },
      ],
    }),
  })
  const raw = await res.text()
  if (!res.ok) throw new Error(`OPENROUTER_FAILED:${res.status}`)
  const j = JSON.parse(raw) as { choices?: Array<{ message?: { content?: string } }> }
  const text = (j.choices?.[0]?.message?.content ?? "").trim()
  if (!text) throw new Error("OPENROUTER_EMPTY")
  return text
}

async function callLlmJson(system: string, userText: string): Promise<WhatsAppAiAnalysis> {
  let raw = ""
  try {
    if (openrouterApiKey()) {
      raw = await completeViaOpenRouter(system, userText)
      const parsed = JSON.parse(stripToJsonObject(raw)) as unknown
      return parseAnalysis(parsed)
    }
  } catch {
    /* fallback */
  }

  const obj = await llmJsonCompletion(system, userText)
  return parseAnalysis(obj)
}

function formatMessagesForPrompt(
  messages: Array<{ direction: string; body: string; createdAt: Date }>
): string {
  return messages
    .map((m) => {
      const who = m.direction === "outbound" ? "Loja" : "Cliente"
      const t = m.createdAt.toISOString().slice(0, 16).replace("T", " ")
      const body = (m.body || "").trim().slice(0, 500)
      return `[${t}] ${who}: ${body}`
    })
    .join("\n")
}

function buildUserPayload(ctx: {
  contactName: string
  phoneDigits: string
  humanMode: boolean
  status: string
  unreadCount: number
  cliente: {
    name: string
    totalSpent: number
    openOs: Array<{ numero: string; status: string; equipamento: string; isLate: boolean }>
    vendas: Array<{ pedidoId: string; total: number; at: string }>
  } | null
  messagesText: string
}): string {
  const lines: string[] = [
    "=== Conversa WhatsApp ===",
    `Contato: ${ctx.contactName}`,
    `Telefone: ${ctx.phoneDigits}`,
    `Status conversa: ${ctx.status}`,
    `Não lidas: ${ctx.unreadCount}`,
    `Modo humano (IA pausada para automação): ${ctx.humanMode ? "sim" : "não"}`,
  ]
  if (ctx.cliente) {
    lines.push(
      "",
      "=== Cliente CRM vinculado ===",
      `Nome: ${ctx.cliente.name}`,
      `Total gasto (agregado): R$ ${ctx.cliente.totalSpent.toFixed(2)}`
    )
    if (ctx.cliente.openOs.length) {
      lines.push("OS em aberto:")
      for (const os of ctx.cliente.openOs.slice(0, 6)) {
        lines.push(
          `- #${os.numero} ${os.status} · ${os.equipamento}${os.isLate ? " · possível atraso" : ""}`
        )
      }
    }
    if (ctx.cliente.vendas.length) {
      lines.push("Vendas recentes:")
      for (const v of ctx.cliente.vendas.slice(0, 4)) {
        lines.push(`- ${v.pedidoId}: R$ ${v.total.toFixed(2)} em ${v.at}`)
      }
    }
  } else {
    lines.push("", "Cliente CRM: não vinculado.")
  }
  lines.push("", "=== Mensagens recentes (mais antigas primeiro) ===", ctx.messagesText || "(sem mensagens)")
  return lines.join("\n")
}

function unavailableResult(reason: string, cached = false): WhatsAppAiAnalysisResult {
  return {
    ok: true,
    available: false,
    source: "unavailable",
    cached,
    generatedAt: new Date().toISOString(),
    analysis: null,
    reason,
  }
}

export async function analyzeWhatsAppConversation(
  storeId: string,
  conversationId: string,
  opts?: { force?: boolean }
): Promise<WhatsAppAiAnalysisResult> {
  const cacheKey = `${storeId}:${conversationId}`
  const force = !!opts?.force
  const now = Date.now()
  if (!force) {
    const hit = serverCache.get(cacheKey)
    if (hit && now - hit.at < CACHE_TTL_MS) {
      return { ...hit.result, cached: true }
    }
  }

  if (!llmConfigured()) {
    const result = unavailableResult("API de IA não configurada no servidor")
    serverCache.set(cacheKey, { at: now, result })
    return result
  }

  const settings = await prisma.whatsAppAiSetting.findUnique({ where: { storeId } })
  if (settings && settings.suggestionsEnabled === false) {
    const result = unavailableResult("Sugestões IA desativadas nas configurações do WhatsApp")
    serverCache.set(cacheKey, { at: now, result })
    return result
  }

  const maxCtx = Math.min(
    MAX_MESSAGES_HARD,
    Math.max(4, settings?.maxContextMessages ?? 12)
  )

  const conv = await prisma.whatsAppConversation.findFirst({
    where: { id: conversationId, storeId },
    include: {
      contact: true,
      messages: { orderBy: { createdAt: "desc" }, take: maxCtx },
    },
  })

  if (!conv) {
    throw new Error("Conversa não encontrada nesta loja")
  }

  const chronMessages = [...conv.messages].reverse()

  let clienteBlock: {
    name: string
    totalSpent: number
    openOs: Array<{ numero: string; status: string; equipamento: string; isLate: boolean }>
    vendas: Array<{ pedidoId: string; total: number; at: string }>
  } | null = null

  if (conv.clienteId) {
    const cliente = await prisma.cliente.findFirst({
      where: { id: conv.clienteId, storeId },
      include: {
        ordensServico: { orderBy: { createdAt: "desc" }, take: 8 },
        vendas: { orderBy: { at: "desc" }, take: 5 },
      },
    })
    if (cliente) {
      const OPEN = new Set(["Aberto", "EmAnalise"])
      const LATE_MS = 3 * 24 * 60 * 60 * 1000
      const openOs = cliente.ordensServico
        .filter((o) => OPEN.has(o.status))
        .map((o) => {
          const updatedMs = new Date(o.updatedAt).getTime()
          return {
            numero: String(o.numero ?? o.id).slice(-8),
            status: o.status,
            equipamento: o.equipamento ?? "",
            isLate: Number.isFinite(updatedMs) && Date.now() - updatedMs > LATE_MS,
          }
        })
      clienteBlock = {
        name: cliente.name,
        totalSpent: Number(cliente.totalSpent ?? 0),
        openOs,
        vendas: cliente.vendas.map((v) => ({
          pedidoId: v.pedidoId,
          total: Number(v.total ?? 0),
          at: v.at.toISOString().slice(0, 10),
        })),
      }
      try {
        const [osAgg, vendaAgg] = await Promise.all([
          prisma.ordemServico.aggregate({
            where: {
              storeId,
              clienteId: cliente.id,
              status: { in: [StatusOrdemServico.Pronto, StatusOrdemServico.Entregue] },
            },
            _sum: { valorTotal: true },
          }),
          prisma.venda.aggregate({
            where: { storeId, clienteId: cliente.id, status: "concluida" },
            _sum: { total: true },
          }),
        ])
        if (osAgg._sum.valorTotal != null || vendaAgg._sum.total != null) {
          clienteBlock.totalSpent =
            Number(osAgg._sum.valorTotal ?? 0) + Number(vendaAgg._sum.total ?? 0)
        }
      } catch {
        /* mantém totalSpent da coluna */
      }
    }
  }

  const tone = (settings?.tone ?? "consultivo").trim() || "consultivo"
  const system = buildSystemPrompt(tone, settings?.systemPrompt ?? "")
  const userText = buildUserPayload({
    contactName: conv.contact.displayName?.trim() || "Contato",
    phoneDigits: conv.contact.phoneDigits,
    humanMode: conv.humanMode,
    status: conv.status,
    unreadCount: conv.unreadCount,
    cliente: clienteBlock,
    messagesText: formatMessagesForPrompt(chronMessages),
  })

  try {
    const analysis = await callLlmJson(system, userText)
    const result: WhatsAppAiAnalysisResult = {
      ok: true,
      available: true,
      source: "llm",
      cached: false,
      generatedAt: new Date().toISOString(),
      analysis,
    }
    serverCache.set(cacheKey, { at: now, result })
    return result
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[whatsapp/ai-analysis]", storeId, conversationId, msg)
    const result = unavailableResult("Falha ao gerar análise com o modelo de IA")
    serverCache.set(cacheKey, { at: now, result })
    return result
  }
}
