/**
 * Contrato do lookup externo por código de barras (GOAL 004A).
 *
 * Invariantes:
 * - Não armazenar payload bruto completo do provedor; apenas ProdutoNormalizado.
 * - Não inventar campos ausentes; campos ausentes permanecem ausentes.
 * - Não inventar score de confiança.
 * - Manter status distintos de ponta a ponta (nao_encontrado, limite_excedido e erro
 *   nunca são achatados em um único "falhou").
 */

/** Identificadores canônicos de provedores da cadeia. */
export type ProvedorId = "cosmos" | "upcitemdb" | "openfoodfacts"

/** Produto normalizado — apenas campos que fazem sentido como sugestão revisável. */
export type ProdutoNormalizado = {
  nome: string
  marca?: string
  categoria?: string
  descricao?: string
  ncm?: string
  cest?: string
  imagemUrl?: string
}

/** Resultado individual de um provedor. Status distintos, nunca achatados. */
export type ResultadoLookup =
  | { status: "encontrado"; dados: ProdutoNormalizado }
  | { status: "nao_encontrado" }
  | { status: "limite_excedido"; resetEm?: Date }
  | { status: "erro"; tipo: "timeout" | "rede" | "auth" | "parse" }

/** Contrato que todo provedor da cadeia deve implementar. */
export interface ProvedorLookup {
  id: ProvedorId
  consultar(gtin: string, signal: AbortSignal): Promise<ResultadoLookup>
}

/** Status possível de uma tentativa registrada no trace. */
export type StatusTentativa = "encontrado" | "nao_encontrado" | "limite_excedido" | "erro"

/**
 * Tipo seguro do erro de uma tentativa. União fechada — nunca carrega token,
 * header, URL, stack trace ou body do provedor. `config` = fábrica do provedor
 * falhou (ex.: chave ausente); os demais espelham ResultadoLookup.tipo.
 */
export type TipoErroTentativa = "timeout" | "rede" | "auth" | "parse" | "config"

/** Entrada do trace de tentativas da cadeia. */
export type TentativaLookup = {
  provedor: ProvedorId
  status: StatusTentativa
  /** ISO timestamp do momento da tentativa. */
  em: string
  /** Presente apenas quando status === "erro". */
  tipo?: TipoErroTentativa
}

/** Tipo do erro de configuração retornado por uma fábrica de provedor. */
export type ErroConfig = { erro: string }

/** Retorno de uma fábrica de provedor: instância válida ou erro de configuração. */
export type FabricaProvedorResult = ProvedorLookup | ErroConfig

/**
 * Resultado da cadeia de lookup (orquestrador).
 * Status distintos mantidos de ponta a ponta; `erro_config` cobre problemas
 * acionáveis pelo operador (chave ausente, provedor desconhecido na env).
 */
export type ResultadoCadeia =
  | {
      status: "encontrado"
      dados: ProdutoNormalizado
      provedor: ProvedorId
      tentativas: TentativaLookup[]
    }
  | { status: "nao_encontrado"; tentativas: TentativaLookup[] }
  | { status: "limite_excedido"; tentativas: TentativaLookup[]; resetEm?: Date }
  | { status: "erro_config"; mensagem: string; tentativas: TentativaLookup[] }
  | { status: "erro"; tentativas: TentativaLookup[] }
