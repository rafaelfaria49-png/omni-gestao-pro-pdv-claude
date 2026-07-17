import { describe, expect, it } from "vitest"
import { montarDados, type FontesContador } from "@/lib/contador/readers"
import { montarChecklistFechamento } from "./montar-checklist"
import type { EstadoChecklistItem } from "./tipos"

const competencia = { ano: 2026, mes: 6 }
const AGORA = new Date("2026-07-16T12:00:00.000Z")

const vazio: FontesContador = {
  vendas: [],
  devolucoes: [],
  movimentacoes: [],
  receber: [],
  pagar: [],
  sessoes: [],
  operacoes: [],
  falhas: [],
}

function estadoDe(
  checklist: ReturnType<typeof montarChecklistFechamento>,
  id: string,
): EstadoChecklistItem {
  const it = checklist.itens.find((i) => i.id === id)
  if (!it) throw new Error(`item ${id} ausente`)
  return it.estado
}

describe("montarChecklistFechamento — sem DTO", () => {
  it("sem dados: sinais viram nao_disponivel (exceto fechamento oficial = pendente)", () => {
    const c = montarChecklistFechamento({
      dados: null,
      competencia,
      agora: AGORA,
      motivoIndisponivel: "Nenhuma loja ativa selecionada.",
    })
    expect(c.geradoEm).toBe(AGORA.toISOString())
    expect(c.competencia).toEqual(competencia)
    expect(c.disclaimer).toMatch(/GOAL 012/)
    expect(c.disclaimer).toMatch(/somente leitura/i)
    expect(c.contagem.total).toBe(11)
    expect(estadoDe(c, "fechamento_oficial")).toBe("pendente")
    expect(estadoDe(c, "vendas")).toBe("nao_disponivel")
    expect(estadoDe(c, "fiscal")).toBe("nao_disponivel")
    expect(c.itens.find((i) => i.id === "vendas")?.explicacao).toContain("Nenhuma loja ativa")
    // sem percentual inventado
    expect(JSON.stringify(c)).not.toMatch(/percent|%|pronta para fechar/i)
  })
})

describe("montarChecklistFechamento — competência limpa (tudo ok onde há evidência)", () => {
  it("fontes saudáveis e vazias → ok onde há evidência; gaps legítimos viram nao_disponivel", () => {
    const dados = montarDados(vazio, competencia)
    const c = montarChecklistFechamento({ dados, competencia, agora: AGORA })

    expect(estadoDe(c, "vendas")).toBe("ok") // 0 vendas é evidência real
    expect(estadoDe(c, "devolucoes")).toBe("ok")
    expect(estadoDe(c, "liquido")).toBe("ok")
    // sem vendas válidas o DTO marca breakdown como indisponível — checklist não inventa ok
    expect(estadoDe(c, "formas_pagamento")).toBe("nao_disponivel")
    expect(estadoDe(c, "movimentacoes")).toBe("ok")
    expect(estadoDe(c, "titulos_receber")).toBe("ok")
    expect(estadoDe(c, "titulos_pagar")).toBe("ok")
    expect(estadoDe(c, "sessoes_caixa")).toBe("ok")
    // sem sessões fechadas → diferenças indisponíveis (honesto)
    expect(estadoDe(c, "diferencas_caixa")).toBe("nao_disponivel")
    expect(estadoDe(c, "fiscal")).toBe("nao_disponivel")
    expect(estadoDe(c, "fechamento_oficial")).toBe("pendente")

    expect(c.contagem.ok + c.contagem.atencao + c.contagem.pendente + c.contagem.nao_disponivel).toBe(
      c.contagem.total,
    )
    expect(c.contagem.pendente).toBe(1)
    expect(c.contagem.nao_disponivel).toBeGreaterThanOrEqual(3)
  })

  it("venda reconciliada → formas_pagamento ok", () => {
    const dados = montarDados(
      {
        ...vazio,
        vendas: [
          { total: 100, status: "concluida", payload: { paymentBreakdown: { pix: 100 } } },
        ],
      },
      competencia,
    )
    const c = montarChecklistFechamento({ dados, competencia, agora: AGORA })
    expect(estadoDe(c, "formas_pagamento")).toBe("ok")
    expect(estadoDe(c, "vendas")).toBe("ok")
  })
})

describe("montarChecklistFechamento — atenção", () => {
  it("títulos em aberto → atencao", () => {
    const dados = montarDados(
      {
        ...vazio,
        receber: [{ valor: 150, status: "aberto", vencimento: "2026-06-15" }],
        pagar: [{ valor: 80, status: "aberto", vencimento: "2026-06-20" }],
      },
      competencia,
    )
    const c = montarChecklistFechamento({ dados, competencia, agora: AGORA })
    expect(estadoDe(c, "titulos_receber")).toBe("atencao")
    expect(estadoDe(c, "titulos_pagar")).toBe("atencao")
    expect(c.itens.find((i) => i.id === "titulos_receber")?.evidencia).toMatch(/150/)
  })

  it("sessões abertas e diferença de caixa → atencao", () => {
    const dados = montarDados(
      {
        ...vazio,
        sessoes: [
          { status: "ABERTA", saldoFinal: null, saldoContado: null },
          { status: "FECHADA", saldoFinal: 100, saldoContado: 95 },
        ],
      },
      competencia,
    )
    const c = montarChecklistFechamento({ dados, competencia, agora: AGORA })
    expect(estadoDe(c, "sessoes_caixa")).toBe("atencao")
    expect(estadoDe(c, "diferencas_caixa")).toBe("atencao")
    expect(c.itens.find((i) => i.id === "diferencas_caixa")?.evidencia).toMatch(/-5|−5|5/)
  })

  it("breakdown com residual → atencao em formas_pagamento", () => {
    const dados = montarDados(
      {
        ...vazio,
        vendas: [
          {
            total: 100,
            status: "concluida",
            payload: { paymentBreakdown: { pix: 70 } }, // residual 30
          },
        ],
      },
      competencia,
    )
    const c = montarChecklistFechamento({ dados, competencia, agora: AGORA })
    expect(estadoDe(c, "formas_pagamento")).toBe("atencao")
    expect(estadoDe(c, "vendas")).toBe("ok")
  })

  it("movimentos não classificados → atencao", () => {
    const dados = montarDados(
      {
        ...vazio,
        movimentacoes: [{ tipo: "ENTRADA", origem: "origem_desconhecida_xyz", valor: 50 }],
      },
      competencia,
    )
    const c = montarChecklistFechamento({ dados, competencia, agora: AGORA })
    expect(estadoDe(c, "movimentacoes")).toBe("atencao")
  })
})

describe("montarChecklistFechamento — fontes falhas", () => {
  it("falha de vendas → vendas/liquido/pagamentos nao_disponivel sem inventar ok", () => {
    const dados = montarDados({ ...vazio, falhas: ["vendas"] }, competencia)
    const c = montarChecklistFechamento({ dados, competencia, agora: AGORA })
    expect(estadoDe(c, "vendas")).toBe("nao_disponivel")
    expect(estadoDe(c, "liquido")).toBe("nao_disponivel")
    expect(estadoDe(c, "formas_pagamento")).toBe("nao_disponivel")
    // devoluções saudáveis
    expect(estadoDe(c, "devolucoes")).toBe("ok")
  })

  it("falha de sessoes → sessoes e diferencas nao_disponivel", () => {
    const dados = montarDados({ ...vazio, falhas: ["sessoes"] }, competencia)
    const c = montarChecklistFechamento({ dados, competencia, agora: AGORA })
    expect(estadoDe(c, "sessoes_caixa")).toBe("nao_disponivel")
    expect(estadoDe(c, "diferencas_caixa")).toBe("nao_disponivel")
  })
})

describe("montarChecklistFechamento — honestidade estrutural", () => {
  it("cada item tem origem e explicação; fiscal nunca ok; fechamento nunca ok", () => {
    const dados = montarDados(
      {
        ...vazio,
        vendas: [{ total: 200, status: "concluida", payload: { paymentBreakdown: { dinheiro: 200 } } }],
      },
      competencia,
    )
    const c = montarChecklistFechamento({ dados, competencia, agora: AGORA })
    for (const it of c.itens) {
      expect(it.origem.trim().length).toBeGreaterThan(0)
      expect(it.explicacao.trim().length).toBeGreaterThan(0)
      expect(it.titulo.trim().length).toBeGreaterThan(0)
    }
    expect(estadoDe(c, "fiscal")).toBe("nao_disponivel")
    expect(estadoDe(c, "fechamento_oficial")).toBe("pendente")
    expect(c.itens.find((i) => i.id === "fechamento_oficial")?.explicacao).toMatch(/GOAL 012/)
  })

  it("contagem bate com a soma dos estados", () => {
    const dados = montarDados(vazio, competencia)
    const c = montarChecklistFechamento({ dados, competencia, agora: AGORA })
    const manual = { ok: 0, atencao: 0, pendente: 0, nao_disponivel: 0 }
    for (const it of c.itens) manual[it.estado] += 1
    expect(c.contagem).toMatchObject(manual)
    expect(c.contagem.total).toBe(c.itens.length)
  })

  it("não afirma competência pronta/fechada no DTO", () => {
    const dados = montarDados(vazio, competencia)
    const c = montarChecklistFechamento({ dados, competencia, agora: AGORA })
    const blob = JSON.stringify(c).toLowerCase()
    expect(blob).not.toContain("oficialmente pronta")
    expect(blob).not.toContain("competência fechada")
    expect(blob).not.toContain("pronta para fechar")
  })
})
