import { z } from "zod"
import {
  requireGestorMoneyApiContext,
  respostaPrivadaJson,
  seletorPerfilApiSchema,
} from "@/lib/gestor-money/server/auth-boundary"
import {
  listarDocumentosPrivadosReal,
  registrarComprovantePrivadoReal,
} from "@/lib/gestor-money/server/documents-adapter"
import { mapearErroIntegracaoReal } from "@/lib/gestor-money/server/operations-adapter"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET(req: Request) {
  const url = new URL(req.url)
  const tipo = url.searchParams.get("tipo")
  const perfilId = url.searchParams.get("perfilId")
  const storeId = url.searchParams.get("storeId")
  const seletor =
    tipo === "PESSOAL"
      ? storeId !== null
        ? { tipo, perfilId, storeId }
        : { tipo, perfilId }
      : { tipo, perfilId, storeId }

  const authRes = await requireGestorMoneyApiContext(seletor, "view")
  if (!authRes.ok) return authRes.response

  try {
    const documentos = await listarDocumentosPrivadosReal(authRes.contexto)
    return respostaPrivadaJson(
      {
        ok: true,
        documentos,
        storagePrivadoProvisionado: false,
      },
      200
    )
  } catch (error) {
    const mapped = mapearErroIntegracaoReal(error)
    return respostaPrivadaJson({ ok: false, code: mapped.code, error: mapped.message }, mapped.status)
  }
}

const uploadBodySchema = z
  .object({
    seletor: seletorPerfilApiSchema,
    nomeArquivo: z.string().trim().min(1).max(180),
    conteudoBase64: z.string().min(1).max(15_000_000),
  })
  .strict()

/**
 * Fronteira privada de upload de comprovantes (G003).
 * Sem provedor externo provisionado (G003-STORAGE), falha fechado com 503 sem acessar storage real.
 */
export async function POST(req: Request) {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return respostaPrivadaJson({ ok: false, code: "invalid_json", error: "JSON inválido." }, 400)
  }
  const parsed = uploadBodySchema.safeParse(raw)
  if (!parsed.success) {
    return respostaPrivadaJson({ ok: false, code: "validation_error", error: "Payload de documento inválido." }, 422)
  }
  const authRes = await requireGestorMoneyApiContext(parsed.data.seletor, "edit")
  if (!authRes.ok) return authRes.response

  try {
    const bytes = new Uint8Array(Buffer.from(parsed.data.conteudoBase64, "base64"))
    const documento = await registrarComprovantePrivadoReal(authRes.contexto, {
      nomeArquivo: parsed.data.nomeArquivo,
      conteudo: bytes,
    })
    return respostaPrivadaJson({ ok: true, documento }, 201)
  } catch (error) {
    const mapped = mapearErroIntegracaoReal(error)
    return respostaPrivadaJson({ ok: false, code: mapped.code, error: mapped.message }, mapped.status)
  }
}
