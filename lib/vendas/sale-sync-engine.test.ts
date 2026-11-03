// @vitest-environment jsdom
/** PDV-OFFLINE-SYNC-CONFIABILIDADE-E2E-001 — motor puro de sincronização. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { SaleRecord } from "@/lib/operations-sale-types"
import {
  AUTH_REQUIRED,
  INCONCLUSIVE_RESPONSE,
  OFFLINE_CODE,
  PERMISSION_DENIED,
  SaleSyncTimeoutError,
  addSaleTombstone,
  crossTabSaleKey,
  dropTombstonedPending,
  nextResultUnknown,
  attemptOutcomeFromFailure,
  authFailureCode,
  autoRetryDelayMs,
  confirmedSaleEvidence,
  deriveConnectivity,
  fetchTextWithTimeout,
  mergeSalesFromOtherTab,
  offlinePaymentBlockReason,
  operatorSaleSyncView,
  readSaleTombstones,
  withSaleSyncLock,
} from "./sale-sync-engine"
import { classifyPendingSyncFailure, PENDING_SYNC_CLASS, pendingReasonView } from "./pending-sync-classification"

const pb = (over: Partial<SaleRecord["paymentBreakdown"]> = {}): SaleRecord["paymentBreakdown"] => ({
  dinheiro: 0, pix: 0, cartaoDebito: 0, cartaoCredito: 0, carne: 0, aPrazo: 0, creditoVale: 0, ...over,
})
const sale = (over: Partial<SaleRecord> = {}): SaleRecord => ({
  id: "PEND-cs_a", clientSaleId: "cs_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", at: "2026-11-02T12:00:00.000Z", lines: [], total: 10,
  paymentBreakdown: pb({ dinheiro: 10 }), syncPending: true, ...over,
})

describe("fetchTextWithTimeout — requisição pendurada nunca deixa o botão inerte", () => {
  it("corpo completo dentro do prazo", async () => {
    const res = await fetchTextWithTimeout("/x", {}, 1000, async () => new Response("ok", { status: 201 }))
    expect(res).toEqual({ ok: true, status: 201, text: "ok" })
  })
  it("prazo estourado vira SaleSyncTimeoutError (resultado desconhecido) e aborta o fetch", async () => {
    let aborted = false
    const hang = (_: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          aborted = true
          reject(new DOMException("aborted", "AbortError"))
        })
      })
    await expect(fetchTextWithTimeout("/x", {}, 20, hang)).rejects.toBeInstanceOf(SaleSyncTimeoutError)
    expect(aborted).toBe(true)
  })
  it("erro de rede sobe como veio (não é confundido com prazo)", async () => {
    await expect(fetchTextWithTimeout("/x", {}, 1000, async () => { throw new TypeError("Failed to fetch") })).rejects.toBeInstanceOf(TypeError)
  })
})

describe("confirmedSaleEvidence — sincronizada só com prova do servidor", () => {
  const venda = { id: "srv-1", pedidoId: "VDA-1", storeId: "loja-a", clientSaleId: "cs_1", total: 10, at: "x", status: "concluida" }
  it("aceita a venda da MESMA loja e MESMA identidade", () => {
    expect(confirmedSaleEvidence(JSON.stringify({ ok: true, venda }), { lojaId: "loja-a", clientSaleId: "cs_1" })?.pedidoId).toBe("VDA-1")
  })
  it.each([
    ["HTML de portal cativo", "<html>login do Wi-Fi</html>"],
    ["JSON sem venda", JSON.stringify({ ok: true })],
    ["venda sem pedidoId", JSON.stringify({ venda: { id: "srv-1" } })],
    ["venda de outra loja", JSON.stringify({ venda: { ...venda, storeId: "loja-b" } })],
    ["outra identidade", JSON.stringify({ venda: { ...venda, clientSaleId: "cs_2" } })],
    ["corpo vazio", ""],
  ])("%s não confirma", (_label, body) => {
    expect(confirmedSaleEvidence(body, { lojaId: "loja-a", clientSaleId: "cs_1" })).toBeNull()
  })
})

describe("classificação dos códigos novos", () => {
  it("401/403 sem código de negócio", () => {
    expect(authFailureCode(401)).toBe(AUTH_REQUIRED)
    expect(authFailureCode(403)).toBe(PERMISSION_DENIED)
    expect(authFailureCode(409)).toBeUndefined()
  })
  it("sessão expirada, inconclusivo e sem conexão voltam a tentar; sem permissão exige ação", () => {
    expect(classifyPendingSyncFailure({ code: AUTH_REQUIRED, httpStatus: 401 })).toBe(PENDING_SYNC_CLASS.AUTO_RETRY)
    expect(classifyPendingSyncFailure({ code: INCONCLUSIVE_RESPONSE, httpStatus: 200 })).toBe(PENDING_SYNC_CLASS.AUTO_RETRY)
    expect(classifyPendingSyncFailure({ code: OFFLINE_CODE })).toBe(PENDING_SYNC_CLASS.AUTO_RETRY)
    expect(classifyPendingSyncFailure({ code: PERMISSION_DENIED, httpStatus: 403 })).toBe(PENDING_SYNC_CLASS.ACTION_REQUIRED)
  })
  it.each([
    ["PRODUTO_NAO_RESOLVIDO", "Produto não resolvido"],
    ["ESTOQUE_INSUFICIENTE", "Estoque insuficiente"],
    ["STOCK_INVARIANT_DRIFT", "Estoque divergente"],
    ["CAIXA_FECHADO", "Sessão de caixa inválida"],
    ["SESSAO_INVALIDA", "Sessão de caixa inválida"],
    ["CAIXA_ORIGINAL_FECHADO", "Caixa original fechado"],
    ["PAGAMENTOS_TOTAL_DIVERGENTE", "Pagamento divergente"],
    ["CREDITO_VALE_INSUFICIENTE", "Crédito/vale insuficiente"],
    ["CLIENT_SALE_ID_REQUIRED", "Identificação da venda recusada"],
    ["IDEMPOTENCY_CONFLICT", "Identificação da venda recusada"],
    ["IDEMPOTENCY_KEY_REUSED", "Identificação da venda recusada"],
    ["PEDIDO_ID_CONFLITO_MESMA_LOJA", "Conflito de identidade"],
    ["PEDIDO_ID_DE_OUTRA_LOJA", "Conflito de identidade"],
    [AUTH_REQUIRED, "Sessão expirada"],
    [PERMISSION_DENIED, "Sem permissão"],
    [INCONCLUSIVE_RESPONSE, "Resposta sem confirmação"],
  ])("%s tem mensagem específica e acionável", (code, title) => {
    const view = pendingReasonView({ code, httpStatus: code === AUTH_REQUIRED ? 401 : 409, pending: true })
    expect(view.title).toContain(title)
    expect(view.recommendedAction.length).toBeGreaterThan(10)
  })
  it("desfecho da tentativa", () => {
    expect(attemptOutcomeFromFailure({ networkError: true, timedOut: true })).toBe("SEM_RESPOSTA")
    // Só o navegador offline prova que nada saiu; com o navegador "online" o resultado é desconhecido.
    expect(attemptOutcomeFromFailure({ networkError: true, offline: true })).toBe("SEM_CONEXAO")
    expect(attemptOutcomeFromFailure({ networkError: true })).toBe("SEM_RESPOSTA")
    expect(attemptOutcomeFromFailure({ httpStatus: 503 })).toBe("SERVIDOR_INDISPONIVEL")
    expect(attemptOutcomeFromFailure({ code: "ESTOQUE_INSUFICIENTE", httpStatus: 409 })).toBe("REJEITADA")
    expect(attemptOutcomeFromFailure({ code: "CAIXA_ORIGINAL_FECHADO", httpStatus: 409 })).toBe("EXIGE_CORRECAO")
    expect(attemptOutcomeFromFailure({ code: "PEDIDO_ID_CONFLITO_MESMA_LOJA", httpStatus: 409 })).toBe("QUARENTENA")
    expect(attemptOutcomeFromFailure({ code: AUTH_REQUIRED, httpStatus: 401 })).toBe("SESSAO_EXPIRADA")
  })
})

describe("backoff e conectividade", () => {
  it("backoff dobra até 5 min e respeita o tipo", () => {
    expect(autoRetryDelayMs(1, "network")).toBe(15_000)
    expect(autoRetryDelayMs(2, "server")).toBe(60_000)
    expect(autoRetryDelayMs(30, "auth")).toBe(300_000)
  })
  it("navigator.onLine=true não prova conexão: falha recente do backend = servidor inacessível", () => {
    const now = 1_000_000
    expect(deriveConnectivity({ navigatorOnline: false, lastFailureAt: null, lastSuccessAt: now, now })).toBe("offline")
    expect(deriveConnectivity({ navigatorOnline: true, lastFailureAt: now - 1000, lastSuccessAt: now - 5000, now })).toBe("servidor_inacessivel")
    expect(deriveConnectivity({ navigatorOnline: true, lastFailureAt: now - 5000, lastSuccessAt: now - 1000, now })).toBe("online")
    expect(deriveConnectivity({ navigatorOnline: true, lastFailureAt: now - 10 * 60_000, lastSuccessAt: null, now })).toBe("desconhecida")
  })
  it("crédito/vale, a prazo e carnê bloqueados offline; dinheiro/Pix/cartão passam como declarados", () => {
    expect(offlinePaymentBlockReason(pb({ creditoVale: 5 }))).toMatch(/crédito\/vale/)
    expect(offlinePaymentBlockReason(pb({ aPrazo: 5 }))).toMatch(/a prazo/)
    expect(offlinePaymentBlockReason(pb({ carne: 5 }))).toMatch(/carnê/)
    expect(offlinePaymentBlockReason(pb({ dinheiro: 5, pix: 5, cartaoCredito: 5, cartaoDebito: 5 }))).toBeNull()
  })
})

describe("operatorSaleSyncView — estado inequívoco para o operador", () => {
  it.each([
    ["confirmada", sale({ syncPending: false }), {}, "CONFIRMADA", "sim"],
    ["nunca tentada", sale(), {}, "REGISTRADA_LOCALMENTE", "desconhecido"],
    ["offline, nunca enviada", sale(), { offline: true }, "AGUARDANDO_CONEXAO", "nao"],
    ["verificando", sale(), { phase: "verificando" as const }, "VERIFICANDO_SERVIDOR", "desconhecido"],
    ["enviando", sale(), { phase: "enviando" as const }, "ENVIANDO", "desconhecido"],
    ["rede caiu", sale({ syncNetworkError: true, syncAttemptCount: 1, syncLastAttemptAt: "x" }), {}, "AGUARDANDO_CONEXAO", "desconhecido"],
    ["recusada", sale({ syncBlockedCode: "ESTOQUE_INSUFICIENTE", syncHttpStatus: 409, syncAttemptCount: 1 }), {}, "REJEITADA", "nao"],
    ["exige correção", sale({ syncBlockedCode: "CAIXA_ORIGINAL_FECHADO", syncHttpStatus: 409, syncAttemptCount: 1 }), {}, "EXIGE_CORRECAO", "nao"],
    ["quarentena", sale({ syncBlockedCode: "PEDIDO_ID_CONFLITO_MESMA_LOJA" }), {}, "QUARENTENA", "desconhecido"],
  ])("%s", (_l, s, ctx, status, server) => {
    const view = operatorSaleSyncView(s, ctx)
    expect(view.status).toBe(status)
    expect(view.serverHasSale).toBe(server)
  })
})

describe("mergeSalesFromOtherTab — fila entre abas por união monotônica", () => {
  const CS_A = "cs_" + "a".repeat(32)
  const CS_B = "cs_" + "b".repeat(32)
  const a = sale({ id: "PEND-a", clientSaleId: CS_A })
  const b = sale({ id: "PEND-b", clientSaleId: CS_B })
  it("pendência que só a outra aba conhece entra; nada daqui sai", () => {
    const merged = mergeSalesFromOtherTab([a], [b], new Set())
    expect(merged.map((s) => s.clientSaleId)).toEqual([CS_A, CS_B])
    expect(mergeSalesFromOtherTab([a, b], [], new Set())).toHaveLength(2)
  })
  it("confirmação da outra aba vence a pendência daqui (mesma clientSaleId, id novo)", () => {
    const merged = mergeSalesFromOtherTab([a], [{ ...a, id: "VDA-9", syncPending: false }], new Set())
    expect(merged).toEqual([{ ...a, id: "VDA-9", syncPending: false }])
  })
  it("pendência da outra aba nunca desfaz confirmação daqui", () => {
    const confirmed = { ...a, id: "VDA-9", syncPending: false }
    const local = [confirmed]
    expect(mergeSalesFromOtherTab(local, [a], new Set())).toBe(local)
  })
  it("lápide impede ressuscitar venda descartada com prova", () => {
    expect(mergeSalesFromOtherTab([a], [b], new Set([CS_B]))).toEqual([a])
  })
  it("mesma referência quando nada muda; entradas inválidas ignoradas", () => {
    const local = [a]
    expect(mergeSalesFromOtherTab(local, [a, null, 3, { id: "" }], new Set())).toBe(local)
  })
})

describe("lápides persistidas", () => {
  beforeEach(() => localStorage.clear())
  it("grava por identidade e id, expira em 7 dias", () => {
    const now = Date.parse("2026-11-02T12:00:00Z")
    const cs = "cs_" + "x".repeat(32)
    addSaleTombstone("loja-a", { id: "PEND-x", clientSaleId: cs, at: "2026-11-02T10:00:00.000Z" }, now)
    expect(readSaleTombstones("loja-a", now).has(cs)).toBe(true)
    // O id provisório sozinho não vira lápide (seria ambíguo).
    expect(readSaleTombstones("loja-a", now).has("PEND-x")).toBe(false)
    expect(readSaleTombstones("loja-b", now).size).toBe(0)
    expect(readSaleTombstones("loja-a", now + 8 * 24 * 60 * 60_000).size).toBe(0)
  })
})

describe("lápides e chave entre abas (revisão independente P0/P1)", () => {
  const CS = "cs_" + "e".repeat(32)
  it("V1 sem clientSaleId: a chave inclui o instante — VDA reaproveitado não casa a venda nova", () => {
    const antiga = sale({ id: "VDA-2026-0007", clientSaleId: undefined, at: "2026-11-02T10:00:00.000Z" })
    const nova = sale({ id: "VDA-2026-0007", clientSaleId: undefined, at: "2026-11-02T10:05:00.000Z" })
    expect(crossTabSaleKey(antiga)).not.toBe(crossTabSaleKey(nova))
    expect(dropTombstonedPending([nova], new Set([crossTabSaleKey(antiga)]))).toHaveLength(1)
    // Confirmada de outra aba com o mesmo VDA mas outro instante não substitui a pendente daqui.
    const merged = mergeSalesFromOtherTab([nova], [{ ...antiga, syncPending: false }], new Set())
    expect(merged.find((s) => s.at === nova.at)?.syncPending).toBe(true)
  })
  it("pendente adotada com lápide sai; a tentativa aberta nesta aba fica; confirmada nunca sai", () => {
    const adotada = sale({ id: "PEND-1", clientSaleId: CS })
    const tomb = new Set([CS])
    expect(dropTombstonedPending([adotada], tomb)).toEqual([])
    expect(dropTombstonedPending([adotada], tomb, () => true)).toHaveLength(1)
    const list = [{ ...adotada, syncPending: false }]
    expect(dropTombstonedPending(list, tomb)).toBe(list)
  })
  it("dúvida sobre gravação: rede online/prazo/5xx/inconclusivo acumulam; recusa de negócio zera; offline não cria", () => {
    expect(nextResultUnknown(false, { networkError: true })).toBe(true)
    expect(nextResultUnknown(false, { networkError: true, offline: true })).toBe(false)
    expect(nextResultUnknown(true, { networkError: true, offline: true })).toBe(true)
    expect(nextResultUnknown(false, { timedOut: true, networkError: true })).toBe(true)
    expect(nextResultUnknown(false, { httpStatus: 502 })).toBe(true)
    expect(nextResultUnknown(false, { httpStatus: 200, code: INCONCLUSIVE_RESPONSE })).toBe(true)
    expect(nextResultUnknown(true, { httpStatus: 409, code: "ESTOQUE_INSUFICIENTE" })).toBe(false)
    expect(nextResultUnknown(true, { httpStatus: 401, code: AUTH_REQUIRED })).toBe(true)
  })
})

describe("withSaleSyncLock — single-flight entre abas", () => {
  afterEach(() => vi.unstubAllGlobals())
  function fakeLocks() {
    const held = new Set<string>()
    const waiters = new Map<string, Array<() => void>>()
    return {
      request: async (name: string, opts: { ifAvailable?: boolean; signal?: AbortSignal }, cb: (lock: unknown) => Promise<unknown>) => {
        if (held.has(name)) {
          if (opts.ifAvailable) return cb(null)
          await new Promise<void>((resolve, reject) => {
            const list = waiters.get(name) ?? []
            list.push(resolve)
            waiters.set(name, list)
            opts.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))
          })
        }
        held.add(name)
        try {
          return await cb({ name })
        } finally {
          held.delete(name)
          waiters.get(name)?.shift()?.()
        }
      },
    }
  }
  it("try: com outra aba enviando, não executa", async () => {
    vi.stubGlobal("navigator", { ...navigator, locks: fakeLocks() })
    let release!: () => void
    const first = withSaleSyncLock("l", "try", () => new Promise<number>((r) => { release = () => r(1) }))
    const second = await withSaleSyncLock("l", "try", async () => 2)
    expect(second).toEqual({ acquired: false })
    release()
    expect(await first).toEqual({ acquired: true, value: 1 })
  })
  it("wait: espera a outra aba e então executa", async () => {
    vi.stubGlobal("navigator", { ...navigator, locks: fakeLocks() })
    let release!: () => void
    const first = withSaleSyncLock("l", "try", () => new Promise<number>((r) => { release = () => r(1) }))
    const second = withSaleSyncLock("l", "wait", async () => 2, 5_000)
    release()
    await first
    expect(await second).toEqual({ acquired: true, value: 2 })
  })
  it("wait: prazo de espera estourado não executa", async () => {
    vi.stubGlobal("navigator", { ...navigator, locks: fakeLocks() })
    const first = withSaleSyncLock("l", "try", () => new Promise<number>(() => {}))
    expect(await withSaleSyncLock("l", "wait", async () => 2, 20)).toEqual({ acquired: false })
    void first
  })
  it("sem Web Locks executa direto (o banco segue idempotente)", async () => {
    vi.stubGlobal("navigator", { ...navigator, locks: undefined })
    expect(await withSaleSyncLock("l", "try", async () => 3)).toEqual({ acquired: true, value: 3 })
  })
})
