import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { storageR2 } from "@/lib/contador/documentos/storage-r2"
import { PessoasError } from "../domain"
import { nomeDownloadNeutro } from "./politica"

// Presign SigV4 é cálculo local: nenhuma chamada de rede. Credenciais fictícias.
const R2 = {
  R2_ACCOUNT_ID: "contaficticia", R2_ACCESS_KEY_ID: "ACESSOFICTICIO",
  R2_SECRET_ACCESS_KEY: "segredo-ficticio", R2_BUCKET: "bucket-ficticio",
}
const anterior: Record<string, string | undefined> = {}

describe("Pessoas: nome neutro na URL assinada de download", () => {
  beforeAll(() => {
    for (const [k, v] of Object.entries(R2)) { anterior[k] = process.env[k]; process.env[k] = v }
  })
  afterAll(() => {
    for (const k of Object.keys(R2)) {
      if (anterior[k] === undefined) delete process.env[k]
      else process.env[k] = anterior[k]
    }
  })

  it("deriva o nome só do MIME validado", () => {
    expect(nomeDownloadNeutro("application/pdf")).toBe("documento.pdf")
    expect(nomeDownloadNeutro("image/png")).toBe("documento.png")
    expect(nomeDownloadNeutro("image/jpeg")).toBe("documento.jpg")
    for (const mime of ["text/html", "", "constructor", "APPLICATION/PDF"]) {
      expect(() => nomeDownloadNeutro(mime)).toThrowError(PessoasError)
    }
  })

  it("a URL do adaptador real não contém nome nem CPF do arquivo original", async () => {
    const original = "CTPS Maria Sintetica da Silva 529.982.247-25.pdf"
    const { signedUrl } = await storageR2.criarDownloadAssinado(
      "pessoas/empregador-0001/loja-0001/documento-0001", nomeDownloadNeutro("application/pdf"), 300,
    )
    const disposicao = new URL(signedUrl).searchParams.get("response-content-disposition")
    expect(disposicao).toBe('attachment; filename="documento.pdf"')
    const url = decodeURIComponent(signedUrl)
    for (const fragmento of [original, "Maria", "Sintetica", "Silva", "CTPS", "529.982.247-25", "52998224725"]) {
      expect(url).not.toContain(fragmento)
    }
  })
})
