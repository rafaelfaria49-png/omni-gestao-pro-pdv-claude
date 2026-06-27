/**
 * OPS-V4-INVENTARIO-P1 — `getOrdem` read-only para a Operações V4 Preview.
 *
 * Garante que a leitura usada pela V4 Preview (`getOrdem(..., { readOnly: true })`) NÃO executa
 * `expirarGarantiasVencidas` (que faz `garantiaOrdemServico.updateMany`), mantendo a Preview
 * estritamente sem efeito colateral de escrita — sem quebrar o fluxo normal (V3), que mantém a
 * expiração automática. O serviço real de garantia roda contra um `db` fake (updateMany = spy).
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const h = vi.hoisted(() => {
  const updateMany = vi.fn(async () => ({ count: 0 }))
  const findFirst = vi.fn(async () => ({
    id: "os1",
    storeId: "loja-x",
    numero: "OS-1",
    clienteId: null,
    defeito: "",
    status: "Aberto",
    payload: {},
    createdAt: new Date("2026-06-01T10:00:00.000Z"),
    updatedAt: new Date("2026-06-01T10:00:00.000Z"),
    valorTotal: 0,
    valorBase: 0,
    itens: [],
    garantiasOperacionais: [],
  }))
  const db = {
    ordemServico: { findFirst },
    garantiaOrdemServico: { updateMany },
  }
  // withPrismaSafe roda o callback com o `db` fake (sem Prisma real).
  const withPrismaSafe = vi.fn(async (fn: (d: typeof db) => Promise<unknown>) => fn(db))
  return { db, updateMany, findFirst, withPrismaSafe }
})

vi.mock("@/lib/prisma", () => ({ prisma: h.db, withPrismaSafe: h.withPrismaSafe }))
vi.mock("@/lib/operacoes/services/hydration-service", () => ({
  hydrateOSRows: (rows: unknown[]) => rows,
}))

import { getOrdem } from "./ordens"

beforeEach(() => {
  h.updateMany.mockClear()
  h.findFirst.mockClear()
})

describe("getOrdem — caminho read-only da V4 Preview", () => {
  it("readOnly: true NÃO chama garantiaOrdemServico.updateMany (sem efeito colateral) e ainda lê a OS", async () => {
    await getOrdem("loja-x", "os1", { readOnly: true })
    expect(h.updateMany).not.toHaveBeenCalled()
    expect(h.findFirst).toHaveBeenCalledTimes(1)
  })

  it("default (V3 e demais leitores) mantém a expiração automática de garantias (updateMany é chamado)", async () => {
    await getOrdem("loja-x", "os1")
    expect(h.updateMany).toHaveBeenCalledTimes(1)
  })

  it("storeId/osId vazio → null sem tocar no banco (nem leitura, nem updateMany)", async () => {
    expect(await getOrdem("", "os1", { readOnly: true })).toBeNull()
    expect(await getOrdem("loja-x", "", { readOnly: true })).toBeNull()
    expect(h.findFirst).not.toHaveBeenCalled()
    expect(h.updateMany).not.toHaveBeenCalled()
  })
})
