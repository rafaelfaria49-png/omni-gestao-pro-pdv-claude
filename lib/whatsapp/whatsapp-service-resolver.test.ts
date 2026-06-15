/**
 * WhatsApp IA — F4 · testes do resolver de serviço de assistência.
 */
import { describe, expect, it } from "vitest"
import { resolveWhatsAppService } from "./whatsapp-service-resolver"

describe("resolveWhatsAppService", () => {
  it("'trocar a tela' → TROCA_TELA", () => {
    const r = resolveWhatsAppService("quanto fica trocar a tela do moto g22")
    expect(r.servico).toBe("TROCA_TELA")
    expect(r.partTokens).toContain("tela")
    expect(r.confidence).toBeGreaterThan(0.5)
  })

  it("'bateria' → TROCA_BATERIA", () => {
    expect(resolveWhatsAppService("quanto custa a bateria do iphone 11").servico).toBe("TROCA_BATERIA")
  })

  it("'conector' / 'não carrega' → TROCA_CONECTOR (sintoma específico vence)", () => {
    expect(resolveWhatsAppService("troca de conector samsung a12").servico).toBe("TROCA_CONECTOR")
    expect(resolveWhatsAppService("meu celular não carrega").servico).toBe("TROCA_CONECTOR")
  })

  it("'atualização de software' → ATUALIZACAO_SOFTWARE", () => {
    expect(resolveWhatsAppService("preciso atualizar o software").servico).toBe("ATUALIZACAO_SOFTWARE")
    expect(resolveWhatsAppService("quero formatar o aparelho").servico).toBe("ATUALIZACAO_SOFTWARE")
  })

  it("'desbloqueio' / conta google → DESBLOQUEIO", () => {
    expect(resolveWhatsAppService("desbloqueio de conta google").servico).toBe("DESBLOQUEIO")
  })

  it("'caiu na água' → LIMPEZA", () => {
    expect(resolveWhatsAppService("meu celular caiu na água").servico).toBe("LIMPEZA")
    expect(resolveWhatsAppService("molhou e não liga direito").servico).toBe("LIMPEZA")
  })

  it("'não liga' / diagnóstico → DIAGNOSTICO", () => {
    expect(resolveWhatsAppService("meu celular não liga").servico).toBe("DIAGNOSTICO")
  })

  it("serviço inexistente / mensagem genérica → null", () => {
    const r = resolveWhatsAppService("bom dia, tudo bem?")
    expect(r.servico).toBeNull()
    expect(r.confidence).toBe(0)
  })

  it("texto vazio → null", () => {
    expect(resolveWhatsAppService("").servico).toBeNull()
  })
})
