import { describe, it, expect } from "vitest"
import {
  validarCadastroRapido,
  buildCadastroRapidoPayload,
  type CadastroRapidoForm,
} from "./inventario-cadastro-rapido"

// ============================================================================
// INVENTARIO-CADASTRO-RAPIDO-COM-PENDENCIAS-001 — núcleo do "Cadastrar rápido".
// Garante: EAN bipado → Produto.barcode, qty contada preservada como estoque,
// SKU opcional → Produto.sku, fiscal NUNCA exigido, metadata de pendência.
// ============================================================================

const base: CadastroRapidoForm = {
  barcode: "7908629902046",
  nome: "Panela preta craqueada n22",
  categoria: "Cozinha",
  quantidade: 3,
  precoVenda: 49.9,
  precoCusto: 30,
  sku: "PAN-22",
  observacao: "bipado na bancada",
}

describe("validarCadastroRapido", () => {
  it("aceita o formulário operacional mínimo (nome + EAN + preço de venda)", () => {
    expect(validarCadastroRapido(base)).toEqual({ ok: true })
  })
  it("rejeita sem nome", () => {
    expect(validarCadastroRapido({ ...base, nome: "  " })).toEqual({
      ok: false,
      campo: "nome",
      motivo: expect.any(String),
    })
  })
  it("rejeita sem código de barras (o fluxo nasce de um EAN bipado)", () => {
    expect(validarCadastroRapido({ ...base, barcode: "" })).toMatchObject({ ok: false, campo: "barcode" })
  })
  it("rejeita preço de venda zero/negativo", () => {
    expect(validarCadastroRapido({ ...base, precoVenda: 0 })).toMatchObject({ ok: false, campo: "precoVenda" })
  })
  it("NÃO exige fiscal: sem NCM/CEST/CFOP o formulário é válido", () => {
    // O tipo nem possui campos fiscais — a ausência é estrutural, mas validamos o caminho feliz.
    expect(validarCadastroRapido(base).ok).toBe(true)
  })
})

describe("buildCadastroRapidoPayload", () => {
  it("EAN bipado vai para barcode (Produto.barcode); SKU vai para sku", () => {
    const p = buildCadastroRapidoPayload(base)
    expect(p.barcode).toBe("7908629902046")
    expect(p.sku).toBe("PAN-22")
  })

  it("quantidade contada vira estoque inicial (sem divergência: contado = estoque)", () => {
    expect(buildCadastroRapidoPayload({ ...base, quantidade: 7 }).stock).toBe(7)
  })

  it("preço de venda e custo são preservados; custo ausente vira 0", () => {
    const p = buildCadastroRapidoPayload({ ...base, precoCusto: null })
    expect(p.price).toBe(49.9)
    expect(p.precoCusto).toBe(0)
  })

  it("NÃO emite nenhum campo fiscal (ncm/cest/cfop/origem ausentes do payload)", () => {
    const p = buildCadastroRapidoPayload(base) as Record<string, unknown>
    expect(p.ncm).toBeUndefined()
    expect(p.cest).toBeUndefined()
    expect(p.cfop).toBeUndefined()
    expect(p.origemMercadoria).toBeUndefined()
  })

  it("marca metadata de pendência (origem + fiscal/cadastro pendente + rastreio)", () => {
    const p = buildCadastroRapidoPayload(base, { sessaoId: "sess-1", pendenciaCodigo: "7908629902046" })
    expect(p.metadata).toMatchObject({
      origemCadastro: "inventario_rapido",
      cadastroFiscalPendente: true,
      cadastroCompletoPendente: true,
      inventarioSessaoId: "sess-1",
      inventarioPendenciaCodigo: "7908629902046",
      observacaoCadastroRapido: "bipado na bancada",
    })
  })

  it("campos opcionais vazios não viajam (category/sku/observação/contexto omitidos)", () => {
    const p = buildCadastroRapidoPayload({
      barcode: "7891111111111",
      nome: "Item solto",
      quantidade: 1,
      precoVenda: 10,
    })
    expect("category" in p).toBe(false)
    expect("sku" in p).toBe(false)
    expect(p.metadata.observacaoCadastroRapido).toBeUndefined()
    expect(p.metadata.inventarioSessaoId).toBeUndefined()
    expect(p.barcode).toBe("7891111111111")
  })

  it("não cruza valores: só barcode preenchido não vaza para sku", () => {
    const p = buildCadastroRapidoPayload({ barcode: "7892222222222", nome: "X", quantidade: 2, precoVenda: 5 })
    expect(p.barcode).toBe("7892222222222")
    expect(p.sku).toBeUndefined()
  })
})
