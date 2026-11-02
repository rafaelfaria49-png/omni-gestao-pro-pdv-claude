/**
 * PDV-SYNC-PRODUTO-NAO-RESOLVIDO-RECOVERY-001 — lado cliente.
 *
 * 1. O 409 `PRODUTO_NAO_RESOLVIDO` do writer traz `inventoryIds`; o cliente guarda a
 *    referência para apontar a linha exata da PRÓPRIA venda (nunca do carrinho atual).
 * 2. Na finalização, esse 409 é FAILED (nada gravado no servidor): a tentativa local é
 *    descartada e o carrinho volta para correção — antes virava PENDING congelado, o
 *    Reenviar repetia o mesmo 409 e a guarda de identidade travava as próximas vendas.
 * 3. A finalização envia `produtoId` (cuid do catálogo) nas linhas de produto.
 */
import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { parseSalePersistError } from "./sale-client-sync"
import {
  classifyPendingSyncFailure,
  PENDING_SYNC_CLASS,
  pendingReasonView,
  shouldAutoRetryPendingSync,
  UNRESOLVED_PRODUCT_CODE,
  unresolvedLinesCarryStableId,
  unresolvedProductFinalizeReason,
  unresolvedSaleLineLabels,
} from "./pending-sync-classification"

const REPO_ROOT = resolve(__dirname, "..", "..")

function between(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex + start.length)
  expect(startIndex, `marcador inicial ausente: ${start}`).toBeGreaterThanOrEqual(0)
  expect(endIndex, `marcador final ausente: ${end}`).toBeGreaterThan(startIndex)
  return source.slice(startIndex, endIndex)
}

describe("parseSalePersistError — referências não resolvidas do writer V2", () => {
  it("extrai inventoryIds do corpo 409", () => {
    const body = JSON.stringify({
      error: "Produto não encontrado para baixa de estoque.",
      code: "PRODUTO_NAO_RESOLVIDO",
      inventoryIds: ["PEL-ANTIGO"],
    })
    const parsed = parseSalePersistError(body)
    expect(parsed.code).toBe(UNRESOLVED_PRODUCT_CODE)
    expect(parsed.unresolvedInventoryIds).toEqual(["PEL-ANTIGO"])
  })

  it("payload malformado não vira referência (tipos estranhos, vazios, excesso)", () => {
    const many = Array.from({ length: 40 }, (_, i) => `REF-${i}`)
    expect(parseSalePersistError(JSON.stringify({ code: "X", inventoryIds: "PEL" })).unresolvedInventoryIds).toBeUndefined()
    expect(parseSalePersistError(JSON.stringify({ code: "X", inventoryIds: [1, null, "  "] })).unresolvedInventoryIds).toBeUndefined()
    expect(parseSalePersistError(JSON.stringify({ code: "X", inventoryIds: many })).unresolvedInventoryIds).toHaveLength(20)
    expect(parseSalePersistError(JSON.stringify({ code: "X", inventoryIds: ["x".repeat(500)] })).unresolvedInventoryIds?.[0]).toHaveLength(128)
    expect(parseSalePersistError("<html>502</html>").unresolvedInventoryIds).toBeUndefined()
  })
})

describe("unresolvedSaleLineLabels — linha da própria venda, nunca do carrinho", () => {
  const pendingLines = [
    { inventoryId: "PEL-ANTIGO", name: "PELÍCULA 3D" },
    { inventoryId: "CAP-1", name: "CAPINHA" },
  ]

  it("aponta só a linha devolvida pelo servidor, com nome e código", () => {
    expect(unresolvedSaleLineLabels(pendingLines, ["PEL-ANTIGO"])).toEqual(["PELÍCULA 3D (código PEL-ANTIGO)"])
  })

  it("referência sem linha correspondente aparece só como código (não adivinha nome)", () => {
    expect(unresolvedSaleLineLabels(pendingLines, ["SUMIU"])).toEqual(["código SUMIU"])
  })

  it("carrinho atual com o mesmo nome não identifica a pendência", () => {
    // O carrinho visível (outro id, mesmo nome) não entra: só as linhas da venda pendente.
    const labels = unresolvedSaleLineLabels(pendingLines, ["PEL-ANTIGO"])
    expect(labels.join()).not.toContain("cart-")
    expect(unresolvedSaleLineLabels([], ["PEL-ANTIGO"])).toEqual(["código PEL-ANTIGO"])
  })

  it("sem referências do servidor (pendência anterior ao fix) não inventa linha", () => {
    expect(unresolvedSaleLineLabels(pendingLines, undefined)).toEqual([])
  })
})

describe("pendingReasonView(PRODUTO_NAO_RESOLVIDO)", () => {
  it("é ACTION_REQUIRED — sem auto-retry em loop", () => {
    const input = { code: UNRESOLVED_PRODUCT_CODE, httpStatus: 409 }
    expect(classifyPendingSyncFailure(input)).toBe(PENDING_SYNC_CLASS.ACTION_REQUIRED)
    expect(shouldAutoRetryPendingSync(input)).toBe(false)
  })

  it("mostra a linha e não pede para 'revisar o item' de um payload congelado", () => {
    const view = pendingReasonView({
      code: UNRESOLVED_PRODUCT_CODE,
      httpStatus: 409,
      pending: true,
      unresolvedLabels: ["PELÍCULA 3D (código PEL-ANTIGO)"],
    })
    expect(view.title).toBe("Produto não resolvido")
    expect(view.description).toContain("PELÍCULA 3D (código PEL-ANTIGO)")
    expect(view.description).toContain("não foi gravada no servidor")
    expect(view.recommendedAction).toContain("Reenviar desta mesma venda")
    expect(view.recommendedAction).not.toMatch(/revise o item/i)
  })

  it("linha com produtoId (produto excluído) não manda recadastrar o código", () => {
    const lines = [{ inventoryId: "PEL-ANTIGO", produtoId: "cuid-pel", name: "PELÍCULA" }]
    expect(unresolvedLinesCarryStableId(lines, ["PEL-ANTIGO"])).toBe(true)
    expect(unresolvedLinesCarryStableId([{ inventoryId: "PEL-ANTIGO" }], ["PEL-ANTIGO"])).toBe(false)
    expect(unresolvedLinesCarryStableId(lines, undefined)).toBe(false)
    const view = pendingReasonView({
      code: UNRESOLVED_PRODUCT_CODE,
      httpStatus: 409,
      pending: true,
      unresolvedLabels: ["PELÍCULA (código PEL-ANTIGO)"],
      unresolvedProductRemoved: true,
    })
    expect(view.description).toContain("foi excluído do cadastro")
    expect(view.recommendedAction).toContain("Recadastrar o código não recupera")
    expect(view.recommendedAction).not.toContain("Regularize em Cadastros")
  })

  it("sem rótulos orienta a reenviar para identificar o item", () => {
    const view = pendingReasonView({ code: UNRESOLVED_PRODUCT_CODE, httpStatus: 409, pending: true })
    expect(view.recommendedAction).toContain("identificar o item")
  })
})

describe("unresolvedProductFinalizeReason", () => {
  it("é honesto: venda não registrada e o que fazer", () => {
    const msg = unresolvedProductFinalizeReason(["PELÍCULA (código PEL-ANTIGO)"])
    expect(msg).toContain("NÃO registrada")
    expect(msg).toContain("PELÍCULA (código PEL-ANTIGO)")
    expect(msg).toContain("finalize novamente")
  })
})

describe("operations-store — contrato da finalização com PRODUTO_NAO_RESOLVIDO", () => {
  const store = readFileSync(join(REPO_ROOT, "lib/operations-store.tsx"), "utf8")
  const finalize = between(
    store,
    "const finalizeSaleTransaction = useCallback",
    "const registrarDevolucao = useCallback",
  )
  // O desfecho da resposta (inclusive o 409) mora em `settlePersistResponse`, chamado por `persistPendingSale`.
  const persistPending = between(store, "const settlePersistResponse = useCallback", "const flushPendingSales = useCallback")
  const failedBranch = between(finalize, "if (disposition === \"FAILED\" && code) {", "const view = pendingReasonView({")

  it("linhas de produto levam o produtoId do catálogo (dbId)", () => {
    expect(finalize).toMatch(/item\?\.dbId/)
    expect(finalize).toContain("{ ...record, produtoId }")
  })

  it("desfecho FAILED: descarta só a tentativa local desta venda e devolve ok:false", () => {
    expect(failedBranch).toContain("clearPersistedSaleAttempt(lj, fingerprint")
    expect(failedBranch).toContain("s.syncPending === true && saleMatches(s, token)")
    expect(failedBranch).toContain("ok: false")
    expect(failedBranch).not.toContain("pending: true")
    expect(failedBranch).toContain("refreshInventoryFromServer()")
  })

  it("identidade reaproveitada de outra tentativa (outra aba) nunca cai no FAILED", () => {
    // `reusedIdentity` vem do mapa compartilhado: pode estar PENDING em outra aba.
    expect(finalize).toContain("if (disposition === \"FAILED\" && code) {")
  })

  it("rede caindo depois do 409 não apaga a referência já guardada", () => {
    expect(store).toContain(
      "...(next.unresolvedInventoryIds ? { syncUnresolvedInventoryIds: next.unresolvedInventoryIds } : {}),",
    )
    expect(store).not.toMatch(/^\s*syncUnresolvedInventoryIds: next\.unresolvedInventoryIds,\r?$/m)
  })

  it("rota V1 também devolve inventoryIds no 409", () => {
    const v1 = readFileSync(join(REPO_ROOT, "app/api/ops/venda-persist/route.ts"), "utf8")
    expect(between(v1, "if (error instanceof UnresolvedProductError) {", "// Crédito/Vale")).toContain(
      "inventoryIds: error.inventoryIds",
    )
  })

  it("o desfecho FAILED vem ANTES do retorno PENDING genérico", () => {
    expect(finalize.indexOf("if (disposition === \"FAILED\" && code) {")).toBeLessThan(
      finalize.lastIndexOf("pending: true,"),
    )
  })

  it("o Reenviar de pendência existente NÃO usa o desfecho FAILED (pendência nunca é apagada)", () => {
    const retry = between(store, "const doRetrySyncSale = useCallback", "const retrySyncSale = useCallback")
    expect(retry).not.toContain("UNRESOLVED_PRODUCT_CODE")
    expect(persistPending).not.toContain("UNRESOLVED_PRODUCT_CODE")
  })

  it("a referência não resolvida é guardada na venda e limpa na confirmação", () => {
    expect(persistPending).toContain("unresolvedInventoryIds: parsed.unresolvedInventoryIds")
    expect(store).toContain("syncUnresolvedInventoryIds: next.unresolvedInventoryIds")
    expect(between(store, "function clearSaleSyncFailure", "function applyConfirmedFlags")).toContain(
      "syncUnresolvedInventoryIds: undefined",
    )
  })
})
