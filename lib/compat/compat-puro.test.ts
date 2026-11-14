/**
 * COMPAT-PROFISSIONAL-001 — regras puras: cores da loja, organização física, preferências,
 * classificação de capinhas e relatório (sem inventar saldo por modelo).
 */
import { describe, expect, it } from "vitest"
import { ACESSORIO_CORES_PADRAO } from "@/lib/acessorios/cores"
import { corLabelKey, corPadraoComMesmoNome, coresEfetivas, opcoesDeCorParaProduto, sanitizeCorLabel, type CorLoja } from "./cores-loja"
import {
  COMPAT_PREFERENCIAS_PADRAO,
  localNomeKey,
  mergePreferencias,
  reordenar,
  rotuloLocalizacao,
  sanitizeLocalInput,
  sanitizePosicao,
} from "./organizacao"
import { classificarProdutoCapinha, montarRelatorioCapinhas, type ProdutoCapinhaInfo } from "./capinhas"

const cor = (p: Partial<CorLoja> & { id: string; label: string }): CorLoja => ({ baseKey: null, ativo: true, ordem: 0, version: 1, ...p })

describe("cores da loja", () => {
  it("nomes com grafia diferente colidem (acentos, caixa, espaços)", () => {
    expect(corLabelKey("Azul Bebê")).toBe(corLabelKey("  azul   bebe "))
    expect(corPadraoComMesmoNome("PRETO")).toBe("preto")
    expect(corPadraoComMesmoNome("fume")).toBe("fume")
    expect(corPadraoComMesmoNome("Azul bebê")).toBeNull()
    expect(sanitizeCorLabel(" ").ok).toBe(false)
  })

  it("lista efetiva: 18 padrão (com estado da loja) + próprias; 'Outra' nunca desativa", () => {
    const linhas = [cor({ id: "r1", baseKey: "fume", label: "Fumê", ativo: false }), cor({ id: "c1", label: "Azul bebê" }), cor({ id: "r2", baseKey: "outra", label: "Outra", ativo: false })]
    const efetivas = coresEfetivas(linhas)
    expect(efetivas).toHaveLength(ACESSORIO_CORES_PADRAO.length + 1)
    expect(efetivas.find((c) => c.id === "fume")?.ativo).toBe(false)
    expect(efetivas.find((c) => c.id === "outra")?.ativo).toBe(true)
    expect(efetivas.at(-1)).toMatchObject({ id: "c1", origem: "loja" })
  })

  it("PDV: tira as desativadas, inclui próprias ativas e deixa 'Outra' por último", () => {
    const linhas = [cor({ id: "r1", baseKey: "fume", label: "Fumê", ativo: false }), cor({ id: "c1", label: "Azul bebê" }), cor({ id: "c2", label: "Neon", ativo: false })]
    const op = opcoesDeCorParaProduto(ACESSORIO_CORES_PADRAO, linhas, null)
    expect(op.some((c) => c.id === "fume")).toBe(false)
    expect(op.some((c) => c.id === "c2")).toBe(false)
    expect(op.find((c) => c.id === "c1")).toMatchObject({ origem: "loja", key: "outra" })
    expect(op.at(-1)?.id).toBe("outra")
    // produto restringe as cores próprias
    expect(opcoesDeCorParaProduto(ACESSORIO_CORES_PADRAO, linhas, []).some((c) => c.id === "c1")).toBe(false)
    // captura de cor desativada = nenhuma opção
    expect(opcoesDeCorParaProduto([], linhas, null)).toEqual([])
  })
})

describe("painéis e fileiras", () => {
  it("valida nome e descrição; chave de nome normalizada", () => {
    expect(sanitizeLocalInput({ nome: "  " })).toMatchObject({ ok: false })
    expect(sanitizeLocalInput({ nome: "Fileira 1", descricao: " iPhone / Samsung " })).toEqual({
      ok: true,
      value: { nome: "Fileira 1", descricao: "iPhone / Samsung" },
    })
    expect(localNomeKey("Painel  á")).toBe(localNomeKey("painel A"))
    // parcial (renomear só a descrição)
    expect(sanitizeLocalInput({ descricao: "x" }, true)).toEqual({ ok: true, value: { descricao: "x" } })
  })

  it("posição só existe quando a loja habilitou (padrão: desligado)", () => {
    expect(COMPAT_PREFERENCIAS_PADRAO.posicoesHabilitadas).toBe(false)
    expect(sanitizePosicao("3", false)).toBe("")
    expect(sanitizePosicao(" 3 ", true)).toBe("3")
  })

  it("reordenar sobe/desce uma casa e renumera", () => {
    const itens = [{ id: "a", ordem: 0 }, { id: "b", ordem: 1 }, { id: "c", ordem: 2 }]
    expect(reordenar(itens, "c", "cima")).toEqual([{ id: "a", ordem: 0 }, { id: "c", ordem: 1 }, { id: "b", ordem: 2 }])
    expect(reordenar(itens, "a", "cima")).toEqual(itens)
  })

  it("rótulo do endereço", () => {
    expect(rotuloLocalizacao({ painelNome: "Painel A", fileiraNome: "Fileira 2", posicao: "3" })).toBe("Painel A · Fileira 2 · Pos. 3")
    expect(rotuloLocalizacao({ painelNome: "Painel 1" })).toBe("Painel 1")
  })

  it("preferências: PATCH parcial ignora valores inválidos", () => {
    const p = mergePreferencias({ ...COMPAT_PREFERENCIAS_PADRAO, version: 2 }, { posicoesHabilitadas: true, modoCorPadrao: "xyz" })
    expect(p).toEqual({ posicoesHabilitadas: true, modoModeloPadrao: "opcional", modoCorPadrao: "opcional", version: 2 })
  })
})

describe("capinhas: classificação e relatório", () => {
  const generica = classificarProdutoCapinha({
    id: "gen",
    name: "Capinha transparente",
    sku: "CAP-T",
    stock: 40,
    metadata: { acessorios: { version: 1, tipo: "capinha", exigeModelo: false, exigeCor: false, usaCoresPadrao: true, modoModelo: "opcional" } },
  }) as ProdutoCapinhaInfo
  const detalhada = classificarProdutoCapinha({
    id: "det",
    name: "Capinha A06 preta",
    stock: 3,
    metadata: { catalogoAparelhos: { version: 1, deviceModelKeys: ["samsung_galaxy_a06"], compatibilityTypes: ["capinha"] } },
  }) as ProdutoCapinhaInfo

  it("genérica = controle geral; vinculada a modelo = detalhado; película não é capinha", () => {
    expect(generica).toMatchObject({ controle: "geral", deviceModelKeys: [], pedeModeloNaVenda: true })
    expect(detalhada).toMatchObject({ controle: "detalhado", deviceModelKeys: ["samsung_galaxy_a06"] })
    expect(
      classificarProdutoCapinha({ id: "p", name: "Película", metadata: { acessorios: { version: 1, tipo: "pelicula", exigeModelo: true, exigeCor: false, usaCoresPadrao: true } } }),
    ).toBeNull()
  })

  it("soma por tipo, modelo e cor; ignora cancelada; desconta devolução; conta sem modelo", () => {
    const vendas = [
      {
        status: "concluida",
        payload: {
          lines: [
            { produtoId: "gen", quantity: 2, accessorySelection: { version: 1, deviceModelKey: "samsung_galaxy_a06", deviceModelName: "Samsung Galaxy A06", colorKey: "preto", colorLabel: "Preto" } },
            { produtoId: "gen", quantity: 1, accessorySelection: { version: 1, colorKey: "outra", customColorLabel: "Azul bebê" } },
            { inventoryId: "CAP-T", quantity: 1 },
            { produtoId: "det", quantity: 2, qtyReturned: 1 },
            { produtoId: "outro", quantity: 5 },
          ],
        },
      },
      { status: "cancelada", payload: { lines: [{ produtoId: "gen", quantity: 9 }] } },
    ]
    const r = montarRelatorioCapinhas(vendas, [generica, detalhada])
    expect(r.totalVendido).toBe(5)
    expect(r.vendasConsideradas).toBe(1)
    expect(r.porControle).toEqual({ geral: 4, detalhado: 1 })
    expect(r.porProduto.map((p) => [p.rotulo, p.quantidade])).toEqual([["Capinha transparente", 4], ["Capinha A06 preta", 1]])
    expect(r.porModelo).toEqual([{ chave: "samsung_galaxy_a06", rotulo: "Samsung Galaxy A06", quantidade: 2 }])
    expect(r.porCor.map((c) => [c.rotulo, c.quantidade])).toEqual([["Preto", 2], ["Azul bebê", 1]])
    // genéricas sem modelo informado: 1 (azul bebê) + 1 (bipe direto). Detalhada não entra aqui.
    expect(r.semModelo).toBe(2)
    expect(r.semCor).toBe(2)
  })

  it("nunca inventa quantidade por modelo para venda sem modelo", () => {
    const r = montarRelatorioCapinhas([{ status: "concluida", payload: { lines: [{ produtoId: "gen", quantity: 3 }] } }], [generica])
    expect(r.porModelo).toEqual([])
    expect(r.semModelo).toBe(3)
  })
})
