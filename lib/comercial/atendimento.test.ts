import { describe, expect, it } from "vitest"
import { instrucoesDeAcesso, linkWhatsappInteressado } from "./atendimento"

describe("atendimento comercial", () => {
  it("WhatsApp nacional ganha o 55; internacional só se já começar com 55", () => {
    expect(linkWhatsappInteressado("11912345678")).toBe("https://wa.me/5511912345678")
    expect(linkWhatsappInteressado("1131234567")).toBe("https://wa.me/551131234567")
    expect(linkWhatsappInteressado("5511912345678")).toBe("https://wa.me/5511912345678")
    expect(linkWhatsappInteressado("(11) 91234-5678")).toBe("https://wa.me/5511912345678")
  })

  it("número fora do formato não vira link", () => {
    expect(linkWhatsappInteressado("123456789")).toBeNull()
    expect(linkWhatsappInteressado("4411912345678")).toBeNull()
    expect(linkWhatsappInteressado("")).toBeNull()
  })

  it("instruções de entrada trazem endereço e email, nunca a senha", () => {
    const t = instrucoesDeAcesso({ loginUrl: "https://exemplo.test/login", email: "dono@loja.test", nomeLoja: "Loja Teste" })
    expect(t).toContain("https://exemplo.test/login")
    expect(t).toContain("dono@loja.test")
    expect(t).toContain("Loja Teste")
    expect(t).toMatch(/senha temporária que enviaremos em outra mensagem/)
    expect(t).toMatch(/senha nova/)
  })
})
