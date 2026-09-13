/**
 * GOAL 022 · slice do runtime one-shot — wiring EXPLICITAMENTE ARMADO.
 *
 * Prova o caminho completo do modo armado com portas/fakes (nenhuma rede real):
 *  - execução autorizada consome o ledger PERSISTENTE uma única vez e alcança o transporte
 *    com endpoint NFeAutorizacao4/HOMOLOGACAO/SP e referências opacas do A1;
 *  - desfecho incerto ⇒ `uncertain` (consulta reconcilia), NUNCA retransmissão automática;
 *  - replay (mesma ativação, mesmo ou outro job) bloqueia ANTES do transporte;
 *  - job/loja divergentes, kill-switch desarmado, janela expirada, XSD indisponível e
 *    falha de persistência bloqueiam SEM consumir a ativação (exceto replay, que já a
 *    consumiu) e SEM tocar o transporte;
 *  - o default dormente (`createNfceHomologationPilotWiring`) permanece incapaz de
 *    execução externa — o modo armado não altera o default.
 */
import { describe, expect, it, vi } from "vitest"
import { createTestMtlsPki } from "@/lib/fiscal/provider/sefaz/__fixtures__/mtls-test-pki"
import { canonicalEnvRef } from "@/lib/fiscal/vault/fiscal-secret-vault"
import { OFFICIAL_XSD_MANIFEST_SHA256, XSD_SCHEMA_PACKAGE } from "@/lib/fiscal/xsd"
import type { XsdValidationAdapter, XsdValidationResult } from "@/lib/fiscal/xsd"
import type { UncertainStatePersistence } from "@/lib/fiscal/emission/uncertain-state.types"
import { EXTERNAL_EXECUTION_DENIED } from "@/lib/fiscal/emission/uncertain-state.types"
import type { FiscalQueueJob } from "@/lib/fiscal/queue/queue.types"
import type { SefazTransport, SefazTransportRequest } from "@/lib/fiscal/provider/sefaz/sefaz-transport.types"
import { buildVendaFiscalSnapshot } from "@/lib/fiscal/venda-fiscal-snapshot"
import { sanitizeProdutoFiscal } from "@/lib/produto-fiscal"
import {
  createArmedNfceHomologationPilotWiring,
} from "./nfce-homologation-pilot-armed-wiring"
import { createNfceHomologationPilotWiring } from "./nfce-homologation-pilot-wiring"
import type { PilotEmissionWindowConfig } from "./pilot-emission-gate"

const pki = createTestMtlsPki()
const STORE = "store-piloto-armado"
const JOB_ID = "job-armado-1"
const NOTA_ID = "nota-armada-1"
const VENDA_ID = "venda-armada-1"
const PFX_REF = canonicalEnvRef("pfx", STORE)
const SENHA_REF = canonicalEnvRef("senha", STORE)

function activeWindow(): PilotEmissionWindowConfig {
  const now = Date.now()
  return {
    activationId: "homolog-emissao-armado-test-01",
    notBeforeUtc: new Date(now - 5 * 60_000).toISOString().replace(/\.\d{3}Z$/, ".000Z"),
    expiresAtUtc: new Date(now + 10 * 60_000).toISOString().replace(/\.\d{3}Z$/, ".000Z"),
  }
}

/**
 * Nota persistida equivalente à produção: snapshot gerado pelo BUILDER REAL (com
 * tributação congelada) e gravado nos JSONB como o serviço de snapshot faz.
 */
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
      pedidoId: "VDA-SINT-ARMADO",
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
    localKey: "corr-armado-001",
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

function jobFixture(overrides: Partial<FiscalQueueJob> = {}): FiscalQueueJob {
  const now = new Date()
  return {
    id: JOB_ID,
    storeId: STORE,
    vendaId: VENDA_ID,
    notaFiscalId: NOTA_ID,
    tipo: "EMISSAO",
    status: "PROCESSANDO",
    tentativas: 1,
    maxTentativas: 1,
    proximaTentativaEm: now,
    prioridade: 0,
    lockOwner: "worker-armado",
    lockedAt: now,
    lockExpiresAt: new Date(now.getTime() + 60_000),
    dedupeKey: "fiscal:emissao:v1:venda:venda-armada-1",
    payload: { version: 1 },
    ultimoErro: null,
    concluidoEm: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

/** Ledger fake com unicidade REAL de (storeId, dedupeKey). */
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

function xsdAdapterApproved() {
  const calls: string[] = []
  const adapter: XsdValidationAdapter = {
    validate: async (request) => {
      calls.push(request.xmlSha256)
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
  return { adapter, calls }
}

function xsdAdapterUnavailable(): XsdValidationAdapter {
  return {
    validate: async () =>
      ({
        valid: false,
        outcome: "WORKER_INDISPONIVEL",
        issues: [{ message: "worker ausente", category: "INFRASTRUCTURE" }],
        engine: null,
        durationMs: 0,
      }) as XsdValidationResult,
  }
}

function armedHarness(options: {
  window?: PilotEmissionWindowConfig
  fiscalEnabled?: boolean
  xsd?: XsdValidationAdapter
  ledgerFail?: boolean
} = {}) {
  const window = options.window ?? activeWindow()
  const clock = () => new Date()
  const ledger = ledgerClient({ fail: options.ledgerFail })
  const xsd = xsdAdapterApproved()
  const transportCalls: SefazTransportRequest[] = []
  const transport: SefazTransport = {
    permiteRede: true,
    send: async (req) => {
      transportCalls.push(req)
      return {
        ok: false,
        codigo: "transporte_rede_incerta",
        mensagem: "Falha sintética de rede no fake (estado incerto).",
        classification: "UNKNOWN_UNCERTAIN",
        externalTransmissionAttempted: true,
      }
    },
  }
  const persistedXml = new Map<string, { xmlAssinado: string }>()
  const notaRow = notaRowFixture()
  const client = {
    configuracaoFiscalLoja: {
      findUnique: vi.fn(async () => ({
        storeId: STORE,
        provider: "SEFAZ_DIRETO",
        ambiente: "HOMOLOGACAO",
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
  const persistence: UncertainStatePersistence = {
    load: vi.fn(async () => null),
    persistBeforeTransmission: vi.fn(async ({ document, bytesSha256 }: never) => {
      const doc = document as { chaveAcesso: string; xmlAssinado: string }
      persistedXml.set(doc.chaveAcesso, { xmlAssinado: doc.xmlAssinado })
      return { ...(document as object), status: "TRANSMITINDO", xmlBytesSha256: bytesSha256 }
    }),
    recordUncertainAndEnsureConsultation: vi.fn(async () => ({})),
    markAuthorized: vi.fn(async () => ({})),
    markRejected: vi.fn(async () => ({})),
    authorizeExactRetransmission: vi.fn(async () => ({})),
  } as unknown as UncertainStatePersistence
  const wiring = createArmedNfceHomologationPilotWiring({
    jobId: JOB_ID,
    storeId: STORE,
    deps: {
      client: client as never,
      ledgerClient: ledger as never,
      window,
      clock,
      persistence,
      transport,
      xsdAdapter: options.xsd ?? xsd.adapter,
      resolveCertificate: vi.fn(async () => ({
        ok: true as const,
        storeId: STORE,
        certificadoId: "cert-armado-1",
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
  return { wiring, ledger, xsd, transportCalls, clock, client, persistence }
}

describe("createArmedNfceHomologationPilotWiring · execução autorizada", () => {
  it("consome o ledger uma vez e alcança o transporte com NFeAutorizacao4/HOMOLOGACAO (fakes)", async () => {
    const h = armedHarness()
    const result = await h.wiring.execute(jobFixture())
    expect(h.ledger.createdCount()).toBe(1)
    expect(h.transportCalls).toHaveLength(1)
    const call = h.transportCalls[0]!
    expect(call.endpoint.ambiente).toBe("HOMOLOGACAO")
    expect(call.endpoint.servico).toBe("NFeAutorizacao4")
    expect(call.endpoint.uf).toBe("SP")
    expect(call.certificate).toEqual({ storeId: STORE, blobRef: PFX_REF, senhaRef: SENHA_REF })
    // Desfecho incerto (fake de rede falhou após tentativa): JAMAIS retransmissão automática.
    expect(result.kind).not.toBe("transient")
    expect(result.kind).not.toBe("success")
    expect(result.kind).toBe("uncertain")
    expect(result.externalTransmissionAttempted).toBe(true)
    // XSD validado no pre-flight E revalidado no guard 8 (mesmos bytes — anti-TOCTOU).
    expect(h.xsd.calls.length).toBeGreaterThanOrEqual(2)
    expect(new Set(h.xsd.calls).size).toBe(1)
  })

  it("replay da mesma ativação (nova instância) bloqueia ANTES do transporte", async () => {
    const h = armedHarness()
    await h.wiring.execute(jobFixture())
    expect(h.transportCalls).toHaveLength(1)
    const replay = await h.wiring.execute(jobFixture())
    expect(replay.kind).toBe("terminal")
    expect(replay.code).toBe("pilot_emission_activation_ja_consumida")
    expect(replay.externalTransmissionAttempted).toBe(false)
    expect(h.transportCalls).toHaveLength(1)
  })

  it("job divergente é negado sem consumir a ativação nem tocar o transporte", async () => {
    const h = armedHarness()
    const result = await h.wiring.execute(jobFixture({ id: "job-OUTRO" }))
    expect(result.kind).toBe("terminal")
    expect(result.code).toBe("pilot_emission_job_incoerente")
    expect(h.ledger.createdCount()).toBe(0)
    expect(h.transportCalls).toHaveLength(0)
  })

  it("loja divergente no job é negada (loja_fora_do_piloto)", async () => {
    const h = armedHarness()
    const result = await h.wiring.execute(jobFixture({ storeId: "loja-OUTRA", notaFiscalId: NOTA_ID }))
    expect(result.kind).toBe("terminal")
    expect(h.transportCalls).toHaveLength(0)
    expect(h.ledger.createdCount()).toBe(0)
  })

  it("kill-switch desarmado (fiscalEnabled=false) bloqueia sem consumir a ativação", async () => {
    const h = armedHarness({ fiscalEnabled: false })
    const result = await h.wiring.execute(jobFixture())
    expect(result.kind).toBe("terminal")
    expect(result.code).toBe("contexto_piloto_invalido")
    expect(h.ledger.createdCount()).toBe(0)
    expect(h.transportCalls).toHaveLength(0)
  })

  it("janela expirada bloqueia no gate, sem ledger e sem transporte", async () => {
    const now = Date.now()
    const expired: PilotEmissionWindowConfig = {
      activationId: "homolog-emissao-armado-expirado",
      notBeforeUtc: new Date(now - 10 * 60_000).toISOString().replace(/\.\d{3}Z$/, ".000Z"),
      expiresAtUtc: new Date(now - 60_000).toISOString().replace(/\.\d{3}Z$/, ".000Z"),
    }
    const h = armedHarness({ window: expired })
    const result = await h.wiring.execute(jobFixture())
    expect(result.kind).toBe("terminal")
    expect(result.code).toBe("pilot_emission_gate_expired")
    expect(h.ledger.createdCount()).toBe(0)
    expect(h.transportCalls).toHaveLength(0)
  })

  it("worker XSD indisponível bloqueia ANTES de consumir a ativação (orçamento preservado)", async () => {
    const h = armedHarness({ xsd: xsdAdapterUnavailable() })
    const result = await h.wiring.execute(jobFixture())
    expect(result.kind).toBe("terminal")
    expect(result.code).toBe("pilot_emission_xsd_nao_aprovado")
    expect(h.ledger.createdCount()).toBe(0)
    expect(h.transportCalls).toHaveLength(0)
  })

  it("falha de persistência do ledger bloqueia sem transporte", async () => {
    const h = armedHarness({ ledgerFail: true })
    const result = await h.wiring.execute(jobFixture())
    expect(result.kind).toBe("terminal")
    expect(result.code).toBe("pilot_emission_activation_ja_consumida")
    expect(h.transportCalls).toHaveLength(0)
  })

  it("job sem notaFiscalId é negado (fail-closed)", async () => {
    const h = armedHarness()
    const result = await h.wiring.execute(jobFixture({ notaFiscalId: "" }))
    expect(result.kind).toBe("terminal")
    expect(result.code).toBe("nota_fiscal_ausente")
    expect(h.ledger.createdCount()).toBe(0)
  })

  it("timeout/incerteza NÃO agenda retransmissão: desfecho segue para consulta (uncertain)", async () => {
    const h = armedHarness()
    const result = await h.wiring.execute(jobFixture())
    expect(result.kind).toBe("uncertain")
    expect(h.persistence.recordUncertainAndEnsureConsultation).toHaveBeenCalled()
  })
})

describe("regressão · default dormente permanece incapaz de execução externa", () => {
  it("createNfceHomologationPilotWiring() segue com capability negada e transporte offline", () => {
    const wiring = createNfceHomologationPilotWiring()
    expect(wiring.capability).toBe(EXTERNAL_EXECUTION_DENIED)
    expect(wiring.transport.permiteRede).toBe(false)
  })
})
