/**
 * Barrel público da interpretação de texto livre de Produto (CAD-R2-016).
 */

export type {
  OrigemCampoTextoLivre,
  NomeCampoTextoLivre,
  CampoTextoLivre,
  BackendTextoLivre,
  CaptureSourceTextoLivre,
  ProvenienciaTextoLivre,
  SugestaoTextoLivre,
} from "./types"
export {
  CAMPOS_SENSIVEIS_TEXTO_LIVRE,
  CAMPOS_INFERIVEIS_TEXTO_LIVRE,
  CAMPOS_FISCAIS_TEXTO_LIVRE,
  LIMITES_TEXTO_LIVRE,
} from "./types"

export type { ExtracaoSensivel, ExtracaoDeterministica } from "./extracao-deterministica"
export { extrairDeterministico, textoAncoraCampo } from "./extracao-deterministica"

export type { DepsInterpretacao } from "./interpretar"
export {
  interpretarTextoProduto,
  ERRO_TEXTO_VAZIO,
  ERRO_TEXTO_LONGO,
  AVISO_IA_INDISPONIVEL,
} from "./interpretar"

export type {
  ValoresAtuaisTextoLivre,
  AtribuicaoTextoLivre,
  IgnoradoTextoLivre,
  ResultadoAplicacaoTextoLivre,
} from "./aplicar"
export { calcularAplicacaoTextoLivre } from "./aplicar"
