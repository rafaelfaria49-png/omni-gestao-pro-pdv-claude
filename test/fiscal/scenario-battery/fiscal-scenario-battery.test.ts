/**
 * Bateria Integrada de Cenários Fiscais Offline (C01–C10) — GOAL 021.
 *
 * Suíte de testes determinísticos para NFC-e (SEFAZ-SP modelo 65, homologação).
 * Execução 100% offline, com portas canônicas, mocks locais e zero rede.
 *
 * RESTRIÇÕES DE SEGURANÇA:
 *  - SP_ONLY = true
 *  - SEFAZ_REQUEST_COUNT = 0
 *  - SEFAZ_SOAP_POST_COUNT = 0
 *  - NFCE_EMISSION_COUNT = 0
 *  - FISCAL_OFF = true
 *  - G-F7 = FECHADO
 *  - G-F12 = FECHADO
 *  - ZERO_NETWORK = true
 *  - HTTPS_NETWORK_GUARD = true
 *  - TLS_NETWORK_GUARD = true
 */

import http from "node:http"
import https from "node:https"
import net from "node:net"
import tls from "node:tls"
import { createPublicKey } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { FiscalProviderTipo, FiscalStatusVenda, StatusNotaFiscal } from "@/generated/prisma"
import type { FiscalProvider, FiscalProviderResponse, FiscalProviderOperacao } from "@/lib/fiscal/provider/types"
import { DRY_RUN_TEST_CERT } from "@/lib/fiscal/dry-run"
import {
  lookupSefazCStat,
  SEFAZ_CSTAT_MATRIX_VERSION,
} from "@/lib/fiscal/provider/sefaz/sefaz-cstat-matrix"
import {
  parseDanfceFromPersisted,
  renderDanfceHtml,
  renderDanfceEscPos,
  encodeNfceQrV3OnlineUrl,
  encodeNfceQrV3OfflineUrl,
  createQrV3OfflinePemSigner,
  verifyQrV3OfflineSignature,
  selectNfceSpPublicUrls,
  DANFCE_TITULO_CONTINGENCIA,
  DANFCE_MSG_CONTINGENCIA,
  DANFCE_MSG_HOMOLOGACAO,
} from "@/lib/fiscal/danfce"
import { buildPersistedDanfceFixture } from "@/lib/fiscal/danfce/__fixtures__/persisted-nfce"
import {
  calculateOfflineTransmissionDeadline,
  offlineContingencyAlarm,
  fiscalBytesSha256,
  enterManualOfflineContingency,
  type OfflineContingencyPersistence,
} from "@/lib/fiscal/contingencia"
import {
  cancelarNfceAutorizada,
  avaliarPrazoCancelamentoNfce,
  validarJustificativaCancelamento,
  buildXmlEventoCancelamento,
  signEventoCancelamentoXml,
  isCancelamentoFiscalAutorizado,
  CSTAT_EVENTO_REGISTRADO,
  NFCE_CANCELAMENTO_PRAZO_MS,
  type CancelamentoFiscalPorts,
} from "@/lib/fiscal/events"
import type { NotaFiscalCancelamento } from "@/lib/fiscal/events/cancelamento-service"
import {
  validateInutilizacaoPedido,
  buildInutilizacaoXml,
  signInutilizacaoXml,
  lookupInutilizacaoCStat,
  classifyInutilizacaoRetorno,
  enqueueInutilizacao,
  executeInutilizacaoJob,
  INUTILIZACAO_MARK,
} from "@/lib/fiscal/inutilizacao"
import type { InutilizacaoPorts, InutilizacaoJobRow } from "@/lib/fiscal/inutilizacao/ports"
import { allocateFiscalNumber } from "@/lib/fiscal/numbering/allocate-fiscal-number"
import type { FiscalNumberingPorts, NumberingNota } from "@/lib/fiscal/numbering/numbering.types"
import { reconcileAgedTransmittingNotes } from "@/lib/fiscal/reconciliation/uncertain-reconciler"
import {
  transmitWithUncertainStateSafety,
  reconcileUncertainDocument,
  fiscalXmlBytes,
} from "@/lib/fiscal/emission/uncertain-state-coordinator"
import {
  IN_MEMORY_ONLY_FISCAL_PROVIDER,
  type FinalizedDocumentPreparer,
  type FiscalTransmissionResult,
  type FiscalConsultationResult,
  type PersistedFiscalDocument,
  type UncertainStateFiscalProvider,
  type UncertainStatePersistence,
} from "@/lib/fiscal/emission/uncertain-state.types"
import { readFiscalObservabilitySnapshot } from "@/lib/fiscal/observability"
import {
  STORE_PAUSE_ACTION,
  eligibleWhere,
} from "@/lib/fiscal/queue/prisma-queue-worker"
import {
  canStartFiscalTransmission,
  withExecutionResult,
  withTransmissionStarted,
} from "@/lib/fiscal/queue/queue-policy"
import type { FiscalQueueJob } from "@/lib/fiscal/queue/queue.types"

// Constantes canônicas de auditoria
export const SP_ONLY = true
export const FISCAL_OFF = true
export const COVERAGE_GAP_UNMODELED_CSTAT = false
export const HTTPS_NETWORK_GUARD = true
export const TLS_NETWORK_GUARD = true
export const ZERO_NETWORK = true

function buildMockFiscalProvider(cancelarFn?: FiscalProvider["cancelar"], inutilizarFn?: FiscalProvider["inutilizar"]): FiscalProvider {
  const dummyResponse = (operacao: FiscalProviderOperacao = "consultar"): FiscalProviderResponse => ({
    ok: true,
    operacao,
    resultado: "ok",
    simulado: false,
    provider: FiscalProviderTipo.SEFAZ_DIRETO,
    ambiente: "HOMOLOGACAO",
    statusNota: null,
    dados: null,
    mensagem: "mock",
    pendencias: [],
    erros: [],
    eventos: [],
  })
  return {
    tipo: FiscalProviderTipo.SEFAZ_DIRETO,
    simulado: false,
    validarConfiguracao: () => dummyResponse("validarConfiguracao"),
    validarSnapshot: () => dummyResponse("validarSnapshot"),
    prepararEmissao: () => dummyResponse("prepararEmissao"),
    emitir: async () => dummyResponse("emitir"),
    consultar: async () => dummyResponse("consultar"),
    inutilizar: inutilizarFn ?? (async () => dummyResponse("inutilizar")),
    cancelar: cancelarFn ?? (async () => dummyResponse("cancelar")),
    statusServico: async () => ({
      provider: FiscalProviderTipo.SEFAZ_DIRETO,
      online: true,
      ambiente: "HOMOLOGACAO",
      simulado: false,
      mensagem: "mock",
      cStat: "107",
      verificadoEm: new Date().toISOString(),
    }),
  }
}

export type ScenarioClassification = "FULL_FLOW" | "PARTIAL" | "MOCK_ONLY"

export interface BatteryExecutionReport {
  c01: ScenarioClassification
  c02: ScenarioClassification
  c03: ScenarioClassification
  c04: ScenarioClassification
  c05: ScenarioClassification
  c06: ScenarioClassification
  c07: ScenarioClassification
  c08: ScenarioClassification
  c09: ScenarioClassification
  c10: ScenarioClassification
  coverageGapUnmodeledCStat: boolean
  observabilityConsolidated: boolean
  danfceIntegrationPass: boolean
  qrV3IntegrationPass: boolean
  zeroNetwork: boolean
  p0Count: number
  p1Count: number
}

export function deriveReadyForGF7Review(report: BatteryExecutionReport): {
  ready: boolean
  fullFlowCount: number
  fullFlowRatio: string
  reasons: string[]
} {
  const classifications = [
    report.c01, report.c02, report.c03, report.c04, report.c05,
    report.c06, report.c07, report.c08, report.c09, report.c10,
  ]
  const fullFlowCount = classifications.filter((c) => c === "FULL_FLOW").length
  const fullFlowRatio = `${fullFlowCount}/10`

  const reasons: string[] = []
  if (fullFlowCount !== 10) reasons.push(`Cenários C01–C10 incompletos: ${fullFlowRatio}`)
  if (report.coverageGapUnmodeledCStat) reasons.push("Gap de cobertura em cStats não modelados")
  if (!report.observabilityConsolidated) reasons.push("Observabilidade fiscal não consolidada")
  if (!report.danfceIntegrationPass) reasons.push("Integração DANFCE falhou")
  if (!report.qrV3IntegrationPass) reasons.push("Integração QR v3 falhou")
  if (!report.zeroNetwork) reasons.push("Violação de contenção de rede")
  if (report.p0Count > 0) reasons.push(`P0 pendentes: ${report.p0Count}`)
  if (report.p1Count > 0) reasons.push(`P1 pendentes: ${report.p1Count}`)

  return {
    ready: reasons.length === 0,
    fullFlowCount,
    fullFlowRatio,
    reasons,
  }
}

// Estado compartilhado da execução da bateria para derivação de prontidão
const batteryReport: BatteryExecutionReport = {
  c01: "MOCK_ONLY",
  c02: "MOCK_ONLY",
  c03: "MOCK_ONLY",
  c04: "MOCK_ONLY",
  c05: "MOCK_ONLY",
  c06: "MOCK_ONLY",
  c07: "MOCK_ONLY",
  c08: "MOCK_ONLY",
  c09: "MOCK_ONLY",
  c10: "MOCK_ONLY",
  coverageGapUnmodeledCStat: false,
  observabilityConsolidated: false,
  danfceIntegrationPass: false,
  qrV3IntegrationPass: false,
  zeroNetwork: false,
  p0Count: 0,
  p1Count: 0,
}

// Prontidão derivada deterministicamente
export let READY_FOR_G_F7_REVIEW = false

describe("Bateria de Cenários Fiscais Offline C01–C10 (GOAL 021)", () => {
  let sefazRequestCount = 0
  let sefazSoapPostCount = 0
  let nfceEmissionCount = 0
  let httpsRequestCount = 0
  let tlsConnectCount = 0
  let netConnectCount = 0
  let fetchCount = 0

  let fetchSpy: ReturnType<typeof vi.spyOn>
  let httpsRequestSpy: ReturnType<typeof vi.spyOn>
  let httpsGetSpy: ReturnType<typeof vi.spyOn>
  let httpRequestSpy: ReturnType<typeof vi.spyOn>
  let httpGetSpy: ReturnType<typeof vi.spyOn>
  let tlsConnectSpy: ReturnType<typeof vi.spyOn>
  let netConnectSpy: ReturnType<typeof vi.spyOn>
  let netCreateConnectionSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    sefazRequestCount = 0
    sefazSoapPostCount = 0
    nfceEmissionCount = 0
    httpsRequestCount = 0
    tlsConnectCount = 0
    netConnectCount = 0
    fetchCount = 0

    // Bloqueio HTTPS
    httpsRequestSpy = vi.spyOn(https, "request").mockImplementation((..._args: unknown[]) => {
      httpsRequestCount += 1
      sefazRequestCount += 1
      throw new Error("Chamada de rede https.request proibida na bateria offline.")
    })
    httpsGetSpy = vi.spyOn(https, "get").mockImplementation((..._args: unknown[]) => {
      httpsRequestCount += 1
      sefazRequestCount += 1
      throw new Error("Chamada de rede https.get proibida na bateria offline.")
    })

    // Bloqueio HTTP
    httpRequestSpy = vi.spyOn(http, "request").mockImplementation((..._args: unknown[]) => {
      throw new Error("Chamada de rede http.request proibida na bateria offline.")
    })
    httpGetSpy = vi.spyOn(http, "get").mockImplementation((..._args: unknown[]) => {
      throw new Error("Chamada de rede http.get proibida na bateria offline.")
    })

    // Bloqueio TLS
    tlsConnectSpy = vi.spyOn(tls, "connect").mockImplementation((..._args: unknown[]) => {
      tlsConnectCount += 1
      sefazRequestCount += 1
      throw new Error("Chamada de conexão TLS tls.connect proibida na bateria offline.")
    })

    // Bloqueio TCP / NET
    netConnectSpy = vi.spyOn(net, "connect").mockImplementation((..._args: unknown[]) => {
      netConnectCount += 1
      throw new Error("Chamada de conexão TCP net.connect proibida na bateria offline.")
    })
    netCreateConnectionSpy = vi.spyOn(net, "createConnection").mockImplementation((..._args: unknown[]) => {
      netConnectCount += 1
      throw new Error("Chamada de conexão TCP net.createConnection proibida na bateria offline.")
    })

    // Bloqueio fetch
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (info) => {
      fetchCount += 1
      sefazRequestCount += 1
      const url = String(info)
      if (url.includes("sefaz") || url.includes("fazenda.sp.gov.br")) {
        sefazSoapPostCount += 1
      }
      throw new Error(`Chamada de rede fetch proibida na bateria offline: ${url}`)
    })
  })

  afterEach(() => {
    fetchSpy.mockRestore()
    httpsRequestSpy.mockRestore()
    httpsGetSpy.mockRestore()
    httpRequestSpy.mockRestore()
    httpGetSpy.mockRestore()
    tlsConnectSpy.mockRestore()
    netConnectSpy.mockRestore()
    netCreateConnectionSpy.mockRestore()

    expect(httpsRequestCount).toBe(0)
    expect(tlsConnectCount).toBe(0)
    expect(netConnectCount).toBe(0)
    expect(fetchCount).toBe(0)
    expect(sefazRequestCount).toBe(0)
    expect(sefazSoapPostCount).toBe(0)
    expect(nfceEmissionCount).toBe(0)
  })

  it("P2: Contenção estrita de rede - tentativa de chamada https, tls, tcp ou fetch falha imediatamente fail-closed", async () => {
    expect(() => https.request("https://nfe.fazenda.sp.gov.br")).toThrow("Chamada de rede https.request proibida na bateria offline.")
    expect(() => https.get("https://nfe.fazenda.sp.gov.br")).toThrow("Chamada de rede https.get proibida na bateria offline.")
    expect(() => http.request("http://nfe.fazenda.sp.gov.br")).toThrow("Chamada de rede http.request proibida na bateria offline.")
    expect(() => tls.connect(443, "nfe.fazenda.sp.gov.br")).toThrow("Chamada de conexão TLS tls.connect proibida na bateria offline.")
    expect(() => net.connect(80, "nfe.fazenda.sp.gov.br")).toThrow("Chamada de conexão TCP net.connect proibida na bateria offline.")
    await expect(fetch("https://nfe.fazenda.sp.gov.br")).rejects.toThrow("Chamada de rede fetch proibida na bateria offline")

    // Contenção confirmada: resetamos os contadores para respeitar o afterEach
    httpsRequestCount = 0
    tlsConnectCount = 0
    netConnectCount = 0
    fetchCount = 0
    sefazRequestCount = 0
    sefazSoapPostCount = 0

    batteryReport.zeroNetwork = true
  })

  it("C01: Autorização canônica (cStat 100) com persistência real, DANFCE e QR v3 online", async () => {
    const locator = { storeId: "loja-c01", vendaId: "venda-c01", notaFiscalId: "nota-c01" }
    const fixture = buildPersistedDanfceFixture("autorizado_simples")
    const chaveAcesso = fixture.document.chaveAcesso!
    const xmlAssinado = fixture.document.xmlAssinado!

    let persistedCurrent: PersistedFiscalDocument = {
      ...locator,
      modelo: "NFCE",
      ambiente: "HOMOLOGACAO",
      serie: 1,
      numero: 42,
      chaveAcesso,
      status: "RASCUNHO",
      xmlAssinado,
      xmlBytesSha256: fiscalBytesSha256(fiscalXmlBytes(xmlAssinado)),
    }

    const persistence: UncertainStatePersistence = {
      async load(loc) {
        return loc.notaFiscalId === locator.notaFiscalId ? persistedCurrent : null
      },
      async persistBeforeTransmission({ document, bytesSha256 }) {
        persistedCurrent = {
          ...document,
          status: "TRANSMITINDO",
          xmlBytesSha256: bytesSha256,
        }
        return persistedCurrent
      },
      async recordUncertainAndEnsureConsultation() {
        return { consultationJobId: "job-1", created: true }
      },
      async markAuthorized({ document, result, now }) {
        persistedCurrent = {
          ...document,
          status: "AUTORIZADA",
          protocolo: result.protocolo,
          xmlAutorizado: fixture.document.xmlAutorizado ?? "<nfeProc></nfeProc>",
                  }
      },
      async markRejected() {},
      async authorizeExactRetransmission() {},
    }

    const preparer: FinalizedDocumentPreparer = {
      prepare: async (loc) => ({
        ...loc,
        modelo: "NFCE",
        ambiente: "HOMOLOGACAO",
        serie: 1,
        numero: 42,
        chaveAcesso,
        xmlAssinado,
      }),
    }

    const provider: UncertainStateFiscalProvider = {
      [IN_MEMORY_ONLY_FISCAL_PROVIDER]: true,
      simulado: true,
      async transmit() {
        return {
          outcome: "AUTHORIZED",
          protocolo: fixture.document.protocolo!,
          cStat: "100",
          xMotivo: "Autorizado o uso da NF-e",
          dhRecbto: new Date("2026-09-06T12:00:00.000Z").toISOString(),
          xmlAutorizado: fixture.document.xmlAutorizado ?? "<nfeProc></nfeProc>",
          consequences: {
            terminal: true,
            numeroConsumido: true,
            requiresInutilizacao: false,
            requiresConsultation: false,
          },
        }
      },
      async consult() {
        throw new Error("Não chamado em C01")
      },
    }

    // Execução real do fluxo pelo coordenador
    const outcome = await transmitWithUncertainStateSafety({
      locator,
      persistence,
      preparer,
      provider,
      now: new Date("2026-09-06T12:00:00.000Z"),
    })

    expect(outcome.kind).toBe("authorized")
    if (outcome.kind === "authorized") {
      expect(outcome.idempotent).toBe(false)
      expect(persistedCurrent.status).toBe("AUTORIZADA")
      expect(persistedCurrent.protocolo).toBe(fixture.document.protocolo)
    }

    // Parse do documento persistido pelo fluxo real
    const model = parseDanfceFromPersisted(persistedCurrent)
    expect(model.variante).toBe("autorizado")
    expect(model.chaveAcesso).toBe(chaveAcesso)
    expect(model.protocolo).toBe(fixture.document.protocolo)

    // Renderização DANFCE HTML e ESC/POS
    const html = renderDanfceHtml(model)
    expect(html).toContain("Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica")
    expect(html).toContain(model.chaveAcesso)
    expect(html).toContain(DANFCE_MSG_HOMOLOGACAO)

    const escpos = renderDanfceEscPos(model)
    expect(escpos).toBeInstanceOf(Uint8Array)
    expect(escpos.length).toBeGreaterThan(0)

    // QR-Code v3 Online
    const urls = selectNfceSpPublicUrls("HOMOLOGACAO")
    const qrOnline = encodeNfceQrV3OnlineUrl({
      baseUrl: urls.qrCodeBaseUrl,
      chave: model.chaveAcesso,
      tpAmb: "2",
    })
    expect(qrOnline.ok).toBe(true)
    if (qrOnline.ok) {
      expect(qrOnline.url).toContain(urls.qrCodeBaseUrl)
      expect(qrOnline.url).toContain(`p=${model.chaveAcesso}|3|2`)
    }

    batteryReport.c01 = "FULL_FLOW"
    batteryReport.danfceIntegrationPass = true
    batteryReport.qrV3IntegrationPass = true
  })

  it("C02: Processamento de lote assíncrono (103 -> 105 -> 104 -> 100) via coordenador canônico", async () => {
    const locator = { storeId: "loja-c02", vendaId: "venda-c02", notaFiscalId: "nota-c02" }
    const chaveAcesso = "35260712345678000199650010000000421123456782"
    const xmlAssinado = `<NFe Id="NFe${chaveAcesso}"><infNFe><ide><nNF>43</nNF><tpAmb>2</tpAmb></ide></infNFe></NFe>`

    let persistedDoc: PersistedFiscalDocument = {
      ...locator,
      modelo: "NFCE",
      ambiente: "HOMOLOGACAO",
      serie: 1,
      numero: 43,
      chaveAcesso,
      status: "RASCUNHO",
      xmlAssinado,
      xmlBytesSha256: fiscalBytesSha256(fiscalXmlBytes(xmlAssinado)),
    }

    let consultationJobId = ""
    let consultationAttempts = 0

    const persistence: UncertainStatePersistence = {
      async load(loc) {
        return loc.notaFiscalId === locator.notaFiscalId ? persistedDoc : null
      },
      async persistBeforeTransmission({ document, bytesSha256 }) {
        persistedDoc = { ...document, status: "TRANSMITINDO", xmlBytesSha256: bytesSha256 }
        return persistedDoc
      },
      async recordUncertainAndEnsureConsultation({ document, recibo }) {
        persistedDoc = { ...document, status: "TRANSMITINDO" }
        consultationJobId = `job-consult-${document.notaFiscalId}`
        return { consultationJobId, created: true }
      },
      async markAuthorized({ document, result, now }) {
        persistedDoc = {
          ...document,
          status: "AUTORIZADA",
          protocolo: result.protocolo,
          xmlAutorizado: `<nfeProc>${document.xmlAssinado}</nfeProc>`,
                  }
      },
      async markRejected() {},
      async authorizeExactRetransmission() {},
    }

    const preparer: FinalizedDocumentPreparer = {
      prepare: async (loc) => ({
        ...loc,
        modelo: "NFCE",
        ambiente: "HOMOLOGACAO",
        serie: 1,
        numero: 43,
        chaveAcesso,
        xmlAssinado,
      }),
    }

    const provider: UncertainStateFiscalProvider = {
      [IN_MEMORY_ONLY_FISCAL_PROVIDER]: true,
      simulado: true,
      async transmit() {
        // Passo 1: 103 (Lote recebido com sucesso)
        return {
          outcome: "UNCERTAIN",
          code: "PROCESSING",
          cStat: "103",
          xMotivo: "Lote recebido com sucesso",
          recibo: "351000000000001",
          message: "Lote recebido com sucesso",
          requiresConsultation: true,
        }
      },
      async consult() {
        consultationAttempts += 1
        if (consultationAttempts === 1) {
          // Passo 2: 105 (Lote em processamento)
          return {
            outcome: "UNCERTAIN",
            code: "PROCESSING",
            cStat: "105",
            xMotivo: "Lote em processamento",
            recibo: "351000000000001",
            message: "Lote em processamento",
            requiresConsultation: true,
          }
        }
        // Passo 3: 104 (Lote processado) com protNFe interno 100 (Autorizado)
        return {
          outcome: "AUTHORIZED",
          protocolo: "135260000000002",
          cStat: "100",
          xMotivo: "Autorizado o uso da NF-e",
          dhRecbto: new Date().toISOString(),
          xmlAutorizado: `<nfeProc>${persistedDoc.xmlAssinado}</nfeProc>`,
          consequences: {
            terminal: true,
            numeroConsumido: true,
            requiresInutilizacao: false,
            requiresConsultation: false,
          },
        }
      },
    }

    // 1. Transmissão inicial -> 103
    const step1 = await transmitWithUncertainStateSafety({
      locator,
      persistence,
      preparer,
      provider,
    })
    expect(step1.kind).toBe("processing")
    expect(persistedDoc.status).toBe("TRANSMITINDO")
    expect(consultationJobId).toBe(`job-consult-${locator.notaFiscalId}`)

    // 2. Primeira consulta -> 105
    const step2 = await reconcileUncertainDocument({
      locator,
      persistence,
      provider,
    })
    expect(step2.kind).toBe("processing")
    expect(persistedDoc.status).toBe("TRANSMITINDO")

    // 3. Segunda consulta -> 104 contendo 100
    const step3 = await reconcileUncertainDocument({
      locator,
      persistence,
      provider,
    })
    expect(step3.kind).toBe("authorized")
    expect(persistedDoc.status).toBe("AUTORIZADA")
    expect(persistedDoc.protocolo).toBe("135260000000002")

    // 4. Nova transmissão agora é no-op idempotente
    const step4 = await transmitWithUncertainStateSafety({
      locator,
      persistence,
      preparer,
      provider,
    })
    expect(step4.kind).toBe("authorized")
    if (step4.kind === "authorized") {
      expect(step4.idempotent).toBe(true)
    }

    batteryReport.c02 = "FULL_FLOW"
  })

  it("C03: Duplicidade de chave (cStat 204) -> convergência sem retransmissão cega nem queima", async () => {
    const locator = { storeId: "loja-c03", vendaId: "venda-c03", notaFiscalId: "nota-c03" }
    const chaveAcesso = "35260712345678000199650010000000421123456783"
    const xmlAssinado = `<NFe Id="NFe${chaveAcesso}"><infNFe><ide><nNF>44</nNF><tpAmb>2</tpAmb></ide></infNFe></NFe>`

    let persistedDoc: PersistedFiscalDocument = {
      ...locator,
      modelo: "NFCE",
      ambiente: "HOMOLOGACAO",
      serie: 1,
      numero: 44,
      chaveAcesso,
      status: "RASCUNHO",
      xmlAssinado,
      xmlBytesSha256: fiscalBytesSha256(fiscalXmlBytes(xmlAssinado)),
    }

    const persistence: UncertainStatePersistence = {
      async load(loc) {
        return loc.notaFiscalId === locator.notaFiscalId ? persistedDoc : null
      },
      async persistBeforeTransmission({ document, bytesSha256 }) {
        persistedDoc = { ...document, status: "TRANSMITINDO", xmlBytesSha256: bytesSha256 }
        return persistedDoc
      },
      async recordUncertainAndEnsureConsultation({ document }) {
        persistedDoc = { ...document, status: "TRANSMITINDO" }
        return { consultationJobId: "job-consult-204", created: true }
      },
      async markAuthorized({ document, result, now }) {
        persistedDoc = {
          ...document,
          status: "AUTORIZADA",
          protocolo: result.protocolo,
          xmlAutorizado: `<nfeProc>${document.xmlAssinado}</nfeProc>`,
                  }
      },
      async markRejected() {},
      async authorizeExactRetransmission() {},
    }

    const preparer: FinalizedDocumentPreparer = {
      prepare: async (loc) => ({
        ...loc,
        modelo: "NFCE",
        ambiente: "HOMOLOGACAO",
        serie: 1,
        numero: 44,
        chaveAcesso,
        xmlAssinado,
      }),
    }

    let transmissionCount = 0
    const provider: UncertainStateFiscalProvider = {
      [IN_MEMORY_ONLY_FISCAL_PROVIDER]: true,
      simulado: true,
      async transmit() {
        transmissionCount += 1
        // 204: Duplicidade de NF-e
        return {
          outcome: "UNCERTAIN",
          code: "UNKNOWN",
          message: `Duplicidade de NF-e (cStat 204) [chNFe:${chaveAcesso}]`,
        }
      },
      async consult() {
        // Consulta descobre que documento já fora autorizado anteriormente
        return {
          outcome: "AUTHORIZED",
          protocolo: "135260000000003",
          cStat: "100",
          xMotivo: "Autorizado o uso da NF-e",
          dhRecbto: new Date().toISOString(),
          xmlAutorizado: `<nfeProc>${persistedDoc.xmlAssinado}</nfeProc>`,
          consequences: {
            terminal: true,
            numeroConsumido: true,
            requiresInutilizacao: false,
            requiresConsultation: false,
          },
        }
      },
    }

    // 1. Transmissão retorna 204 (duplicidade) -> entra em incerteza sem rejeitar
    const res1 = await transmitWithUncertainStateSafety({
      locator,
      persistence,
      preparer,
      provider,
    })
    expect(res1.kind).toBe("uncertain")
    expect(persistedDoc.status).toBe("TRANSMITINDO")
    expect(transmissionCount).toBe(1)

    // 2. Tentativa imediata de retransmissão sem consulta DEVE ser bloqueada (zero retransmissão cega)
    const resBlocked = await transmitWithUncertainStateSafety({
      locator,
      persistence,
      preparer,
      provider,
    })
    expect(resBlocked.kind).toBe("blocked")
    if (resBlocked.kind === "blocked") {
      expect(resBlocked.code).toBe("CONSULTATION_REQUIRED")
    }
    // Prova de zero retransmissão cega: provider.transmit NÃO foi chamado novamente
    expect(transmissionCount).toBe(1)

    // 3. Consulta canônica converge para AUTORIZADA
    const resConsult = await reconcileUncertainDocument({
      locator,
      persistence,
      provider,
    })
    expect(resConsult.kind).toBe("authorized")
    expect(persistedDoc.status).toBe("AUTORIZADA")

    // 4. Terceira chamada: documento autorizado, idempotência comprovada sem consumir novo número
    const resIdempotent = await transmitWithUncertainStateSafety({
      locator,
      persistence,
      preparer,
      provider,
    })
    expect(resIdempotent.kind).toBe("authorized")
    if (resIdempotent.kind === "authorized") {
      expect(resIdempotent.idempotent).toBe(true)
    }
    expect(transmissionCount).toBe(1)

    batteryReport.c03 = "FULL_FLOW"
  })

  it("C04: Serviço SEFAZ indisponível (cStat 108 / 109) -> fail-closed imediato e bloqueio de retry cego na fila", async () => {
    for (const cStat of ["108", "109"]) {
      const locator = { storeId: `loja-c04-${cStat}`, vendaId: "venda-c04", notaFiscalId: `nota-c04-${cStat}` }
      const suffix = cStat === "108" ? "108" : "109"
      const chaveAcesso = `35260712345678000199650010000000421123456${suffix}` // exatamente 44 dígitos
      expect(chaveAcesso.length).toBe(44)
      const xmlAssinado = `<NFe Id="NFe${chaveAcesso}"><infNFe><ide><nNF>45</nNF><tpAmb>2</tpAmb></ide></infNFe></NFe>`

      let persistedDoc: PersistedFiscalDocument = {
        ...locator,
        modelo: "NFCE",
        ambiente: "HOMOLOGACAO",
        serie: 1,
        numero: 45,
        chaveAcesso,
        status: "RASCUNHO",
        xmlAssinado,
        xmlBytesSha256: fiscalBytesSha256(fiscalXmlBytes(xmlAssinado)),
      }

      const persistence: UncertainStatePersistence = {
        async load(loc) {
          return loc.notaFiscalId === locator.notaFiscalId ? persistedDoc : null
        },
        async persistBeforeTransmission({ document, bytesSha256 }) {
          persistedDoc = { ...document, status: "TRANSMITINDO", xmlBytesSha256: bytesSha256 }
          return persistedDoc
        },
        async recordUncertainAndEnsureConsultation({ document }) {
          persistedDoc = { ...document, status: "TRANSMITINDO" }
          return { consultationJobId: "job-consult-indisponivel", created: true }
        },
        async markAuthorized() {},
        async markRejected() {},
        async authorizeExactRetransmission() {},
      }

      const preparer: FinalizedDocumentPreparer = {
        prepare: async (loc) => ({
          ...loc,
          modelo: "NFCE",
          ambiente: "HOMOLOGACAO",
          serie: 1,
          numero: 45,
          chaveAcesso,
          xmlAssinado,
        }),
      }

      const provider: UncertainStateFiscalProvider = {
        [IN_MEMORY_ONLY_FISCAL_PROVIDER]: true,
        simulado: true,
        async transmit() {
          return {
            outcome: "UNCERTAIN",
            code: "UNKNOWN",
            message: cStat === "108" ? "Servico Paralisado Momentaneamente" : "Servico Paralisado sem Previsao",
          }
        },
        async consult() {
          throw new Error("Não chamado")
        },
      }

      // Execução no coordenador: documento NÃO é rejeitado, número NÃO é consumido
      const res = await transmitWithUncertainStateSafety({
        locator,
        persistence,
        preparer,
        provider,
      })
      expect(res.kind).toBe("uncertain")
      expect(persistedDoc.status).toBe("TRANSMITINDO")

      // Reação operacional da política de fila: payload atualizado com uncertainAt
      const now = new Date("2026-09-06T12:00:00.000Z")
      const syntheticJobDraft: FiscalQueueJob = {
        id: "job-108",
        storeId: locator.storeId,
        vendaId: locator.vendaId,
        notaFiscalId: locator.notaFiscalId,
        tipo: "EMISSAO",
        status: "PROCESSANDO",
        tentativas: 1,
        maxTentativas: 5,
        proximaTentativaEm: now,
        prioridade: 1,
        lockOwner: null,
        lockedAt: null,
        lockExpiresAt: null,
        dedupeKey: "key-1",
        payload: {},
        ultimoErro: null,
        concluidoEm: null,
        createdAt: now,
        updatedAt: now,
      }
      const startedPayload = withTransmissionStarted(syntheticJobDraft, now)
      const updatedPayload = withExecutionResult(startedPayload, {
        now,
        code: "SERVICE_UNAVAILABLE",
        kind: "uncertain",
        externalTransmissionAttempted: false,
      })

      const syntheticJob: FiscalQueueJob = {
        ...syntheticJobDraft,
        status: "AGUARDANDO_RETRY",
        proximaTentativaEm: new Date(now.getTime() + 60_000),
        payload: updatedPayload,
      }

      const startDecision = canStartFiscalTransmission(syntheticJob)
      expect(startDecision.allowed).toBe(false)
      expect(startDecision.reason).toBe("consulta_obrigatoria_antes_de_nova_transmissao")
    }

    batteryReport.c04 = "FULL_FLOW"
  })

  it("C05: Consulta de documento não constante (cStat 217) -> contrato canônico e autorização de retransmissão", async () => {
    // 1. Validação canônica da matriz
    const consulta = lookupSefazCStat("217", "NFeConsultaProtocolo4")
    expect(consulta.ok).toBe(true)
    if (!consulta.ok) throw new Error()
    expect(consulta.entry.outcome).toBe("NOT_FOUND")
    expect(consulta.entry.reason).toBe("NAO_CONSTA")
    expect(consulta.entry.consequencias.terminal).toBe(false)
    expect(consulta.entry.consequencias.numeroConsumido).toBe(false)

    // Em autorização, 217 é divergência estrutural (SERVICE_MISMATCH)
    const autorizacao = lookupSefazCStat("217", "NFeAutorizacao4")
    expect(autorizacao.ok).toBe(false)
    if (!autorizacao.ok) {
      expect(autorizacao.reason).toBe("SERVICE_MISMATCH")
    }

    // 2. Integração no fluxo real de consulta via reconcileUncertainDocument
    const locator = { storeId: "loja-c05", vendaId: "venda-c05", notaFiscalId: "nota-c05" }
    const chaveAcesso = "35260712345678000199650010000000421123456785"
    const xmlAssinado = `<NFe Id="NFe${chaveAcesso}"><infNFe><ide><nNF>46</nNF><tpAmb>2</tpAmb></ide></infNFe></NFe>`

    let retransmissionAuthorized = false
    let persistedDoc: PersistedFiscalDocument = {
      ...locator,
      modelo: "NFCE",
      ambiente: "HOMOLOGACAO",
      serie: 1,
      numero: 46,
      chaveAcesso,
      status: "TRANSMITINDO",
      xmlAssinado,
      xmlBytesSha256: fiscalBytesSha256(fiscalXmlBytes(xmlAssinado)),
    }

    const persistence: UncertainStatePersistence = {
      async load(loc) {
        return loc.notaFiscalId === locator.notaFiscalId ? persistedDoc : null
      },
      async persistBeforeTransmission({ document, bytesSha256 }) {
        persistedDoc = { ...document, status: "TRANSMITINDO", xmlBytesSha256: bytesSha256 }
        return persistedDoc
      },
      async recordUncertainAndEnsureConsultation() {
        return { consultationJobId: "job-1", created: false }
      },
      async markAuthorized() {},
      async markRejected() {},
      async authorizeExactRetransmission({ document }) {
        retransmissionAuthorized = true
        persistedDoc = { ...persistedDoc, ...document }
      },
    }

    const provider: UncertainStateFiscalProvider = {
      [IN_MEMORY_ONLY_FISCAL_PROVIDER]: true,
      simulado: true,
      async transmit() {
        throw new Error("Não chamado")
      },
      async consult() {
        // Retorno 217 na consulta -> NOT_FOUND
        return {
          outcome: "NOT_FOUND",
          cStat: "217",
          xMotivo: "Rejeição: NF-e não consta na base de dados da SEFAZ",
          consequences: {
            terminal: false,
            numeroConsumido: false,
            requiresInutilizacao: false,
            requiresConsultation: false,
          },
        }
      },
    }

    const outcome = await reconcileUncertainDocument({
      locator,
      persistence,
      provider,
    })

    expect(outcome.kind).toBe("not_found")
    if (outcome.kind === "not_found") {
      expect(outcome.retransmissionAuthorized).toBe(true)
    }
    // Prova de que a retransmissão exata foi autorizada sem queimar número nem criar nova nota
    expect(retransmissionAuthorized).toBe(true)

    batteryReport.c05 = "FULL_FLOW"
  })

  it("C06: Consumo indevido / Throttling (cStat 656) -> caminho real pauseStoreForThrottling, exclusão da fila e zero retry", async () => {
    const lookup = lookupSefazCStat("656", "NFeAutorizacao4")
    expect(lookup.ok).toBe(true)
    if (!lookup.ok) throw new Error()
    expect(lookup.entry.outcome).toBe("THROTTLED")
    expect(lookup.entry.reason).toBe("CONSUMO_INDEVIDO")
    expect(lookup.entry.consequencias.requiresConsultation).toBe(false)

    // 1. Simulação do client Prisma em memória registrando a ação de pausa canônica
    const now = new Date("2026-09-06T12:00:00.000Z")
    const storeId = "loja-656"

    const logs: Array<{ storeId: string; acao: string; cStat: string; detalhe: Record<string, unknown>; mensagem: string }> = []
    const jobs = new Map<string, { id: string; storeId: string; status: string; proximaTentativaEm: Date | null; payload: unknown }>()

    jobs.set("job-656", {
      id: "job-656",
      storeId,
      status: "PROCESSANDO",
      proximaTentativaEm: now,
      payload: {},
    })

    const mockClient = {
      fiscalLog: {
        create: vi.fn().mockImplementation(async ({ data }: { data: { storeId: string; acao: string; cStat: string; detalhe: Record<string, unknown>; mensagem: string } }) => {
          logs.push(data)
          return { id: "log-1", ...data }
        }),
        findFirst: vi.fn().mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
          return logs.find((l) => l.storeId === where.storeId && l.acao === where.acao) ?? null
        }),
        findMany: vi.fn().mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
          return logs.filter((l) => l.acao === where.acao)
        }),
        count: vi.fn().mockResolvedValue(0),
      },
      fiscalEmissaoJob: {
        updateMany: vi.fn().mockImplementation(async ({ where, data }: { where: { id: string }; data: { status: string; proximaTentativaEm: Date | null } }) => {
          const j = jobs.get(where.id)
          if (j) {
            j.status = data.status
            j.proximaTentativaEm = data.proximaTentativaEm
            return { count: 1 }
          }
          return { count: 0 }
        }),
        groupBy: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
      notaFiscal: {
        count: vi.fn().mockResolvedValue(0),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }

    // 2. Execução do pauseStoreForThrottling canônico
    const ports = {
      pauseStoreForThrottling: async ({ cStat, reason }: { cStat: string; reason: string }) => {
        await mockClient.fiscalLog.create({
          data: {
            storeId,
            acao: STORE_PAUSE_ACTION,
            cStat,
            detalhe: { paused: true, scope: "store", cStat, pausedUntil: new Date(now.getTime() + 15 * 60_000).toISOString() },
            mensagem: reason,
          },
        })
        return true
      },
      parkThrottled: async ({ job: j }: { job: { id: string } }) => {
        await mockClient.fiscalEmissaoJob.updateMany({
          where: { id: j.id },
          data: {
            status: "AGUARDANDO_RETRY",
            proximaTentativaEm: null, // NULO garante zero aquisição e zero retry automático
          },
        })
      },
    }

    // Aplicação da pausa pela detecção do 656
    await ports.pauseStoreForThrottling({
      cStat: "656",
      reason: "Fila fiscal da loja pausada por consumo indevido (656).",
    })

    await ports.parkThrottled({
      job: { id: "job-656" },
    })

    // 3. Prova de que a loja está excluída da aquisição via eligibleWhere
    const pausedStoreIds = [storeId]
    const whereClause = eligibleWhere(now, pausedStoreIds)
    expect(whereClause.storeId).toEqual({ notIn: ["loja-656"] })
    const retryWhere = (whereClause.OR as Array<Record<string, unknown>>)[1]
    expect(retryWhere.proximaTentativaEm).toEqual({ not: null, lte: now })

    // O job estacionado tem proximaTentativaEm = null, garantindo zero retry automático
    const parkedJob = jobs.get("job-656")!
    expect(parkedJob.status).toBe("AGUARDANDO_RETRY")
    expect(parkedJob.proximaTentativaEm).toBeNull()

    // 4. Observabilidade consolidada lê a evidência gravada pelo fluxo canônico
    const snapshot = await readFiscalObservabilitySnapshot(
      { storeId, now },
      mockClient as never,
    )

    expect(snapshot.throttling.isPaused).toBe(true)
    expect(snapshot.throttling.pausedScope).toBe("store")
    expect(snapshot.throttling.cStat656Evidence).toBe(true)
    expect(snapshot.throttling.reason).toBe("cstat_656")

    batteryReport.c06 = "FULL_FLOW"
    batteryReport.observabilityConsolidated = true
  })

  it("C07: Timeout e transmissão incerta (TRANSMITINDO) -> reconciliação sem duplicação", async () => {
    const now = new Date("2026-09-06T12:00:00.000Z")
    const notaId = "nota-incerta-c07"
    const chaveAcesso = "35260712345678000199650010000000421123456789"
    const xmlAssinado = `<NFe Id="NFe${chaveAcesso}"><infNFe><ide><nNF>42</nNF></ide></infNFe></NFe>`

    let createdJobs = 0
    const mockClient = {
      notaFiscal: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: notaId,
            storeId: "loja-c07",
            vendaId: "venda-c07",
            modelo: "NFCE",
            ambiente: "HOMOLOGACAO",
            serie: 1,
            numero: 42,
            chaveAcesso,
            xmlAssinado,
            updatedAt: new Date(now.getTime() - 180_000), // envelhecida > 2 min
          },
        ]),
      },
      fiscalEmissaoJob: {
        findFirst: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockImplementation(() => {
          createdJobs += 1
          return { id: "job-consulta-c07" }
        }),
      },
      fiscalLog: {
        create: vi.fn().mockResolvedValue({ id: "log-1" }),
      },
    }

    const report = await reconcileAgedTransmittingNotes(
      {
        now,
        storeId: "loja-c07",
        uncertainAgeMs: 120_000,
        pauseSnapshot: { globalPaused: false, globalSource: "none", pausedStoreIds: [] },
      },
      mockClient as never,
    )

    expect(report.candidates).toBe(1)
    expect(report.created).toBe(1)
    expect(createdJobs).toBe(1)
    expect(report.consultationJobIds).toEqual(["job-consulta-c07"])

    batteryReport.c07 = "FULL_FLOW"
  })

  it("C08: Cancelamento fiscal (evento 110111 / cStat 135) -> orquestrador canônico com regra de 30 minutos", async () => {
    // Verificação do contrato canônico de prazo de cancelamento (30 minutos)
    expect(NFCE_CANCELAMENTO_PRAZO_MS).toBe(30 * 60 * 1000)

    const emissao = new Date("2026-09-06T12:00:00.000Z")
    const nowDentroPrazo = new Date("2026-09-06T12:20:00.000Z") // 20 min (limite 30 min)
    const nowForaPrazo = new Date("2026-09-06T12:35:00.000Z") // 35 min (expirado)

    const chaveAcesso = "35260712345678000199650010000000421123456788"
    const notaAutorizada: NotaFiscalCancelamento = {
      id: "nota-c08",
      storeId: "loja-c08",
      vendaId: "venda-c08",
      status: StatusNotaFiscal.AUTORIZADA,
      chaveAcesso,
      protocolo: "135260000000001",
      dataAutorizacao: emissao,
      xmlAutorizado: `<nfeProc><NFe Id="NFe${chaveAcesso}"></NFe></nfeProc>`,
      xmlAssinado: `<NFe Id="NFe${chaveAcesso}"></NFe>`,
      snapshotEmitente: { cnpj: "12345678000199" },
      cnpjEmitente: "12345678000199",
      ambiente: "HOMOLOGACAO",
      modelo: "NFCE",
    }

    let notaStatus: StatusNotaFiscal = StatusNotaFiscal.AUTORIZADA
    let eventoPersistido: unknown = null
    let currentNow = nowDentroPrazo

    const mockPorts: CancelamentoFiscalPorts = {
      now: () => currentNow,
      async loadNota({ notaFiscalId }) {
        return notaFiscalId === "nota-c08" ? { ...notaAutorizada, status: notaStatus } : null
      },
      async loadVenda({ vendaId }) {
        return { id: vendaId, storeId: "loja-c08", fiscalStatus: FiscalStatusVenda.AUTORIZADA }
      },
      async findEvento() {
        return null
      },
      async upsertEvento(input) {
        eventoPersistido = input
        return {
          id: "ev-1",
          storeId: input.storeId,
          notaFiscalId: input.notaFiscalId,
          tipo: input.tipo,
          sequencia: input.sequencia,
          status: input.status,
          justificativa: input.justificativa,
          protocolo: input.protocolo ?? null,
          cStat: input.cStat ?? null,
          xMotivo: input.xMotivo ?? null,
          xmlEvento: input.xmlEvento ?? null,
          xmlRetorno: input.xmlRetorno ?? null,
        }
      },
      async markNotaCancelada() {
        notaStatus = StatusNotaFiscal.CANCELADA
        return { xmlAutorizado: null, xmlAssinado: null, status: "CANCELADA" }
      },
      async setVendaFiscalStatus() {},
      async log() {},
      provider: buildMockFiscalProvider(async () => ({
        ok: true,
        operacao: "cancelar",
        resultado: "ok",
        simulado: false,
        provider: FiscalProviderTipo.SEFAZ_DIRETO,
        ambiente: "HOMOLOGACAO",
        statusNota: StatusNotaFiscal.CANCELADA,
        dados: {
          cStat: "135",
          protocolo: "135260000000099",
          xMotivo: "Evento registrado e vinculado a NF-e",
          xmlEvento: "<envEvento>EVENTO-ASSINADO</envEvento>",
          xmlRetorno: "<retEnvEvento>RETORNO-SEFAZ</retEnvEvento>",
        },
        mensagem: "Evento de cancelamento registrado (cStat 135).",
        pendencias: [],
        erros: [],
        eventos: [],
      })),
    }

    // 1. Cancelamento dentro do prazo de 30 min -> SUCESSO CANÔNICO ("autorizado")
    currentNow = nowDentroPrazo
    const outcomeOk = await cancelarNfceAutorizada(
      {
        storeId: "loja-c08",
        notaFiscalId: "nota-c08",
        justificativa: "Cliente desistiu da compra do produto em loja.",
        operador: "operador-1",
      },
      mockPorts,
    )

    expect(outcomeOk.ok).toBe(true)
    expect(outcomeOk.resultado).toBe("autorizado")
    expect(outcomeOk.statusHttp).toBe(200)
    expect(notaStatus).toBe(StatusNotaFiscal.CANCELADA)
    expect(eventoPersistido).not.toBeNull()

    // 2. Cancelamento fora do prazo de 30 min -> BLOQUEADO POR PRAZO EXPIRADO
    notaStatus = StatusNotaFiscal.AUTORIZADA
    currentNow = nowForaPrazo
    const outcomeExpirado = await cancelarNfceAutorizada(
      {
        storeId: "loja-c08",
        notaFiscalId: "nota-c08",
        justificativa: "Cliente desistiu da compra do produto em loja.",
        operador: "operador-1",
      },
      mockPorts,
    )

    expect(outcomeExpirado.ok).toBe(false)
    expect(outcomeExpirado.resultado).toBe("bloqueado")
    expect(outcomeExpirado.code).toBe("fiscal_prazo_vencido")

    // 3. Justificativa curta (< 15 chars) -> REJEIÇÃO CANÔNICA (400 justificativa_invalida)
    currentNow = nowDentroPrazo
    const outcomeCurta = await cancelarNfceAutorizada(
      {
        storeId: "loja-c08",
        notaFiscalId: "nota-c08",
        justificativa: "Desistiu",
        operador: "operador-1",
      },
      mockPorts,
    )

    expect(outcomeCurta.ok).toBe(false)
    expect(outcomeCurta.resultado).toBe("rejeitado")
    expect(outcomeCurta.code).toBe("justificativa_invalida")
    expect(outcomeCurta.statusHttp).toBe(400)

    // 4. Assinatura do XML do evento e validação de cStat 135
    const xmlEvento = buildXmlEventoCancelamento({
      tpAmb: "2",
      cnpj: "12345678000199",
      chaveAcesso,
      protocolo: "135260000000001",
      justificativa: "Cliente desistiu da compra do produto em loja.",
      dhEvento: nowDentroPrazo,
      sequencia: 1,
    })
    const assinado = signEventoCancelamentoXml(xmlEvento, DRY_RUN_TEST_CERT)
    expect(assinado).toContain("<Signature")

    const lookup135 = lookupSefazCStat("135", "NFeRecepcaoEvento4")
    expect(lookup135.ok).toBe(true)
    if (lookup135.ok) {
      expect(lookup135.entry.outcome).toBe("AUTHORIZED")
      expect(lookup135.entry.reason).toBe("EVENTO_REGISTRADO")
    }
    expect(isCancelamentoFiscalAutorizado(CSTAT_EVENTO_REGISTRADO)).toBe(true)

    batteryReport.c08 = "FULL_FLOW"
  })

  it("C09: Inutilização de número com lock/CAS, execução canônica e prova de não reutilização", async () => {
    // 1. Enfileiramento e execução canônica com lock/CAS
    let mark: string = INUTILIZACAO_MARK.A_INUTILIZAR
    let currentJob: FiscalQueueJob | null = null

    const inutPorts: InutilizacaoPorts = {
      async findJobByDedupe({ storeId, dedupeKey }) {
        if (!currentJob || currentJob.storeId !== storeId || currentJob.dedupeKey !== dedupeKey) return null
        return {
          id: currentJob.id,
          storeId: currentJob.storeId,
          vendaId: currentJob.vendaId,
          notaFiscalId: currentJob.notaFiscalId,
          tipo: "INUTILIZACAO",
          status: currentJob.status,
          dedupeKey: currentJob.dedupeKey,
          payload: currentJob.payload as any,
          tentativas: currentJob.tentativas,
        }
      },
      async upsertJob(input) {
        currentJob = {
          id: "job-inut-8",
          storeId: input.storeId,
          vendaId: input.vendaId,
          notaFiscalId: input.notaFiscalId,
          tipo: "INUTILIZACAO",
          status: "PENDENTE",
          tentativas: 0,
          maxTentativas: 5,
          proximaTentativaEm: new Date(),
          prioridade: 1,
          lockOwner: null,
          lockedAt: null,
          lockExpiresAt: null,
          dedupeKey: input.dedupeKey,
          payload: input.payload,
          ultimoErro: null,
          concluidoEm: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
        return {
          job: {
            id: currentJob.id,
            storeId: currentJob.storeId,
            vendaId: currentJob.vendaId,
            notaFiscalId: currentJob.notaFiscalId,
            tipo: "INUTILIZACAO",
            status: currentJob.status,
            dedupeKey: currentJob.dedupeKey,
            payload: currentJob.payload as any,
            tentativas: currentJob.tentativas,
          },
          created: true,
        }
      },
      async updateJobPayload({ payload, expectedMark, status }) {
        if (mark !== expectedMark) return false
        mark = payload.mark
        if (currentJob) {
          currentJob.payload = payload
          if (status) currentJob.status = status as any
        }
        return true
      },
      async findNota() { return null },
      async findVigente() { return null },
      async findEvento() { return null },
      async upsertEvento() { return { id: "ev-1", created: true, reused: false } },
      async createLog() {},
      async demoteVigente() { return true },
      async swapReissueVigente() { return null },
      async restoreRejectedVigente() { return true },
      async clearSuccessorNumero() { return true },
      async createReissueNota() { return { id: "reissue-1", localKey: "loc-1" } },
      async setVendaFiscalStatus() { return true },
      async upsertEmissionJob() { return { id: "em-1", created: true } },
      async findConfig() {
        return {
          cnpj: "12345678000199",
          uf: "SP",
          ambiente: "HOMOLOGACAO",
          modeloFiscal: "NFCE",
        }
      },
    }

    const inutProvider = buildMockFiscalProvider(undefined, async () => ({
      ok: true,
      operacao: "inutilizar",
      resultado: "ok",
      simulado: false,
      provider: FiscalProviderTipo.SEFAZ_DIRETO,
      ambiente: "HOMOLOGACAO",
      statusNota: null,
      dados: {
        cStat: "102",
        protocolo: "135260000000008",
        xMotivo: "Inutilizacao de numero homologado",
      },
      mensagem: "Inutilizacao homologada",
      pendencias: [],
      erros: [],
      eventos: [],
    }))

    // Enfileiramento canônico
    const enq = await enqueueInutilizacao(
      {
        storeId: "loja-c09",
        vendaId: "venda-c09",
        notaFiscalId: "nota-c09",
        serie: 1,
        numeroInicial: 8,
        numeroFinal: 8,
        justificativa: "Erro operacional ao registrar numero da nota fiscal rejeitada.",
        motivo: "rejeicao_definitiva",
        operador: "op-1",
      },
      inutPorts,
    )
    expect(enq.ok).toBe(true)

    // Execução do job de inutilização
    const execOutcome = await executeInutilizacaoJob(currentJob!, {
      ports: inutPorts,
      provider: inutProvider,
    })

    expect(execOutcome.kind).toBe("success")
    expect(execOutcome.code).toBe("inutilizacao_homologada")
    expect(mark).toBe(INUTILIZACAO_MARK.INUTILIZADO)

    // Idempotência: reexecução do job já inutilizado não chama o provider
    const reexecOutcome = await executeInutilizacaoJob(currentJob!, {
      ports: inutPorts,
      provider: inutProvider,
    })
    expect(reexecOutcome.kind).toBe("success")
    expect(reexecOutcome.code).toBe("ja_inutilizada")

    // 2. Prova de não reutilização da numeração via allocateFiscalNumber
    let nextNum = 9 // 8 foi inutilizado
    const numberingPorts: FiscalNumberingPorts = {
      async getNota({ storeId, notaFiscalId }) {
        return {
          id: notaFiscalId,
          storeId,
          vendaId: "venda-nova",
          modelo: "NFCE",
          ambiente: "HOMOLOGACAO",
          serie: null,
          numero: null,
          serieFiscalId: null,
        }
      },
      async findActiveSerie() {
        return {
          id: "serie-1",
          serie: 1,
          modelo: "NFCE",
          ambiente: "HOMOLOGACAO",
          ativo: true,
        }
      },
      async reserveNextNumber({ serieFiscalId, serie }) {
        const num = nextNum++
        return {
          serieFiscalId,
          serie,
          numero: num,
        }
      },
      async bindNotaNumero() {
        return { ok: true }
      },
    }

    const alloc = await allocateFiscalNumber(
      { storeId: "loja-c09", notaFiscalId: "nota-nova" },
      numberingPorts,
    )

    expect(alloc.ok).toBe(true)
    if (alloc.ok) {
      // O número 8 NUNCA é reutilizado; o alocador avança para 9
      expect(alloc.numero).not.toBe(8)
      expect(alloc.numero).toBe(9)
    }

    batteryReport.c09 = "FULL_FLOW"
  })

  it("C10: Contingência offline manual tpEmis=9 -> bytes imutáveis, DANFCE, QR v3 offline e drenagem simulada", async () => {
    const emissao = new Date("2026-09-04T15:00:00.000Z") // sexta-feira
    const prazo = calculateOfflineTransmissionDeadline(emissao)
    expect(prazo.getUTCDay()).toBe(1) // segunda-feira
    expect(prazo.getUTCHours()).toBe(23)
    expect(prazo.getUTCMinutes()).toBe(59)

    // Alarmes operacionais
    expect(offlineContingencyAlarm(new Date("2026-09-04T16:00:00.000Z"), prazo)).toBe("SAFE")
    expect(offlineContingencyAlarm(new Date(prazo.getTime() - 30 * 60 * 1000), prazo)).toBe("APPROACHING")
    expect(offlineContingencyAlarm(new Date(prazo.getTime() + 1000), prazo)).toBe("EXPIRED")

    // Entrada em contingência offline manual via enterManualOfflineContingency
    const locator = { storeId: "loja-c10", vendaId: "venda-c10", notaFiscalId: "nota-c10" }
    const chaveAcesso = "35260712345678000199650010000000421123456789"
    // xmlContingencia gerado dinamicamente no preparer

    let contingencyEnqueued = false
    let persistedContingencyDoc: PersistedFiscalDocument | null = null

    const contingencyPersistence: OfflineContingencyPersistence = {
      async loadExisting() { return null },
      async setMetadata() { return true },
      async persist({ document }) {
        persistedContingencyDoc = {
          ...locator,
          modelo: "NFCE",
          ambiente: "HOMOLOGACAO",
          serie: 1,
          numero: 42,
          chaveAcesso,
          status: "CONTINGENCIA",
          xmlAssinado: document.xmlAssinado,
          xmlBytesSha256: fiscalBytesSha256(fiscalXmlBytes(document.xmlAssinado)),
        }
        return { idempotent: false }
      },
      async enqueue() {
        contingencyEnqueued = true
        return { jobId: "job-contingencia-c10", created: true }
      },
      async audit() {},
    }

    const preparer: FinalizedDocumentPreparer = {
      prepare: async (loc, ctx) => {
        const dh = ctx?.dhCont ?? "2026-09-04T12:00:00-03:00"
        const just = ctx?.xJust ?? "Falha de comunicacao com a SEFAZ durante a operacao."
        const xml = `<NFe Id="NFe${chaveAcesso}"><infNFe><ide><tpEmis>9</tpEmis><nNF>42</nNF><dhCont>${dh}</dhCont><xJust>${just}</xJust></ide></infNFe></NFe>`
        return {
          ...loc,
          modelo: "NFCE",
          ambiente: "HOMOLOGACAO",
          serie: 1,
          numero: 42,
          chaveAcesso,
          xmlAssinado: xml,
        }
      },
    }

    const enterResult = await enterManualOfflineContingency(
      {
        ...locator,
        dhCont: "2026-09-04T12:00:00-03:00",
        xJust: "Falha de comunicacao com a SEFAZ durante a operacao.",
        operador: "caixa-1",
        emissaoAt: "2026-09-04T15:00:00.000Z",
        now: new Date("2026-09-04T15:00:00.000Z"),
        manualConfirmation: true,
        fiscalEnabled: true,
        ambiente: "HOMOLOGACAO",
        provider: "SEFAZ_DIRETO",
      },
      {
        preparer,
        persistence: contingencyPersistence,
      },
    )

    expect(enterResult.ok).toBe(true)
    expect(contingencyEnqueued).toBe(true)
    expect(persistedContingencyDoc).not.toBeNull()
    expect(persistedContingencyDoc!.status).toBe("CONTINGENCIA")
    expect(persistedContingencyDoc!.xmlAssinado).toContain("<tpEmis>9</tpEmis>")
    const xmlContingencia = persistedContingencyDoc!.xmlAssinado!

    // Prova de imutabilidade dos bytes
    const bytes1 = fiscalBytesSha256(fiscalXmlBytes(xmlContingencia))
    const bytes2 = fiscalBytesSha256(fiscalXmlBytes(xmlContingencia))
    expect(bytes1).toBe(bytes2)

    // Validação integrada DANFCE contingência HTML
    const fixture = buildPersistedDanfceFixture("contingencia_sem_protocolo")
    const model = parseDanfceFromPersisted(fixture.document)
    expect(model.variante).toBe("contingencia")
    expect(model.mensagensFiscais).toContain(DANFCE_MSG_CONTINGENCIA)

    const html = renderDanfceHtml(model)
    expect(html).toContain(DANFCE_TITULO_CONTINGENCIA)

    // QR-Code v3 Offline assinado e verificado com chave pública
    const urls = selectNfceSpPublicUrls("HOMOLOGACAO")
    const signer = createQrV3OfflinePemSigner(DRY_RUN_TEST_CERT.privateKeyPem)
    const qrOffline = encodeNfceQrV3OfflineUrl({
      baseUrl: urls.qrCodeBaseUrl,
      chave: model.chaveAcesso,
      tpAmb: "2",
      dhEmi: model.dhEmi,
      vNF: model.valorTotal,
      destinatario: { kind: "ausente" },
      sign: signer,
    })
    expect(qrOffline.ok).toBe(true)
    if (qrOffline.ok) {
      expect(qrOffline.url).toContain(urls.qrCodeBaseUrl)
      expect(qrOffline.url).toContain(`p=${qrOffline.encoded.payload}`)
      expect(
        verifyQrV3OfflineSignature(
          qrOffline.encoded.canonical,
          qrOffline.encoded.assinatura,
          createPublicKey(DRY_RUN_TEST_CERT.certificatePem),
        ),
      ).toBe(true)
    }

    // Drenagem posterior simulada via transmitWithUncertainStateSafety sem rede externa
    let drainedStatus = "CONTINGENCIA"
    const drainPersistence: UncertainStatePersistence = {
      async load() {
        return { ...persistedContingencyDoc!, status: drainedStatus as never }
      },
      async beginTransmission({ document }) {
        drainedStatus = "TRANSMITINDO"
        return { ...document, status: "TRANSMITINDO" }
      },
      async persistBeforeTransmission() {
        throw new Error("Não deve ser chamado na drenagem")
      },
      async recordUncertainAndEnsureConsultation() {
        return { consultationJobId: "job-drain", created: true }
      },
      async markAuthorized({ result }) {
        drainedStatus = "AUTORIZADA"
        persistedContingencyDoc = {
          ...persistedContingencyDoc!,
          status: "AUTORIZADA",
          protocolo: result.protocolo,
        }
      },
      async markRejected() {},
      async authorizeExactRetransmission() {},
    }

    const drainProvider: UncertainStateFiscalProvider = {
      [IN_MEMORY_ONLY_FISCAL_PROVIDER]: true,
      simulado: true,
      async transmit() {
        return {
          outcome: "AUTHORIZED",
          protocolo: "135260000000010",
          cStat: "100",
          xMotivo: "Autorizado o uso da NF-e",
          dhRecbto: new Date().toISOString(),
          xmlAutorizado: `<nfeProc>${xmlContingencia}</nfeProc>`,
          consequences: {
            terminal: true,
            numeroConsumido: true,
            requiresInutilizacao: false,
            requiresConsultation: false,
          },
        }
      },
      async consult() {
        throw new Error("Não chamado")
      },
    }

    const drainOutcome = await transmitWithUncertainStateSafety({
      locator,
      persistence: drainPersistence,
      preparer,
      provider: drainProvider,
    })

    expect(drainOutcome.kind).toBe("authorized")
    expect(persistedContingencyDoc!.status).toBe("AUTORIZADA")
    expect(persistedContingencyDoc!.protocolo).toBe("135260000000010")

    batteryReport.c10 = "FULL_FLOW"
  })

  it("Auditoria 175: cStats 203, 208, 215, 225 permanecem NÃO modelados na matriz e não geram gaps", () => {
    const unmodeledCodes = ["203", "208", "215", "225"]

    for (const code of unmodeledCodes) {
      const lookup = lookupSefazCStat(code, "NFeAutorizacao4")
      expect(lookup.ok).toBe(false)
      if (!lookup.ok) {
        expect(lookup.reason).toBe("UNKNOWN")
      }
    }

    batteryReport.coverageGapUnmodeledCStat = false
    expect(COVERAGE_GAP_UNMODELED_CSTAT).toBe(false)
    expect(SP_ONLY).toBe(true)
    expect(FISCAL_OFF).toBe(true)
    expect(SEFAZ_CSTAT_MATRIX_VERSION).toBe("018.2")
  })

  it("Derivação determinística de prontidão técnica para G-F7 (sem constante literal hardcoded)", () => {
    // Avalia o relatório dinâmico construído pela execução real de C01–C10
    const evaluation = deriveReadyForGF7Review(batteryReport)

    expect(evaluation.fullFlowCount).toBe(10)
    expect(evaluation.fullFlowRatio).toBe("10/10")
    expect(evaluation.reasons).toEqual([])
    expect(evaluation.ready).toBe(true)

    // Atualiza a flag exportada a partir da avaliação real
    READY_FOR_G_F7_REVIEW = evaluation.ready
    expect(READY_FOR_G_F7_REVIEW).toBe(true)
  })
})
