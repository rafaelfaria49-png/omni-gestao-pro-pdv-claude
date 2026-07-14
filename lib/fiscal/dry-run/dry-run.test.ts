import { afterEach, describe, expect, it, vi } from "vitest"
import { TEST_XSD_ENGINE as TEST_ENGINE, XSD_OK_ADAPTER } from "../xsd/__fixtures__/xsd-adapter-fixtures"
import { verifyNfceSignature } from "../signing"
import { TEST_KEY_PLAIN_PEM } from "../signing/__fixtures__/test-cert"
import { DRY_RUN_TEST_CERT, dryRunSnapshot, runFiscalDryRun, runFiscalDryRunDetailed } from "./index"

const CTX = { serie: 1, numero: 42 }
const OPTIONS = { contexto: CTX, xsdAdapter: XSD_OK_ADAPTER }
afterEach(() => vi.restoreAllMocks())

describe("dry-run com gate XSD real", () => {
  for (const kind of ["simples", "com_desconto", "multiplos_itens", "consumidor_sem_cpf", "consumidor_com_cpf"] as const) {
    it(`${kind}: XSD, assinatura e estrutura aprovam`, async () => {
      const report = await runFiscalDryRun(dryRunSnapshot(kind), OPTIONS)
      expect(report.xsd.status).toBe("xsd_ok")
      expect(report.xsd.engine).toEqual(TEST_ENGINE)
      expect(report.assinaturaValida).toBe(true)
      expect(report.validacaoEstrutural.ok).toBe(true)
      expect(report.prontoParaEmissao).toBe(true)
      expect(report.chaveAcesso).toMatch(/^\d{44}$/)
      expect(report.hashXmlAssinado).toMatch(/^[a-f0-9]{64}$/)
      expect(report.descartado).toBe(true)
    })
  }

  it("falha XSD interrompe antes da assinatura", async () => {
    const result = await runFiscalDryRunDetailed(dryRunSnapshot("simples"), {
      contexto: CTX,
      xsdAdapter: { async validate() {
        return { valid: false as const, outcome: "XML_INVALIDO" as const, issues: [{ message: "natOp ausente" }], engine: TEST_ENGINE, durationMs: 1 }
      } },
    })
    expect(result.report.status).toBe("erro")
    expect(result.report.xsd.status).toBe("xsd_invalido")
    expect(result.report.etapas.find((step) => step.nome === "assinatura")?.status).toBe("pulada")
    expect(result.xmlAssinado).toBeNull()
  })

  it("worker indisponível falha fechado", async () => {
    const report = await runFiscalDryRun(dryRunSnapshot("simples"), { contexto: CTX })
    expect(report.xsd.status).toBe("xsd_falha_infraestrutura")
    expect(report.prontoParaEmissao).toBe(false)
  })

  it("snapshot inválido pula XSD e não produz XML", async () => {
    const report = await runFiscalDryRun(dryRunSnapshot("invalido_item_sem_ncm"), OPTIONS)
    expect(report.status).toBe("erro")
    expect(report.hashXml).toBeNull()
    expect(report.etapas.find((step) => step.nome === "xsd")?.status).toBe("pulada")
  })

  it("XML assinado adulterado continua detectável", async () => {
    const result = await runFiscalDryRunDetailed(dryRunSnapshot("simples"), OPTIONS)
    const tampered = result.xmlAssinado!.replace("<vNF>50.00</vNF>", "<vNF>9999.00</vNF>")
    expect(verifyNfceSignature(tampered).valido).toBe(false)
  })

  it("relatório não contém XML, chave privada ou senha", async () => {
    const sink: string[] = []
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => sink.push(args.map(String).join(" ")))
    const report = await runFiscalDryRun(dryRunSnapshot("simples"), OPTIONS)
    const serialized = JSON.stringify(report) + sink.join("\n")
    expect(serialized).not.toContain("<infNFe")
    expect(serialized).not.toContain(TEST_KEY_PLAIN_PEM.slice(40, 120))
    expect(DRY_RUN_TEST_CERT.privateKeyPem).toContain("PRIVATE KEY")
  })

  it("resultado é determinístico apesar do envelope interno", async () => {
    const first = await runFiscalDryRun(dryRunSnapshot("simples"), OPTIONS)
    const second = await runFiscalDryRun(dryRunSnapshot("simples"), OPTIONS)
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
  })
})
