import { describe, expect, it } from "vitest"
import { DocumentoStorageFixture, documentoStorageRef } from "./documentos-fixture"
import {
  avaliarProvaPrivacidadeR2G003,
  criarStoragePrivadoR2G003,
  diagnosticarGateStorageG003,
  ehStoragePrivadoR2G003,
  GateStorageG003Error,
  resolverStorageDocumentosG003,
  type EventoAuditoriaStorageG003,
  type ProvaPrivacidadeBucketR2,
} from "./documentos-storage"

const ENV_R2_OK: Record<string, string> = {
  GESTOR_MONEY_STORAGE_G003_ENABLED: "true",
  CONTADOR_STORAGE_PROVIDER: "r2",
  R2_ACCOUNT_ID: "acct_sandbox_001",
  R2_ACCESS_KEY_ID: "synthetic-ak-value",
  R2_SECRET_ACCESS_KEY: "synthetic-sk-value",
  R2_BUCKET: "omni-gestao-privado",
}

const PROVA_PRIVADA_OK: ProvaPrivacidadeBucketR2 = {
  bucketExiste: true,
  r2DevPublico: false,
  dominiosPublicosCount: 0,
  probeAnonimoNegado: true,
  escopoCredencial: {
    restritoAoBucket: true,
    escopoGlobalConta: false,
    podeListarTodosBuckets: false,
    bucketAutorizado: "omni-gestao-privado",
  },
}

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

describe("G003-STORAGE gate formal de privacidade R2 (fail-closed)", () => {
  it("NUNCA considera publico:null sozinho como prova de privacidade", () => {
    expect(
      avaliarProvaPrivacidadeR2G003({ existe: true, publico: null }, null, "omni-gestao-privado"),
    ).toEqual({ ok: false, code: "bucket_inexistente" })

    expect(
      avaliarProvaPrivacidadeR2G003(
        { existe: true, publico: null },
        { ...PROVA_PRIVADA_OK, r2DevPublico: null },
        "omni-gestao-privado",
      ),
    ).toEqual({ ok: false, code: "privacidade_bucket_nao_comprovada" })

    expect(
      avaliarProvaPrivacidadeR2G003(
        { existe: true, publico: null },
        { ...PROVA_PRIVADA_OK, dominiosPublicosCount: null },
        "omni-gestao-privado",
      ),
    ).toEqual({ ok: false, code: "privacidade_bucket_nao_comprovada" })

    expect(
      avaliarProvaPrivacidadeR2G003(
        { existe: true, publico: null },
        { ...PROVA_PRIVADA_OK, probeAnonimoNegado: false },
        "omni-gestao-privado",
      ),
    ).toEqual({ ok: false, code: "privacidade_bucket_nao_comprovada" })
  })

  it("recusa bucket público (r2.dev ativo ou domínio público) e credenciais superprivilegiadas", () => {
    expect(
      avaliarProvaPrivacidadeR2G003(
        { existe: true, publico: null },
        { ...PROVA_PRIVADA_OK, r2DevPublico: true },
        "omni-gestao-privado",
      ),
    ).toEqual({ ok: false, code: "bucket_publico_detectado" })

    expect(
      avaliarProvaPrivacidadeR2G003(
        { existe: true, publico: null },
        { ...PROVA_PRIVADA_OK, dominiosPublicosCount: 1 },
        "omni-gestao-privado",
      ),
    ).toEqual({ ok: false, code: "bucket_publico_detectado" })

    expect(
      avaliarProvaPrivacidadeR2G003(
        { existe: true, publico: null },
        {
          ...PROVA_PRIVADA_OK,
          escopoCredencial: { ...PROVA_PRIVADA_OK.escopoCredencial!, escopoGlobalConta: true },
        },
        "omni-gestao-privado",
      ),
    ).toEqual({ ok: false, code: "escopo_credencial_invalido" })

    expect(
      avaliarProvaPrivacidadeR2G003(
        { existe: true, publico: null },
        {
          ...PROVA_PRIVADA_OK,
          escopoCredencial: { ...PROVA_PRIVADA_OK.escopoCredencial!, podeListarTodosBuckets: true },
        },
        "omni-gestao-privado",
      ),
    ).toEqual({ ok: false, code: "escopo_credencial_invalido" })

    expect(
      avaliarProvaPrivacidadeR2G003(
        { existe: true, publico: null },
        {
          ...PROVA_PRIVADA_OK,
          escopoCredencial: { ...PROVA_PRIVADA_OK.escopoCredencial!, bucketAutorizado: "outro-bucket" },
        },
        "omni-gestao-privado",
      ),
    ).toEqual({ ok: false, code: "escopo_credencial_invalido" })

    expect(
      avaliarProvaPrivacidadeR2G003({ existe: true, publico: null }, PROVA_PRIVADA_OK, "omni-gestao-privado"),
    ).toEqual({ ok: true, bucket: { existe: true, publico: false } })
  })

  it("bloqueia runtime quando flag está desligada, falta verificador real ou há segredo em NEXT_PUBLIC_*", () => {
    expect(() => resolverStorageDocumentosG003({ env: { ...ENV_R2_OK, GESTOR_MONEY_STORAGE_G003_ENABLED: "false" } }))
      .toThrow(GateStorageG003Error)
    expect(() => resolverStorageDocumentosG003({ env: ENV_R2_OK }))
      .toThrow(GateStorageG003Error)
    expect(() => resolverStorageDocumentosG003({
      env: { ...ENV_R2_OK, NEXT_PUBLIC_R2_SECRET_ACCESS_KEY: "vazado" },
      verificadorPrivacidade: { verificarPrivacidadeEEscopo: async () => PROVA_PRIVADA_OK },
    })).toThrow(GateStorageG003Error)

    const diag = diagnosticarGateStorageG003(ENV_R2_OK)
    expect(diag.runtimeLiberado).toBe(false)
    expect(diag.bloqueioCodigo).toBe("privacidade_bucket_nao_comprovada")
    expect(JSON.stringify(diag)).not.toContain("synthetic-ak-value")
    expect(JSON.stringify(diag)).not.toContain("synthetic-sk-value")
  })

  it("impede falsificação da marca privada e impõe namespace gastos/v1, criação exclusiva e TTL <= 60s", async () => {
    expect(ehStoragePrivadoR2G003({ ambiente: "r2_privado_g003" })).toBe(false)

    const fixtureBase = new DocumentoStorageFixture()
    const eventos: EventoAuditoriaStorageG003[] = []
    const r2Simulado = {
      verificarBucket: async () => ({ existe: true, publico: null }),
      enviarConteudoPrivado: fixtureBase.enviarConteudoPrivado.bind(fixtureBase),
      obterMetadata: fixtureBase.obterMetadata.bind(fixtureBase),
      abrirConteudoPrivado: fixtureBase.abrirConteudoPrivado.bind(fixtureBase),
      criarDownloadAssinado: fixtureBase.criarDownloadAssinado.bind(fixtureBase),
      removerObjeto: fixtureBase.removerObjeto.bind(fixtureBase),
    }

    const storage = criarStoragePrivadoR2G003({
      env: ENV_R2_OK,
      storageBase: r2Simulado,
      verificadorPrivacidade: { verificarPrivacidadeEEscopo: async () => PROVA_PRIVADA_OK },
      onAuditoria: (ev) => eventos.push(ev),
    })

    expect(ehStoragePrivadoR2G003(storage)).toBe(true)
    expect(await storage.verificarBucket()).toEqual({ existe: true, publico: false })

    // Bloqueia acesso ao namespace do Contador ou path arbitrário
    await expect(storage.abrirConteudoPrivado("contador/store-1/2026-11/doc-1/arquivo.pdf")).rejects.toMatchObject({ status: 404 })
    await expect(storage.enviarConteudoPrivado("contador/store-1/a", Buffer.from("x"), "text/plain")).rejects.toMatchObject({ status: 404 })

    const ref = documentoStorageRef("perfil-1", "doc-r2-1")
    await storage.enviarConteudoPrivado(ref, Buffer.from("recibo-r2"), "text/plain")
    // Criação exclusiva: não sobrescreve
    await expect(storage.enviarConteudoPrivado(ref, Buffer.from("outro"), "text/plain")).rejects.toMatchObject({ status: 409 })
    // TTL acima de 60s é recusado
    await expect(storage.criarDownloadAssinado(ref, "recibo.txt", 61)).rejects.toMatchObject({ status: 404 })
    const dl = await storage.criarDownloadAssinado(ref, "recibo.txt", 60)
    expect(dl.expiresInSec).toBe(60)
    // Auditoria não vaza URL assinada nem conteúdo
    const serialized = JSON.stringify(eventos)
    expect(serialized).toContain("GATE_VERIFICADO")
    expect(serialized).toContain("OBJETO_GRAVADO")
    expect(serialized).toContain("DOWNLOAD_ASSINADO")
    expect(serialized).not.toContain(dl.signedUrl)
    expect(serialized).not.toContain("recibo-r2")
  })
})
