import { describe, expect, it } from "vitest"
import {
  crtFromRegime,
  isValidAmbiente,
  isValidCep,
  isValidCnae,
  isValidCnpj,
  isValidCodigoMunicipioIbge,
  isValidInscricaoEstadual,
  isValidModeloFiscal,
  isValidRegimeTributario,
  isValidUf,
  onlyDigits,
} from "./fiscal-validators"
import { RegimeTributario } from "@/generated/prisma"

describe("fiscal-validators", () => {
  it("onlyDigits remove máscara", () => {
    expect(onlyDigits("00.000.000/0001-00")).toBe("00000000000100")
    expect(onlyDigits(null)).toBe("")
  })

  describe("CNPJ", () => {
    it("aceita CNPJ válido (com e sem máscara)", () => {
      // CNPJ válido conhecido
      expect(isValidCnpj("11.222.333/0001-81")).toBe(true)
      expect(isValidCnpj("11222333000181")).toBe(true)
    })
    it("rejeita dígitos verificadores errados", () => {
      expect(isValidCnpj("11.222.333/0001-82")).toBe(false)
    })
    it("rejeita comprimento e sequências repetidas", () => {
      expect(isValidCnpj("123")).toBe(false)
      expect(isValidCnpj("00000000000000")).toBe(false)
    })
  })

  describe("IE", () => {
    it("aceita vazio, ISENTO e faixas de dígitos", () => {
      expect(isValidInscricaoEstadual("")).toBe(true)
      expect(isValidInscricaoEstadual("ISENTO")).toBe(true)
      expect(isValidInscricaoEstadual("123456789")).toBe(true)
    })
    it("rejeita curto demais", () => {
      expect(isValidInscricaoEstadual("1")).toBe(false)
    })
  })

  describe("UF / CEP / IBGE / CNAE", () => {
    it("UF válida e inválida", () => {
      expect(isValidUf("SP")).toBe(true)
      expect(isValidUf("sp")).toBe(true)
      expect(isValidUf("XX")).toBe(false)
    })
    it("CEP 8 dígitos (vazio ok)", () => {
      expect(isValidCep("")).toBe(true)
      expect(isValidCep("01310-100")).toBe(true)
      expect(isValidCep("123")).toBe(false)
    })
    it("código IBGE 7 dígitos (vazio ok)", () => {
      expect(isValidCodigoMunicipioIbge("")).toBe(true)
      expect(isValidCodigoMunicipioIbge("3550308")).toBe(true)
      expect(isValidCodigoMunicipioIbge("355030")).toBe(false)
    })
    it("CNAE 7 dígitos (vazio ok)", () => {
      expect(isValidCnae("")).toBe(true)
      expect(isValidCnae("4751201")).toBe(true)
      expect(isValidCnae("475120")).toBe(false)
    })
  })

  describe("enums fiscais", () => {
    it("ambiente", () => {
      expect(isValidAmbiente("HOMOLOGACAO")).toBe(true)
      expect(isValidAmbiente("PRODUCAO")).toBe(true)
      expect(isValidAmbiente("OUTRO")).toBe(false)
    })
    it("modelo", () => {
      expect(isValidModeloFiscal("NFCE")).toBe(true)
      expect(isValidModeloFiscal("SAT")).toBe(true)
      expect(isValidModeloFiscal("XPTO")).toBe(false)
    })
    it("regime", () => {
      expect(isValidRegimeTributario("SIMPLES_NACIONAL")).toBe(true)
      expect(isValidRegimeTributario("REGIME_NORMAL")).toBe(true)
      expect(isValidRegimeTributario("NENHUM")).toBe(false)
    })
  })

  describe("CRT derivado do regime (fonte única)", () => {
    it("mapeia corretamente", () => {
      expect(crtFromRegime(RegimeTributario.SIMPLES_NACIONAL)).toBe(1)
      expect(crtFromRegime(RegimeTributario.SIMPLES_NACIONAL_EXCESSO)).toBe(2)
      expect(crtFromRegime(RegimeTributario.REGIME_NORMAL)).toBe(3)
      expect(crtFromRegime(RegimeTributario.MEI)).toBe(4)
    })
  })
})
