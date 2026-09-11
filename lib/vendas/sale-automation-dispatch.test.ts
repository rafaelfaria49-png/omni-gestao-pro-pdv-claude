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

describe("CORREÇÃO-02 — paridade de payload (PAYLOAD-PARITY)", () => {
  const DEFAULT_TEMPLATE =
    "Venda realizada no valor de {{total}}. Obrigado pela compra, {{customerName}}! Qualquer dúvida estamos à disposição."

  function renderTemplate(template: string, payload: { data?: unknown }): string {
    const data = (payload.data ?? {}) as Record<string, unknown>
    return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
      const val = data[key]
      if (val === undefined || val === null) return ""
      if (
        typeof val === "number" &&
        (key === "total" || key === "totalFinal" || key === "valor" || key === "totalPago")
      ) {
        return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      }
      return String(val)
    })
  }

  it("1 & 2. payload contém customerName e template padrão resolve customerName", () => {
    const venda = {
      ...VENDA_A,
      total: 250,
      clienteNome: "Maria da Silva",
    }
    const payload = buildSaleFinalizadaPayload("loja-a", venda)
    const data = payload.data as Record<string, unknown>
    expect(data.customerName).toBe("Maria da Silva")
    expect(data.id).toBe(VENDA_A.pedidoId)
    expect(data.pedidoId).toBe(VENDA_A.pedidoId)

    const rendered = renderTemplate(DEFAULT_TEMPLATE, payload)
    expect(rendered).toContain("Maria da Silva")
    expect(rendered).toContain("250")
    expect(rendered).toBe(
      `Venda realizada no valor de ${(250).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}. Obrigado pela compra, Maria da Silva! Qualquer dúvida estamos à disposição.`,
    )
  })

  it("2a. consumidor final sem nome: customerName ausente e template não quebra", () => {
    const venda = {
      ...VENDA_A,
      clienteNome: null,
      customerName: undefined,
    }
    const payload = buildSaleFinalizadaPayload("loja-a", venda, { customerName: "" })
    const data = payload.data as Record<string, unknown>
    expect(data.customerName).toBeUndefined()
    const rendered = renderTemplate(DEFAULT_TEMPLATE, payload)
    expect(rendered).toContain("Obrigado pela compra, !")
  })

  it("2b. cliente cadastrado com caracteres especiais: preserva acentos e símbolos no template", () => {
    const nomeEspecial = "José d'Ávila & Filhos / LTDA (São Paulo) - <Filial>"
    const payload = buildSaleFinalizadaPayload("loja-a", VENDA_A, { customerName: nomeEspecial })
    const data = payload.data as Record<string, unknown>
    expect(data.customerName).toBe(nomeEspecial)
    const rendered = renderTemplate(DEFAULT_TEMPLATE, payload)
    expect(rendered).toContain(nomeEspecial)
  })

  it("3. payload preserva customerCpf e clienteId", () => {
    const payload = buildSaleFinalizadaPayload("loja-a", VENDA_A, {
      customerCpf: "12345678909",
      clienteId: "cli_cuid_987654",
    })
    const data = payload.data as Record<string, unknown>
    expect(data.customerCpf).toBe("12345678909")
    expect(data.clienteId).toBe("cli_cuid_987654")
  })

  it("4. payload preserva paymentBreakdown sem recalcular valores", () => {
    const pb = {
      dinheiro: 50.5,
      pix: 100,
      cartaoDebito: 0,
      cartaoCredito: 0,
      carne: 0,
      aPrazo: 0,
      creditoVale: 0,
    }
    const payload = buildSaleFinalizadaPayload("loja-a", VENDA_A, { paymentBreakdown: pb })
    const data = payload.data as Record<string, unknown>
    expect(data.paymentBreakdown).toEqual(pb)
  })

  it("5. payload preserva lines com saneamento de acessórios e sem cartLineKey", () => {
    const rawLines = [
      {
        inventoryId: "prod-capa-01",
        name: "Capa Protetora",
        quantity: 2,
        unitPrice: 35,
        cartLineKey: "temp_cart_key_123", // deve ser removido defensivamente
        accessorySelection: {
          version: 1 as const,
          deviceModelKey: "apple:iphone-15-pro",
          deviceModelName: "iPhone 15 Pro",
          colorKey: "preto" as const,
        },
      },
      {
        inventoryId: "prod-pelicula-02",
        name: "Película 3D",
        quantity: 1,
        unitPrice: 25,
        isAvulso: false,
      },
    ]
    const payload = buildSaleFinalizadaPayload("loja-a", VENDA_A, { lines: rawLines })
    const data = payload.data as Record<string, unknown>
    const lines = data.lines as Array<Record<string, unknown>>
    expect(lines).toHaveLength(2)
    expect(lines[0].inventoryId).toBe("prod-capa-01")
    expect(lines[0].name).toBe("Capa Protetora")
    expect(lines[0].quantity).toBe(2)
    expect(lines[0].unitPrice).toBe(35)
    // cartLineKey removida
    expect(lines[0].cartLineKey).toBeUndefined()
    // accessorySelection preservada round-trip
    expect(lines[0].accessorySelection).toMatchObject({
      version: 1,
      deviceModelKey: "apple:iphone-15-pro",
      deviceModelName: "iPhone 15 Pro",
      colorKey: "preto",
    })
    expect(lines[1].inventoryId).toBe("prod-pelicula-02")
    expect(lines[1].name).toBe("Película 3D")
  })

  it("6. payload preserva at, cashierId, sessaoId, terminalId", () => {
    const payload = buildSaleFinalizadaPayload(
      "loja-a",
      {
        ...VENDA_A,
        at: "2026-09-11T18:00:00.000Z",
        terminalId: "PDV-01",
      },
      {
        cashierId: "op-caixa-42",
        sessaoId: "sessao-caixa-999",
      },
    )
    const data = payload.data as Record<string, unknown>
    expect(data.at).toBe("2026-09-11T18:00:00.000Z")
    expect(data.terminalId).toBe("PDV-01")
    expect(data.cashierId).toBe("op-caixa-42")
    expect(data.sessaoId).toBe("sessao-caixa-999")
  })

  it("7. payload preserva pixQrKind e cashTendered quando presentes", () => {
    const payload = buildSaleFinalizadaPayload("loja-a", VENDA_A, {
      pixQrKind: "ESTATICO",
      cashTendered: 160.0,
    })
    const data = payload.data as Record<string, unknown>
    expect(data.pixQrKind).toBe("ESTATICO")
    expect(data.cashTendered).toBe(160.0)
  })

  it("8. campos opcionais ausentes continuam opcionais (não emite chaves vazias)", () => {
    const payload = buildSaleFinalizadaPayload("loja-a", { pedidoId: "VDA-0001" })
    const data = payload.data as Record<string, unknown>
    expect(data.pedidoId).toBe("VDA-0001")
    expect(data.id).toBe("VDA-0001")
    expect(data.clientSaleId).toBeUndefined()
    expect(data.customerName).toBeUndefined()
    expect(data.customerCpf).toBeUndefined()
    expect(data.clienteId).toBeUndefined()
    expect(data.paymentBreakdown).toBeUndefined()
    expect(data.lines).toBeUndefined()
    expect(data.cashierId).toBeUndefined()
    expect(data.sessaoId).toBeUndefined()
    expect(data.terminalId).toBeUndefined()
    expect(data.pixQrKind).toBeUndefined()
    expect(data.cashTendered).toBeUndefined()
    expect(data.syncPending).toBeUndefined()
    expect(data.syncBlockedCode).toBeUndefined()
  })

  it("auditoria de destinatário: phoneDigits e contactId NÃO faziam parte do contrato real anterior", () => {
    // RECIPIENT_PARITY = PREEXISTING_LIMITATION
    // O browser anterior postava saleRow em data, e saleRow nunca teve phoneDigits nem contactId.
    // O motor server-side usava targetPhone da automação do HUB ou caía em automation_fired_no_recipient.
    const payload = buildSaleFinalizadaPayload("loja-a", VENDA_A)
    const data = payload.data as Record<string, unknown>
    expect(data.phoneDigits).toBeUndefined()
    expect(data.contactId).toBeUndefined()
  })

  it("dispatch integrado: create passa contexto de sale e template é resolvido pelo runner", async () => {
    let capturedPayload: Record<string, unknown> | null = null
    const run = vi.fn(async (_event: unknown, p: unknown) => {
      capturedPayload = p as Record<string, unknown>
    })
    const out = await dispatchSaleAutomationIfCreated(
      {
        replayed: false,
        storeId: "loja-a",
        venda: { ...VENDA_A, clienteNome: "Carlos Santos" },
        sale: {
          customerCpf: "11122233344",
          total: 150.5,
          paymentBreakdown: { pix: 150.5 },
        },
      },
      run,
    )
    expect(out.dispatched).toBe(true)
    expect(run).toHaveBeenCalledTimes(1)
    expect(capturedPayload).not.toBeNull()
    const rendered = renderTemplate(DEFAULT_TEMPLATE, capturedPayload!)
    expect(rendered).toContain("Carlos Santos")
  })

  it("replay não redispara template nem executa runner", async () => {
    const run = vi.fn(async () => undefined)
    const out = await dispatchSaleAutomationIfCreated(
      {
        replayed: true,
        storeId: "loja-a",
        venda: { ...VENDA_A, clienteNome: "Carlos Santos" },
        sale: { customerName: "Carlos Santos" },
      },
      run,
    )
    expect(out.dispatched).toBe(false)
    expect(run).not.toHaveBeenCalled()
  })
})
