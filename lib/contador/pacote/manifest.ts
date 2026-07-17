/**
 * Contador HUB · Pacote do Contador — índice e manifesto v1 (puro, sem IO/DB/ZIP).
 *
 * GOAL 008. Calcula o descritor de integridade (bytes + sha256) de cada arquivo,
 * renderiza o `INDICE.md` humano e monta o `manifest.json` (raiz de integridade).
 *
 * O `manifest.json` lista TODOS os demais arquivos (inclusive `INDICE.md`), mas não
 * a si mesmo — é o vértice da árvore de hashes.
 */
import { formatCompetencia, labelCompetencia, type Competencia } from "@/lib/contador/competencia"
import { bytesUtf8, sha256Hex } from "./seguranca"
import type {
  ArquivoManifesto,
  ArquivoPacote,
  CompetenciaManifesto,
  ManifestoPacote,
} from "./tipos"

const DISCLAIMER_MANIFESTO =
  "Pacote gerado sob demanda pelo Contador HUB. Não é fechamento oficial, snapshot, " +
  "versão persistida nem apuração fiscal/contábil. Não inclui XML fiscal nesta fase. " +
  "Reflete os dados vivos da competência no instante do download."

/** Calcula bytes + sha256 de cada arquivo (ordem preservada). */
export function descreverArquivos(arquivos: readonly ArquivoPacote[]): ArquivoManifesto[] {
  return arquivos.map((a) => ({
    caminho: a.caminho,
    descricao: a.descricao,
    categoria: a.categoria,
    bytes: bytesUtf8(a.conteudo),
    sha256: sha256Hex(a.conteudo),
  }))
}

function competenciaManifesto(competencia: Competencia): CompetenciaManifesto {
  return {
    ano: competencia.ano,
    mes: competencia.mes,
    codigo: formatCompetencia(competencia),
    label: labelCompetencia(competencia),
  }
}

/** Renderiza o `INDICE.md` humano a partir dos descritores dos arquivos de conteúdo. */
export function renderIndiceMd(
  descritores: readonly ArquivoManifesto[],
  competencia: Competencia,
  agora: Date,
): string {
  const linhas: string[] = [
    `# Índice do Pacote do Contador — ${labelCompetencia(competencia)}`,
    "",
    `- Competência: \`${formatCompetencia(competencia)}\``,
    `- Gerado em: ${agora.toISOString()}`,
    "",
    "| Arquivo | Categoria | Descrição | Bytes | sha256 |",
    "|---|---|---|---|---|",
  ]
  for (const d of descritores) {
    // Escapa `|` na descrição para não quebrar a tabela Markdown.
    const desc = d.descricao.replace(/\|/g, "\\|")
    linhas.push(`| \`${d.caminho}\` | ${d.categoria} | ${desc} | ${d.bytes} | \`${d.sha256}\` |`)
  }
  linhas.push(
    "",
    "Os hashes acima cobrem todos os arquivos exceto o próprio `manifest.json`, que é a",
    "raiz de integridade (versão 1) e lista os mesmos arquivos em formato JSON.",
    "",
  )
  return linhas.join("\n")
}

/** Monta o `manifest.json` (v1) listando cada arquivo com hash e tamanho. */
export function montarManifesto(input: {
  descritores: readonly ArquivoManifesto[]
  competencia: Competencia
  agora: Date
  avisos: readonly string[]
}): ManifestoPacote {
  const { descritores, competencia, agora, avisos } = input
  const csvs = descritores.filter((d) => d.categoria === "csv").length
  const placeholders = descritores.filter((d) => d.categoria === "placeholder").length
  return {
    schema: "omnigestao.contador.pacote",
    versao: 1,
    geradoEm: agora.toISOString(),
    competencia: competenciaManifesto(competencia),
    aplicacao: { nome: "OmniGestão Pro" },
    contagem: {
      arquivos: descritores.length,
      csvs,
      placeholders,
    },
    arquivos: descritores,
    avisos,
    disclaimer: DISCLAIMER_MANIFESTO,
  }
}

/** Serializa o manifesto de forma estável (2 espaços) para o arquivo `manifest.json`. */
export function serializarManifesto(manifesto: ManifestoPacote): string {
  return JSON.stringify(manifesto, null, 2) + "\n"
}
