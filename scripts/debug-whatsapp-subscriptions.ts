#!/usr/bin/env tsx
/**
 * scripts/debug-whatsapp-subscriptions.ts
 *
 * Diagnóstico completo das configurações WhatsApp Cloud API na Meta.
 * SOMENTE LEITURA — não altera nenhuma configuração de produção.
 *
 * Uso:
 *   npm run debug:whatsapp
 *
 * Variáveis de ambiente (.env.local ou Vercel):
 *   WHATSAPP_ACCESS_TOKEN           — Token de acesso permanente (obrigatório)
 *   WHATSAPP_BUSINESS_ACCOUNT_ID    — ID da WABA (obrigatório)
 *   WHATSAPP_APP_ID                 — ID do Meta App (obrigatório para check de subscriptions)
 *   WHATSAPP_PHONE_NUMBER_ID        — ID do número de telefone (opcional)
 *   WHATSAPP_APP_SECRET             — App Secret (opcional, melhora diagnóstico)
 *   WHATSAPP_API_VERSION            — Versão da API (padrão: v21.0)
 */

import * as dotenv from "dotenv"
import { resolve } from "path"

// ─── Carregar .env.local primeiro (valores dev/staging), depois .env ─────────
dotenv.config({ path: resolve(__dirname, "../.env.local") })
dotenv.config({ path: resolve(__dirname, "../.env") })

// ─── Configuração ─────────────────────────────────────────────────────────────

const API_VERSION   = (process.env.WHATSAPP_API_VERSION ?? "v21.0").trim()
const BASE_URL      = `https://graph.facebook.com/${API_VERSION}`

const ACCESS_TOKEN    = (process.env.WHATSAPP_ACCESS_TOKEN ?? "").trim()
const WABA_ID         = (process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ?? "").trim()
const APP_ID          = (process.env.WHATSAPP_APP_ID ?? "").trim()
const PHONE_NUMBER_ID = (process.env.WHATSAPP_PHONE_NUMBER_ID ?? "").trim()
const APP_SECRET      = (process.env.WHATSAPP_APP_SECRET ?? "").trim()

// App Access Token = APP_ID|APP_SECRET (não expira, não requer usuário)
const APP_ACCESS_TOKEN = APP_ID && APP_SECRET ? `${APP_ID}|${APP_SECRET}` : ""

// ─── Helpers de output ────────────────────────────────────────────────────────

function ok(msg: string)   { console.log(`  ✅  ${msg}`) }
function warn(msg: string) { console.log(`  ⚠️   ${msg}`) }
function err(msg: string)  { console.log(`  ❌  ${msg}`) }
function info(msg: string) { console.log(`  ℹ️   ${msg}`) }
function section(title: string) {
  console.log()
  console.log(`${"─".repeat(60)}`)
  console.log(`  ${title}`)
  console.log(`${"─".repeat(60)}`)
}

function maskToken(t: string): string {
  if (!t || t.length < 10) return "(vazio)"
  return `${t.slice(0, 6)}...${t.slice(-4)} (${t.length} chars)`
}

function maskId(id: string): string {
  if (!id) return "(não definido)"
  if (id.length <= 8) return id
  return `${id.slice(0, 6)}...${id.slice(-3)}`
}

// ─── Wrapper de fetch com timeout ─────────────────────────────────────────────

async function graphGet(
  path: string,
  token: string,
  fields?: string
): Promise<{ ok: boolean; data: unknown; status: number; error?: string }> {
  const url = new URL(`${BASE_URL}/${path}`)
  url.searchParams.set("access_token", token)
  if (fields) url.searchParams.set("fields", fields)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)

  try {
    const res = await fetch(url.toString(), { signal: controller.signal })
    const data = await res.json() as unknown
    clearTimeout(timeout)

    if (!res.ok) {
      const errObj = data as { error?: { message?: string; code?: number; type?: string } }
      return {
        ok: false,
        data,
        status: res.status,
        error: errObj?.error?.message ?? `HTTP ${res.status}`,
      }
    }
    return { ok: true, data, status: res.status }
  } catch (e) {
    clearTimeout(timeout)
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, data: null, status: 0, error: msg }
  }
}

// ─── Diagnóstico ──────────────────────────────────────────────────────────────

const findings: string[] = []

async function main() {
  console.log()
  console.log("╔══════════════════════════════════════════════════════════╗")
  console.log("║   WhatsApp Cloud API — Diagnóstico de Subscriptions      ║")
  console.log("╚══════════════════════════════════════════════════════════╝")
  console.log(`  API Version : ${API_VERSION}`)
  console.log(`  Executado em: ${new Date().toISOString()}`)

  // ══════════════════════════════════════════════════════════════════════════
  // SEÇÃO 1 — Variáveis de Ambiente
  // ══════════════════════════════════════════════════════════════════════════
  section("1/7 · Variáveis de Ambiente")

  const envChecks = [
    { key: "WHATSAPP_ACCESS_TOKEN",         val: ACCESS_TOKEN,    required: true  },
    { key: "WHATSAPP_BUSINESS_ACCOUNT_ID",  val: WABA_ID,         required: true  },
    { key: "WHATSAPP_APP_ID",               val: APP_ID,          required: false },
    { key: "WHATSAPP_PHONE_NUMBER_ID",      val: PHONE_NUMBER_ID, required: false },
    { key: "WHATSAPP_APP_SECRET",           val: APP_SECRET,      required: false },
  ]

  let envOk = true
  for (const c of envChecks) {
    if (c.val) {
      const display = c.key.includes("TOKEN") || c.key.includes("SECRET")
        ? maskToken(c.val)
        : maskId(c.val)
      ok(`${c.key} = ${display}`)
    } else if (c.required) {
      err(`${c.key} não definido — OBRIGATÓRIO`)
      envOk = false
    } else {
      warn(`${c.key} não definido — alguns checks serão pulados`)
    }
  }

  if (!envOk) {
    console.log()
    err("Variáveis obrigatórias ausentes. Adicione ao .env.local e reexecute.")
    info("Para encontrar os valores:")
    info("  WHATSAPP_ACCESS_TOKEN         → Meta Business Suite → Configurações → Acesso ao sistema")
    info("  WHATSAPP_BUSINESS_ACCOUNT_ID  → Meta Business Suite → Configurações → ID da conta de negócio WhatsApp")
    console.log()
    process.exit(1)
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SEÇÃO 2 — Validação do Token de Acesso
  // ══════════════════════════════════════════════════════════════════════════
  section("2/7 · Validação do Token de Acesso")

  // Preferência: debug_token com APP_ID|APP_SECRET (retorna type, scopes, validade).
  // Fallback: /me?fields=id,name (sem field "type" — inválido para System User).
  let tokenType = "desconhecido"
  let tokenUserId = ""
  let tokenValid = false

  if (APP_ACCESS_TOKEN) {
    info("Usando /debug_token com App Access Token para validação detalhada...")
    const dtUrl = new URL(`${BASE_URL}/debug_token`)
    dtUrl.searchParams.set("input_token", ACCESS_TOKEN)
    dtUrl.searchParams.set("access_token", APP_ACCESS_TOKEN)

    const dtController = new AbortController()
    const dtTimeout = setTimeout(() => dtController.abort(), 10_000)
    let dtData: unknown = null
    let dtStatus = 0
    let dtOk = false
    try {
      const dtFetch = await fetch(dtUrl.toString(), { signal: dtController.signal })
      dtStatus = dtFetch.status
      dtData = await dtFetch.json()
      dtOk = dtFetch.ok
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      err(`debug_token fetch error: ${msg}`)
    }
    clearTimeout(dtTimeout)

    if (dtOk && dtData) {
      const dt = (dtData as { data?: {
        is_valid?: boolean
        type?: string
        app_id?: string
        user_id?: string
        expires_at?: number
        scopes?: string[]
        error?: { message?: string; code?: number }
      } }).data

      if (dt?.error || !dt?.is_valid) {
        err(`Token inválido: ${dt?.error?.message ?? "is_valid=false"}`)
        findings.push("❌ ACCESS_TOKEN inválido — verificar no Meta Business Suite")
        if (dt?.error?.code === 190) err("Código 190 = token expirado. Gerar novo token permanente.")
        console.log(); process.exit(1)
      }

      tokenValid = true
      tokenType = dt?.type ?? "desconhecido"
      tokenUserId = dt?.user_id ?? ""
      const expiresAt = dt?.expires_at ?? 0
      const scopes = dt?.scopes ?? []

      ok(`Token válido ✓`)
      ok(`  type      = ${tokenType}`)
      ok(`  app_id    = ${dt?.app_id ?? "?"}`)
      ok(`  user_id   = ${maskId(tokenUserId)}`)
      info(`  expires_at= ${expiresAt === 0 ? "não expira (token permanente) ✓" : new Date(expiresAt * 1000).toISOString()}`)
      info(`  scopes    = ${scopes.slice(0, 8).join(", ") || "(nenhum)"}${scopes.length > 8 ? "..." : ""}`)

      if (tokenType === "SYSTEM_USER") {
        ok("System User token — adequado para produção ✓")
      } else if (tokenType === "USER") {
        warn("Token de usuário pessoal (não system user) — pode expirar. Use System User token para produção.")
        findings.push("⚠️ Usar System User token em vez de token de usuário pessoal")
      }

      if (!scopes.includes("whatsapp_business_messaging") && !scopes.includes("business_management")) {
        warn("Permissão whatsapp_business_messaging/business_management não encontrada nos scopes.")
        findings.push("⚠️ Token pode não ter permissões suficientes para webhooks WhatsApp")
      }
    } else {
      err(`debug_token falhou (HTTP ${dtStatus}): ${JSON.stringify(dtData)?.slice(0, 200)}`)
      findings.push("❌ Não foi possível validar token com debug_token")
    }
  } else {
    // Fallback: /me sem field type (type não é suportado em System User tokens)
    info("APP_ACCESS_TOKEN não disponível — usando /me?fields=id,name (validação básica)")
    const meRes = await graphGet("me", ACCESS_TOKEN, "id,name")
    if (!meRes.ok) {
      err(`Token inválido ou expirado: ${meRes.error}`)
      findings.push("❌ ACCESS_TOKEN inválido — verificar no Meta Business Suite")
      const errData = meRes.data as { error?: { code?: number } } | null
      if (errData?.error?.code === 190) err("Código 190 = token expirado.")
      console.log(); process.exit(1)
    }
    const me = meRes.data as { id?: string; name?: string }
    tokenValid = true
    tokenUserId = me.id ?? ""
    ok(`Token válido (validação básica) — id=${maskId(me.id ?? "")} name="${me.name ?? "(sistema)"}"`)
    warn("Para validação completa (type, scopes, validade): definir WHATSAPP_APP_ID + WHATSAPP_APP_SECRET")
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SEÇÃO 3 — Informações da WABA
  // ══════════════════════════════════════════════════════════════════════════
  section("3/7 · WABA (WhatsApp Business Account)")

  const wabaRes = await graphGet(
    WABA_ID,
    ACCESS_TOKEN,
    "id,name,currency,account_review_status,status,on_behalf_of_business_info,message_template_namespace"
  )

  if (!wabaRes.ok) {
    err(`Não foi possível acessar WABA ${maskId(WABA_ID)}: ${wabaRes.error}`)
    findings.push(`❌ WABA inacessível — verificar WHATSAPP_BUSINESS_ACCOUNT_ID e permissões do token`)

    const errData = wabaRes.data as { error?: { code?: number } } | null
    if (errData?.error?.code === 100) {
      err("Código 100 = ID inválido ou sem permissão de acesso para esta WABA.")
      info("Confirme o WABA ID em: Meta Business Suite → Configurações → Contas do WhatsApp")
    }
  } else {
    const waba = wabaRes.data as {
      id?: string
      name?: string
      currency?: string
      account_review_status?: string
      status?: string
    }
    ok(`WABA acessível: name="${waba.name ?? "?"}" currency=${waba.currency ?? "?"}`)
    if (waba.account_review_status) {
      const s = waba.account_review_status.toUpperCase()
      if (s === "APPROVED") {
        ok(`account_review_status = ${s}`)
      } else if (s === "PENDING") {
        warn(`account_review_status = ${s} — conta ainda em revisão pela Meta`)
        findings.push("⚠️ WABA em revisão — pode limitar envio/recebimento de mensagens")
      } else {
        err(`account_review_status = ${s}`)
        findings.push(`❌ WABA com status de revisão: ${s}`)
      }
    }
    if (waba.status) {
      const s = waba.status.toUpperCase()
      if (s === "ACTIVE") ok(`WABA status = ${s}`)
      else { err(`WABA status = ${s} — conta inativa`); findings.push(`❌ WABA status: ${s}`) }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SEÇÃO 4 — WABA Subscribed Apps ← CHECK MAIS IMPORTANTE
  // ══════════════════════════════════════════════════════════════════════════
  section("4/7 · WABA Subscribed Apps  ⟵  CAUSA MAIS COMUM")

  info("Se esta lista estiver vazia, a Meta NÃO envia eventos de webhook para NENHUM app.")
  info("O webhook pode estar verificado e o campo 'messages' assinado, mas sem")
  info("subscribed_apps o POST inbound nunca chega.")
  console.log()

  const subsRes = await graphGet(`${WABA_ID}/subscribed_apps`, ACCESS_TOKEN)

  if (!subsRes.ok) {
    err(`Erro ao consultar subscribed_apps: ${subsRes.error}`)
    findings.push("❌ Não foi possível verificar subscribed_apps — verificar permissão whatsapp_business_management")
  } else {
    // Meta API retorna { data: [{ whatsapp_business_api_data: { id, name, link } }] }
    const subsData = subsRes.data as {
      data?: Array<{
        whatsapp_business_api_data?: { id?: string; name?: string; link?: string }
        id?: string
        name?: string
      }>
    }
    const rawApps = subsData.data ?? []

    // Normalizar: suporta resposta aninhada (whatsapp_business_api_data) ou plana
    const apps = rawApps.map((a) => ({
      id: a.whatsapp_business_api_data?.id ?? a.id,
      name: a.whatsapp_business_api_data?.name ?? a.name,
    }))

    if (apps.length === 0) {
      err("NENHUM app inscrito nesta WABA — esta é a causa raiz do inbound não chegar!")
      findings.push("❌ CAUSA RAIZ: WABA sem subscribed_apps — execute o curl abaixo para corrigir")

      console.log()
      console.log("  ┌─ CORREÇÃO — execute este curl (uma única vez) ─────────────────")
      console.log(`  │`)
      console.log(`  │  curl -X POST \\`)
      console.log(`  │    "https://graph.facebook.com/${API_VERSION}/${WABA_ID}/subscribed_apps" \\`)
      console.log(`  │    -H "Authorization: Bearer ${maskToken(ACCESS_TOKEN)}" `)
      console.log(`  │`)
      console.log(`  │  (substitua o token pelo valor real de WHATSAPP_ACCESS_TOKEN)`)
      console.log("  └────────────────────────────────────────────────────────────────")
    } else {
      ok(`${apps.length} app(s) inscrito(s) nesta WABA:`)
      for (const app of apps) {
        const match = APP_ID && app.id === APP_ID
        if (match) {
          ok(`  → id=${app.id} name="${app.name ?? "?"}" ← ESTE APP ✓`)
        } else {
          info(`  → id=${app.id ?? "(sem id)"} name="${app.name ?? "?"}"`)
        }
      }

      if (APP_ID) {
        const thisAppSubscribed = apps.some((a) => a.id === APP_ID)
        if (!thisAppSubscribed) {
          err(`App ${maskId(APP_ID)} (WHATSAPP_APP_ID) NÃO está na lista de subscribed_apps!`)
          findings.push(`❌ WHATSAPP_APP_ID não está subscrito — execute o curl da seção acima para este app`)
          console.log()
          console.log("  ┌─ CORREÇÃO ──────────────────────────────────────────────────────")
          console.log(`  │`)
          console.log(`  │  curl -X POST \\`)
          console.log(`  │    "https://graph.facebook.com/${API_VERSION}/${WABA_ID}/subscribed_apps" \\`)
          console.log(`  │    -H "Authorization: Bearer ${maskToken(ACCESS_TOKEN)}" `)
          console.log(`  │`)
          console.log("  └────────────────────────────────────────────────────────────────")
        } else {
          ok(`App correto (WHATSAPP_APP_ID) está subscrito — eventos DEVEM chegar`)
          findings.push("✅ subscribed_apps OK — este não é o problema")
        }
      } else {
        warn("WHATSAPP_APP_ID não definido — não é possível confirmar se este app está na lista")
        findings.push("⚠️ Definir WHATSAPP_APP_ID para confirmar se o app correto está subscrito")
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SEÇÃO 5 — Status do Número de Telefone
  // ══════════════════════════════════════════════════════════════════════════
  section("5/7 · Phone Number Status")

  if (!PHONE_NUMBER_ID) {
    warn("WHATSAPP_PHONE_NUMBER_ID não definido — check pulado")
    findings.push("⚠️ Definir WHATSAPP_PHONE_NUMBER_ID para verificar status do número")
  } else {
    const pnRes = await graphGet(
      PHONE_NUMBER_ID,
      ACCESS_TOKEN,
      "id,display_phone_number,verified_name,quality_rating,status,name_status,code_verification_status,throughput"
    )

    if (!pnRes.ok) {
      err(`Erro ao consultar phone number ${maskId(PHONE_NUMBER_ID)}: ${pnRes.error}`)
      findings.push("❌ Phone number inacessível — verificar WHATSAPP_PHONE_NUMBER_ID")
    } else {
      const pn = pnRes.data as {
        display_phone_number?: string
        verified_name?: string
        quality_rating?: string
        status?: string
        name_status?: string
        code_verification_status?: string
        throughput?: { level?: string }
      }

      ok(`Número: ${pn.display_phone_number ?? "?"} (${pn.verified_name ?? "sem nome verificado"})`)

      const status = (pn.status ?? "").toUpperCase()
      if (status === "CONNECTED") {
        ok(`status = ${status}`)
      } else if (status === "DISCONNECTED") {
        err(`status = ${status} — número desconectado! Inbound e outbound não funcionam.`)
        findings.push(`❌ Número com status DISCONNECTED`)
      } else if (status) {
        warn(`status = ${status}`)
        findings.push(`⚠️ Número com status inesperado: ${status}`)
      }

      const quality = (pn.quality_rating ?? "").toUpperCase()
      if (quality === "GREEN") ok(`quality_rating = ${quality}`)
      else if (quality === "YELLOW") warn(`quality_rating = ${quality} — qualidade degradada`)
      else if (quality === "RED") {
        err(`quality_rating = ${quality} — número com restrições por baixa qualidade`)
        findings.push("❌ Qualidade do número RED — pode ter restrições de inbound")
      } else if (quality) {
        info(`quality_rating = ${quality}`)
      }

      const nameStatus = (pn.name_status ?? "").toUpperCase()
      if (nameStatus && nameStatus !== "APPROVED") {
        warn(`name_status = ${nameStatus} — nome do número não aprovado`)
      }

      const throughput = pn.throughput?.level
      if (throughput) info(`throughput = ${throughput}`)
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SEÇÃO 6 — App Webhook Subscriptions
  // ══════════════════════════════════════════════════════════════════════════
  section("6/7 · App Webhook Subscriptions")

  if (!APP_ID) {
    warn("WHATSAPP_APP_ID não definido — check pulado")
    info("Para habilitar: adicione WHATSAPP_APP_ID=<id> ao .env.local")
    info("Encontrar em: developers.facebook.com → Seu App → Configurações → Básico → ID do Aplicativo")
  } else if (!APP_ACCESS_TOKEN) {
    warn("WHATSAPP_APP_SECRET não definido — usando access_token do usuário para /subscriptions")
    info("Para resultado mais preciso, defina WHATSAPP_APP_SECRET no .env.local")
  }

  if (APP_ID) {
    const tokenToUse = APP_ACCESS_TOKEN || ACCESS_TOKEN
    const subRes = await graphGet(`${APP_ID}/subscriptions`, tokenToUse)

    if (!subRes.ok) {
      const errData = subRes.data as { error?: { code?: number } } | null
      if (errData?.error?.code === 200 || errData?.error?.code === 190) {
        warn("Sem permissão para listar subscriptions do app via token de usuário")
        warn("Use App Access Token (APP_ID|APP_SECRET) para este check")
        info("Verifique manualmente em: developers.facebook.com → Seu App → Webhooks")
      } else {
        err(`Erro em /${APP_ID}/subscriptions: ${subRes.error}`)
      }
    } else {
      const subData = subRes.data as {
        data?: Array<{
          object?: string
          fields?: Array<{ name?: string; version?: string }>
          active?: boolean
          callback_url?: string
        }>
      }
      const subs = subData.data ?? []

      const waSub = subs.find((s) => s.object === "whatsapp_business_account")
      if (!waSub) {
        err("Sem subscription whatsapp_business_account neste app!")
        err("Significa que webhook não está configurado para receber eventos WhatsApp.")
        findings.push("❌ App sem subscription para whatsapp_business_account")
        info("Configurar em: developers.facebook.com → Seu App → WhatsApp → Configuração → Webhooks")
      } else {
        ok(`Subscription whatsapp_business_account encontrada`)
        ok(`Callback URL: ${waSub.callback_url ?? "(não exibida)"}`)
        ok(`Active: ${waSub.active ?? "?"}`)

        const fields = (waSub.fields ?? []).map((f) => f.name).filter(Boolean)
        info(`Campos subscritos: ${fields.join(", ") || "(nenhum)"}`)

        if (fields.includes("messages")) {
          ok("Campo 'messages' está subscrito ✓")
        } else {
          err("Campo 'messages' NÃO está subscrito!")
          findings.push("❌ Campo 'messages' não subscrito no webhook do app")
          info("Adicionar em: developers.facebook.com → Seu App → WhatsApp → Configuração → Webhooks → messages")
        }

        if (!waSub.active) {
          err("Subscription está INATIVA")
          findings.push("❌ Webhook subscription inativa no app")
        }

        if (waSub.callback_url) {
          const expectedUrl = "https://omni-gestao-pro.vercel.app/api/webhooks/whatsapp"
          if (!waSub.callback_url.includes("omni-gestao-pro")) {
            warn(`Callback URL inesperada: ${waSub.callback_url}`)
            warn(`Esperado: ${expectedUrl}`)
            findings.push(`⚠️ Callback URL pode estar apontando para o lugar errado: ${waSub.callback_url}`)
          } else {
            ok(`Callback URL aponta para domínio correto ✓`)
          }
        }
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SEÇÃO 7 — Verificar Modo do App (Development vs Live)
  // ══════════════════════════════════════════════════════════════════════════
  section("7/7 · Modo do App (Development vs Live)")

  info("Em modo DEVELOPMENT: somente usuários listados em Roles → Test Users podem")
  info("enviar mensagens que disparam eventos inbound no webhook.")
  info("Em modo LIVE: qualquer número pode enviar mensagens e disparar eventos.")
  console.log()

  if (APP_ID) {
    // Usar App Access Token para leitura do app — mais confiável que user token
    const appTokenToUse = APP_ACCESS_TOKEN || ACCESS_TOKEN
    const appRes = await graphGet(APP_ID, appTokenToUse, "id,name")
    if (!appRes.ok) {
      warn(`Não foi possível verificar app ${maskId(APP_ID)}: ${appRes.error}`)
      info("Isso pode ocorrer com System User tokens sem permissão de leitura do app.")
    } else {
      const app = appRes.data as { id?: string; name?: string }
      ok(`App: id=${app.id ?? "?"} name="${app.name ?? "?"}"`)

      warn("AÇÃO MANUAL NECESSÁRIA: Verificar se app está em 'Development' ou 'Live'")
      info("→ Abrir: developers.facebook.com → Seu App → topo da página")
      info("→ Se mostrar 'Development' (switch verde): mudar para LIVE para receber de qualquer número")
      info("→ Se já estiver LIVE mas ainda em revisão: aguardar aprovação ou testar com Test User")
      findings.push("⚠️ Verificar manualmente se o app está em modo LIVE (não verificável via API)")
    }
  } else {
    warn("WHATSAPP_APP_ID não definido — verificar modo do app manualmente")
    info("→ developers.facebook.com → Seu App → switch no topo: Development / Live")
    findings.push("⚠️ Verificar manualmente modo do app (WHATSAPP_APP_ID não definido)")
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RELATÓRIO FINAL
  // ══════════════════════════════════════════════════════════════════════════
  console.log()
  console.log("╔══════════════════════════════════════════════════════════╗")
  console.log("║   RELATÓRIO FINAL DE DIAGNÓSTICO                         ║")
  console.log("╚══════════════════════════════════════════════════════════╝")
  console.log()

  if (findings.length === 0) {
    ok("Nenhum problema detectado nos checks automáticos.")
    info("Se inbound ainda não chega: verificar manualmente o modo do app (Development vs Live).")
  } else {
    console.log("  Problemas encontrados:")
    for (const f of findings) {
      console.log(`    ${f}`)
    }
  }

  console.log()
  console.log("  Prioridade de investigação (mais provável → menos provável):")
  console.log()
  console.log("  1. WABA subscribed_apps vazia           → execute o curl da Seção 4")
  console.log("  2. App em modo Development              → mudar para Live ou adicionar Test User")
  console.log("  3. Campo 'messages' não subscrito       → adicionar no painel Meta/Webhooks")
  console.log("  4. Phone number DISCONNECTED            → reconectar número na Meta")
  console.log("  5. Token inválido / sem permissão       → regenerar token permanente")
  console.log()
  console.log("  Docs de referência:")
  console.log("  → https://developers.facebook.com/docs/whatsapp/business-platform/getting-started/business-accounts")
  console.log("  → https://developers.facebook.com/docs/whatsapp/business-management-api/webhook-subscriptions")
  console.log()
}

main().catch((e) => {
  console.error()
  console.error("  ❌ Erro inesperado no script de diagnóstico:")
  console.error(" ", e instanceof Error ? e.message : String(e))
  process.exit(1)
})
