/**
 * Cobertura de Substituição Tributária no Motor Tributário — GOAL-006 (D9 / DoD F2).
 *
 * Verifica: CSOSN 500 (ICMS já cobrado anteriormente por ST — substituído) suportado com ICMS
 * próprio NÃO destacado e ST retida carregada em `icms.st`; matriz de origem 0–8; e bloqueio
 * explícito de CSOSN 201/202/203/900 e de CSOSN 500 sem identificação de ST (fail-closed).
 *
 * Princípio fiscal: no substituído, o ICMS foi retido na operação anterior → a nota de saída não
 * destaca ICMS próprio (valor 0). Os valores de ST (retido/efetivo) são CONGELADOS da entrada; o
 * motor apenas normaliza e ecoa — nunca inventa base/valor.
 */
import { describe, it, expect } from "vitest"
import { calculateTax } from "./calculator"
import {
  isCsosnStSuportado,
  isCsosnStNaoSuportado,
  isCsosnSuportado,
  isCsosnComST,
} from "./index"
import type { TaxEngineInput } from "./types"

function simples(itens: TaxEngineInput["itens"], extra: Partial<TaxEngineInput> = {}): TaxEngineInput {
  return { regime: "SIMPLES_NACIONAL", itens, ...extra }
}

describe("rules · classificação CSOSN de ST", () => {
  it("500 é ST suportado; 201/202/203/900 são ST não suportados", () => {
    expect(isCsosnStSuportado("500")).toBe(true)
    expect(isCsosnSuportado("500")).toBe(true)
    for (const c of ["201", "202", "203", "900"]) {
      expect(isCsosnStNaoSuportado(c)).toBe(true)
      expect(isCsosnStSuportado(c)).toBe(false)
      expect(isCsosnSuportado(c)).toBe(false)
    }
    // "envolve ST" cobre suportado e não suportado
    expect(isCsosnComST("500")).toBe(true)
    expect(isCsosnComST("202")).toBe(true)
    expect(isCsosnComST("102")).toBe(false)
  })
})

describe("calculateTax · CSOSN 500 (substituído)", () => {
  it("com identificação de ST: ok, ICMS próprio não destacado, st carregada", () => {
    const r = calculateTax(
      simples([
        {
          quantidade: 2,
          valorUnitario: 50,
          csosn: "500",
          origemMercadoria: "0",
          vBCSTRet: 100,
          vICMSSTRet: 18,
          vICMSSubstituto: 12,
        },
      ]),
    )
    expect(r.ok).toBe(true)
    const icms = r.itens[0].icms
    expect(icms.situacao).toBe("st")
    expect(icms.codigo).toBe("500")
    // ICMS próprio NÃO destacado no substituído
    expect(icms.valor).toBe(0)
    expect(icms.baseCalculo).toBe(0)
    // ST retida ecoada
    expect(icms.st).toBeDefined()
    expect(icms.st?.vBCSTRet).toBe(100)
    expect(icms.st?.vICMSSTRet).toBe(18)
    expect(icms.st?.vICMSSubstituto).toBe(12)
    // Não soma no total da nota (ICMS destacado = 0)
    expect(r.totais.valorIcms).toBe(0)
    expect(r.totais.valorTotalTributos).toBe(0)
    expect(r.totais.valorTotalNota).toBe(100)
    expect(r.itens[0].warnings.join(" ")).toContain("Substituição Tributária")
  })

  it("deriva vICMSEfet de vBCEfet × pICMSEfet quando ausente", () => {
    const r = calculateTax(
      simples([
        {
          quantidade: 1,
          valorUnitario: 200,
          csosn: "500",
          vBCEfet: 200,
          pICMSEfet: 18,
        },
      ]),
    )
    expect(r.ok).toBe(true)
    expect(r.itens[0].icms.st?.vBCEfet).toBe(200)
    expect(r.itens[0].icms.st?.pICMSEfet).toBe(18)
    expect(r.itens[0].icms.st?.vICMSEfet).toBe(36) // 200 × 18%
  })

  it("CSOSN 500 SEM identificação de ST → fail-closed (st_incompleta)", () => {
    const r = calculateTax(simples([{ quantidade: 1, valorUnitario: 30, csosn: "500" }]))
    expect(r.ok).toBe(false)
    expect(r.errors.some((e) => e.code === "st_incompleta")).toBe(true)
    expect(r.itens).toHaveLength(0)
  })
})

describe("validateInput · bloqueios explícitos", () => {
  it("CSOSN 201/202/203/900 permanecem bloqueados (csosn_nao_suportado)", () => {
    for (const c of ["201", "202", "203", "900"]) {
      const r = calculateTax(simples([{ quantidade: 1, valorUnitario: 10, csosn: c }]))
      expect(r.ok).toBe(false)
      expect(r.errors.some((e) => e.code === "csosn_nao_suportado")).toBe(true)
    }
  })

  it("origem fora da matriz 0–8 → origem_nao_suportada", () => {
    const r = calculateTax(simples([{ quantidade: 1, valorUnitario: 10, csosn: "102", origemMercadoria: "9" }]))
    expect(r.ok).toBe(false)
    expect(r.errors.some((e) => e.code === "origem_nao_suportada")).toBe(true)
  })

  it("origem 0–8 é aceita", () => {
    for (const o of ["0", "1", "2", "3", "4", "5", "6", "7", "8"]) {
      const r = calculateTax(simples([{ quantidade: 1, valorUnitario: 10, csosn: "102", origemMercadoria: o }]))
      expect(r.ok).toBe(true)
    }
  })
})
