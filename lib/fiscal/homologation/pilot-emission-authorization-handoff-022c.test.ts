/**
 * GOAL 022C — ciclo de vida da prova opaca de EMISSAO + integração offline ponta a ponta.
 *
 * Parte 1 — prova (`pilot-emission-gate.ts`): nasce SOMENTE do consumo persistente
 * one-shot da ativação, vinculada a activation/job/store/nota + serviço literal
 * `NFeAutorizacao4` + ambiente literal `HOMOLOGACAO` + janela vigente. Objeto
 * estrutural, spread, JSON ou ativação forjada NÃO produzem prova válida; o consumo
 * é one-shot e a falha de validação NÃO queima a prova.
 *
 * Parte 2 — integração offline (item 8 do GOAL): activation consume → capability →
 * authority → executor armado → queue-worker → provider fake/loopback. O transporte
 * fake responde 104+100 AUTORIZADO com a chave ecoada do envelope (loopback puro).
 * Zero rede externa (spy em `globalThis.fetch`), zero SEFAZ, zero Neon write
 * (ledger/persistência/A1/XSD/cofre todos fake em memória).
 *
 * Parte 3 — PRODUCAO e janela: configuração fora de HOMOLOGACAO nega antes de
 * qualquer rede, sem consumir a ativação.
 */
import { describe, expect, it, vi } from "vitest"
import { createTestMtlsPki } from "@/lib/fiscal/provider/sefaz/__fixtures__/mtls-test-pki"
import { canonicalEnvRef } from "@/lib/fiscal/vault/fiscal-secret-vault"
import { OFFICIAL_XSD_MANIFEST_SHA256, XSD_SCHEMA_PACKAGE } from "@/lib/fiscal/xsd"
import type { XsdValidationAdapter, XsdValidationResult } from "@/lib/fiscal/xsd"
import type { UncertainStatePersistence } from "@/lib/fiscal/emission/uncertain-state.types"
import type { FiscalQueueJob } from "@/lib/fiscal/queue/queue.types"
import type {
  SefazTransport,
  SefazTransportRequest,
} from "@/lib/fiscal/provider/sefaz/sefaz-transport.types"
import { buildVendaFiscalSnapshot } from "@/lib/fiscal/venda-fiscal-snapshot"
import { sanitizeProdutoFiscal } from "@/lib/produto-fiscal"
import { createArmedNfceHomologationPilotWiring } from "./nfce-homologation-pilot-armed-wiring"
import {
  consumePilotEmissionActivation,
  consumePilotEmissionAuthorizationProof,
  createPilotEmissionAuthorizationProof,
  isPilotEmissionAuthorizationProof,
} from "./pilot-emission-gate"
import type { PilotEmissionWindowConfig } from "./pilot-emission-gate"
import { drainFiscalQueue } from "../queue/queue-worker"
import type {
  FiscalQueueExecutionResult,
  FiscalQueueLease,
  FiscalQueuePauseSnapshot,
  FiscalQueueWorkerPorts,
} from "../queue/queue.types"

const NOW = new Date("2026-09-12T12:00:00.000Z")
const STORE = "store-piloto-022c"
const JOB_ID = "job-022c-1"
const NOTA_ID = "nota-022c-1"
const VENDA_ID = "venda-022c-1"
const PFX_REF = canonicalEnvRef("pfx", STORE)
const SENHA_REF = canonicalEnvRef("senha", STORE)
const ACTIVATION = "homolog-022c-handoff-test-01"

function window022c(activationId = ACTIVATION): PilotEmissionWindowConfig {
  return {
    activationId,
    notBeforeUtc: new Date(NOW.getTime() - 5 * 60_000).toISOString(),
    expiresAtUtc: new Date(NOW.getTime() + 10 * 60_000).toISOString(),
  }
}

/** Ledger fake com unicidade REAL de (storeId, dedupeKey) — a mesma semântica do banco. */
function ledgerClient(options: { fail?: boolean } = {}) {
  const created = new Set<string>()
  return {
    createdCount: () => created.size,
    $transaction: async (op: (tx: never) => Promise<unknown>) => {
      if (options.fail) throw new Error("persistência indisponível")
      return op({
        fiscalEmissaoJob: {
          create: async (args: unknown) => {
            const data = (args as { data: { storeId: string; dedupeKey: string } }).data
            const key = `${data.storeId}::${data.dedupeKey}`
            if (created.has(key)) {
              const err = new Error("Unique constraint failed")
              ;(err as { code?: string }).code = "P2002"
              throw err
            }
            created.add(key)
            return { id: `ledger-${created.size}` }
          },
        },
        fiscalLog: { create: async () => ({}) },
      } as never)
    },
  }
}

async function consumoOk(
  trio = { jobId: JOB_ID, storeId: STORE, notaFiscalId: NOTA_ID as string | null },
  window = window022c(),
  ledger = ledgerClient(),
) {
  const consumed = await consumePilotEmissionActivation(
    ledger as never,
    window,
    { ...trio, operatorId: "operador-022c" },
    () => NOW,
  )
  if (!consumed.ok) throw new Error(`consumo esperado OK: ${consumed.code}`)
  return { activation: consumed.activation, ledger }
}

describe("022C · ciclo de vida da prova opaca de EMISSAO", () => {
  it("nasce do consumo persistente para o trio exato; é reconhecida por identidade", async () => {
    const { activation } = await consumoOk()
    const proof = createPilotEmissionAuthorizationProof(activation, {
      jobId: JOB_ID,
      storeId: STORE,
      notaFiscalId: NOTA_ID,
    })
    expect(proof).not.toBeNull()
    expect(isPilotEmissionAuthorizationProof(proof)).toBe(true)
  })

  it("ativação forjada (fora do ledger) não gera prova", async () => {
    expect(
      createPilotEmissionAuthorizationProof({} as never, {
        jobId: JOB_ID,
        storeId: STORE,
        notaFiscalId: NOTA_ID,
      }),
    ).toBeNull()
  })

  it("trio divergente do consumo não gera prova (job/store/nota)", async () => {
    const { activation } = await consumoOk()
    expect(
      createPilotEmissionAuthorizationProof(activation, {
        jobId: "job-OUTRO",
        storeId: STORE,
        notaFiscalId: NOTA_ID,
      }),
    ).toBeNull()
    expect(
      createPilotEmissionAuthorizationProof(activation, {
        jobId: JOB_ID,
        storeId: "loja-OUTRA",
        notaFiscalId: NOTA_ID,
      }),
    ).toBeNull()
    expect(
      createPilotEmissionAuthorizationProof(activation, {
        jobId: JOB_ID,
        storeId: STORE,
        notaFiscalId: "nota-OUTRA",
      }),
    ).toBeNull()
    expect(
      createPilotEmissionAuthorizationProof(activation, {
        jobId: JOB_ID,
        storeId: STORE,
        notaFiscalId: "",
      }),
    ).toBeNull()
  })

  it("consumo sem nota não gera prova (nota vazia no binding)", async () => {
    const { activation } = await consumoOk({ jobId: JOB_ID, storeId: STORE, notaFiscalId: null })
    expect(
      createPilotEmissionAuthorizationProof(activation, {
        jobId: JOB_ID,
        storeId: STORE,
        notaFiscalId: NOTA_ID,
      }),
    ).toBeNull()
  })

  it("janela encerrada não gera prova", async () => {
    const ledger = ledgerClient()
    const consumed = await consumePilotEmissionActivation(
      ledger as never,
      window022c(),
      { jobId: JOB_ID, storeId: STORE, notaFiscalId: NOTA_ID, operatorId: "operador-022c" },
      () => new Date(NOW.getTime() + 60 * 60_000),
    )
    expect(consumed.ok).toBe(false)
  })

  it("spread/JSON/objeto estrutural NÃO são provas", async () => {
    const { activation } = await consumoOk()
    const proof = createPilotEmissionAuthorizationProof(activation, {
      jobId: JOB_ID,
      storeId: STORE,
      notaFiscalId: NOTA_ID,
    })
    expect(isPilotEmissionAuthorizationProof({ ...proof })).toBe(false)
    expect(isPilotEmissionAuthorizationProof(JSON.parse(JSON.stringify(proof)))).toBe(false)
    expect(isPilotEmissionAuthorizationProof({})).toBe(false)
    expect(isPilotEmissionAuthorizationProof(null)).toBe(false)
    expect(isPilotEmissionAuthorizationProof("prova")).toBe(false)
  })

  it("consumo one-shot: primeiro true, segundo false; falha de validação não queima", async () => {
    const { activation } = await consumoOk()
    const proof = createPilotEmissionAuthorizationProof(activation, {
      jobId: JOB_ID,
      storeId: STORE,
      notaFiscalId: NOTA_ID,
    })
    const trio = { jobId: JOB_ID, storeId: STORE, notaFiscalId: NOTA_ID }
    expect(consumePilotEmissionAuthorizationProof(proof, { ...trio, jobId: "job-ERRADO" })).toBe(false)
    expect(consumePilotEmissionAuthorizationProof(proof, { ...trio, now: NOW })).toBe(true)
    expect(consumePilotEmissionAuthorizationProof(proof, { ...trio, now: NOW })).toBe(false)
  })
})

/* ========================================================================== *
 * Integração offline ponta a ponta (item 8 do GOAL)
 * ========================================================================== */

const pki = createTestMtlsPki()

function notaRowFixture() {
  const built = buildVendaFiscalSnapshot({
    storeId: STORE,
    vendaId: VENDA_ID,
    loja: {
      cnpj: "11.222.333/0001-81",
      razaoSocial: "RafaCell Comércio LTDA (SINTÉTICO)",
      nomeFantasia: "RafaCell",
      inscricaoEstadual: "123456789",
      inscricaoMunicipal: "987654",
      regimeTributario: "SIMPLES_NACIONAL",
      crt: 1,
      ambiente: "HOMOLOGACAO",
      modeloFiscal: "NFCE",
      fiscalEnabled: true,
      logradouro: "Rua das Flores",
      numero: "100",
      complemento: "",
      bairro: "Centro",
      codigoMunicipioIbge: "3550308",
      municipio: "São Paulo",
      uf: "SP",
      cep: "01001-000",
      codigoPais: "1058",
      fone: "",
      email: "",
    },
    cliente: null,
    venda: {
      pedidoId: "VDA-SINT-022C",
      data: "2026-09-12T11:30:00.000Z",
      total: 50,
      desconto: 0,
      operador: "validacao",
      terminal: "PDV1",
      paymentBreakdown: { dinheiro: 50 },
    },
    itens: [
      {
        itemVendaId: "iv-1",
        produtoId: "prod-1",
        codigoProduto: "SKU-1",
        descricao: "Item sintético de validação",
        gtin: "7891234567890",
        quantidade: 2,
        valorUnitario: 25,
        valorDesconto: 0,
        valorTotal: 50,
        fiscal: sanitizeProdutoFiscal({ ncm: "85176200", cfop: "5102", csosn: "102", origem: "0", unidade: "UN" }),
      },
    ],
  })
  if (!built.ok) throw new Error(`snapshot fixture inválido: ${built.code}`)
  const snap = built.snapshot
  return {
    id: NOTA_ID,
    storeId: STORE,
    vendaId: VENDA_ID,
    modelo: "NFCE",
    ambiente: "HOMOLOGACAO",
    serie: 1,
    numero: 42,
    tipoEmissao: "NORMAL",
    dataContingencia: null,
    justContingencia: null,
    localKey: "corr-022c-001",
    snapshotEmitente: snap.emitente,
    snapshotDestinatario: snap.destinatario,
    snapshotPagamento: {
      versao: snap.versao,
      geradoEm: snap.geradoEm,
      venda: snap.venda,
      totais: snap.totais,
      diagnostico: snap.diagnostico,
      tributacao: snap.tributacao ?? null,
    },
    itens: snap.itens.map((it) => ({
      numeroItem: it.numeroItem,
      itemVendaId: it.itemVendaId,
      produtoId: it.produtoId,
      codigoProduto: it.codigoProduto,
      descricao: it.descricao,
      gtin: it.gtin,
      ncm: it.ncm,
      cest: it.cest,
      cfop: it.cfop,
      cst: it.cst,
      csosn: it.csosn,
      origemMercadoria: Number(it.origemMercadoria ?? 0),
      unidadeComercial: it.unidadeComercial,
      quantidade: it.quantidade,
      valorUnitario: it.valorUnitario,
      valorDesconto: it.valorDesconto,
      valorTotal: it.valorTotal,
    })),
  }
}

function job022c(): FiscalQueueJob {
  return {
    id: JOB_ID,
    storeId: STORE,
    vendaId: VENDA_ID,
    notaFiscalId: NOTA_ID,
    tipo: "EMISSAO",
    status: "PENDENTE",
    tentativas: 0,
    maxTentativas: 1,
    proximaTentativaEm: NOW,
    prioridade: 0,
    lockOwner: null,
    lockedAt: null,
    lockExpiresAt: null,
    dedupeKey: "fiscal:emissao:v1:venda:venda-022c-1",
    payload: {},
    ultimoErro: null,
    concluidoEm: null,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function xsdAdapterApproved() {
  const adapter: XsdValidationAdapter = {
    validate: async () => {
      const result: XsdValidationResult = {
        valid: true,
        outcome: "VALIDACAO_APROVADA",
        issues: [],
        engine: {
          name: "xmllint",
          xmllintVersion: "20916",
          libxml2Version: "2.12.0",
          binaryHash: "a".repeat(64),
          schemaPackage: XSD_SCHEMA_PACKAGE,
          schemaManifestHash: OFFICIAL_XSD_MANIFEST_SHA256,
        },
        durationMs: 1,
      }
      return result
    },
  }
  return adapter
}

/**
 * Transporte fake/loopback que AUTORIZA com a chave ecoada do envelope da requisição:
 * nenhum host, nenhum socket — só bytes de resposta sintética classificada pelo parser
 * oficial (104 + protNFe 100).
 */
function transportAutorizadoLoopback() {
  const calls: SefazTransportRequest[] = []
  const transport: SefazTransport = {
    permiteRede: true,
    send: async (req) => {
      calls.push(req)
      const envelope = new TextDecoder().decode(req.bodyBytes)
      const chave = envelope.match(/Id="NFe(\d{44})"/)?.[1] ?? "0".repeat(44)
      const body =
        `<env:Envelope xmlns:env="http://www.w3.org/2003/05/soap-envelope"><env:Body>` +
        `<nfeResultMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4">` +
        `<retEnviNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">` +
        `<tpAmb>2</tpAmb><cStat>104</cStat><xMotivo>Lote processado</xMotivo>` +
        `<protNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><infProt>` +
        `<chNFe>${chave}</chNFe><cStat>100</cStat>` +
        `<xMotivo>Autorizado o uso da NF-e</xMotivo><nProt>135260000000001</nProt>` +
        `</infProt></protNFe></retEnviNFe>` +
        `</nfeResultMsg></env:Body></env:Envelope>`
      return {
        ok: true as const,
        classification: "RESPONSE_RECEIVED" as const,
        httpStatus: 200,
        contentType: "application/soap+xml; charset=utf-8",
        bodyBytes: new TextEncoder().encode(body),
        externalTransmissionAttempted: true as const,
      }
    },
  }
  return { transport, calls }
}

function transportIncerto() {
  const calls: SefazTransportRequest[] = []
  const transport: SefazTransport = {
    permiteRede: true,
    send: async (req) => {
      calls.push(req)
      return {
        ok: false as const,
        codigo: "transporte_rede_incerta" as const,
        mensagem: "Falha sintética de rede no fake (estado incerto).",
        classification: "UNKNOWN_UNCERTAIN" as const,
        externalTransmissionAttempted: true as const,
      }
    },
  }
  return { transport, calls }
}

function handoffHarness(options: {
  transport: SefazTransport
  ambiente?: string
  fiscalEnabled?: boolean
} = { transport: transportAutorizadoLoopback().transport }) {
  const ledger = ledgerClient()
  const persistedXml = new Map<string, { xmlAssinado: string }>()
  const notaRow = notaRowFixture()
  const ambiente = options.ambiente ?? "HOMOLOGACAO"
  const client = {
    configuracaoFiscalLoja: {
      findUnique: vi.fn(async () => ({
        storeId: STORE,
        provider: "SEFAZ_DIRETO",
        ambiente,
        modeloFiscal: "NFCE",
        fiscalEnabled: options.fiscalEnabled ?? true,
      })),
    },
    notaFiscal: {
      findFirst: vi.fn(async (args: unknown) => {
        const where = (args as { where: Record<string, unknown> }).where ?? {}
        if (where.chaveAcesso !== undefined) {
          return persistedXml.get(String(where.chaveAcesso)) ?? null
        }
        return notaRow
      }),
    },
    fiscalEmissaoJob: {
      findUnique: vi.fn(async () => null),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    fiscalLog: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []), create: vi.fn(async () => ({})) },
    venda: { findFirst: vi.fn(async () => null) },
  }
  const markAuthorized = vi.fn(async () => ({}))
  const recordUncertain = vi.fn(async () => ({}))
  const persistence = {
    load: vi.fn(async () => null),
    persistBeforeTransmission: vi.fn(async ({ document, bytesSha256 }: never) => {
      const doc = document as { chaveAcesso: string; xmlAssinado: string }
      persistedXml.set(doc.chaveAcesso, { xmlAssinado: doc.xmlAssinado })
      return { ...(document as object), status: "TRANSMITINDO", xmlBytesSha256: bytesSha256 }
    }),
    recordUncertainAndEnsureConsultation: recordUncertain,
    markAuthorized,
    markRejected: vi.fn(async () => ({})),
    authorizeExactRetransmission: vi.fn(async () => ({})),
  } as unknown as UncertainStatePersistence
  const wiring = createArmedNfceHomologationPilotWiring({
    jobId: JOB_ID,
    storeId: STORE,
    deps: {
      client: client as never,
      ledgerClient: ledger as never,
      window: window022c(),
      clock: () => NOW,
      persistence,
      transport: options.transport,
      xsdAdapter: xsdAdapterApproved(),
      resolveCertificate: vi.fn(async () => ({
        ok: true as const,
        storeId: STORE,
        certificadoId: "cert-022c-1",
        blobRef: PFX_REF,
        senhaRef: SENHA_REF,
        provider: "env-piloto",
      })),
      vault: {
        getCertificadoPfx: vi.fn(async () => Buffer.from(pki.clientPfx)),
        getCertificadoSenha: vi.fn(async () => pki.clientPassphrase),
        getCscToken: vi.fn(async () => null),
        describeSecret: vi.fn(async () => null),
        checkAvailability: vi.fn(async () => ({
          disponivel: true,
          backend: "env-piloto",
          capacidades: { leitura: true, escrita: false, rotacao: false, revogacao: false },
          mensagem: "fake",
        })),
        putCertificadoPfx: vi.fn(async () => {
          throw new Error("não usado")
        }),
        putCscToken: vi.fn(async () => {
          throw new Error("não usado")
        }),
        revoke: vi.fn(async () => undefined),
        rotateCertificadoPfx: vi.fn(async () => {
          throw new Error("não usado")
        }),
      } as never,
    },
  })
  return { wiring, ledger, client, markAuthorized, recordUncertain }
}

function queueDrenada(
  execute: (job: FiscalQueueJob) => Promise<FiscalQueueExecutionResult>,
  initial: FiscalQueueJob[] = [job022c()],
) {
  const jobs = new Map(initial.map((item) => [item.id, { ...item }]))
  function owns(current: FiscalQueueJob, workerId: string, now: Date): boolean {
    return (
      current.status === "PROCESSANDO" &&
      current.lockOwner === workerId &&
      current.lockExpiresAt != null &&
      current.lockExpiresAt.getTime() > now.getTime()
    )
  }
  const waitForConsultation = vi.fn(async ({ job: leased, workerId, now, error, payload }: {
    job: FiscalQueueJob
    workerId: string
    now: Date
    error: string
    payload: FiscalQueueJob["payload"]
  }) => {
    const current = jobs.get(leased.id)
    if (!current || !owns(current, workerId, now)) return false
    current.payload = payload
    current.ultimoErro = error
    current.status = "AGUARDANDO_RETRY"
    current.proximaTentativaEm = null
    current.lockOwner = null
    current.lockExpiresAt = null
    return true
  })
  const ports: FiscalQueueWorkerPorts = {
    readPauseSnapshot: async (): Promise<FiscalQueuePauseSnapshot> => ({
      globalPaused: false,
      globalSource: "none",
      pausedStoreIds: [],
    }),
    acquireNextJob: async ({ workerId, now, leaseMs }) => {
      const selected = [...jobs.values()].find(
        (c) =>
          ["PENDENTE", "AGUARDANDO_RETRY"].includes(c.status) &&
          (!c.proximaTentativaEm || c.proximaTentativaEm.getTime() <= now.getTime()) &&
          (!c.lockExpiresAt || c.lockExpiresAt.getTime() <= now.getTime()),
      )
      if (!selected) return null
      selected.status = "PROCESSANDO"
      selected.lockOwner = workerId
      selected.lockExpiresAt = new Date(now.getTime() + leaseMs)
      selected.tentativas += 1
      return { job: { ...selected }, takeover: false } satisfies FiscalQueueLease
    },
    heartbeat: async () => true,
    markTransmissionStarted: async ({ job: leased, workerId, now, payload }) => {
      const current = jobs.get(leased.id)
      if (!current || !owns(current, workerId, now)) return false
      current.payload = payload
      return true
    },
    complete: async ({ job: leased, workerId, now, payload }) => {
      const current = jobs.get(leased.id)
      if (!current || !owns(current, workerId, now)) return false
      current.status = "CONCLUIDO"
      current.payload = payload
      current.concluidoEm = now
      return true
    },
    retry: async ({ job: leased, workerId, now, nextAttemptAt, error, payload }) => {
      const current = jobs.get(leased.id)
      if (!current || !owns(current, workerId, now)) return false
      current.status = "PENDENTE"
      current.payload = payload
      current.ultimoErro = error
      current.proximaTentativaEm = nextAttemptAt
      current.lockOwner = null
      current.lockExpiresAt = null
      return true
    },
    fail: async ({ job: leased, workerId, now, error, payload }) => {
      const current = jobs.get(leased.id)
      if (!current || !owns(current, workerId, now)) return false
      current.status = "FALHA"
      current.payload = payload
      current.ultimoErro = error
      current.proximaTentativaEm = null
      current.lockOwner = null
      current.lockExpiresAt = null
      return true
    },
    waitForConsultation,
    execute,
    audit: vi.fn(async () => undefined),
  }
  return { ports, jobs, waitForConsultation }
}

describe("022C · integração offline — EMISSAO autorizada chega ao provider sem reescrita", () => {
  it("consume → capability → authority → executor armado → worker → loopback ⇒ concluido", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("rede externa proibida neste teste"))
    try {
      const loopback = transportAutorizadoLoopback()
      const h = handoffHarness({ transport: loopback.transport })
      const { ports, jobs } = queueDrenada((job) => h.wiring.execute(job))
      const report = await drainFiscalQueue(
        { workerId: "w-022c-loop", batchSize: 1, now: () => NOW },
        ports,
      )

      expect(report.items[0]?.status).toBe("concluido")
      expect(jobs.get(JOB_ID)?.status).toBe("CONCLUIDO")
      // Uma ativação consumida, um transporte: one-shot ponta a ponta.
      expect(h.ledger.createdCount()).toBe(1)
      expect(loopback.calls).toHaveLength(1)
      expect(loopback.calls[0]?.endpoint.servico).toBe("NFeAutorizacao4")
      expect(loopback.calls[0]?.endpoint.ambiente).toBe("HOMOLOGACAO")
      // Autorização real persistida pelo boundary; nada incerto a reconciliar.
      expect(h.markAuthorized).toHaveBeenCalledTimes(1)
      expect(h.recordUncertain).not.toHaveBeenCalled()
      // Zero rede externa além do loopback injetado.
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it("o desfecho do executor armado é REAL (simulado=false) e carrega a prova opaca", async () => {
    const loopback = transportAutorizadoLoopback()
    const h = handoffHarness({ transport: loopback.transport })
    const outcome = await h.wiring.execute(job022c())
    // Sem esta asserção o teste acima seria trivial: resultado simulado atravessa
    // o freio sem prova. O caminho 022C exige provider real invocado.
    expect(outcome.simulado).toBe(false)
    expect(outcome.providerInvoked).toBe(true)
    expect(outcome.kind).toBe("success")
    expect(isPilotEmissionAuthorizationProof(outcome.pilotEmissionExternalAuthorization)).toBe(true)
  })

  it("transporte incerto ⇒ executor uncertain ⇒ worker exige CONSULTA (sem reescrita)", async () => {
    const incerto = transportIncerto()
    const h = handoffHarness({ transport: incerto.transport })
    const { ports, jobs, waitForConsultation } = queueDrenada((job) => h.wiring.execute(job))
    const report = await drainFiscalQueue(
      { workerId: "w-022c-loop", batchSize: 1, now: () => NOW },
      ports,
    )
    expect(report.items[0]?.status).toBe("consulta")
    expect(waitForConsultation).toHaveBeenCalledTimes(1)
    expect(jobs.get(JOB_ID)?.status).toBe("AGUARDANDO_RETRY")
    expect(incerto.calls).toHaveLength(1)
  })
})

describe("022C · PRODUCAO e fora do piloto negam antes da rede, sem consumir ativação", () => {
  it("ambiente PRODUCAO ⇒ contexto_piloto_invalido, sem ledger e sem transporte", async () => {
    const loopback = transportAutorizadoLoopback()
    const h = handoffHarness({ transport: loopback.transport, ambiente: "PRODUCAO" })
    const outcome = await h.wiring.execute(job022c())
    expect(outcome.kind).toBe("terminal")
    expect(outcome.code).toBe("contexto_piloto_invalido")
    expect(outcome.providerInvoked).toBe(false)
    expect(h.ledger.createdCount()).toBe(0)
    expect(loopback.calls).toHaveLength(0)
  })

  it("kill-switch desarmado (fiscalEnabled=false) não consome nem transporta", async () => {
    const loopback = transportAutorizadoLoopback()
    const h = handoffHarness({ transport: loopback.transport, fiscalEnabled: false })
    const outcome = await h.wiring.execute(job022c())
    expect(outcome.kind).toBe("terminal")
    expect(outcome.code).toBe("contexto_piloto_invalido")
    expect(h.ledger.createdCount()).toBe(0)
    expect(loopback.calls).toHaveLength(0)
  })
})
