/**
 * Registry + resolver do provider fiscal (GOAL_006).
 *
 * `resolveFiscalProvider(config)` traduz a `ConfiguracaoFiscalLoja.provider` numa
 * implementação concreta de `FiscalProvider`. Nesta fase só `STUB_HOMOLOGACAO` existe;
 * os demais tipos do enum são reconhecidos mas ainda não implementados (erro controlado).
 *
 * Helpers: `isFiscalProviderReady`, `assertProviderConfigurado`, `normalizeProviderError`.
 * Camada pura — sem Prisma, sem I/O. Não lê Produto/Venda, não toca Caixa/Financeiro.
 */
import { FiscalProviderTipo } from "@/generated/prisma"
import { stubHomologacaoProvider } from "./stub-homologacao"
import type {
  FiscalProvider,
  FiscalProviderConfigInput,
  FiscalProviderError,
  FiscalProviderErrorCode,
} from "./types"

/** Fábricas de provider por tipo. Só o stub está disponível nesta fase. */
const REGISTRY: Partial<Record<FiscalProviderTipo, () => FiscalProvider>> = {
  [FiscalProviderTipo.STUB_HOMOLOGACAO]: () => stubHomologacaoProvider,
}

/** Conjunto de tipos válidos do enum (para distinguir "desconhecido" de "não implementado"). */
const TIPOS_VALIDOS = new Set<string>(Object.values(FiscalProviderTipo) as string[])

export type ResolveFiscalProviderResult =
  | { ok: true; provider: FiscalProvider }
  | { ok: false; error: FiscalProviderError }

function fail(code: FiscalProviderErrorCode, mensagem: string, origem?: string | null): { ok: false; error: FiscalProviderError } {
  return { ok: false, error: { code, mensagem, origem: origem ?? null } }
}

/**
 * Resolve o provider a partir da configuração fiscal da loja.
 *  - config ausente            → `config_ausente`
 *  - tipo fora do enum         → `provider_desconhecido`
 *  - tipo do enum sem fábrica  → `provider_nao_implementado`
 */
export function resolveFiscalProvider(config: FiscalProviderConfigInput): ResolveFiscalProviderResult {
  if (!config) {
    return fail("config_ausente", "Configuração fiscal da loja ausente — provider não pode ser resolvido.")
  }
  const tipoRaw = typeof config.provider === "string" ? config.provider.trim() : String(config.provider ?? "")
  if (!tipoRaw || !TIPOS_VALIDOS.has(tipoRaw)) {
    return fail("provider_desconhecido", `Provider fiscal desconhecido: "${tipoRaw || "(vazio)"}".`, tipoRaw)
  }
  const factory = REGISTRY[tipoRaw as FiscalProviderTipo]
  if (!factory) {
    return fail(
      "provider_nao_implementado",
      `Provider "${tipoRaw}" ainda não implementado — apenas STUB_HOMOLOGACAO está disponível nesta fase.`,
      tipoRaw,
    )
  }
  return { ok: true, provider: factory() }
}

/**
 * Provider está pronto? = resolve + passa na validação estrutural da configuração.
 * NÃO exige `fiscalEnabled` (habilitar emissão é decisão separada de fase futura).
 */
export function isFiscalProviderReady(config: FiscalProviderConfigInput): boolean {
  const resolved = resolveFiscalProvider(config)
  if (!resolved.ok) return false
  return resolved.provider.validarConfiguracao(config).ok
}

/** Erro lançável quando o provider não está configurado/válido (carrega o erro canônico). */
export class FiscalProviderConfigError extends Error {
  readonly fiscalError: FiscalProviderError
  constructor(fiscalError: FiscalProviderError) {
    super(fiscalError.mensagem)
    this.name = "FiscalProviderConfigError"
    this.fiscalError = fiscalError
  }
}

/**
 * Garante um provider configurado e válido, ou lança `FiscalProviderConfigError`.
 * Retorna a instância do provider para uso imediato pelo caller.
 */
export function assertProviderConfigurado(config: FiscalProviderConfigInput): FiscalProvider {
  const resolved = resolveFiscalProvider(config)
  if (!resolved.ok) throw new FiscalProviderConfigError(resolved.error)
  const val = resolved.provider.validarConfiguracao(config)
  if (!val.ok) {
    throw new FiscalProviderConfigError(
      val.erros[0] ?? {
        code: "config_incompleta",
        mensagem: val.mensagem || "Configuração fiscal incompleta.",
      },
    )
  }
  return resolved.provider
}

/**
 * Normaliza qualquer erro (Error, string, erro de gateway, FiscalProviderError) para a
 * forma canônica `FiscalProviderError`. Ponto único de tradução de erros do provider —
 * futura integração com gateways reais normaliza aqui (preservando o code de origem).
 */
export function normalizeProviderError(err: unknown): FiscalProviderError {
  // Já é um FiscalProviderError canônico.
  if (
    err &&
    typeof err === "object" &&
    typeof (err as { code?: unknown }).code === "string" &&
    typeof (err as { mensagem?: unknown }).mensagem === "string"
  ) {
    const e = err as FiscalProviderError
    return { code: e.code, mensagem: e.mensagem, campo: e.campo ?? null, origem: e.origem ?? null }
  }

  if (err instanceof FiscalProviderConfigError) {
    return err.fiscalError
  }

  if (err instanceof Error) {
    return { code: "erro_interno", mensagem: err.message || "Erro interno do provider fiscal.", origem: err.name }
  }

  if (typeof err === "string" && err.trim().length > 0) {
    return { code: "erro_interno", mensagem: err.trim() }
  }

  // Objeto de gateway com { message } e/ou { code }.
  if (err && typeof err === "object") {
    const o = err as { message?: unknown; mensagem?: unknown; code?: unknown }
    const mensagem =
      typeof o.message === "string" ? o.message : typeof o.mensagem === "string" ? o.mensagem : "Erro desconhecido do provider fiscal."
    const origem = o.code != null ? String(o.code) : null
    return { code: "erro_interno", mensagem, origem }
  }

  return { code: "erro_interno", mensagem: "Erro desconhecido do provider fiscal." }
}
