import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import SuportePage from "./page"

afterEach(() => { vi.unstubAllEnvs() })

describe("/suporte — só contato aprovado (GESTAO_LOJAS_CONTATO_*)", () => {
  it("sem contato configurado não mostra número nem email fictício", () => {
    vi.stubEnv("GESTAO_LOJAS_CONTATO_WHATSAPP", "")
    vi.stubEnv("GESTAO_LOJAS_CONTATO_EMAIL", "")
    const html = renderToStaticMarkup(SuportePage())
    expect(html).not.toMatch(/00000-0000|seudominio|wa\.me|mailto:/)
    expect(html).toContain("enviados pela equipe junto com o acesso")
  })

  it("com contato aprovado mostra exatamente o configurado", () => {
    vi.stubEnv("GESTAO_LOJAS_CONTATO_WHATSAPP", "+55 (11) 91234-5678")
    vi.stubEnv("GESTAO_LOJAS_CONTATO_EMAIL", "suporte@exemplo.invalid")
    const html = renderToStaticMarkup(SuportePage())
    expect(html).toContain('href="https://wa.me/5511912345678"')
    expect(html).toContain('href="mailto:suporte@exemplo.invalid"')
  })

  it("valor malformado falha fechado", () => {
    vi.stubEnv("GESTAO_LOJAS_CONTATO_WHATSAPP", "123")
    vi.stubEnv("GESTAO_LOJAS_CONTATO_EMAIL", "não-é-email")
    expect(renderToStaticMarkup(SuportePage())).not.toMatch(/wa\.me|mailto:/)
  })
})
