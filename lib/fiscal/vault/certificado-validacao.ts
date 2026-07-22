/**
 * Validação do certificado A1 da loja a partir do cofre (GOAL-008 · itens 3, 4, 9).
 *
 * Orquestra: resolve o `.pfx`+senha por REFERÊNCIA (via `FiscalSecretVault`, escopo por `storeId`) →
 * abre o PKCS#12 EM MEMÓRIA (`loadPkcs12`) → valida formato, chave×certificado, janela de validade,
 * cadeia disponível e CNPJ do titular × CNPJ da loja. Devolve um resultado SANEADO (sem segredo).
 *
 * Fail-closed (ADR-0009): referência/segredo ausente, senha incorreta, certificado inválido/vencido,
 * CNPJ divergente ⇒ `ok=false` + `statusSugerido` ∈ {INVALIDO, EXPIRADO}. NUNCA emite/ativa sozinho.
 * O segredo NUNCA aparece no resultado, em log ou em erro.
 */
import type { FiscalSecretVault } from "./fiscal-secret-vault"
import { FiscalVaultError } from "./fiscal-secret-vault"
import { Pkcs12ParseError, loadPkcs12, zeroBuffer } from "./pkcs12-loader"

/** Espelha `enum CertificadoStatus` do schema (sem acoplar o Prisma nesta camada pura). */
export type CertificadoStatusValor = "PENDENTE_VALIDACAO" | "ATIVO" | "EXPIRADO" | "REVOGADO" | "INVALIDO"

export type CertificadoValidacaoMotivo =
  | "blobRef_ausente"
  | "senhaRef_ausente"
  | "pfx_ausente"
  | "senha_ausente"
  | "senha_incorreta"
  | "certificado_invalido"
  | "certificado_sem_chave"
  | "certificado_sem_titular"
  | "chave_fraca"
  | "certificado_vencido"
  | "certificado_ainda_nao_valido"
  | "cadeia_indisponivel"
  | "cnpj_loja_ausente"
  | "cnpj_certificado_ausente"
  | "cnpj_divergente"
  | "ref_fora_de_escopo"
  | "erro_inesperado"

export type CertificadoValidacao = {
  ok: boolean
  statusSugerido: CertificadoStatusValor
  motivos: CertificadoValidacaoMotivo[]
  validade: {
    de: string | null
    ate: string | null
    vigente: boolean
  }
  cnpj: {
    certificado: string | null
    loja: string | null
    confere: boolean
  }
  cadeiaDisponivel: boolean
  titularCn: string
  serialNumber: string
  fingerprintSha1: string
}

export type ValidarCertificadoParams = {
  vault: FiscalSecretVault
  storeId: string
  blobRef: string | null | undefined
  senhaRef: string | null | undefined
  /** CNPJ configurado na loja (`ConfiguracaoFiscalLoja.cnpj`) para conferência de titularidade. */
  cnpjLoja: string | null | undefined
  /** Instante de referência para a janela de validade (default: agora). */
  agora?: Date
  /** Exige RSA ≥ 2048 (mesma regra do assinador). Default true. */
  exigirRsa2048?: boolean
}

function onlyDigits(v: string | null | undefined): string {
  return String(v ?? "").replace(/\D+/g, "")
}

function falha(
  statusSugerido: CertificadoStatusValor,
  motivos: CertificadoValidacaoMotivo[],
  extra?: Partial<CertificadoValidacao>,
): CertificadoValidacao {
  return {
    ok: false,
    statusSugerido,
    motivos,
    validade: extra?.validade ?? { de: null, ate: null, vigente: false },
    cnpj: extra?.cnpj ?? { certificado: null, loja: null, confere: false },
    cadeiaDisponivel: extra?.cadeiaDisponivel ?? false,
    titularCn: extra?.titularCn ?? "",
    serialNumber: extra?.serialNumber ?? "",
    fingerprintSha1: extra?.fingerprintSha1 ?? "",
  }
}

/** Valida o certificado A1 da loja resolvido do cofre. Fail-closed; nunca expõe segredo. */
export async function validarCertificadoLoja(params: ValidarCertificadoParams): Promise<CertificadoValidacao> {
  const { vault, storeId, blobRef, senhaRef, cnpjLoja } = params
  const agora = params.agora ?? new Date()
  const exigirRsa2048 = params.exigirRsa2048 ?? true

  if (!String(blobRef ?? "").trim()) return falha("INVALIDO", ["blobRef_ausente"])
  if (!String(senhaRef ?? "").trim()) return falha("INVALIDO", ["senhaRef_ausente"])

  let pfx: Buffer | null = null
  let senha: string | null = null
  try {
    try {
      pfx = await vault.getCertificadoPfx(storeId, blobRef)
      senha = await vault.getCertificadoSenha(storeId, senhaRef)
    } catch (e) {
      if (e instanceof FiscalVaultError && e.code === "ref_fora_de_escopo") {
        return falha("INVALIDO", ["ref_fora_de_escopo"])
      }
      throw e
    }

    if (!pfx || pfx.length === 0) return falha("INVALIDO", ["pfx_ausente"])
    if (!senha) return falha("INVALIDO", ["senha_ausente"])

    let material
    try {
      material = loadPkcs12(pfx, senha)
    } catch (e) {
      if (e instanceof Pkcs12ParseError) {
        switch (e.code) {
          case "senha_invalida":
            return falha("INVALIDO", ["senha_incorreta"])
          case "sem_chave_privada":
            return falha("INVALIDO", ["certificado_sem_chave"])
          case "sem_certificado":
            return falha("INVALIDO", ["certificado_sem_titular"])
          default:
            return falha("INVALIDO", ["certificado_invalido"])
        }
      }
      return falha("INVALIDO", ["erro_inesperado"])
    }

    const { meta, cadeiaDisponivel } = material
    const motivos: CertificadoValidacaoMotivo[] = []

    // Chave RSA mínima (mesma regra do assinador).
    if (exigirRsa2048 && meta.chavePublicaRsaBits < 2048) motivos.push("chave_fraca")

    // Janela de validade.
    const antes = agora.getTime() < meta.notBefore.getTime()
    const depois = agora.getTime() > meta.notAfter.getTime()
    const vigente = !antes && !depois
    if (antes) motivos.push("certificado_ainda_nao_valido")
    if (depois) motivos.push("certificado_vencido")

    // Cadeia.
    if (!cadeiaDisponivel) motivos.push("cadeia_indisponivel")

    // CNPJ titular × loja.
    const cnpjCert = meta.cnpj ? onlyDigits(meta.cnpj) : null
    const cnpjLojaDig = onlyDigits(cnpjLoja)
    let cnpjConfere = false
    if (!cnpjLojaDig) {
      motivos.push("cnpj_loja_ausente")
    } else if (!cnpjCert) {
      motivos.push("cnpj_certificado_ausente")
    } else if (cnpjCert !== cnpjLojaDig) {
      motivos.push("cnpj_divergente")
    } else {
      cnpjConfere = true
    }

    const venceu = motivos.includes("certificado_vencido")
    const ok = motivos.length === 0
    const statusSugerido: CertificadoStatusValor = ok ? "ATIVO" : venceu ? "EXPIRADO" : "INVALIDO"

    return {
      ok,
      statusSugerido,
      motivos,
      validade: { de: meta.notBefore.toISOString(), ate: meta.notAfter.toISOString(), vigente },
      cnpj: { certificado: cnpjCert, loja: cnpjLojaDig || null, confere: cnpjConfere },
      cadeiaDisponivel,
      titularCn: meta.titularCn,
      serialNumber: meta.serialNumber,
      fingerprintSha1: meta.fingerprintSha1,
    }
  } finally {
    // Zera os bytes sensíveis resolvidos do cofre (best-effort). `senha` é string imutável (GC).
    zeroBuffer(pfx)
    pfx = null
    senha = null
  }
}
