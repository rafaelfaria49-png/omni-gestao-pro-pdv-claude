import { describe, expect, it, vi } from "vitest"
import { buildCatalogoIndex, parseDeviceModels } from "./catalogo-aparelhos"
import {
  chaveLockCatalogoModelos,
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
    const full = { catalogoAparelhoLojaModelo: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []), count: vi.fn(async () => 2000), create } } as never
    expect(await createLojaModelo(full, global, "loja", "u", { brand: "M", name: "G47" })).toMatchObject({ ok: false, code: "LIMIT", status: 409 })
    expect(create).not.toHaveBeenCalled()
  })
})

describe("COMPAT-BUSCA-MODELOS-NATURAL-001 — nome de um caractere e reaproveitamento", () => {
  const row = (p: Record<string, unknown>) => ({
    id: "row-1",
    storeId: "loja",
    modelKey: "manual_iphone7",
    brand: "Apple",
    manufacturer: "Apple",
    line: "",
    lancamento: "lancado",
    name: "iPhone 7",
    brandKey: "APPLE",
    nameKey: "IPHONE 7",
    aliases: [],
    notes: "",
    active: true,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...p,
  })
  const vazio = () => ({
    catalogoAparelhoLojaModelo: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => row({ ...data, id: "novo" })),
    },
  })

  it('"iPhone" + "7" (fabricante Apple) é cadastro válido quando nada equivalente existe', async () => {
    const db = vazio()
    const r = await createLojaModelo(db as never, global, "loja", "u", { manufacturer: "Apple", brand: "iPhone", name: "7" })
    expect(r).toMatchObject({ ok: true })
    expect(db.catalogoAparelhoLojaModelo.create).toHaveBeenCalledTimes(1)
    expect(db.catalogoAparelhoLojaModelo.create.mock.calls[0][0].data).toMatchObject({ brand: "iPhone", name: "7", nameKey: "7" })
  })

  it("no catálogo global: devolve DUPLICATE com o modelo existente (sem gravar)", async () => {
    const g = buildCatalogoIndex({
      models: parseDeviceModels(
        ["model_key,brand,commercial_line,canonical_name,short_name,status", "apple_iphone_7,Apple,iPhone,Apple iPhone 7,7,ativo"].join("\n"),
      ),
      aliases: [],
    })
    const db = vazio()
    const r = await createLojaModelo(db as never, g, "loja", "u", { manufacturer: "Apple", brand: "iPhone", name: "7" })
    expect(r).toMatchObject({ ok: false, code: "DUPLICATE", existing: { modelKey: "apple_iphone_7", source: "global", active: true } })
    expect(db.catalogoAparelhoLojaModelo.create).not.toHaveBeenCalled()
  })

  it('na loja, escrito de outro jeito ("Apple" + "iPhone 7"): oferece usar o existente', async () => {
    const existente = row({})
    const db = vazio()
    db.catalogoAparelhoLojaModelo.findMany = vi.fn(async () => [existente]) as never
    const r = await createLojaModelo(db as never, global, "loja", "u", { manufacturer: "Apple", brand: "iPhone", name: "7" })
    expect(r).toMatchObject({ ok: false, code: "DUPLICATE", existing: { modelKey: "manual_iphone7", source: "loja", active: true } })
    expect(db.catalogoAparelhoLojaModelo.create).not.toHaveBeenCalled()
  })

  it.each([
    ["desativado", { active: false }, /desativado/],
    ["aguardando lançamento", { lancamento: "aguardando_lancamento" }, /aguardando lançamento/],
  ])("revisão R1 (P2): equivalente %s na loja também bloqueia (orienta reativar/confirmar)", async (_n, estado, msg) => {
    const existente = row({ modelKey: "manual_futuro", name: "iPhone Futuro QA", nameKey: "IPHONE FUTURO QA", ...estado })
    const db = vazio()
    db.catalogoAparelhoLojaModelo.findMany = vi.fn(async () => [existente]) as never
    const r = await createLojaModelo(db as never, global, "loja", "u", { manufacturer: "Apple", brand: "iPhone", name: "Futuro QA" })
    expect(r).toMatchObject({ ok: false, code: "DUPLICATE", existing: { modelKey: "manual_futuro", source: "loja", active: false } })
    expect(r.ok ? "" : (r as { message: string }).message).toMatch(msg)
    expect(db.catalogoAparelhoLojaModelo.create).not.toHaveBeenCalled()
  })

  it("revisão R3 (P2): editar para o mesmo aparelho escrito de outro jeito também é bloqueado", async () => {
    const outro = row({ id: "row-apple5", modelKey: "manual_apple5", brand: "Apple", name: "iPhone 5", brandKey: "APPLE", nameKey: "IPHONE 5" })
    const atual = row({ id: "row-5s", modelKey: "manual_5s", brand: "iPhone", name: "5s", brandKey: "IPHONE", nameKey: "5S" })
    const updateMany = vi.fn(async () => ({ count: 1 }))
    const db = {
      catalogoAparelhoLojaModelo: {
        findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => (where.id === "row-5s" ? atual : null)),
        findMany: vi.fn(async () => [outro, atual]),
        updateMany,
      },
    }
    const r = await updateLojaModelo(db as never, global, "loja", "u", "row-5s", { version: 1, name: "5" })
    expect(r).toMatchObject({ ok: false, code: "DUPLICATE", existing: { modelKey: "manual_apple5", source: "loja" } })
    expect(updateMany).not.toHaveBeenCalled()
    // editar sem mudar a identidade (só observação) segue livre — e não se acusa como duplicata de si mesmo
    const ok = await updateLojaModelo(db as never, global, "loja", "u", "row-5s", { version: 1, notes: "conferido" })
    expect(ok.ok).toBe(true)
  })

  it("revisão R4 (P2): legado com fabricante vazio coberto pelo global continua editável (só observação)", async () => {
    const g = buildCatalogoIndex({
      models: parseDeviceModels(
        ["model_key,brand,commercial_line,canonical_name,short_name,status", "motorola_moto_g47,Motorola,Moto G,Motorola Moto G47,G47,ativo"].join("\n"),
      ),
      aliases: [],
    })
    const legado = row({ id: "row-g47", modelKey: "manual_g47", brand: "Motorola", manufacturer: "", name: "G47", brandKey: "MOTOROLA", nameKey: "G47" })
    const updateMany = vi.fn(async () => ({ count: 1 }))
    const db = {
      catalogoAparelhoLojaModelo: {
        findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => (where.id === "row-g47" ? legado : null)),
        findMany: vi.fn(async () => [legado]),
        updateMany,
      },
    }
    for (const patch of [{ notes: "conferido" }, { aliases: ["MotoG47"] }, { lancamento: "lancado" }]) {
      expect(await updateLojaModelo(db as never, g, "loja", "u", "row-g47", { version: 1, ...patch }), JSON.stringify(patch)).toMatchObject({ ok: true })
    }
    // trocar de fato o fabricante continua passando pelas checagens
    expect(await updateLojaModelo(db as never, g, "loja", "u", "row-g47", { version: 1, manufacturer: "Motorola" })).toMatchObject({ ok: true })
    expect(updateMany).toHaveBeenCalledTimes(4)
  })

  it("revisão R5 (P2): fabricante gravado vale nos dois sentidos (Asus + ROG × Asus + 'ROG Phone QA99')", async () => {
    const rog = row({ id: "row-rog", modelKey: "manual_rog", brand: "ROG", manufacturer: "Asus", name: "Phone QA99", brandKey: "ROG", nameKey: "PHONE QA99" })
    const asus = row({ id: "row-asus", modelKey: "manual_asus", brand: "Asus", manufacturer: "Asus", name: "ROG Phone QA99", brandKey: "ASUS", nameKey: "ROG PHONE QA99" })
    for (const [existente, input, esperado] of [
      [rog, { brand: "Asus", manufacturer: "Asus", name: "ROG Phone QA99" }, "manual_rog"],
      [asus, { brand: "ROG", manufacturer: "Asus", name: "Phone QA99" }, "manual_asus"],
    ] as const) {
      const db = vazio()
      db.catalogoAparelhoLojaModelo.findMany = vi.fn(async () => [existente]) as never
      expect(await createLojaModelo(db as never, global, "loja", "u", input), esperado).toMatchObject({
        ok: false, code: "DUPLICATE", existing: { modelKey: esperado },
      })
      expect(db.catalogoAparelhoLojaModelo.create).not.toHaveBeenCalled()
    }
    // edição: renomear outro registro Asus para "ROG Phone QA99" também é bloqueado
    const outro = row({ id: "row-outro", modelKey: "manual_outro", brand: "Asus", manufacturer: "Asus", name: "Zen QA", brandKey: "ASUS", nameKey: "ZEN QA" })
    const updateMany = vi.fn(async () => ({ count: 1 }))
    const db = {
      catalogoAparelhoLojaModelo: {
        findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => (where.id === "row-outro" ? outro : null)),
        findMany: vi.fn(async () => [rog, outro]),
        updateMany,
      },
    }
    expect(await updateLojaModelo(db as never, global, "loja", "u", "row-outro", { version: 1, name: "ROG Phone QA99" })).toMatchObject({
      ok: false, code: "DUPLICATE", existing: { modelKey: "manual_rog" },
    })
    expect(updateMany).not.toHaveBeenCalled()
  })

  it("duplicidade exata na mesma marca continua bloqueada", async () => {
    const db = vazio()
    db.catalogoAparelhoLojaModelo.findFirst = vi.fn(async () => row({ brand: "iPhone", name: "7", brandKey: "IPHONE", nameKey: "7" })) as never
    expect(await createLojaModelo(db as never, global, "loja", "u", { brand: "iPhone", name: "7" })).toMatchObject({ ok: false, code: "DUPLICATE" })
    expect(db.catalogoAparelhoLojaModelo.create).not.toHaveBeenCalled()
  })

  it("nome sem letra nem número segue inválido, antes de tocar o banco", async () => {
    const untouched = { catalogoAparelhoLojaModelo: { findFirst: vi.fn(), create: vi.fn() } }
    for (const name of ["-", ".", "…", "  "]) {
      expect(await createLojaModelo(untouched as never, global, "loja", "u", { brand: "iPhone", name }), name).toMatchObject({ ok: false, code: "INVALID" })
    }
    expect(await createLojaModelo(untouched as never, global, "loja", "u", { brand: "", name: "7" })).toMatchObject({
      ok: false,
      code: "INVALID",
      errors: { brand: expect.any(String) },
    })
    expect(untouched.catalogoAparelhoLojaModelo.findFirst).not.toHaveBeenCalled()
  })

  it("PR #355 P2: usa transação + advisory lock escopado por loja na criação e edição", async () => {
    expect(chaveLockCatalogoModelos("loja-a")).toBe("catalogo-modelos:loja-a")
    expect(chaveLockCatalogoModelos("loja-a")).not.toBe(chaveLockCatalogoModelos("loja-b"))

    const queryRaw = vi.fn(async () => [{ lock: "" }])
    const inner = { ...vazio(), $queryRaw: queryRaw }
    const transaction = vi.fn(async (fn: (tx: typeof inner) => Promise<unknown>) => fn(inner))
    const db = { ...inner, $transaction: transaction }

    const res = await createLojaModelo(db as never, global, "loja-a", "u", { brand: "Marca QA", name: "X1" })
    expect(res.ok).toBe(true)
    expect(transaction).toHaveBeenCalledTimes(1)
    expect(queryRaw).toHaveBeenCalledTimes(1)
    expect(queryRaw.mock.calls[0]).toContain("catalogo-modelos:loja-a")
  })
})
