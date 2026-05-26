import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { orchestrateCommand, type PlanoAssinatura } from "@/services/ai-orchestrator"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import { storeIdFromIaMestreWrite } from "@/lib/ia-mestre/api-guard"
import { prepareIaMestreTurn, saveIaMestreAssistantTurn } from "@/lib/ia-mestre/persist-turn"
import { composeMestreUserMessage, type StockSummaryRow } from "@/services/ai-mestre-reply"
import { pickMestreModel } from "@/lib/ai-model-policy"
import { getVerifiedSubscriptionFromCookies } from "@/lib/api-auth"
import { requireAdmin } from "@/lib/require-admin"
import { detectIntent } from "@/lib/aiOrchestrator"

/** Prisma exige Node; a chamada Gemini em si é compatível com Edge, mas este handler não. */
export const runtime = "nodejs"

const AI_TIMEOUT_MESSAGE = "A IA está processando algo pesado, tente novamente em instantes"
const isLocalDevelopment = process.env.NODE_ENV === "development"

function openAiBaseUrl(): string {
  // Permite override (proxy/compat) mas default é a API oficial.
  const v = String(process.env.OPENAI_BASE_URL || "").trim()
  return v || "https://api.openai.com/v1"
}

type ClientMessage = { role?: string; content?: string }

type Body = {
  command?: string
  /** Alias simples para clientes que enviam apenas `{ prompt }`. */
  prompt?: string
  /** Histórico opcional (cliente). */
  messages?: ClientMessage[]
  /** Liga/desliga tom e contexto de loja. */
  brandVoice?: boolean
  /** Plano enviado pelo cliente; em produção, validar também cookie/servidor. */
  plano?: PlanoAssinatura | string
  lojaId?: string
  /** Modelo sugerido pelo cliente (ex.: Gemini Flash no básico; GPT/Claude no premium). */
  model?: string
  /** Thread persistida (opcional na primeira mensagem). */
  conversationId?: string
  /** Idempotência por turno — obrigatório para persistência. */
  clientMessageId?: string
  /** Texto exibido ao usuário (sem prefixo de brand voice). */
  userMessage?: string
}

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeoutMs)
  try {
    return await fetch(input, { ...init, signal: ac.signal })
  } catch (e) {
    if (e && typeof e === "object" && "name" in e && (e as any).name === "AbortError") {
      throw new Error("LLM_TIMEOUT")
    }
    throw e
  } finally {
    clearTimeout(t)
  }
}

function persistencePayload(p: {
  conversationId: string
  clientMessageId: string
  userMessageId: string
  assistantMessageId: string
}) {
  return {
    conversationId: p.conversationId,
    clientMessageId: p.clientMessageId,
    userMessageId: p.userMessageId,
    assistantMessageId: p.assistantMessageId,
  }
}

function normalizeMessages(ms: ClientMessage[] | undefined): Array<{ role: "user" | "assistant"; content: string }> {
  if (!Array.isArray(ms)) return []
  return ms
    .map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: String(m.content || "").trim(),
    }))
    .filter((m) => m.content)
    .slice(-18)
}

function lastUserText(body: Body): string {
  const p = typeof body.prompt === "string" ? body.prompt.trim() : ""
  if (p) return p
  const c = typeof body.command === "string" ? body.command.trim() : ""
  if (c) return c
  const hist = normalizeMessages(body.messages)
  for (let i = hist.length - 1; i >= 0; i--) {
    if (hist[i]!.role === "user") return hist[i]!.content
  }
  return ""
}

function buildConsultoraSystemPrompt(opts: { brandVoice: boolean }): string {
  return [
    "VOCÊ DEVE RESPONDER EXCLUSIVAMENTE EM PORTUGUÊS DO BRASIL (pt-BR). NUNCA RESPONDA EM INGLÊS.",
    "Você é a IA Mestre do OmniGestão Pro: assistente central do ERP para assistência técnica e varejo.",
    "Você entende e dá respostas práticas sobre: vendas/PDV, estoque, financeiro, CRM/clientes, ordens de serviço, compras/fornecedores e marketing.",
    opts.brandVoice
      ? "TOM: premium, direto, confiante, com foco em execução e resultado. Use a identidade da loja."
      : "TOM: profissional, direto e útil. Não invente dados internos se não tiver contexto.",
    "Ao responder, seja objetivo: entregue passos acionáveis, checklist curto e exemplos quando ajudar.",
    "Quando o pedido envolver criação visual (logo/imagem/arte/banner/post/anúncio/flyer), você deve preparar um brief claro e consistente para geração de imagem.",
  ].join("\n")
}

function isLogoRequest(text: string): boolean {
  const t = text.toLowerCase()
  return t.includes("logo") || t.includes("logotipo") || t.includes("marca") || t.includes("identidade visual")
}

function buildImageGenerationPrompt(userCommand: string): string {
  const cmd = String(userCommand || "").trim()
  const logo = isLogoRequest(cmd)
  const header = logo
    ? [
        "Crie um LOGOTIPO profissional para uma empresa brasileira (estilo moderno, comercial e limpo).",
        "Fundo limpo e alta qualidade. Alto contraste. Visual pronto para uso em site e redes sociais.",
        "REGRA CRÍTICA DE TEXTO (NÃO QUEBRAR):",
        "- Qualquer texto/nome no logo deve aparecer EXATAMENTE como informado pelo usuário (mesma grafia, maiúsculas/minúsculas, acentos e espaçamento).",
        "- NÃO traduzir o nome. NÃO abreviar. NÃO corrigir automaticamente. NÃO inventar letras. NÃO adicionar palavras extras.",
        "O texto do logo deve aparecer exatamente como informado pelo usuário.",
      ]
    : [
        "Crie uma imagem/arte profissional para uma empresa brasileira (estilo moderno, comercial e limpo).",
        "Fundo limpo, alta qualidade, composição clara.",
        "REGRA DE TEXTO:",
        "- Evite adicionar texto na imagem, a não ser que o usuário tenha pedido explicitamente.",
        "- Se houver texto pedido, ele deve aparecer EXATAMENTE como informado (sem traduções, abreviações ou palavras extras).",
      ]

  return [
    ...header,
    "",
    "BRIEF DO USUÁRIO (copiar fielmente; preserve nomes e textos):",
    cmd || "(vazio)",
  ].join("\n")
}

function openRouterKey(): string {
  return String(process.env.OPENROUTER_API_KEY || "").trim()
}

function openAiKey(): string {
  return String(process.env.OPENAI_API_KEY || "").trim()
}

function isOpenRouterModel(model: string): boolean {
  return model.includes("/")
}

async function llmTextReply(opts: {
  model: string
  system: string
  history: Array<{ role: "user" | "assistant"; content: string }>
  userText: string
}): Promise<string> {
  const provider: "openrouter" | "openai" = isOpenRouterModel(opts.model) ? "openrouter" : "openai"
  const url =
    provider === "openrouter"
      ? "https://openrouter.ai/api/v1/chat/completions"
      : `${openAiBaseUrl()}/chat/completions`
  const key = provider === "openrouter" ? openRouterKey() : openAiKey()
  if (!key) {
    const missingKey = provider === "openrouter" ? "OPENROUTER_API_KEY" : "OPENAI_API_KEY"
    console.log(`[orchestrate] ${missingKey} não configurada. Defina a chave no .env local e reinicie o servidor.`)
    throw new Error(provider === "openrouter" ? "OPENROUTER_KEY_MISSING" : "OPENAI_KEY_MISSING")
  }
  const headers: Record<string, string> = { "Content-Type": "application/json", Authorization: `Bearer ${key}` }
  if (provider === "openrouter") {
    headers["HTTP-Referer"] = process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000"
    headers["X-Title"] = "IA Mestre"
  }
  const messages = [
    { role: "system", content: opts.system },
    ...opts.history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: opts.userText },
  ]
  const res = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: opts.model,
        temperature: 0.6,
        max_tokens: 800,
        messages,
      }),
    },
    30_000
  )
  const raw = await res.text()
  if (!res.ok) {
    console.error("[orchestrate] llm failed", provider, opts.model, `HTTP ${res.status}`, raw.slice(0, 240))
    throw new Error("LLM_FAILED")
  }
  let j: any
  try {
    j = JSON.parse(raw)
  } catch {
    throw new Error("LLM_BAD_JSON")
  }
  const text = String(j?.choices?.[0]?.message?.content || "").trim()
  if (!text) throw new Error("LLM_EMPTY")
  return text
}

async function generateLocalDallEImage(prompt: string): Promise<string> {
  const key = openAiKey()
  if (!key) {
    console.log("[orchestrate] OPENAI_API_KEY não configurada. A geração DALL-E precisa dessa chave no .env local.")
    throw new Error("OPENAI_KEY_MISSING")
  }

  const res = await fetchWithTimeout(
    `${openAiBaseUrl()}/images/generations`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt,
        size: "1024x1024",
        quality: "hd",
        n: 1,
        response_format: "url",
      }),
    },
    60_000
  )
  const raw = await res.text()
  let data: any
  try {
    data = raw ? JSON.parse(raw) : {}
  } catch {
    throw new Error("OPENAI_BAD_JSON")
  }
  if (!res.ok) {
    console.error("[orchestrate] DALL-E local failed", `HTTP ${res.status}`, raw.slice(0, 240))
    throw new Error(String(data?.error?.message || `OpenAI HTTP ${res.status}`))
  }
  const imageUrl = String(data?.data?.[0]?.url || "").trim()
  if (!imageUrl) throw new Error("A geração retornou sem URL.")
  return imageUrl
}

export async function POST(req: Request) {
  if (!isLocalDevelopment) {
    const adminGate = await requireAdmin()
    if (!adminGate.ok) return adminGate.res
  } else {
    console.log("[orchestrate] DEV: bypass de admin/assinatura ativo para teste local.")
  }
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const command = lastUserText(body)
  if (!command) return NextResponse.json({ error: "command obrigatório" }, { status: 400 })

  const lojaId = storeIdFromIaMestreWrite(req) ?? ""
  if (!lojaId) {
    return NextResponse.json(
      {
        ok: false,
        error: "Selecione uma unidade ativa e envie o header x-assistec-loja-id.",
      },
      { status: 403 },
    )
  }

  const clientMessageId = typeof body.clientMessageId === "string" ? body.clientMessageId.trim() : ""
  if (!clientMessageId) {
    return NextResponse.json({ ok: false, error: "clientMessageId obrigatório" }, { status: 400 })
  }

  const userDisplay =
    typeof body.userMessage === "string" && body.userMessage.trim()
      ? body.userMessage.trim()
      : command

  const brandVoice = !!body.brandVoice

  // Em desenvolvimento, libera a rota para testar OpenAI/DALL-E sem depender de assinatura/créditos locais.
  let plano: PlanoAssinatura | string =
    isLocalDevelopment && typeof body.plano === "string" && body.plano.trim() ? body.plano.trim() : isLocalDevelopment ? "ouro" : "bronze"
  if (!isLocalDevelopment) {
    // Plano (first-class): resolve sempre a partir da unidade (Store.subscriptionPlan).
    // Fallback temporário: cookie verificado / body, para compatibilidade em ambientes sem coluna preenchida.
    try {
      const store = await prisma.store.findUnique({ where: { id: lojaId }, select: { subscriptionPlan: true } })
      const p = String(store?.subscriptionPlan || "").trim()
      if (p === "OURO") plano = "ouro"
      else if (p === "PRATA") plano = "prata"
      else if (p === "BRONZE") plano = "bronze"
    } catch {
      /* ignore */
    }
    if (plano === "bronze") {
      try {
        const sub = await getVerifiedSubscriptionFromCookies()
        if (sub.ok && typeof sub.plano === "string" && sub.plano.trim()) {
          plano = sub.plano.trim()
        } else if (typeof body.plano === "string" && body.plano.trim()) {
          plano = body.plano.trim()
        }
      } catch {
        /* ignora */
      }
    }
  }

  // Modelo: básico travado no backend; premium pode escolher (request + preferência salva).
  let storedModel: string | null = null
  try {
    const st = await prisma.storeSettings.findUnique({ where: { storeId: lojaId }, select: { printerConfig: true } })
    const cfg = st?.printerConfig && typeof st.printerConfig === "object" ? (st.printerConfig as Record<string, unknown>) : null
    storedModel = cfg && typeof (cfg as any).aiMestreModel === "string" ? String((cfg as any).aiMestreModel).trim() : null
  } catch {
    storedModel = null
  }
  const model = pickMestreModel({ plano, requestedModel: body.model, storedModel })

  const prepared = await prepareIaMestreTurn({
    storeId: lojaId,
    conversationId: body.conversationId,
    clientMessageId,
    userContent: userDisplay,
    model,
    brandVoice,
  })
  if (!prepared.ok) {
    return NextResponse.json({ ok: false, error: prepared.error }, { status: prepared.status })
  }

  const { conversationId, userMessageId, history } = prepared

  if (prepared.cached) {
    const cached = prepared.cached
    const isImage = cached.type === "image"
    return NextResponse.json({
      ok: true,
      type: isImage ? "image" : "text",
      data: isImage ? { imageUrl: cached.imageUrl, message: cached.message } : { message: cached.message },
      message: cached.message,
      ...(isImage && cached.imageUrl ? { tool: { type: "image", url: cached.imageUrl } } : {}),
      persistence: persistencePayload({
        conversationId,
        clientMessageId,
        userMessageId,
        assistantMessageId: cached.assistantMessageId,
      }),
      duplicate: true,
    })
  }

  let stockRows: StockSummaryRow[] = []
  try {
    const rows = await prisma.produto.findMany({
      where: { storeId: lojaId },
      select: { name: true, stock: true, price: true, category: true },
      orderBy: { name: "asc" },
      take: 120,
    })
    stockRows = rows.map((r) => ({
      name: r.name,
      stock: r.stock,
      price: r.price,
      category: r.category ?? "",
    }))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[orchestrate] estoque:", msg)
  }

  const result = orchestrateCommand(command, plano)
  if (!result.ok) {
    return NextResponse.json(result)
  }

  // Tool Calling (imagem): determinístico (IA Mestre decide automaticamente)
  const intent = detectIntent(command)
  if (intent === "image") {
    try {
      const prompt = buildImageGenerationPrompt(command)
      let imageUrl = ""
      if (isLocalDevelopment) {
        imageUrl = await generateLocalDallEImage(prompt)
      } else {
        const r = await fetchWithTimeout(
          new URL("/api/marketing/image", req.url).toString(),
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json", [ASSISTEC_LOJA_HEADER]: lojaId },
            body: JSON.stringify({ prompt, style: "realismo", format: "square", useMascot: false }),
          },
          30_000
        )
        const j = (await r.json().catch(() => ({}))) as { imageUrl?: string; message?: string; error?: string }
        if (!r.ok) throw new Error(j?.message || j?.error || `HTTP ${r.status}`)
        imageUrl = String(j.imageUrl || "").trim()
        if (!imageUrl) throw new Error("A geração retornou sem URL.")
      }
      const assistantContent = "Imagem gerada com sucesso."
      const saved = await saveIaMestreAssistantTurn({
        storeId: lojaId,
        conversationId,
        clientMessageId,
        content: assistantContent,
        type: "image",
        imageUrl,
      })
      return NextResponse.json({
        ...result,
        type: "image",
        data: { imageUrl, message: assistantContent },
        message: assistantContent,
        tool: { type: "image", url: imageUrl },
        integration: { llmConfigured: true, backend: "openai", stockRowsLoaded: stockRows.length > 0, toolUsed: "dalle3" },
        persistence: persistencePayload({
          conversationId,
          clientMessageId,
          userMessageId,
          assistantMessageId: saved.assistantMessageId,
        }),
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao gerar imagem."
      console.error("[orchestrate] image tool:", msg)
      return NextResponse.json({ ...result, ok: false, error: msg || AI_TIMEOUT_MESSAGE }, { status: 502 })
    }
  }

  let message = ""
  let meta: { llmConfigured: boolean; backend: "openrouter" | "gemini" | "openai" | null; stockRowsLoaded: boolean; fallbackUsed?: boolean } = {
    llmConfigured: true,
    backend: isOpenRouterModel(model) ? "openrouter" : "openai",
    stockRowsLoaded: stockRows.length > 0,
  }

  try {
    // Se ainda quisermos usar o composer antigo (com estoque/política), preserva compatibilidade.
    const composed = await composeMestreUserMessage(
      command,
      result.decision,
      plano,
      stockRows,
      model
    )
    // Envelopa com system prompt "consultora" + histórico quando fornecido.
    const system = buildConsultoraSystemPrompt({ brandVoice })
    const refined = await llmTextReply({
      model,
      system,
      history,
      userText: composed.message,
    })
    message = refined
    meta = {
      llmConfigured: true,
      backend: isOpenRouterModel(model) ? "openrouter" : "openai",
      stockRowsLoaded: stockRows.length > 0,
      fallbackUsed: composed.meta.fallbackUsed,
    }
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e)
    console.error("[orchestrate] llm:", err)
    if (err === "LLM_TIMEOUT") {
      return NextResponse.json({ ...result, ok: false, error: AI_TIMEOUT_MESSAGE }, { status: 504 })
    }
    message = "Não consegui completar a resposta. Tente novamente em instantes."
    meta = { llmConfigured: false, backend: null, stockRowsLoaded: stockRows.length > 0 }
  }

  const saved = await saveIaMestreAssistantTurn({
    storeId: lojaId,
    conversationId,
    clientMessageId,
    content: message,
    type: "text",
  })

  return NextResponse.json({
    ...result,
    type: "text",
    data: { message },
    message,
    integration: meta,
    persistence: persistencePayload({
      conversationId,
      clientMessageId,
      userMessageId,
      assistantMessageId: saved.assistantMessageId,
    }),
  })
}
