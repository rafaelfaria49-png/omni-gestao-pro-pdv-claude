/**
 * GOAL_003 — Máquina de estados fiscal da venda.
 *
 * Duas camadas:
 *  1. Pura — exercita os helpers (can... e assert...) sobre todos os estados.
 *  2. Wiring estático — garante que cada rota corrigir* chama `assertVendaFiscalEditavel`
 *     e que `cancelar` chama `assertVendaFiscalCancelavel` (anti-regressão).
 *
 * Invariante central: NAO_FISCAL (todas as vendas atuais) NÃO bloqueia nada — o
 * comportamento das rotas permanece idêntico ao de antes do GOAL_003.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, it, expect } from "vitest"
import {
  assertVendaFiscalCancelavel,
  assertVendaFiscalEditavel,
  canCancelarFiscalmente,
  canCancelarOperacionalmente,
  canEditarVendaFiscal,
  canEmitirFiscalmente,
  normalizeFiscalStatus,
} from "./venda-fiscal-state-machine"
import { FiscalStatusVenda } from "@/generated/prisma"

const S = FiscalStatusVenda

// ---------------------------------------------------------------------------
// 1. Helpers puros — editar / cancelar operacional
// ---------------------------------------------------------------------------

describe("canEditarVendaFiscal / assertVendaFiscalEditavel", () => {
  it("NAO_FISCAL permite corrigir (comportamento atual)", () => {
    expect(canEditarVendaFiscal(S.NAO_FISCAL)).toBe(true)
    expect(assertVendaFiscalEditavel({ fiscalStatus: S.NAO_FISCAL })).toEqual({ ok: true })
  })

  it("PENDENTE permite corrigir", () => {
    expect(canEditarVendaFiscal(S.PENDENTE)).toBe(true)
    expect(assertVendaFiscalEditavel({ fiscalStatus: S.PENDENTE }).ok).toBe(true)
  })

  it("REJEITADA permite corrigir (corrigir dados/snapshot e reenviar)", () => {
    expect(canEditarVendaFiscal(S.REJEITADA)).toBe(true)
    expect(assertVendaFiscalEditavel({ fiscalStatus: S.REJEITADA }).ok).toBe(true)
  })

  it("EMITINDO bloqueia correção (409)", () => {
    expect(canEditarVendaFiscal(S.EMITINDO)).toBe(false)
    const r = assertVendaFiscalEditavel({ fiscalStatus: S.EMITINDO })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.status).toBe(409)
      expect(r.error).toMatch(/emiss/i)
      expect(r.code).toBe("fiscal_bloqueio_emitindo")
    }
  })

  it("AUTORIZADA bloqueia correção (409)", () => {
    expect(canEditarVendaFiscal(S.AUTORIZADA)).toBe(false)
    const r = assertVendaFiscalEditavel({ fiscalStatus: S.AUTORIZADA })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(409)
  })

  it("EM_CONTINGENCIA bloqueia alterações críticas", () => {
    expect(canEditarVendaFiscal(S.EM_CONTINGENCIA)).toBe(false)
    expect(assertVendaFiscalEditavel({ fiscalStatus: S.EM_CONTINGENCIA }).ok).toBe(false)
  })

  it("CANCELADA_FISCAL bloqueia tudo operacional", () => {
    expect(canEditarVendaFiscal(S.CANCELADA_FISCAL)).toBe(false)
    expect(assertVendaFiscalEditavel({ fiscalStatus: S.CANCELADA_FISCAL }).ok).toBe(false)
  })

  it("BLOQUEADA_FISCAL bloqueia tudo", () => {
    expect(canEditarVendaFiscal(S.BLOQUEADA_FISCAL)).toBe(false)
    expect(assertVendaFiscalEditavel({ fiscalStatus: S.BLOQUEADA_FISCAL }).ok).toBe(false)
  })
})

describe("canCancelarOperacionalmente / assertVendaFiscalCancelavel", () => {
  it("NAO_FISCAL permite cancelar (comportamento atual)", () => {
    expect(canCancelarOperacionalmente(S.NAO_FISCAL)).toBe(true)
    expect(assertVendaFiscalCancelavel({ fiscalStatus: S.NAO_FISCAL })).toEqual({ ok: true })
  })

  it("PENDENTE permite cancelar operacionalmente", () => {
    expect(canCancelarOperacionalmente(S.PENDENTE)).toBe(true)
  })

  it("EMITINDO/AUTORIZADA/EM_CONTINGENCIA/CANCELADA_FISCAL/BLOQUEADA_FISCAL bloqueiam", () => {
    for (const st of [S.EMITINDO, S.AUTORIZADA, S.EM_CONTINGENCIA, S.CANCELADA_FISCAL, S.BLOQUEADA_FISCAL]) {
      expect(canCancelarOperacionalmente(st)).toBe(false)
      const r = assertVendaFiscalCancelavel({ fiscalStatus: st })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.status).toBe(409)
    }
  })

  it("AUTORIZADA sugere cancelamento fiscal na mensagem", () => {
    const r = assertVendaFiscalCancelavel({ fiscalStatus: S.AUTORIZADA })
    if (!r.ok) expect(r.error).toMatch(/fiscal/i)
  })
})

// ---------------------------------------------------------------------------
// 2. Emissão / cancelamento fiscal (dormentes — uso futuro)
// ---------------------------------------------------------------------------

describe("canEmitirFiscalmente / canCancelarFiscalmente", () => {
  it("emitir: PENDENTE, REJEITADA, EM_CONTINGENCIA", () => {
    expect(canEmitirFiscalmente(S.PENDENTE)).toBe(true)
    expect(canEmitirFiscalmente(S.REJEITADA)).toBe(true)
    expect(canEmitirFiscalmente(S.EM_CONTINGENCIA)).toBe(true)
    expect(canEmitirFiscalmente(S.NAO_FISCAL)).toBe(false)
    expect(canEmitirFiscalmente(S.AUTORIZADA)).toBe(false)
  })

  it("cancelar fiscalmente: somente AUTORIZADA", () => {
    expect(canCancelarFiscalmente(S.AUTORIZADA)).toBe(true)
    for (const st of [S.NAO_FISCAL, S.PENDENTE, S.EMITINDO, S.REJEITADA, S.EM_CONTINGENCIA, S.CANCELADA_FISCAL, S.BLOQUEADA_FISCAL]) {
      expect(canCancelarFiscalmente(st)).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// 3. Normalização robusta (fail-open seguro)
// ---------------------------------------------------------------------------

describe("normalizeFiscalStatus — ausente/ruído → NAO_FISCAL (não bloqueia)", () => {
  it("trata null/undefined/desconhecido como NAO_FISCAL", () => {
    expect(normalizeFiscalStatus(null)).toBe(S.NAO_FISCAL)
    expect(normalizeFiscalStatus(undefined)).toBe(S.NAO_FISCAL)
    expect(normalizeFiscalStatus("")).toBe(S.NAO_FISCAL)
    expect(normalizeFiscalStatus("xpto")).toBe(S.NAO_FISCAL)
    // venda sem o campo → editável/cancelável (comportamento atual)
    expect(assertVendaFiscalEditavel({}).ok).toBe(true)
    expect(assertVendaFiscalCancelavel({}).ok).toBe(true)
  })

  it("aceita valor com caixa/espacos", () => {
    expect(normalizeFiscalStatus(" autorizada ")).toBe(S.AUTORIZADA)
  })
})

// ---------------------------------------------------------------------------
// 4. Wiring estático — rotas chamam o gate fiscal
// ---------------------------------------------------------------------------

const ROOT = resolve(__dirname, "..", "..")
function read(relPath: string): string {
  return readFileSync(resolve(ROOT, relPath), "utf8")
}

const ROTAS_CORRIGIR = [
  "app/api/vendas/[id]/corrigir/route.ts",
  "app/api/vendas/[id]/corrigir-itens/route.ts",
  "app/api/vendas/[id]/corrigir-item-meta/route.ts",
  "app/api/vendas/[id]/corrigir-parcelas/route.ts",
  "app/api/vendas/[id]/corrigir-titulo/route.ts",
]

describe("Wiring — cada rota corrigir* chama o gate fiscal de edição", () => {
  for (const f of ROTAS_CORRIGIR) {
    it(`[${f}] importa e chama assertVendaFiscalEditavel(venda)`, () => {
      const src = read(f)
      expect(src).toContain('from "@/lib/fiscal/venda-fiscal-state-machine"')
      expect(src).toContain("assertVendaFiscalEditavel(venda)")
    })
  }
})

describe("Wiring — cancelar chama o gate fiscal de cancelamento", () => {
  it("[app/api/vendas/[id]/cancelar/route.ts] chama assertVendaFiscalCancelavel(venda)", () => {
    const src = read("app/api/vendas/[id]/cancelar/route.ts")
    expect(src).toContain('from "@/lib/fiscal/venda-fiscal-state-machine"')
    expect(src).toContain("assertVendaFiscalCancelavel(venda)")
  })
})
