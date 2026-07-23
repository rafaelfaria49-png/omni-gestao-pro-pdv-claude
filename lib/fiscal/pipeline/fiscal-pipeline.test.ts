import { describe, expect, it } from "vitest"
import { dryRunSnapshot } from "../dry-run"
import type { FiscalNumberingPorts, NumberingNota } from "../numbering"
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

  it("aloca no contexto real antes da chave definitiva e antes do provider", async () => {
    const snapshot = dryRunSnapshot("simples")
    const events: string[] = []
    const nota: NumberingNota = {
      id: "nf-pipeline-numbering",
      storeId: snapshot.storeId,
      vendaId: snapshot.vendaId,
      modelo: snapshot.modelo,
      ambiente: snapshot.ambiente,
      serie: null,
      numero: null,
      serieFiscalId: null,
      localKey: `nfce:${snapshot.storeId}:${snapshot.vendaId}`,
    }
    const numberingPorts: FiscalNumberingPorts = {
      getNota: async () => ({ ...nota }),
      findActiveSerie: async () => ({
        id: "serie-pipeline",
        storeId: snapshot.storeId,
        modelo: snapshot.modelo,
        ambiente: snapshot.ambiente,
        serie: 1,
        ativo: true,
        proximoNumero: 77,
      }),
      reserveNextNumber: async () => {
        events.push("numbering.reserve")
        return { serieFiscalId: "serie-pipeline", serie: 1, numero: 77 }
      },
      bindNotaNumero: async ({ serieFiscalId, serie, numero }) => {
        events.push("numbering.bind")
        nota.serieFiscalId = serieFiscalId
        nota.serie = serie
        nota.numero = numero
        return { ok: true }
      },
    }
    const provider = createMockProvider({ clock: () => "2026-07-22T00:00:00.000Z" })
    const preparar = provider.prepararEmissao.bind(provider)
    let providerContext: { serie?: number | null; numero?: number | null } | null = null
    provider.prepararEmissao = (request) => {
      events.push("provider.preparar")
      providerContext = request.contexto
      return preparar(request)
    }

    const report = await runFiscalPipeline(snapshot, {
      xsdAdapter: XSD_OK_ADAPTER,
      notaFiscalId: nota.id,
      numbering: { ports: numberingPorts },
      provider,
    })

    expect(events).toEqual(["numbering.reserve", "numbering.bind", "provider.preparar"])
    expect(providerContext).toEqual(expect.objectContaining({ serie: 1, numero: 77 }))
    expect(report.chaveAcesso?.slice(22, 25)).toBe("001")
    expect(report.chaveAcesso?.slice(25, 34)).toBe("000000077")
    expect(report.provider?.emissao?.ok).toBe(true)
  })

  it("numeração integrada mantém produção/tpAmb=1 bloqueados antes do contador", async () => {
    const snapshot = { ...dryRunSnapshot("simples"), ambiente: "PRODUCAO" as const }
    let touched = false
    const ports: FiscalNumberingPorts = {
      getNota: async () => {
        touched = true
        return null
      },
      findActiveSerie: async () => null,
      reserveNextNumber: async () => ({
        ok: false,
        errorCode: "reserva_falhou",
        mensagem: "não deveria executar",
      }),
      bindNotaNumero: async () => ({ ok: true }),
    }
    await expect(
      runFiscalPipeline(snapshot, {
        xsdAdapter: XSD_OK_ADAPTER,
        notaFiscalId: "nf-prod-bloqueada",
        numbering: { ports },
      }),
    ).rejects.toMatchObject({ name: "FiscalPipelineNumberingError", errorCode: "ambiente_incompativel" })
    expect(touched).toBe(false)
  })

  it("sem porta de numeração continua determinístico e sem banco", async () => {
    const snapshot = dryRunSnapshot("simples")
    const first = await runFiscalPipeline(snapshot, OPTIONS)
    const second = await runFiscalPipeline(snapshot, OPTIONS)
    expect(first.chaveAcesso).toBe(second.chaveAcesso)
    expect(first.provider).toEqual(second.provider)
  })
})
