// Barrel público do módulo de lookup externo por código de barras (GOAL 004A).

export type {
  ProdutoNormalizado,
  ProvedorId,
  ProvedorLookup,
  ResultadoCadeia,
  ResultadoLookup,
  StatusTentativa,
  TentativaLookup,
  ErroConfig,
  FabricaProvedorResult,
} from "./types"

export { MemoLookup, memoLookupGlobal, proximaMeiaNoiteSaoPaulo } from "./memo"
export type { ResultadoOrdem } from "./registry"
export { lerOrdemProvedores } from "./registry"
export type { OrquestradorDeps } from "./orquestrador"
export { resolverCadeia } from "./orquestrador"
export { criarProvedorCosmos, normalizarCosmos } from "./provedores/cosmos"
export type { CosmosDeps } from "./provedores/cosmos"
export {
  classificarBarcode,
  fabricaProvedorPadrao,
  lerEnvBarcode,
  resolverCodigoBarrasCore,
} from "./resolver"
export type {
  BarcodeEnv,
  OpcoesFabrica,
  BarcodeClassificado,
  ResolverCoreDeps,
} from "./resolver"
