import { describe, expect, it, vi } from "vitest"
import { executePilotHomologationConsultationTransmission } from "./nfce-homologation-pilot-consultation-wiring"

function baseClient(overrides: Record<string, unknown> = {}) {
  return {
    fiscalEmissaoJob: {
      findUnique: vi.fn(async () => null),
      updateMany: vi.fn(async () => ({ count: 0 })),
      findMany: vi.fn(async () => []),
    },
    fiscalLog: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      create: vi.fn(async () => ({})),
    },
    configuracaoFiscalLoja: { findUnique: vi.fn(async () => null) },
    notaFiscal: { findFirst: vi.fn(async () => null) },
    ...overrides,
  }
}

describe("executePilotHomologationConsultationTransmission · lookup", () => {
  it("recusa job EMISSAO (nunca segunda transmissão)", async () => {
    const client = baseClient({
      fiscalEmissaoJob: {
        findUnique: vi.fn(async () => ({ id: "job-e", storeId: "loja-1", tipo: "EMISSAO" })),
        updateMany: vi.fn(async () => ({ count: 0 })),
        findMany: vi.fn(async () => []),
      },
    })
    const report = await executePilotHomologationConsultationTransmission(
      { jobId: "job-e", storeId: "loja-1" },
      { client: client as never },
    )
    expect(report.code).toBe("pilot_consulta_tipo_nao_suportado")
    expect(client.fiscalEmissaoJob.updateMany).not.toHaveBeenCalled()
  })

  it("job CONSULTA existente não é job_nao_encontrado", async () => {
    const client = baseClient({
      fiscalEmissaoJob: {
        findUnique: vi.fn(async (args: { select?: Record<string, boolean> }) => {
          expect(args.select?.id).toBe(true)
          return { id: "job-c", storeId: "loja-1", tipo: "CONSULTA" }
        }),
        updateMany: vi.fn(async () => ({ count: 0 })),
        findMany: vi.fn(async () => []),
      },
    })
    const report = await executePilotHomologationConsultationTransmission(
      { jobId: "job-c", storeId: "loja-1" },
      { client: client as never },
    )
    expect(report.code).not.toBe("job_nao_encontrado")
    expect(report.code).toBe("pilot_consulta_sem_execucao")
  })

  it("job ausente continua job_nao_encontrado", async () => {
    const report = await executePilotHomologationConsultationTransmission(
      { jobId: "job-ausente", storeId: "loja-1" },
      { client: baseClient() as never },
    )
    expect(report.code).toBe("job_nao_encontrado")
  })
})
