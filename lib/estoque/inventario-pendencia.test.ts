/**
 * INVENTARIO_ASSISTIDO_V1 — Fase 6. Testes do núcleo PURO de pendência (inventario-pendencia.ts).
 * Sem Prisma/IO — cobre: nome rápido, número de leituras, vínculo de fechamento (idempotência).
 */
import { describe, expect, it } from "vitest"
import {
  lerPendencia,
  marcarPendenciaPayload,
  lerVinculoPendencia,
  marcarVinculoPendencia,
  pendenciaResolvida,
} from "./inventario-pendencia"

describe("pendência — nome rápido e número de leituras", () => {
  it("payload vazio/sem marca → sem nome, zero leituras", () => {
    expect(lerPendencia(null)).toEqual({ nomeRapido: null, numeroLeituras: 0 })
    expect(lerPendencia({})).toEqual({ nomeRapido: null, numeroLeituras: 0 })
  })

  it("primeira leitura grava nome e incrementa para 1", () => {
    const p = marcarPendenciaPayload(null, { nomeRapido: "Película A36" })
    expect(lerPendencia(p)).toEqual({ nomeRapido: "Película A36", numeroLeituras: 1 })
  })

  it("leitura seguinte sem nome preserva o nome já informado e soma leitura", () => {
    let p: unknown = marcarPendenciaPayload(null, { nomeRapido: "Cabo USB-C" })
    p = marcarPendenciaPayload(p, { nomeRapido: undefined })
    expect(lerPendencia(p)).toEqual({ nomeRapido: "Cabo USB-C", numeroLeituras: 2 })
  })

  it("leitura seguinte com novo nome sobrescreve", () => {
    let p: unknown = marcarPendenciaPayload(null, { nomeRapido: "Capinha" })
    p = marcarPendenciaPayload(p, { nomeRapido: "Capinha A15" })
    expect(lerPendencia(p)).toEqual({ nomeRapido: "Capinha A15", numeroLeituras: 2 })
  })

  it("preserva outros campos já existentes no payload (ex.: ajuste de F4)", () => {
    const p = marcarPendenciaPayload({ ajusteAplicado: true }, { nomeRapido: "X" })
    expect(p.ajusteAplicado).toBe(true)
  })

  it("nome só espaços é tratado como ausente", () => {
    const p = marcarPendenciaPayload(null, { nomeRapido: "   " })
    expect(lerPendencia(p).nomeRapido).toBeNull()
  })
})

describe("pendência — vínculo de fechamento (cadastrado/associado)", () => {
  it("sem vínculo por padrão → não resolvida", () => {
    expect(lerVinculoPendencia(null)).toBeNull()
    expect(pendenciaResolvida(null)).toBe(false)
    expect(pendenciaResolvida({})).toBe(false)
  })

  it("marcar e reler o vínculo preserva os dados de auditoria", () => {
    const p = marcarVinculoPendencia(
      { historico: ["x"] },
      { produtoId: "prod-1", tipo: "cadastrado", vinculadoEm: "2026-06-21T10:00:00.000Z", operador: "Ana" }
    )
    expect(p.historico).toEqual(["x"])
    expect(lerVinculoPendencia(p)).toEqual({
      produtoId: "prod-1",
      tipo: "cadastrado",
      vinculadoEm: "2026-06-21T10:00:00.000Z",
      operador: "Ana",
    })
    expect(pendenciaResolvida(p)).toBe(true)
  })

  it("aceita operador nulo", () => {
    const p = marcarVinculoPendencia(null, {
      produtoId: "prod-2",
      tipo: "associado",
      vinculadoEm: "2026-06-21T10:00:00.000Z",
      operador: null,
    })
    expect(lerVinculoPendencia(p)?.operador).toBeNull()
  })

  it("idempotente: não sobrescreve vínculo já existente", () => {
    let p: unknown = marcarVinculoPendencia(null, {
      produtoId: "prod-1",
      tipo: "cadastrado",
      vinculadoEm: "2026-06-21T10:00:00.000Z",
      operador: "Ana",
    })
    p = marcarVinculoPendencia(p, {
      produtoId: "prod-2",
      tipo: "associado",
      vinculadoEm: "2026-06-22T10:00:00.000Z",
      operador: "Beto",
    })
    expect(lerVinculoPendencia(p)?.produtoId).toBe("prod-1")
    expect(lerVinculoPendencia(p)?.tipo).toBe("cadastrado")
  })

  it("ignora vínculo malformado (tipo inválido ou produtoId ausente)", () => {
    expect(lerVinculoPendencia({ pendenciaVinculo: { tipo: "cadastrado" } })).toBeNull()
    expect(lerVinculoPendencia({ pendenciaVinculo: { produtoId: "p1", tipo: "outro" } })).toBeNull()
  })
})
