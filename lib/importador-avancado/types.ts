// ============================================================
// lib/importador-avancado/types.ts
// Tipos centrais do Importador Universal Avançado
// ============================================================

export type DominioImport =
  | "clientes"
  | "clientes_enderecos"
  | "fornecedores"
  | "fornecedores_enderecos"
  | "produtos"
  | "servicos_catalogo"
  | "ordens_servicos"
  | "os_equipamentos"
  | "os_pagamentos"
  | "os_servicos"
  | "os_situacoes"
  | "vendas"
  | "vendas_historicos"
  | "vendas_pagamentos"
  | "vendas_produtos"
  | "contas_pagar"
  | "contas_receber"
  | "desconhecido"

/** Uma planilha parseada com metadados */
export type PlanilhaParseada = {
  nomeArquivo: string
  dominio: DominioImport
  confianca: number // 0-1 — quão certo é o domínio detectado
  chaveJoin: string | null // coluna que é chave de cruzamento
  headers: string[]
  linhas: Record<string, unknown>[]
  totalLinhas: number
}

/** Resultado do merge de múltiplas planilhas de um mesmo domínio */
export type RegistroMergeado = {
  chave: string // valor da chave (ex: "OS-37", "CPF 123...")
  dominioPrincipal: DominioImport
  campos: Record<string, unknown> // todos os campos de todas as planilhas
  fontes: string[] // quais arquivos contribuíram
}

/** Plano de importação — o que vai ser feito antes de persistir */
export type PlanoImportacao = {
  batchId: string
  storeId: string
  geradoEm: string
  grupos: GrupoImport[]
  totalCriar: number
  totalAtualizar: number
  totalIgnorar: number
  avisos: string[]
}

export type GrupoImport = {
  dominio: DominioImport
  label: string
  registros: RegistroMergeado[]
  criar: number
  atualizar: number
  ignorar: number
  erros: string[]
}

/** Log de uma linha após persistência */
export type LogLinhaImport = {
  dominio: DominioImport
  chave: string
  acao: "criado" | "atualizado" | "ignorado" | "erro"
  detalhe?: string
}

/** Resultado final da persistência */
export type ResultadoImportacao = {
  batchId: string
  ok: boolean
  criados: number
  atualizados: number
  ignorados: number
  erros: number
  log: LogLinhaImport[]
  duracaoMs: number
}
