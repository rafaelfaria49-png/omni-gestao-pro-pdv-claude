import { describe, expect, it } from "vitest"
import { BASIC_MODULE_ACCESS } from "@/lib/auth/access-policy"
import { OFERTA_COMERCIAL_GESTAO_LOJAS } from "@/lib/comercial/gestao-lojas-oferta"
import { flagLigada, lerSaasFlags } from "@/lib/saas/flags"
import { CATALOGO_PLANOS_SAAS, condicoesContratadas, obterPlanoSaas, PLANO_VENDAS_E_ESTOQUE, planosAtivosParaVenda } from "@/lib/saas/planos"

describe("catálogo de planos SaaS", () => {
  it("Vendas e Estoque reflete a oferta da landing sem mudar valores", () => {
    expect(PLANO_VENDAS_E_ESTOQUE).toMatchObject({
      id: "vendas-e-estoque",
      nome: "OmniGestão Pro — Vendas e Estoque",
      precoMensalCentavos: 6990,
      limiteUsuariosPorLoja: 2,
      diasTeste: 7,
      cobranca: "por_loja",
      versao: 1,
    })
    expect(OFERTA_COMERCIAL_GESTAO_LOJAS).toMatchObject({ precoMensalCentavos: 6990, usuariosInclusos: 2, diasTesteGratuito: 7 })
  })
  it("só concede o pacote básico — nenhum módulo não autorizado", () => {
    expect([...PLANO_VENDAS_E_ESTOQUE.modulos]).toEqual(BASIC_MODULE_ACCESS.modules)
    for (const proibido of ["service", "deviceCatalog", "ai", "agent", "marketing", "marketplace", "accountant", "whatsapp", "finance", "fiscal", "experiments"]) {
      expect(PLANO_VENDAS_E_ESTOQUE.modulos).not.toContain(proibido)
    }
  })
  it("é imutável em tempo de execução", () => {
    expect(Object.isFrozen(PLANO_VENDAS_E_ESTOQUE)).toBe(true)
    expect(Object.isFrozen(PLANO_VENDAS_E_ESTOQUE.modulos)).toBe(true)
    expect(Object.isFrozen(CATALOGO_PLANOS_SAAS)).toBe(true)
  })
  it("busca por id e versão; id desconhecido = null", () => {
    expect(obterPlanoSaas("vendas-e-estoque")).toBe(PLANO_VENDAS_E_ESTOQUE)
    expect(obterPlanoSaas("vendas-e-estoque", 1)).toBe(PLANO_VENDAS_E_ESTOQUE)
    expect(obterPlanoSaas("vendas-e-estoque", 2)).toBeNull()
    for (const legado of ["BRONZE", "OURO", "DIAMANTE", "essencial", "comercio-plus"]) expect(obterPlanoSaas(legado)).toBeNull()
  })
  it("condições contratadas são cópia (preço e limite) para gravar na assinatura", () => {
    expect(condicoesContratadas(PLANO_VENDAS_E_ESTOQUE)).toEqual({ planoId: "vendas-e-estoque", planoVersao: 1, precoContratadoCentavos: 6990, limiteUsuariosPorLoja: 2 })
    expect(planosAtivosParaVenda().map((p) => p.id)).toEqual(["vendas-e-estoque"])
  })
})

describe("flags SaaS — ausência = desligado", () => {
  it.each([undefined, "", "off", "true", "1", "yes", "ON ", " on"])("flagLigada(%j)", (v) => {
    expect(flagLigada(v)).toBe(v !== undefined && v.trim().toLowerCase() === "on")
  })
  it("sem configuração tudo desligado", () => {
    expect(lerSaasFlags({})).toEqual({ entitlementEnforceSolicitado: false, entitlementEnforceEfetivo: false, emailEnvio: false, cadastroPublico: false })
  })
  it("SAAS_ENTITLEMENT_ENFORCE=on NÃO liga enforcement no SAAS-001A", () => {
    const f = lerSaasFlags({ SAAS_ENTITLEMENT_ENFORCE: "on" })
    expect(f.entitlementEnforceSolicitado).toBe(true)
    expect(f.entitlementEnforceEfetivo).toBe(false)
  })
  it("SAAS_CADASTRO_PUBLICO=on é ignorado (cadastro público não existe nesta etapa)", () => {
    expect(lerSaasFlags({ SAAS_CADASTRO_PUBLICO: "on" }).cadastroPublico).toBe(false)
  })
  it("SAAS_EMAIL_ENVIO só com 'on'", () => {
    expect(lerSaasFlags({ SAAS_EMAIL_ENVIO: "on" }).emailEnvio).toBe(true)
    expect(lerSaasFlags({ SAAS_EMAIL_ENVIO: "true" }).emailEnvio).toBe(false)
  })
})
