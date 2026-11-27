import { z } from "zod"
import {
  requireGestorMoneyApiContext,
  respostaPrivadaJson,
  seletorPerfilApiSchema,
} from "@/lib/gestor-money/server/auth-boundary"
import {
  criarCartaoReal,
  editarCartaoReal,
  listarCartoesCanonicosReal,
  mapearErroIntegracaoReal,
} from "@/lib/gestor-money/server/operations-adapter"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

function seletorFromUrl(url: URL) {
  const tipo = url.searchParams.get("tipo")
  const perfilId = url.searchParams.get("perfilId")
  const storeId = url.searchParams.get("storeId")
  return tipo === "PESSOAL"
    ? storeId !== null
      ? { tipo, perfilId, storeId }
      : { tipo, perfilId }
    : { tipo, perfilId, storeId }
}

/**
 * Consulta canônica de cartões, limites (total/utilizado/disponível/excedido/%),
 * faturas por ciclo e histórico de alterações de limite (`consultarCartoesGasto`).
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const authRes = await requireGestorMoneyApiContext(seletorFromUrl(url), "view")
  if (!authRes.ok) return authRes.response

  const cartaoId = url.searchParams.get("cartaoId") || undefined
  const incluirInativos = url.searchParams.get("incluirInativos") === "true"
  const incluirHistoricoLimites = url.searchParams.get("incluirHistoricoLimites") !== "false"

  try {
    const cartoes = await listarCartoesCanonicosReal(authRes.contexto, {
      ...(cartaoId ? { cartaoId } : {}),
      incluirInativos,
      incluirHistoricoLimites,
    })
    return respostaPrivadaJson({ ok: true, cartoes }, 200)
  } catch (error) {
    const mapped = mapearErroIntegracaoReal(error)
    return respostaPrivadaJson({ ok: false, code: mapped.code, error: mapped.message }, mapped.status)
  }
}

const criarCartaoBodySchema = z
  .object({
    seletor: seletorPerfilApiSchema,
    payload: z.unknown(),
  })
  .strict()

export async function POST(req: Request) {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return respostaPrivadaJson({ ok: false, code: "invalid_json", error: "JSON inválido." }, 400)
  }
  const parsed = criarCartaoBodySchema.safeParse(raw)
  if (!parsed.success) {
    return respostaPrivadaJson({ ok: false, code: "validation_error", error: "Payload inválido." }, 422)
  }
  const authRes = await requireGestorMoneyApiContext(parsed.data.seletor, "edit")
  if (!authRes.ok) return authRes.response

  try {
    const feedback = await criarCartaoReal(
      authRes.contexto,
      parsed.data.payload as Parameters<typeof criarCartaoReal>[1]
    )
    return respostaPrivadaJson({ ok: true, feedback }, 201)
  } catch (error) {
    const mapped = mapearErroIntegracaoReal(error)
    return respostaPrivadaJson({ ok: false, code: mapped.code, error: mapped.message }, mapped.status)
  }
}

const editarCartaoBodySchema = z
  .object({
    seletor: seletorPerfilApiSchema,
    payload: z.unknown(),
  })
  .strict()

/**
 * Edição canônica de cartão e/ou limite (`editarCartaoGasto`), com lock `FOR UPDATE`
 * e auditoria imutável em `cartoes_limites_eventos` (`CADASTRO` | `ALTERACAO` | `REMOCAO`).
 */
export async function PATCH(req: Request) {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return respostaPrivadaJson({ ok: false, code: "invalid_json", error: "JSON inválido." }, 400)
  }
  const parsed = editarCartaoBodySchema.safeParse(raw)
  if (!parsed.success) {
    return respostaPrivadaJson({ ok: false, code: "validation_error", error: "Payload inválido." }, 422)
  }
  const authRes = await requireGestorMoneyApiContext(parsed.data.seletor, "edit")
  if (!authRes.ok) return authRes.response

  try {
    const res = await editarCartaoReal(
      authRes.contexto,
      parsed.data.payload as Parameters<typeof editarCartaoReal>[1]
    )
    return respostaPrivadaJson(
      {
        ok: true,
        feedback: res.feedback,
        resumoLimite: res.resumoLimite,
        eventoLimite: res.eventoLimite,
      },
      200
    )
  } catch (error) {
    const mapped = mapearErroIntegracaoReal(error)
    return respostaPrivadaJson({ ok: false, code: mapped.code, error: mapped.message }, mapped.status)
  }
}
