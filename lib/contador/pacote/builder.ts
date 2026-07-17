/**
 * Contador HUB · Pacote do Contador — montagem e geração (GOAL 008).
 *
 * `montarConteudoPacote` é PURO (sem IO/DB/ZIP): monta conteúdo + índice + manifesto e
 * aplica as guardas de segurança. `gerarPacoteContador` é o único ponto com IO: carrega
 * o DTO real (GOAL 006, read-only) sob demanda, deriva o checklist (GOAL 007) e compacta.
 *
 * O import dos readers é DINÂMICO de propósito: mantém o grafo estático deste módulo
 * livre de Prisma, para que `montarConteudoPacote` seja testável sem banco.
 */
import { formatCompetencia, type Competencia } from "@/lib/contador/competencia"
import { montarChecklistFechamento } from "@/lib/contador/fechamento"
import type { ChecklistFechamento } from "@/lib/contador/fechamento"
import type { ContadorDadosReais } from "@/lib/contador/readers/tipos"
import type { ContadorScopeInterno } from "@/lib/contador/scope-core"
import { montarArquivosConteudo, montarAvisos } from "./fontes"
import {
  descreverArquivos,
  montarManifesto,
  renderIndiceMd,
  serializarManifesto,
} from "./manifest"
import { assertPacoteSeguro } from "./seguranca"
import { ziparArquivos } from "./zip"
import type { ArquivoPacote, ConteudoPacote, PacoteContador } from "./tipos"

export type MontarConteudoPacoteInput = Readonly<{
  dados: ContadorDadosReais
  checklist: ChecklistFechamento
  competencia: Competencia
  agora: Date
  /** storeId da loja ativa — usado apenas na guarda anti-vazamento (não vai ao conteúdo). */
  storeId?: string | null
}>

/**
 * Monta o conteúdo completo do pacote (conteúdo + INDICE.md + manifest.json), já com
 * hashes e guardas aplicadas. Puro e determinístico para o mesmo input.
 */
export function montarConteudoPacote(input: MontarConteudoPacoteInput): ConteudoPacote {
  const { dados, checklist, competencia, agora } = input

  const conteudo = montarArquivosConteudo({ dados, checklist, competencia, agora })

  const descritoresConteudo = descreverArquivos(conteudo)
  const indice: ArquivoPacote = {
    caminho: "INDICE.md",
    categoria: "indice",
    descricao: "Índice com tamanho e hash (sha256) de cada arquivo.",
    conteudo: renderIndiceMd(descritoresConteudo, competencia, agora),
  }

  const arquivosComIndice = [...conteudo, indice]
  const descritoresTodos = descreverArquivos(arquivosComIndice)
  const avisos = montarAvisos(dados, checklist)
  const manifesto = montarManifesto({ descritores: descritoresTodos, competencia, agora, avisos })

  const manifestoArquivo: ArquivoPacote = {
    caminho: "manifest.json",
    categoria: "manifesto",
    descricao: "Manifesto v1 — raiz de integridade do pacote.",
    conteudo: serializarManifesto(manifesto),
  }

  const arquivos = [...arquivosComIndice, manifestoArquivo]
  assertPacoteSeguro(arquivos, { storeId: input.storeId })

  return {
    nomeArquivo: `pacote-contador-${formatCompetencia(competencia)}.zip`,
    arquivos,
    manifesto,
  }
}

export type GerarPacoteContadorInput = Readonly<{
  scope: ContadorScopeInterno
  competencia: Competencia
  agora: Date
}>

/**
 * Gera o pacote sob demanda: carrega os dados reais (read-only) da competência, deriva
 * o checklist do GOAL 007 do mesmo DTO e compacta. Nada é persistido.
 */
export async function gerarPacoteContador(
  input: GerarPacoteContadorInput,
): Promise<PacoteContador> {
  // Import dinâmico: só aqui o grafo toca Prisma (mantém o módulo testável sem banco).
  const { construirDadosContador } = await import("@/lib/contador/readers")
  const dados = await construirDadosContador(input.scope, input.competencia)
  const checklist = montarChecklistFechamento({
    dados,
    competencia: input.competencia,
    agora: input.agora,
  })

  const conteudo = montarConteudoPacote({
    dados,
    checklist,
    competencia: input.competencia,
    agora: input.agora,
    storeId: input.scope.storeId,
  })

  const bytes = await ziparArquivos(conteudo.arquivos, input.agora)
  return {
    nomeArquivo: conteudo.nomeArquivo,
    bytes,
    manifesto: conteudo.manifesto,
  }
}
