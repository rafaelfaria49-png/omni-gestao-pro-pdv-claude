/**
 * INVENTARIO_ASSISTIDO_V1 — Fase 4. Testes do núcleo PURO de ajuste (inventario-ajuste.ts).
 * Sem Prisma/IO — cobre: divergente pendente, item já ajustado, produto não bipado, novoSaldo, motivo.
 */
import { describe, expect, it } from "vitest"
import {
  lerAjusteContagem,
  marcarAjusteContagemPayload,
  lerAjustesNaoBipados,
  naoBipadoAjustado,
  marcarAjusteNaoBipadoPayload,
  novoSaldoParaContagem,
  NOVO_SALDO_NAO_BIPADO,
  montarMotivoInventario,
  isDivergentePendente,
} from "./inventario-ajuste"

describe("isDivergentePendente", () => {
  it("contado ≠ sistema e não ajustado → pendente", () => {
    expect(isDivergentePendente({ diferenca: -3 })).toBe(true)
    expect(isDivergentePendente({ diferenca: 5, ajusteAplicado: false })).toBe(true)
  })
  it("sem diferença ou já ajustado → não pendente", () => {
    expect(isDivergentePendente({ diferenca: 0 })).toBe(false)
    expect(isDivergentePendente({ diferenca: -3, ajusteAplicado: true })).toBe(false)
  })
})

describe("ajuste em payload de contagem (item já ajustado)", () => {
  it("payload vazio/sem marca → não aplicado", () => {
    expect(lerAjusteContagem(null).aplicado).toBe(false)
    expect(lerAjusteContagem({}).aplicado).toBe(false)
    expect(lerAjusteContagem({ ajusteAplicado: false }).aplicado).toBe(false)
  })
  it("marcar e reler o ajuste preserva os dados de auditoria", () => {
    const p = marcarAjusteContagemPayload(
      { historico: ["x"] },
      { aplicadoEm: "2026-06-14T10:00:00.000Z", movimentacaoId: "mov-1", operador: "Ana" }
    )
    // preserva campos pré-existentes do payload
    expect(p.historico).toEqual(["x"])
    const info = lerAjusteContagem(p)
    expect(info).toEqual({
      aplicado: true,
      aplicadoEm: "2026-06-14T10:00:00.000Z",
      movimentacaoId: "mov-1",
      operador: "Ana",
    })
  })
  it("aceita movimentacaoId nulo (ajuste sem mudança de saldo)", () => {
    const p = marcarAjusteContagemPayload(null, { aplicadoEm: "2026-06-14T10:00:00.000Z", movimentacaoId: null, operador: null })
    expect(lerAjusteContagem(p).aplicado).toBe(true)
    expect(lerAjusteContagem(p).movimentacaoId).toBeNull()
  })
})

describe("ajuste de produto não bipado (sessão.payload)", () => {
  it("não ajustado por padrão", () => {
    expect(naoBipadoAjustado(null, "p1")).toBe(false)
    expect(naoBipadoAjustado({ ajustesNaoBipados: {} }, "p1")).toBe(false)
  })
  it("marcar zeragem e reler", () => {
    const sp = marcarAjusteNaoBipadoPayload(
      { foo: 1 },
      "p1",
      { aplicadoEm: "2026-06-14T10:00:00.000Z", movimentacaoId: "mov-9", operador: "João" }
    )
    expect((sp as { foo?: number }).foo).toBe(1) // preserva payload existente
    expect(naoBipadoAjustado(sp, "p1")).toBe(true)
    expect(naoBipadoAjustado(sp, "p2")).toBe(false)
    expect(lerAjustesNaoBipados(sp).p1.movimentacaoId).toBe("mov-9")
  })
  it("acumula múltiplos produtos sem sobrescrever", () => {
    let sp: unknown = null
    sp = marcarAjusteNaoBipadoPayload(sp, "p1", { aplicadoEm: "t1", movimentacaoId: "m1", operador: null })
    sp = marcarAjusteNaoBipadoPayload(sp, "p2", { aplicadoEm: "t2", movimentacaoId: "m2", operador: null })
    expect(Object.keys(lerAjustesNaoBipados(sp)).sort()).toEqual(["p1", "p2"])
  })
})

describe("novoSaldoParaContagem", () => {
  it("inteiro ≥ 0; trunca e normaliza inválidos", () => {
    expect(novoSaldoParaContagem(0)).toBe(0)
    expect(novoSaldoParaContagem(5)).toBe(5)
    expect(novoSaldoParaContagem(3.9)).toBe(3)
    expect(novoSaldoParaContagem(-2)).toBe(0)
    expect(novoSaldoParaContagem(Number.NaN)).toBe(0)
  })
  it("não bipado zera", () => {
    expect(NOVO_SALDO_NAO_BIPADO).toBe(0)
  })
})

describe("montarMotivoInventario", () => {
  it("usa nome da sessão quando houver; senão o id", () => {
    expect(montarMotivoInventario({ id: "s1", nome: "Contagem Junho" })).toBe("Inventário físico — sessão Contagem Junho")
    expect(montarMotivoInventario({ id: "s1", nome: null })).toBe("Inventário físico — sessão s1")
  })
  it("variante ausência", () => {
    expect(montarMotivoInventario({ id: "s1", nome: "" }, "ausencia")).toBe("Ausência confirmada no inventário — sessão s1")
  })
})
