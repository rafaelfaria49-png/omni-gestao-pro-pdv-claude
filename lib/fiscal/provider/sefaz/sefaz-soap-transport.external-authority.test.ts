/**
 * GOAL 022 · slice do runtime one-shot — transporte SOAP com authority EXTERNA.
 *
 * Prova, SEM rede real (a authority de teste binda runtime que aponta para servidor
 * TLS local): gates antes de segredo/TLS/socket, escopo da authority (loja/serviço),
 * one-shot, conflitos (runtime explícito + authority; externa + loopback), produção
 * bloqueada como PRIMEIRA barreira e o caminho autorizado ponta a ponta (mTLS local,
 * resposta recebida, externalTransmissionAttempted=true).
 */
import { createServer as createHttpsServer } from "node:https"
import { request as httpsRequest } from "node:https"
import { createSecureContext as tlsCreateSecureContext } from "node:tls"
import { afterAll, afterEach, describe, expect, it, vi } from "vitest"
import { canonicalEnvRef } from "@/lib/fiscal/vault/fiscal-secret-vault"
import { loadA1MtlsMaterial } from "@/lib/fiscal/certificate/a1-mtls-material"
import { createTestMtlsPki } from "./__fixtures__/mtls-test-pki"
import { SEFAZ_ENDPOINT_CATALOG, selectSefazEndpoint } from "./sefaz-endpoint-catalog"
import { createOfflineLoopbackTestAuthority } from "./sefaz-runtime-ports"
import {
  createSefazExternalTransmissionAuthority,
  createSefazExternalTransmissionTestAuthority,
  type SefazExternalTransmissionBinding,
} from "./sefaz-external-transmission-authority"
import { SefazSoapTransport } from "./sefaz-soap-transport"
import type { SefazTransportRequest } from "./sefaz-transport.types"

const STORE = "store-external-authority"
const PFX_REF = canonicalEnvRef("pfx", STORE)
const SENHA_REF = canonicalEnvRef("senha", STORE)
const pki = createTestMtlsPki()

const NOW_MS = Date.now()

function extBinding(overrides: Partial<SefazExternalTransmissionBinding> = {}): SefazExternalTransmissionBinding {
  return {
    activationId: "homolog-emissao-transport-test",
    storeId: STORE,
    jobId: "job-emissao-transport",
    servico: "NFeAutorizacao4",
    ambiente: "HOMOLOGACAO",
    notBeforeMs: NOW_MS - 60_000,
    expiresAtMs: NOW_MS + 5 * 60_000,
    ...overrides,
  }
}

function autorizacaoEndpoint() {
  const selected = selectSefazEndpoint({
    uf: "SP",
    ambiente: "HOMOLOGACAO",
    servico: "NFeAutorizacao4",
  })
  if (!selected.ok) throw new Error("catálogo sem NFeAutorizacao4/HOMOLOGACAO/SP")
  return selected.endpoint
}

function requestInput(overrides: Partial<SefazTransportRequest> = {}): SefazTransportRequest {
  return {
    endpoint: autorizacaoEndpoint(),
    contentType: "application/soap+xml; charset=utf-8",
    bodyBytes: Buffer.from("<enviNFe-teste/>", "utf8"),
    correlationId: "corr-external-authority-001",
    certificate: { storeId: STORE, blobRef: PFX_REF, senhaRef: SENHA_REF },
    connectionTimeoutMs: 2_000,
    totalDeadlineMs: 5_000,
    ...overrides,
  }
}

function materialLoader() {
  const env = {
    FISCAL_SECRET_PROVIDER: "env",
    [PFX_REF]: pki.clientPfx.toString("base64"),
    [SENHA_REF]: pki.clientPassphrase,
  }
  return (refs: Parameters<typeof loadA1MtlsMaterial>[0]) =>
    loadA1MtlsMaterial({ ...refs, env })
}

type Closable = { close: () => Promise<void> }
const running: Closable[] = []

afterEach(async () => {
  await Promise.all(running.splice(0).map((item) => item.close()))
  vi.unstubAllEnvs()
})

afterAll(() => {
  pki.clientPfx.fill(0)
  pki.wrongClientPfx.fill(0)
})

/** Servidor TLS local que aceita o cliente mTLS da PKI de teste e responde corpo curto. */
async function localMtlsServer(): Promise<{ port: number; requests: { headers: Record<string, string>; body: string }[] }> {
  const requests: { headers: Record<string, string>; body: string }[] = []
  const server = createHttpsServer(
    {
      key: pki.serverPrivateKeyPem,
      cert: pki.serverCertificatePem,
      ca: pki.caCertificatePem,
      requestCert: true,
      rejectUnauthorized: true,
      minVersion: "TLSv1.2",
    },
    (req, res) => {
      const chunks: Buffer[] = []
      req.on("data", (c: Buffer) => chunks.push(c))
      req.on("end", () => {
        requests.push({
          headers: req.headers as Record<string, string>,
          body: Buffer.concat(chunks).toString("utf8"),
        })
        res.writeHead(200, { "content-type": "application/soap+xml; charset=utf-8" })
        res.end("<retEnviNFe>ok</retEnviNFe>")
      })
    },
  )
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const port = (server.address() as { port: number }).port
  running.push({ close: () => new Promise<void>((resolve) => server.close(() => resolve())) })
  return { port, requests }
}

describe("SefazSoapTransport · authority externa: gates antes de segredo/TLS/socket", () => {
  it("sem authority nenhuma ⇒ tentativa não autorizada, nenhuma rede, nenhum A1", async () => {
    const transport = new SefazSoapTransport({ loadMaterial: materialLoader() })
    expect(transport.permiteRede).toBe(false)
    const outcome = await transport.send(requestInput())
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) {
      expect(outcome.codigo).toBe("transporte_tentativa_nao_autorizada")
      expect(outcome.externalTransmissionAttempted).toBe(false)
      expect(outcome.classification).toBe("BLOCKED_BEFORE_NETWORK")
    }
  })

  it("authority de loja diferente ⇒ bloqueio antes de rede", async () => {
    const authority = createSefazExternalTransmissionTestAuthority(
      extBinding({ storeId: "loja-errada" }),
      { request: vi.fn(), createSecureContext: vi.fn() } as never,
    )
    const transport = new SefazSoapTransport({ loadMaterial: materialLoader(), externalTransmissionAuthority: authority })
    const outcome = await transport.send(requestInput())
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) {
      expect(outcome.codigo).toBe("transporte_tentativa_nao_autorizada")
      expect(outcome.externalTransmissionAttempted).toBe(false)
    }
  })

  it("authority íntegra + endpoint de CONSULTA (serviço divergente) ⇒ bloqueio antes de rede", async () => {
    const consulta = selectSefazEndpoint({ uf: "SP", ambiente: "HOMOLOGACAO", servico: "NFeConsultaProtocolo4" })
    if (!consulta.ok) throw new Error("catálogo sem NFeConsultaProtocolo4")
    const authority = createSefazExternalTransmissionTestAuthority(
      extBinding(),
      { request: vi.fn(), createSecureContext: vi.fn() } as never,
    )
    const transport = new SefazSoapTransport({ loadMaterial: materialLoader(), externalTransmissionAuthority: authority })
    const outcome = await transport.send(requestInput({ endpoint: consulta.endpoint }))
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) {
      expect(outcome.codigo).toBe("transporte_tentativa_nao_autorizada")
      expect(outcome.externalTransmissionAttempted).toBe(false)
    }
  })

  it("PRODUCAO continua a PRIMEIRA barreira, mesmo com authority externa íntegra", async () => {
    const production = SEFAZ_ENDPOINT_CATALOG.find(
      (entry) => entry.ambiente === "PRODUCAO" && entry.servico === "NFeAutorizacao4",
    )
    if (!production) throw new Error("entrada explícita de produção ausente")
    const authority = createSefazExternalTransmissionAuthority(extBinding())
    const loadMaterial = vi.fn(materialLoader())
    const transport = new SefazSoapTransport({ loadMaterial, externalTransmissionAuthority: authority })
    const outcome = await transport.send(requestInput({ endpoint: production }))
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) {
      expect(outcome.codigo).toBe("transporte_producao_bloqueada")
      expect(outcome.externalTransmissionAttempted).toBe(false)
    }
    expect(loadMaterial).not.toHaveBeenCalled()
  })

  it("segundo consumo da MESMA authority ⇒ bloqueio (one-shot no transporte)", async () => {
    const authority = createSefazExternalTransmissionTestAuthority(
      extBinding(),
      { request: vi.fn(), createSecureContext: vi.fn() } as never,
    )
    const transport = new SefazSoapTransport({ loadMaterial: materialLoader(), externalTransmissionAuthority: authority })
    // Primeiro send consome a authority e falha no runtime fake — mas o consumo aconteceu.
    await transport.send(requestInput())
    const second = await transport.send(requestInput())
    expect(second.ok).toBe(false)
    if (!second.ok) {
      expect(second.codigo).toBe("transporte_tentativa_nao_autorizada")
      expect(second.externalTransmissionAttempted).toBe(false)
    }
  })

  it("runtime explícito + authority externa ⇒ conflito ⇒ bloqueio (bypass impossível)", async () => {
    const authority = createSefazExternalTransmissionAuthority(extBinding())
    const transport = new SefazSoapTransport({
      loadMaterial: materialLoader(),
      runtime: { request: vi.fn(), createSecureContext: vi.fn() } as never,
      externalTransmissionAuthority: authority,
    })
    expect(transport.permiteRede).toBe(false)
    const outcome = await transport.send(requestInput())
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.externalTransmissionAttempted).toBe(false)
  })

  it("authority externa + authority loopback juntas ⇒ conflito ⇒ bloqueio", async () => {
    const external = createSefazExternalTransmissionAuthority(extBinding())
    const loopback = createOfflineLoopbackTestAuthority({
      port: 8443,
      trustedCaPem: pki.caCertificatePem,
    })
    const transport = new SefazSoapTransport({
      loadMaterial: materialLoader(),
      offlineLoopbackTestAuthority: loopback,
      externalTransmissionAuthority: external,
    })
    expect(transport.permiteRede).toBe(false)
    const outcome = await transport.send(requestInput())
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.externalTransmissionAttempted).toBe(false)
  })

  it("authority expirada ⇒ bloqueio antes de rede", async () => {
    const authority = createSefazExternalTransmissionTestAuthority(
      extBinding({ notBeforeMs: NOW_MS - 10 * 60_000, expiresAtMs: NOW_MS - 1_000 }),
      { request: vi.fn(), createSecureContext: vi.fn() } as never,
    )
    const transport = new SefazSoapTransport({ loadMaterial: materialLoader(), externalTransmissionAuthority: authority })
    const outcome = await transport.send(requestInput())
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) {
      expect(outcome.codigo).toBe("transporte_tentativa_nao_autorizada")
      expect(outcome.externalTransmissionAttempted).toBe(false)
    }
  })
})

describe("SefazSoapTransport · caminho autorizado pela authority externa (mTLS local)", () => {
  it("consome a authority uma vez, negocia mTLS local e registra tentativa externa", async () => {
    const { port, requests } = await localMtlsServer()
    // Runtime de TESTE preso ao servidor local: mesma mecânica de destino que o loopback
    // canônico — aqui prova o CAMINHO externo do transporte sem tocar a SEFAZ real.
    const runtime = {
      createSecureContext: (options: Record<string, unknown>) =>
        // Trust do servidor local + credenciais do cliente preservadas (mTLS real).
        tlsCreateSecureContext({ ...options, ca: pki.caCertificatePem }),
      request: (options: Record<string, unknown>, onResponse: (res: unknown) => void) =>
        httpsRequest({ ...options, hostname: "127.0.0.1", port }, onResponse as never),
    }
    const authority = createSefazExternalTransmissionTestAuthority(extBinding(), runtime as never)
    const transport = new SefazSoapTransport({ loadMaterial: materialLoader(), externalTransmissionAuthority: authority })

    const outcome = await transport.send(requestInput())
    expect(outcome.ok).toBe(true)
    if (outcome.ok) {
      expect(outcome.classification).toBe("RESPONSE_RECEIVED")
      expect(outcome.externalTransmissionAttempted).toBe(true)
      expect(outcome.httpStatus).toBe(200)
      expect(Buffer.from(outcome.bodyBytes).toString("utf8")).toContain("<retEnviNFe>")
    }
    expect(requests).toHaveLength(1)
    expect(requests[0]!.body).toContain("<enviNFe-teste/>")

    // One-shot: nova tentativa com a MESMA authority (novo transporte) já não autoriza.
    const transport2 = new SefazSoapTransport({ loadMaterial: materialLoader(), externalTransmissionAuthority: authority })
    const second = await transport2.send(requestInput())
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.codigo).toBe("transporte_tentativa_nao_autorizada")
  })
})
