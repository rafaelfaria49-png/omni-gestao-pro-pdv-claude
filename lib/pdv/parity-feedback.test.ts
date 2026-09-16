/**
 * N5-A F-06 — Contrato de feedback de erro/sucesso/pending por superfície.
 *
 * Fonte: audit A.2 #20/#21/#23, §F-06, GAP-P2-03, B-06.
 *
 * Paridade exigida: PENDING honesto (copy compartilhada), erro visível
 * (toast destructive), audit do CONFIRMED (ver F-04). Apresentação de
 * sucesso VARIA por intenção (#21): Classic shellInfo/impressão,
 * Assistência/Supermercado PdvPostSaleDialog, Venda Completa CupomNaoFiscal.
 * Divergência GAP-P2-03 CORRIGIDA no N5-B1 (fail-closed audível): gates de
 * pagamento bloqueiam sem abrir fluxo E com feedback (toast com cooldown +
 * entries disabled/ocultos). A prova detalhada vive em parity-payment-props.
 */
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { fixtureFor, OFFICIAL_SURFACE_FIXTURES } from "./parity-fixtures"
import { PENDING_SALE_TITLE } from "../pdv-finalize-integrity"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")

function read(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), "utf8")
}

describe("F-06 — feedback pending/erro/sucesso por superfície", () => {
  for (const fixture of OFFICIAL_SURFACE_FIXTURES) {
    it(`${fixture.surfaceId}: pending usa a copy compartilhada honesta`, () => {
      const source = read(fixture.componentPath)
      expect(source.split("PENDING_SALE_TITLE").length - 1).toBeGreaterThanOrEqual(2)
      expect(source).toContain('from "@/lib/pdv-finalize-integrity"')
    })

    it(`${fixture.surfaceId}: erro de finalização é visível (toast destructive)`, () => {
      const source = read(fixture.componentPath)
      expect(source, `${fixture.surfaceId}: toasts de erro presentes`).toContain('variant: "destructive"')
    })
  }

  it("sucesso tem apresentação intencionalmente distinta (#21) e presente em todas", () => {
    const classic = read(fixtureFor("classic").componentPath)
    expect(classic, "Classic: pós-venda com impressão/cupom").toContain("Venda finalizada")
    expect(classic).toContain("setPostSalePrint")

    const assist = read(fixtureFor("assistencia").componentPath)
    expect(assist, "Assistência: PdvPostSaleDialog").toContain("PdvPostSaleDialog")
    expect(assist).toContain("Venda finalizada")

    const superSrc = read(fixtureFor("supermercado").componentPath)
    expect(superSrc, "Supermercado: PdvPostSaleDialog").toContain("PdvPostSaleDialog")
    expect(superSrc).toContain("Venda finalizada")

    const completa = read(fixtureFor("venda-completa").componentPath)
    expect(completa, "Venda Completa: CupomNaoFiscal").toContain("CupomNaoFiscal")
    expect(completa).toContain("setCupomOpen(true)")
  })

  it("B-06: modo-rápido é transversal ao switcher; VC não participa (intencional)", () => {
    for (const surfaceId of ["classic", "assistencia", "supermercado"] as const) {
      const source = read(fixtureFor(surfaceId).componentPath)
      expect(source, `${surfaceId} conhece isModoRapido`).toContain("isModoRapido")
    }
    // Venda Completa não tem modo-rápido — diferença intencional (B-06), não gap.
    expect(read(fixtureFor("venda-completa").componentPath)).not.toContain("isModoRapido")
  })

  it("GAP-P2-03=FIXED: gates de pagamento bloqueiam com feedback (F2/F7 escondem; pagamento avisa)", () => {
    // F2/F7 checam capability antes do efeito (feedback = nada acontece, gate visível no código).
    const classic = read(fixtureFor("classic").componentPath)
    expect(classic).toContain("if (customerSearchEnabled) setShellClientSearchOpen(true)")
    expect(classic).toContain("if (heldSalesEnabled) setVendaEsperaOpen(true)")

    // Pagamento: fail-closed continua (sem abrir fluxo), mas agora audível.
    // A prova completa do contrato está em parity-payment-props.test.ts; aqui
    // se congela que nenhuma das 4 superfícies ficou no silêncio antigo.
    for (const fixture of OFFICIAL_SURFACE_FIXTURES) {
      const source = read(fixture.componentPath)
      expect(source, `${fixture.surfaceId}: feedback de bloqueio`).toContain("notifyPaymentCapabilityBlocked(")
    }
  })
})
