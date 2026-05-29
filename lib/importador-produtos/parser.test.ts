import { describe, expect, it } from "vitest"
import { processarArquivoProdutos } from "./parser"
import type { ProdutoNormalizado } from "./types"

/**
 * Esses testes alimentam o parser com CSV em memória (Buffer) para cobrir
 * os dois layouts que o importador precisa suportar simultaneamente:
 *
 *   1. Smart Genius — "Relatorio de produtos cadastrados.xls" (~4.748 linhas):
 *         Código · Produto · Custo R$ · Venda R$ · Lucro % · P. Prom. R$ · Estoque
 *
 *   2. Gestão Clique — "produtos Gestão Clique.xlsx" (234 produtos):
 *         Codigo · Codigo de barra · Produto · Grupo · Valor de custo
 *         Valor Varejo · Estoque atual · Estoque mínimo · Estoque máximo
 *         Código NCM · Descrição NCM · Código CEST · Descrição CEST
 *         Peso · Largura · Altura · Comprimento
 *
 * CSV é equivalente a XLS/XLSX para o parser: muda só o leitor de bytes.
 * Header detection, normalização e regras de campo são idênticas.
 *
 * Regras de SKU/barcode (do usuário):
 *  - Código numérico até 4 dígitos → SKU.
 *  - Código numérico com 5+ dígitos → barcode.
 *  - Coluna "Código de barra" tem prioridade absoluta para barcode.
 *  - Nunca duplicar o mesmo valor em SKU e barcode.
 *  - SKU/barcode vazios continuam vazios — sem invenção automática.
 */

function csvBuffer(linhas: string[]): Buffer {
  return Buffer.from(linhas.join("\n"), "utf-8")
}

function porNome(validos: ProdutoNormalizado[], nome: string): ProdutoNormalizado | undefined {
  return validos.find((p) => p.nome === nome)
}

// ── Layout Gestão Clique (234 produtos reais) ────────────────

describe("processarArquivoProdutos — layout Gestão Clique completo", () => {
  // Cabeçalho real (subset) com TODAS as colunas que devem ser ignoradas
  // junto às mapeadas. Testa a stoplist contra contains agressivo.
  const HEADER =
    "Codigo;Codigo de barra;Produto;Grupo;Valor de custo;Valor Varejo;" +
    "Estoque atual;Estoque mínimo;Estoque máximo;" +
    "Código NCM;Descrição NCM;Código CEST;Descrição CEST;" +
    "Peso;Largura;Altura;Comprimento"

  it("mapeia 9 colunas canônicas e ignora 8 colunas (descrições fiscais/dimensões/min-max)", async () => {
    const csv = csvBuffer([
      HEADER,
      // SKU curto + barcode EAN-13 + NCM/CEST reais (exemplos do usuário).
      "10;7891234567890;Massa Dino Loand;Brinquedos;44,15;78,90;25;5;100;39269090;Brinquedos diversos;2810600;Descricao CEST;0,250;5;10;15",
      // SKU alfanumérico, sem barcode na linha, NCM presente.
      "ABC-99;;Caneta Bic Azul;Papelaria;1,20;3,50;180;20;500;96081000;Canetas;;;;;;",
      // Sem SKU, com barcode, sem NCM/CEST.
      ";7891111111111;Refrigerante Cola 2L;Bebidas;5,00;9,90;40;10;200;;;;;;;;",
    ])
    const r = await processarArquivoProdutos(csv, "gestao-clique.csv")

    // ── Mapeamento canônico (9 colunas)
    expect(r.cabecalho.mapeamento["Codigo"]).toBe("sku")
    expect(r.cabecalho.mapeamento["Codigo de barra"]).toBe("barcode")
    expect(r.cabecalho.mapeamento["Produto"]).toBe("nome")
    expect(r.cabecalho.mapeamento["Grupo"]).toBe("categoria")
    expect(r.cabecalho.mapeamento["Valor de custo"]).toBe("custo")
    expect(r.cabecalho.mapeamento["Valor Varejo"]).toBe("preco")
    expect(r.cabecalho.mapeamento["Estoque atual"]).toBe("estoque")
    expect(r.cabecalho.mapeamento["Código NCM"]).toBe("ncm") // ⬅ agora mapeia
    expect(r.cabecalho.mapeamento["Código CEST"]).toBe("cest") // ⬅ agora mapeia

    // ── Ignorados (8 — descrições fiscais, min/max, dimensões)
    expect(r.cabecalho.mapeamento["Estoque mínimo"]).toBeNull()
    expect(r.cabecalho.mapeamento["Estoque máximo"]).toBeNull()
    expect(r.cabecalho.mapeamento["Descrição NCM"]).toBeNull() // ⬅ viraria "nome" via contains
    expect(r.cabecalho.mapeamento["Descrição CEST"]).toBeNull()
    expect(r.cabecalho.mapeamento["Peso"]).toBeNull()
    expect(r.cabecalho.mapeamento["Largura"]).toBeNull()
    expect(r.cabecalho.mapeamento["Altura"]).toBeNull()
    expect(r.cabecalho.mapeamento["Comprimento"]).toBeNull()

    expect(r.validos).toHaveLength(3)

    const massa = porNome(r.validos, "Massa Dino Loand")!
    expect(massa.sku).toBe("10") // 2 dígitos → SKU
    expect(massa.barcode).toBe("7891234567890")
    expect(massa.categoria).toBe("Brinquedos")
    expect(massa.custo).toBe(44.15)
    expect(massa.preco).toBe(78.9)
    expect(massa.estoque).toBe(25) // Estoque atual — NÃO 5 (mín) nem 100 (máx)
    expect(massa.ncm).toBe("39269090") // ⬅ NCM popula corretamente
    expect(massa.cest).toBe("2810600")

    const caneta = porNome(r.validos, "Caneta Bic Azul")!
    expect(caneta.sku).toBe("ABC-99") // alfanumérico → SKU
    expect(caneta.barcode).toBe("")
    expect(caneta.estoque).toBe(180)
    expect(caneta.ncm).toBe("96081000") // NCM presente, CEST vazio
    expect(caneta.cest).toBe("")

    const refri = porNome(r.validos, "Refrigerante Cola 2L")!
    expect(refri.sku).toBe("")
    expect(refri.barcode).toBe("7891111111111")
    expect(refri.estoque).toBe(40)
    expect(refri.ncm).toBe("") // sem NCM na linha
    expect(refri.cest).toBe("")
  })

  it("'Codigo' 5+ dígitos sem coluna 'Codigo de barra' → vai para barcode", async () => {
    const csv = csvBuffer([
      "Codigo;Produto;Grupo;Valor Varejo;Estoque atual",
      "78912;Produto Cinco Dig;Geral;10,00;5",
      "1234567890123;Produto Longo;Geral;20,00;3",
    ])
    const r = await processarArquivoProdutos(csv, "gc-promove.csv")
    expect(r.validos).toHaveLength(2)
    const p5 = porNome(r.validos, "Produto Cinco Dig")!
    expect(p5.sku).toBe("")
    expect(p5.barcode).toBe("78912")
    const pLongo = porNome(r.validos, "Produto Longo")!
    expect(pLongo.sku).toBe("")
    expect(pLongo.barcode).toBe("1234567890123")
  })

  it("'Codigo' 5+ dígitos com 'Codigo de barra' diferente → descarta SKU; barcode oficial vence", async () => {
    const csv = csvBuffer([
      "Codigo;Codigo de barra;Produto;Valor Varejo",
      "999999;7891234567890;Produto Dois Codigos;10,00",
    ])
    const r = await processarArquivoProdutos(csv, "gc-ambos-longos.csv")
    expect(r.validos).toHaveLength(1)
    // Regra: SKU 5+ dígitos não pode ficar em SKU. Barcode oficial vence.
    expect(r.validos[0]!.sku).toBe("")
    expect(r.validos[0]!.barcode).toBe("7891234567890")
  })
})

// ── Layout Smart Genius (~4.748 produtos) ────────────────────

describe("processarArquivoProdutos — layout Smart Genius completo", () => {
  // Headers reais incluindo Lucro % e P. Prom. R$ que devem ser ignorados.
  const HEADER = "Código;Produto;Custo R$;Venda R$;Lucro %;P. Prom. R$;Estoque"

  it("mapeia Custo R$/Venda R$/Estoque + ignora Lucro % e P. Prom. R$", async () => {
    const csv = csvBuffer([
      HEADER,
      "ABC123;Produto Teste 1;10,00;20,00;50,00;15,00;15",
      "10;Item Curto;5,50;9,90;44,44;7,50;100",
      "PROD-001;Outro Item;2,30;4,60;50,00;3,90;7",
    ])
    const r = await processarArquivoProdutos(csv, "smart-genius.csv")

    expect(r.cabecalho.mapeamento["Código"]).toBe("sku")
    expect(r.cabecalho.mapeamento["Produto"]).toBe("nome")
    expect(r.cabecalho.mapeamento["Custo R$"]).toBe("custo")
    expect(r.cabecalho.mapeamento["Venda R$"]).toBe("preco")
    expect(r.cabecalho.mapeamento["Estoque"]).toBe("estoque")
    // ── Ignorados
    expect(r.cabecalho.mapeamento["Lucro %"]).toBeNull()
    expect(r.cabecalho.mapeamento["P. Prom. R$"]).toBeNull()

    expect(r.validos).toHaveLength(3)
    const p1 = porNome(r.validos, "Produto Teste 1")!
    expect(p1.sku).toBe("ABC123")
    expect(p1.preco).toBe(20) // ⬅ Venda R$ — NÃO P. Prom. R$ (15,00)
    expect(p1.custo).toBe(10)
    expect(p1.estoque).toBe(15)

    const p2 = porNome(r.validos, "Item Curto")!
    expect(p2.sku).toBe("10") // 2 dígitos → SKU
    expect(p2.barcode).toBe("")
    expect(p2.preco).toBe(9.9) // ⬅ Venda R$ — NÃO P. Prom. R$ (7,50)
  })
})

// ── Regras de SKU/barcode (cobertura unitária por threshold) ──

describe("processarArquivoProdutos — SKU/barcode threshold (4 vs 5 dígitos)", () => {
  it("4 dígitos numéricos → SKU (não promove)", async () => {
    const csv = csvBuffer([
      "Código;Produto;Venda R$",
      "1;Um Digito;5,00",
      "12;Dois Dig;5,00",
      "123;Tres Dig;5,00",
      "1234;Quatro Dig;5,00",
    ])
    const r = await processarArquivoProdutos(csv, "ate-4.csv")
    expect(r.validos).toHaveLength(4)
    for (const p of r.validos) {
      expect(p.barcode).toBe("") // nenhum promovido
      expect(p.sku).not.toBe("")
    }
    expect(porNome(r.validos, "Um Digito")!.sku).toBe("1")
    expect(porNome(r.validos, "Quatro Dig")!.sku).toBe("1234")
  })

  it("5+ dígitos numéricos → barcode (promove)", async () => {
    const csv = csvBuffer([
      "Código;Produto;Venda R$",
      "12345;Cinco Dig;5,00",
      "123456;Seis Dig;5,00",
      "1234567;Sete Dig;5,00",
      "12345678;Oito Dig EAN-8;5,00",
      "1234567890123;Treze Dig EAN-13;5,00",
      "12345678901234;Catorze Dig GTIN-14;5,00",
    ])
    const r = await processarArquivoProdutos(csv, "cinco-mais.csv")
    expect(r.validos).toHaveLength(6)
    for (const p of r.validos) {
      expect(p.sku).toBe("") // todos promovidos
      expect(p.barcode).not.toBe("")
    }
    expect(porNome(r.validos, "Cinco Dig")!.barcode).toBe("12345")
    expect(porNome(r.validos, "Sete Dig")!.barcode).toBe("1234567")
    expect(porNome(r.validos, "Treze Dig EAN-13")!.barcode).toBe("1234567890123")
  })

  it("SKU alfanumérico (qualquer comprimento) fica em SKU — nunca promove", async () => {
    const csv = csvBuffer([
      "Código;Produto;Venda R$",
      "ABC12345;Alfa Curto;10,00",
      "PROD-0001234567;Alfa Longo;12,00",
      "X;Letra Sozinha;1,00",
    ])
    const r = await processarArquivoProdutos(csv, "alfa.csv")
    expect(r.validos).toHaveLength(3)
    for (const p of r.validos) {
      expect(p.barcode).toBe("")
      expect(p.sku).not.toBe("")
    }
  })
})

// ── Dedupe e prioridade da coluna "Código de barra" ──────────

describe("processarArquivoProdutos — dedupe SKU/barcode", () => {
  it("SKU == barcode na mesma linha → mantém só barcode", async () => {
    const csv = csvBuffer([
      "Código;Código de barra;Nome;Venda R$",
      "7891234567890;7891234567890;Produto Duplicado;10,00",
    ])
    const r = await processarArquivoProdutos(csv, "dup.csv")
    expect(r.validos).toHaveLength(1)
    expect(r.validos[0]!.sku).toBe("")
    expect(r.validos[0]!.barcode).toBe("7891234567890")
  })

  it("Código de barra preenchido tem prioridade — Código 4 dígitos coexiste em SKU", async () => {
    const csv = csvBuffer([
      "Código;Código de barra;Nome;Venda R$",
      "1234;7891234567890;Tem Ambos Curtos;10,00",
    ])
    const r = await processarArquivoProdutos(csv, "ambos-curto.csv")
    expect(r.validos).toHaveLength(1)
    expect(r.validos[0]!.sku).toBe("1234") // SKU curto fica em SKU
    expect(r.validos[0]!.barcode).toBe("7891234567890")
  })
})

// ── NCM / CEST (Produto.metadata) ────────────────────────────

describe("processarArquivoProdutos — NCM/CEST", () => {
  it("Código NCM e Código CEST saem em ncm/cest no ProdutoNormalizado", async () => {
    const csv = csvBuffer([
      "Codigo;Produto;Valor Varejo;Código NCM;Código CEST",
      "1;Produto Fiscal;10,00;39269090;2810600",
    ])
    const r = await processarArquivoProdutos(csv, "ncm-basico.csv")
    expect(r.validos).toHaveLength(1)
    expect(r.validos[0]!.ncm).toBe("39269090")
    expect(r.validos[0]!.cest).toBe("2810600")
  })

  it("NCM com separadores 'XXXX.XX.XX' é sanitizado para 8 dígitos", async () => {
    const csv = csvBuffer([
      "Produto;Valor Varejo;NCM;CEST",
      "Produto A;10,00;3926.90.90;28.106.00",
      "Produto B;20,00;4202.12.20;",
    ])
    const r = await processarArquivoProdutos(csv, "ncm-formatado.csv")
    expect(r.validos).toHaveLength(2)
    const a = porNome(r.validos, "Produto A")!
    expect(a.ncm).toBe("39269090")
    expect(a.cest).toBe("2810600")
    const b = porNome(r.validos, "Produto B")!
    expect(b.ncm).toBe("42021220")
    expect(b.cest).toBe("")
  })

  it("NCM/CEST NUNCA caem em SKU nem barcode", async () => {
    const csv = csvBuffer([
      "Codigo;Produto;Valor Varejo;Código NCM;Código CEST",
      // Código vazio + NCM/CEST de 8 e 7 dígitos respectivamente.
      ";Produto Sem Codigo;10,00;39269090;2810600",
    ])
    const r = await processarArquivoProdutos(csv, "ncm-isolado.csv")
    expect(r.validos).toHaveLength(1)
    const p = r.validos[0]!
    // ⚠ Regra crítica: NCM tem 8 dígitos numéricos. Sem a stoplist/aliases
    // corretos, o algoritmo de contains pegaria "Código NCM" como SKU e o
    // NCM 39269090 (≥5 dígitos) ainda seria promovido para barcode.
    expect(p.sku).toBe("")
    expect(p.barcode).toBe("")
    expect(p.ncm).toBe("39269090")
    expect(p.cest).toBe("2810600")
  })

  it("Sem coluna NCM/CEST → ncm e cest ficam string vazia (não null/undefined)", async () => {
    const csv = csvBuffer([
      "Codigo;Produto;Valor Varejo",
      "10;Produto Simples;5,00",
    ])
    const r = await processarArquivoProdutos(csv, "sem-ncm.csv")
    expect(r.validos).toHaveLength(1)
    expect(r.validos[0]!.ncm).toBe("")
    expect(r.validos[0]!.cest).toBe("")
  })
})
