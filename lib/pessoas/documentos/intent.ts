import { createHmac, timingSafeEqual } from "node:crypto"
import { PessoasError } from "../domain"

const V = "omni.pessoas.documento.intent/v1"
type Env = Record<string, string | undefined>

export type Intent = Readonly<{
  v: typeof V
  empregadorId: string
  storeId: string
  userId: string
  pessoaId: string
  vinculoId: string
  documentoId: string
  storageRef: string
  categoria: string
  origem: "INTERNO" | "CONTADOR_EXTERNO"
  nomeArquivo: string
  mime: string
  bytes: number
  sha256: string
  exp: number
}>

function chave(env: Env = process.env): Buffer {
  const valor = env.PESSOAS_DOCUMENT_INTENT_KEY
  if (!valor || !/^[A-Za-z0-9+/]{43}=$/.test(valor)) throw new PessoasError("PESSOAS_CHAVE_INDISPONIVEL", 503)
  const b = Buffer.from(valor, "base64")
  if (b.length !== 32 || b.toString("base64") !== valor) throw new PessoasError("PESSOAS_CHAVE_INDISPONIVEL", 503)
  return b
}

function assinar(corpo: string, env: Env = process.env) {
  return createHmac("sha256", chave(env)).update("dp:documento:v1\0").update(corpo).digest("base64url")
}

export function emitirIntent(dados: Omit<Intent, "v" | "exp">, agora = Date.now(), env: Env = process.env): string {
  const payload: Intent = { v: V, ...dados, exp: Math.floor(agora / 1000) + 600 }
  const corpo = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
  return corpo + "." + assinar(corpo, env)
}

export function verificarIntent(token: unknown, agora = Date.now(), env: Env = process.env): Intent {
  if (typeof token !== "string" || token.length > 4096 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
    throw new PessoasError("INTENT_INVALIDO", 403)
  }
  const [corpo, assinatura] = token.split(".")
  const esperado = Buffer.from(assinar(corpo, env), "utf8")
  const recebido = Buffer.from(assinatura, "utf8")
  if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) {
    throw new PessoasError("INTENT_INVALIDO", 403)
  }
  try {
    const p = JSON.parse(Buffer.from(corpo, "base64url").toString("utf8")) as Intent
    if (p.v !== V || !Number.isInteger(p.exp) || p.exp <= Math.floor(agora / 1000) ||
        !p.empregadorId || !p.storeId || !p.userId || !p.pessoaId || !p.vinculoId ||
        !p.documentoId || !p.storageRef || !p.sha256 || !Number.isInteger(p.bytes)) {
      throw new Error("invalid")
    }
    return Object.freeze(p)
  } catch {
    throw new PessoasError("INTENT_INVALIDO", 403)
  }
}
