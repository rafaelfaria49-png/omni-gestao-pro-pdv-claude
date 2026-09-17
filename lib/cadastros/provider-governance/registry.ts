/**
 * Registry canônico de provedores externos (CAD-R2-015) — fonte única de
 * governança/status/capabilities.
 *
 * Inventário atual (3 provedores conhecidos):
 * - cosmos: implementado, requer COSMOS_API_KEY server-side.
 * - upcitemdb: implementado, FREE/trial sem chave.
 * - openfoodfacts: CONHECIDO porém INDISPONÍVEL (sem adapter real, desabilitado).
 *   NÃO implementar neste GOAL.
 *
 * Políticas operacionais centralizadas:
 * - TIMEOUT: 3000ms por provedor via AbortController (comportamento preservado).
 * - RATE-LIMIT: memo em memória até 00:00 America/Sao_Paulo (comportamento preservado).
 * - FALLBACK: primeiro-sucesso-vence; a ordem configura o teto de qualidade.
 * - ATIVAÇÃO: presença em BARCODE_LOOKUP_PROVIDERS. Provider fora da ordem não
 *   executa (desabilitado para aquela chamada) — nunca silenciosamente listado
 *   como tentativa.
 *
 * Termos (sem alegações — ver types.ts):
 * - cosmos/upcitemdb: desconhecido-nao-registrado (sem evidência de conteúdo no repo).
 * - openfoodfacts: mencionado-nao-avaliado; única evidência no projeto:
 *   docs/roadmap/CADASTROS_V2_CADASTRO_INTELIGENTE_BARCODE_ROADMAP.md §8 —
 *   "avaliar obrigações da licença ODbL (atribuição; share-alike em
 *   redistribuição de base) no momento da implementação".
 */

import type {
  CampoSugestaoBarcode,
  DecisaoProvedor,
  GovernancaProvedor,
  PresencaConfigProvedor,
  ProvedorExternoId,
} from "./types"

/** Nome da env que define a ordem configurável (comportamento preservado). */
export const ENV_ORDEM_BARCODE = "BARCODE_LOOKUP_PROVIDERS"

/** Ordem default quando a env está vazia (comportamento preservado). */
export const ORDEM_BARCODE_DEFAULT: ReadonlyArray<ProvedorExternoId> = ["cosmos"]

/** Timeout por provedor em ms (comportamento preservado do orquestrador). */
export const POLITICA_TIMEOUT_MS = 3000

/** Fallback: primeiro-sucesso-vence; a ordem define o teto de qualidade. */
export const POLITICA_FALLBACK = "first-success-wins" as const

/**
 * Rate-limit: memo em memória; provider esgotado (429) é skipado até o reset;
 * resultado por GTIN é memoizado até 00:00 America/Sao_Paulo.
 */
export const POLITICA_RATE_LIMIT = {
  estrategia: "memo-ate-meia-noite-sp",
  esgotadoAteReset: true,
  memoGtinAteMeiaNoite: true,
} as const

const TELEMETRIA_PADRAO = {
  persistePayloadBruto: false,
  camposTracePermitidos: ["provedor", "status", "em", "tipo"],
  segredoNuncaEm: ["response", "trace", "metadata", "log", "bundle"],
} as const

/** Registro canônico — único lugar onde providers são declarados. */
export const REGISTRO_PROVEDORES: Record<ProvedorExternoId, GovernancaProvedor> = {
  cosmos: {
    id: "cosmos",
    capability: "barcode-lookup",
    lifecycle: "disponivel",
    implemented: true,
    enabled: true,
    requiredEnvVars: ["COSMOS_API_KEY"],
    humanReviewRequired: true,
    directWriteAllowed: false,
    camposSugeriveis: ["nome", "marca", "categoria", "descricao", "ncm", "cest", "imagemUrl"],
    telemetria: { ...TELEMETRIA_PADRAO },
    termos: { status: "desconhecido-nao-registrado" },
    nota:
      "Adapter Cosmos/Bluesoft implementado (header X-Cosmos-Token server-side). " +
      "Requer COSMOS_API_KEY; sem a chave, falha como erro_config honesto.",
  },
  upcitemdb: {
    id: "upcitemdb",
    capability: "barcode-lookup",
    lifecycle: "disponivel",
    implemented: true,
    enabled: true,
    requiredEnvVars: [],
    humanReviewRequired: true,
    directWriteAllowed: false,
    // Constraint fiscal do arquiteto: base global sem dados fiscais brasileiros —
    // NCM/CEST JAMAIS são populados por este provedor.
    camposSugeriveis: ["nome", "marca", "categoria", "descricao", "imagemUrl"],
    telemetria: { ...TELEMETRIA_PADRAO },
    termos: { status: "desconhecido-nao-registrado" },
    nota:
      "Adapter UPCitemdb FREE/trial implementado (endpoint /prod/trial/lookup?upc=). " +
      "Sem chave, sem cadastro; limites do tier gratuito lidos via headers de 429.",
  },
  openfoodfacts: {
    id: "openfoodfacts",
    capability: "barcode-lookup",
    lifecycle: "indisponivel-nao-implementado",
    implemented: false,
    enabled: false,
    requiredEnvVars: [],
    humanReviewRequired: true,
    directWriteAllowed: false,
    // Sem adapter real, nenhum campo pode ser sugerido.
    camposSugeriveis: [],
    telemetria: { ...TELEMETRIA_PADRAO },
    termos: {
      status: "mencionado-nao-avaliado",
      referencia:
        "docs/roadmap/CADASTROS_V2_CADASTRO_INTELIGENTE_BARCODE_ROADMAP.md §8",
      detalhe:
        "Avaliar obrigações da licença ODbL (atribuição; share-alike em " +
        "redistribuição de base) no momento da implementação. Sem adapter, sem " +
        "uso e sem redistribuição neste GOAL — nenhuma avaliação devida agora.",
    },
    nota:
      "Conhecido porém indisponível: não existe adapter real neste repo. " +
      "Listado na ordem, produz erro_config honesto e NUNCA é executado. " +
      "NÃO implementar neste GOAL (CAD-R2-015).",
  },
}

/** Ids conhecidos, na ordem canônica de declaração. */
export function idsConhecidos(): ProvedorExternoId[] {
  return Object.keys(REGISTRO_PROVEDORES) as ProvedorExternoId[]
}

/** Todos os registros (inventário). */
export function listarProvedores(): GovernancaProvedor[] {
  return idsConhecidos().map((id) => REGISTRO_PROVEDORES[id])
}

/** Lookup por id — desconhecido é explícito, nunca adivinhado. */
export function obterProvedor(id: string): { conhecido: true; registro: GovernancaProvedor } | { conhecido: false } {
  const registro = (REGISTRO_PROVEDORES as Record<string, GovernancaProvedor | undefined>)[id]
  if (!registro) return { conhecido: false }
  return { conhecido: true, registro }
}

/** Mensagem honesta quando a chave do Cosmos falta (compatível com GOAL 004A). */
export const MENSAGEM_COSMOS_SEM_CONFIG = "COSMOS_API_KEY não configurada."

/** Mensagem honesta para Open Food Facts (conhecido, desabilitado, sem adapter). */
export const MENSAGEM_OFF_INDISPONIVEL =
  "Provedor openfoodfacts desabilitado e ainda não implementado (sem adapter real; CAD-R2-015)."

/**
 * Decisão de execução do runtime a partir da governança — sem heurística.
 * Recebe apenas presença de config (booleanos), NUNCA valores de segredo.
 *
 * Prioridade: desconhecido → desabilitado → não-implementado → sem-config → ok.
 * - Provider fora da ordem nunca chega aqui (desabilitado para a chamada).
 * - Provider listado mas não-executável gera erro_config honesto com tentativa.
 */
export function avaliarProvedor(id: string, config: PresencaConfigProvedor): DecisaoProvedor {
  const obtido = obterProvedor(id)
  if (!obtido.conhecido) {
    return {
      executable: false,
      id,
      motivo: "desconhecido",
      mensagem:
        `Provedor desconhecido em ${ENV_ORDEM_BARCODE}: "${id}". ` +
        `Valores aceitos: ${idsConhecidos().join(", ")}.`,
    }
  }
  const registro = obtido.registro
  if (!registro.enabled) {
    return {
      executable: false,
      id: registro.id,
      motivo: registro.implemented ? "desabilitado" : "nao-implementado",
      mensagem:
        registro.id === "openfoodfacts"
          ? MENSAGEM_OFF_INDISPONIVEL
          : `Provedor ${registro.id} desabilitado pela governança (CAD-R2-015).`,
    }
  }
  if (!registro.implemented) {
    return {
      executable: false,
      id: registro.id,
      motivo: "nao-implementado",
      mensagem: `Provedor ${registro.id} ainda não implementado (sem adapter real; CAD-R2-015).`,
    }
  }
  if (registro.id === "cosmos" && !config.cosmosApiKeyPresente) {
    return {
      executable: false,
      id: registro.id,
      motivo: "sem-config",
      mensagem: MENSAGEM_COSMOS_SEM_CONFIG,
    }
  }
  return { executable: true, id: registro.id }
}

/** Este provider pode sugerir este campo? (allow-list por provider + deny global). */
export function podeSugerirCampo(id: string, campo: string): boolean {
  const obtido = obterProvedor(id)
  if (!obtido.conhecido) return false
  return (obtido.registro.camposSugeriveis as ReadonlyArray<string>).includes(campo)
}

/**
 * Filtra uma sugestão normalizada mantendo SOMENTE os campos que o provider
 * pode sugerir. Remove desconhecidos, proibidos e vazios. Nunca inventa nada.
 */
export function filtrarSugestao(
  id: string,
  dados: Record<string, unknown>,
): Partial<Record<CampoSugestaoBarcode, string>> {
  const obtido = obterProvedor(id)
  const permitidos: ReadonlyArray<string> = obtido.conhecido ? obtido.registro.camposSugeriveis : []
  const saida: Partial<Record<CampoSugestaoBarcode, string>> = {}
  for (const campo of permitidos) {
    const valor = dados[campo]
    if (typeof valor === "string" && valor.trim().length > 0) {
      ;(saida as Record<string, string>)[campo] = valor
    }
  }
  return saida
}
