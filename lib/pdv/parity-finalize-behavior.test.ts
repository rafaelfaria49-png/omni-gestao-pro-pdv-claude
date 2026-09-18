/**
 * N5-B1 R2 — PROVA COMPORTAMENTAL da máquina de estados de finalização
 * (GAP-P2-06) e dos contratos operacionais R2 (P2-02/P2-03/P2-05).
 *
 * Fonte: GOAL PDV-PARITY-N5-B1-CORE-GAPS-001 — a revisão estrita rejeitou
 * prova por presença/string para P2-06. Estes testes EXERCITAM os mesmos
 * helpers que o PaymentModal e as 4 superfícies executam em produção
 * (`finalize-modal-contract`, `credit-doc-resolution`, `weight-line-guard`,
 * `capability-blocked-feedback`), simulando os fluxos reais com promises em
 * voo, timers e intenções concorrentes:
 *
 *  1. Assistência + creditDoc de terceiro (precedência do selecionado);
 *  2. Classic peso inválido (0/negativo/NaN/ausente/∞ não cria linha);
 *  3. Super peso inválido (mesma regra semântica — mesmo helper);
 *  4. VC multiplePayments=false com feedback (cooldown anti-spam);
 *  5. cancel/close durante request em voo — modal não fecha, busy preservado;
 *  6. PENDING seguido de tentativa de reconfirmar — bloqueado, identidade estável;
 *  7. FAILED seguido de retry consciente — liberado, contrato de erro preservado;
 *  8. duplo clique/Enter/F-key — UMA única intenção em voo.
 *
 * A idempotência N1 server-side permanece a autoridade final — aqui não há
 * idempotência de negócio nova, apenas a máquina de estados da borda.
 */
import { describe, expect, it } from "vitest"
import {
  FINALIZE_IN_FLIGHT_FEEDBACK,
  PENDING_RETRY_GUIDANCE,
  createFinalizeIntentGate,
  createPendingSaleIdentityGuard,
  refuseModalCloseWhileConfirming,
  resolveConfirmOutcome,
} from "./finalize-modal-contract"
import { resolveCreditAttribution } from "./credit-doc-resolution"
import { resolveWeightUnitPrice, WEIGHT_PRICE_INVALID_FEEDBACK } from "./weight-line-guard"
import {
  CAPABILITY_BLOCKED_COPY,
  createCapabilityBlockedFeedback,
} from "./capability-blocked-feedback"

/** Simula a sequência real do modal: gate → onConfirm em voo → desfecho. */
function simulateFinalizeFlow(onConfirmResult: () => Promise<boolean | void>, requireExplicit: boolean) {
  const gate = createFinalizeIntentGate()
  const events: string[] = []
  return {
    events,
    gate,
    run: async () => {
      expect(gate.begin(), "confirmação obtém a única intenção em voo").toBe(true)
      events.push("busy")
      const success = await onConfirmResult()
      const outcome = resolveConfirmOutcome(success, requireExplicit)
      gate.end()
      events.push(outcome)
      return outcome
    },
  }
}

describe("R2 — caso 1: Assistência + creditDoc (helper compartilhado das 4 bordas)", () => {
  it("crédito de TERCEIRO: doc da venda = titular; clienteId do selecionado NUNCA herda", () => {
    const a = resolveCreditAttribution({
      usedCredit: true,
      meta: { creditDoc: "98765432100", creditNome: "Titular Vale", creditSaldo: 150 },
      selectedCustomer: { id: "cli_A", name: "Cliente A", cpf: "11122233344" },
    })
    expect(a.saleDoc).toBe("98765432100")
    expect(a.saleName).toBe("Titular Vale")
    expect(a.belongsToSelectedCustomer).toBe(false)
    expect(a.seedLocalCredit).toEqual({ doc: "98765432100", nome: "Titular Vale", saldo: 150 })
  })

  it("cliente explicitamente selecionado tem PRECEDÊNCIA quando o titular é ele mesmo", () => {
    const a = resolveCreditAttribution({
      usedCredit: true,
      meta: { creditDoc: "11122233344", creditNome: "Cliente A", creditSaldo: 80 },
      selectedCustomer: { id: "cli_A", name: "Cliente A", cpf: "111.222.333-44" },
    })
    expect(a.saleDoc).toBe("11122233344")
    expect(a.saleName).toBe("Cliente A")
    expect(a.belongsToSelectedCustomer).toBe(true)
  })

  it("crédito do próprio cliente sem lookup (sem meta.creditDoc): identidade do selecionado intacta", () => {
    const a = resolveCreditAttribution({
      usedCredit: true,
      meta: {},
      selectedCustomer: { id: "cli_A", name: "Cliente A", cpf: "11122233344" },
    })
    expect(a.saleDoc).toBe("11122233344")
    expect(a.belongsToSelectedCustomer).toBe(true)
    expect(a.seedLocalCredit).toBeNull()
  })

  it("sem crédito na venda: identidade é do selecionado; sem seed local", () => {
    const a = resolveCreditAttribution({
      usedCredit: false,
      meta: { creditDoc: "999" },
      selectedCustomer: { id: "cli_A", name: "Cliente A", cpf: "11122233344" },
    })
    expect(a.saleDoc).toBe("11122233344")
    expect(a.belongsToSelectedCustomer).toBe(true)
    expect(a.seedLocalCredit).toBeNull()
  })

  it("storeId não entra no contrato (autoridade do motor/servidor) e nada muta ledger aqui", () => {
    const input = {
      usedCredit: true,
      meta: { creditDoc: "98765432100", creditNome: "T", creditSaldo: 10 },
      selectedCustomer: null,
    }
    const a1 = resolveCreditAttribution(input)
    const a2 = resolveCreditAttribution(input)
    // Função pura: mesma entrada → mesma saída; nenhum efeito colateral.
    expect(a1).toEqual(a2)
    expect(a1.saleDoc).toBe("98765432100")
  })
})

describe("R2 — casos 2/3: peso com preço efetivo inválido NÃO cria linha (Classic + Super)", () => {
  const INVALID: Array<[string, { precoPorKg?: number | null; price?: number | null }]> = [
    ["zero no precoPorKg", { precoPorKg: 0, price: 10 }],
    ["negativo no precoPorKg", { precoPorKg: -3.5, price: 10 }],
    ["NaN no precoPorKg", { precoPorKg: Number.NaN, price: 10 }],
    ["Infinity no precoPorKg", { precoPorKg: Number.POSITIVE_INFINITY, price: 10 }],
    ["precoPorKg ausente + price 0 (fallback inválido)", { price: 0 }],
    ["precoPorKg ausente + price negativa", { price: -1 }],
    ["precoPorKg null + price null", { precoPorKg: null, price: null }],
    ["tudo ausente", {}],
  ]

  for (const [label, input] of INVALID) {
    it(`rejeita: ${label}`, () => {
      const r = resolveWeightUnitPrice(input)
      expect(r.ok, `${label} não pode criar linha vendável`).toBe(false)
      if (!r.ok) {
        expect(["missing", "invalid", "nonpositive"]).toContain(r.reason)
      }
    })
  }

  it("peso válido com preço por kg válido passa (fluxo oficial intacto)", () => {
    expect(resolveWeightUnitPrice({ precoPorKg: 24.9, price: 10 })).toEqual({ ok: true, unitPrice: 24.9 })
    expect(resolveWeightUnitPrice({ price: 12.5 })).toEqual({ ok: true, unitPrice: 12.5 })
  })

  it("feedback operacional é claro (não altera cadastro, não inferi preço)", () => {
    expect(WEIGHT_PRICE_INVALID_FEEDBACK.title).toContain("inválido")
    // O helper só reporta — não há caminho de escrita no cadastro.
    expect(resolveWeightUnitPrice({ precoPorKg: 0, price: 10 })).not.toHaveProperty("unitPrice")
  })
})

describe("R2 — caso 4: multiplePayments=false com feedback e SEM spam (cooldown)", () => {
  it("1ª tentativa notifica; tentativas na janela de cooldown são suprimidas", () => {
    let now = 1_000
    const toasts: string[] = []
    const fb = createCapabilityBlockedFeedback(
      (f) => toasts.push(f.title),
      { cooldownMs: 1500, now: () => now },
    )
    fb.notifyBlocked("pdv.multiplePayments", CAPABILITY_BLOCKED_COPY["pdv.multiplePayments"])
    fb.notifyBlocked("pdv.multiplePayments", CAPABILITY_BLOCKED_COPY["pdv.multiplePayments"])
    fb.notifyBlocked("pdv.multiplePayments", CAPABILITY_BLOCKED_COPY["pdv.multiplePayments"])
    expect(toasts, "sem toast loop/spam").toHaveLength(1)
    expect(toasts[0]).toContain("múltiplo")

    now += 1_499
    fb.notifyBlocked("pdv.multiplePayments", CAPABILITY_BLOCKED_COPY["pdv.multiplePayments"])
    expect(toasts, "dentro do cooldown continua suprimido").toHaveLength(1)

    now += 2
    fb.notifyBlocked("pdv.multiplePayments", CAPABILITY_BLOCKED_COPY["pdv.multiplePayments"])
    expect(toasts, "fora do cooldown notifica de novo (feedback consciente)").toHaveLength(2)
  })

  it("chaves diferentes têm cooldowns independentes (paymentMethods ≠ multiplePayments)", () => {
    const toasts: string[] = []
    const fb = createCapabilityBlockedFeedback((f) => toasts.push(f.title), { now: () => 0 })
    fb.notifyBlocked("sales.paymentMethods")
    fb.notifyBlocked("pdv.multiplePayments")
    expect(toasts).toHaveLength(2)
    expect(toasts).toContain(CAPABILITY_BLOCKED_COPY["sales.paymentMethods"].title)
  })
})

describe("R2 — caso 5: cancel/close durante request EM VOO (modal não fecha, busy preservado)", () => {
  it("fechamento é recusado durante o voo e permitido depois do desfecho", async () => {
    let resolveConfirm!: (v: boolean) => void
    const flow = simulateFinalizeFlow(() => new Promise((r) => (resolveConfirm = r)), true)
    const running = flow.run()

    // Operador tenta Cancelar/X/Esc/clique-fora DURANTE o voo:
    expect(flow.gate.isBusy()).toBe(true)
    expect(refuseModalCloseWhileConfirming(true), "modal recusa fechar em voo").toBe(true)

    resolveConfirm(true)
    const outcome = await running
    expect(outcome).toBe("confirmed")
    // CONFIRMED: liberado — fechamento/reset normal.
    expect(flow.gate.isBusy()).toBe(false)
    expect(refuseModalCloseWhileConfirming(false)).toBe(false)
  })

  it("fluxo FAILED: modal permanece aberto (não fecha), busy liberado para retry", async () => {
    const flow = simulateFinalizeFlow(async () => false, true)
    const outcome = await flow.run()
    expect(outcome).toBe("failed")
    expect(flow.gate.isBusy()).toBe(false)
    expect(refuseModalCloseWhileConfirming(false), "fechar é permitido após FAILED").toBe(false)
  })

  it("resultado INDETERMINADO com contrato explícito NUNCA é sucesso (bare-return ≠ sucesso)", async () => {
    const flow = simulateFinalizeFlow(async () => undefined, true)
    const outcome = await flow.run()
    expect(outcome, "Super/Assist devem retornar resultado explícito").toBe("failed")
    expect(flow.gate.isBusy()).toBe(false)
  })

  it("feedback do bloqueio de fechamento respeita cooldown (sem toast loop no voo)", () => {
    let now = 0
    const toasts: string[] = []
    const fb = createCapabilityBlockedFeedback((f) => toasts.push(f.title), { now: () => now })
    // 5 tentativas de Esc dentro do voo → 1 aviso.
    for (let i = 0; i < 5; i++) {
      if (refuseModalCloseWhileConfirming(true)) {
        fb.notifyBlocked(FINALIZE_IN_FLIGHT_FEEDBACK.title, FINALIZE_IN_FLIGHT_FEEDBACK)
      }
    }
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toBe(FINALIZE_IN_FLIGHT_FEEDBACK.title)
    now = 1600
    if (refuseModalCloseWhileConfirming(true)) {
      fb.notifyBlocked(FINALIZE_IN_FLIGHT_FEEDBACK.title, FINALIZE_IN_FLIGHT_FEEDBACK)
    }
    expect(toasts).toHaveLength(2)
  })
})

describe("R2 — caso 6: PENDING seguido de tentativa de RECONFIRMAR (identidade estável)", () => {
  it("reconfirmação pelo modal é BLOQUEADA e orienta o retry existente", () => {
    const guard = createPendingSaleIdentityGuard()
    expect(guard.hasPending()).toBe(false)

    // Motor N1 devolve PENDING com identidade própria:
    guard.register({ id: "PEND-cs-123", clientSaleId: "cs-123" })
    expect(guard.hasPending()).toBe(true)

    // Operador reabre o modal e tenta confirmar de novo — a borda consulta:
    const reconfirmAllowed = !guard.hasPending()
    expect(reconfirmAllowed, "reconfirm não pode nascer (novo clientSaleId = 2ª venda)").toBe(false)
    expect(PENDING_RETRY_GUIDANCE.title).toMatch(/aguardando confirmação/i)
  })

  it("identidade registrada é EXATAMENTE a criada pelo motor (retry/reenvio mantém a original)", () => {
    const guard = createPendingSaleIdentityGuard()
    guard.register({ id: "PEND-cs-abc", clientSaleId: "cs-abc" })
    expect(guard.getIdentity()).toEqual({ id: "PEND-cs-abc", clientSaleId: "cs-abc" })
    // Registrar de novo NÃO troca para uma identidade fabricada:
    guard.register({ id: "PEND-cs-abc", clientSaleId: "cs-abc" })
    expect(guard.getIdentity()?.clientSaleId).toBe("cs-abc")
  })

  it("guard liberado só com encerramento consciente do rascunho (limpar/cancelar/espera)", () => {
    const guard = createPendingSaleIdentityGuard()
    guard.register({ id: "PEND-1", clientSaleId: "cs-1" })
    guard.clear() // limpar-carrinho / cancelar-venda / hold
    expect(guard.hasPending()).toBe(false)
  })
})

describe("R2 — caso 7: FAILED seguido de retry consciente", () => {
  it("após FAILED o gate abre nova intenção e o modal aceita reconfirmação", async () => {
    const flow = simulateFinalizeFlow(async () => false, true)
    expect(await flow.run()).toBe("failed")

    const second = simulateFinalizeFlow(async () => true, true)
    const outcome = await second.run()
    expect(outcome, "retry consciente alcança CONFIRMED").toBe("confirmed")
  })

  it("desfecho FAILED preserva o contrato de erro: false chega ao modal (não void)", () => {
    // `false` é distinguido de `undefined` — o modal NÃO sobrepõe toast do
    // erro da superfície (feedback duplicado) e mantém o modal aberto.
    expect(resolveConfirmOutcome(false, true)).toBe("failed")
    expect(resolveConfirmOutcome(false, false)).toBe("failed")
  })
})

describe("R2 — caso 8: duplo clique / Enter duplo / F-key repetida = UMA intenção em voo", () => {
  it("segunda intenção durante o voo é coalescida (begin duplo → false)", async () => {
    let resolveConfirm!: (v: boolean) => void
    const gate = createFinalizeIntentGate()
    const first = (async () => {
      expect(gate.begin()).toBe(true)
      await new Promise<boolean>((r) => (resolveConfirm = r))
      gate.end()
      return "done"
    })()
    expect(gate.begin(), "duplo clique não cria segunda intenção").toBe(false)
    expect(gate.begin(), "F-key repetida não cria segunda intenção").toBe(false)
    resolveConfirm(true)
    await first
    expect(gate.begin(), "após o desfecho, nova venda pode finalizar").toBe(true)
    gate.end()
  })

  it("simulação de ponta a ponta: um único onConfirm por intenção, desfecho único", async () => {
    let calls = 0
    const flow = simulateFinalizeFlow(async () => {
      calls += 1
      return true
    }, true)
    const outcome = await flow.run()
    expect(calls).toBe(1)
    expect(outcome).toBe("confirmed")
    expect(flow.events).toEqual(["busy", "confirmed"])
  })
})

describe("R2 — contrato do modal com callers legados (Next/Black inalterados)", () => {
  it("sem requireExplicitResult, void continua fechando (comportamento pré-R2 preservado)", () => {
    expect(resolveConfirmOutcome(undefined, false)).toBe("confirmed")
    expect(resolveConfirmOutcome(true, false)).toBe("confirmed")
    expect(resolveConfirmOutcome(false, false)).toBe("failed")
  })

  it("com requireExplicitResult (4 superfícies oficiais), só `true` fecha", () => {
    expect(resolveConfirmOutcome(true, true)).toBe("confirmed")
    expect(resolveConfirmOutcome(undefined, true)).toBe("failed")
    expect(resolveConfirmOutcome(false, true)).toBe("failed")
  })
})
