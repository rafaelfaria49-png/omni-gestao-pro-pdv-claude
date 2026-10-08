import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto"

export class PessoasError extends Error {
  constructor(
    readonly code: string,
    readonly status: number = 400,
  ) {
    super(code)
    this.name = "PessoasError"
  }
}

export function exigirModulo(env: Record<string, string | undefined> = process.env): void {
  if (env.PESSOAS_DP_ENABLED !== "on") throw new PessoasError("PESSOAS_DESABILITADO", 404)
}

function chave(nome: string, env: Record<string, string | undefined> = process.env): Buffer {
  const valor = env[nome]
  if (!valor || !/^[A-Za-z0-9+/]{43}=$/.test(valor)) {
    throw new PessoasError("PESSOAS_CHAVE_INDISPONIVEL", 503)
  }
  const bytes = Buffer.from(valor, "base64")
  if (bytes.length !== 32 || bytes.toString("base64") !== valor) {
    throw new PessoasError("PESSOAS_CHAVE_INDISPONIVEL", 503)
  }
  return bytes
}

export function dataCivil(valor: string | null | undefined, obrigatoria = false): Date | null {
  if (valor == null || valor === "") {
    if (obrigatoria) throw new PessoasError("DATA_OBRIGATORIA")
    return null
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) throw new PessoasError("DATA_INVALIDA")
  const data = new Date(valor + "T00:00:00.000Z")
  if (Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== valor) {
    throw new PessoasError("DATA_INVALIDA")
  }
  return data
}

export function hojeCivil(): Date {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date())
  const pegar = (tipo: string) => partes.find((p) => p.type === tipo)!.value
  return dataCivil(`${pegar("year")}-${pegar("month")}-${pegar("day")}`, true)!
}
export function dataCivilDto(valor: Date | null | undefined): string | null {
  return valor ? valor.toISOString().slice(0, 10) : null
}

export function decimalCanonico(valor: string | null | undefined, casas = 2): string | null {
  if (valor == null || valor === "") return null
  const re = casas === 2 ? /^(0|[1-9]\d{0,15})\.\d{2}$/ : /^(0|[1-9]\d{0,11})\.\d{2}$/
  if (!re.test(valor)) throw new PessoasError("DECIMAL_INVALIDO")
  return valor
}

/** Jornada usa o contrato decimal string, com limite próprio; dinheiro não muda. */
export function jornadaSemanal(valor: unknown, obrigatoria = false): string | null {
  if (valor == null || valor === "") {
    if (obrigatoria) throw new PessoasError("JORNADA_INVALIDA", 400)
    return null
  }
  if (typeof valor !== "string" || valor.trim() !== valor || !/^(0|[1-9]\d{0,2})\.\d{2}$/.test(valor) || Number(valor) > 168) {
    throw new PessoasError("JORNADA_INVALIDA", 400)
  }
  return valor
}

export function cpfNormalizado(valor: string | null | undefined): string | null {
  if (valor == null || valor.trim() === "") return null
  if (!/^[\d.\-\s]+$/.test(valor)) throw new PessoasError("CPF_INVALIDO")
  const cpf = valor.replace(/\D/g, "")
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) throw new PessoasError("CPF_INVALIDO")
  for (const tamanho of [9, 10]) {
    const soma = [...cpf.slice(0, tamanho)].reduce((acc, n, i) => acc + Number(n) * (tamanho + 1 - i), 0)
    const resto = (soma * 10) % 11
    if (Number(cpf[tamanho]) !== (resto === 10 ? 0 : resto)) throw new PessoasError("CPF_INVALIDO")
  }
  return cpf
}

export function protegerCpf(cpf: string, empregadorId: string, env: Record<string, string | undefined> = process.env) {
  const enc = chave("PESSOAS_CPF_ENC_KEY", env)
  const mac = chave("PESSOAS_CPF_HMAC_KEY", env)
  const iv = randomBytes(12)
  const cifra = createCipheriv("aes-256-gcm", enc, iv)
  cifra.setAAD(Buffer.from(empregadorId, "utf8"))
  const texto = Buffer.concat([cifra.update(cpf, "utf8"), cifra.final()])
  const tag = cifra.getAuthTag()
  return {
    cpfCipher: [iv, tag, texto].map((x) => x.toString("base64url")).join("."),
    cpfHash: createHmac("sha256", mac).update("dp:cpf:v1\0").update(empregadorId).update("\0").update(cpf).digest("hex"),
  }
}

export function abrirCpf(cipher: string, empregadorId: string, env: Record<string, string | undefined> = process.env): string {
  try {
    const [ivRaw, tagRaw, textoRaw] = cipher.split(".")
    if (!ivRaw || !tagRaw || !textoRaw) throw new Error("format")
    const decipher = createDecipheriv("aes-256-gcm", chave("PESSOAS_CPF_ENC_KEY", env), Buffer.from(ivRaw, "base64url"))
    decipher.setAAD(Buffer.from(empregadorId, "utf8"))
    decipher.setAuthTag(Buffer.from(tagRaw, "base64url"))
    return Buffer.concat([decipher.update(Buffer.from(textoRaw, "base64url")), decipher.final()]).toString("utf8")
  } catch {
    throw new PessoasError("CPF_INDISPONIVEL", 503)
  }
}

export function hashComando(dados: unknown, env: Record<string, string | undefined> = process.env): string {
  const mac = chave("PESSOAS_CPF_HMAC_KEY", env)
  return createHmac("sha256", mac).update("dp:comando:v1\0").update(JSON.stringify(dados)).digest("hex")
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

export function texto(valor: unknown, max: number, obrigatorio = false): string | null {
  if (valor == null || valor === "") {
    if (obrigatorio) throw new PessoasError("CAMPO_OBRIGATORIO")
    return null
  }
  if (typeof valor !== "string") throw new PessoasError("CAMPO_INVALIDO")
  const v = valor.trim()
  if (!v || v.length > max || /[\x00-\x1f\x7f]/.test(v)) throw new PessoasError("CAMPO_INVALIDO")
  return v
}

export function comandoId(valor: unknown): string {
  if (typeof valor !== "string" || !/^[A-Za-z0-9_-]{8,100}$/.test(valor)) {
    throw new PessoasError("COMANDO_ID_INVALIDO")
  }
  return valor
}
