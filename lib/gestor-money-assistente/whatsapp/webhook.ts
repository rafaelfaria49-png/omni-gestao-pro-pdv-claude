/**
 * Webhook Meta do canal de GESTÃO (assistente Gestor Money) — rota própria, separada do WhatsApp comercial.
 *
 * - DESLIGADO por padrão: exige `GESTOR_MONEY_ENABLED=true` E `GESTOR_MONEY_WHATSAPP_GESTAO=ligado` (404 sem isso).
 * - HMAC `X-Hub-Signature-256` SEMPRE obrigatório (sem bypass de desenvolvimento): segredo do app de gestão em
 *   `GESTOR_MONEY_WHATSAPP_APP_SECRET`. Ausente → 503; inválido → 401, nada persistido.
 * - Só aceita números cadastrados em `whatsapp_canais` com papel GESTAO, ativos e da WABA do envelope.
 *   Número de ATENDIMENTO (loja) ou desconhecido é ignorado aqui — o webhook comercial segue intacto.
 * - ACK 200 SÓ depois do COMMIT inbox+job (`persistirIngresso`, papel `omni_gastos_ingress`); falha → 500 para a
 *   Meta reentregar. Reentrega do mesmo wamid é idempotente (unique provedor+phoneNumberId+externalMessageId).
 * - Nenhum processamento financeiro nem download de mídia no request: o worker G006 processa a fila.
 */
import type { PrismaClient } from "@/generated/prisma"
import { persistirIngresso } from "@/lib/gastos/channels"
import { MensageriaError } from "@/lib/gastos/messaging-types"
import { META_WEBHOOK_MAX_BODY_BYTES, verifyMetaXHubSignature256 } from "@/lib/whatsapp-meta-webhook-signature"

export function canalGestaoLigado(env: Record<string, string | undefined>) {
  return env.GESTOR_MONEY_ENABLED === "true" && env.GESTOR_MONEY_WHATSAPP_GESTAO === "ligado"
}

type MensagemMeta = {
  id?: unknown
  from?: unknown
  timestamp?: unknown
  type?: unknown
  text?: { body?: unknown }
  audio?: { id?: unknown; mime_type?: unknown; voice?: unknown }
  image?: { id?: unknown; mime_type?: unknown; caption?: unknown }
  document?: { id?: unknown; mime_type?: unknown; filename?: unknown; caption?: unknown }
  context?: { id?: unknown }
}

const strLimit = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : undefined)

function extrairMidiaId(m: MensagemMeta): string | undefined {
  if (m.type === "audio") return strLimit(m.audio?.id, 200)
  if (m.type === "image") return strLimit(m.image?.id, 200)
  if (m.type === "document") return strLimit(m.document?.id, 200)
  return undefined
}

function conteudoDe(m: MensagemMeta): Record<string, unknown> {
  if (m.type === "text" && typeof m.text?.body === "string") return { tipo: "texto", texto: m.text.body.slice(0, 4000) }
  // G009/G010: apenas metadados técnicos e mediaId são enfileirados; download e IA ocorrem somente no worker oficial G006.
  if (m.type === "audio") {
    const mediaId = strLimit(m.audio?.id, 200)
    const mimeType = strLimit(m.audio?.mime_type, 80)
    return {
      tipo: "audio",
      ...(mediaId ? { mediaId } : {}),
      ...(mimeType ? { mimeType } : {}),
      voice: Boolean(m.audio?.voice),
    }
  }
  if (m.type === "image") {
    const mediaId = strLimit(m.image?.id, 200)
    const mimeType = strLimit(m.image?.mime_type, 80)
    const caption = strLimit(m.image?.caption, 1000)
    return {
      tipo: "foto",
      ...(mediaId ? { mediaId } : {}),
      ...(mimeType ? { mimeType } : {}),
      ...(caption ? { caption } : {}),
    }
  }
  if (m.type === "document") {
    const mediaId = strLimit(m.document?.id, 200)
    const mimeType = strLimit(m.document?.mime_type, 80)
    const filename = strLimit(m.document?.filename, 180)
    const caption = strLimit(m.document?.caption, 1000)
    return {
      tipo: "documento",
      ...(mediaId ? { mediaId } : {}),
      ...(mimeType ? { mimeType } : {}),
      ...(filename ? { filename } : {}),
      ...(caption ? { caption } : {}),
    }
  }
  return { tipo: "tecnico", meta: String(m.type ?? "desconhecido").slice(0, 40) }
}

export async function processarWebhookGestao(input: { rawBody: string; assinatura: string | null; env: Record<string, string | undefined>; ingress: PrismaClient | null }) {
  if (!canalGestaoLigado(input.env)) return { status: 404, body: { ok: false } }
  const segredo = input.env.GESTOR_MONEY_WHATSAPP_APP_SECRET?.trim()
  if (!segredo || !input.ingress) return { status: 503, body: { ok: false, error: "misconfigured" } }
  if (Buffer.byteLength(input.rawBody) > META_WEBHOOK_MAX_BODY_BYTES) return { status: 413, body: { ok: false } }
  if (!verifyMetaXHubSignature256(input.rawBody, input.assinatura, segredo)) return { status: 401, body: { ok: false, error: "assinatura" } }
  let payload: { object?: unknown; entry?: Array<{ id?: unknown; changes?: Array<{ value?: { metadata?: { phone_number_id?: unknown }; messages?: MensagemMeta[] } }> }> }
  try { payload = JSON.parse(input.rawBody) } catch { return { status: 400, body: { ok: false } } }
  if (payload?.object !== "whatsapp_business_account" || !Array.isArray(payload.entry)) return { status: 200, body: { ok: true, persistidas: 0 } }
  let persistidas = 0, ignoradas = 0
  for (const entry of payload.entry) {
    for (const change of entry.changes ?? []) {
      const phoneNumberId = String(change.value?.metadata?.phone_number_id ?? "")
      const mensagens = change.value?.messages ?? []
      if (!mensagens.length) continue // statuses (entregue/lido): sem conteúdo do usuário
      const canal = /^[0-9]{1,64}$/.test(phoneNumberId)
        ? await input.ingress.whatsAppCanal.findUnique({ where: { phoneNumberId } }) : null
      if (!canal || canal.papel !== "GESTAO" || !canal.ativo || String(entry.id ?? "") !== canal.wabaId) { ignoradas += mensagens.length; continue }
      for (const m of mensagens) {
        const ts = Number(m.timestamp)
        const mediaId = extrairMidiaId(m)
        try {
          await persistirIngresso(input.ingress, { provedor: "META", canalId: canal.canalId, phoneNumberId, wabaId: canal.wabaId, appId: canal.appId,
            externalMessageId: String(m.id ?? ""), remetenteE164: "+" + String(m.from ?? "").replace(/\D/g, ""), correlacaoId: String(m.id ?? ""),
            ...(typeof m.context?.id === "string" ? { respondidoA: m.context.id } : {}),
            ...(mediaId ? { mediaId } : {}),
            ocorridoEm: new Date(Number.isFinite(ts) && ts > 0 ? ts * 1000 : Date.now()).toISOString(), conteudo: conteudoDe(m) })
          persistidas++
        } catch (e) {
          // Envelope malformado não vira retry eterno; demais falhas pedem reentrega à Meta.
          if (e instanceof MensageriaError && (e.codigo === "INGRESSO_INVALIDO" || e.codigo === "REPLAY_DIVERGENTE")) { ignoradas++; continue }
          return { status: 500, body: { ok: false } }
        }
      }
    }
  }
  return { status: 200, body: { ok: true, persistidas, ignoradas } }
}

export function handshakeGestao(url: URL, env: Record<string, string | undefined>) {
  if (!canalGestaoLigado(env)) return { status: 404, body: "" }
  const token = env.GESTOR_MONEY_WHATSAPP_VERIFY_TOKEN?.trim()
  const ok = !!token && url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === token
  return ok ? { status: 200, body: url.searchParams.get("hub.challenge") ?? "" } : { status: 403, body: "" }
}
