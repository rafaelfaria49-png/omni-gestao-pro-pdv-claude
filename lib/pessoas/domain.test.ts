import { randomBytes } from "node:crypto"
import { describe, expect, it } from "vitest"
import {
  abrirCpf, comandoId, cpfNormalizado, dataCivil, dataCivilDto, decimalCanonico,
  exigirModulo, hashComando, PessoasError, protegerCpf,
} from "./domain"
import { pendenciasCadastro } from "./cadastro-validation"

const env = {
  PESSOAS_CPF_ENC_KEY: randomBytes(32).toString("base64"),
  PESSOAS_CPF_HMAC_KEY: randomBytes(32).toString("base64"),
}

describe("Pessoas: codecs e proteção", () => {
  it("flag OFF bloqueia antes do domínio", () => {
    expect(() => exigirModulo({})).toThrowError(PessoasError)
    expect(() => exigirModulo({ PESSOAS_DP_ENABLED: "ON" })).toThrowError()
    expect(() => exigirModulo({ PESSOAS_DP_ENABLED: "on" })).not.toThrow()
  })

  it("datas civis são validadas sem fuso", () => {
    expect(dataCivilDto(dataCivil("2024-02-29"))).toBe("2024-02-29")
    expect(() => dataCivil("2025-02-29")).toThrow()
    expect(() => dataCivil("2026-13-01")).toThrow()
    expect(dataCivil(null)).toBeNull()
  })

  it("Decimal de dinheiro exige string canônica exata", () => {
    expect(decimalCanonico("1234.50")).toBe("1234.50")
    for (const valor of ["1", "1.2", "-1.00", "01.00", "NaN", "1,00"]) {
      expect(() => decimalCanonico(valor)).toThrow()
    }
  })

  it("CPF é validado, cifrado com autenticação e indexado por empregador", () => {
    const cpf = cpfNormalizado("529.982.247-25")!
    expect(cpf).toBe("52998224725")
    const a = protegerCpf(cpf, "emp-00001", env)
    const b = protegerCpf(cpf, "emp-00002", env)
    expect(a.cpfHash).not.toBe(b.cpfHash)
    expect(a.cpfCipher).not.toContain(cpf)
    expect(abrirCpf(a.cpfCipher, "emp-00001", env)).toBe(cpf)
    expect(() => abrirCpf(a.cpfCipher, "emp-00002", env)).toThrow()
    const partes = a.cpfCipher.split(".")
    partes[2] = randomBytes(8).toString("base64url")
    expect(() => abrirCpf(partes.join("."), "emp-00001", env)).toThrow()
    expect(() => cpfNormalizado("111.111.111-11")).toThrow()
  })

  it("chave ausente bloqueia operações dependentes, sem fallback", () => {
    expect(() => protegerCpf("52998224725", "emp-00001", {})).toThrow()
    expect(() => hashComando({ a: 1 }, {})).toThrow()
    expect(hashComando({ a: 1 }, env)).not.toBe(hashComando({ a: 2 }, env))
  })

  it("rascunho informa campos faltantes, sem inventar admissão", () => {
    const ausentes = pendenciasCadastro({
      nome: "Ana", cpf: null, matricula: null, admissao: null, regime: null, categoria: null,
      cargo: null, cbo: null, salarioBase: null, unidadeSalario: null,
      jornadaSemanal: null, divisor: null, contractValidFrom: null,
    })
    expect(ausentes).toContain("admissao")
    expect(ausentes).toContain("salarioBase")
    expect(comandoId("abcdefgh")).toBe("abcdefgh")
    expect(() => comandoId("1")).toThrow()
  })
})
