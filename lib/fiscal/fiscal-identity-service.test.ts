import { describe, expect, it } from "vitest"
import {
  buildProviderConfig,
  normalizeFiscalConfigForUpsert,
  readCnaeFromProviderConfig,
  sanitizeFiscalConfigForClient,
  type FiscalConfigRow,
} from "./fiscal-identity-service"
import {
  AmbienteFiscal,
  FiscalProviderTipo,
  ModeloFiscal,
  RegimeTributario,
} from "@/generated/prisma"

function baseRow(over: Partial<FiscalConfigRow> = {}): FiscalConfigRow {
  return {
    storeId: "loja-2",
    fiscalEnabled: false,
    ambiente: AmbienteFiscal.HOMOLOGACAO,
    modeloFiscal: ModeloFiscal.NFCE,
    razaoSocial: "Empresa LTDA",
    nomeFantasia: "Loja",
    cnpj: "11222333000181",
    inscricaoEstadual: "ISENTO",
    inscricaoMunicipal: "",
    regimeTributario: RegimeTributario.SIMPLES_NACIONAL,
    crt: 1,
    logradouro: "Rua X",
    numero: "10",
    complemento: "",
    bairro: "Centro",
    codigoMunicipioIbge: "3550308",
    municipio: "São Paulo",
    uf: "SP",
    cep: "01310100",
    codigoPais: "1058",
    fone: "",
    email: "",
    cscId: "000001",
    cscTokenRef: "FISCAL_CSC_LOJA2",
    provider: FiscalProviderTipo.STUB_HOMOLOGACAO,
    providerConfig: { identidade: { cnae: "4751201" } },
    providerTokenRef: null,
    certificadoAtivoId: null,
    updatedAt: new Date("2026-06-18T00:00:00.000Z"),
    ...over,
  }
}

describe("fiscal-identity-service", () => {
  describe("normalizeFiscalConfigForUpsert", () => {
    it("deriva CRT do regime e nunca inclui fiscalEnabled", () => {
      const { data } = normalizeFiscalConfigForUpsert(
        { regimeTributario: "REGIME_NORMAL", cnpj: "11.222.333/0001-81", uf: "sp" },
        null,
      )
      expect(data.regimeTributario).toBe(RegimeTributario.REGIME_NORMAL)
      expect(data.crt).toBe(3)
      expect(data.cnpj).toBe("11222333000181")
      expect(data.uf).toBe("SP")
      expect("fiscalEnabled" in data).toBe(false)
    })

    it("cscTokenRef vazio vira null (não configurado)", () => {
      const { data } = normalizeFiscalConfigForUpsert({ cscTokenRef: "   " }, null)
      expect(data.cscTokenRef).toBeNull()
    })

    it("provider desconhecido cai no stub de homologação (dormente)", () => {
      const { data } = normalizeFiscalConfigForUpsert({ provider: "PROVIDER_PIRATA" }, null)
      expect(data.provider).toBe(FiscalProviderTipo.STUB_HOMOLOGACAO)
    })

    it("regime/ambiente/modelo inválidos caem em defaults seguros", () => {
      const { data } = normalizeFiscalConfigForUpsert(
        { regimeTributario: "X", ambiente: "Y", modeloFiscal: "Z" },
        null,
      )
      expect(data.regimeTributario).toBe(RegimeTributario.SIMPLES_NACIONAL)
      expect(data.ambiente).toBe(AmbienteFiscal.HOMOLOGACAO)
      expect(data.modeloFiscal).toBe(ModeloFiscal.NFCE)
    })

    it("grava CNAE no providerConfig.identidade.cnae preservando chaves existentes", () => {
      const { data } = normalizeFiscalConfigForUpsert(
        { cnae: "4751201" },
        { endpoints: { foo: "bar" } },
      )
      expect((data.providerConfig as Record<string, unknown>).endpoints).toEqual({ foo: "bar" })
      expect(readCnaeFromProviderConfig(data.providerConfig)).toBe("4751201")
    })
  })

  describe("buildProviderConfig", () => {
    it("normaliza CNAE para dígitos e mantém estrutura", () => {
      const out = buildProviderConfig({ identidade: { cnae: "x" }, k: 1 }, "4751-2/01")
      expect(out.k).toBe(1)
      expect(readCnaeFromProviderConfig(out)).toBe("4751201")
    })
  })

  describe("sanitizeFiscalConfigForClient", () => {
    it("não expõe o token CSC, apenas o indicador cscConfigured", () => {
      const out = sanitizeFiscalConfigForClient(baseRow())
      expect(out).not.toBeNull()
      expect(out!.cscConfigured).toBe(true)
      // Garantia: nenhum campo de segredo no payload
      expect("cscTokenRef" in (out as object)).toBe(false)
      expect("providerTokenRef" in (out as object)).toBe(false)
      expect("providerConfig" in (out as object)).toBe(false)
    })

    it("reflete fiscalEnabled (deve permanecer false nesta fase) e extrai CNAE", () => {
      const out = sanitizeFiscalConfigForClient(baseRow({ fiscalEnabled: false }))
      expect(out!.fiscalEnabled).toBe(false)
      expect(out!.cnae).toBe("4751201")
      expect(out!.crt).toBe(1)
    })

    it("cscConfigured false quando ref ausente", () => {
      const out = sanitizeFiscalConfigForClient(baseRow({ cscTokenRef: null }))
      expect(out!.cscConfigured).toBe(false)
    })

    it("retorna null para config inexistente", () => {
      expect(sanitizeFiscalConfigForClient(null)).toBeNull()
    })
  })
})
