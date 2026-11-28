// @vitest-environment jsdom
/**
 * Prontuário comercial (ADR-0025): honestidade do custo, campos por origem e idempotência da submissão.
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { aparelhoPermissionsForRole } from "@/lib/aparelhos/permissions"
import { comporCusto, indicadoresPreco } from "@/lib/comercial/custos/composicao"
import { reaisLegadoParaCentavos } from "@/lib/comercial/custos/money"

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }))
vi.mock("@/lib/use-store-business", () => ({ useStoreBusiness: () => ({ resource: () => ({ operational: true }) }) }))

import { toast } from "sonner"
import { ProntuarioComercialDialog } from "@/components/aparelhos/comercial/ProntuarioComercialDialog"
import type { Prontuario } from "@/components/aparelhos/comercial/api"

const gerente = aparelhoPermissionsForRole("gerente")

function prontuario(): Prontuario {
  const unit = { custoAquisicao: 1000, despesas: 0, precoVenda: 1800 }
  const lancamentos = [
    { id: "l-1", categoria: "peca", origem: "estoque", descricao: "Tela OLED", quantidade: 1, valorCentavos: null, custoStatus: "desconhecido", status: "ativo" },
    { id: "l-2", categoria: "mao_obra_interna", origem: "gerencial", descricao: "Troca de tela", quantidade: 1, valorCentavos: 5000, custoStatus: "estimado", status: "ativo" },
  ]
  const perfil = { categoria: "smartphone", funcionamento: "com_avarias", finalidade: "preparacao", etapaPreparacao: "em_preparacao",
    custoAquisicaoStatus: "conhecido", custoAquisicaoJustificativa: "", preexistente: false, defeitos: "Tela trincada", classeEstetica: "B", conferencias: {}, version: 3 }
  const composicao = comporCusto(unit, perfil, lancamentos)
  return {
    ok: true,
    aparelho: {
      id: "ap-1", codigoInterno: "AP-0001", marca: "Apple", modelo: "iPhone 13", variante: "", armazenamento: "128 GB", memoriaRam: "", cor: "Azul",
      condicao: "usado", imei1: "356789012345678", imei2: null, serial: null, identificadoresMascarados: false, status: "em_revisao", propriedade: "loja",
      origem: "compra_cliente", custoAquisicao: 1000, despesas: 0, custoTotal: 1000, precoVenda: 1800, restricaoStatus: "nao_conferido", entradaEstoqueEm: null,
    } as unknown as Prontuario["aparelho"],
    perfil,
    perfilPersistido: true,
    lancamentos: lancamentos.map((l) => ({ ...l, produtoId: null, origemFinanceiraId: null, contaPagarTituloId: null, justificativa: "", estornadoEm: null, estornadoPor: null, motivoEstorno: null, operador: "Gerente", createdAt: "2026-11-20T12:00:00.000Z" })),
    composicao,
    indicadores: indicadoresPreco({ composicao, precoVendaCentavos: reaisLegadoParaCentavos(unit.precoVenda) }),
    eventos: [{ id: "e-1", tipo: "custo_aplicado", deStatus: "em_revisao", paraStatus: "em_revisao", operador: "Gerente", createdAt: "2026-11-20T12:00:00.000Z", dados: { origem: "gerencial", categoria: "mao_obra_interna", valorCentavos: 5000, custoStatus: "estimado" } }],
    vendas: [],
  }
}

type Chamada = { url: string; method: string; body: Record<string, unknown> | null }
let chamadas: Chamada[] = []
let respostaCusto: Array<{ status: number; body: unknown }> = []

function resposta(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

beforeEach(() => {
  chamadas = []
  respostaCusto = []
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? "GET"
    chamadas.push({ url, method, body: init?.body ? JSON.parse(init.body) : null })
    if (url.includes("/prontuario") && method === "GET") return resposta(200, prontuario())
    if (url.includes("/origens/contas-pagar")) return resposta(200, { ok: true, titulos: [] })
    if (url.endsWith("/custos") && method === "POST") {
      const r = respostaCusto.shift() ?? { status: 200, body: { ok: true, replay: false, lancamento: {} } }
      return resposta(r.status, r.body)
    }
    return resposta(404, { ok: false, error: "rota inesperada no teste" })
  }))
})

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.mocked(toast.error).mockClear() })

async function abrir() {
  render(React.createElement(ProntuarioComercialDialog, { open: true, onOpenChange: () => {}, aparelhoId: "ap-1", storeId: "loja-a", perms: gerente }))
  await screen.findByRole("region", { name: "Composição do custo" })
}

const campo = (id: string) => document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null
const preencher = (id: string, value: string) => fireEvent.change(campo(id)!, { target: { value } })
const postsCusto = () => chamadas.filter((c) => c.method === "POST" && c.url.endsWith("/custos"))

describe("prontuário comercial · composição honesta", () => {
  it("custo desconhecido aparece como Desconhecido (nunca R$ 0,00) e o total fica Incompleto", async () => {
    await abrir()
    const comp = screen.getByRole("region", { name: "Composição do custo" })
    expect(within(comp).getAllByText("Desconhecido").length).toBe(1)
    expect(within(comp).getByText("Estimado")).toBeTruthy()
    expect(within(comp).queryByText(/R\$\s*0,00/)).toBeNull()
    const total = screen.getByTestId("custo-total")
    expect(within(total).getByText("Incompleto")).toBeTruthy()
    expect(total.textContent).not.toMatch(/R\$/)
    // Precificação não inventa margem com custo incompleto.
    const ind = screen.getByRole("region", { name: "Indicadores de preço" })
    expect(within(ind).getAllByText("Não calculado").length).toBeGreaterThan(0)
    // Só a ressalva do servidor menciona lucro líquido; nenhum indicador se apresenta como tal.
    expect(within(ind).queryByText(/lucro líquido/i)).toBeNull()
  })
})

describe("prontuário comercial · campos por origem", () => {
  it("troca de origem adapta categorias, campos e efeito financeiro", async () => {
    await abrir()
    const efeito = () => screen.getByTestId("efeito-financeiro").textContent ?? ""
    const categorias = () => Array.from((campo("pc-categoria") as HTMLSelectElement).options).map((o) => o.value)

    // estoque (padrão): busca de produto, sem valor digitado
    expect(campo("pc-produto")).not.toBeNull()
    expect(campo("pc-valor")).toBeNull()
    expect(categorias()).toEqual(["peca", "outro"])
    expect(efeito()).toMatch(/custo médio histórico/)

    preencher("pc-origem", "nova_compra")
    expect(campo("pc-produto")).toBeNull()
    expect(campo("pc-valor")).not.toBeNull()
    expect(campo("pc-condicao")).not.toBeNull()
    expect(campo("pc-vencimento")).toBeNull()
    preencher("pc-condicao", "a_prazo")
    expect(campo("pc-vencimento")).not.toBeNull()
    expect(categorias()).toEqual(["peca", "servico_terceirizado", "frete", "outro"])
    expect(efeito()).toMatch(/Contas a Pagar/)

    preencher("pc-origem", "gerencial")
    expect(categorias()).toEqual(["mao_obra_interna"])
    expect((campo("pc-categoria") as HTMLSelectElement).disabled).toBe(true)
    expect(campo("pc-condicao")).toBeNull()
    expect(efeito()).toMatch(/nunca vira pagamento/)

    preencher("pc-origem", "preexistente")
    expect(campo("pc-justificativa")).not.toBeNull()
    preencher("pc-status", "desconhecido")
    expect(campo("pc-valor")).toBeNull()

    preencher("pc-origem", "vinculo_financeiro")
    expect(campo("pc-titulo")).not.toBeNull()
    await waitFor(() => expect(chamadas.some((c) => c.url.includes("/api/comercial/origens/contas-pagar"))).toBe(true))
    expect(await screen.findByText("Nenhum título elegível encontrado.")).toBeTruthy()
  })

  it("técnico (sem definir custo) só lança material do estoque e não vê valores", async () => {
    const tecnico = aparelhoPermissionsForRole("tecnico")
    // Igual ao servidor sem verCusto: valores, dados de evento, composição e indicadores nulos.
    const base = prontuario()
    const semCusto = {
      ...base, composicao: null, indicadores: null,
      lancamentos: base.lancamentos.map((l) => ({ ...l, valorCentavos: null })),
      eventos: base.eventos.map((e) => ({ ...e, dados: null })),
    }
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.includes("/prontuario") ? resposta(200, semCusto) : resposta(404, { ok: false }))))
    render(React.createElement(ProntuarioComercialDialog, { open: true, onOpenChange: () => {}, aparelhoId: "ap-1", storeId: "loja-a", perms: tecnico }))
    await screen.findByText(/Valores de custo ocultos/)
    expect(Array.from((campo("pc-origem") as HTMLSelectElement).options).map((o) => o.value)).toEqual(["estoque"])
    expect(screen.queryByRole("region", { name: "Composição do custo" })).toBeNull()
    expect(document.body.textContent).not.toMatch(/R\$/)
  })
})

describe("prontuário comercial · idempotência", () => {
  it("nova tentativa após falha reutiliza o mesmo operationId; sucesso libera uma chave nova", async () => {
    await abrir()
    preencher("pc-origem", "gerencial")
    preencher("pc-descricao", "Troca de bateria")
    preencher("pc-valor", "1.234,56")
    respostaCusto.push({ status: 500, body: { ok: false, code: "ERRO", error: "Falha temporária" } })
    const aplicar = () => fireEvent.click(screen.getByRole("button", { name: "Aplicar custo" }))

    aplicar()
    await waitFor(() => expect(postsCusto()).toHaveLength(1))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Falha temporária"))
    await waitFor(() => expect((screen.getByRole("button", { name: "Aplicar custo" }) as HTMLButtonElement).disabled).toBe(false))

    aplicar()
    await waitFor(() => expect(postsCusto()).toHaveLength(2))
    const [p1, p2] = postsCusto()
    expect(p1!.body!.operationId).toMatch(/^custo_[A-Za-z0-9]{8,}$/)
    expect(p2!.body!.operationId).toBe(p1!.body!.operationId)
    expect(p2!.body).toMatchObject({ origem: "gerencial", categoria: "mao_obra_interna", valorCentavos: 123456, custoStatus: "conhecido", quantidade: 1 })
    expect(p1!.url).toBe("/api/comercial/aparelhos/ap-1/custos")

    // Sucesso limpa o formulário; a próxima submissão é outra operação.
    await waitFor(() => expect((campo("pc-descricao") as HTMLInputElement).value).toBe(""))
    preencher("pc-origem", "gerencial")
    preencher("pc-descricao", "Limpeza interna")
    preencher("pc-valor", "50")
    aplicar()
    await waitFor(() => expect(postsCusto()).toHaveLength(3))
    expect(postsCusto()[2]!.body!.operationId).not.toBe(p1!.body!.operationId)
  })

  it("clique duplo envia uma única requisição", async () => {
    await abrir()
    preencher("pc-origem", "gerencial")
    preencher("pc-descricao", "Troca de bateria")
    preencher("pc-valor", "80,00")
    const botao = screen.getByRole("button", { name: "Aplicar custo" })
    fireEvent.click(botao); fireEvent.click(botao)
    await waitFor(() => expect(postsCusto()).toHaveLength(1))
    await new Promise((r) => setTimeout(r, 20))
    expect(postsCusto()).toHaveLength(1)
  })
})
