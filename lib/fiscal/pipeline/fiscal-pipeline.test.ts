import { describe, expect, it } from "vitest"
import { dryRunSnapshot } from "../dry-run"
import { createMockProvider } from "../provider"
import { TEST_XSD_ENGINE as TEST_ENGINE, XSD_OK_ADAPTER } from "../xsd/__fixtures__/xsd-adapter-fixtures"
import { runFiscalPipeline } from "./index"

const OPTIONS = { contexto: { serie: 1, numero: 42 }, xsdAdapter: XSD_OK_ADAPTER }

describe("pipeline fiscal com gate XSD", () => {
  it("só alcança provider depois de XSD real aprovado", async () => {
    const report = await runFiscalPipeline(dryRunSnapshot("simples"), OPTIONS)
    expect(report.dryRun.xsd.status).toBe("xsd_ok")
    expect(report.provider?.emissao?.ok).toBe(true)
    expect(report.prontoParaHomologacao).toBe(true)
    expect(report.etapas.find((step) => step.nome === "dry_run")?.status).toBe("ok")
  })

  it("XSD inválido bloqueia provider", async () => {
    const report = await runFiscalPipeline(dryRunSnapshot("simples"), {
      contexto: OPTIONS.contexto,
      xsdAdapter: { async validate() {
        return { valid: false as const, outcome: "XML_INVALIDO" as const, issues: [{ message: "fora do schema" }], engine: TEST_ENGINE, durationMs: 1 }
      } },
    })
    expect(report.provider).toBeNull()
    expect(report.prontoParaHomologacao).toBe(false)
    expect(report.etapas.find((step) => step.nome === "provider_emissao")?.status).toBe("pulada")
  })

  it("snapshot inválido e erro de provider continuam fail-closed", async () => {
    const invalid = await runFiscalPipeline(dryRunSnapshot("invalido_item_sem_ncm"), OPTIONS)
    expect(invalid.provider).toBeNull()
    const provider = createMockProvider({ outcomes: { emitir: "erro" } })
    const failed = await runFiscalPipeline(dryRunSnapshot("simples"), { ...OPTIONS, provider })
    expect(failed.status).toBe("erro")
    expect(failed.prontoParaHomologacao).toBe(false)
  })
})
