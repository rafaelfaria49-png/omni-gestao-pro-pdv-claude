/**
 * Cliente minimalista para WhatsApp Cloud API (Meta Graph).
 *
 * Credenciais são resolvidas POR LOJA (F-04/DT-07 · ADR-0006): o caller passa
 * `WhatsAppCloudCredentials` ({ phoneNumberId, accessToken }) da loja correta.
 * Este módulo NÃO lê número/token de env global (apenas a versão da API, não-secreta).
 * Não logar token nem corpo de erro completo (pode conter dados sensíveis).
 */

const DEFAULT_API_VERSION = "v21.0"

function graphBase(): string {
  const v = (process.env.WHATSAPP_API_VERSION ?? DEFAULT_API_VERSION).replace(/^v/, "v")
  return `https://graph.facebook.com/${v}`
}

/**
 * Credenciais Meta resolvidas POR LOJA. O cliente Graph não lê env global de
 * número/token — quem envia injeta as credenciais da loja correta.
 */
export type WhatsAppCloudCredentials = {
  /** Meta `phone_number_id` da loja. */
  phoneNumberId: string
  /** Access token Meta da loja (resolvido de env via `tokenEnvKey`; nunca persistido). */
  accessToken: string
}

/** Somente dígitos; E.164 sem + (ex.: 5511999990000). */
export function normalizeWhatsAppRecipientDigits(raw: string): string {
  return String(raw ?? "").replace(/\D/g, "")
}

/**
 * Valida destino para envio (evita strings absurdas / injection na API).
 * WhatsApp usa 8–15 dígitos no campo `to` (com DDI).
 */
export function assertValidWhatsAppRecipientDigits(digits: string): string {
  const d = normalizeWhatsAppRecipientDigits(digits)
  if (d.length < 8 || d.length > 15) {
    throw new Error("Telefone de destino inválido (use DDI + número, só dígitos).")
  }
  return d
}

type GraphSendResponse = {
  messaging_product?: string
  contacts?: unknown
  messages?: Array<{ id?: string }>
  error?: { message?: string; code?: number; error_subcode?: number }
}

async function postMessages(creds: WhatsAppCloudCredentials, body: unknown): Promise<GraphSendResponse> {
  const pnid = (creds?.phoneNumberId ?? "").trim()
  const token = (creds?.accessToken ?? "").trim()
  if (!pnid) throw new Error("WhatsApp Cloud API: phoneNumberId da loja ausente")
  if (!token) throw new Error("WhatsApp Cloud API: accessToken da loja ausente")
  const url = `${graphBase()}/${encodeURIComponent(pnid)}/messages`
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  const json = (await res.json().catch(() => ({}))) as GraphSendResponse
  if (!res.ok) {
    const hint = json.error?.message ?? res.statusText
    throw new Error(`WhatsApp Cloud API: falha ao enviar (${res.status}) — ${hint}`)
  }
  return json
}

export async function sendTextMessage(
  creds: WhatsAppCloudCredentials,
  toDigits: string,
  text: string
): Promise<GraphSendResponse> {
  const to = assertValidWhatsAppRecipientDigits(toDigits)
  const body = (text ?? "").trim()
  if (!body) throw new Error("Texto vazio")
  return postMessages(creds, {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { preview_url: false, body },
  })
}

export type TemplateComponent = {
  type: string
  parameters?: unknown[]
  sub_type?: string
  index?: string | number
}

export async function sendTemplateMessage(
  creds: WhatsAppCloudCredentials,
  input: {
    toDigits: string
    templateName: string
    languageCode: string
    components?: TemplateComponent[]
  }
): Promise<GraphSendResponse> {
  const to = assertValidWhatsAppRecipientDigits(input.toDigits)
  const name = (input.templateName ?? "").trim()
  if (!name) throw new Error("templateName obrigatório")
  const languageCode = (input.languageCode ?? "").trim() || "pt_BR"
  return postMessages(creds, {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name,
      language: { code: languageCode },
      ...(input.components && input.components.length > 0 ? { components: input.components } : {}),
    },
  })
}

export async function sendMediaMessage(
  creds: WhatsAppCloudCredentials,
  input: {
    toDigits: string
    mediaType: "image" | "document" | "audio" | "video"
    /** URL HTTPS pública acessível pela Meta. */
    link: string
    caption?: string
    filename?: string
  }
): Promise<GraphSendResponse> {
  const to = assertValidWhatsAppRecipientDigits(input.toDigits)
  const link = (input.link ?? "").trim()
  if (!link.startsWith("https://")) throw new Error("link deve ser HTTPS")
  const cap = (input.caption ?? "").trim()

  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    to,
    type: input.mediaType,
    [input.mediaType]: {
      link,
      ...(cap ? { caption: cap } : {}),
      ...(input.mediaType === "document" && (input.filename ?? "").trim()
        ? { filename: (input.filename ?? "").trim() }
        : {}),
    },
  }
  return postMessages(creds, payload)
}

export function firstOutboundWamid(res: GraphSendResponse): string {
  const id = res.messages?.[0]?.id
  return typeof id === "string" ? id : ""
}
