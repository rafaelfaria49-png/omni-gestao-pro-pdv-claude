/** Garantias de desligamento: nada real sai nem entra sem gates explícitos (não precisa de banco). */
import { describe, expect, it } from "vitest"
import { transporteMetaGestao } from "./transporte"
import { canalGestaoLigado, handshakeGestao, processarWebhookGestao } from "./webhook"
import { extrairCodigo, mascararTelefone } from "./vinculo"

describe("canal de gestão desligado por padrão", () => {
  it("envio Meta real não constrói sem GESTOR_MONEY_WHATSAPP_ENVIO_REAL=habilitado", () => {
    expect(() => transporteMetaGestao()).toThrow("ENVIO_REAL_DESABILITADO")
  })
  it("webhook e handshake respondem 404 sem as duas flags", async () => {
    expect(canalGestaoLigado({})).toBe(false)
    expect(canalGestaoLigado({ GESTOR_MONEY_ENABLED: "true" })).toBe(false)
    expect((await processarWebhookGestao({ rawBody: "{}", assinatura: null, env: {}, ingress: null })).status).toBe(404)
    expect(handshakeGestao(new URL("https://x/?hub.mode=subscribe&hub.verify_token=t&hub.challenge=c"), {}).status).toBe(404)
  })
  it("ligado sem segredo ou sem conexão de ingresso: 503; token de verificação exato", async () => {
    const env = { GESTOR_MONEY_ENABLED: "true", GESTOR_MONEY_WHATSAPP_GESTAO: "ligado" }
    expect((await processarWebhookGestao({ rawBody: "{}", assinatura: null, env, ingress: null })).status).toBe(503)
    const url = (t: string) => new URL(`https://x/?hub.mode=subscribe&hub.verify_token=${t}&hub.challenge=abc`)
    expect(handshakeGestao(url("t1"), { ...env, GESTOR_MONEY_WHATSAPP_VERIFY_TOKEN: "t1" })).toEqual({ status: 200, body: "abc" })
    expect(handshakeGestao(url("t2"), { ...env, GESTOR_MONEY_WHATSAPP_VERIFY_TOKEN: "t1" }).status).toBe(403)
    expect(handshakeGestao(url(""), env).status).toBe(403)
  })
  it("código de pareamento: só a mensagem que é exatamente o código", () => {
    expect(extrairCodigo("123456")).toBe("123456")
    expect(extrairCodigo("código: 123 456")).toBe("123456")
    expect(extrairCodigo("gastei 123456 no mercado")).toBeNull()
    expect(extrairCodigo("12345")).toBeNull()
    expect(mascararTelefone("+5511999990000")).toBe("+*********0000")
  })
})
