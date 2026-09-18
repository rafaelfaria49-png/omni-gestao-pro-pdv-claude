import { describe, expect, it } from "vitest"

import {
  canStartIndividualQuarantineRecovery,
  classifySaleWriterCapability,
  extractConfirmedVenda,
  IDEMPOTENCY_KEY_REUSED,
  INDIVIDUAL_QUARANTINE_RECOVERY_UNAVAILABLE,
  SALE_WRITER_V1_ACTIVE,
  shouldFallbackV2ToV1,
} from "./sale-client-sync"

describe("shouldFallbackV2ToV1", () => {
  it("só cai para V1 quando o servidor declara SALE_WRITER_V1_ACTIVE", () => {
    expect(shouldFallbackV2ToV1({ code: SALE_WRITER_V1_ACTIVE, httpStatus: 409 })).toBe(true)
  })

  it("capability unknown NÃO vira V1", () => {
    expect(shouldFallbackV2ToV1({ capability: "unknown" })).toBe(false)
  })

  it("erro de rede NÃO vira V1", () => {
    expect(shouldFallbackV2ToV1({ networkError: true, code: SALE_WRITER_V1_ACTIVE })).toBe(false)
  })

  it("erro de numeração NÃO vira V1", () => {
    expect(shouldFallbackV2ToV1({ code: "SALE_NUMBERING_NOT_CONFIGURED", httpStatus: 409 })).toBe(false)
    expect(shouldFallbackV2ToV1({ code: "SALE_SEQUENCE_EXHAUSTED", httpStatus: 409 })).toBe(false)
    expect(shouldFallbackV2ToV1({ code: "SALE_NUMBERING_INVARIANT_BROKEN", httpStatus: 409 })).toBe(false)
  })

  it("IDEMPOTENCY_KEY_REUSED NÃO vira V1", () => {
    expect(shouldFallbackV2ToV1({ code: IDEMPOTENCY_KEY_REUSED, httpStatus: 409 })).toBe(false)
  })
})

describe("classifySaleWriterCapability", () => {
  it("aceita apenas writer v1/v2 explícitos", () => {
    expect(classifySaleWriterCapability({ writer: "v2" })).toBe("v2")
    expect(classifySaleWriterCapability({ writer: "v1" })).toBe("v1")
    expect(classifySaleWriterCapability({ writer: "auto" })).toBe("unknown")
    expect(classifySaleWriterCapability(null)).toBe("unknown")
    expect(classifySaleWriterCapability({})).toBe("unknown")
  })
})

describe("extractConfirmedVenda", () => {
  it("exige pedidoId e id técnicos", () => {
    expect(extractConfirmedVenda({ venda: { id: "x" } })).toBeNull()
    expect(
      extractConfirmedVenda({
        venda: { id: "cuid_1", pedidoId: "VDA-RC02-2026-000001", clientSaleId: "cs_localattempt01" },
      }),
    ).toMatchObject({
      id: "cuid_1",
      pedidoId: "VDA-RC02-2026-000001",
      clientSaleId: "cs_localattempt01",
    })
  })
})

describe("canStartIndividualQuarantineRecovery", () => {
  it("Writer V1 / unknown / null não inicia o fluxo individual", () => {
    expect(canStartIndividualQuarantineRecovery(false)).toBe(false)
    expect(canStartIndividualQuarantineRecovery(null)).toBe(false)
    expect(canStartIndividualQuarantineRecovery(undefined)).toBe(false)
  })

  it("Writer V2 habilitado permite abrir o fluxo individual", () => {
    expect(canStartIndividualQuarantineRecovery(true)).toBe(true)
  })

  it("expõe a mensagem operacional do botão individual", () => {
    expect(INDIVIDUAL_QUARANTINE_RECOVERY_UNAVAILABLE).toBe(
      "Recuperação indisponível enquanto a numeração server-side não estiver ativa.",
    )
  })
})

describe("parseSalePersistError", () => {
  it("extrai STOCK_INVARIANT_DRIFT de 500 legado sem code", async () => {
    const { parseSalePersistError } = await import("./sale-client-sync")
    const parsed = parseSalePersistError(
      JSON.stringify({
        error: "[ops/venda-persist/v2] loja-1 [upsert-venda] baixa de estoque falhou: STOCK_INVARIANT_DRIFT Divergência estrutural: SUM(depósitos)=5 != Produto.stock=4.",
      }),
    )
    expect(parsed.code).toBe("STOCK_INVARIANT_DRIFT")
  })

  it("preserva diagnóstico estruturado de drift", async () => {
    const { parseSalePersistError } = await import("./sale-client-sync")
    const parsed = parseSalePersistError(
      JSON.stringify({
        error: "Divergência estrutural",
        code: "STOCK_INVARIANT_DRIFT",
        produtoId: "prod-1",
        produtoNome: "Película 20",
        produtoSku: "SKU-20",
        stock: 7,
        somaDepositos: 0,
        gap: -7,
        depositoId: "dep-1",
        depositoQuantidade: 0,
        requestedQty: 1,
        driftReason: "unmaterialized_zero",
        depositCount: 1,
        lastLedgerEstoqueDepois: 7,
        authority: "livro-casa-com-stock+deposito-zero",
      }),
    )
    expect(parsed.code).toBe("STOCK_INVARIANT_DRIFT")
    expect(parsed.drift?.produtoNome).toBe("Película 20")
    expect(parsed.drift?.stock).toBe(7)
    expect(parsed.drift?.somaDepositos).toBe(0)
  })

  it("preserva diagnóstico estruturado de drift no 409", async () => {
    const { parseSalePersistError } = await import("./sale-client-sync")
    const parsed = parseSalePersistError(
      JSON.stringify({
        error: "Divergência estrutural: SUM(depósitos)=0 != Produto.stock=7.",
        code: "STOCK_INVARIANT_DRIFT",
        produtoId: "prod-1",
        produtoNome: "Película",
        produtoSku: "SKU-20",
        stock: 7,
        somaDepositos: 0,
        gap: -7,
        depositoId: "dep-1",
        depositoQuantidade: 0,
        requestedQty: 1,
        driftReason: "unmaterialized_zero",
        depositCount: 1,
        lastLedgerEstoqueDepois: 7,
        authority: "livro-casa-com-stock+deposito-zero",
      }),
    )
    expect(parsed.code).toBe("STOCK_INVARIANT_DRIFT")
    expect(parsed.drift).toMatchObject({
      produtoId: "prod-1",
      produtoNome: "Película",
      stock: 7,
      somaDepositos: 0,
      driftReason: "unmaterialized_zero",
    })
  })
})
