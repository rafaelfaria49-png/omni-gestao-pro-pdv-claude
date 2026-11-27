/**
 * ESTOQUE-MANUAL-KG-001 — contagem de inventário de produto por peso.
 * A contagem e o snapshot do inventário são inteiros: aceitar KG truncaria
 * 3,250 kg em 3. A action recusa antes de gravar qualquer linha.
 */
import { beforeEach, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
  produtoFindFirst: vi.fn(),
  contagemCreate: vi.fn(),
  contagemUpdate: vi.fn(),
  contagemFindFirst: vi.fn(async () => null),
}))

vi.mock("@/lib/auth/module-access", () => ({ requireModuleAction: vi.fn(async () => undefined), requirePlatformAction: vi.fn() }))
vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "u1", name: "Tester" } })) }))
vi.mock("@/lib/auth/enterprise-permissions", () => ({ canAccessStore: () => true }))
vi.mock("@/app/actions/estoque", () => ({ registrarAjusteEstoque: vi.fn() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inventarioSessao: { findFirst: vi.fn(async () => ({ id: "s1" })) },
    produto: { findFirst: h.produtoFindFirst },
    inventarioContagem: { findFirst: h.contagemFindFirst, create: h.contagemCreate, update: h.contagemUpdate },
  },
}))

import { registrarContagemProduto } from "@/app/actions/inventario"

beforeEach(() => {
  h.produtoFindFirst.mockReset()
  h.contagemCreate.mockReset()
  h.contagemUpdate.mockReset()
})

it.each([
  [{ comercial: { version: 1, modoVenda: "peso", unidade: "KG", basePreco: "KG" } }],
  [{ vendaPorPeso: true }],
])("produto por peso não entra na contagem (%j): nada é gravado", async (metadata) => {
  h.produtoFindFirst.mockResolvedValue({ id: "p1", name: "PAO FRANCES", sku: "PAO", stock: 3.25, metadata })
  const r = await registrarContagemProduto("loja-a", { sessaoId: "s1", codigo: "PAO", produtoId: "p1", quantidade: 3, modo: "substituir" })
  expect(r).toMatchObject({ ok: false, reason: expect.stringMatching(/contagem de inventário em kg ainda não está disponível/) })
  expect(h.contagemCreate).not.toHaveBeenCalled()
  expect(h.contagemUpdate).not.toHaveBeenCalled()
})
