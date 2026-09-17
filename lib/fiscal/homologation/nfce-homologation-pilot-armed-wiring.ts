/**
 * MODO EXPLICITAMENTE ARMADO do piloto de homologação NFC-e (GOAL 022 · slice do
 * runtime one-shot).
 *
 * Módulo SEPARADO do wiring dormente (`nfce-homologation-pilot-wiring.ts`), que segue
 * intocado: DORMENTE por construção — capability `EXTERNAL_EXECUTION_DENIED`, transporte
 * offline recusando, A1 lazy recusado, e SEM import de transporte HTTP/mTLS. A separação
 * física preserva o invariante testado do módulo dormente (o source-scan que proíbe
 * import de `sefaz-soap-transport` neste diretório continua válido para o dormente).
 *
 * Este módulo só é alcançado pela superfície administrativa própria
 * (`executePilotHomologationEmissionTransmission`) com (jobId, storeId) autorizados.
 * Ordem canônica de cada execução (TODAS antes de qualquer rede):
 *  1. job EXATAMENTE `EMISSAO`, com jobId/storeId coerentes;
 *  2. loja-piloto RESOLVIDA do registro fiscal (nunca literal);
 *  3. configuração NFCE + HOMOLOGACAO + SEFAZ_DIRETO + fiscalEnabled=true (kill-switch
 *     armado na janela — fora dela nada executa);
 *  4. gate efêmero versionado em código (`PILOT_EMISSION_HOMOLOGATION_WINDOW`) VIGENTE;
 *  5. preparo/assinatura em memória + pre-flight XSD pelo worker canônico SOBRE OS MESMOS
 *     bytes (worker ausente/divergente ⇒ fail-closed SEM consumir a ativação);
 *  6. consumo one-shot PERSISTENTE e GLOBAL da ativação (1 documento por acionamento —
 *     `MAX_DOCUMENT_TRANSMISSIONS=1` como enforcement de runtime, não constante
 *     documental; replay/cold start/concorrência/falha de persistência colidem no ledger);
 *  7. capability positiva POR EXECUÇÃO (binding opaco; nunca flag global);
 *  8. authority externa one-shot que libera `nodeSefazHttpsRuntimePorts` SOMENTE para
 *     `NFeAutorizacao4`/HOMOLOGACAO da loja autorizada, na janela;
 *  9. executor GOAL-012 canônico: guards D4 rodam de novo dentro do provider,
 *     imediatamente antes do envelope/transporte (anti-TOCTOU).
 *
 * MAX_RETRIES_PER_FAILURE=0 permanece estrutural: desfecho incerto de EMISSAO estaciona
 * (`uncertain`) e a CONSULTA reconcilia — nunca segunda transmissão automática.
 */
import { prisma } from "@/lib/prisma"
import { resolveActiveCertificate } from "@/lib/fiscal/certificate/resolve-active-certificate"
import type { ResolveActiveCertificateResult } from "@/lib/fiscal/certificate/resolve-active-certificate"
import { EnvVault, type EnvLike } from "@/lib/fiscal/vault/env-vault"
import type { FiscalSecretVault } from "@/lib/fiscal/vault/fiscal-secret-vault"
import { loadPkcs12 } from "@/lib/fiscal/vault/pkcs12-loader"
import { NfceSignError, type FiscalCertificateMaterial } from "@/lib/fiscal/signing"
import type { FinalizedNfceCertificateResolver } from "@/lib/fiscal/emission/finalized-nfce-preparer"
import { createFinalizedNfcePreparer } from "@/lib/fiscal/emission/finalized-nfce-preparer"
import { createPersistedNfceFinalizationSourceResolver } from "@/lib/fiscal/emission/nfce-finalization-source-resolver"
import { createPrismaUncertainStatePersistence } from "@/lib/fiscal/emission/prisma-uncertain-state-persistence"
import type { UncertainStateJobExecutorDependencies } from "@/lib/fiscal/emission/uncertain-state-job-executor"
import { createUncertainStateJobExecutor } from "@/lib/fiscal/emission/uncertain-state-job-executor"
import type { UncertainStatePersistence } from "@/lib/fiscal/emission/uncertain-state.types"
import { SefazDiretoProvider } from "@/lib/fiscal/provider/sefaz/sefaz-direto-provider"
import { SefazSoapTransport } from "@/lib/fiscal/provider/sefaz/sefaz-soap-transport"
import type { SefazGuardPorts, SefazXsdAttestation } from "@/lib/fiscal/provider/sefaz/sefaz-guards"
import type { SefazTransport } from "@/lib/fiscal/provider/sefaz/sefaz-transport.types"
import { createPrismaFiscalQueueWorkerPorts, eligibleWhere } from "@/lib/fiscal/queue/prisma-queue-worker"
import { drainFiscalQueue } from "@/lib/fiscal/queue/queue-worker"
import type {
  FiscalQueueExecutionResult,
  FiscalQueueJob,
  FiscalQueueWorkerPorts,
} from "@/lib/fiscal/queue/queue.types"
import { validarXsd } from "@/lib/fiscal/dry-run/dry-run-validation"
import { XSD_SCHEMA_PACKAGE, type XsdValidationAdapter } from "@/lib/fiscal/xsd"
import { OFFICIAL_XSD_MANIFEST_SHA256 } from "@/lib/fiscal/xsd/official-package"
import { NFCE_HOMOLOGATION_PILOT_QR_URLS } from "./nfce-homologation-pilot-wiring"
import {
  consumePilotEmissionActivation,
  createPilotEmissionExternalAuthority,
  evaluatePilotEmissionWindow,
  PILOT_EMISSION_HOMOLOGATION_WINDOW,
  pilotEmissionCapability,
  sha256Hex,
  type PilotEmissionLedgerClient,
  type PilotEmissionWindowConfig,
} from "./pilot-emission-gate"

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function texto(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

type ArmedPilotPrismaClient = {
  configuracaoFiscalLoja: {
    findUnique: (args: unknown) => Promise<unknown | null>
  }
  notaFiscal: {
    findFirst: (args: unknown) => Promise<unknown | null>
  }
  fiscalEmissaoJob: {
    findUnique: (args: unknown) => Promise<unknown | null>
    updateMany: (args: unknown) => Promise<{ count: number }>
  }
}

export type ArmedPilotEmissionDeps = {
  readonly client?: ArmedPilotPrismaClient
  readonly ledgerClient?: PilotEmissionLedgerClient
  readonly window?: PilotEmissionWindowConfig
  readonly clock?: () => Date
  /** Resolver A1 canônico (default `resolveActiveCertificate`) — injetável para testes. */
  readonly resolveCertificate?: (params: { storeId: string }) => Promise<ResolveActiveCertificateResult>
  readonly vault?: FiscalSecretVault
  readonly env?: EnvLike
  /** Transporte injetável SOMENTE para prova em testes (o produtivo nasce da authority). */
  readonly transport?: SefazTransport
  /** Adapter do worker XSD canônico (default: cliente configurado por `FISCAL_XSD_WORKER_URL`). */
  readonly xsdAdapter?: XsdValidationAdapter
  readonly persistence?: UncertainStatePersistence
}

/**
 * Resolver A1 ARMADO — exclusivamente `resolveActiveCertificate` + `EnvVault` +
 * `loadPkcs12` (nenhum segundo caminho de certificado), liberado SOMENTE com a janela
 * do gate vigente para a loja autorizada.
 */
export function createArmedPilotA1Resolver(options: {
  readonly storeId: string
  readonly window: PilotEmissionWindowConfig
  readonly now: () => Date
  readonly resolveCertificate?: (params: { storeId: string }) => Promise<ResolveActiveCertificateResult>
  readonly vault?: FiscalSecretVault
  readonly env?: EnvLike
}): FinalizedNfceCertificateResolver {
  return async (): Promise<FiscalCertificateMaterial> => {
    const status = evaluatePilotEmissionWindow(options.window, options.now())
    if (!status.active) {
      throw new NfceSignError(
        "material_ausente",
        "PILOT_EMISSION_HOMOLOGATION_PENDING: material A1 não liberado fora da janela autorizada.",
      )
    }
    const storeId = options.storeId.trim()
    if (!storeId) {
      throw new NfceSignError("material_ausente", "Loja ausente para resolução do A1 do piloto.")
    }
    const resolve = options.resolveCertificate ?? resolveActiveCertificate
    const resolved = await resolve({ storeId })
    if (!resolved.ok) {
      throw new NfceSignError(
        "material_ausente",
        "Material A1 indisponível na janela da transmissão do piloto.",
      )
    }
    const vault = options.vault ?? new EnvVault({ env: options.env })
    let material: FiscalCertificateMaterial | null = null
    try {
      const pfx = await vault.getCertificadoPfx(storeId, resolved.blobRef)
      const senha = await vault.getCertificadoSenha(storeId, resolved.senhaRef)
      if (pfx && pfx.length > 0 && senha) {
        const loaded = loadPkcs12(pfx, senha)
        material = { privateKeyPem: loaded.privateKeyPem, certificatePem: loaded.certificatePem }
      }
    } catch {
      material = null
    }
    if (!material) {
      throw new NfceSignError(
        "material_ausente",
        "Material A1 indisponível no cofre na janela da transmissão do piloto.",
      )
    }
    return material
  }
}

/** SHA-256 hex do XML assinado — mesma convenção do `bytesSha256` persistido (ADR-0017). */
function sha256HexOfXml(xml: string): string {
  return sha256Hex(xml)
}

/**
 * Ports D4 do modo armado: piloto resolvido do registro fiscal REAL da própria loja
 * (nunca literal), certificado pelo resolver canônico 016D-A0 e atestado XSD produzido
 * pelo worker canônico (`validarXsd`) SOBRE OS MESMOS bytes persistidos — sem fabricar
 * atestado e sem desligar o guard 8. Worker ausente/divergente ⇒ `null` ⇒ bloqueio.
 */
export function createArmedPilotSefazGuardPorts(
  client: ArmedPilotPrismaClient,
  storeId: string,
  deps: {
    readonly resolveCertificate?: (params: { storeId: string }) => Promise<ResolveActiveCertificateResult>
    readonly xsdAdapter?: XsdValidationAdapter
    readonly jobId: string
  },
): SefazGuardPorts {
  return {
    resolvePilotStoreId: async () => {
      const row = record(
        await client.configuracaoFiscalLoja.findUnique({
          where: { storeId },
          select: { storeId: true, provider: true },
        }),
      )
      if (texto(row.provider) !== "SEFAZ_DIRETO") return null
      const id = texto(row.storeId) || storeId
      return id || null
    },
    loadFiscalConfig: async (id) => {
      const row = record(
        await client.configuracaoFiscalLoja.findUnique({
          where: { storeId: id },
          select: { provider: true },
        }),
      )
      const provider = texto(row.provider)
      return provider ? { provider } : null
    },
    readXsdAttestation: async (input): Promise<SefazXsdAttestation | null> => {
      const bytesSha256 = String(input.bytesSha256 ?? "").trim().toLowerCase()
      if (!bytesSha256) return null
      const nota = record(
        await client.notaFiscal.findFirst({
          where: { storeId: input.storeId, chaveAcesso: input.chaveAcesso },
          select: { xmlAssinado: true },
        }),
      )
      const xml = typeof nota.xmlAssinado === "string" ? nota.xmlAssinado.trim() : ""
      if (!xml) return null
      const hash = sha256HexOfXml(xml)
      if (hash !== bytesSha256) return null
      const xsd = await validarXsd(xml, {
        adapter: deps.xsdAdapter,
        storeId: input.storeId,
        jobId: `homologacao-emissao:${deps.jobId}`,
        correlationId: `homologacao-emissao:${deps.jobId}`,
      })
      if (xsd.outcome !== "VALIDACAO_APROVADA" || xsd.status !== "xsd_ok") return null
      if (
        !xsd.engine ||
        xsd.engine.schemaPackage !== XSD_SCHEMA_PACKAGE ||
        xsd.engine.schemaManifestHash !== OFFICIAL_XSD_MANIFEST_SHA256
      ) {
        return null
      }
      return Object.freeze({
        outcome: "VALIDACAO_APROVADA",
        xmlSha256: hash,
        schemaVersion: XSD_SCHEMA_PACKAGE,
      })
    },
    resolveActiveCertificate: (params) =>
      (deps.resolveCertificate ?? resolveActiveCertificate)({ storeId: params.storeId }),
  }
}

export type ArmedPilotEmissionWiring = {
  /** Executa SOMENTE o job EMISSAO autorizado; qualquer outro input é terminal negado. */
  readonly execute: (job: FiscalQueueJob) => Promise<FiscalQueueExecutionResult>
  /** Ports do worker com aquisição restrita ao job autorizado. */
  readonly ports: FiscalQueueWorkerPorts
}

/**
 * Wiring POR EXECUÇÃO do modo armado: nasce preso ao par (jobId, storeId) autorizado.
 * Nenhuma instância é global; nada é reutilizável entre jobs.
 */
export function createArmedNfceHomologationPilotWiring(input: {
  readonly jobId: string
  readonly storeId: string
  readonly deps?: ArmedPilotEmissionDeps
}): ArmedPilotEmissionWiring {
  const client = (input.deps?.client ?? (prisma as unknown as ArmedPilotPrismaClient))
  const ledgerClient = input.deps?.ledgerClient ?? (client as unknown as PilotEmissionLedgerClient)
  const windowConfig = input.deps?.window ?? PILOT_EMISSION_HOMOLOGATION_WINDOW
  const clock = input.deps?.clock ?? (() => new Date())
  const persistence =
    input.deps?.persistence ?? createPrismaUncertainStatePersistence(client as never)

  const execute = async (job: FiscalQueueJob): Promise<FiscalQueueExecutionResult> => {
    const negado = (code: string, mensagem: string): FiscalQueueExecutionResult => ({
      kind: "terminal",
      code,
      mensagem,
      simulado: false,
      externalTransmissionAttempted: false,
      providerInvoked: false,
    })
    if (job.tipo !== "EMISSAO") {
      return negado("pilot_emission_tipo_nao_suportado", "Modo armado executa somente job EMISSAO.")
    }
    if (job.id !== input.jobId || job.storeId !== input.storeId) {
      return negado("pilot_emission_job_incoerente", "Job não corresponde ao autorizado para esta execução.")
    }
    if (!job.notaFiscalId) {
      return negado("nota_fiscal_ausente", "Job sem notaFiscalId; execução fail-closed.")
    }

    const guardPorts = createArmedPilotSefazGuardPorts(client, input.storeId, {
      jobId: input.jobId,
      resolveCertificate: input.deps?.resolveCertificate,
      xsdAdapter: input.deps?.xsdAdapter,
    })

    // Piloto resolvido do registro REAL (nunca literal).
    const pilotStoreId = texto(await guardPorts.resolvePilotStoreId())
    if (!pilotStoreId || pilotStoreId !== job.storeId) {
      return negado("loja_fora_do_piloto", "Loja do job não é a loja-piloto resolvida.")
    }

    // Configuração: provider/ambiente/modelo + kill-switch (fiscalEnabled) ARMADO.
    const config = record(
      await client.configuracaoFiscalLoja.findUnique({
        where: { storeId: job.storeId },
        select: { provider: true, ambiente: true, modeloFiscal: true, fiscalEnabled: true },
      }),
    )
    if (
      texto(config.provider) !== "SEFAZ_DIRETO" ||
      texto(config.ambiente) !== "HOMOLOGACAO" ||
      texto(config.modeloFiscal) !== "NFCE" ||
      config.fiscalEnabled !== true
    ) {
      return negado(
        "contexto_piloto_invalido",
        "Configuração da loja fora do piloto NFCE/HOMOLOGACAO/SEFAZ_DIRETO com kill-switch armado.",
      )
    }

    // Gate efêmero vigente (dormente/parcial/futura/expirada bloqueiam).
    const windowStatus = evaluatePilotEmissionWindow(windowConfig, clock())
    if (!windowStatus.active) {
      return negado(
        `pilot_emission_gate_${windowStatus.reason}`,
        "Gate efêmero da transmissão do piloto não está vigente; execução bloqueada.",
      )
    }

    // Preparo + pre-flight XSD PRÉ-one-shot (padrão do drill de contingência · relatório 127):
    // o documento é composto/assinado em memória e os MESMOS bytes validados pelo worker XSD
    // canônico. Worker ausente, timeout, resposta divergente ou XML inválido ⇒ fail-closed
    // SEM consumir a ativação — o orçamento de 1 documento não se queima fora de rede.
    // A assinatura é determinística (mesmo XML ⇒ mesma assinatura), e o guard 8 volta a
    // validar no provider contra os bytes persistidos (anti-TOCTOU).
    const preparer = createFinalizedNfcePreparer({
      resolveSource: createPersistedNfceFinalizationSourceResolver(client as never),
      resolveCertificate: createArmedPilotA1Resolver({
        storeId: input.storeId,
        window: windowConfig,
        now: clock,
        resolveCertificate: input.deps?.resolveCertificate,
        vault: input.deps?.vault,
        env: input.deps?.env,
      }),
      qrUrls: NFCE_HOMOLOGATION_PILOT_QR_URLS,
    })
    let preflightXml: string
    try {
      const preflight = await preparer.prepare({
        storeId: job.storeId,
        vendaId: job.vendaId,
        notaFiscalId: String(job.notaFiscalId),
      })
      preflightXml = preflight.xmlAssinado
    } catch {
      return negado(
        "pilot_emission_preparo_indisponivel",
        "Preparo/assinatura do documento falhou antes do consumo da ativação; nada foi consumido.",
      )
    }
    const preflightXsd = await validarXsd(preflightXml, {
      adapter: input.deps?.xsdAdapter,
      storeId: job.storeId,
      jobId: `homologacao-emissao:${job.id}`,
      correlationId: `homologacao-emissao:${job.id}`,
    })
    if (preflightXsd.outcome !== "VALIDACAO_APROVADA" || preflightXsd.status !== "xsd_ok") {
      return negado(
        "pilot_emission_xsd_nao_aprovado",
        `Validação XSD prévia falhou fechada (${preflightXsd.outcome}); ativação NÃO foi consumida.`,
      )
    }
    if (
      !preflightXsd.engine ||
      preflightXsd.engine.schemaPackage !== XSD_SCHEMA_PACKAGE ||
      preflightXsd.engine.schemaManifestHash !== OFFICIAL_XSD_MANIFEST_SHA256
    ) {
      return negado(
        "pilot_emission_xsd_resposta_divergente",
        "Resposta do worker XSD diverge do pacote/manifest esperados; ativação NÃO foi consumida.",
      )
    }

    // Consumo one-shot PERSISTENTE antes de qualquer rede (replay/cold start/concorrência
    // colidem na unicidade do ledger; falha de persistência bloqueia igual).
    const consumed = await consumePilotEmissionActivation(
      ledgerClient,
      windowConfig,
      {
        jobId: job.id,
        storeId: job.storeId,
        notaFiscalId: job.notaFiscalId,
        operatorId: "fiscal-pilot-emission",
      },
      clock,
    )
    if (!consumed.ok) {
      return negado(
        consumed.code === "window_unavailable"
          ? "pilot_emission_gate_window_unavailable"
          : "pilot_emission_activation_ja_consumida",
        "Ativação da transmissão do piloto indisponível ou já consumida; nenhum transporte autorizado.",
      )
    }

    // Capability positiva POR EXECUÇÃO (binding opaco pós-commit; nunca global).
    const capability = pilotEmissionCapability(consumed.activation, {
      jobId: job.id,
      storeId: job.storeId,
    })
    if (!capability || capability.allowExternalProviderExecution !== true) {
      return negado(
        "pilot_emission_capability_indisponivel",
        "Capability de execução não nasceu do consumo da ativação; bloqueado.",
      )
    }

    // Authority externa DESTA execução → transporte produtivo one-shot.
    const authority = createPilotEmissionExternalAuthority(consumed.activation, {
      jobId: job.id,
      storeId: job.storeId,
    })
    const transport =
      input.deps?.transport ??
      (authority ? new SefazSoapTransport({ externalTransmissionAuthority: authority }) : null)
    if (!transport) {
      return negado(
        "pilot_emission_authority_indisponivel",
        "Authority externa do transporte não nasceu da ativação; bloqueado.",
      )
    }

    const provider = new SefazDiretoProvider({ ports: guardPorts, transport })
    const executorDependencies: UncertainStateJobExecutorDependencies = {
      persistence,
      preparer,
      provider,
      now: clock,
      capability,
    }
    return createUncertainStateJobExecutor(executorDependencies)(job)
  }

  // Ports do worker canônico com o executor ARMADO no lugar do default — o dispatch da
  // fila continua idêntico (o job EMISSAO autorizado jamais vai ao emissor legado) — e
  // aquisição CAS restrita ao job autorizado: nenhum outro job é tocado por esta instância.
  const basePorts = createPrismaFiscalQueueWorkerPorts(
    client as never,
    async () => {
      throw new Error("Emissor legado inacessível no modo armado do piloto de homologação.")
    },
    execute,
  )
  const scopedPorts: FiscalQueueWorkerPorts = {
    ...basePorts,
    acquireNextJob: async (acquireInput) => {
      const where = {
        AND: [
          { id: input.jobId, storeId: input.storeId, tipo: "EMISSAO" },
          eligibleWhere(acquireInput.now, acquireInput.pausedStoreIds),
        ],
      }
      const acquired = await client.fiscalEmissaoJob.updateMany({
        where,
        data: {
          status: "PROCESSANDO",
          lockOwner: acquireInput.workerId,
          lockedAt: acquireInput.now,
          lockExpiresAt: new Date(acquireInput.now.getTime() + acquireInput.leaseMs),
          tentativas: { increment: 1 },
        },
      })
      if (acquired.count !== 1) return null
      const locked = record(
        await client.fiscalEmissaoJob.findUnique({
          where: { id: input.jobId },
          select: {
            id: true, storeId: true, vendaId: true, notaFiscalId: true, tipo: true, status: true,
            tentativas: true, maxTentativas: true, proximaTentativaEm: true, prioridade: true,
            lockOwner: true, lockedAt: true, lockExpiresAt: true, dedupeKey: true, payload: true,
            ultimoErro: true, concluidoEm: true, createdAt: true, updatedAt: true,
          },
        }),
      )
      if (!locked.id) return null
      return {
        job: {
          id: String(locked.id ?? ""),
          storeId: String(locked.storeId ?? ""),
          vendaId: String(locked.vendaId ?? ""),
          notaFiscalId: locked.notaFiscalId == null ? null : String(locked.notaFiscalId),
          tipo: String(locked.tipo ?? "") as FiscalQueueJob["tipo"],
          status: String(locked.status ?? "") as FiscalQueueJob["status"],
          tentativas: Number(locked.tentativas ?? 0),
          maxTentativas: Number(locked.maxTentativas ?? 1),
          proximaTentativaEm: locked.proximaTentativaEm instanceof Date ? locked.proximaTentativaEm : null,
          prioridade: Number(locked.prioridade ?? 0),
          lockOwner: locked.lockOwner == null ? null : String(locked.lockOwner),
          lockedAt: locked.lockedAt instanceof Date ? locked.lockedAt : null,
          lockExpiresAt: locked.lockExpiresAt instanceof Date ? locked.lockExpiresAt : null,
          dedupeKey: locked.dedupeKey == null ? null : String(locked.dedupeKey),
          payload: Object.keys(record(locked.payload)).length > 0 ? record(locked.payload) : null,
          ultimoErro: locked.ultimoErro == null ? null : String(locked.ultimoErro),
          concluidoEm: locked.concluidoEm instanceof Date ? locked.concluidoEm : null,
          createdAt: locked.createdAt instanceof Date ? locked.createdAt : new Date(0),
          updatedAt: locked.updatedAt instanceof Date ? locked.updatedAt : new Date(0),
        },
        takeover: false,
      }
    },
  }

  return { execute, ports: scopedPorts }
}

export type PilotEmissionRunReport = {
  readonly ok: boolean
  readonly code: string
  readonly mensagem: string
  readonly outcome: {
    readonly status: string
    readonly mensagem: string
  } | null
}

/**
 * Runner da transmissão única do piloto: valida o job apontado, monta o wiring armado
 * POR EXECUÇÃO e drena EXATAMENTE um job — o autorizado — pelo pipeline canônico da
 * fila (batchSize 1 = no máximo 1 documento por acionamento).
 */
export async function executePilotHomologationEmissionTransmission(
  input: {
    readonly jobId: string
    readonly storeId: string
    readonly workerId?: string
  },
  deps: ArmedPilotEmissionDeps = {},
): Promise<PilotEmissionRunReport> {
  const jobId = input.jobId.trim()
  const storeId = input.storeId.trim()
  if (!jobId || !storeId) {
    return { ok: false, code: "parametros_invalidos", mensagem: "jobId e storeId são obrigatórios.", outcome: null }
  }
  const client = deps.client ?? (prisma as unknown as ArmedPilotPrismaClient)
  const raw = await client.fiscalEmissaoJob.findUnique({
    where: { id: jobId },
    select: { id: true, storeId: true, tipo: true },
  })
  const jobRow = record(raw)
  if (!raw || String(jobRow.id ?? "") !== jobId) {
    return { ok: false, code: "job_nao_encontrado", mensagem: "Job da transmissão do piloto não encontrado.", outcome: null }
  }
  if (String(jobRow.storeId ?? "") !== storeId) {
    return { ok: false, code: "pilot_emission_job_incoerente", mensagem: "Job pertence a outra loja.", outcome: null }
  }
  if (String(jobRow.tipo ?? "") !== "EMISSAO") {
    return {
      ok: false,
      code: "pilot_emission_tipo_nao_suportado",
      mensagem: "Somente job EMISSAO pode ser apontado à transmissão do piloto.",
      outcome: null,
    }
  }

  const wiring = createArmedNfceHomologationPilotWiring({ jobId, storeId, deps })
  const report = await drainFiscalQueue(
    {
      workerId: input.workerId?.trim() || `homologacao-emissao:${jobId.slice(0, 8)}`,
      batchSize: 1,
      now: deps.clock,
    },
    wiring.ports,
  )
  const item = report.items[0]
  return {
    ok: item?.status === "concluido",
    code: item?.status ?? "pilot_emission_sem_execucao",
    mensagem:
      item?.status === "concluido"
        ? "Transmissão do piloto executada pelo pipeline da fila."
        : "Execução terminou sem conclusão; ver o desfecho do item drenado.",
    outcome: item ? { status: item.status, mensagem: item.mensagem } : null,
  }
}
