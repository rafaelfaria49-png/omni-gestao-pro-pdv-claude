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

// `@/auth` real carrega next-auth → `next/server`, que o Node ESM não resolve fora do bundler do Next.
// Usuário da loja-x com módulo service (requireModuleAction(lojaId, "service")).
vi.mock("@/auth", async () => {
  const { storeSession } = await import("@/test/fixtures/store-session")
  return { auth: vi.fn(async () => storeSession({ stores: ["loja-x"], modules: ["service"] })) }
})
vi.mock("@/lib/prisma", () => ({ prisma: h.db, withPrismaSafe: h.withPrismaSafe }))
vi.mock("@/lib/operacoes/services/hydration-service", () => ({
  hydrateOSRows: (rows: unknown[]) => rows,
}))

import { getOrdem } from "./ordens"
import { auth } from "@/auth"
import { storeSession } from "@/test/fixtures/store-session"

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

  it("storeId vazio → recusado pelo guard; osId vazio → null; nenhum dos dois toca o banco", async () => {
    // Desde 52c01c3 o guard de módulo roda antes da normalização: loja vazia não é autorizável.
    await expect(getOrdem("", "os1", { readOnly: true })).rejects.toThrow("Sem permissão para esta unidade")
    expect(await getOrdem("loja-x", "", { readOnly: true })).toBeNull()
    expect(h.findFirst).not.toHaveBeenCalled()
    expect(h.updateMany).not.toHaveBeenCalled()
  })
})

describe("getOrdem — guard de módulo real (negativos)", () => {
  it("loja fora da membership → recusa sem tocar no banco", async () => {
    await expect(getOrdem("loja-y", "os1", { readOnly: true })).rejects.toThrow("Sem permissão para esta unidade")
    expect(h.findFirst).not.toHaveBeenCalled()
  })
  it("membership sem módulo service → recusa sem tocar no banco", async () => {
    vi.mocked(auth).mockResolvedValueOnce(storeSession({ stores: ["loja-x"], modules: ["pdv"] }) as never)
    await expect(getOrdem("loja-x", "os1", { readOnly: true })).rejects.toThrow("Sem permissão para este módulo ou unidade.")
    expect(h.findFirst).not.toHaveBeenCalled()
  })
})
