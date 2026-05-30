// ============================================================
// Testes do parser/normalizador Smart Genius (grade sintética fiel ao real).
// ============================================================

import { describe, it, expect } from "vitest"
import { detectarSmartLayout } from "./detectar"
import { parsearClientesDaGrade, parsearContasReceberDaGrade } from "./parser"
import { numero, telefone, dataIso } from "./normalizar"

const GRADE_CLIENTES: unknown[][] = [
  [null, null, null, null, null, "Listagem de Clientes", null, null, "Data de Emissão: ", null, "29/05/2026"],
  ["Codigo", null, null, null, null, null, "Telefone", null, null, "Cidade", null],
  [null, "Nome", null, null, null, null, null, null, null, null, null],
  [28, "ADRIANA CRISTINA DOS SANTOS DE", null, null, null, null, "(41)99560-9896", null, null, "Taguaí", null],
  [46, "ADRIANA CRISTINA MARTINS", null, null, null, null, null, null, null, null, null],
  [1, "CONSUMIDOR", null, null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null, null, null, null], // linha vazia → ignorada
  [99, null, null, null, null, null, null, null, null, null, null], // sem nome → inválida
]

const GRADE_CONTAS: unknown[][] = [
  ["Listagem de Contas a Receber", null, null, null, null, null, null, null, null, null, null, null, null, "Data de Emissão: ", "29/05/2026"],
  ["Código:", null, "Nome:", "Telefone:", null, "Ult. Pag:", "Menor Venc:", "Atraso:", null, "Em atraso:", "A vencer:", null, "Total:", "Reaj:", "Tot. Reaj:"],
  [46, null, "ADRIANA CRISTINA MARTINS", "(14)9961-05798", null, null, "21/04/2025", 403, null, 199.9, 0, null, 199.9, 51.97, 251.87],
  [74, null, "APARECIDA INACIO VITOR", null, null, "31/01/2026", "20/05/2026", 9, null, 19.9, 12, null, 31.9, 0.12, 32.02],
  [51, null, "FABIANA MARIA MACEDO", "(14)9817-25860", null, "23/02/2026", "25/06/2026", 0, null, 0, 149.8, null, 149.8, 0, 149.8],
]

describe("normalizar", () => {
  it("numero: aceita number do SheetJS e string BR", () => {
    expect(numero(199.9)).toBe(199.9)
    expect(numero("1.234,56")).toBe(1234.56)
    expect(numero("R$ 109,90")).toBe(109.9)
    expect(numero(null)).toBe(0)
  })
  it("telefone: remove duplicata na mesma célula", () => {
    expect(telefone("(14)99761-5509 (14)99761-5509")).toBe("(14)99761-5509")
    expect(telefone("(41)99560-9896")).toBe("(41)99560-9896")
    expect(telefone(null)).toBe("")
  })
  it("dataIso: dd/mm/yyyy → ISO, vazio preserva vazio", () => {
    expect(dataIso("21/04/2025")).toBe("2025-04-21")
    expect(dataIso("")).toBe("")
    expect(dataIso(null)).toBe("")
  })
})

describe("parsearClientesDaGrade", () => {
  it("extrai clientes, ignora vazias, reporta sem-nome", () => {
    const d = detectarSmartLayout(GRADE_CLIENTES)!
    const r = parsearClientesDaGrade(GRADE_CLIENTES, d)
    expect(r.validos).toHaveLength(3)
    expect(r.invalidos).toHaveLength(1)
    const adriana = r.validos[0]!
    expect(adriana.nome).toBe("ADRIANA CRISTINA DOS SANTOS DE")
    expect(adriana.codigoLegado).toBe("28")
    expect(adriana.telefone).toBe("(41)99560-9896")
    expect(adriana.cidade).toBe("Taguaí")
  })

  it("NÃO vaza telefone/cidade entre linhas (alinhamento posicional por coluna)", () => {
    // Regressão: a 2ª cliente tem a linha com nulls interiores (telefone/cidade vazios).
    // Mapeamento posicional deve devolver "" — nunca herdar o valor da linha acima.
    const d = detectarSmartLayout(GRADE_CLIENTES)!
    const r = parsearClientesDaGrade(GRADE_CLIENTES, d)
    const martins = r.validos.find((c) => c.codigoLegado === "46")!
    expect(martins.nome).toBe("ADRIANA CRISTINA MARTINS")
    expect(martins.telefone).toBe("")
    expect(martins.cidade).toBe("")
  })
})

describe("parsearContasReceberDaGrade", () => {
  it("extrai saldo consolidado por cliente com colunas corretas", () => {
    const d = detectarSmartLayout(GRADE_CONTAS)!
    const r = parsearContasReceberDaGrade(GRADE_CONTAS, d)
    expect(r.validos).toHaveLength(3)

    const adriana = r.validos[0]!
    expect(adriana.cliente).toBe("ADRIANA CRISTINA MARTINS")
    expect(adriana.codigoLegado).toBe("46")
    expect(adriana.emAtraso).toBe(199.9)
    expect(adriana.aVencer).toBe(0)
    expect(adriana.menorVencimento).toBe("2025-04-21")
    expect(adriana.total).toBe(199.9)
    expect(adriana.reaj).toBe(51.97)
    expect(adriana.totalReaj).toBe(251.87)

    // Aparecida tem AMBOS atraso(19.9) + a vencer(12) → 2 títulos no Bloco D.
    const aparecida = r.validos[1]!
    expect(aparecida.emAtraso).toBe(19.9)
    expect(aparecida.aVencer).toBe(12)

    // Fabiana só a vencer (149.8) → 1 título pendente no Bloco D.
    const fabiana = r.validos[2]!
    expect(fabiana.emAtraso).toBe(0)
    expect(fabiana.aVencer).toBe(149.8)
  })

  it("aritmética do relatório: emAtraso + aVencer = total (linhas reais)", () => {
    const d = detectarSmartLayout(GRADE_CONTAS)!
    const r = parsearContasReceberDaGrade(GRADE_CONTAS, d)
    for (const c of r.validos) {
      expect(Math.round((c.emAtraso + c.aVencer) * 100)).toBe(Math.round(c.total * 100))
    }
  })
})
