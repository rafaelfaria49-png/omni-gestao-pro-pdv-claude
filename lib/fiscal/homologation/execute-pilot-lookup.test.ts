import { describe, expect, it, vi } from "vitest"
import { executePilotHomologationEmissionTransmission } from "./nfce-homologation-pilot-armed-wiring"

describe("executePilotHomologationEmissionTransmission · lookup do job", () => {
  it("não classifica job existente como job_nao_encontrado quando o select inclui id", async () => {
    const client = {
      fiscalEmissaoJob: {
        findUnique: vi.fn(async (args: { select?: Record<string, boolean> }) => {
          expect(args.select?.id).toBe(true)
          return { id: "job-1", storeId: "loja-1", tipo: "EMISSAO" }
        }),
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
    }

    const report = await executePilotHomologationEmissionTransmission(
      { jobId: "job-1", storeId: "loja-1" },
      { client: client as never },
    )

    expect(report.code).not.toBe("job_nao_encontrado")
    expect(report.code).toBe("pilot_emission_sem_execucao")
  })

  it("job ausente continua job_nao_encontrado", async () => {
    const client = {
      fiscalEmissaoJob: {
        findUnique: vi.fn(async () => null),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
      fiscalLog: {
        findFirst: vi.fn(async () => null),
        findMany: vi.fn(async () => []),
        create: vi.fn(async () => ({})),
      },
      configuracaoFiscalLoja: { findUnique: vi.fn(async () => null) },
      notaFiscal: { findFirst: vi.fn(async () => null) },
    }

    const report = await executePilotHomologationEmissionTransmission(
      { jobId: "job-ausente", storeId: "loja-1" },
      { client: client as never },
    )
    expect(report.code).toBe("job_nao_encontrado")
  })
})
