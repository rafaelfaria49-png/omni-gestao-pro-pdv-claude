/**
 * Contador HUB · Pacote do Contador (MVP) — contratos de dados.
 *
 * GOAL CONTADOR-HUB-PACOTE-EXPORT-MVP-008.
 *
 * O pacote é gerado SOB DEMANDA e nunca persiste:
 * - sem storage, sem upload, sem registro em banco, sem snapshot, sem versão persistida;
 * - reflete os dados vivos da competência no instante do download;
 * - não é fechamento oficial nem apuração fiscal/contábil;
 * - não inclui XML nesta fase (fonte fiscal atrás de CONTADOR_FISCAL_READER).
 *
 * Este módulo é puro (sem IO): apenas tipos. O conteúdo é derivado do DTO honesto
 * do GOAL 006 (`ContadorDadosReais`) e do checklist read-only do GOAL 007
 * (`ChecklistFechamento`) — ambos já provados sem PII/segredos.
 */

/** Categoria de cada arquivo dentro do pacote (usada em índice e manifesto). */
export type CategoriaArquivoPacote =
  | "csv"
  | "resumo"
  | "indice"
  | "avisos"
  | "manifesto"
  | "placeholder"

/**
 * Um arquivo do pacote, sempre textual (UTF-8) nesta fase — CSV, Markdown ou JSON.
 * MVP não embute binários (sem XML, sem PDF, sem anexos).
 */
export type ArquivoPacote = Readonly<{
  /** Caminho relativo dentro do ZIP (ex.: "csv/vendas.csv"). Sem barra inicial. */
  caminho: string
  /** Conteúdo textual UTF-8. */
  conteudo: string
  /** Descrição curta para índice/manifesto. */
  descricao: string
  categoria: CategoriaArquivoPacote
}>

/** Entrada de integridade de um arquivo no manifesto. */
export type ArquivoManifesto = Readonly<{
  caminho: string
  descricao: string
  categoria: CategoriaArquivoPacote
  /** Tamanho em bytes do conteúdo codificado em UTF-8. */
  bytes: number
  /** Hash SHA-256 (hex) do conteúdo em UTF-8. */
  sha256: string
}>

/** Competência formatada para o manifesto (redundância legível). */
export type CompetenciaManifesto = Readonly<{
  ano: number
  mes: number
  /** Código canônico `AAAA-MM`. */
  codigo: string
  /** Rótulo humano `Junho / 2026`. */
  label: string
}>

/**
 * Manifesto v1 do pacote (`manifest.json`).
 *
 * Não contém `storeId` nem qualquer identificador de loja/PII — coerente com o
 * contrato público do GOAL 006. É a raiz de integridade: lista o hash e o tamanho
 * de TODOS os demais arquivos (o próprio `manifest.json` não se auto-referencia).
 */
export type ManifestoPacote = Readonly<{
  schema: "omnigestao.contador.pacote"
  versao: 1
  /** ISO 8601 do instante de geração (injetável via `agora`). */
  geradoEm: string
  competencia: CompetenciaManifesto
  aplicacao: Readonly<{ nome: string }>
  contagem: Readonly<{
    arquivos: number
    csvs: number
    placeholders: number
  }>
  arquivos: readonly ArquivoManifesto[]
  /** Avisos honestos consolidados (fiscal fora de escopo, placeholders, alertas). */
  avisos: readonly string[]
  /** Microcopy fixa: pacote sob demanda, não é fechamento oficial nem XML fiscal. */
  disclaimer: string
}>

/** Conteúdo montado do pacote antes da compactação (puro, testável sem ZIP/DB). */
export type ConteudoPacote = Readonly<{
  /** Nome sugerido do arquivo .zip (sem diretório). */
  nomeArquivo: string
  /** Todos os arquivos, incluindo INDICE.md e manifest.json, na ordem de escrita. */
  arquivos: readonly ArquivoPacote[]
  manifesto: ManifestoPacote
}>

/** Pacote pronto para resposta HTTP. */
export type PacoteContador = Readonly<{
  nomeArquivo: string
  /** Bytes do ZIP. */
  bytes: Uint8Array
  manifesto: ManifestoPacote
}>
