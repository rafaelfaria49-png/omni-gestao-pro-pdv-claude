/**
 * Verificador único do Gate executável do Dry-Run fiscal (GOAL-007).
 *
 * `runFiscalDryRunGate(snapshot, opts)` roda a esteira A SECO em MODO GATE (numeração real de
 * homologação — sem placeholder) e produz a matriz de 11 itens (número · nome · status ·
 * autoridade · evidência · erro). Verde SOMENTE com 11/11 `aprovado`; nenhum item aprovado por
 * ausência de verificação; falha permanece falha (nunca vira aviso). NÃO persiste, NÃO transmite,
 * provider simulado, sem SEFAZ, sem certificado real, sem segredo em evidência.
 *
 * Cada item consome uma AUTORIDADE já mesclada (GOAL-002..008): snapshot, produto fiscal, XML,
 * worker XSD real (G-C2), assinatura (G-C3/ADR-0011), cofre+certificado (GOAL-008/ADR-0009),
 * numeração (GOAL_008), máquina de estados (GOAL_003) e contrato do provider (GOAL_006). O gate
 * NÃO reimplementa nenhuma delas — apenas as exercita e coleta evidência estruturada.
 */
import { createHash } from "node:crypto"
import type { VendaFiscalSnapshot } from "../venda-fiscal-snapshot"
import { VENDA_FISCAL_SNAPSHOT_VERSAO, VENDA_FISCAL_TAX_RULES_VERSION } from "../venda-fiscal-snapshot"
import { runFiscalDryRunDetailed } from "./dry-run-pipeline"
import { DRY_RUN_TEST_CERT } from "./dry-run-fixtures"
import type { NfceXmlContext } from "../xml"
import type { XsdValidationAdapter } from "../xsd"
import {
  allocateFiscalNumber,
  type FiscalNumberAllocationOutcome,
  type FiscalNumberingPorts,
  type NumberingNota,
} from "../numbering"
import {
  EnvVault,
  assertNoSecretLeak,
  scanForSecrets,
  validarCertificadoLoja,
} from "../vault"
import { makeTestPfx, TEST_PFX_PRIVATE_KEY_PEM } from "../vault/__fixtures__/make-test-pfx"
import {
  createMockProvider,
  stubHomologacaoProvider,
  type FiscalProviderRequest,
  type FiscalProviderResponse,
} from "../provider"
import { verifyNfceSignature } from "../signing"
import {
  canCancelarFiscalmente,
  canCancelarOperacionalmente,
  canEditarVendaFiscal,
  canEmitirFiscalmente,
} from "../venda-fiscal-state-machine"
import {
  DRY_RUN_GATE_REPORT_VERSAO,
  DRY_RUN_GATE_TOTAL_ITENS,
  type DryRunGateItem,
  type DryRunGateItemNumero,
  type DryRunGateItemStatus,
  type DryRunGateReport,
} from "./dry-run-gate.types"

/**
 * Injeção de falha do HARNESS a seco — usada SOMENTE para provar que as fixtures defeituosas
 * reprovam no item exato. Default: nenhuma. Sem efeito em operação normal. Não corrompe nada
 * fora da memória do gate (segue tudo a seco — nada persiste/transmite).
 */
export type GateFaultInjection = {
  /** Corrompe a assinatura após assinar ⇒ o item 5 deve reprovar (assinatura corrompida). */
  assinaturaCorrompida?: boolean
  /** Faz a reexecução divergir em bytes ⇒ o item 8 deve reprovar (localKey duplicado). */
  bytesDivergentesNaReexecucao?: boolean
}

export type RunFiscalDryRunGateOptions = {
  /**
   * Adapter do worker XSD REAL (G-C2 / ADR-0010). Ausente ⇒ `createConfiguredXsdWorkerClient()`
   * (lê `FISCAL_XSD_WORKER_URL`). Sem worker real disponível, o item 4 fica `nao_auferivel`
   * (fail-closed) — nunca aprovado por omissão. Injetar o cliente real no contexto provisionado.
   */
  xsdAdapter?: XsdValidationAdapter
  /** Instante de referência para a validação do certificado de teste (item 6). Default: agora. */
  agora?: Date
  /** Injeção de falha do harness a seco (provar as fixtures negativas). Default: nenhuma. */
  faltas?: GateFaultInjection
}

function sha256Hex(s: string): string {
  return createHash("sha256").update(Buffer.from(s, "utf8")).digest("hex")
}

function onlyDigits(v: string | null | undefined): string {
  return String(v ?? "").replace(/\D+/g, "")
}

function item(
  numero: DryRunGateItemNumero,
  nome: string,
  autoridade: string,
  status: DryRunGateItemStatus,
  evidencia: Record<string, unknown>,
  erro: string | null,
): DryRunGateItem {
  return { numero, nome, status, autoridade, evidencia, erro }
}

// ── Numeração de homologação em memória (item 7) ─────────────────────────────────────────
// Série fixture de HOMOLOGAÇÃO; reserva atômica por incremento (concorrência plena = GOAL-010).

type GateNumberingState = { nota: NumberingNota; proximo: number }

function buildHomologacaoNumberingPorts(storeId: string, vendaId: string): {
  ports: FiscalNumberingPorts
  state: GateNumberingState
} {
  const state: GateNumberingState = {
    nota: {
      id: `nota-gate:${vendaId}`,
      storeId,
      vendaId,
      modelo: "NFCE",
      ambiente: "HOMOLOGACAO",
      serie: 1,
      numero: null,
      serieFiscalId: "serie-homolog-1",
    },
    proximo: 1,
  }
  const ports: FiscalNumberingPorts = {
    async getNota() {
      return { ...state.nota }
    },
    async findActiveSerie() {
      return { id: "serie-homolog-1", serie: 1, modelo: "NFCE", ambiente: "HOMOLOGACAO" }
    },
    async reserveNextNumber() {
      const numero = state.proximo
      state.proximo += 1
      return { serieFiscalId: "serie-homolog-1", serie: 1, numero }
    },
    async bindNotaNumero({ serie, numero, serieFiscalId }) {
      state.nota = { ...state.nota, serie, numero, serieFiscalId }
      return { ok: true }
    },
  }
  return { ports, state }
}

// ── Item 4 (XSD): mapeia o status fail-closed do dry-run para o status do gate ────────────

function xsdItemStatus(xsdStatus: string): DryRunGateItemStatus {
  if (xsdStatus === "xsd_ok") return "aprovado"
  // Rejeição real do schema/política = reprovado; indisponibilidade de infraestrutura = não auferível.
  if (xsdStatus === "xsd_invalido" || xsdStatus === "xsd_politica_rejeitada") return "reprovado"
  return "nao_auferivel"
}

// ── Item 11 (contrato do provider): checagem de forma canônica ────────────────────────────

const PROVIDER_RESULTADOS = new Set(["ok", "pendente", "rejeitado", "erro"])

function respostaObedeceContrato(r: FiscalProviderResponse): boolean {
  return (
    typeof r.ok === "boolean" &&
    typeof r.operacao === "string" &&
    PROVIDER_RESULTADOS.has(String(r.resultado)) &&
    r.simulado === true &&
    typeof r.provider !== "undefined" &&
    typeof r.ambiente !== "undefined" &&
    (r.statusNota === null || typeof r.statusNota === "string") &&
    (r.dados === null || typeof r.dados === "object") &&
    typeof r.mensagem === "string" &&
    Array.isArray(r.pendencias) &&
    Array.isArray(r.erros) &&
    Array.isArray(r.eventos)
  )
}

/**
 * Executa o gate de 11 itens sobre um snapshot congelado. Determinístico e sem segredo.
 * O snapshot deve ser o do MIX PILOTO (ou uma fixture defeituosa, para o gate reprovar no item
 * exato). Sempre A SECO — nada é persistido/transmitido.
 */
export async function runFiscalDryRunGate(
  snapshot: VendaFiscalSnapshot,
  options: RunFiscalDryRunGateOptions = {},
): Promise<DryRunGateReport> {
  const agora = options.agora ?? new Date()
  const itens: DryRunGateItem[] = []

  // 1) Numeração real de homologação (remove o placeholder do modo gate) — prepara o contexto.
  const { ports } = buildHomologacaoNumberingPorts(snapshot.storeId, snapshot.vendaId)
  const alloc: FiscalNumberAllocationOutcome = await allocateFiscalNumber(
    { storeId: snapshot.storeId, notaFiscalId: `nota-gate:${snapshot.vendaId}` },
    ports,
  )
  const contexto: NfceXmlContext | undefined = alloc.ok
    ? { serie: alloc.serie, numero: alloc.numero, dataEmissao: snapshot.venda.data }
    : undefined

  // 2) Esteira a seco em modo gate (assina com o certificado de TESTE determinístico do dry-run).
  const dry = await runFiscalDryRunDetailed(snapshot, {
    contexto,
    certificado: DRY_RUN_TEST_CERT,
    xsdAdapter: options.xsdAdapter,
  })
  const report = dry.report

  // Assinatura efetiva (item 5) — o harness pode corromper para provar a detecção.
  let assinaturaValidaEfetiva = report.assinaturaValida
  if (options.faltas?.assinaturaCorrompida && dry.xmlAssinado) {
    const tampered = dry.xmlAssinado.replace(/<vNF>[^<]*<\/vNF>/, "<vNF>9999.99</vNF>")
    assinaturaValidaEfetiva = verifyNfceSignature(tampered).valido // esperado: false
  }

  // 3) Reexecução (item 8) — mesmo localKey/numeração ⇒ mesmos bytes. O harness pode divergir.
  const allocReuse = await allocateFiscalNumber(
    { storeId: snapshot.storeId, notaFiscalId: `nota-gate:${snapshot.vendaId}` },
    ports,
  )
  const contexto2: NfceXmlContext | undefined =
    options.faltas?.bytesDivergentesNaReexecucao && contexto
      ? { ...contexto, numero: Number(contexto.numero) + 1 }
      : contexto
  const dry2 = await runFiscalDryRunGate2ndPass(snapshot, contexto2, options.xsdAdapter)

  // ── Item 1 — Snapshot imutável válido ──────────────────────────────────────────────────
  {
    const congelado =
      Object.isFrozen(snapshot) &&
      Object.isFrozen(snapshot.emitente) &&
      Object.isFrozen(snapshot.itens) &&
      snapshot.itens.every((it) => Object.isFrozen(it))
    const versaoOk = snapshot.versao === VENDA_FISCAL_SNAPSHOT_VERSAO
    const regrasOk = snapshot.tributacao?.regrasVersion === VENDA_FISCAL_TAX_RULES_VERSION
    // Hash canônico do conteúdo (exclui `geradoEm`, volátil) — prova de contrato estável.
    const hash = sha256Hex(JSON.stringify({ ...snapshot, geradoEm: undefined }))
    const ok = congelado && versaoOk && regrasOk
    itens.push(
      item(
        1,
        "Snapshot imutável válido",
        "Contrato VendaFiscalSnapshot (versao/regrasVersion) + deep-freeze (imutabilidade) — venda-fiscal-snapshot.ts",
        ok ? "aprovado" : "reprovado",
        {
          versao: snapshot.versao,
          regrasVersion: snapshot.tributacao?.regrasVersion ?? null,
          congelado,
          hash,
        },
        ok
          ? null
          : !congelado
            ? "Snapshot não está congelado (deep-freeze ausente)."
            : "Versão de contrato/regras do snapshot divergente.",
      ),
    )
  }

  // ── Item 2 — Produto fiscal completo (100% para o mix piloto; incompleto bloqueia) ──────
  {
    const itensSemFiscal = snapshot.diagnostico.itensSemFiscal
    const pendencias = snapshot.diagnostico.pendencias
    const completos = snapshot.itens.filter((it) => it.fiscalCompleto).length
    const ok = itensSemFiscal.length === 0 && snapshot.diagnostico.prontoParaEmissao
    itens.push(
      item(
        2,
        "Produto fiscal completo",
        "Diagnóstico do snapshot (getProdutoFiscal, GOAL-004) — pendências fiscais por item, sem fallback silencioso",
        ok ? "aprovado" : "reprovado",
        {
          itens: snapshot.itens.length,
          completos,
          itensSemFiscal,
          pendencias,
        },
        ok ? null : `Produto fiscal incompleto: ${pendencias.join("; ") || `itens ${itensSemFiscal.join(", ")}`}.`,
      ),
    )
  }

  // ── Item 3 — XML estruturalmente correto ────────────────────────────────────────────────
  {
    const xmlEtapa = report.etapas.find((e) => e.nome === "xml")
    const estrutural = report.validacaoEstrutural
    const ok = xmlEtapa?.status === "ok" && estrutural.ok
    itens.push(
      item(
        3,
        "XML estruturalmente correto",
        "Builder NFC-e 4.00 + validação estrutural (buildNfceXmlResult / validarEstruturaNfce)",
        ok ? "aprovado" : "reprovado",
        {
          xmlGerado: report.hashXml !== null,
          hashXml: report.hashXml,
          estruturalOk: estrutural.ok,
          erros: estrutural.erros,
        },
        ok ? null : estrutural.erros.join(" ") || "XML não gerado ou estrutura mínima ausente.",
      ),
    )
  }

  // ── Item 4 — XSD oficial válido (worker/validador REAL; fixtures negativas falham aqui) ──
  {
    const status = xsdItemStatus(report.xsd.status)
    const engine = report.xsd.engine
    itens.push(
      item(
        4,
        "XSD oficial válido",
        "Worker XSD real (xmllint containerizado, PL_010e_v1.02, manifest fc42d03e…) — G-C2 / ADR-0010",
        status,
        {
          statusXsd: report.xsd.status,
          outcome: report.xsd.outcome,
          engine: engine
            ? {
                name: engine.name,
                xmllintVersion: engine.xmllintVersion,
                libxml2Version: engine.libxml2Version,
                binaryHash: engine.binaryHash,
                schemaPackage: engine.schemaPackage,
                schemaManifestHash: engine.schemaManifestHash,
              }
            : null,
          violacoes: report.xsd.violacoes,
        },
        status === "aprovado"
          ? null
          : status === "reprovado"
            ? `XML reprovado pelo XSD oficial: ${report.xsd.violacoes.join("; ") || report.xsd.mensagem}.`
            : `Worker XSD real não auferível (${report.xsd.outcome}). Injete o adapter do worker real (FISCAL_XSD_WORKER_URL) — item não aprovado por omissão.`,
      ),
    )
  }

  // ── Item 5 — Assinatura válida (digest + SignatureValue; corrompida falha aqui) ─────────
  {
    const ok = report.assinaturaPresente && assinaturaValidaEfetiva
    itens.push(
      item(
        5,
        "Assinatura válida",
        "XMLDSig RSA-SHA1/SHA-1 (verifyNfceSignature) — prova externa G-C3 / ADR-0011",
        ok ? "aprovado" : "reprovado",
        {
          assinaturaPresente: report.assinaturaPresente,
          assinaturaValida: assinaturaValidaEfetiva,
          referenciaId: report.referenciaId,
          hashXmlAssinado: report.hashXmlAssinado,
        },
        ok ? null : "Assinatura ausente ou inválida (digest/SignatureValue não conferem).",
      ),
    )
  }

  // ── Item 6 — Certificado de teste compatível (via EnvVault; CNPJ×loja; validade; cadeia) ─
  {
    const cnpjLoja = onlyDigits(snapshot.emitente.cnpj) || "11222333000181"
    const test = makeTestPfx({ cnpj: cnpjLoja })
    const env: Record<string, string | undefined> = {}
    const vault = new EnvVault({ env, allowWrite: true })
    let evidencia: Record<string, unknown>
    let ok = false
    let erro: string | null = null
    try {
      const { blobRef, senhaRef } = await vault.putCertificadoPfx(snapshot.storeId, test.pfx, test.senha)
      const validacao = await validarCertificadoLoja({
        vault,
        storeId: snapshot.storeId,
        blobRef,
        senhaRef,
        cnpjLoja,
        agora,
      })
      ok = validacao.ok && validacao.statusSugerido === "ATIVO"
      evidencia = {
        statusSugerido: validacao.statusSugerido,
        cnpjConfere: validacao.cnpj.confere,
        validadeVigente: validacao.validade.vigente,
        cadeiaDisponivel: validacao.cadeiaDisponivel,
        motivos: validacao.motivos,
        obtidoPor: "EnvVault (referência opaca)",
      }
      erro = ok ? null : `Certificado de teste incompatível: ${validacao.motivos.join(", ") || validacao.statusSugerido}.`
      // Zero segredo: prova que a evidência não contém a senha/bytes/chave do .pfx.
      assertNoSecretLeak(
        evidencia,
        { senha: test.senha, pfxBytes: test.pfx, privateKeyPem: TEST_PFX_PRIVATE_KEY_PEM },
        "gate:item6",
      )
    } catch (e) {
      ok = false
      evidencia = { erroInterno: e instanceof Error ? e.name : "erro" }
      erro = "Falha ao resolver/validar o certificado de teste pelo cofre (fail-closed)."
    }
    itens.push(
      item(
        6,
        "Certificado de teste compatível",
        "EnvVault (ADR-0009) + validarCertificadoLoja (PKCS#12, CNPJ×loja, validade, cadeia, RSA≥2048) — GOAL-008",
        ok ? "aprovado" : "reprovado",
        evidencia,
        erro,
      ),
    )
  }

  // ── Item 7 — Numeração controlada real (série homologação; sem numeracaoPlaceholder) ────
  {
    const semPlaceholder = report.numeracaoPlaceholder === false
    const ok = alloc.ok && semPlaceholder
    itens.push(
      item(
        7,
        "Numeração controlada real",
        "allocateFiscalNumber por série de homologação (GOAL_008) — placeholder removido do modo gate",
        ok ? "aprovado" : "reprovado",
        {
          alocada: alloc.ok,
          serie: alloc.ok ? alloc.serie : null,
          numero: alloc.ok ? alloc.numero : null,
          ambiente: alloc.ok ? alloc.ambiente : null,
          numeracaoPlaceholder: report.numeracaoPlaceholder,
          nota: "concorrência plena da numeração permanece no GOAL-010",
        },
        ok
          ? null
          : !alloc.ok
            ? `Numeração indisponível: ${alloc.errorCode} — ${alloc.mensagem}`
            : "Numeração placeholder ainda ativa no modo gate.",
      ),
    )
  }

  // ── Item 8 — Idempotência (mesmo localKey ⇒ mesmos bytes; zero documento duplicado) ─────
  {
    const bytesIguais =
      report.hashXmlAssinado !== null && report.hashXmlAssinado === dry2.report.hashXmlAssinado
    const numeroReusado = allocReuse.ok && allocReuse.reused === true && (!alloc.ok || allocReuse.numero === alloc.numero)
    const ok = bytesIguais && numeroReusado
    itens.push(
      item(
        8,
        "Idempotência",
        "localKey determinística + numeração idempotente + XML/assinatura determinísticos",
        ok ? "aprovado" : "reprovado",
        {
          hashXmlAssinado: report.hashXmlAssinado,
          reexecucaoHashIgual: bytesIguais,
          numeroReusado,
          numeroPrimeiro: alloc.ok ? alloc.numero : null,
          numeroReexecucao: allocReuse.ok ? allocReuse.numero : null,
          contadorNaoTocado: allocReuse.ok ? allocReuse.reused : false,
        },
        ok
          ? null
          : !bytesIguais
            ? "Reexecução do mesmo localKey produziu bytes divergentes (não-idempotente)."
            : "Numeração não reaproveitada na reexecução (risco de documento duplicado).",
      ),
    )
  }

  // ── Item 9 — Máquina de estados (transições aplicáveis do pipeline a seco) ──────────────
  {
    const checks: Array<{ transicao: string; esperado: boolean; obtido: boolean }> = [
      { transicao: "NAO_FISCAL editável", esperado: true, obtido: canEditarVendaFiscal("NAO_FISCAL") },
      { transicao: "PENDENTE editável", esperado: true, obtido: canEditarVendaFiscal("PENDENTE") },
      { transicao: "PENDENTE emitível", esperado: true, obtido: canEmitirFiscalmente("PENDENTE") },
      { transicao: "EMITINDO NÃO editável", esperado: false, obtido: canEditarVendaFiscal("EMITINDO") },
      { transicao: "EMITINDO NÃO cancelável (operacional)", esperado: false, obtido: canCancelarOperacionalmente("EMITINDO") },
      { transicao: "AUTORIZADA NÃO editável", esperado: false, obtido: canEditarVendaFiscal("AUTORIZADA") },
      { transicao: "AUTORIZADA cancelável (fiscal)", esperado: true, obtido: canCancelarFiscalmente("AUTORIZADA") },
      { transicao: "REJEITADA editável", esperado: true, obtido: canEditarVendaFiscal("REJEITADA") },
      { transicao: "REJEITADA emitível", esperado: true, obtido: canEmitirFiscalmente("REJEITADA") },
    ]
    const falhas = checks.filter((c) => c.esperado !== c.obtido)
    const ok = falhas.length === 0
    itens.push(
      item(
        9,
        "Máquina de estados",
        "Máquina de estados fiscal da venda (GOAL_003) — transições do pipeline a seco",
        ok ? "aprovado" : "reprovado",
        { transicoes: checks.length, verificadas: checks, falhas },
        ok ? null : `Transição inconsistente: ${falhas.map((f) => f.transicao).join(", ")}.`,
      ),
    )
  }

  // ── Item 11 — Contrato do provider (record/replay; provider simulado) ───────────────────
  // (calculado antes do item 10 porque a varredura de segredo do item 10 cobre tudo acima.)
  let providerItem: DryRunGateItem
  {
    const request: FiscalProviderRequest = {
      contexto: {
        storeId: snapshot.storeId,
        notaFiscalId: `nota-gate:${snapshot.vendaId}`,
        modelo: snapshot.modelo,
        ambiente: snapshot.ambiente,
        serie: contexto?.serie ?? null,
        numero: contexto?.numero ?? null,
      },
      snapshot,
    }
    // RECORD — o MockProvider registra a sequência de chamadas do contrato.
    const mock = createMockProvider({ clock: () => "gate", label: "MOCK" })
    mock.validarSnapshot(snapshot)
    mock.prepararEmissao(request)
    await mock.emitir(request)
    const sequenciaGravada = mock.calls.map((c) => c.operacao)
    // REPLAY — o StubHomologacao executa a MESMA sequência; validamos a forma canônica.
    const rVal = stubHomologacaoProvider.validarSnapshot(snapshot)
    const rPrep = stubHomologacaoProvider.prepararEmissao(request)
    const rEmit = await stubHomologacaoProvider.emitir(request)
    const respostas = [rVal, rPrep, rEmit]
    const contratoValido = respostas.every(respostaObedeceContrato)
    const sequenciaEsperada = ["validarSnapshot", "prepararEmissao", "emitir"]
    const sequenciaOk = JSON.stringify(sequenciaGravada) === JSON.stringify(sequenciaEsperada)
    const emissaoSimulada =
      rEmit.ok === true &&
      rEmit.simulado === true &&
      String(rEmit.statusNota) === "AUTORIZADA" &&
      String((rEmit.dados ?? {}).chaveAcesso ?? "").startsWith("SIM-")
    const simulado = stubHomologacaoProvider.simulado === true && respostas.every((r) => r.simulado === true)
    const ok = simulado && sequenciaOk && contratoValido && emissaoSimulada
    providerItem = item(
      11,
      "Contrato do provider",
      "Contrato FiscalProvider por record/replay (MockProvider × StubHomologacao) — provider simulado",
      ok ? "aprovado" : "reprovado",
      {
        providerSimulado: simulado,
        sequenciaGravada,
        contratoValido,
        emissaoSimulada,
        chaveSimuladaPrefixo: "SIM-",
        providerReal: false,
      },
      ok ? null : "Contrato do provider divergente (sequência/forma canônica/simulação).",
    )
  }

  // ── Item 10 — Artefatos e logs (a seco; logs estruturados; zero segredo; sem banco) ─────
  {
    const parciais = { itens: [...itens, providerItem], report }
    // O certificado de TESTE do dry-run tem a chave em claro (sem senha). Varre-se a chave privada
    // e o PEM do certificado — nenhum pode aparecer no relatório/logs a seco.
    const scan = scanForSecrets(parciais, {
      senha: null,
      pfxBytes: null,
      privateKeyPem: DRY_RUN_TEST_CERT.privateKeyPem,
      materialDecodificado: DRY_RUN_TEST_CERT.certificatePem,
    })
    const zeroSegredo = scan.vazou === false
    const logsEstruturados = report.etapas.length > 0
    const ok = report.descartado === true && zeroSegredo && logsEstruturados
    itens.push(
      item(
        10,
        "Artefatos e logs",
        "Invariante a seco (descartado) + varredura de segredos (assertNoSecretLeak) — sem PrismaClient/persistência",
        ok ? "aprovado" : "reprovado",
        {
          descartado: report.descartado,
          etapas: report.etapas.map((e) => ({ nome: e.nome, status: e.status })),
          zeroSegredo,
          ocorrenciasSegredo: scan.ocorrencias,
          persistencia: "nenhuma (sem PrismaClient/lib/prisma; artefatos em memória)",
        },
        ok
          ? null
          : !zeroSegredo
            ? `Segredo detectado em artefato/log: ${scan.ocorrencias.join(", ")}.`
            : report.descartado !== true
              ? "Invariante 'descartado' ausente (algo pode ter sido persistido/transmitido)."
              : "Logs estruturados ausentes.",
      ),
    )
  }

  itens.push(providerItem)
  itens.sort((a, b) => a.numero - b.numero)

  const aprovados = itens.filter((i) => i.status === "aprovado").length
  const aprovado = aprovados === DRY_RUN_GATE_TOTAL_ITENS && itens.length === DRY_RUN_GATE_TOTAL_ITENS

  return {
    versao: DRY_RUN_GATE_REPORT_VERSAO,
    aprovado,
    aprovados,
    total: DRY_RUN_GATE_TOTAL_ITENS,
    itens,
    chaveAcesso: report.chaveAcesso,
    hashXmlAssinado: report.hashXmlAssinado,
    numeracaoPlaceholder: report.numeracaoPlaceholder,
    descartado: true,
  }
}

/** Segunda passada idêntica para a prova de idempotência (item 8). Não infla o relatório. */
async function runFiscalDryRunGate2ndPass(
  snapshot: VendaFiscalSnapshot,
  contexto: NfceXmlContext | undefined,
  xsdAdapter: XsdValidationAdapter | undefined,
) {
  return runFiscalDryRunDetailed(snapshot, {
    contexto,
    certificado: DRY_RUN_TEST_CERT,
    xsdAdapter,
  })
}
