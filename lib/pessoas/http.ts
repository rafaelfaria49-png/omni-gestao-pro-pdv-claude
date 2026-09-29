import { NextResponse } from "next/server"
import { PessoasError } from "./domain"

const headers = { "Cache-Control": "private, no-store, max-age=0", "Pragma": "no-cache" }

export function respostaJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers })
}

export function respostaErro(e: unknown) {
  const erro = e instanceof PessoasError ? e : new PessoasError("FALHA_INTERNA", 500)
  return respostaJson({ ok: false, code: erro.code }, erro.status)
}

export async function lerJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await req.json()
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("body")
    return body as Record<string, unknown>
  } catch {
    throw new PessoasError("CORPO_INVALIDO")
  }
}
