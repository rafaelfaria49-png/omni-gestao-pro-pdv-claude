/**
 * INVENTARIO_ASSISTIDO_V1 — Fase 5. Testes da classificação PURA da reconciliação.
 */
import { describe, expect, it } from "vitest"
import {
  CLASSIFICACAO_RECONCILIACAO,
  normalizarClassificacao,
  lerClassificacaoReconciliacao,
  marcarClassificacaoReconciliacao,
} from "./inventario-reconciliacao"

describe("normalizarClassificacao", () => {
  it("aceita valores válidos; inválido/vazio → pendente", () => {
    expect(normalizarClassificacao("localizado")).toBe("localizado")
    expect(normalizarClassificacao("ignorado")).toBe("ignorado")
    expect(normalizarClassificacao("cadastrar_depois")).toBe("cadastrar_depois")
    expect(normalizarClassificacao("qualquer")).toBe("pendente")
    expect(normalizarClassificacao(null)).toBe("pendente")
  })
})

describe("lerClassificacaoReconciliacao", () => {
  it("default pendente quando payload vazio", () => {
    expect(lerClassificacaoReconciliacao(null)).toBe("pendente")
    expect(lerClassificacaoReconciliacao({})).toBe("pendente")
  })
  it("lê valor gravado", () => {
    expect(lerClassificacaoReconciliacao({ reconciliacaoClass: "localizado" })).toBe("localizado")
  })
})

describe("marcarClassificacaoReconciliacao", () => {
  it("grava classificação + metadados e preserva payload existente", () => {
    const p = marcarClassificacaoReconciliacao(
      { quantidade: 3 },
      CLASSIFICACAO_RECONCILIACAO.CADASTRAR_DEPOIS,
      { em: "2026-06-14T10:00:00.000Z", operador: "Ana" }
    )
    expect((p as { quantidade?: number }).quantidade).toBe(3)
    expect(p.reconciliacaoClass).toBe("cadastrar_depois")
    expect(p.reconciliacaoClassEm).toBe("2026-06-14T10:00:00.000Z")
    expect(p.reconciliacaoClassOperador).toBe("Ana")
    expect(lerClassificacaoReconciliacao(p)).toBe("cadastrar_depois")
  })
  it("valor inválido cai para pendente ao gravar", () => {
    // @ts-expect-error força valor inválido
    const p = marcarClassificacaoReconciliacao(null, "xpto")
    expect(p.reconciliacaoClass).toBe("pendente")
  })
})
