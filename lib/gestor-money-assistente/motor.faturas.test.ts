/** Pagamento de fatura, consulta de faturas por ciclo e limites — contratos canônicos #405 (PAGAR_FATURA, G005 cartoes[]). */
import { describe, expect, it } from "vitest"
import { LOJA_CENTRO, montarCenario, PESSOAL_A } from "./cenario-teste"

describe("faturas e limites de cartão", () => {
  it("“paguei a fatura do nubank no pix”: escolhe a fatura, pergunta o valor e aloca por título", async () => {
    const c = montarCenario()
    const chat = c.chat()
    const r1 = await chat.texto("paguei a fatura do nubank no pix")
    expect(r1.mensagens.join("\n")).toContain("Qual fatura você pagou?")
    expect(r1.mensagens.join("\n")).toContain("Fatura 2026-12")
    expect(r1.mensagens.join("\n")).not.toContain("2026-11") // fatura quitada não é oferecida
    const r2 = await chat.texto("1")
    expect(r2.mensagens.join("\n")).toContain("Em aberto: R$ 450,00")
    const r3 = await chat.texto("350")
    expect(r3.mensagens.join("\n")).toContain("De qual conta saiu o dinheiro?")
    const r4 = await chat.texto("nubank")
    expect(r4.codigo).toBe("aguardando_confirmacao")
    expect(r4.mensagens[0]).toContain("Pagamento de R$ 350,00 da fatura 2026-12")
    expect((await chat.texto("sim")).codigo).toBe("registrado")
    expect(c.execucao.chamadas.at(-1)?.proposta).toEqual({ tipo: "PAGAR_FATURA", cicloId: "ciclo_2026_12", moeda: "BRL",
      carteiraId: "ct_nubank_a", formaPagamento: "pix", dataPagamento: expect.any(String),
      alocacoes: [{ tituloId: "tit_cc_1", valorCentavos: "30000" }, { tituloId: "tit_cc_2", valorCentavos: "5000" }] })
  })

  it("“a fatura toda” quita o ciclo escolhido; valor acima do aberto é recusado", async () => {
    const c = montarCenario()
    const chat = c.chat()
    await chat.texto("paguei a fatura do nubank no pix pela carteira")
    await chat.texto("2")
    const alto = await chat.texto("900")
    expect(alto.mensagens.join("\n")).toContain("maior que o saldo em aberto da fatura (R$ 200,00)")
    const r = await chat.texto("a fatura toda")
    expect(r.mensagens[0]).toContain("Pagamento de R$ 200,00 da fatura 2027-01")
    expect(r.mensagens[0]).toContain("(quitação)")
    await chat.texto("sim")
    expect(c.execucao.chamadas.at(-1)?.proposta).toMatchObject({ tipo: "PAGAR_FATURA", cicloId: "ciclo_2027_01", carteiraId: "ct_carteira_a",
      alocacoes: [{ tituloId: "tit_cc_3", valorCentavos: "20000" }] })
  })

  it("perfil sem cartão: não inventa fatura nem grava", async () => {
    const c = montarCenario({ perfisA: [LOJA_CENTRO] })
    const r = await c.chat().texto("paguei a fatura do cartão no pix")
    expect(r.codigo).toBe("sem_cartao")
    expect(c.execucao.chamadas).toHaveLength(0)
  })

  it("consulta de faturas por ciclo e de limites vem do G005 (cartoes[])", async () => {
    const c = montarCenario({ perfisA: [PESSOAL_A] })
    const f = await c.chat().texto("quais faturas estão em aberto?")
    const tf = f.mensagens.join("\n")
    expect(tf).toContain("Fatura 2026-12 — vence 10/12/2026: R$ 450,00 em aberto (total R$ 450,00, pago R$ 0,00)")
    expect(tf).toContain("Fatura 2027-01")
    expect(tf).not.toContain("2026-11")
    const l = await c.chat(undefined, "conversa-2").texto("qual o limite do meu cartão?")
    expect(l.mensagens.join("\n")).toContain("Nubank Crédito: limite R$ 3.000,00 · utilizado R$ 650,00 · disponível R$ 2.350,00.")
    expect(c.execucao.chamadas).toHaveLength(0)
  })

  it("loja sem cartão responde sem estimar (transferência EMPRESA coberta no PostgreSQL)", async () => {
    const c = montarCenario({ perfisA: [LOJA_CENTRO] })
    const l = await c.chat().texto("qual o limite disponível do cartão?")
    expect(l.mensagens.join("\n")).toContain("Não há cartão de crédito cadastrado neste perfil.")
    expect(c.execucao.chamadas).toHaveLength(0)
  })
})
