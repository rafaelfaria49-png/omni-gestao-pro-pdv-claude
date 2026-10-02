import { randomBytes } from "node:crypto"
import { describe, expect, it } from "vitest"
import { emitirIntent, verificarIntent } from "./intent"

const env = { PESSOAS_DOCUMENT_INTENT_KEY: randomBytes(32).toString("base64") }
const dados = {
  empregadorId: "empregador1", storeId: "loja-0001", userId: "usuario001",
  pessoaId: "pessoa0001", vinculoId: "vinculo001", documentoId: "documento001",
  storageRef: "pessoas/empregador1/loja-0001/documento001",
  categoria: "contrato", origem: "INTERNO" as const, nomeArquivo: "contrato.pdf",
  mime: "application/pdf", bytes: 10, sha256: "a".repeat(64),
}

describe("Pessoas: autorização assinada do upload", () => {
  it("vincula escopo, metadados e expiração", () => {
    const token = emitirIntent(dados, 1_000_000, env)
    expect(verificarIntent(token, 1_000_001, env)).toMatchObject(dados)
    expect(() => verificarIntent(token, 1_601_000, env)).toThrow()
    const [body, sig] = token.split(".")
    const alterado = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString("utf8")), storeId: "loja-0002" }),
    ).toString("base64url")
    expect(() => verificarIntent(alterado + "." + sig, 1_000_001, env)).toThrow()
  })
  it("sem chave própria, não emite autorização", () => {
    expect(() => emitirIntent(dados, Date.now(), {})).toThrow()
  })
})
