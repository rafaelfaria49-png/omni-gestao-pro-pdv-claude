import { describe, expect, it } from "vitest"
import { montarDados, type FonteContador, type FontesContador } from "./index"

const competencia = { ano: 2026, mes: 6 }

function fontesCompletas(): FontesContador {
  return {
    vendas: [
      {
        total: 100,
        status: "concluida",
        payload: {
          paymentBreakdown: { pix: 100 },
          discountTotal: 5,
          segredoInterno: "segredo-do-banco",
        },
      },
    ],
    devolucoes: [{ valorTotal: 10 }],
    movimentacoes: [
      { tipo: "entrada", origem: "venda", valor: 50 },
      { tipo: "saida", origem: "pagar", valor: 20 },
    ],
    receber: [{ valor: 30, status: "pendente", vencimento: "2026-06-10" }],
    pagar: [{ valor: 15, status: "pendente", vencimento: "20/06/2026" }],
    sessoes: [{ status: "fechada", saldoFinal: 100, saldoContado: 101 }],
    operacoes: [
      { tipo: "sangria", valor: 5 },
      { tipo: "suprimento", valor: 8 },
    ],
    falhas: [],
  }
}

/**
 * Walker recursivo versionado: inspeciona tipos e chaves do DTO (não só texto JSON).
 * Permanece somente neste arquivo de teste — não é helper de produção.
 *
 * `visitados` atua como pilha de ancestrais: detecta ciclos reais (A→B→A).
 * Referências compartilhadas legítimas (mesmo objeto folha em vários KPIs) NÃO
 * são ciclo — o objeto sai da pilha ao concluir a subárvore.
 */
function validarValorSerializavel(
  value: unknown,
  caminho = "root",
  visitados = new WeakSet<object>(),
): void {
  if (value === null) return
  if (value === undefined) return

  const tipo = typeof value
  if (tipo === "string" || tipo === "boolean") return
  if (tipo === "number") {
    if (!Number.isFinite(value as number)) {
      throw new Error(`${caminho}: number não finito`)
    }
    return
  }
  if (tipo === "bigint") {
    throw new Error(`${caminho}: BigInt proibido no DTO público`)
  }
  if (tipo === "function") {
    throw new Error(`${caminho}: função proibida no DTO público`)
  }
  if (tipo === "symbol") {
    throw new Error(`${caminho}: símbolo proibido no DTO público`)
  }
  if (tipo !== "object") {
    throw new Error(`${caminho}: tipo não serializável (${tipo})`)
  }

  const obj = value as object
  if (visitados.has(obj)) {
    throw new Error(`${caminho}: ciclo de referência proibido`)
  }
  visitados.add(obj)

  try {
    if (value instanceof Date) {
      throw new Error(`${caminho}: Date proibida no DTO público`)
    }
    if (value instanceof Error) {
      throw new Error(`${caminho}: Error proibido no DTO público`)
    }

    const ctor = (value as { constructor?: { name?: string } }).constructor?.name ?? ""
    if (ctor === "Decimal" || ctor.includes("Decimal")) {
      throw new Error(`${caminho}: objeto Decimal proibido no DTO público`)
    }
    if (ctor.startsWith("Prisma") || ctor.includes("PrismaClient") || ctor.includes("PrismaPromise")) {
      throw new Error(`${caminho}: objeto Prisma proibido no DTO público`)
    }

    // Não confundir string comercial com objeto Prisma: só chaves/tipos estruturais.
    if (Array.isArray(value)) {
      value.forEach((item, i) => validarValorSerializavel(item, `${caminho}[${i}]`, visitados))
      return
    }

    const record = value as Record<string, unknown>
    const chaves = Object.keys(record)

    // Sentinelas estruturais de vazamento (chaves, não substring de valor comercial).
    for (const chave of chaves) {
      if (chave === "storeId") {
        throw new Error(`${caminho}.${chave}: storeId proibido no DTO público`)
      }
      if (chave === "stack") {
        throw new Error(`${caminho}.${chave}: stack proibida no DTO público`)
      }
      if (chave === "payload") {
        throw new Error(`${caminho}.${chave}: payload bruto proibido no DTO público`)
      }
      if (chave === "Session" || chave === "session") {
        throw new Error(`${caminho}.${chave}: Session proibida no DTO público`)
      }
      if (chave === "prisma" || chave === "Prisma" || chave === "$prisma") {
        throw new Error(`${caminho}.${chave}: objeto Prisma proibido no DTO público`)
      }
    }

    // Heurística de instância Session-like (construtor ou shape mínimo).
    if (
      ctor === "Session" ||
      (chaves.includes("user") && chaves.includes("expires") && chaves.includes("sessionToken"))
    ) {
      throw new Error(`${caminho}: Session proibida no DTO público`)
    }

    for (const chave of chaves) {
      validarValorSerializavel(record[chave], `${caminho}.${chave}`, visitados)
    }
  } finally {
    visitados.delete(obj)
  }
}

function expectDtoSerializavel(dto: ReturnType<typeof montarDados>) {
  expect(() => JSON.stringify(dto)).not.toThrow()
  const json = JSON.stringify(dto)
  expect(JSON.parse(json)).toEqual(dto)
  expect(json).not.toContain("Decimal")
  expect(json).not.toContain("Prisma")
  expect(json).not.toContain("stack")
  expect(json).not.toContain("segredo-do-banco")
  expect(json).not.toContain("storeId")
  expect(() => validarValorSerializavel(dto)).not.toThrow()
}

describe("serialização do DTO público do Contador", () => {
  it("serializa o sucesso completo com todas as fontes operacionais", () => {
    const dto = montarDados(fontesCompletas(), competencia)
    expect(dto.vendas.total).toMatchObject({ valor: 100, disponibilidade: "real" })
    expect(dto.financeiro.entradasRealizadas).toMatchObject({ valor: 50, disponibilidade: "real" })
    expect(dto.caixa.sessoes).toMatchObject({ valor: 1, disponibilidade: "real" })
    expectDtoSerializavel(dto)
  })

  it("serializa dados parciais sem substituir ausência de cobertura por zero", () => {
    const fontes = fontesCompletas()
    fontes.vendas = [
      fontes.vendas[0],
      { total: 40, status: "concluida", payload: { paymentBreakdown: { dinheiro: 40 } } },
    ]
    const dto = montarDados(fontes, competencia)
    expect(dto.vendas.descontoTotal).toMatchObject({ valor: 5, disponibilidade: "parcial" })
    expectDtoSerializavel(dto)
  })

  it("serializa origem financeira desconhecida como não classificada e parcial", () => {
    const fontes = fontesCompletas()
    fontes.movimentacoes = [{ tipo: "entrada", origem: "origem_futura", valor: 73 }]
    const dto = montarDados(fontes, competencia)
    expect(dto.financeiro.naoClassificados).toMatchObject({ valor: 73, disponibilidade: "parcial" })
    expectDtoSerializavel(dto)
  })

  it("serializa título inválido excluído do agregado com observação parcial", () => {
    const fontes = fontesCompletas()
    fontes.receber = [
      { valor: 30, status: "pendente", vencimento: "2026-06-10" },
      { valor: 999, status: "pendente", vencimento: "2026-02-30" },
    ]
    const dto = montarDados(fontes, competencia)
    expect(dto.financeiro.titulosReceberAberto).toMatchObject({ valor: 30, disponibilidade: "parcial" })
    expect(dto.financeiro.titulosReceberAberto.observacao).toContain("1 título(s)")
    expectDtoSerializavel(dto)
  })

  it("serializa breakdown abaixo da venda com residual direcional", () => {
    const fontes = fontesCompletas()
    fontes.vendas = [{ total: 100, status: "concluida", payload: { paymentBreakdown: { pix: 80 } } }]
    const dto = montarDados(fontes, competencia)
    expect(dto.vendas.reconciliacaoPagamento).toMatchObject({
      residualNaoIdentificado: 20,
      excedenteBreakdown: 0,
      divergenciaAbsoluta: 20,
      reconciliado: false,
    })
    expectDtoSerializavel(dto)
  })

  it("serializa breakdown acima da venda sem inflar o total autoritativo", () => {
    const fontes = fontesCompletas()
    fontes.vendas = [{ total: 100, status: "concluida", payload: { paymentBreakdown: { pix: 120 } } }]
    const dto = montarDados(fontes, competencia)
    expect(dto.vendas.total.valor).toBe(100)
    expect(dto.vendas.reconciliacaoPagamento).toMatchObject({
      residualNaoIdentificado: 0,
      excedenteBreakdown: 20,
      divergenciaAbsoluta: 20,
      reconciliado: false,
    })
    expectDtoSerializavel(dto)
  })

  it("serializa forma conhecida mais desconhecida com soma exata e cobertura parcial", () => {
    const fontes = fontesCompletas()
    fontes.vendas = [
      { total: 100, status: "concluida", payload: { paymentBreakdown: { pix: 50, novaForma: 50 } } },
    ]
    const dto = montarDados(fontes, competencia)
    expect(dto.vendas.formaPagamentoDisponibilidade).toBe("parcial")
    expect(dto.vendas.naoIdentificadoValor.valor).toBe(50)
    expect(dto.vendas.reconciliacaoPagamento).toMatchObject({
      totalBreakdown: 100,
      residualNaoIdentificado: 0,
      excedenteBreakdown: 0,
      divergenciaAbsoluta: 0,
      reconciliado: false,
    })
    expectDtoSerializavel(dto)
  })

  const falhas: readonly { fonte: FonteContador; rotulo: string }[] = [
    { fonte: "vendas", rotulo: "Venda" },
    { fonte: "devolucoes", rotulo: "DevolucaoVenda" },
    { fonte: "movimentacoes", rotulo: "MovimentacaoFinanceira" },
    { fonte: "receber", rotulo: "ContaReceberTitulo" },
    { fonte: "pagar", rotulo: "ContaPagarTitulo" },
    { fonte: "sessoes", rotulo: "SessaoCaixa" },
    { fonte: "operacoes", rotulo: "CaixaOperacao" },
  ]

  it.each(falhas)("serializa a falha individual de $rotulo sem detalhe interno", ({ fonte, rotulo }) => {
    const fontes = fontesCompletas()
    fontes.falhas = [fonte]
    const dto = montarDados(fontes, competencia)
    expect(dto.alertas.some((alerta) => alerta.titulo.includes(rotulo))).toBe(true)
    expectDtoSerializavel(dto)
  })
})
