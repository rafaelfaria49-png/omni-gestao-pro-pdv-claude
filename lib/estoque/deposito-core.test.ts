/**
 * BL-07 Fase 1 — testes do núcleo multi-depósito (deposito-core.ts).
 *
 * Usa um TransactionClient fake em memória (mesmo padrão de ops-upsert-venda.test.ts):
 * o vitest.config roda em `node` e proíbe importar `@/lib/prisma`/`@/generated/prisma`.
 * `deposito-core.ts` usa só `import type` do Prisma (apagado no runtime), então este teste
 * não toca o banco e roda sem regenerar o client.
 *
 * Cobre (ETAPA 7): criação de depósito principal (idempotente), criação/atualização de
 * ProdutoDeposito, agregação correta, backfill a partir de Produto.stock, e isolamento
 * multi-loja (ETAPA 6 — sem fallback loja-1, sem vazamento cross-tenant).
 */
import { describe, expect, it } from "vitest"
import {
  agregarQuantidade,
  resolveDepositoPrincipal,
  assertStoreId,
  ensureDepositoPrincipal,
  getEstoqueAgregado,
  getEstoquePorDeposito,
  setEstoqueDeposito,
  backfillLojaDepositoPrincipal,
  DEPOSITO_PRINCIPAL_CODIGO,
} from "./deposito-core"

type FakeDeposito = {
  id: string
  storeId: string
  nome: string
  codigo: string
  ativo: boolean
  principal: boolean
}
type FakeProdutoDeposito = {
  id: string
  storeId: string
  produtoId: string
  depositoId: string
  quantidade: number
}
type FakeProduto = { id: string; storeId: string; stock: number }

/** Fake mínimo do Prisma.TransactionClient para os métodos usados em deposito-core. */
function makeFakeClient(seed?: { depositos?: FakeDeposito[]; produtoDepositos?: FakeProdutoDeposito[]; produtos?: FakeProduto[] }) {
  const depositos: FakeDeposito[] = [...(seed?.depositos ?? [])]
  const produtoDepositos: FakeProdutoDeposito[] = [...(seed?.produtoDepositos ?? [])]
  const produtos: FakeProduto[] = [...(seed?.produtos ?? [])]
  let seq = 0
  const newId = (p: string) => `${p}-${++seq}`

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const client: any = {
    deposito: {
      findFirst: async ({ where }: any) => {
        return (
          depositos.find((d) => {
            if (where.storeId !== undefined && d.storeId !== where.storeId) return false
            if (where.id !== undefined && d.id !== where.id) return false
            if (Array.isArray(where.OR)) {
              return where.OR.some(
                (c: any) =>
                  (c.codigo !== undefined && d.codigo === c.codigo) ||
                  (c.principal !== undefined && d.principal === c.principal),
              )
            }
            return true
          }) ?? null
        )
      },
      create: async ({ data }: any) => {
        const row: FakeDeposito = {
          id: newId("dep"),
          storeId: data.storeId,
          nome: data.nome,
          codigo: data.codigo,
          ativo: data.ativo ?? true,
          principal: data.principal ?? false,
        }
        depositos.push(row)
        return row
      },
    },
    produto: {
      findFirst: async ({ where }: any) =>
        produtos.find((p) => p.id === where.id && p.storeId === where.storeId) ?? null,
      findMany: async ({ where }: any) => produtos.filter((p) => p.storeId === where.storeId),
    },
    produtoDeposito: {
      findMany: async ({ where }: any) =>
        produtoDepositos.filter(
          (pd) =>
            (where.storeId === undefined || pd.storeId === where.storeId) &&
            (where.produtoId === undefined || pd.produtoId === where.produtoId),
        ),
      upsert: async ({ where, create, update }: any) => {
        const key = where.produtoId_depositoId
        const found = produtoDepositos.find(
          (pd) => pd.produtoId === key.produtoId && pd.depositoId === key.depositoId,
        )
        if (found) {
          found.quantidade = update.quantidade
          return found
        }
        const row: FakeProdutoDeposito = {
          id: newId("pd"),
          storeId: create.storeId,
          produtoId: create.produtoId,
          depositoId: create.depositoId,
          quantidade: create.quantidade,
        }
        produtoDepositos.push(row)
        return row
      },
    },
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return { client, depositos, produtoDepositos, produtos }
}

describe("deposito-core — helpers puros", () => {
  it("agregarQuantidade soma e ignora não-finitos", () => {
    expect(agregarQuantidade([{ quantidade: 3 }, { quantidade: 2 }, { quantidade: 5 }])).toBe(10)
    expect(agregarQuantidade([])).toBe(0)
    expect(agregarQuantidade([{ quantidade: 4 }, { quantidade: NaN as unknown as number }])).toBe(4)
  })

  it("resolveDepositoPrincipal prefere ativo", () => {
    const lista = [
      { id: "a", principal: false, ativo: true },
      { id: "b", principal: true, ativo: false },
      { id: "c", principal: true, ativo: true },
    ]
    expect(resolveDepositoPrincipal(lista)?.id).toBe("c")
    expect(resolveDepositoPrincipal([{ id: "x", principal: false, ativo: true }])).toBeNull()
  })

  it("assertStoreId lança sem fallback loja-1 (ADR-0003)", () => {
    expect(() => assertStoreId("")).toThrow(/storeId obrigat/i)
    expect(() => assertStoreId("   ")).toThrow()
    expect(() => assertStoreId(null)).toThrow()
    expect(assertStoreId(" loja-2 ")).toBe("loja-2")
  })
})

describe("ensureDepositoPrincipal — idempotente", () => {
  it("cria o Depósito Principal quando não existe", async () => {
    const { client, depositos } = makeFakeClient()
    const dep = await ensureDepositoPrincipal(client, "loja-1")
    expect(dep.codigo).toBe(DEPOSITO_PRINCIPAL_CODIGO)
    expect(dep.principal).toBe(true)
    expect(dep.storeId).toBe("loja-1")
    expect(depositos).toHaveLength(1)
  })

  it("não cria um segundo principal na 2ª chamada (idempotência)", async () => {
    const { client, depositos } = makeFakeClient()
    const a = await ensureDepositoPrincipal(client, "loja-1")
    const b = await ensureDepositoPrincipal(client, "loja-1")
    expect(a.id).toBe(b.id)
    expect(depositos).toHaveLength(1)
  })

  it("cria principais distintos por loja (isolamento multi-loja)", async () => {
    const { client, depositos } = makeFakeClient()
    await ensureDepositoPrincipal(client, "loja-1")
    await ensureDepositoPrincipal(client, "loja-2")
    expect(depositos).toHaveLength(2)
    expect(depositos.map((d) => d.storeId).sort()).toEqual(["loja-1", "loja-2"])
  })
})

describe("setEstoqueDeposito — upsert + isolamento", () => {
  it("cria e depois atualiza o saldo do produto no depósito", async () => {
    const seed = {
      depositos: [{ id: "dep-1", storeId: "loja-1", nome: "Principal", codigo: "PRINCIPAL", ativo: true, principal: true }],
      produtos: [{ id: "prod-1", storeId: "loja-1", stock: 0 }],
    }
    const { client, produtoDepositos } = makeFakeClient(seed)

    const c = await setEstoqueDeposito(client, { storeId: "loja-1", produtoId: "prod-1", depositoId: "dep-1", quantidade: 7 })
    expect(c.quantidade).toBe(7)
    expect(produtoDepositos).toHaveLength(1)

    const u = await setEstoqueDeposito(client, { storeId: "loja-1", produtoId: "prod-1", depositoId: "dep-1", quantidade: 3 })
    expect(u.quantidade).toBe(3)
    expect(produtoDepositos).toHaveLength(1) // upsert, não duplica
  })

  it("rejeita produto de outra loja (anti-vazamento cross-tenant)", async () => {
    const seed = {
      depositos: [{ id: "dep-1", storeId: "loja-1", nome: "Principal", codigo: "PRINCIPAL", ativo: true, principal: true }],
      produtos: [{ id: "prod-2", storeId: "loja-2", stock: 5 }],
    }
    const { client } = makeFakeClient(seed)
    await expect(
      setEstoqueDeposito(client, { storeId: "loja-1", produtoId: "prod-2", depositoId: "dep-1", quantidade: 1 }),
    ).rejects.toThrow(/Produto não encontrado nesta loja/i)
  })

  it("rejeita depósito de outra loja", async () => {
    const seed = {
      depositos: [{ id: "dep-2", storeId: "loja-2", nome: "Principal", codigo: "PRINCIPAL", ativo: true, principal: true }],
      produtos: [{ id: "prod-1", storeId: "loja-1", stock: 5 }],
    }
    const { client } = makeFakeClient(seed)
    await expect(
      setEstoqueDeposito(client, { storeId: "loja-1", produtoId: "prod-1", depositoId: "dep-2", quantidade: 1 }),
    ).rejects.toThrow(/Depósito não encontrado nesta loja/i)
  })

  it("rejeita quantidade negativa", async () => {
    const seed = {
      depositos: [{ id: "dep-1", storeId: "loja-1", nome: "Principal", codigo: "PRINCIPAL", ativo: true, principal: true }],
      produtos: [{ id: "prod-1", storeId: "loja-1", stock: 5 }],
    }
    const { client } = makeFakeClient(seed)
    await expect(
      setEstoqueDeposito(client, { storeId: "loja-1", produtoId: "prod-1", depositoId: "dep-1", quantidade: -1 }),
    ).rejects.toThrow(/inteiro >= 0/i)
  })
})

describe("getEstoqueAgregado / getEstoquePorDeposito", () => {
  it("agrega o saldo do produto em múltiplos depósitos da loja", async () => {
    const seed = {
      produtoDepositos: [
        { id: "pd-1", storeId: "loja-1", produtoId: "prod-1", depositoId: "dep-1", quantidade: 4 },
        { id: "pd-2", storeId: "loja-1", produtoId: "prod-1", depositoId: "dep-2", quantidade: 6 },
        { id: "pd-3", storeId: "loja-2", produtoId: "prod-1", depositoId: "dep-9", quantidade: 99 },
      ],
    }
    const { client } = makeFakeClient(seed)
    expect(await getEstoqueAgregado(client, "loja-1", "prod-1")).toBe(10) // não soma loja-2
    const porDep = await getEstoquePorDeposito(client, "loja-1", "prod-1")
    expect(porDep).toHaveLength(2)
  })

  it("getEstoqueAgregado exige storeId (sem fallback)", async () => {
    const { client } = makeFakeClient()
    await expect(getEstoqueAgregado(client, "", "prod-1")).rejects.toThrow(/storeId obrigat/i)
  })
})

describe("backfillLojaDepositoPrincipal", () => {
  it("cria principal + ProdutoDeposito a partir de Produto.stock", async () => {
    const seed = {
      produtos: [
        { id: "prod-1", storeId: "loja-1", stock: 12 },
        { id: "prod-2", storeId: "loja-1", stock: 0 },
        { id: "prod-9", storeId: "loja-2", stock: 50 }, // outra loja — não deve ser tocado
      ],
    }
    const { client, depositos, produtoDepositos } = makeFakeClient(seed)
    const res = await backfillLojaDepositoPrincipal(client, "loja-1")

    expect(res.produtosProcessados).toBe(2) // só loja-1
    expect(depositos.filter((d) => d.storeId === "loja-1")).toHaveLength(1)
    const loja1 = produtoDepositos.filter((pd) => pd.storeId === "loja-1")
    expect(loja1).toHaveLength(2)
    expect(loja1.find((pd) => pd.produtoId === "prod-1")?.quantidade).toBe(12)
    // a soma agregada espelha o Produto.stock (invariante Fase 1)
    expect(await getEstoqueAgregado(client, "loja-1", "prod-1")).toBe(12)
  })

  it("é idempotente / re-sincroniza ao Produto.stock", async () => {
    const seed = { produtos: [{ id: "prod-1", storeId: "loja-1", stock: 8 }] }
    const { client, produtoDepositos, produtos } = makeFakeClient(seed)
    await backfillLojaDepositoPrincipal(client, "loja-1")
    expect(produtoDepositos).toHaveLength(1)
    expect(produtoDepositos[0].quantidade).toBe(8)

    // muda o cache e re-roda: re-sincroniza, sem duplicar
    produtos[0].stock = 15
    await backfillLojaDepositoPrincipal(client, "loja-1")
    expect(produtoDepositos).toHaveLength(1)
    expect(produtoDepositos[0].quantidade).toBe(15)
  })
})
