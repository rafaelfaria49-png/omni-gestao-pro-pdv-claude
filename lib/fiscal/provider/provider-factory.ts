/**
 * Fábrica de providers fiscais (BL-FISCAL-007) — seleção por intenção, fora do enum do schema.
 *
 * Complementa o `resolveFiscalProvider` (GOAL_006), que resolve por `ConfiguracaoFiscalLoja.provider`
 * (enum do DB). Esta fábrica é para callers que escolhem o provider por INTENÇÃO (testes, dry-run,
 * pipeline de homologação) sem depender da config persistida:
 *  - `sefaz_stub` / `stub_homologacao` → `StubHomologacaoProvider` (simula respostas SEFAZ homolog.).
 *  - `mock` → `MockProvider` configurável (desfechos scriptáveis p/ testar caminhos de erro).
 *
 * Tudo SIMULADO, sem rede/fetch, sem Prisma. Nenhuma transmissão real.
 */
import type { FiscalProvider } from "./types"
import { StubHomologacaoProvider, stubHomologacaoProvider } from "./stub-homologacao"
import { MockProvider, createMockProvider, type MockProviderConfig } from "./mock-provider"

/**
 * `SefazStubProvider` — alias semântico do `StubHomologacaoProvider`: ele já simula as respostas
 * de homologação da SEFAZ (cStat 100/107/135/102) sem transmitir nada. Mantido como nome único do
 * "provider stub da SEFAZ" pedido na arquitetura, sem duplicar implementação.
 */
export { StubHomologacaoProvider as SefazStubProvider, stubHomologacaoProvider as sefazStubProvider }

export type FiscalProviderKind = "sefaz_stub" | "stub_homologacao" | "mock"

export type CreateFiscalProviderOptions = {
  /** Configuração do MockProvider (ignorada para o stub). */
  mock?: MockProviderConfig
}

/**
 * Cria uma instância de `FiscalProvider` por intenção. O stub é compartilhado (sem estado);
 * o mock é sempre uma nova instância (carrega histórico de chamadas).
 */
export function createFiscalProvider(
  kind: FiscalProviderKind,
  options: CreateFiscalProviderOptions = {},
): FiscalProvider {
  switch (kind) {
    case "mock":
      return createMockProvider(options.mock)
    case "sefaz_stub":
    case "stub_homologacao":
      return stubHomologacaoProvider
    default: {
      // Exaustividade: qualquer novo kind exige tratamento explícito.
      const _never: never = kind
      throw new Error(`Provider kind desconhecido: ${String(_never)}`)
    }
  }
}

export { MockProvider, createMockProvider, StubHomologacaoProvider }
