/**
 * Pipeline fiscal ponta-a-ponta (BL-FISCAL-008) — `runFiscalPipeline`. DORMENTE.
 *
 * Esteira única: Dry-Run (snapshot → tributação congelada → XML → assinatura de TESTE →
 * verificação → estrutural → XSD) → Provider Stub (validarSnapshot → prepararEmissao → emitir
 * SIMULADO) → relatório consolidado. NUNCA persiste, NUNCA transmite, NUNCA toca banco/SEFAZ.
 * Pura (exceto hashing no dry-run) e determinística (relatório sem timestamps/segredo).
 */
import type { VendaFiscalSnapshot } from "../venda-fiscal-snapshot"
import {
  runFiscalDryRunDetailed,
  type RunFiscalDryRunOptions,
} from "../dry-run"
import {
  stubHomologacaoProvider,
  type FiscalProvider,
  type FiscalProviderConfigInput,
  type FiscalProviderRequest,
  type FiscalProviderResponse,
} from "../provider"
import {
  FISCAL_PIPELINE_REPORT_VERSAO,
  type FiscalPipelineEtapa,
  type FiscalPipelineEtapaStatus,
  type FiscalPipelineProvider,
  type FiscalPipelineReport,
  type FiscalPipelineStatus,
  type ProviderStepSummary,
} from "./fiscal-pipeline.types"

export type RunFiscalPipelineOptions = RunFiscalDryRunOptions & {
  /** Provider a usar (default: stub de homologação). Injete MockProvider em testes. */
  provider?: FiscalProvider
  /** Configuração fiscal da loja (opcional) — se presente, é validada pelo provider. */
  config?: FiscalProviderConfigInput
  /** Id da NotaFiscal (apenas para semente do placeholder do provider). */
  notaFiscalId?: string | null
}

export type RunFiscalPipelineDetailed = {
  report: FiscalPipelineReport
  /** Artefatos EM MEMÓRIA (efêmeros — não persistidos). */
  xml: string | null
  xmlAssinado: string | null
  /** Respostas brutas do provider (com eventos/timestamps) — fora do relatório determinístico. */
  providerRespostas: FiscalProviderResponse[]
}

function etapa(nome: FiscalPipelineEtapa["nome"], status: FiscalPipelineEtapaStatus, mensagem: string): FiscalPipelineEtapa {
  return { nome, status, mensagem }
}

/** Normaliza uma resposta do provider para resumo NÃO-volátil (sem eventos/timestamps). */
function resumoProvider(resp: FiscalProviderResponse): ProviderStepSummary {
  const dados = resp.dados ?? {}
  return {
    operacao: resp.operacao,
    ok: resp.ok,
    resultado: resp.resultado,
    statusNota: typeof resp.statusNota === "string" ? resp.statusNota : resp.statusNota ?? null,
    mensagem: resp.mensagem,
    chaveAcesso: (dados.chaveAcesso as string | null | undefined) ?? null,
    protocolo: (dados.protocolo as string | null | undefined) ?? null,
    cStat: (dados.cStat as string | null | undefined) ?? null,
    pendencias: resp.pendencias ?? [],
    erros: (resp.erros ?? []).map((e) => ({ code: e.code, mensagem: e.mensagem })),
  }
}

function etapaStatusDe(resumo: ProviderStepSummary): FiscalPipelineEtapaStatus {
  if (resumo.ok) return "ok"
  return resumo.resultado === "pendente" ? "pendente" : "erro"
}

/** Executa o pipeline e devolve relatório + artefatos em memória + respostas brutas do provider. */
export async function runFiscalPipelineDetailed(
  snapshot: VendaFiscalSnapshot,
  options: RunFiscalPipelineOptions = {},
): Promise<RunFiscalPipelineDetailed> {
  const etapas: FiscalPipelineEtapa[] = []
  const erros: string[] = []
  const warnings: string[] = []
  const providerRespostas: FiscalProviderResponse[] = []

  // 1) Dry-Run (snapshot → XML → assinatura de teste → verificação → estrutural → XSD).
  const dry = runFiscalDryRunDetailed(snapshot, options)
  const dryReport = dry.report
  warnings.push(...dryReport.warnings)
  if (dryReport.status === "erro") {
    erros.push(...dryReport.erros)
    etapas.push(etapa("dry_run", "erro", "Dry-Run falhou — esteira interrompida antes do provider."))
  } else {
    etapas.push(etapa("dry_run", dryReport.status === "pendente" ? "pendente" : "ok", "Dry-Run concluído."))
  }

  // Provider só roda se há XML assinado verificável (sem isso, nada a "enviar").
  const podeProvider = Boolean(dry.xmlAssinado) && dryReport.assinaturaValida && dryReport.validacaoEstrutural.ok

  let provider: FiscalPipelineProvider | null = null

  if (!podeProvider) {
    etapas.push(etapa("provider_validacao_snapshot", "pulada", "Pulada (sem XML assinado válido)."))
    etapas.push(etapa("provider_preparo", "pulada", "Pulada (sem XML assinado válido)."))
    etapas.push(etapa("provider_emissao", "pulada", "Pulada (sem XML assinado válido)."))
  } else {
    const prov = options.provider ?? stubHomologacaoProvider
    const request: FiscalProviderRequest = {
      contexto: {
        storeId: snapshot.storeId,
        notaFiscalId: options.notaFiscalId ?? null,
        modelo: snapshot.modelo,
        ambiente: snapshot.ambiente,
        serie: options.contexto?.serie ?? null,
        numero: options.contexto?.numero ?? null,
      },
      snapshot,
    }

    // (opcional) validação de configuração da loja.
    if (options.config !== undefined) {
      const respCfg = prov.validarConfiguracao(options.config)
      providerRespostas.push(respCfg)
      if (!respCfg.ok) warnings.push(`Config do provider: ${respCfg.mensagem}`)
    }

    const respVal = prov.validarSnapshot(snapshot)
    providerRespostas.push(respVal)
    const resumoVal = resumoProvider(respVal)
    etapas.push(etapa("provider_validacao_snapshot", etapaStatusDe(resumoVal), respVal.mensagem))
    if (!respVal.ok) erros.push(...resumoVal.erros.map((e) => e.mensagem))

    const respPrep = prov.prepararEmissao(request)
    providerRespostas.push(respPrep)
    const resumoPrep = resumoProvider(respPrep)
    etapas.push(etapa("provider_preparo", etapaStatusDe(resumoPrep), respPrep.mensagem))
    if (!respPrep.ok) erros.push(...resumoPrep.erros.map((e) => e.mensagem))

    // emitir (autorizar) — SIMULADO; nada é transmitido.
    const respEmit = await Promise.resolve(prov.emitir(request))
    providerRespostas.push(respEmit)
    const resumoEmit = resumoProvider(respEmit)
    etapas.push(etapa("provider_emissao", etapaStatusDe(resumoEmit), respEmit.mensagem))
    if (!respEmit.ok) erros.push(...resumoEmit.erros.map((e) => e.mensagem))

    provider = {
      tipo: String(prov.tipo),
      simulado: prov.simulado,
      validacaoSnapshot: resumoVal,
      preparo: resumoPrep,
      emissao: resumoEmit,
    }
  }

  const temErroEtapa = etapas.some((e) => e.status === "erro")
  const status: FiscalPipelineStatus =
    erros.length > 0 || temErroEtapa
      ? "erro"
      : warnings.length > 0 || dryReport.status === "pendente"
        ? "pendente"
        : "ok"

  const prontoParaHomologacao =
    dryReport.assinaturaValida &&
    dryReport.validacaoEstrutural.ok &&
    provider?.emissao?.ok === true &&
    erros.length === 0

  const report: FiscalPipelineReport = {
    versao: FISCAL_PIPELINE_REPORT_VERSAO,
    status,
    prontoParaHomologacao,
    etapas,
    dryRun: dryReport,
    provider,
    chaveAcesso: dryReport.chaveAcesso,
    assinaturaValida: dryReport.assinaturaValida,
    erros: Array.from(new Set(erros)),
    warnings: Array.from(new Set(warnings)),
    descartado: true,
  }

  return { report, xml: dry.xml, xmlAssinado: dry.xmlAssinado, providerRespostas }
}

/**
 * Executa o pipeline fiscal completo (homologação a seco) e devolve SOMENTE o relatório
 * consolidado (artefatos descartados — não retornados, não persistidos, não transmitidos).
 */
export async function runFiscalPipeline(
  snapshot: VendaFiscalSnapshot,
  options: RunFiscalPipelineOptions = {},
): Promise<FiscalPipelineReport> {
  return (await runFiscalPipelineDetailed(snapshot, options)).report
}
