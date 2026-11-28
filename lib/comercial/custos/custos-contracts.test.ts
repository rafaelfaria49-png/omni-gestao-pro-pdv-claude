import { describe, expect, it } from "vitest"
import { parseCentavos, ratearCentavos, reaisLegadoParaCentavos, asCentavos } from "./money"
import { comporCusto, indicadoresPreco } from "./composicao"
import { bloqueiaLiberacao, CATEGORIAS_POR_ORIGEM, sanitizeConferencias, statusCustoAquisicao } from "./contracts"
import { parseLancamentoInput, valorProporcionalDaOrigem } from "./service"

const OP = "op_teste_12345678"

describe("dinheiro exato em centavos", () => {
  it("converte reais em formatos brasileiros e legados", () => {
    expect(parseCentavos("1.234,56")).toBe(123456)
    expect(parseCentavos("30")).toBe(3000)
    expect(parseCentavos("R$ 0,10")).toBe(10)
    expect(parseCentavos(0.1 + 0.2)).toBe(30)
    expect(parseCentavos("1,234")).toBeNull()
    expect(parseCentavos(-1)).toBeNull()
    expect(asCentavos(10.5)).toBeNull()
    expect(reaisLegadoParaCentavos(100)).toBe(10000)
  })
  it("rateio pelo maior resto sempre fecha o total", () => {
    expect(ratearCentavos(50000, [1, 1, 1])).toEqual([16667, 16667, 16666])
    expect(ratearCentavos(50000, [1, 1, 1, 1, 1])).toEqual([10000, 10000, 10000, 10000, 10000])
    const partes = ratearCentavos(99999, [3, 2, 7])
    expect(partes.reduce((a, b) => a + b, 0)).toBe(99999)
    expect(ratearCentavos(100, [0, 0])).toEqual([50, 50])
  })
  it("cinco telas por R$ 500 → R$ 100 cada, a última absorve o resto", () => {
    const o = { valorTotalCentavos: 50000, quantidadeTotal: 5, usadoCentavos: 0, usadoQuantidade: 0 }
    expect(valorProporcionalDaOrigem(o, 1)).toBe(10000)
    const tres = { valorTotalCentavos: 10000, quantidadeTotal: 3, usadoCentavos: 6667, usadoQuantidade: 2 }
    expect(valorProporcionalDaOrigem(tres, 1)).toBe(3333)
  })
})

describe("composição honesta do custo", () => {
  const unit = { custoAquisicao: 30, despesas: 0, precoVenda: 500 }
  const lanc = (p: Partial<Parameters<typeof comporCusto>[2][number]>) => ({
    id: "l", categoria: "peca", origem: "preexistente", descricao: "x", quantidade: 1, valorCentavos: 0, custoStatus: "conhecido", status: "ativo", ...p,
  })
  it("exemplo do GOAL: R$ 30 + tela antiga R$ 100 + conector R$ 30 = R$ 160", () => {
    const c = comporCusto(unit, { custoAquisicaoStatus: "conhecido" }, [
      lanc({ id: "a", valorCentavos: 10000 }),
      lanc({ id: "b", origem: "estoque", valorCentavos: 3000 }),
    ])
    expect(c.totalCentavos).toBe(16000)
    expect(c.completo).toBe(true)
    expect(c.porCategoria.peca).toBe(13000)
  })
  it("custo desconhecido não vira zero: total nulo e margem não calculada", () => {
    const c = comporCusto(unit, { custoAquisicaoStatus: "desconhecido" }, [])
    expect(c.aquisicaoCentavos).toBeNull()
    expect(c.totalCentavos).toBeNull()
    expect(c.completo).toBe(false)
    const i = indicadoresPreco({ composicao: c, precoVendaCentavos: 50000 })
    expect(i.margemBrutaCentavos).toBeNull()
    expect(i.precoMinimoCentavos).toBeNull()
    expect(i.avisos.join(" ")).toMatch(/incompleto/i)
  })
  it("estornado não soma; estimado marca aproximação", () => {
    const c = comporCusto(unit, null, [
      lanc({ id: "a", valorCentavos: 10000, status: "estornado" }),
      lanc({ id: "b", valorCentavos: 2000, custoStatus: "estimado" }),
    ])
    expect(c.totalCentavos).toBe(5000)
    expect(c.estimado).toBe(true)
  })
  it("indicadores: margem bruta, contribuição e preços gerenciais", () => {
    const c = comporCusto({ custoAquisicao: 100, despesas: 0, precoVenda: 200 }, null, [])
    const i = indicadoresPreco({ composicao: c, precoVendaCentavos: 20000, taxaPercent: 5, margemAlvoPercent: 50 })
    expect(i.margemBrutaCentavos).toBe(10000)
    expect(i.margemContribuicaoCentavos).toBe(9000)
    expect(i.precoMinimoCentavos).toBe(Math.ceil(10000 / 0.95))
    expect(i.precoSugeridoCentavos).toBe(Math.ceil(15000 / 0.95))
    expect(i.avisos.join(" ")).toMatch(/não é lucro líquido/)
  })
})

describe("revisão P1-1 — custo de aquisição zero não confirmado é DESCONHECIDO", () => {
  it("cadastro sem permissão de custo (zero forçado) não congela margem de 100%", () => {
    expect(statusCustoAquisicao(0, null)).toBe("desconhecido")
    expect(statusCustoAquisicao(0, { custoAquisicaoStatus: "conhecido", custoAquisicaoJustificativa: "" })).toBe("desconhecido")
    expect(statusCustoAquisicao(0, { custoAquisicaoStatus: "conhecido", custoAquisicaoJustificativa: "Doação do fornecedor, sem custo" })).toBe("conhecido")
    expect(statusCustoAquisicao(30, null)).toBe("conhecido")
    expect(statusCustoAquisicao(30, { custoAquisicaoStatus: "estimado" })).toBe("estimado")
    expect(statusCustoAquisicao(30, { custoAquisicaoStatus: "desconhecido" })).toBe("desconhecido")
    const c = comporCusto({ custoAquisicao: 0, despesas: 0, precoVenda: 100 }, null, [])
    expect(c).toMatchObject({ aquisicaoCentavos: null, totalCentavos: null, completo: false })
  })
})

describe("prontuário e liberação", () => {
  it("unidade em preparação ou com finalidade diferente de revenda não é liberada", () => {
    expect(bloqueiaLiberacao(null)).toBeNull()
    expect(bloqueiaLiberacao({ etapaPreparacao: "em_preparacao", finalidade: "preparacao" })).toMatch(/preparação/)
    expect(bloqueiaLiberacao({ etapaPreparacao: "em_testes", finalidade: "revenda" })).toMatch(/preparação/)
    expect(bloqueiaLiberacao({ etapaPreparacao: "concluida", finalidade: "pecas" })).toMatch(/não é revenda/)
    expect(bloqueiaLiberacao({ etapaPreparacao: "concluida", finalidade: "revenda" })).toBeNull()
  })
  it("conferências aceitam só chaves e valores conhecidos", () => {
    expect(sanitizeConferencias({ contaGoogle: "PASS", inventada: "PASS", bloqueioAtivacaoApple: "TALVEZ" })).toEqual({ contaGoogle: "PASS" })
  })
  it("mão de obra interna só como custo gerencial", () => {
    expect(CATEGORIAS_POR_ORIGEM.gerencial).toEqual(["mao_obra_interna"])
    expect(CATEGORIAS_POR_ORIGEM.nova_compra).not.toContain("mao_obra_interna")
  })
})

describe("entrada de lançamento", () => {
  it("material do estoque não aceita valor digitado (vem do custo médio)", () => {
    const r = parseLancamentoInput({ operationId: OP, origem: "estoque", categoria: "peca", produtoId: "p1", valorCentavos: 100 })
    expect(r).toMatchObject({ ok: false, code: "CUSTO_DO_ESTOQUE" })
  })
  it("preexistente exige justificativa e valor (ou desconhecido sem valor)", () => {
    expect(parseLancamentoInput({ operationId: OP, origem: "preexistente", categoria: "peca", descricao: "Tela", valorCentavos: 10000 })).toMatchObject({ code: "JUSTIFICATIVA_OBRIGATORIA" })
    expect(parseLancamentoInput({ operationId: OP, origem: "preexistente", categoria: "peca", descricao: "Tela", custoStatus: "desconhecido", valorCentavos: 0, justificativa: "comprada em 2024" })).toMatchObject({ code: "VALOR_COM_CUSTO_DESCONHECIDO" })
    expect(parseLancamentoInput({ operationId: OP, origem: "preexistente", categoria: "peca", descricao: "Tela", custoStatus: "desconhecido", justificativa: "comprada em 2024" })).toMatchObject({ ok: true })
  })
  it("nova compra exige valor > 0; à vista vence hoje; a prazo não aceita passado", () => {
    expect(parseLancamentoInput({ operationId: OP, origem: "nova_compra", categoria: "peca", descricao: "Tela", valorCentavos: 0 })).toMatchObject({ code: "VALOR_OBRIGATORIO" })
    const ok = parseLancamentoInput({ operationId: OP, origem: "nova_compra", categoria: "peca", descricao: "Tela", valorCentavos: 5000 })
    expect(ok.ok && ok.input.novaCompra?.condicao).toBe("a_vista")
    expect(parseLancamentoInput({ operationId: OP, origem: "nova_compra", categoria: "frete", descricao: "Frete", valorCentavos: 5000, novaCompra: { condicao: "a_prazo", vencimento: "2000-01-01" } })).toMatchObject({ code: "VENCIMENTO_INVALIDO" })
  })
  it("mão de obra não pode ser nova compra nem desconhecida", () => {
    expect(parseLancamentoInput({ operationId: OP, origem: "nova_compra", categoria: "mao_obra_interna", descricao: "x", valorCentavos: 100 })).toMatchObject({ code: "CATEGORIA_INVALIDA" })
    expect(parseLancamentoInput({ operationId: OP, origem: "gerencial", descricao: "Troca de tela", custoStatus: "desconhecido" })).toMatchObject({ code: "VALOR_OBRIGATORIO" })
  })
  it("operationId é obrigatório e com formato estável", () => {
    expect(parseLancamentoInput({ operationId: "x", origem: "gerencial", descricao: "a", valorCentavos: 1 })).toMatchObject({ code: "OPERACAO_INVALIDA" })
  })
})
