import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * CAD-R2-016 — Server Action `interpretarProdutoTextoLivre`.
 *
 * Adapter fino: autoriza, delega, devolve sugestão temporária. Sem banco:
 * acesso e interpretação são mocks. Prova que a action nunca persiste
 * (não importa Prisma/write-service/ledger — ver boundaries.test.ts).
 */

const h = vi.hoisted(() => ({
  acesso: vi.fn(async (_storeId: string, _area: string) => ({ storeId: "loja-1", session: null })),
  interpretar: vi.fn(async (texto: string) => ({ eco: texto })),
}))

vi.mock("@/lib/cadastros/cadastros-action-access", () => ({
  requireCadastrosActionAccess: h.acesso,
}))
vi.mock("@/lib/cadastros/natural-text", () => ({
  interpretarTextoProduto: h.interpretar,
}))

import { interpretarProdutoTextoLivre } from "@/app/actions/produto-texto-livre"

beforeEach(() => {
  h.acesso.mockClear()
  h.interpretar.mockClear()
  h.acesso.mockResolvedValue({ storeId: "loja-1", session: null })
  h.interpretar.mockImplementation(async (texto: string) => ({ eco: texto }))
})

describe("interpretarProdutoTextoLivre: adapter fino sem persistencia", () => {
  it("autoriza na area hub e devolve a sugestao temporaria", async () => {
    const r = await interpretarProdutoTextoLivre("loja-1", "Película iPhone, vendo por 25")
    expect(h.acesso).toHaveBeenCalledWith("loja-1", "hub")
    expect(h.interpretar).toHaveBeenCalledWith("Película iPhone, vendo por 25")
    expect(r).toEqual({ ok: true, sugestao: { eco: "Película iPhone, vendo por 25" } })
  })

  it("sem acesso: propaga o erro do gate (fail-closed)", async () => {
    h.acesso.mockRejectedValueOnce(new Error("Sem acesso"))
    await expect(interpretarProdutoTextoLivre("loja-1", "texto")).rejects.toThrow("Sem acesso")
    expect(h.interpretar).not.toHaveBeenCalled()
  })

  it("falha de validacao vira { ok:false } com mensagem sanitizada", async () => {
    h.interpretar.mockRejectedValueOnce(new Error("Descreva o produto antes de interpretar."))
    const r = await interpretarProdutoTextoLivre("loja-1", "   ")
    expect(r).toEqual({ ok: false, message: "Descreva o produto antes de interpretar." })
  })
})
