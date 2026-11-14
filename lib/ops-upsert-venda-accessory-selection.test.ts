/**
 * PDV-ACESSORIOS-SELECAO-PERSISTENCIA-SERVER-004B
 *
 * Cobre o saneamento server-side de `accessorySelection`/`cartLineKey` dentro de
 * `upsertVendaInTransaction` (§ saneamento server-side, ver `lib/vendas/sanitize-sale-line-payload.ts`):
 *  - seleção válida é persistida saneada em `Venda.payload.lines[]`;
 *  - seleção inválida é descartada com warning — nunca bloqueia a venda;
 *  - `cartLineKey` nunca chega ao payload persistido, mesmo enviada pelo client;
 *  - `ItemVenda` continua com o contrato de 6 colunas (sem vazar campos novos);
 *  - duas linhas do mesmo produto com seleções diferentes preservam ambas no payload
 *    e continuam agregando um único lançamento de estoque pelo produto real;
 *  - compatibilidade com vendas antigas (sem accessorySelection) e idempotência de retry.
 *
 * Mesmo padrão de TransactionClient fake em memória do `ops-upsert-venda.test.ts`
 * (vitest roda em `node`; nenhuma dependência de `@/lib/prisma`/`@/generated/prisma`).
 */
import { describe, expect, it, vi } from "vitest"
import { upsertVendaInTransaction, type SalePayload } from "./ops-upsert-venda"
import { attachStockLedgerBoundaryToFakeTx } from "./estoque/stock-ledger-test-fake"

type FakeProduct = {
  id: string
  storeId: string
  stock: number
  precoCusto: number
  sku: string | null
  barcode: string | null
  name: string
}

function proj(p: FakeProduct) {
  return { id: p.id, stock: p.stock, precoCusto: p.precoCusto, sku: p.sku, name: p.name }
}

function makeFakeTx(products: FakeProduct[]) {
  const byId = new Map(products.map((p) => [p.id, p]))
  const ledger: Array<Record<string, unknown>> = []
  const itemVendaCreates: Array<Record<string, unknown>> = []
  const vendaWrites: Array<Record<string, unknown>> = []
  let vendaCounter = 0

  const tx: any = {
    cliente: { findFirst: async () => null },
    venda: {
      // Guard de colisão entre lojas (PDV-PEDIDO-ID-COLISAO-MULTILOJA-FIX-001): fake sem
      // vendas pré-existentes → nenhum `pedidoId` tem dono, o guard passa direto.
      findUnique: async () => null,
      create: async ({ data }: any) => {
        vendaWrites.push(data)
        return {
          id: `venda-${++vendaCounter}`,
          ...data,
          terminalId: data.terminalId ?? null,
          status: "concluida",
        }
      },
      update: async () => ({}),
    },
    itemVenda: {
      deleteMany: async () => ({ count: 0 }),
      create: async ({ data }: any) => {
        itemVendaCreates.push(data)
        return data
      },
    },
    produto: {
      findFirst: async ({ where }: any) => {
        const ors: Array<Record<string, string>> = where.OR ?? []
        for (const p of products) {
          if (p.storeId !== where.storeId) continue
          for (const cond of ors) {
            if (cond.id !== undefined && p.id === cond.id) return proj(p)
            if (cond.sku !== undefined && p.sku === cond.sku) return proj(p)
            if (cond.barcode !== undefined && p.barcode === cond.barcode) return proj(p)
          }
        }
        return null
      },
      findUnique: async ({ where }: any) => {
        const p = byId.get(where.id)
        return p ? { stock: p.stock, precoCusto: p.precoCusto } : null
      },
      updateMany: async ({ where, data }: any) => {
        const p = byId.get(where.id)
        if (!p || p.storeId !== where.storeId) return { count: 0 }
        const gte = where.stock?.gte
        if (typeof gte === "number" && p.stock < gte) return { count: 0 }
        p.stock -= data.stock?.decrement ?? 0
        return { count: 1 }
      },
      update: async ({ where, data }: any) => {
        const p = byId.get(where.id)
        if (p && data.stock?.decrement != null) p.stock -= data.stock.decrement
        return p ?? {}
      },
    },
    movimentacaoEstoque: {
      findFirst: async ({ where }: any) =>
        ledger.find(
          (m) => m.storeId === where.storeId && m.documento === where.documento && m.produtoId === where.produtoId,
        ) ?? null,
      create: async ({ data }: any) => {
        ledger.push(data)
        return data
      },
    },
    movimentacaoFinanceira: {
      findFirst: async () => null,
      create: async ({ data }: any) => data,
    },
  }

  // CAD-R2-009: boundary canônico (lock + depósito + ledger + idempotência).
  attachStockLedgerBoundaryToFakeTx(tx, { products, ledger })

  return {
    tx,
    byId,
    ledger,
    itemVendaCreates,
    lastPayload: () => vendaWrites[vendaWrites.length - 1]?.payload as SalePayload | undefined,
  }
}

const STORE = "loja-1"
function produto(over: Partial<FakeProduct> = {}): FakeProduct {
  return {
    id: "prod-1",
    storeId: STORE,
    stock: 5,
    precoCusto: 10,
    sku: "SKU-1",
    barcode: null,
    name: "Capinha",
    ...over,
  }
}

describe("upsertVendaInTransaction — saneamento de accessorySelection (004B)", () => {
  it("persiste accessorySelection saneada em Venda.payload.lines[] (label do client não é confiado)", async () => {
    const { tx, lastPayload } = makeFakeTx([produto()])
    const sale: SalePayload = {
      id: "PED-1",
      total: 25,
      paymentBreakdown: { dinheiro: 25 },
      lines: [
        {
          inventoryId: "prod-1",
          name: "Capinha — Samsung Galaxy A06 — Preto",
          quantity: 1,
          unitPrice: 25,
          lineTotal: 25,
          accessorySelection: {
            version: 1,
            deviceModelKey: "samsung_galaxy_a06",
            colorKey: "preto",
            colorLabel: "rótulo forjado",
          },
        },
      ],
    }

    await upsertVendaInTransaction(tx, STORE, sale)

    expect(lastPayload()?.lines?.[0]?.accessorySelection).toEqual({
      version: 1,
      deviceModelKey: "samsung_galaxy_a06",
      colorKey: "preto",
      colorLabel: "Preto",
    })
  })

  it("descarta seleção inválida sem bloquear a venda e sem lançar erro", async () => {
    const { tx, lastPayload } = makeFakeTx([produto()])
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const sale: SalePayload = {
      id: "PED-2",
      total: 25,
      paymentBreakdown: { dinheiro: 25 },
      lines: [
        {
          inventoryId: "prod-1",
          name: "Capinha",
          quantity: 1,
          unitPrice: 25,
          lineTotal: 25,
          // @ts-expect-error -- seleção deliberadamente inválida (versão desconhecida) para o teste
          accessorySelection: { version: 99 },
        },
      ],
    }

    await expect(upsertVendaInTransaction(tx, STORE, sale)).resolves.toMatchObject({ replayed: false })
    expect(lastPayload()?.lines?.[0]).not.toHaveProperty("accessorySelection")
    expect(warn).toHaveBeenCalledWith(
      "[upsert-venda] accessory-selection-invalida",
      expect.stringContaining("ACCESSORY_SELECTION_INVALID_DROPPED"),
    )
    warn.mockRestore()
  })

  it("nunca persiste cartLineKey, mesmo quando o client envia", async () => {
    const { tx, lastPayload } = makeFakeTx([produto()])
    const sale: SalePayload = {
      id: "PED-3",
      total: 25,
      paymentBreakdown: { dinheiro: 25 },
      lines: [
        {
          inventoryId: "prod-1",
          name: "Capinha",
          quantity: 1,
          unitPrice: 25,
          lineTotal: 25,
          // @ts-expect-error -- cartLineKey não faz parte do contrato server-side (proposital no teste)
          cartLineKey: '["prod-1","samsung_galaxy_a06","preto",""]',
        },
      ],
    }

    await upsertVendaInTransaction(tx, STORE, sale)
    expect(lastPayload()?.lines?.[0]).not.toHaveProperty("cartLineKey")
  })

  it("ItemVenda mantém o contrato de 6 colunas — accessorySelection/cartLineKey não vazam", async () => {
    const { tx, itemVendaCreates } = makeFakeTx([produto()])
    const sale: SalePayload = {
      id: "PED-4",
      total: 25,
      paymentBreakdown: { dinheiro: 25 },
      lines: [
        {
          inventoryId: "prod-1",
          name: "Capinha — Preto",
          quantity: 1,
          unitPrice: 25,
          lineTotal: 25,
          accessorySelection: { version: 1, colorKey: "preto" },
        },
      ],
    }

    await upsertVendaInTransaction(tx, STORE, sale)
    expect(Object.keys(itemVendaCreates[0]!).sort()).toEqual(
      ["inventoryId", "lineTotal", "nome", "precoUnitario", "quantidade", "vendaId"].sort(),
    )
  })

  it("duas linhas do mesmo produto com seleções diferentes preservam ambas e agregam 1 lançamento de estoque", async () => {
    const { tx, byId, ledger, lastPayload } = makeFakeTx([produto({ stock: 5 })])
    const sale: SalePayload = {
      id: "PED-5",
      total: 50,
      paymentBreakdown: { dinheiro: 50 },
      lines: [
        {
          inventoryId: "prod-1",
          name: "Capinha — Preto",
          quantity: 1,
          unitPrice: 25,
          lineTotal: 25,
          accessorySelection: { version: 1, colorKey: "preto" },
        },
        {
          inventoryId: "prod-1",
          name: "Capinha — Azul",
          quantity: 1,
          unitPrice: 25,
          lineTotal: 25,
          accessorySelection: { version: 1, colorKey: "azul" },
        },
      ],
    }

    await upsertVendaInTransaction(tx, STORE, sale, undefined, { enforceStock: true })

    expect(byId.get("prod-1")!.stock).toBe(3)
    expect(ledger).toHaveLength(1)
    expect(ledger[0]!.quantidade).toBe(-2)

    const lines = lastPayload()?.lines ?? []
    expect(lines).toHaveLength(2)
    expect(lines[0]?.accessorySelection?.colorKey).toBe("preto")
    expect(lines[1]?.accessorySelection?.colorKey).toBe("azul")
  })

  it("venda sem nenhuma accessorySelection (payload antigo) continua aceita normalmente", async () => {
    const { tx, lastPayload } = makeFakeTx([produto()])
    const sale: SalePayload = {
      id: "PED-6",
      total: 25,
      paymentBreakdown: { dinheiro: 25 },
      lines: [{ inventoryId: "prod-1", name: "Produto comum", quantity: 1, unitPrice: 25, lineTotal: 25 }],
    }

    await expect(upsertVendaInTransaction(tx, STORE, sale)).resolves.toMatchObject({ replayed: false })
    expect(lastPayload()?.lines?.[0]).not.toHaveProperty("accessorySelection")
  })

  it("retry idempotente: reenviar a mesma venda mantém accessorySelection persistida sem duplicar estoque", async () => {
    const { tx, byId, ledger, lastPayload } = makeFakeTx([produto({ stock: 5 })])
    const sale: SalePayload = {
      id: "PED-7",
      total: 25,
      paymentBreakdown: { dinheiro: 25 },
      lines: [
        {
          inventoryId: "prod-1",
          name: "Capinha — Preto",
          quantity: 1,
          unitPrice: 25,
          lineTotal: 25,
          accessorySelection: { version: 1, colorKey: "preto" },
        },
      ],
    }

    await upsertVendaInTransaction(tx, STORE, sale, undefined, { enforceStock: true })
    await upsertVendaInTransaction(tx, STORE, sale, undefined, { enforceStock: true })

    expect(byId.get("prod-1")!.stock).toBe(4)
    expect(ledger).toHaveLength(1)
    expect(lastPayload()?.lines?.[0]?.accessorySelection).toEqual({ version: 1, colorKey: "preto", colorLabel: "Preto" })
  })
})

/**
 * COMPAT-PROFISSIONAL-001 — cor padrão desativada pela loja é recusada no SERVIDOR só na
 * FINALIZAÇÃO AO VIVO sinalizada pelo PDV (`finalizacaoAoVivo`). Reenvio da fila (com ou sem
 * `registeredOffline`), venda registrada offline, reenvio de venda gravada e histórico seguem
 * aceitos. O relógio do PDV não participa da decisão (revisão independente).
 */
describe("upsertVendaInTransaction — cor padrão desativada pela loja", () => {
  const AO_VIVO = { enforceStock: true, finalizacaoAoVivo: true } as const
  const REENVIO = { enforceStock: true } as const
  function comCorDesativada(products: FakeProduct[]) {
    const fake = makeFakeTx(products)
    const inativas: Array<{ storeId: string; baseKey: string; updatedAt: Date }> = []
    // Como o banco: a venda gravada é encontrada de novo pelo `pedidoId` (caminho de replay real).
    const gravadas = new Map<string, any>()
    const create = fake.tx.venda.create
    fake.tx.venda.create = async (args: any) => {
      const row = await create(args)
      gravadas.set(row.pedidoId, { ...row, itens: [] })
      return row
    }
    fake.tx.venda.findUnique = async ({ where }: any) => gravadas.get(where.pedidoId) ?? null
    fake.tx.compatCorLoja = {
      findMany: async ({ where }: any) =>
        inativas.filter((c) => c.storeId === where.storeId && where.ativo === false && where.baseKey.in.includes(c.baseKey)),
    }
    // Banco real: a tabela existe (to_regclass) — o guard consulta antes, sem abortar a transação.
    fake.tx.$queryRaw = async () => [{ ok: true }]
    return {
      ...fake,
      desativar: (baseKey: string, storeId = STORE) => inativas.push({ storeId, baseKey, updatedAt: new Date() }),
    }
  }
  const venda = (id: string, atMs: number, colorKey: string, extra: Record<string, unknown> = {}, saleExtra: Record<string, unknown> = {}) =>
    ({
      id,
      at: new Date(atMs).toISOString(),
      total: 25,
      paymentBreakdown: { dinheiro: 25 },
      lines: [
        { inventoryId: "prod-1", name: "Capinha", quantity: 1, unitPrice: 25, lineTotal: 25, accessorySelection: { version: 1, colorKey, ...extra } },
      ],
      ...saleExtra,
    }) as SalePayload
  const MIN = 60 * 1000

  it("recusa a finalização ao vivo com cor desativada, antes de qualquer efeito", async () => {
    const { tx, byId, ledger, lastPayload, desativar } = comCorDesativada([produto({ stock: 5 })])
    desativar("fume")
    await expect(upsertVendaInTransaction(tx, STORE, venda("PED-C1", Date.now(), "fume"), undefined, AO_VIVO)).rejects.toThrow(
      /Fumê.*desativada/,
    )
    expect(lastPayload()).toBeUndefined()
    expect(byId.get("prod-1")!.stock).toBe(5)
    expect(ledger).toHaveLength(0)
  })

  it("relógio do PDV não decide: atrasado 11 min ou adiantado, a finalização ao vivo continua recusada", async () => {
    const { tx, desativar } = comCorDesativada([produto({ stock: 5 })])
    desativar("fume")
    await expect(upsertVendaInTransaction(tx, STORE, venda("PED-C2", Date.now() - 11 * MIN, "fume"), undefined, AO_VIVO)).rejects.toThrow(/desativada/)
    await expect(upsertVendaInTransaction(tx, STORE, venda("PED-C3", Date.now() + 60 * MIN, "fume"), undefined, AO_VIVO)).rejects.toThrow(/desativada/)
  })

  it("aceita reenvio da fila SEM registeredOffline (falha de rede na finalização), mesmo 2 min depois", async () => {
    const { tx, byId, desativar } = comCorDesativada([produto({ stock: 5 })])
    desativar("fume")
    await expect(upsertVendaInTransaction(tx, STORE, venda("PED-C4", Date.now() - 2 * MIN, "fume"), undefined, REENVIO)).resolves.toMatchObject({
      replayed: false,
    })
    expect(byId.get("prod-1")!.stock).toBe(4)
  })

  it("aceita venda REGISTRADA OFFLINE mesmo se a requisição vier marcada como finalização", async () => {
    const { tx, byId, desativar } = comCorDesativada([produto({ stock: 5 })])
    desativar("fume")
    await expect(
      upsertVendaInTransaction(tx, STORE, venda("PED-C5", Date.now(), "fume", {}, { registeredOffline: true }), undefined, AO_VIVO),
    ).resolves.toMatchObject({ replayed: false })
    expect(byId.get("prod-1")!.stock).toBe(4)
  })

  it("reenvio de venda já gravada não é revalidado (histórico intacto); cor de outra loja não pesa", async () => {
    const { tx, byId, ledger, desativar } = comCorDesativada([produto({ stock: 5 })])
    desativar("preto", "outra-loja")
    const v = venda("PED-C6", Date.now(), "fume")
    await upsertVendaInTransaction(tx, STORE, v, undefined, AO_VIVO)
    desativar("fume")
    await expect(upsertVendaInTransaction(tx, STORE, v, undefined, AO_VIVO)).resolves.toMatchObject({ replayed: true })
    await upsertVendaInTransaction(tx, STORE, venda("PED-C7", Date.now(), "preto"), undefined, AO_VIVO)
    expect(byId.get("prod-1")!.stock).toBe(3)
    expect(ledger).toHaveLength(2)
  })

  it("'Outra' (texto livre / cor própria da loja) não é afetada", async () => {
    const { tx, desativar } = comCorDesativada([produto({ stock: 5 })])
    desativar("fume")
    await expect(
      upsertVendaInTransaction(tx, STORE, venda("PED-C8", Date.now(), "outra", { customColorLabel: "Fumê" }), undefined, AO_VIVO),
    ).resolves.toMatchObject({ replayed: false })
  })

  it("tabela ausente (migration não aplicada): confere com to_regclass e NÃO consulta a tabela", async () => {
    const { tx, byId, desativar } = comCorDesativada([produto({ stock: 5 })])
    desativar("fume")
    let consultou = false
    tx.compatCorLoja.findMany = async () => {
      consultou = true
      throw Object.assign(new Error("relation does not exist"), { code: "P2021" })
    }
    tx.$queryRaw = async () => [{ ok: false }]
    await upsertVendaInTransaction(tx, STORE, venda("PED-C9", Date.now(), "fume"), undefined, AO_VIVO)
    expect(consultou).toBe(false)
    expect(byId.get("prod-1")!.stock).toBe(4)
  })
})
