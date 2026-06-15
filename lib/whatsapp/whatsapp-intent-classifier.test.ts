/**
 * WhatsApp IA — F2 · testes do classificador de intenção (núcleo puro).
 * Cobre as 6 intents + OUTRO, extração de entidades e os invariantes de segurança
 * (sempre exige aprovação humana; nunca auto-envia).
 */
import { describe, expect, it } from "vitest"
import {
  classifyWhatsAppIntent,
  type WhatsAppIntentKind,
} from "./whatsapp-intent-classifier"

function intentOf(text: string, extra?: Parameters<typeof classifyWhatsAppIntent>[0]["context"]): WhatsAppIntentKind {
  return classifyWhatsAppIntent({ text, storeId: "loja-1", context: extra }).intent
}

describe("classifyWhatsAppIntent — intents principais", () => {
  it("'tem carregador de iphone' → CONSULTA_PRODUTO_ESTOQUE", () => {
    expect(intentOf("Tem carregador de iPhone?")).toBe("CONSULTA_PRODUTO_ESTOQUE")
  })

  it("'vocês têm capinha do A06?' → CONSULTA_PRODUTO_ESTOQUE + termo extraído", () => {
    const r = classifyWhatsAppIntent({ text: "Vocês têm capinha do A06?" })
    expect(r.intent).toBe("CONSULTA_PRODUTO_ESTOQUE")
    expect(r.entities.termoProduto).toContain("capinha")
  })

  it("'tem película privacidade?' e 'tem copo infantil?' → CONSULTA_PRODUTO_ESTOQUE", () => {
    expect(intentOf("Tem película privacidade?")).toBe("CONSULTA_PRODUTO_ESTOQUE")
    expect(intentOf("Tem copo infantil?")).toBe("CONSULTA_PRODUTO_ESTOQUE")
  })

  it("'quanto troca tela moto g22' → ORCAMENTO_ASSISTENCIA + peça/marca", () => {
    const r = classifyWhatsAppIntent({ text: "quanto troca tela moto g22" })
    expect(r.intent).toBe("ORCAMENTO_ASSISTENCIA")
    expect(r.entities.peca).toBe("tela")
    expect(r.entities.marca).toBe("Motorola")
  })

  it("'troca bateria iPhone 11 quanto?' → ORCAMENTO_ASSISTENCIA", () => {
    const r = classifyWhatsAppIntent({ text: "Troca bateria iPhone 11 quanto?" })
    expect(r.intent).toBe("ORCAMENTO_ASSISTENCIA")
    expect(r.entities.peca).toBe("bateria")
    expect(r.entities.marca).toBe("Apple")
  })

  it("'conserta conector de carga Samsung A12?' → ORCAMENTO_ASSISTENCIA + conector", () => {
    const r = classifyWhatsAppIntent({ text: "Conserta conector de carga Samsung A12?" })
    expect(r.intent).toBe("ORCAMENTO_ASSISTENCIA")
    expect(r.entities.peca).toBe("conector de carga")
    expect(r.entities.marca).toBe("Samsung")
  })

  it("'minha OS ficou pronta?' → STATUS_OS", () => {
    expect(intentOf("Minha OS ficou pronta?")).toBe("STATUS_OS")
  })

  it("'como está meu celular?' e 'já terminou o conserto?' → STATUS_OS", () => {
    expect(intentOf("Como está meu celular?")).toBe("STATUS_OS")
    expect(intentOf("Já terminou o conserto?")).toBe("STATUS_OS")
  })

  it("STATUS_OS extrai possível código da OS e telefone", () => {
    const r = classifyWhatsAppIntent({ text: "Minha OS 1234 ficou pronta?", phone: "+55 11 99876-5432" })
    expect(r.intent).toBe("STATUS_OS")
    expect(r.entities.possivelCodigoOS).toBe("1234")
    expect(r.entities.telefone).toBe("5511998765432")
  })

  it("'minha tela tem garantia?' → GARANTIA (palavra distintiva vence)", () => {
    expect(intentOf("Minha tela tem garantia?")).toBe("GARANTIA")
  })

  it("'a bateria que troquei está na garantia?' → GARANTIA", () => {
    const r = classifyWhatsAppIntent({ text: "A bateria que troquei está na garantia?" })
    expect(r.intent).toBe("GARANTIA")
    expect(r.entities.contextoGarantia).toBe("consulta")
  })

  it("'deu problema de novo, está na garantia?' → GARANTIA + reincidência", () => {
    const r = classifyWhatsAppIntent({ text: "Deu problema de novo, está na garantia?" })
    expect(r.intent).toBe("GARANTIA")
    expect(r.entities.contextoGarantia).toBe("reincidencia")
  })

  it("'quanto falta pagar?' → FINANCEIRO_CLIENTE (saldo em aberto)", () => {
    const r = classifyWhatsAppIntent({ text: "Quanto falta pagar?" })
    expect(r.intent).toBe("FINANCEIRO_CLIENTE")
    expect(r.entities.tipoSolicitacaoFinanceira).toBe("saldo_aberto")
  })

  it("'posso pagar no PIX?' → FINANCEIRO_CLIENTE (forma de pagamento)", () => {
    const r = classifyWhatsAppIntent({ text: "Posso pagar no PIX?" })
    expect(r.intent).toBe("FINANCEIRO_CLIENTE")
    expect(r.entities.tipoSolicitacaoFinanceira).toBe("forma_pagamento")
  })

  it("'tem parcela vencida?' → FINANCEIRO_CLIENTE", () => {
    expect(intentOf("Tem parcela vencida?")).toBe("FINANCEIRO_CLIENTE")
  })

  it("mensagem genérica → OUTRO", () => {
    expect(intentOf("Bom dia, tudo bem?")).toBe("OUTRO")
    expect(intentOf("asdf qwer zxcv")).toBe("OUTRO")
  })

  it("texto vazio → OUTRO", () => {
    expect(intentOf("")).toBe("OUTRO")
    expect(intentOf("   ")).toBe("OUTRO")
  })
})

describe("classifyWhatsAppIntent — FORNECEDOR_COTACAO só com contexto interno", () => {
  it("com isSupplierConversation=true → FORNECEDOR_COTACAO", () => {
    const r = classifyWhatsAppIntent({
      text: "preço da tela do moto g22 e prazo?",
      context: { isSupplierConversation: true },
    })
    expect(r.intent).toBe("FORNECEDOR_COTACAO")
    expect(r.entities.marca).toBe("Motorola")
  })

  it("mesma mensagem SEM contexto de fornecedor → nunca FORNECEDOR_COTACAO", () => {
    expect(intentOf("preço da tela do moto g22 e prazo?")).not.toBe("FORNECEDOR_COTACAO")
  })

  it("mensagem de cliente comum nunca vira FORNECEDOR_COTACAO sem o flag", () => {
    expect(intentOf("Tem carregador de iPhone?")).not.toBe("FORNECEDOR_COTACAO")
  })
})

describe("classifyWhatsAppIntent — invariantes de segurança (F2)", () => {
  const samples = [
    "Tem carregador de iPhone?",
    "quanto troca tela moto g22",
    "Minha OS ficou pronta?",
    "Minha tela tem garantia?",
    "Quanto falta pagar?",
    "Bom dia, tudo bem?",
    "",
  ]

  it("requiresHumanApproval é sempre true", () => {
    for (const text of samples) {
      expect(classifyWhatsAppIntent({ text }).requiresHumanApproval).toBe(true)
    }
  })

  it("safeToAutoSend é sempre false", () => {
    for (const text of samples) {
      expect(classifyWhatsAppIntent({ text }).safeToAutoSend).toBe(false)
    }
    // inclusive no caminho de fornecedor interno
    expect(
      classifyWhatsAppIntent({ text: "tela moto g22", context: { isSupplierConversation: true } })
        .safeToAutoSend
    ).toBe(false)
  })

  it("confidence sempre em [0,1] e baixa confiança cai em OUTRO", () => {
    for (const text of samples) {
      const c = classifyWhatsAppIntent({ text }).confidence
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThanOrEqual(1)
    }
    const generic = classifyWhatsAppIntent({ text: "asdf qwer zxcv" })
    expect(generic.intent).toBe("OUTRO")
    expect(generic.confidence).toBeLessThan(0.5)
  })

  it("toda classificação traz suggestedReply e suggestedAction não vazios", () => {
    for (const text of samples) {
      const r = classifyWhatsAppIntent({ text })
      expect(r.suggestedReply.trim().length).toBeGreaterThan(0)
      expect(r.suggestedAction.trim().length).toBeGreaterThan(0)
    }
  })

  it("respostas sugeridas não prometem preço/estoque/prazo numérico", () => {
    for (const text of samples) {
      const reply = classifyWhatsAppIntent({ text }).suggestedReply.toLowerCase()
      // sem valores em R$ nem prazos numéricos prometidos
      expect(reply).not.toMatch(/r\$\s*\d/)
      expect(reply).not.toMatch(/\b\d+\s*(dias|horas|reais)\b/)
    }
  })
})
