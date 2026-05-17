// ============================================================
// lib/importador-avancado/index.ts
// Ponto de entrada único do Importador Universal Avançado
// ============================================================

export type {
  DominioImport,
  PlanilhaParseada,
  RegistroMergeado,
  PlanoImportacao,
  GrupoImport,
  LogLinhaImport,
  ResultadoImportacao,
} from "./types"

export {
  detectarDominio,
  resolverCampoSemantico,
  mapearHeaders,
  labelDominio,
  DICIONARIO_SEMANTICO,
} from "./detector"

export {
  mergePlanilhasGrupo,
  agruparEMerge,
  normalizarLinha,
  extrairCamposOS,
  extrairCamposCliente,
  extrairCamposProduto,
} from "./merger"

// Parser é server-only — importar apenas em API routes / Server Actions
// import { parsearArquivos, parsearZip } from "./parser"

export { persistirImportacao } from "./persistidor"

// ── Função de conveniência: pipeline completo (server-side) ──

// Uso em API route:
// import { parsearArquivos } from "@/lib/importador-avancado/parser"
// import { agruparEMerge, persistirImportacao } from "@/lib/importador-avancado"
//
// const planilhas = await parsearArquivos(arquivos)
// const grupos = agruparEMerge(planilhas)
// const resultado = await persistirImportacao(storeId, grupos, batchId)
