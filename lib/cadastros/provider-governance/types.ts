/**
 * Governança canônica de provedores externos de enriquecimento de cadastros (CAD-R2-015).
 *
 * Fonte única de verdade sobre:
 * - quais provedores existem (inventário);
 * - quais estão realmente implementados;
 * - quais podem ser configurados/ativados;
 * - quais capabilities fornecem;
 * - quais secrets exigem;
 * - como timeout/rate-limit/fallback funcionam;
 * - qual proveniência acompanha sugestões;
 * - quais campos podem ser apenas sugeridos.
 *
 * Invariantes inegociáveis (impostas por código + teste, nunca por convenção):
 * - provider → sugestão → operador revisa → write boundary (upsertProduto).
 *   Nenhum provider possui write direto em Produto (directWriteAllowed = false,
 *   humanReviewRequired = true, para TODOS os registros).
 * - Secrets vivem exclusivamente server-side. Este módulo NUNCA recebe valores
 *   de segredo — apenas booleanos de presença (ex.: cosmosApiKeyPresente).
 * - Payload bruto de provider NUNCA é persistido (persistePayloadBruto = false).
 * - Sem score numérico de confiança (não inventar).
 * - Sem alegação jurídica/comercial: termos sem evidência no repo são
 *   "desconhecido-nao-registrado". A única menção com evidência é a nota ODbL
 *   do roadmap para Open Food Facts (avaliação devida na implementação).
 *
 * Preparação 016/017: o contrato (capability + lifecycle + decisão de execução
 * + proveniência) é reutilizável para futuros providers de texto/voz, mas este
 * GOAL NÃO registra nenhum provider dessas capabilities e NÃO implementa
 * NL/LLM/voz/transcrição.
 */

import type { ProvedorId } from "@/lib/barcode-lookup/types"

/** Capability com provider registrado neste GOAL. Texto/voz ficam para 016/017. */
export type CapabilityProvedorExterno = "barcode-lookup"

/** Ids canônicos de provedores externos conhecidos pela governança. */
export type ProvedorExternoId = ProvedorId

/** Lifecycle observável pelo runtime, sem heurística. */
export type LifecycleProvedor = "disponivel" | "indisponivel-nao-implementado"

/**
 * Campos que um provider de barcode pode sugerir (subconjunto do contrato
 * normalizado ProdutoNormalizado). NCM/CEST, quando presentes, continuam sendo
 * sugestão sujeita a revisão humana.
 */
export type CampoSugestaoBarcode =
  | "nome"
  | "marca"
  | "categoria"
  | "descricao"
  | "ncm"
  | "cest"
  | "imagemUrl"

/**
 * Campos que NENHUM provider externo pode sugerir ou aplicar, em nenhuma
 * hipótese: preço de venda, custo, estoque, fornecedor e SKU interno jamais
 * vêm de provider (sempre manuais, sempre do operador).
 */
export type CampoProibidoExterno = "preco" | "custo" | "estoque" | "fornecedor" | "sku"

/** Deny-list canônica — negar por padrão, permitir por exceção declarada. */
export const CAMPOS_PROIBIDOS_EXTERNOS: ReadonlyArray<CampoProibidoExterno> = [
  "preco",
  "custo",
  "estoque",
  "fornecedor",
  "sku",
]

/**
 * Termos/licenciamento SEM alegações:
 * - "desconhecido-nao-registrado": sem evidência no projeto (cosmos, upcitemdb).
 * - "mencionado-nao-avaliado": há menção com referência, sem avaliação de uso
 *   (openfoodfacts — nota ODbL do roadmap, avaliação devida na implementação).
 */
export type TermosProvedor =
  | { status: "desconhecido-nao-registrado" }
  | { status: "mencionado-nao-avaliado"; referencia: string; detalhe: string }

/** Política segura de telemetria/proveniência por provider. */
export type PoliticaTelemetria = {
  /** Payload bruto do provider NUNCA é persistido. Sempre false. */
  persistePayloadBruto: false
  /** Únicas chaves permitidas numa entrada de trace. */
  camposTracePermitidos: ReadonlyArray<"provedor" | "status" | "em" | "tipo">
  /** Superfícies onde segredo jamais pode aparecer. */
  segredoNuncaEm: ReadonlyArray<"response" | "trace" | "metadata" | "log" | "bundle">
}

/** Registro canônico de um provider externo governado. */
export type GovernancaProvedor = {
  id: ProvedorExternoId
  capability: CapabilityProvedorExterno
  lifecycle: LifecycleProvedor
  /** Existe adapter real neste repo. Sem adapter, execução é impossível. */
  implemented: boolean
  /** Habilitado para execução quando listado na ordem. OFF nasce desabilitado. */
  enabled: boolean
  /** Env vars obrigatórias (nomes, nunca valores — valores jamais entram aqui). */
  requiredEnvVars: ReadonlyArray<string>
  /** Revisão humana sempre obrigatória. Sempre true. */
  humanReviewRequired: true
  /** Write direto em Produto sempre proibido. Sempre false. */
  directWriteAllowed: false
  /** Campos que este provider pode sugerir (allow-list por provider). */
  camposSugeriveis: ReadonlyArray<CampoSugestaoBarcode>
  telemetria: PoliticaTelemetria
  termos: TermosProvedor
  /** Nota operacional honesta (estado, limites conhecidos, pendências). */
  nota: string
}

/** Motivo pelo qual um provider não pode executar (estado honesto, nunca silencioso). */
export type MotivoIndisponivel =
  | "desconhecido"
  | "desabilitado"
  | "nao-implementado"
  | "sem-config"

/** Decisão de execução do runtime — sem heurística, só leitura do registry. */
export type DecisaoProvedor =
  | { executable: true; id: ProvedorExternoId }
  | { executable: false; id: string; motivo: MotivoIndisponivel; mensagem: string }

/** Presença de configuração, SEM valores de segredo. */
export type PresencaConfigProvedor = {
  /** true quando COSMOS_API_KEY existe e não é vazia (após trim, server-side). */
  cosmosApiKeyPresente: boolean
}
