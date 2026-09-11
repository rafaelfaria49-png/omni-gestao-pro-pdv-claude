/**
 * PDV-MOTOR-INTEGRITY-N1 — testes focados do vocabulário de integridade.
 *
 * Prova (nível decisão pura, harness `node`):
 * 1. CONFIRMED vs PENDING vs FAILED inequívocos sobre `{ ok, pending }`;
 * 2. PENDING nunca usa copy de sucesso definitivo;
 * 3. linha não resolvida bloqueia com nomes (todas as 5 superfícies ativas);
 * 4. item avulso / serviço / O.S. / acessório legítimo nunca bloqueia falso;
 * 5. confirmação posterior emite exatamente uma vez (retry idempotente).
 */
import { describe, expect, it } from "vitest"
import {
  FINALIZE_CONFIRMED,
  FINALIZE_FAILED,
  FINALIZE_PENDING,
  PENDING_SALE_TITLE,
  createConfirmedSaleEmitter,
  findUnresolvedSaleLines,
  formatUnresolvedSaleLines,
  postFinalizeDisposition,
  unresolvedSaleLinesDescription,
} from "./pdv-finalize-integrity"
import { avulsoInventoryId, servicoInventoryId } from "./os-pdv-virtual-lines"

const INVENTORY = ["prod-1", "prod-2"]

describe("postFinalizeDisposition — CONFIRMED / PENDING / FAILED", () => {
  it("sucesso server-side sem pendência é CONFIRMED", () => {
    expect(postFinalizeDisposition({ ok: true })).toBe(FINALIZE_CONFIRMED)
    expect(postFinalizeDisposition({ ok: true, pending: false })).toBe(FINALIZE_CONFIRMED)
  })

  it("timeout/rede/erro recuperável é PENDING, não sucesso definitivo", () => {
    expect(postFinalizeDisposition({ ok: true, pending: true })).toBe(FINALIZE_PENDING)
  })

  it("rejeição/pré-validação é FAILED", () => {
    expect(postFinalizeDisposition({ ok: false })).toBe(FINALIZE_FAILED)
  })

  it("copy de PENDING nunca promete sucesso definitivo", () => {
    expect(PENDING_SALE_TITLE).toContain("PENDENTE")
    expect(PENDING_SALE_TITLE.toLowerCase()).not.toContain("concluída")
    expect(PENDING_SALE_TITLE.toLowerCase()).not.toContain("finalizada")
  })
})

describe("findUnresolvedSaleLines — fail-closed por superfície", () => {
  it("Classic: fantasma bloqueia com nome; avulso e produto válido passam", () => {
    const out = findUnresolvedSaleLines(
      [
        { inventoryId: "prod-1", name: "Arroz" },
        { inventoryId: "ghost-999", name: "Fantasma" },
        { inventoryId: avulsoInventoryId("line-1"), name: "Item avulso", isAvulso: true },
      ],
      INVENTORY,
    )
    expect(out).toEqual([{ inventoryId: "ghost-999", name: "Fantasma" }])
    expect(unresolvedSaleLinesDescription(out)).toContain("Fantasma")
  })

  it("Assistência: serviço real nunca bloqueia falso", () => {
    const out = findUnresolvedSaleLines(
      [
        {
          inventoryId: servicoInventoryId("svc-1"),
          name: "Formatação",
          itemType: "servico",
          serviceId: "svc-1",
        } as never,
        { inventoryId: "prod-2", name: "Película" },
      ],
      INVENTORY,
    )
    expect(out).toEqual([])
  })

  it("Supermercado: produto por peso resolvido passa; item sem cadastro bloqueia", () => {
    const out = findUnresolvedSaleLines(
      [
        { inventoryId: "prod-1", name: "Banana kg" },
        { inventoryId: "sku-removido", name: "Iogurte" },
      ],
      INVENTORY,
    )
    expect(out.map((l) => l.inventoryId)).toEqual(["sku-removido"])
  })

  it("Venda Completa: linha virtual de O.S. e avulso passam; fantasma bloqueia", () => {
    const out = findUnresolvedSaleLines(
      [
        { inventoryId: "__os_servico__os-9", name: "Serviço O.S." },
        { inventoryId: avulsoInventoryId("x"), name: "Taxa", isAvulso: true },
        { inventoryId: "ghost-1", name: "Capa" },
      ],
      INVENTORY,
    )
    expect(out).toEqual([{ inventoryId: "ghost-1", name: "Capa" }])
  })

  it("Black/Next: guard existente preservado — lista nomes para correção", () => {
    const out = findUnresolvedSaleLines(
      [
        { inventoryId: "ghost-a", name: "Fone X" },
        { inventoryId: "ghost-b", name: "Cabo Y" },
      ],
      INVENTORY,
    )
    expect(formatUnresolvedSaleLines(out.map((l) => l.name))).toBe(
      "Sem cadastro no estoque desta loja: Fone X, Cabo Y. Remova o item da lista e tente novamente.",
    )
  })

  it("carrinho totalmente resolvido não bloqueia (sem falso-positivo)", () => {
    expect(
      findUnresolvedSaleLines(
        [
          { inventoryId: "prod-1", name: "A" },
          { inventoryId: "prod-2", name: "B" },
        ],
        INVENTORY,
      ),
    ).toEqual([])
  })
})

describe("createConfirmedSaleEmitter — exatamente uma vez", () => {
  it("retry da mesma pendência não duplica o efeito", () => {
    const emitted: string[] = []
    const emitOnce = createConfirmedSaleEmitter((key) => emitted.push(key))
    expect(emitOnce({ id: "PEND-cs_abc", clientSaleId: "cs_abc" })).toBe(true)
    expect(emitOnce({ id: "VDA-2026-0007", clientSaleId: "cs_abc" })).toBe(false)
    expect(emitted).toEqual(["cs_abc"])
  })

  it("vendas distintas emitem uma vez cada", () => {
    const emitted: string[] = []
    const emitOnce = createConfirmedSaleEmitter((key) => emitted.push(key))
    expect(emitOnce({ id: "VDA-2026-0001" })).toBe(true)
    expect(emitOnce({ id: "VDA-2026-0002" })).toBe(true)
    expect(emitOnce({ id: "VDA-2026-0001" })).toBe(false)
    expect(emitted).toEqual(["VDA-2026-0001", "VDA-2026-0002"])
  })
})
