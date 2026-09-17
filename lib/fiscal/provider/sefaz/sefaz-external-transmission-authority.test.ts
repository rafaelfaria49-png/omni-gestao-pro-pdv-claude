/**
 * GOAL 022 · slice do runtime one-shot — authority externa de transmissão.
 *
 * Prova: binding/consumo one-shot, escopo (serviço/ambiente/loja), janela temporal,
 * não-forjabilidade, fábricas produtiva/de-teste e produção impossível pelo binding.
 * Nenhuma rede é aberta: o consumo devolve o runtime, e o teste produtivo só confere
 * a IDENTIDADE do runtime (`nodeSefazHttpsRuntimePorts`), jamais o invoca.
 */
import { describe, expect, it, vi } from "vitest"
import { nodeSefazHttpsRuntimePorts } from "./sefaz-runtime-ports"
import {
  consumeSefazExternalTransmissionAuthority,
  createSefazExternalConsultationAuthority,
  createSefazExternalTransmissionAuthority,
  createSefazExternalTransmissionTestAuthority,
  isSefazExternalTransmissionAuthority,
  sefazExternalTransmissionAuthorityStillActive,
  type SefazExternalTransmissionBinding,
} from "./sefaz-external-transmission-authority"

const NOW = new Date("2026-09-12T12:00:00.000Z")

function binding(overrides: Partial<SefazExternalTransmissionBinding> = {}): SefazExternalTransmissionBinding {
  return {
    activationId: "homolog-emissao-2026-09-12-a",
    storeId: "store-piloto",
    jobId: "job-emissao-1",
    servico: "NFeAutorizacao4",
    ambiente: "HOMOLOGACAO",
    notBeforeMs: NOW.getTime() - 60_000,
    expiresAtMs: NOW.getTime() + 5 * 60_000,
    ...overrides,
  }
}

const CTX = {
  servico: "NFeAutorizacao4",
  ambiente: "HOMOLOGACAO",
  storeId: "store-piloto",
  now: NOW,
}

describe("createSefazExternalTransmissionAuthority · fábrica produtiva", () => {
  it("binda exclusivamente o runtime canônico node:https (identidade, sem invocação)", () => {
    const authority = createSefazExternalTransmissionAuthority(binding())
    const consumed = consumeSefazExternalTransmissionAuthority(authority, CTX)
    expect(consumed).not.toBeNull()
    expect(consumed!.runtime).toBe(nodeSefazHttpsRuntimePorts)
  })

  it("recusa binding com janela maior que 15 minutos", () => {
    expect(() =>
      createSefazExternalTransmissionAuthority(
        binding({ notBeforeMs: NOW.getTime() - 60_000, expiresAtMs: NOW.getTime() + 16 * 60_000 }),
      ),
    ).toThrow(/inválido/i)
  })

  it("recusa activationId fora do padrão e campos vazios", () => {
    expect(() => createSefazExternalTransmissionAuthority(binding({ activationId: "curto" }))).toThrow()
    expect(() => createSefazExternalTransmissionAuthority(binding({ storeId: " " }))).toThrow()
    expect(() => createSefazExternalTransmissionAuthority(binding({ jobId: "" }))).toThrow()
  })

  it("recusa expiresAt <= notBefore", () => {
    expect(() =>
      createSefazExternalTransmissionAuthority(
        binding({ notBeforeMs: NOW.getTime(), expiresAtMs: NOW.getTime() }),
      ),
    ).toThrow()
  })
})

describe("consumeSefazExternalTransmissionAuthority · escopo e janela", () => {
  it("primeiro consumo autoriza; segundo consumo da MESMA authority é negado (one-shot)", () => {
    const authority = createSefazExternalTransmissionAuthority(binding())
    expect(consumeSefazExternalTransmissionAuthority(authority, CTX)).not.toBeNull()
    expect(consumeSefazExternalTransmissionAuthority(authority, CTX)).toBeNull()
  })

  it("authority futura (notBefore > now) não é consumível", () => {
    const authority = createSefazExternalTransmissionAuthority(
      binding({ notBeforeMs: NOW.getTime() + 60_000, expiresAtMs: NOW.getTime() + 10 * 60_000 }),
    )
    expect(consumeSefazExternalTransmissionAuthority(authority, CTX)).toBeNull()
  })

  it("authority expirada não é consumível", () => {
    const authority = createSefazExternalTransmissionAuthority(
      binding({ notBeforeMs: NOW.getTime() - 10 * 60_000, expiresAtMs: NOW.getTime() - 1_000 }),
    )
    expect(consumeSefazExternalTransmissionAuthority(authority, CTX)).toBeNull()
  })

  it("authority de loja diferente não autoriza a loja da requisição", () => {
    const authority = createSefazExternalTransmissionAuthority(binding({ storeId: "outra-loja" }))
    expect(consumeSefazExternalTransmissionAuthority(authority, CTX)).toBeNull()
  })

  it("serviço diferente de NFeAutorizacao4 nunca é autorizado (binding literal)", () => {
    const authority = createSefazExternalTransmissionAuthority(binding())
    expect(
      consumeSefazExternalTransmissionAuthority(authority, { ...CTX, servico: "NFeConsultaProtocolo4" }),
    ).toBeNull()
    expect(
      consumeSefazExternalTransmissionAuthority(authority, { ...CTX, servico: "NFeStatusServico4" }),
    ).toBeNull()
  })

  it("ambiente diferente de HOMOLOGACAO nunca é autorizado (binding literal)", () => {
    const authority = createSefazExternalTransmissionAuthority(binding())
    expect(consumeSefazExternalTransmissionAuthority(authority, { ...CTX, ambiente: "PRODUCAO" })).toBeNull()
  })

  it("token forjado (objeto estrutural/clonado) não atravessa o WeakMap", () => {
    const authority = createSefazExternalTransmissionAuthority(binding())
    const forged = { ...authority } as typeof authority
    const casted = {} as typeof authority
    expect(isSefazExternalTransmissionAuthority(forged)).toBe(false)
    expect(isSefazExternalTransmissionAuthority(casted)).toBe(false)
    expect(consumeSefazExternalTransmissionAuthority(forged, CTX)).toBeNull()
    expect(consumeSefazExternalTransmissionAuthority(casted, CTX)).toBeNull()
    expect(isSefazExternalTransmissionAuthority(authority)).toBe(true)
  })

  it("stillActive reflete janela sem consumir; após consumo fica inativo", () => {
    const authority = createSefazExternalTransmissionAuthority(binding())
    expect(sefazExternalTransmissionAuthorityStillActive(authority, NOW)).toBe(true)
    expect(consumeSefazExternalTransmissionAuthority(authority, CTX)).not.toBeNull()
    expect(sefazExternalTransmissionAuthorityStillActive(authority, NOW)).toBe(false)
  })
})

describe("createSefazExternalTransmissionTestAuthority · fábrica de teste", () => {
  it("exige NODE_ENV=test", () => {
    const runtime = { request: vi.fn(), createSecureContext: vi.fn() }
    vi.stubEnv("NODE_ENV", "production")
    expect(() => createSefazExternalTransmissionTestAuthority(binding(), runtime as never)).toThrow()
    vi.unstubAllEnvs()
  })

  it("binda o runtime injetado (prova sem rede) e mantém o mesmo contrato one-shot", () => {
    const runtime = { request: vi.fn(), createSecureContext: vi.fn() }
    const authority = createSefazExternalTransmissionTestAuthority(binding(), runtime as never)
    const consumed = consumeSefazExternalTransmissionAuthority(authority, CTX)
    expect(consumed).not.toBeNull()
    expect(consumed!.runtime).toBe(runtime)
    expect(consumeSefazExternalTransmissionAuthority(authority, CTX)).toBeNull()
  })

  it("recusa runtime inválido", () => {
    expect(() =>
      createSefazExternalTransmissionTestAuthority(binding(), {} as never),
    ).toThrow()
  })
})

describe("createSefazExternalConsultationAuthority · CONSULTA one-shot", () => {
  const CONSULTA_CTX = {
    servico: "NFeConsultaProtocolo4" as const,
    ambiente: "HOMOLOGACAO" as const,
    storeId: "store-piloto",
    now: NOW,
  }

  function consultaBinding() {
    return {
      activationId: "homolog-consulta-2026-09-17-a",
      storeId: "store-piloto",
      jobId: "job-consulta-1",
      servico: "NFeConsultaProtocolo4" as const,
      ambiente: "HOMOLOGACAO" as const,
      notBeforeMs: NOW.getTime() - 60_000,
      expiresAtMs: NOW.getTime() + 5 * 60_000,
    }
  }

  it("autoriza NFeConsultaProtocolo4 uma vez e recusa NFeAutorizacao4 e o segundo consumo", () => {
    const authority = createSefazExternalConsultationAuthority(consultaBinding())
    expect(
      consumeSefazExternalTransmissionAuthority(authority, { ...CONSULTA_CTX, servico: "NFeAutorizacao4" }),
    ).toBeNull()
    expect(consumeSefazExternalTransmissionAuthority(authority, CONSULTA_CTX)).not.toBeNull()
    expect(consumeSefazExternalTransmissionAuthority(authority, CONSULTA_CTX)).toBeNull()
  })

  it("recusa binding de emissão (NFeAutorizacao4) na fábrica de consulta", () => {
    expect(() =>
      createSefazExternalConsultationAuthority({
        ...consultaBinding(),
        servico: "NFeAutorizacao4",
      } as never),
    ).toThrow(/inválido/i)
  })
})
