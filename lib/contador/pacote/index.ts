/**
 * Contador HUB · Pacote do Contador (MVP) — API pública do módulo (GOAL 008).
 *
 * Gerado sob demanda, sem storage/persistência/snapshot. Consome o DTO do GOAL 006 e o
 * checklist read-only do GOAL 007. O import de Prisma acontece dinamicamente dentro de
 * `gerarPacoteContador` — importar este índice não conecta ao banco.
 */
export { gerarPacoteContador, montarConteudoPacote } from "./builder"
export type {
  GerarPacoteContadorInput,
  MontarConteudoPacoteInput,
} from "./builder"
export type {
  ArquivoManifesto,
  ArquivoPacote,
  CategoriaArquivoPacote,
  CompetenciaManifesto,
  ConteudoPacote,
  ManifestoPacote,
  PacoteContador,
} from "./tipos"
