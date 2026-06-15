/**
 * WhatsApp IA — F4 · testes do resolver de aparelho.
 */
import { describe, expect, it } from "vitest"
import { resolveWhatsAppDevice } from "./whatsapp-device-resolver"

describe("resolveWhatsAppDevice", () => {
  it("'Moto G22' → Motorola + modelo + confiança alta", () => {
    const r = resolveWhatsAppDevice("quanto fica trocar a tela do Moto G22?")
    expect(r.marca).toBe("Motorola")
    expect(r.modelo).toMatch(/Moto\s*G\s*22/i)
    expect(r.confidence).toBeGreaterThanOrEqual(0.8)
  })

  it("'iPhone 11' → Apple", () => {
    const r = resolveWhatsAppDevice("bateria do iPhone 11 quanto custa?")
    expect(r.marca).toBe("Apple")
    expect(r.modelo).toBe("iPhone 11")
    expect(r.confidence).toBeGreaterThanOrEqual(0.8)
  })

  it("'iPhone 13 Pro Max' → variante preservada", () => {
    const r = resolveWhatsAppDevice("troca de tela iphone 13 pro max")
    expect(r.marca).toBe("Apple")
    expect(r.modelo.toLowerCase()).toContain("pro max")
  })

  it("'Samsung A06' → Samsung Galaxy A06", () => {
    const r = resolveWhatsAppDevice("vocês consertam Samsung A06?")
    expect(r.marca).toBe("Samsung")
    expect(r.modelo).toContain("A06")
  })

  it("'Samsung A12' (conector) → Samsung A12", () => {
    const r = resolveWhatsAppDevice("troca de conector Samsung A12")
    expect(r.marca).toBe("Samsung")
    expect(r.modelo).toContain("A12")
  })

  it("'Redmi Note 13' → Xiaomi", () => {
    const r = resolveWhatsAppDevice("troca de tela Redmi Note 13")
    expect(r.marca).toBe("Xiaomi")
    expect(r.modelo.toLowerCase()).toContain("redmi note")
    expect(r.modelo).toContain("13")
  })

  it("marca sem número de modelo → confiança média", () => {
    const r = resolveWhatsAppDevice("tenho um iphone")
    expect(r.marca).toBe("Apple")
    expect(r.confidence).toBeLessThan(0.8)
    expect(r.confidence).toBeGreaterThan(0)
  })

  it("aparelho inexistente / texto vago → confiança 0", () => {
    const r = resolveWhatsAppDevice("meu aparelho está com problema")
    expect(r.marca).toBe("")
    expect(r.modelo).toBe("")
    expect(r.confidence).toBe(0)
  })

  it("texto vazio → confiança 0", () => {
    expect(resolveWhatsAppDevice("").confidence).toBe(0)
  })
})
