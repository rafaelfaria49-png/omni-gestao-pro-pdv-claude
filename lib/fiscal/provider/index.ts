/**
 * Camada de abstração de provider fiscal (GOAL_006) — ponto único de import.
 *
 * DORMENTE: nenhum provider faz emissão/transmissão real nesta fase. A orquestração
 * (carregar NotaFiscal/snapshot do banco, gravar FiscalLog/EventoFiscal, alterar
 * Venda.fiscalStatus) é responsabilidade de GOALs futuros — não desta camada.
 */
export * from "./types"
export {
  StubHomologacaoProvider,
  stubHomologacaoProvider,
} from "./stub-homologacao"
export {
  resolveFiscalProvider,
  isFiscalProviderReady,
  assertProviderConfigurado,
  normalizeProviderError,
  FiscalProviderConfigError,
  type ResolveFiscalProviderResult,
} from "./resolver"
