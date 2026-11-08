import { describe, expect, it, vi } from "vitest"
import { buildCatalogoIndex, parseDeviceModels } from "./catalogo-aparelhos"
import {
  createLojaModelo,
  getLojaModelosByKeys,
  listLojaCompatOverrides,
  listLojaModelos,
  setLojaCompatDecisao,
  updateLojaModelo,
} from "./loja-catalogo-store"

/** Rollout seguro: com a migration ainda não aplicada (P2021), leituras degradam e escritas dão 503. */
const missingTable = Object.assign(new Error("The table does not exist"), { code: "P2021" })
const reject = () => vi.fn(async () => { throw missingTable })
const db = {
  catalogoAparelhoLojaModelo: { findMany: reject(), findFirst: reject(), count: reject(), create: reject(), updateMany: reject() },
  catalogoAparelhoLojaCompat: { findMany: reject(), upsert: reject(), deleteMany: reject() },
} as never
const global = buildCatalogoIndex({ models: [], aliases: [] })

describe("tabela ausente (migration pendente)", () => {
  it("leituras devolvem vazio — a busca segue com o catálogo global", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(await listLojaModelos(db, "loja")).toEqual([])
    expect(await getLojaModelosByKeys(db, "loja", ["manual_x"])).toEqual([])
    expect(await listLojaCompatOverrides(db, "loja", "pelicula_tela", ["a"])).toEqual([])
  })

  it("escritas devolvem UNAVAILABLE (503), sem lançar", async () => {
    expect(await createLojaModelo(db, global, "loja", "u", { brand: "M", name: "G47" })).toMatchObject({ ok: false, code: "UNAVAILABLE", status: 503 })
    expect(await updateLojaModelo(db, global, "loja", "u", "id", { version: 1, active: false })).toMatchObject({ ok: false, code: "UNAVAILABLE" })
    expect(await setLojaCompatDecisao(db, global, "loja", "u", { modelKey: "manual_a", otherModelKey: "manual_b", decisao: "suprimir" }))
      .toMatchObject({ ok: false, code: "UNAVAILABLE" })
  })

  it("erros inesperados NÃO são mascarados", async () => {
    const boom = { catalogoAparelhoLojaModelo: { findMany: vi.fn(async () => { throw new Error("boom") }) } } as never
    await expect(listLojaModelos(boom, "loja")).rejects.toThrow("boom")
  })

  it("validação acontece antes de tocar o banco", async () => {
    const untouched = { catalogoAparelhoLojaModelo: { findFirst: vi.fn(), create: vi.fn() } } as never
    expect(await createLojaModelo(untouched, global, "loja", "u", { brand: "", name: "" })).toMatchObject({ ok: false, code: "INVALID" })
    expect(await updateLojaModelo(untouched, global, "loja", "u", "id", { name: "x" })).toMatchObject({ ok: false, code: "INVALID" })
  })
})

describe("revisão independente", () => {
  it("P2-1: banco inalcançável (PrismaClientInitializationError com errorCode) degrada a leitura", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const init = Object.assign(new Error("Can't reach database server"), { name: "PrismaClientInitializationError", errorCode: "P1001" })
    const down = { catalogoAparelhoLojaModelo: { findMany: vi.fn(async () => { throw init }) } } as never
    expect(await listLojaModelos(down, "loja")).toEqual([])
  })

  it("P2-3: reativar recusa se o modelo passou a existir no catálogo global", async () => {
    const g = buildCatalogoIndex({
      models: parseDeviceModels(["model_key,brand,canonical_name,short_name", "marca_g47,Marca X,Marca X G47,G47"].join("\n")),
      aliases: [],
    })
    const row = { id: "m1", storeId: "loja", modelKey: "manual_1", brand: "Marca X", name: "G47", brandKey: "MARCA X", nameKey: "G47", aliases: [], notes: "", active: false, version: 4, createdAt: new Date(), updatedAt: new Date() }
    const fake = { catalogoAparelhoLojaModelo: { findFirst: vi.fn(async () => row), updateMany: vi.fn() } } as never
    expect(await updateLojaModelo(fake, g, "loja", "u", "m1", { version: 4, active: true })).toMatchObject({ ok: false, code: "DUPLICATE", existing: { source: "global", modelKey: "marca_g47" } })
  })

  it("P3-1: recusa o modelo além do limite que a busca consegue ler (sem gravar)", async () => {
    const create = vi.fn()
    const full = { catalogoAparelhoLojaModelo: { findFirst: vi.fn(async () => null), count: vi.fn(async () => 2000), create } } as never
    expect(await createLojaModelo(full, global, "loja", "u", { brand: "M", name: "G47" })).toMatchObject({ ok: false, code: "LIMIT", status: 409 })
    expect(create).not.toHaveBeenCalled()
  })
})
