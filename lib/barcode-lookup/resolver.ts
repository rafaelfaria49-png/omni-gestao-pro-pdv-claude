import { validarGtin, type GtinFormato } from "@/lib/cadastros/gtin"
import {
  MENSAGEM_COSMOS_SEM_CONFIG,
  MENSAGEM_OFF_INDISPONIVEL,
  avaliarProvedor,
  type DecisaoProvedor,
} from "@/lib/cadastros/provider-governance"
import { criarProvedorCosmos } from "./provedores/cosmos"
import { criarProvedorUpcItemdb } from "./provedores/upcitemdb"
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
 * - upcitemdb: FREE/trial sem chave; sempre disponível.
 * - openfoodfacts: conhecido porém indisponível — sem adapter real (CAD-R2-015);
 *   NUNCA executado, sempre erro honesto. NÃO implementar neste GOAL.
 *
 * CAD-R2-015: cada ramo consulta a governança canônica (avaliarProvedor) antes
 * de construir o adapter. A decisão recebe só presença de config (booleano) —
 * valores de segredo jamais entram na governança.
 */
export function fabricaProvedorPadrao(
  id: ProvedorId,
  env: BarcodeEnv,
  opts?: OpcoesFabrica,
): FabricaProvedorResult {
  const chaveCosmos = env.COSMOS_API_KEY?.trim()
  const cosmosApiKeyPresente = Boolean(chaveCosmos)
  if (id === "cosmos") {
    const decisao: DecisaoProvedor = avaliarProvedor(id, { cosmosApiKeyPresente })
    if (!decisao.executable) return { erro: MENSAGEM_COSMOS_SEM_CONFIG }
    return criarProvedorCosmos({ apiKey: chaveCosmos as string, fetchImpl: opts?.fetchImpl })
  }
  if (id === "upcitemdb") {
    const decisao: DecisaoProvedor = avaliarProvedor(id, { cosmosApiKeyPresente })
    if (!decisao.executable) return { erro: decisao.mensagem }
    return criarProvedorUpcItemdb({ fetchImpl: opts?.fetchImpl })
  }
  if (id === "openfoodfacts") {
    return { erro: MENSAGEM_OFF_INDISPONIVEL }
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
  // CAD-R2-015 (defesa em profundidade): o orquestrador consulta a governança
  // ANTES de construir qualquer adapter. Provider desabilitado, não
  // implementado ou sem config obrigatória gera tentativa erro/config honesta
  // e NUNCA é executado — mesmo que a fábrica acima seja substituída em testes.
  const decidirExecucao = (id: ProvedorId): DecisaoProvedor =>
    avaliarProvedor(id, { cosmosApiKeyPresente: Boolean(env.COSMOS_API_KEY?.trim()) })

  const resultado = await resolverCadeia(gtin, {
    ordem: ordemResult.provedores,
    criarProvedor: boundFactory,
    decidirExecucao,
    memo: deps.memo,
  })
  return { resultado }
}
