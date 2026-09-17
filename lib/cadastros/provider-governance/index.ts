/**
 * Barrel público da governança de provedores externos (CAD-R2-015).
 *
 * Reutilizável pelos GOALs 016/017 (texto/voz) no nível de contrato
 * (capability, decisão de execução, proveniência) — sem registrar providers
 * dessas capabilities aqui.
 */

export type {
  CapabilityProvedorExterno,
  ProvedorExternoId,
  LifecycleProvedor,
  CampoSugestaoBarcode,
  CampoProibidoExterno,
  TermosProvedor,
  PoliticaTelemetria,
  GovernancaProvedor,
  MotivoIndisponivel,
  DecisaoProvedor,
  PresencaConfigProvedor,
} from "./types"
export { CAMPOS_PROIBIDOS_EXTERNOS } from "./types"

export {
  REGISTRO_PROVEDORES,
  ENV_ORDEM_BARCODE,
  ORDEM_BARCODE_DEFAULT,
  POLITICA_TIMEOUT_MS,
  POLITICA_FALLBACK,
  POLITICA_RATE_LIMIT,
  MENSAGEM_COSMOS_SEM_CONFIG,
  MENSAGEM_OFF_INDISPONIVEL,
  idsConhecidos,
  listarProvedores,
  obterProvedor,
  avaliarProvedor,
  podeSugerirCampo,
  filtrarSugestao,
} from "./registry"

export {
  SUPERFICIES_PROIBIDAS_SEGREDO,
  contemSegredo,
  afirmarSemSegredo,
} from "./secrets"

export type {
  StatusLookupAuditavel,
  StatusCadeiaBarcode,
  TentativaSanitizada,
  EntradaProvenienciaBarcode,
  ProvenienciaBarcodeLookup,
} from "./provenance"
export {
  statusLookupAuditavel,
  sanitizarTentativas,
  construirProvenienciaBarcode,
  validarProvenienciaSegura,
} from "./provenance"

export type {
  CampoAplicavelSugestao,
  ValoresAtuaisFormulario,
  CampoAplicado,
} from "./sugestao"
export { calcularCamposAplicaveis } from "./sugestao"
