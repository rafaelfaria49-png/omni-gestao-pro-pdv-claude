/**
 * OMNI-CADASTROS-PADRAO-GLOBAL-UX-001 — padrão de nome/duplicidade nas Server Actions
 * de cadastro (categoria, marca, fornecedor, técnico, modelo, serviço).
 * Prisma em memória com filtro real por storeId/type/id; acesso mockado (coberto em
 * cadastros.access.test.ts).
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

type Row = Record<string, unknown> & { id: string; storeId: string }
const h = vi.hoisted(() => ({ tables: {} as Record<string, Row[]>, seq: 0 }))

function matches(row: Row, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (v && typeof v === "object" && "equals" in (v as object)) {
      return String(row[k] ?? "").toLowerCase() === String((v as { equals: unknown }).equals).toLowerCase()
    }
    return row[k] === v
  })
}

function table(name: string) {
  const rows = () => (h.tables[name] ??= [])
  return {
    findMany: vi.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => rows().filter((r) => matches(r, where))),
    findFirst: vi.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => rows().find((r) => matches(r, where)) ?? null),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const row = { id: `${name}-${++h.seq}`, ...data } as Row
      rows().push(row)
      return row
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = rows().find((r) => r.id === where.id)!
      Object.assign(row, data)
      return row
    }),
  }
}

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth/module-access", () => ({
  requireModuleAction: vi.fn(async () => undefined),
  requirePlatformAction: vi.fn(async () => undefined),
}))
vi.mock("@/lib/cadastros/cadastros-action-access", () => ({
  requireCadastrosActionAccess: vi.fn(async (storeId: string) => ({ storeId })),
  requireCadastrosStoreAccess: vi.fn(async (storeId: string) => storeId),
  requireCadastrosActionSession: vi.fn(async () => ({})),
}))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    categoriaCadastro: table("categoriaCadastro"),
    marcaCadastro: table("marcaCadastro"),
    fornecedor: table("fornecedor"),
    tecnico: table("tecnico"),
    equipamentoModelo: table("equipamentoModelo"),
    servico: table("servico"),
  },
  withPrismaSafe: async (fn: (db: unknown) => unknown, fallback: unknown) => {
    try {
      return await fn({})
    } catch {
      return fallback
    }
  },
}))

import {
  upsertCategoria,
  upsertEquipamentoModelo,
  upsertFornecedor,
  upsertMarca,
  upsertServico,
  upsertTecnico,
} from "@/app/actions/cadastros"

const seed = (name: string, row: Omit<Row, "id"> & { id?: string }) => {
  const full = { id: row.id ?? `${name}-seed-${++h.seq}`, ...row } as Row
  ;(h.tables[name] ??= []).push(full)
  return full
}

beforeEach(() => {
  h.tables = {}
  h.seq = 0
})

describe("categorias e marcas", () => {
  it("cria com padrão de rótulo e reaproveita equivalente sem acento/caixa/espaço", async () => {
    const a = await upsertCategoria("loja-a", { name: "  películas  ", type: "produto" })
    expect(a.name).toBe("Películas")
    const b = await upsertCategoria("loja-a", { name: "PELICULAS", type: "produto" })
    expect(b.id).toBe(a.id)
    expect(h.tables.categoriaCadastro).toHaveLength(1)
  })

  it("reativa a categoria inativa equivalente em vez de duplicar", async () => {
    const old = seed("categoriaCadastro", { storeId: "loja-a", type: "produto", name: "Capinhas", active: false })
    const r = await upsertCategoria("loja-a", { name: "capinhas", type: "produto" })
    expect(r.id).toBe(old.id)
    expect(old.active).toBe(true)
  })

  it("isola por loja e por tipo", async () => {
    seed("categoriaCadastro", { storeId: "loja-b", type: "produto", name: "Películas", active: true })
    seed("categoriaCadastro", { storeId: "loja-a", type: "servico", name: "Películas", active: true })
    await upsertCategoria("loja-a", { name: "Películas", type: "produto" })
    expect(h.tables.categoriaCadastro.filter((c) => c.storeId === "loja-a" && c.type === "produto")).toHaveLength(1)
    expect(h.tables.categoriaCadastro).toHaveLength(3)
  })

  it("bloqueia renomear para nome já existente no mesmo tipo", async () => {
    seed("categoriaCadastro", { storeId: "loja-a", type: "produto", name: "Películas", active: true })
    const outra = seed("categoriaCadastro", { storeId: "loja-a", type: "produto", name: "Capas", active: true })
    await expect(upsertCategoria("loja-a", { id: outra.id, name: "peliculas", type: "produto" })).rejects.toThrow(
      "Já existe a categoria “Películas”",
    )
    expect(outra.name).toBe("Capas")
  })

  it("inativar não reescreve a grafia legada", async () => {
    const legado = seed("categoriaCadastro", { storeId: "loja-a", type: "produto", name: "capinhas", active: true })
    await upsertCategoria("loja-a", { id: legado.id, name: "capinhas", type: "produto", active: false })
    expect(legado.name).toBe("capinhas")
    expect(legado.active).toBe(false)
  })

  it("marca preserva a grafia do fabricante e deduplica por chave", async () => {
    const m = await upsertMarca("loja-a", { name: "  iPhone  " })
    expect(m.name).toBe("iPhone")
    const lg = await upsertMarca("loja-a", { name: "LG" })
    expect(lg.name).toBe("LG")
    const again = await upsertMarca("loja-a", { name: "iphone" })
    expect(again.id).toBe(m.id)
  })
})

describe("fornecedor", () => {
  it("preserva siglas do nome e padroniza o contato", async () => {
    await upsertFornecedor("loja-a", { nome: "TECH  CELL LTDA", contato: "JOÃO DA SILVA" })
    const f = h.tables.fornecedor[0]
    expect(f.name).toBe("TECH CELL LTDA")
    expect(f.contactName).toBe("João da Silva")
  })

  it("bloqueia mesmo nome e mesmo CNPJ; aceita filial com CNPJ diferente", async () => {
    seed("fornecedor", { storeId: "loja-a", name: "Distribuidora Sul", document: "11.222.333/0001-81", legalName: "", contactName: "" })
    await expect(upsertFornecedor("loja-a", { nome: "distribuidora sul" })).rejects.toThrow("Já existe o fornecedor")
    await expect(upsertFornecedor("loja-a", { nome: "Outro Nome", cnpj: "11222333000181" })).rejects.toThrow(
      "Já existe o fornecedor",
    )
    await expect(upsertFornecedor("loja-a", { nome: "Distribuidora Sul", cnpj: "99.888.777/0001-66" })).resolves.toBeTruthy()
    await expect(upsertFornecedor("loja-b", { nome: "Distribuidora Sul", cnpj: "11222333000181" })).resolves.toBeTruthy()
  })

  it("edição de fornecedor legado duplicado sem mudar nome segue permitida", async () => {
    seed("fornecedor", { storeId: "loja-a", name: "Duplicado", document: "", legalName: "", contactName: "" })
    const b = seed("fornecedor", { storeId: "loja-a", name: "Duplicado", document: "", legalName: "", contactName: "MARIA" })
    await upsertFornecedor("loja-a", { id: b.id, nome: "Duplicado", contato: "MARIA", whatsapp: "11999990000" })
    expect(b.whatsapp).toBe("11999990000")
    expect(b.contactName).toBe("MARIA")
  })
})

describe("técnico, modelo e serviço", () => {
  it("técnico: nome de pessoa padronizado e duplicidade por loja", async () => {
    await upsertTecnico("loja-a", { name: "carlos alberto ii" })
    expect(h.tables.tecnico[0].name).toBe("Carlos Alberto II")
    await expect(upsertTecnico("loja-a", { name: "CARLOS ALBERTO II" })).rejects.toThrow("Já existe o técnico")
    await expect(upsertTecnico("loja-b", { name: "Carlos Alberto II" })).resolves.toBeTruthy()
  })

  it("modelo: preserva grafia, duplicidade por marca + modelo", async () => {
    await upsertEquipamentoModelo("loja-a", { name: "iPhone  11", brand: "Apple", type: "smartphone" })
    const row = h.tables.equipamentoModelo[0]
    expect(row.name).toBe("iPhone 11")
    expect(row.type).toBe("Smartphone")
    await expect(upsertEquipamentoModelo("loja-a", { name: "IPHONE 11", brand: "apple" })).rejects.toThrow("Já existe o modelo")
    await expect(upsertEquipamentoModelo("loja-a", { name: "iPhone 11 Pro", brand: "Apple" })).resolves.toBeTruthy()
  })

  it("serviço: duplicidade por nome dentro da categoria", async () => {
    seed("categoriaCadastro", { storeId: "loja-a", type: "servico", name: "Celular", active: true })
    seed("categoriaCadastro", { storeId: "loja-a", type: "servico", name: "Tablet", active: true })
    await upsertServico("loja-a", { nome: "troca de tela", categoria: "Celular", preco: 100 })
    expect(h.tables.servico[0].name).toBe("Troca de tela")
    await expect(upsertServico("loja-a", { nome: "TROCA DE TELA", categoria: "Celular" })).rejects.toThrow("Já existe o serviço")
    await expect(upsertServico("loja-a", { nome: "Troca de tela", categoria: "Tablet", preco: 150 })).resolves.toBeTruthy()
  })
})
