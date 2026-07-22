import { describe, expect, it } from "vitest"
import { TEST_KEY_PLAIN_PEM } from "../signing/__fixtures__/test-cert"
import { XSD_OK_ADAPTER } from "../xsd/__fixtures__/xsd-adapter-fixtures"
import type { XsdValidationResult } from "../xsd"
import {
  gateCsosn500Snapshot,
  gatePilotSnapshot,
  gateProdutoIncompletoSnapshot,
  runFiscalDryRunGate,
  type DryRunGateItemNumero,
  type DryRunGateReport,
} from "./index"

/**
 * XSD_OK_ADAPTER é o test double FIEL AO CONTRATO (prova a fiação do item 4). O xmllint REAL
 * (G-C2/ADR-0010) roda no worker containerizado provisionado; sem ele, o item 4 fica
 * `nao_auferivel` (fail-closed) — coberto pelo teste "sem worker XSD".
 */
const XSD = XSD_OK_ADAPTER

/** Adapter que reprova no schema (fixture "XML inválido no XSD"). */
const XSD_INVALIDO = {
  async validate(): Promise<XsdValidationResult> {
    return {
      valid: false as const,
      outcome: "XML_INVALIDO" as const,
      issues: [{ message: "elemento fora do schema" }],
      engine: null,
      durationMs: 1,
    }
  },
}

function itemDe(report: DryRunGateReport, numero: DryRunGateItemNumero) {
  const it = report.itens.find((i) => i.numero === numero)
  if (!it) throw new Error(`item ${numero} ausente`)
  return it
}

describe("gate executável do dry-run (GOAL-007)", () => {
  it("fixture POSITIVA (mix piloto) com XSD real fiado ⇒ 11/11 aprovado", async () => {
    const report = await runFiscalDryRunGate(gatePilotSnapshot(), { xsdAdapter: XSD })
    expect(report.total).toBe(11)
    expect(report.itens).toHaveLength(11)
    expect(report.aprovados).toBe(11)
    expect(report.aprovado).toBe(true)
    expect(report.itens.every((i) => i.status === "aprovado")).toBe(true)
    // numeração real de homologação — placeholder removido do modo gate.
    expect(report.numeracaoPlaceholder).toBe(false)
    expect(report.chaveAcesso).toMatch(/^\d{44}$/)
    expect(report.hashXmlAssinado).toMatch(/^[a-f0-9]{64}$/)
    expect(report.descartado).toBe(true)
    // cada item traz número, nome, autoridade e evidência.
    for (const it of report.itens) {
      expect(it.nome.length).toBeGreaterThan(0)
      expect(it.autoridade.length).toBeGreaterThan(0)
      expect(it.evidencia).toBeTypeOf("object")
    }
  })

  it("SEM worker XSD real ⇒ item 4 nao_auferivel e gate NÃO verde (10/11)", async () => {
    const report = await runFiscalDryRunGate(gatePilotSnapshot())
    const item4 = itemDe(report, 4)
    expect(item4.status).toBe("nao_auferivel")
    expect(item4.erro).toMatch(/worker XSD real/i)
    expect(report.aprovado).toBe(false)
    expect(report.aprovados).toBe(10)
    // os demais itens continuam auferíveis in-process.
    for (const n of [1, 2, 3, 5, 6, 7, 8, 9, 10, 11] as DryRunGateItemNumero[]) {
      expect(itemDe(report, n).status).toBe("aprovado")
    }
  })

  it("item 7: numeração controlada real (série/número, sem placeholder)", async () => {
    const report = await runFiscalDryRunGate(gatePilotSnapshot(), { xsdAdapter: XSD })
    const item7 = itemDe(report, 7)
    expect(item7.status).toBe("aprovado")
    expect(item7.evidencia.numeracaoPlaceholder).toBe(false)
    expect(item7.evidencia.serie).toBe(1)
    expect(Number(item7.evidencia.numero)).toBeGreaterThan(0)
  })

  it("item 8: reexecução do mesmo localKey ⇒ mesmos bytes + número reusado", async () => {
    const report = await runFiscalDryRunGate(gatePilotSnapshot(), { xsdAdapter: XSD })
    const item8 = itemDe(report, 8)
    expect(item8.status).toBe("aprovado")
    expect(item8.evidencia.reexecucaoHashIgual).toBe(true)
    expect(item8.evidencia.numeroReusado).toBe(true)
  })

  it("item 11: contrato do provider por record/replay, simulado, sem provider real", async () => {
    const report = await runFiscalDryRunGate(gatePilotSnapshot(), { xsdAdapter: XSD })
    const item11 = itemDe(report, 11)
    expect(item11.status).toBe("aprovado")
    expect(item11.evidencia.providerSimulado).toBe(true)
    expect(item11.evidencia.providerReal).toBe(false)
    expect(item11.evidencia.sequenciaGravada).toEqual(["validarSnapshot", "prepararEmissao", "emitir"])
  })

  it("determinismo: duas execuções produzem os mesmos bytes e os mesmos status", async () => {
    const a = await runFiscalDryRunGate(gatePilotSnapshot(), { xsdAdapter: XSD })
    const b = await runFiscalDryRunGate(gatePilotSnapshot(), { xsdAdapter: XSD })
    expect(a.hashXmlAssinado).toBe(b.hashXmlAssinado)
    expect(a.chaveAcesso).toBe(b.chaveAcesso)
    expect(a.itens.map((i) => i.status)).toEqual(b.itens.map((i) => i.status))
  })

  it("zero segredo: o relatório não contém a chave privada do certificado de teste", async () => {
    const report = await runFiscalDryRunGate(gatePilotSnapshot(), { xsdAdapter: XSD })
    const serialized = JSON.stringify(report)
    expect(serialized).not.toContain(TEST_KEY_PLAIN_PEM.slice(40, 120))
    expect(itemDe(report, 10).evidencia.zeroSegredo).toBe(true)
  })

  // ── Fixtures defeituosas: cada uma reprova no item exato ────────────────────────────────

  it("NEGATIVA produto fiscal incompleto ⇒ reprova no item 2", async () => {
    const report = await runFiscalDryRunGate(gateProdutoIncompletoSnapshot(), { xsdAdapter: XSD })
    expect(itemDe(report, 2).status).toBe("reprovado")
    expect(itemDe(report, 2).erro).toMatch(/incompleto|CST\/CSOSN/i)
    expect(report.aprovado).toBe(false)
  })

  it("NEGATIVA XML inválido no XSD ⇒ reprova no item 4", async () => {
    const report = await runFiscalDryRunGate(gatePilotSnapshot(), { xsdAdapter: XSD_INVALIDO })
    expect(itemDe(report, 4).status).toBe("reprovado")
    expect(itemDe(report, 4).erro).toMatch(/XSD/i)
    expect(report.aprovado).toBe(false)
  })

  it("NEGATIVA assinatura corrompida ⇒ reprova no item 5", async () => {
    const report = await runFiscalDryRunGate(gatePilotSnapshot(), {
      xsdAdapter: XSD,
      faltas: { assinaturaCorrompida: true },
    })
    expect(itemDe(report, 5).status).toBe("reprovado")
    expect(report.aprovado).toBe(false)
  })

  it("NEGATIVA localKey duplicado (bytes divergentes na reexecução) ⇒ reprova no item 8", async () => {
    const report = await runFiscalDryRunGate(gatePilotSnapshot(), {
      xsdAdapter: XSD,
      faltas: { bytesDivergentesNaReexecucao: true },
    })
    expect(itemDe(report, 8).status).toBe("reprovado")
    expect(itemDe(report, 8).erro).toMatch(/divergentes|idempotente/i)
    expect(report.aprovado).toBe(false)
  })

  it("BOUNDARY CSOSN 500 sem fiação de ST ⇒ fail-closed no item 3 (nunca verde)", async () => {
    const report = await runFiscalDryRunGate(gateCsosn500Snapshot(), { xsdAdapter: XSD })
    // produto (cadastro) está completo, mas a tributação ST fica pendente ⇒ XML bloqueado.
    expect(itemDe(report, 2).status).toBe("aprovado")
    expect(itemDe(report, 3).status).toBe("reprovado")
    expect(report.aprovado).toBe(false)
  })
})
