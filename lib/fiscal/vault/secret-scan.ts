/**
 * Varredura automatizada de segredos fiscais (GOAL-008 · itens 11–12).
 *
 * Ferramenta defensiva/probatória: dado um "palheiro" (resposta HTTP, log, snapshot, relatório,
 * objeto de erro) e o conjunto de segredos em jogo, prova que NENHUM segredo vazou. Cobre:
 *   - bytes do `.pfx` (base64 e hex);
 *   - senha do `.pfx`;
 *   - chave privada (corpo PEM);
 *   - material decodificado (PEM do certificado — tratado como sensível por precaução);
 *   - conteúdo das referências (`blobRef`/`senhaRef`) quando marcado como sensível.
 *
 * NÃO é criptografia — é uma rede de segurança determinística para testes e para asserção em runtime.
 */

export type SegredosEmJogo = {
  /** Senha do `.pfx`. */
  senha?: string | null
  /** Bytes crus do `.pfx`. */
  pfxBytes?: Buffer | null
  /** PEM da chave privada. */
  privateKeyPem?: string | null
  /** PEM do certificado / material decodificado (tratado como sensível). */
  materialDecodificado?: string | null
  /** Conteúdo textual sensível adicional (ex.: valor cru de uma ref, se aplicável). */
  extras?: (string | null | undefined)[]
}

export type SecretScanResultado = {
  vazou: boolean
  /** Rótulos dos segredos encontrados (sem o valor do segredo). */
  ocorrencias: string[]
}

/** Erro lançado por `assertNoSecretLeak` — NUNCA inclui o valor do segredo, só os rótulos. */
export class SecretLeakError extends Error {
  readonly ocorrencias: string[]
  constructor(ocorrencias: string[], contexto?: string) {
    super(`Vazamento de segredo fiscal detectado${contexto ? ` em ${contexto}` : ""}: ${ocorrencias.join(", ")}`)
    this.name = "SecretLeakError"
    this.ocorrencias = ocorrencias
  }
}

/** Corpo base64 de um bloco PEM (sem cabeçalho/rodapé/espaços) — o que de fato não pode vazar. */
function pemBody(pem: string | null | undefined): string {
  return String(pem ?? "")
    .replace(/-----BEGIN[^-]+-----/g, "")
    .replace(/-----END[^-]+-----/g, "")
    .replace(/\s+/g, "")
    .trim()
}

/** Serializa qualquer valor em uma string pesquisável (inclui mensagens de Error e stack). */
export function toSearchable(value: unknown): string {
  if (value == null) return ""
  if (typeof value === "string") return value
  if (value instanceof Error) {
    return [value.name, value.message, value.stack ?? ""].join("\n")
  }
  if (Buffer.isBuffer(value)) return value.toString("base64")
  try {
    return JSON.stringify(value, (_k, v) => {
      if (v instanceof Error) return { name: v.name, message: v.message, stack: v.stack }
      if (Buffer.isBuffer(v)) return v.toString("base64")
      // `JSON.stringify` já aplicou `Buffer.toJSON()` → normaliza a forma {type:"Buffer",data:[…]}
      // para base64, garantindo que bytes do .pfx aninhados sejam detectáveis pela varredura.
      if (v && typeof v === "object" && (v as { type?: unknown }).type === "Buffer" && Array.isArray((v as { data?: unknown }).data)) {
        return Buffer.from((v as { data: number[] }).data).toString("base64")
      }
      return v
    })
  } catch {
    return String(value)
  }
}

/** Candidatos mínimos (≥ 8 chars) para evitar falso-positivo com tokens triviais. */
function meaningful(needle: string | null | undefined, min = 8): string | null {
  const s = String(needle ?? "")
  return s.length >= min ? s : null
}

/**
 * Procura, no palheiro, qualquer representação dos segredos informados. Determinístico e sem I/O.
 */
export function scanForSecrets(haystack: unknown, segredos: SegredosEmJogo): SecretScanResultado {
  const texto = toSearchable(haystack)
  const ocorrencias: string[] = []
  const has = (needle: string | null): boolean => Boolean(needle) && texto.includes(needle as string)

  if (has(meaningful(segredos.senha, 6))) ocorrencias.push("senha")

  if (segredos.pfxBytes && segredos.pfxBytes.length > 0) {
    const b64 = segredos.pfxBytes.toString("base64")
    const hex = segredos.pfxBytes.toString("hex")
    // Compara por uma fatia estável e longa o suficiente para ser inequívoca.
    if (has(b64.slice(0, 48))) ocorrencias.push("pfx_base64")
    if (has(hex.slice(0, 64))) ocorrencias.push("pfx_hex")
  }

  const keyBody = pemBody(segredos.privateKeyPem)
  if (keyBody.length >= 48 && texto.includes(keyBody.slice(0, 48))) ocorrencias.push("chave_privada")

  const matBody = pemBody(segredos.materialDecodificado)
  if (matBody.length >= 48 && texto.includes(matBody.slice(0, 48))) ocorrencias.push("material_decodificado")

  for (const extra of segredos.extras ?? []) {
    const m = meaningful(extra, 8)
    if (has(m)) ocorrencias.push("extra")
  }

  return { vazou: ocorrencias.length > 0, ocorrencias }
}

/** Lança `SecretLeakError` se qualquer segredo aparecer no palheiro. */
export function assertNoSecretLeak(haystack: unknown, segredos: SegredosEmJogo, contexto?: string): void {
  const r = scanForSecrets(haystack, segredos)
  if (r.vazou) throw new SecretLeakError(r.ocorrencias, contexto)
}
