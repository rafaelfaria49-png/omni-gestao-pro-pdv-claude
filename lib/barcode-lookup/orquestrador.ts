import { memoLookupGlobal, proximaMeiaNoiteSaoPaulo, type MemoLookup } from "./memo"
import type {
  FabricaProvedorResult,
  ProvedorId,
  ResultadoCadeia,
  ResultadoLookup,
  StatusTentativa,
  TentativaLookup,
} from "./types"

/**
 * Orquestrador da cadeia de lookup externo (GOAL 004A).
 *
 * - Percorre provedores em ordem (lida de BARCODE_LOOKUP_PROVIDERS).
 * - Timeout curto por provedor (~3s) via AbortController.
 * - Para no primeiro status "encontrado".
 * - Pula provedores memoizados como esgotados.
 * - Acumula trace de tentativas.
 *
 * Semântica primeiro-sucesso-vence (D10): a ordem define o teto de qualidade.
 */

export type OrquestradorDeps = {
  ordem: ProvedorId[]
  criarProvedor: (id: ProvedorId) => FabricaProvedorResult
  memo?: MemoLookup
  timeoutMs?: number
  /** Injeta relógio em testes. */
  agora?: () => Date
}

const TIMEOUT_MS_DEFAULT = 3000

function mapStatus(resultado: ResultadoLookup): StatusTentativa {
  return resultado.status
}

function agoraIso(agora: () => Date): string {
  return agora().toISOString()
}

/**
 * Executa a cadeia de lookup para um GTIN já validado (não interno).
 * Não valida GTIN nem trata prefixo 20–29 — isso é responsabilidade do caller
 * (Server Action), que deve garantir que o código é apto a lookup externo.
 */
export async function resolverCadeia(
  gtin: string,
  deps: OrquestradorDeps,
): Promise<ResultadoCadeia> {
  const memo = deps.memo ?? memoLookupGlobal
  const agora = deps.agora ?? (() => new Date())
  const timeoutMs = deps.timeoutMs ?? TIMEOUT_MS_DEFAULT

  // Memo por GTIN do dia: evita rebipar e queimar cota na mesma sessão.
  const cache = memo.obterGtin(gtin, agora())
  if (cache) {
    return cache.resultado
  }

  const tentativas: TentativaLookup[] = []
  const configErros: string[] = []
  let runtimeErros = 0
  let naos = 0
  let limites = 0
  let resetEmFinal: Date | undefined

  for (const id of deps.ordem) {
    // Pula provedor memoizado como esgotado.
    const esgotadoAte = memo.esgotadoAte(id, agora())
    if (esgotadoAte) {
      tentativas.push({ provedor: id, status: "limite_excedido", em: agoraIso(agora) })
      limites += 1
      if (!resetEmFinal) resetEmFinal = esgotadoAte
      continue
    }

    // Constrói o provedor; erro de config não crasha.
    const provedorResult = deps.criarProvedor(id)
    if ("erro" in provedorResult) {
      tentativas.push({ provedor: id, status: "erro", em: agoraIso(agora) })
      configErros.push(`${id}: ${provedorResult.erro}`)
      continue
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    let resultado: ResultadoLookup
    try {
      resultado = await provedorResult.consultar(gtin, controller.signal)
    } catch {
      resultado = { status: "erro", tipo: "rede" }
    } finally {
      clearTimeout(timeoutId)
    }

    tentativas.push({ provedor: id, status: mapStatus(resultado), em: agoraIso(agora) })

    if (resultado.status === "encontrado") {
      const saida: ResultadoCadeia = {
        status: "encontrado",
        dados: resultado.dados,
        provedor: id,
        tentativas,
      }
      memo.memoizarGtin(gtin, saida, tentativas, proximaMeiaNoiteSaoPaulo(agora()))
      return saida
    }

    if (resultado.status === "limite_excedido") {
      memo.marcarEsgotado(id, resultado.resetEm ?? proximaMeiaNoiteSaoPaulo(agora()))
      limites += 1
      if (!resetEmFinal) resetEmFinal = resultado.resetEm ?? proximaMeiaNoiteSaoPaulo(agora())
      continue
    }

    if (resultado.status === "nao_encontrado") {
      naos += 1
      continue
    }

    // erro (timeout/rede/auth/parse)
    runtimeErros += 1
  }

  // Determina status final quando ninguém encontrou.
  // Prioridade: nao_encontrado > erro_config > limite_excedido > erro.
  if (naos > 0) {
    const saida: ResultadoCadeia = { status: "nao_encontrado", tentativas }
    memo.memoizarGtin(gtin, saida, tentativas, proximaMeiaNoiteSaoPaulo(agora()))
    return saida
  }
  if (configErros.length > 0 && runtimeErros === 0) {
    const saida: ResultadoCadeia = {
      status: "erro_config",
      mensagem: configErros.join("; "),
      tentativas,
    }
    return saida
  }
  if (limites > 0) {
    const saida: ResultadoCadeia = { status: "limite_excedido", tentativas, resetEm: resetEmFinal }
    return saida
  }
  const saida: ResultadoCadeia = { status: "erro", tentativas }
  return saida
}
