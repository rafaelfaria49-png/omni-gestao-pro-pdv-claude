// ============================================================
// lib/importador-avancado/smart-genius/tipos.ts
// Tipos do adaptador específico Smart Genius (Clientes / Contas a Receber).
//
// Escopo fechado: cobre SOMENTE os dois relatórios Smart Genius homologados
// nesta entrega ("Listagem de Clientes" e "Listagem de Contas a Receber").
// NÃO faz parte do Importador Universal V1 (schema canônico / perfil / IA).
// ============================================================

/** Layouts Smart Genius reconhecidos por este adaptador. */
export type SmartGeniusLayout = "smart_clientes" | "smart_contas_receber"

/** Resultado da detecção de layout a partir da grade (AOA) + nome do arquivo. */
export type SmartDeteccao = {
  layout: SmartGeniusLayout
  /** Índice 0-based da linha de cabeçalho REAL (após o banner). */
  headerRow: number
  /**
   * Linha extra do cabeçalho (caso o cabeçalho esteja quebrado em 2 linhas,
   * como no relatório de Clientes, onde "Nome" cai na linha seguinte).
   * `null` quando o cabeçalho ocupa uma única linha.
   */
  headerRowExtra: number | null
}

/** Cliente normalizado a partir do relatório Smart Genius "Listagem de Clientes". */
export type SmartClienteNormalizado = {
  /** Índice 1-based da linha na planilha (para diagnóstico no preview). */
  linha: number
  /** Código legado Smart Genius (coluna "Codigo"). Pode ser vazio. */
  codigoLegado: string
  nome: string
  telefone: string
  cidade: string
}

/**
 * Saldo consolidado por cliente do relatório "Listagem de Contas a Receber".
 * Smart Genius NÃO exporta títulos individuais — exporta um resumo por cliente.
 */
export type SmartContaReceberNormalizada = {
  /** Índice 1-based da linha na planilha (para diagnóstico no preview). */
  linha: number
  /** Código legado Smart Genius (coluna "Código:"). Chave de vínculo com clientes. */
  codigoLegado: string
  cliente: string
  telefone: string
  /** "Menor Venc:" — usado como vencimento de AMBOS os títulos materializados. ISO yyyy-mm-dd ou "". */
  menorVencimento: string
  /** "Em atraso:" — vira título VENCIDO quando > 0. */
  emAtraso: number
  /** "A vencer:" — vira título PENDENTE quando > 0. */
  aVencer: number
  /** "Total:" — guardado em observação (não importado como valor de título). */
  total: number
  /** "Reaj:" — juros/reajuste acumulado. Guardado em observação; nunca somado ao principal. */
  reaj: number
  /** "Tot. Reaj:" — Total + Reaj. Guardado em observação. */
  totalReaj: number
}

/** Linha que não pôde ser normalizada (reportada no preview, não persiste). */
export type SmartLinhaInvalida = {
  linha: number
  motivos: string[]
}

/** Saída do parser de clientes Smart. */
export type SmartClientesParse = {
  layout: "smart_clientes"
  validos: SmartClienteNormalizado[]
  invalidos: SmartLinhaInvalida[]
  totalLinhasLidas: number
}

/** Saída do parser de contas a receber Smart. */
export type SmartContasReceberParse = {
  layout: "smart_contas_receber"
  validos: SmartContaReceberNormalizada[]
  invalidos: SmartLinhaInvalida[]
  totalLinhasLidas: number
}
