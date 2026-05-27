import { describe, expect, it } from "vitest"
import {
  classificarBarcode,
  classificarSku,
  decidirAcao,
  resolveProductImportMatch,
  type SnapshotBancoProdutos,
} from "./match"
import type { ProdutoNormalizado } from "./types"

// ── Helpers ───────────────────────────────────────────────────

function produto(over: Partial<ProdutoNormalizado>): ProdutoNormalizado {
  return {
    linha: 1,
    sku: "",
    barcode: "",
    nome: "Produto teste",
    custo: 0,
    preco: 0,
    estoque: 0,
    categoria: "",
    ...over,
  }
}

function bancoVazio(): SnapshotBancoProdutos {
  return { skus: new Set(), barcodes: new Set() }
}

// ── classificarSku ────────────────────────────────────────────

describe("classificarSku", () => {
  it("retorna 'ausente' quando vazio", () => {
    expect(classificarSku("")).toBe("ausente")
    expect(classificarSku("   ")).toBe("ausente")
  })

  it("retorna 'fraca' para numérico curto (incidente Smart)", () => {
    expect(classificarSku("1")).toBe("fraca")
    expect(classificarSku("10")).toBe("fraca")
    expect(classificarSku("148")).toBe("fraca")
    expect(classificarSku("1000")).toBe("fraca")
    expect(classificarSku("999999")).toBe("fraca") // 6 dígitos ainda fraco
  })

  it("retorna 'forte' para numérico ≥7 dígitos (EAN-like)", () => {
    expect(classificarSku("1234567")).toBe("forte")
    expect(classificarSku("12345678")).toBe("forte")
    expect(classificarSku("7891234567890")).toBe("forte") // EAN-13
  })

  it("retorna 'forte' para alfanumérico", () => {
    expect(classificarSku("ABC123")).toBe("forte")
    expect(classificarSku("PROD-001")).toBe("forte")
    expect(classificarSku("A1")).toBe("forte")
  })

  it("retorna 'forte' para códigos com hífen/ponto", () => {
    expect(classificarSku("123-456")).toBe("forte")
  })
})

// ── classificarBarcode ────────────────────────────────────────

describe("classificarBarcode", () => {
  it("retorna 'ausente' quando vazio", () => {
    expect(classificarBarcode("")).toBe("ausente")
  })

  it("retorna 'forte' para EAN/GTIN válidos", () => {
    expect(classificarBarcode("12345678")).toBe("forte") // EAN-8
    expect(classificarBarcode("123456789012")).toBe("forte") // UPC-A
    expect(classificarBarcode("7891234567890")).toBe("forte") // EAN-13
    expect(classificarBarcode("12345678901234")).toBe("forte") // GTIN-14
  })

  it("retorna 'fraca' para barcode mal formatado", () => {
    expect(classificarBarcode("123")).toBe("fraca") // curto
    expect(classificarBarcode("ABC123")).toBe("fraca") // letras
    expect(classificarBarcode("123456")).toBe("fraca") // 6 dígitos
  })
})

// ── resolveProductImportMatch ─────────────────────────────────

describe("resolveProductImportMatch", () => {
  it("sem nenhuma chave → sem match", () => {
    const r = resolveProductImportMatch(produto({}), bancoVazio())
    expect(r.matchForte).toBeNull()
    expect(r.matchFraco).toBeNull()
  })

  it("barcode forte presente no banco → match FORTE por barcode", () => {
    const banco: SnapshotBancoProdutos = {
      skus: new Set(),
      barcodes: new Set(["7891234567890"]),
    }
    const r = resolveProductImportMatch(produto({ barcode: "7891234567890" }), banco)
    expect(r.matchForte).toEqual({ campo: "barcode", valor: "7891234567890" })
    expect(r.matchFraco).toBeNull()
  })

  it("SKU forte presente no banco → match FORTE por sku", () => {
    const banco: SnapshotBancoProdutos = {
      skus: new Set(["abc-123"]),
      barcodes: new Set(),
    }
    const r = resolveProductImportMatch(produto({ sku: "ABC-123" }), banco)
    expect(r.matchForte).toEqual({ campo: "sku", valor: "ABC-123" })
  })

  it("SKU curto numérico presente no banco → match FRACO (não autoriza update)", () => {
    const banco: SnapshotBancoProdutos = {
      skus: new Set(["10", "148", "1000"]),
      barcodes: new Set(),
    }
    expect(resolveProductImportMatch(produto({ sku: "10" }), banco).matchFraco).toEqual({
      campo: "sku",
      valor: "10",
    })
    expect(resolveProductImportMatch(produto({ sku: "148" }), banco).matchFraco).toEqual({
      campo: "sku",
      valor: "148",
    })
  })

  it("barcode forte vence SKU fraco quando ambos existem", () => {
    const banco: SnapshotBancoProdutos = {
      skus: new Set(["10"]),
      barcodes: new Set(["7891234567890"]),
    }
    const r = resolveProductImportMatch(
      produto({ sku: "10", barcode: "7891234567890" }),
      banco,
    )
    expect(r.matchForte).toEqual({ campo: "barcode", valor: "7891234567890" })
    expect(r.matchFraco).toBeNull()
  })

  it("SKU forte da planilha NÃO bate em barcode no banco (campos separados)", () => {
    const banco: SnapshotBancoProdutos = {
      skus: new Set(), // sem skus no banco
      barcodes: new Set(["7891234567890"]),
    }
    const r = resolveProductImportMatch(produto({ sku: "7891234567890" }), banco)
    // SKU não bate em barcode — antes o persist.ts fazia esse "or" cruzado
    expect(r.matchForte).toBeNull()
    expect(r.matchFraco).toBeNull()
  })
})

// ── decidirAcao por modo ──────────────────────────────────────

describe("decidirAcao", () => {
  const resolucaoForte = {
    matchForte: { campo: "barcode" as const, valor: "7891234567890" },
    matchFraco: null,
    classificacaoSku: "ausente" as const,
    classificacaoBarcode: "forte" as const,
  }
  const resolucaoFraca = {
    matchForte: null,
    matchFraco: { campo: "sku" as const, valor: "10" },
    classificacaoSku: "fraca" as const,
    classificacaoBarcode: "ausente" as const,
  }
  const semMatch = {
    matchForte: null,
    matchFraco: null,
    classificacaoSku: "ausente" as const,
    classificacaoBarcode: "ausente" as const,
  }

  it("modo 'criar-novos': match forte → PULAR (não recria existente)", () => {
    expect(decidirAcao(resolucaoForte, "criar-novos").acao).toBe("pular")
  })

  it("modo 'criar-novos': match fraco → CRIAR (chave fraca não conta)", () => {
    expect(decidirAcao(resolucaoFraca, "criar-novos").acao).toBe("criar")
  })

  it("modo 'criar-novos': sem match → CRIAR", () => {
    expect(decidirAcao(semMatch, "criar-novos").acao).toBe("criar")
  })

  it("modo 'atualizar-existentes': match forte → ATUALIZAR", () => {
    expect(decidirAcao(resolucaoForte, "atualizar-existentes").acao).toBe("atualizar")
  })

  it("modo 'atualizar-existentes': match fraco → CRIAR (não atualiza por chave fraca)", () => {
    expect(decidirAcao(resolucaoFraca, "atualizar-existentes").acao).toBe("criar")
  })

  it("modo 'pular-existentes': match fraco → PULAR (mais conservador)", () => {
    expect(decidirAcao(resolucaoFraca, "pular-existentes").acao).toBe("pular")
  })

  it("modo 'pular-existentes': sem match → CRIAR", () => {
    expect(decidirAcao(semMatch, "pular-existentes").acao).toBe("criar")
  })
})

// ── Cenário do incidente Smart (reprodução do bug) ────────────

describe("cenário Smart: 239 produtos antigos + 500 planilha nova com SKUs curtos", () => {
  // Simula o banco com 239 produtos antigos da GestãoClick, SKUs curtos numéricos.
  const skusAntigos = Array.from({ length: 239 }, (_, i) => String(i + 1))
  const bancoAntigo: SnapshotBancoProdutos = {
    skus: new Set(skusAntigos),
    barcodes: new Set(),
  }

  // Planilha Smart: 500 produtos com SKU = índice sequencial 1..500 (códigos curtos).
  const linhasSmart: ProdutoNormalizado[] = Array.from({ length: 500 }, (_, i) =>
    produto({ linha: i + 2, sku: String(i + 1), nome: `Smart ${i + 1}`, preco: 10 }),
  )

  it("modo padrão 'criar-novos' decide CRIAR para todas as 500 linhas (matches fracos não pulam)", () => {
    let criar = 0
    let pular = 0
    let atualizar = 0
    for (const p of linhasSmart) {
      const r = resolveProductImportMatch(p, bancoAntigo)
      const d = decidirAcao(r, "criar-novos")
      if (d.acao === "criar") criar++
      else if (d.acao === "pular") pular++
      else atualizar++
    }
    expect(criar).toBe(500)
    expect(atualizar).toBe(0)
    expect(pular).toBe(0)
  })

  it("modo 'atualizar-existentes' AINDA cria todas as 500 (chave fraca não autoriza update)", () => {
    let criar = 0
    let atualizar = 0
    for (const p of linhasSmart) {
      const r = resolveProductImportMatch(p, bancoAntigo)
      const d = decidirAcao(r, "atualizar-existentes")
      if (d.acao === "criar") criar++
      else if (d.acao === "atualizar") atualizar++
    }
    expect(criar).toBe(500)
    expect(atualizar).toBe(0) // <-- isso é o fix do incidente: era 500 atualizados antes
  })

  it("modo 'pular-existentes' PULA todas as 239 colidentes + cria as 261 restantes", () => {
    let criar = 0
    let pular = 0
    for (const p of linhasSmart) {
      const r = resolveProductImportMatch(p, bancoAntigo)
      const d = decidirAcao(r, "pular-existentes")
      if (d.acao === "criar") criar++
      else if (d.acao === "pular") pular++
    }
    expect(pular).toBe(239) // sku 1..239 colidem
    expect(criar).toBe(261) // sku 240..500 sem colisão
  })

  it("com barcodes EAN-13 reais, modo 'atualizar' DEVE atualizar (chave forte)", () => {
    const skuLong = "7891234567890"
    const banco: SnapshotBancoProdutos = {
      skus: new Set(),
      barcodes: new Set([skuLong]),
    }
    const p = produto({ sku: "10", barcode: skuLong, nome: "novo nome" })
    const r = resolveProductImportMatch(p, banco)
    expect(r.matchForte).toEqual({ campo: "barcode", valor: skuLong })
    expect(decidirAcao(r, "atualizar-existentes").acao).toBe("atualizar")
  })
})
