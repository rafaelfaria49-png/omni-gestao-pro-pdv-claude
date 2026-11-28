import { z } from "zod"
import {
  requireGestorMoneyApiContext,
  respostaPrivadaJson,
  seletorPerfilApiSchema,
} from "@/lib/gestor-money/server/auth-boundary"
import {
  alternarCategoriaAtivaReal,
  criarCategoriaReal,
  mapearErroIntegracaoReal,
} from "@/lib/gestor-money/server/operations-adapter"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const criarBodySchema = z
  .object({
    seletor: seletorPerfilApiSchema,
    payload: z.unknown(),
  })
  .strict()

const patchBodySchema = z
  .object({
    seletor: seletorPerfilApiSchema,
    categoriaId: z.string().trim().min(1).max(191),
    ativo: z.boolean(),
  })
  .strict()

export async function POST(req: Request) {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return respostaPrivadaJson({ ok: false, code: "invalid_json", error: "JSON inválido." }, 400)
  }
  const parsed = criarBodySchema.safeParse(raw)
  if (!parsed.success) {
    return respostaPrivadaJson({ ok: false, code: "validation_error", error: "Payload inválido." }, 422)
  }
  const authRes = await requireGestorMoneyApiContext(parsed.data.seletor, "edit")
  if (!authRes.ok) return authRes.response

  try {
    const feedback = await criarCategoriaReal(
      authRes.contexto,
      parsed.data.payload as Parameters<typeof criarCategoriaReal>[1]
    )
    return respostaPrivadaJson({ ok: true, feedback }, 201)
  } catch (error) {
    const mapped = mapearErroIntegracaoReal(error)
    return respostaPrivadaJson({ ok: false, code: mapped.code, error: mapped.message }, mapped.status)
  }
}

export async function PATCH(req: Request) {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return respostaPrivadaJson({ ok: false, code: "invalid_json", error: "JSON inválido." }, 400)
  }
  const parsed = patchBodySchema.safeParse(raw)
  if (!parsed.success) {
    return respostaPrivadaJson({ ok: false, code: "validation_error", error: "Payload inválido." }, 422)
  }
  const authRes = await requireGestorMoneyApiContext(parsed.data.seletor, "edit")
  if (!authRes.ok) return authRes.response

  try {
    const feedback = await alternarCategoriaAtivaReal(
      authRes.contexto,
      parsed.data.categoriaId,
      parsed.data.ativo
    )
    return respostaPrivadaJson({ ok: true, feedback }, 200)
  } catch (error) {
    const mapped = mapearErroIntegracaoReal(error)
    return respostaPrivadaJson({ ok: false, code: mapped.code, error: mapped.message }, mapped.status)
  }
}
