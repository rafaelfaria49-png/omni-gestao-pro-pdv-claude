import { describe, expect, it } from "vitest"
import { DocumentoStorageFixture, documentoStorageRef } from "./documentos-fixture"

describe("G003 adapter de fixture privado (sem bucket real)", () => {
  it("objeto é exclusivo, devolve cópia e capability expira sem URL/path público", async () => {
    let now = 1000
    const storage = new DocumentoStorageFixture(() => now), path = documentoStorageRef("perfil-1", "documento-1")
    await storage.enviarConteudoPrivado(path, Buffer.from("recibo"), "text/plain")
    await expect(storage.enviarConteudoPrivado(path, Buffer.from("alterado"), "text/plain")).rejects.toThrow()
    const bytes = await storage.abrirConteudoPrivado(path)
    bytes[0] = 0
    expect((await storage.abrirConteudoPrivado(path)).toString()).toBe("recibo")
    const url = await storage.criarDownloadAssinado(path, "recibo.txt")
    expect(url.signedUrl).not.toContain("perfil-1")
    expect((await storage.consumirDownload(url.signedUrl)).toString()).toBe("recibo")
    now += 60_000
    await expect(storage.consumirDownload(url.signedUrl)).rejects.toThrow()
  })
  it.each(["../x", "a/b", "a%2fb", "file://x", "C:\\arquivo"])("namespace %s não aceita traversal ou caminho livre", id => {
    expect(() => documentoStorageRef(id, "doc")).toThrow()
    expect(() => documentoStorageRef("perfil", id)).toThrow()
  })
})
