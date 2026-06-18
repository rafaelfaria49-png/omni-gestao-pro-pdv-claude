/**
 * Serviço de identidade fiscal por loja (GOAL_002 — Fiscal Identity Per Store).
 *
 * Camada pura de normalização/serialização da `ConfiguracaoFiscalLoja`. Não faz I/O
 * (as rotas chamam o Prisma); aqui só transformamos/validamos dados e GARANTIMOS que
 * nenhum segredo seja exposto e que `fiscalEnabled` NUNCA seja ligado nesta fase.
 *
 * Princípios herdados do MASTER_FISCAL_EXECUTION_PLAN:
 *  - Dormente: fiscalEnabled permanece false (esta fase não liga emissão).
 *  - Multi-loja estrito: storeId sempre explícito (sem fallback loja-1).
 *  - Segredo só por referência: CSC token / senha do certificado nunca em claro.
 */

import {
  AmbienteFiscal,
  ModeloFiscal,
  RegimeTributario,
  FiscalProviderTipo,
} from "@/generated/prisma"
import {
  crtFromRegime,
  isValidAmbiente,
  isValidModeloFiscal,
  isValidRegimeTributario,
  onlyDigits,
} from "./fiscal-validators"

/** Entrada saneada para upsert da identidade fiscal (já validada na rota). */
export type FiscalConfigInput = {
  razaoSocial?: string
  nomeFantasia?: string
  cnpj?: string
  inscricaoEstadual?: string
  inscricaoMunicipal?: string
  cnae?: string
  regimeTributario?: string
  logradouro?: string
  numero?: string
  complemento?: string
  bairro?: string
  codigoMunicipioIbge?: string
  municipio?: string
  uf?: string
  cep?: string
  fone?: string
  email?: string
  cscId?: string
  /** Referência ao segredo (nome de env/chave de cofre) — NUNCA o token em claro. */
  cscTokenRef?: string | null
  ambiente?: string
  modeloFiscal?: string
  /** Provider permanece em stub de homologação nesta fase. */
  provider?: string
}

/** Formato cru de leitura vindo do Prisma (campos relevantes). */
export type FiscalConfigRow = {
  storeId: string
  fiscalEnabled: boolean
  ambiente: AmbienteFiscal
  modeloFiscal: ModeloFiscal
  razaoSocial: string
  nomeFantasia: string
  cnpj: string
  inscricaoEstadual: string
  inscricaoMunicipal: string
  regimeTributario: RegimeTributario
  crt: number
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  codigoMunicipioIbge: string
  municipio: string
  uf: string
  cep: string
  codigoPais: string
  fone: string
  email: string
  cscId: string
  cscTokenRef: string | null
  provider: FiscalProviderTipo
  providerConfig: unknown
  providerTokenRef: string | null
  certificadoAtivoId: string | null
  updatedAt?: Date
}

const ALLOWED_PROVIDERS = new Set<string>(Object.values(FiscalProviderTipo))

function str(v: unknown): string {
  return String(v ?? "").trim()
}

/** Lê o CNAE guardado de forma aditiva no JSONB `providerConfig.identidade.cnae`. */
export function readCnaeFromProviderConfig(providerConfig: unknown): string {
  if (!providerConfig || typeof providerConfig !== "object") return ""
  const id = (providerConfig as Record<string, unknown>).identidade
  if (!id || typeof id !== "object") return ""
  return str((id as Record<string, unknown>).cnae)
}

/**
 * Constrói o `providerConfig` preservando chaves existentes (ex.: futuros endpoints)
 * e gravando o CNAE em `identidade.cnae`. CNAE não tem coluna própria nesta fase
 * (evita alteração de schema fora do Gate); fica no JSONB de forma aditiva.
 */
export function buildProviderConfig(prev: unknown, cnae: string): Record<string, unknown> {
  const base: Record<string, unknown> =
    prev && typeof prev === "object" ? { ...(prev as Record<string, unknown>) } : {}
  const identidadePrev =
    base.identidade && typeof base.identidade === "object"
      ? { ...(base.identidade as Record<string, unknown>) }
      : {}
  identidadePrev.cnae = onlyDigits(cnae)
  base.identidade = identidadePrev
  return base
}

/**
 * Normaliza a entrada para os campos do upsert. NUNCA inclui `fiscalEnabled`
 * (mantém o default/atual = false). Deriva o CRT do regime (fonte única).
 */
export function normalizeFiscalConfigForUpsert(
  input: FiscalConfigInput,
  prevProviderConfig: unknown,
): {
  data: {
    razaoSocial: string
    nomeFantasia: string
    cnpj: string
    inscricaoEstadual: string
    inscricaoMunicipal: string
    regimeTributario: RegimeTributario
    crt: number
    logradouro: string
    numero: string
    complemento: string
    bairro: string
    codigoMunicipioIbge: string
    municipio: string
    uf: string
    cep: string
    fone: string
    email: string
    cscId: string
    cscTokenRef: string | null
    ambiente: AmbienteFiscal
    modeloFiscal: ModeloFiscal
    provider: FiscalProviderTipo
    providerConfig: Record<string, unknown>
  }
} {
  const regime = isValidRegimeTributario(input.regimeTributario)
    ? input.regimeTributario
    : RegimeTributario.SIMPLES_NACIONAL
  const ambiente = isValidAmbiente(input.ambiente) ? input.ambiente : AmbienteFiscal.HOMOLOGACAO
  const modeloFiscal = isValidModeloFiscal(input.modeloFiscal) ? input.modeloFiscal : ModeloFiscal.NFCE
  // Provider permanece dormente — só aceita valores conhecidos; default stub de homologação.
  const provider =
    input.provider && ALLOWED_PROVIDERS.has(input.provider)
      ? (input.provider as FiscalProviderTipo)
      : FiscalProviderTipo.STUB_HOMOLOGACAO

  return {
    data: {
      razaoSocial: str(input.razaoSocial),
      nomeFantasia: str(input.nomeFantasia),
      cnpj: onlyDigits(input.cnpj),
      inscricaoEstadual: str(input.inscricaoEstadual).toUpperCase(),
      inscricaoMunicipal: str(input.inscricaoMunicipal),
      regimeTributario: regime,
      crt: crtFromRegime(regime),
      logradouro: str(input.logradouro),
      numero: str(input.numero),
      complemento: str(input.complemento),
      bairro: str(input.bairro),
      codigoMunicipioIbge: onlyDigits(input.codigoMunicipioIbge),
      municipio: str(input.municipio),
      uf: str(input.uf).toUpperCase(),
      cep: onlyDigits(input.cep),
      fone: str(input.fone),
      email: str(input.email),
      cscId: str(input.cscId),
      // Referência ao segredo. String vazia → null (não configurado).
      cscTokenRef: str(input.cscTokenRef) || null,
      ambiente,
      modeloFiscal,
      provider,
      providerConfig: buildProviderConfig(prevProviderConfig, str(input.cnae)),
    },
  }
}

/**
 * Saída para o cliente. A tabela por design NÃO guarda segredo em claro (só refs),
 * então expomos os campos de identidade + indicadores booleanos do que está
 * configurado. `fiscalEnabled` é sempre refletido (deve permanecer false nesta fase).
 */
export function sanitizeFiscalConfigForClient(row: FiscalConfigRow | null) {
  if (!row) return null
  return {
    storeId: row.storeId,
    fiscalEnabled: row.fiscalEnabled,
    ambiente: row.ambiente,
    modeloFiscal: row.modeloFiscal,
    razaoSocial: row.razaoSocial,
    nomeFantasia: row.nomeFantasia,
    cnpj: row.cnpj,
    inscricaoEstadual: row.inscricaoEstadual,
    inscricaoMunicipal: row.inscricaoMunicipal,
    cnae: readCnaeFromProviderConfig(row.providerConfig),
    regimeTributario: row.regimeTributario,
    crt: row.crt,
    logradouro: row.logradouro,
    numero: row.numero,
    complemento: row.complemento,
    bairro: row.bairro,
    codigoMunicipioIbge: row.codigoMunicipioIbge,
    municipio: row.municipio,
    uf: row.uf,
    cep: row.cep,
    codigoPais: row.codigoPais,
    fone: row.fone,
    email: row.email,
    cscId: row.cscId,
    /** Apenas indica se há referência configurada — nunca o segredo. */
    cscConfigured: Boolean(str(row.cscTokenRef)),
    provider: row.provider,
    certificadoAtivoId: row.certificadoAtivoId,
    updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
  }
}
