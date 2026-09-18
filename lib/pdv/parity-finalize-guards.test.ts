/**
 * N5-A F-04 — Contrato de finalização compartilhado por superfície.
 *
 * Fonte: audit A.2 #19/#20, §F-04, GAP-P2-06, D-04; motor N1
 * (`lib/pdv-finalize-integrity.ts`) já TESTED — aqui a prova é da BORDA.
 *
 * Prova por superfície oficial (leitura estática do componente):
 * 1. single finalize entry — exatamente um `await finalizeSaleTransaction(`;
 * 2. guard de linhas não resolvidas (`findUnresolvedSaleLines`) ANTES do motor;
 * 3. gap honesto — FAILED (`!result.ok`) tratado entre finalize e pending;
 * 4. pending honesto — guard único `if (result.pending) {` sai antes dos
 *    efeitos definitivos (prova completa por região vive em
 *    `pdv-pending-post-sale-effects.static.test.ts`; aqui se congela a presença);
 * 5. nenhum sucesso definitivo antes de confirmação — vocabulário N1
 *    (`postFinalizeDisposition`) declara CONFIRMED apenas com `{ok:true}` sem
 *    pendência, e retry idempotente emite exatamente uma vez.
 *
 * N5-B1 R2 (GAP-P2-06 CORRIGIDO): a máquina de estados do modal é o contrato
 * compartilhado `lib/pdv/finalize-modal-contract.ts` — fechamento durante o
 * voo é recusado, resultado explícito é exigido das 4 superfícies
 * (`requireExplicitResult`) e PENDING registra identidade estável. A prova
 * COMPORTAMENTAL vive em `parity-finalize-behavior.test.ts`; aqui ficam os
 * drift guards estáticos de wiring. O mutex `claimSaleFinalizeLock` continua
 * exclusivo da Venda Completa (as demais superfícies usam o busy-ref do
 * modal + gate de intenção — não há mutex novo por superfície).
 */
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { fixtureFor, OFFICIAL_SURFACE_FIXTURES } from "./parity-fixtures"
import {
  FINALIZE_CONFIRMED,
  FINALIZE_FAILED,
  FINALIZE_PENDING,
  PENDING_SALE_TITLE,
  createConfirmedSaleEmitter,
  postFinalizeDisposition,
} from "../pdv-finalize-integrity"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")

const MODAL = "components/dashboard/vendas/payment-modal.tsx"

function read(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), "utf8")
}

describe("F-04 — single entry e guards de borda por superfície", () => {
  for (const fixture of OFFICIAL_SURFACE_FIXTURES) {
    it(`${fixture.surfaceId}: um ponto de finalize, guard unresolved antes, FAILED e PENDING honestos`, () => {
      const source = read(fixture.componentPath)

      // 1. Single finalize entry.
      const FINALIZE = "await finalizeSaleTransaction("
      const finalizeCount = source.split(FINALIZE).length - 1
      expect(finalizeCount, `${fixture.surfaceId}: entrada única do motor`).toBe(1)
      const finalizeIdx = source.indexOf(FINALIZE)

      // 2. Guard unresolved ANTES do motor (fail-closed por linhas fantasmas).
      const unresolvedIdx = source.indexOf("findUnresolvedSaleLines(")
      expect(unresolvedIdx, `${fixture.surfaceId}: guard unresolved presente`).toBeGreaterThan(-1)
      expect(unresolvedIdx, `${fixture.surfaceId}: unresolved antes do finalize`).toBeLessThan(finalizeIdx)

      // 3. Gap FAILED honesto.
      expect(source, `${fixture.surfaceId}: trata !result.ok`).toContain("!result.ok")

      // 4. Guard PENDING único após o finalize (prova de região no static N1).
      const GUARD = "if (result.pending) {"
      expect(source.split(GUARD).length - 1, `${fixture.surfaceId}: guard pending único`).toBe(1)
      const guardIdx = source.indexOf(GUARD)
      expect(guardIdx, `${fixture.surfaceId}: pending depois do finalize`).toBeGreaterThan(finalizeIdx)
    })

    it(`${fixture.surfaceId}: venda confirmada registra audit sale_finalized (literal ou via motor)`, () => {
      const source = read(fixture.componentPath)
      if (fixture.surfaceId === "assistencia") {
        // Assistência delega o registro ao motor compartilhado via auditMeta
        // (GAP-P3-15 registra a divergência de formato — N5-A não muda).
        expect(source).toContain("auditMeta: {")
      } else {
        expect(source, `${fixture.surfaceId}: audit de venda finalizada`).toContain("sale_finalized")
      }
    })
  }

  it("GAP-P2-06 (R2): mutex claimSaleFinalizeLock continua exclusivo da Venda Completa", () => {
    const vc = read(fixtureFor("venda-completa").componentPath)
    expect(vc).toContain("claimSaleFinalizeLock(isProcessingRef)")
    expect(vc).toContain("releaseSaleFinalizeLock(isProcessingRef)")

    for (const surfaceId of ["classic", "assistencia", "supermercado"] as const) {
      const source = read(fixtureFor(surfaceId).componentPath)
      expect(
        source,
        `${surfaceId}: sem mutex novo (busy da finalização vive no modal compartilhado)`,
      ).not.toContain("claimSaleFinalizeLock")
    }
  })

  it("GAP-P2-06 (R2): as 4 bordas exigem resultado explícito do modal (requireExplicitResult)", () => {
    for (const fixture of OFFICIAL_SURFACE_FIXTURES) {
      const source = read(fixture.componentPath)
      expect(source, `${fixture.surfaceId}: requireExplicitResult no PaymentModal`).toContain(
        "requireExplicitResult",
      )
    }
  })

  it("GAP-P2-06 (R2): modal recusa fechamento durante o voo (contrato compartilhado importado)", () => {
    const modal = read(MODAL)
    expect(modal).toContain("refuseModalCloseWhileConfirming")
    expect(modal).toContain("resolveConfirmOutcome")
    expect(modal).toContain("attemptCloseWhileConfirming")
    // Busy síncrono cobre a janela entre o clique e o re-render.
    expect(modal).toContain("finalConfirmBusyRef.current")
  })

  it("GAP-P2-06 (R2): identidade PENDING registrada nas 4 bordas (guarda de reconfirmação)", () => {
    for (const fixture of OFFICIAL_SURFACE_FIXTURES) {
      const source = read(fixture.componentPath)
      expect(source, `${fixture.surfaceId}: guard de identidade PENDING`).toContain(
        "pendingSaleIdentityRef",
      )
      expect(source, `${fixture.surfaceId}: registra identidade no PENDING`).toContain(
        "pendingSaleIdentityRef.current?.register(",
      )
    }
  })

  it("GAP-P2-06 (R2): Venda Completa: F1 respeita o mutex (isSaleFinalizeBusy)", () => {
    const vc = read(fixtureFor("venda-completa").componentPath)
    const f1Case = vc.slice(vc.indexOf('case "F1":'), vc.indexOf("case \"F2\":"))
    expect(f1Case).toContain("isSaleFinalizeBusy(isProcessingRef)")
  })
})

describe("F-04 — vocabulário N1 compartilhado (nenhum sucesso antes da confirmação)", () => {
  it("disposição CONFIRMED/PENDING/FAILED é inequívoca e compartilhada", () => {
    expect(postFinalizeDisposition({ ok: true })).toBe(FINALIZE_CONFIRMED)
    expect(postFinalizeDisposition({ ok: true, pending: true })).toBe(FINALIZE_PENDING)
    expect(postFinalizeDisposition({ ok: false })).toBe(FINALIZE_FAILED)
  })

  it("copy de PENDING é honesta (nunca promete venda concluída)", () => {
    expect(PENDING_SALE_TITLE).toContain("PENDENTE")
    const lowered = PENDING_SALE_TITLE.toLowerCase()
    expect(lowered).not.toContain("concluída")
    expect(lowered).not.toContain("finalizada")
  })

  it("retry idempotente: confirmação da MESMA identidade emite exatamente uma vez", () => {
    let emissions = 0
    const emitConfirmedSale = createConfirmedSaleEmitter(() => {
      emissions += 1
    })
    // Chave estável = clientSaleId (quando houver), senão id.
    const identity = { id: "sale-1", clientSaleId: "client-sale-1" }
    expect(emitConfirmedSale(identity), "1ª confirmação emite").toBe(true)
    expect(emitConfirmedSale(identity), "retry da mesma identidade não duplica").toBe(false)
    expect(emitConfirmedSale({ id: "sale-9", clientSaleId: "client-sale-1" }), "mesma chave estável não duplica").toBe(false)
    expect(emissions).toBe(1)
    expect(emitConfirmedSale({ id: "sale-2" }), "venda nova emite").toBe(true)
    expect(emissions).toBe(2)
  })

  it("todas as 4 bordas usam o mesmo motor (finalizeSaleTransaction do operations-store)", () => {
    for (const fixture of OFFICIAL_SURFACE_FIXTURES) {
      const source = read(fixture.componentPath)
      expect(source, `${fixture.surfaceId}: motor compartilhado`).toContain(
        "await finalizeSaleTransaction({",
      )
    }
  })
})
