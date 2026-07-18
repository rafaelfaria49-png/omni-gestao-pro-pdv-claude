/**
 * Contador HUB · Pacote do Contador (MVP) — API pública do módulo (GOAL 008 · 008B).
 *
 * Gerado sob demanda, sem storage/persistência/snapshot. Estrutura fixa de 14 arquivos,
 * CSVs detalhados por fonte e manifesto canônico v1. O import de Prisma acontece
 * dinamicamente dentro de `gerarPacoteContador` — importar este índice não conecta ao banco.
 */
export { gerarPacoteContador, montarConteudoPacote } from "./builder"
export type {
  GerarPacoteContadorInput,
  MontarConteudoPacoteInput,
} from "./builder"
export {
  PacoteInseguroError,
  PacoteLimiteExcedidoError,
  sanitizarStoreIdParaArquivo,
} from "./seguranca"
export type {
  ArquivoManifestoV1,
  ArquivoPacote,
  CategoriaArquivoPacote,
  ConteudoPacote,
  EstadoFonte,
  FonteManifestoV1,
  FonteResultado,
  ManifestoPacoteContadorV1,
  PacoteContador,
} from "./tipos"
export type { FontesDetalhadasPacote } from "./carregar-fontes"
