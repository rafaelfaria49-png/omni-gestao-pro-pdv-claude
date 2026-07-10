import { validarGtin, type GtinFormato } from "@/lib/cadastros/gtin"
import { criarProvedorCosmos } from "./provedores/cosmos"
import { type MemoLookup } from "./memo"
import { resolverCadeia } from "./orquestrador"
import { lerOrdemProvedores, type ResultadoOrdem } from "./registry"
import type {
  FabricaProvedorResult,
  ProvedorId,
  ResultadoCadeia,
} from "./types"

/** Subset de env relevante para o lookup de código de barras. */
export type BarcodeEnv = {
  COSMOS_API_KEY?: string
  BARCODE_LOOKUP_PROVIDERS?: string
}

/** Opções de injeção para a fábrica padrão (testes: injetar fetchImpl). */
export type OpcoesFabrica = {
  fetchImpl?: typeof fetch
}

/**
 * Classifica um código de barras cru para o fluxo de lookup.
 * - INVALID: GTIN inválido (dígito verificador/comprimento).
 * - INTERNO: prefixo 20–29 — nunca vai a provedor externo (D08).
 * - EXTERNO: apto à cadeia de lookup externo.
 */
export type BarcodeClassificado =
  | { tipo: "INVALID"; message: string }
  | { tipo: "INTERNO"; gtin: string; formato: GtinFormato; mensagem: string }
  | { tipo: "EXTERNO"; gtin: string; formato: GtinFormato }

export function classificarBarcode(rawBarcode: string): BarcodeClassificado {
  const validation = validarGtin(rawBarcode)
  if (!validation.valid) {
    return { tipo: "INVALID", message: validation.message }
  }
  if (validation.interno) {
    return {
      tipo: "INTERNO",
      gtin: validation.gtin,
      formato: validation.formato,
      mensagem:
        "Código interno (prefixo 20–29) não é consultado em bases externas. Use o cadastro manual.",
    }
  }
  return { tipo: "EXTERNO", gtin: validation.gtin, formato: validation.formato }
}

/**
 * Fábrica padrão de provedores. Lê a chave de cada provedor da env.
 * - cosmos: requer COSMOS_API_KEY; senão => erro de config (não crash).
 * - upcitemdb / openfoodfacts: ainda não implementados (GOAL 004B/004C).
 */
export function fabricaProvedorPadrao(
  id: ProvedorId,
  env: BarcodeEnv,
  opts?: OpcoesFabrica,
): FabricaProvedorResult {
  if (id === "cosmos") {
    const key = env.COSMOS_API_KEY?.trim()
    if (!key) return { erro: "COSMOS_API_KEY não configurada." }
    return criarProvedorCosmos({ apiKey: key, fetchImpl: opts?.fetchImpl })
  }
  if (id === "upcitemdb") {
    return { erro: "Provedor upcitemdb ainda não implementado (GOAL 004B)." }
  }
  if (id === "openfoodfacts") {
    return { erro: "Provedor openfoodfacts ainda não implementado (GOAL 004C)." }
  }
  return { erro: `Provedor desconhecido: ${id}` }
}

/** Lê as variáveis de env relevantes (server-side). */
export function lerEnvBarcode(): BarcodeEnv {
  return {
    COSMOS_API_KEY: process.env.COSMOS_API_KEY,
    BARCODE_LOOKUP_PROVIDERS: process.env.BARCODE_LOOKUP_PROVIDERS,
  }
}

export type ResolverCoreDeps = {
  criarProvedor: (id: ProvedorId, env: BarcodeEnv, opts?: OpcoesFabrica) => FabricaProvedorResult
  memo: MemoLookup
  fetchImpl?: typeof fetch
}

/**
 * Núcleo testável da resolução externa (após validação + não-interno).
 * Recebe env e dependências injetáveis; não lê process.env diretamente,
 * permitindo testes sem chamada externa real.
 */
export async function resolverCodigoBarrasCore(
  env: BarcodeEnv,
  deps: ResolverCoreDeps,
  gtin: string,
): Promise<{ resultado: ResultadoCadeia }> {
  const ordemResult: ResultadoOrdem = lerOrdemProvedores(env.BARCODE_LOOKUP_PROVIDERS)
  if (!ordemResult.ok) {
    return {
      resultado: { status: "erro_config", mensagem: ordemResult.erro, tentativas: [] },
    }
  }
  const boundFactory = (id: ProvedorId): FabricaProvedorResult =>
    deps.criarProvedor(id, env, deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : undefined)

  const resultado = await resolverCadeia(gtin, {
    ordem: ordemResult.provedores,
    criarProvedor: boundFactory,
    memo: deps.memo,
  })
  return { resultado }
}
