/**
 * CORREÇÃO-01 — NO DUPLICATE AUTOMATION (create/replay/retry/abAs/reload).
 *
 * Prova, sobre o módulo puro `sale-automation-dispatch` (zero Prisma, executor
 * injetado), que a decisão de dispatch depende SOMENTE do flag durável
 * `replayed` do ponto create-vs-replay de `venda-persist` — nunca de Set em
 * memória, localStorage, BroadcastChannel, Web Locks ou flags de browser:
 *
 * 9.  primeira confirmação (create) dispara a automação uma vez;
 * 10. replay da mesma venda não redispara;
 * 11. retry da mesma clientSaleId não redispara (segunda chegada é replay);
 * 12. duas confirmações concorrentes geram UMA automação (vencedor create,
 *     perdedor replay via unique);
 * 13. reload/nova instância não depende de estado anterior (decisão pura);
 * 14. lojas A e B não compartilham chave de dedupe;
 * 15. falha da automação após venda confirmada não transforma a venda em erro.
 */
import { describe, expect, it, vi } from "vitest"
import {
  buildSaleAutomationDedupeKey,
  buildSaleFinalizadaPayload,
  dispatchSaleAutomationIfCreated,
  SALE_FINALIZADA_EVENT,
  shouldDispatchSaleAutomation,
} from "./sale-automation-dispatch"

const VENDA_A = {
  storeId: "loja-a",
  pedidoId: "VDA-RC01-2026-000123",
  clientSaleId: "cs_test_abc12345",
  total: 150.5,
}

describe("shouldDispatchSaleAutomation — decisão pura sobre o flag durável", () => {
  it("create (replayed=false) dispara", () => {
    expect(shouldDispatchSaleAutomation(false)).toBe(true)
  })

  it("replay (replayed=true) nunca dispara", () => {
    expect(shouldDispatchSaleAutomation(true)).toBe(false)
  })

  it("a decisão não depende de chamadas anteriores (sem estado de instância)", () => {
    // Simula reload: "nova instância" decide igual, só pelo flag.
    expect(shouldDispatchSaleAutomation(false)).toBe(true)
    expect(shouldDispatchSaleAutomation(true)).toBe(false)
    expect(shouldDispatchSaleAutomation(false)).toBe(true)
    expect(shouldDispatchSaleAutomation(true)).toBe(false)
  })
})

describe("dispatchSaleAutomationIfCreated — primeira confirmação dispara uma vez", () => {
  it("create chama o executor uma vez com venda_finalizada + storeId + entityId", async () => {
    const run = vi.fn(async (_event: unknown, _payload: unknown): Promise<void> => undefined)
    const out = await dispatchSaleAutomationIfCreated(
      { replayed: false, storeId: VENDA_A.storeId, venda: VENDA_A },
      run,
    )
    expect(out).toEqual({ dispatched: true })
    expect(run).toHaveBeenCalledTimes(1)
    const [event, payload] = run.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(event).toBe(SALE_FINALIZADA_EVENT)
    expect(event).toBe("venda_finalizada")
    expect(payload.storeId).toBe("loja-a")
    // entityId = identidade técnica quando há clientSaleId.
    expect(payload.entityId).toBe("cs_test_abc12345")
  })
})

describe("dispatchSaleAutomationIfCreated — replay/retry/concorrência nunca redisparam", () => {
  it("replay da mesma venda não executa o executor", async () => {
    const run = vi.fn(async (_event: unknown, _payload: unknown): Promise<void> => undefined)
    const out = await dispatchSaleAutomationIfCreated(
      { replayed: true, storeId: VENDA_A.storeId, venda: VENDA_A },
      run,
    )
    expect(out).toEqual({ dispatched: false })
    expect(run).not.toHaveBeenCalled()
  })

  it("retry da mesma clientSaleId: create + replay = UMA automação no total", async () => {
    const run = vi.fn(async (_event: unknown, _payload: unknown): Promise<void> => undefined)
    // Primeira chegada: create durável (unique livre) → dispara.
    const first = await dispatchSaleAutomationIfCreated(
      { replayed: false, storeId: VENDA_A.storeId, venda: VENDA_A },
      run,
    )
    // Retry/reenvio: a rota reencontra (storeId, clientSaleId) → replay → pula.
    const second = await dispatchSaleAutomationIfCreated(
      { replayed: true, storeId: VENDA_A.storeId, venda: VENDA_A },
      run,
    )
    expect(first).toEqual({ dispatched: true })
    expect(second).toEqual({ dispatched: false })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it("duas confirmações concorrentes: vencedor create dispara, perdedor replay não", async () => {
    const run = vi.fn(async (_event: unknown, _payload: unknown): Promise<void> => undefined)
    // Duas abas postam a MESMA venda ao mesmo tempo. O banco serializa na
    // unique (storeId, clientSaleId): um create vence, o outro vira replay
    // (VendaClientKeyUniqueConflict → lookup → replayed=true).
    const winner = await dispatchSaleAutomationIfCreated(
      { replayed: false, storeId: VENDA_A.storeId, venda: VENDA_A },
      run,
    )
    const loser = await dispatchSaleAutomationIfCreated(
      { replayed: true, storeId: VENDA_A.storeId, venda: VENDA_A },
      run,
    )
    expect(winner).toEqual({ dispatched: true })
    expect(loser).toEqual({ dispatched: false })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it("reload: mesma venda após reload chega como replay e não redispara", async () => {
    const run = vi.fn(async (_event: unknown, _payload: unknown): Promise<void> => undefined)
    // Estado em memória zerado (nova instância). A venda já existe no banco,
    // então a rota classifica como replay — a decisão continua correta sem
    // nenhum Set anterior.
    const afterReload = await dispatchSaleAutomationIfCreated(
      { replayed: true, storeId: VENDA_A.storeId, venda: VENDA_A },
      run,
    )
    expect(afterReload).toEqual({ dispatched: false })
    expect(run).not.toHaveBeenCalled()
    // Venda genuinamente nova após reload continua disparando normalmente.
    const fresh = await dispatchSaleAutomationIfCreated(
      {
        replayed: false,
        storeId: VENDA_A.storeId,
        venda: { ...VENDA_A, pedidoId: "VDA-RC01-2026-000124", clientSaleId: "cs_test_nova67890" },
      },
      run,
    )
    expect(fresh).toEqual({ dispatched: true })
    expect(run).toHaveBeenCalledTimes(1)
  })
})

describe("buildSaleAutomationDedupeKey — multiloja e identidade mínima", () => {
  it("lojas A e B não compartilham chave (mesmo clientSaleId)", () => {
    const keyA = buildSaleAutomationDedupeKey({ storeId: "loja-a", clientSaleId: "cs_igual_12345" })
    const keyB = buildSaleAutomationDedupeKey({ storeId: "loja-b", clientSaleId: "cs_igual_12345" })
    expect(keyA).not.toBeNull()
    expect(keyB).not.toBeNull()
    expect(keyA).not.toBe(keyB)
    expect(keyA).toContain("loja-a")
    expect(keyB).toContain("loja-b")
  })

  it("clientSaleId tem precedência; pedidoId é fallback do fluxo V1", () => {
    expect(
      buildSaleAutomationDedupeKey({ storeId: "s", clientSaleId: "cs_x_12345678", pedidoId: "VDA-2026-0001" }),
    ).toBe("s::cs_x_12345678")
    expect(buildSaleAutomationDedupeKey({ storeId: "s", pedidoId: "VDA-2026-0001" })).toBe(
      "s::VDA-2026-0001",
    )
  })

  it("sem storeId ou sem identidade não há chave — caller não dispara", async () => {
    expect(buildSaleAutomationDedupeKey({ storeId: "", clientSaleId: "cs_x_12345678" })).toBeNull()
    expect(buildSaleAutomationDedupeKey({ storeId: "s" })).toBeNull()
    const run = vi.fn(async (_event: unknown, _payload: unknown): Promise<void> => undefined)
    const out = await dispatchSaleAutomationIfCreated(
      { replayed: false, storeId: "", venda: { storeId: "", pedidoId: "" } },
      run,
    )
    expect(out).toEqual({ dispatched: false })
    expect(run).not.toHaveBeenCalled()
  })

  it("duas vendas novas de lojas distintas disparam uma vez cada (sem cruzamento)", async () => {
    const run = vi.fn(async (_event: unknown, _payload: unknown): Promise<void> => undefined)
    const a = await dispatchSaleAutomationIfCreated(
      { replayed: false, storeId: "loja-a", venda: { ...VENDA_A, storeId: "loja-a" } },
      run,
    )
    const b = await dispatchSaleAutomationIfCreated(
      { replayed: false, storeId: "loja-b", venda: { ...VENDA_A, storeId: "loja-b" } },
      run,
    )
    expect(a).toEqual({ dispatched: true })
    expect(b).toEqual({ dispatched: true })
    expect(run).toHaveBeenCalledTimes(2)
    const stores = run.mock.calls.map((call) => (call[1] as Record<string, unknown>).storeId)
    expect(stores).toEqual(["loja-a", "loja-b"])
  })
})

describe("buildSaleFinalizadaPayload — entityId e multiloja", () => {
  it("prefere clientSaleId e carrega storeId explícito", () => {
    const payload = buildSaleFinalizadaPayload("loja-a", VENDA_A)
    expect(payload.storeId).toBe("loja-a")
    expect(payload.entityId).toBe("cs_test_abc12345")
  })

  it("fluxo V1 sem clientSaleId usa o pedidoId como entityId", () => {
    const payload = buildSaleFinalizadaPayload("loja-a", { pedidoId: "VDA-2026-0007" })
    expect(payload.entityId).toBe("VDA-2026-0007")
  })
})

describe("dispatchSaleAutomationIfCreated — falha da automação não quebra a venda", () => {
  it("executor lança → dispatched=false, sem throw (a venda segue confirmada)", async () => {
    const run = vi.fn(async () => {
      throw new Error("WhatsApp fora do ar")
    })
    const onError = vi.fn()
    let threw = false
    let out: { dispatched: boolean } = { dispatched: true }
    try {
      out = await dispatchSaleAutomationIfCreated(
        { replayed: false, storeId: VENDA_A.storeId, venda: VENDA_A },
        run,
        onError,
      )
    } catch {
      threw = true
    }
    expect(threw).toBe(false)
    expect(out).toEqual({ dispatched: false })
    expect(onError).toHaveBeenCalledTimes(1)
    // O caller (rota) retorna a venda confirmada do mesmo jeito — persistência
    // financeira continua autoridade primária.
  })
})
