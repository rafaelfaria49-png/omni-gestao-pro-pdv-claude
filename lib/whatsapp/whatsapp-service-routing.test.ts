/**
 * F-04 / DT-07 (MULTI_LOJA-S-003): guard estático do roteamento WhatsApp por tenant.
 *
 * Após o CP4, `webhookDefaultStoreId` foi REMOVIDO. O inbound roteia por `phone_number_id`
 * (`resolveStoreIdByPhoneNumberId`); o outbound resolve credenciais por loja; o owner-AI e as
 * rotas de debug resolvem a loja sem env single-store. Validamos por inspeção de fonte —
 * carregar os módulos reais em Vitest puxa Prisma + Cloud API (caro/instável); o guard
 * estático é a rede de segurança contra reintrodução do fallback silencioso para a loja principal.
 */
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const readSrc = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8")

describe("F-04 — roteamento WhatsApp por tenant, sem fallback loja-1", () => {
  it("whatsapp-service.ts exporta resolveStoreIdByPhoneNumberId (inbound)", () => {
    expect(readSrc("lib/whatsapp/whatsapp-service.ts")).toContain(
      "export async function resolveStoreIdByPhoneNumberId"
    )
  })

  it("whatsapp-service.ts NÃO contém mais webhookDefaultStoreId (removido no CP4)", () => {
    expect(readSrc("lib/whatsapp/whatsapp-service.ts")).not.toContain("webhookDefaultStoreId")
  })

  it("o processor de ingress usa o resolver e NÃO usa webhookDefaultStoreId", () => {
    const src = readSrc("lib/whatsapp-meta-cloud-webhook.ts")
    expect(src).toContain("resolveStoreIdByPhoneNumberId")
    expect(src).not.toContain("webhookDefaultStoreId")
  })

  it("o processor de ingress NÃO referencia LEGACY_PRIMARY_STORE_ID", () => {
    expect(readSrc("lib/whatsapp-meta-cloud-webhook.ts")).not.toContain("LEGACY_PRIMARY_STORE_ID")
  })

  it("as rotas de webhook NÃO usam webhookDefaultStoreId", () => {
    expect(readSrc("app/api/whatsapp/webhook/route.ts")).not.toContain("webhookDefaultStoreId")
    expect(readSrc("app/api/webhooks/whatsapp/route.ts")).not.toContain("webhookDefaultStoreId")
  })

  it("nenhuma rota de debug usa webhookDefaultStoreId (CP4)", () => {
    for (const f of [
      "app/api/debug/whatsapp-latest/route.ts",
      "app/api/debug/whatsapp-send-fake-meta/route.ts",
      "app/api/debug/whatsapp-webhook-ping/route.ts",
    ]) {
      expect(readSrc(f)).not.toContain("webhookDefaultStoreId")
    }
  })

  it("owner-AI NÃO lê WHATSAPP_WEBHOOK_STORE_ID (resolve a loja pelo mapa)", () => {
    const src = readSrc("lib/whatsapp-webhook-ai.ts")
    expect(src).not.toContain("WHATSAPP_WEBHOOK_STORE_ID")
    expect(src).toContain("resolveSoleActiveStoreId")
  })

  it("status do Omni Agent reflete a loja (sem env global de número/token)", () => {
    const src = readSrc("app/actions/omni-agent.ts")
    expect(src).toContain("resolveStoreWhatsAppCredentials")
    expect(src).not.toContain("process.env.WHATSAPP_PHONE_NUMBER_ID")
    expect(src).not.toContain("process.env.WHATSAPP_ACCESS_TOKEN")
  })
})
