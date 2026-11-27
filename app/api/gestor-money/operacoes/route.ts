import { z } from "zod"
import {
  requireGestorMoneyApiContext,
  respostaPrivadaJson,
  seletorPerfilApiSchema,
} from "@/lib/gestor-money/server/auth-boundary"
import {
  executarRevisaoExplicitaG004,
  mapearErroIntegracaoReal,
  pagarDividaReal,
  pagarFaturaReal,
  registrarCompraCartaoReal,
  registrarDespesaReal,
  registrarDividaReal,
  registrarReceitaReal,
  transferirReal,
} from "@/lib/gestor-money/server/operations-adapter"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const envelopeSchema = z
  .object({
    seletor: seletorPerfilApiSchema,
    chave: z.string().trim().min(1).max(160).optional(),
    operacao: z.enum([
      "despesa",
      "receita",
      "divida",
      "pagar_divida",
      "transferir",
      "compra_cartao",
      "pagar_fatura",
      "revisao",
    ]),
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

  const parsed = envelopeSchema.safeParse(raw)
  if (!parsed.success) {
    return respostaPrivadaJson(
      {
        ok: false,
        code: "validation_error",
        error: parsed.error.issues[0]?.message ?? "Envelope de operação inválido.",
      },
      422
    )
  }

  const { seletor, chave, operacao, payload } = parsed.data
  const authRes = await requireGestorMoneyApiContext(seletor, "edit")
  if (!authRes.ok) return authRes.response

  try {
    const ctx = authRes.contexto
    if (operacao === "revisao") {
      const resultado = await executarRevisaoExplicitaG004(ctx, payload as Parameters<typeof executarRevisaoExplicitaG004>[1])
      return respostaPrivadaJson({ ok: true, resultado }, 200)
    }

    const feedback =
      operacao === "despesa"
        ? await registrarDespesaReal(ctx, payload as Parameters<typeof registrarDespesaReal>[1], chave)
        : operacao === "receita"
          ? await registrarReceitaReal(ctx, payload as Parameters<typeof registrarReceitaReal>[1], chave)
          : operacao === "divida"
            ? await registrarDividaReal(ctx, payload as Parameters<typeof registrarDividaReal>[1], chave)
            : operacao === "pagar_divida"
              ? await pagarDividaReal(ctx, payload as Parameters<typeof pagarDividaReal>[1], chave)
              : operacao === "transferir"
                ? await transferirReal(ctx, payload as Parameters<typeof transferirReal>[1], chave)
                : operacao === "compra_cartao"
                  ? await registrarCompraCartaoReal(ctx, payload as Parameters<typeof registrarCompraCartaoReal>[1], chave)
                  : await pagarFaturaReal(ctx, payload as Parameters<typeof pagarFaturaReal>[1], chave)

    return respostaPrivadaJson({ ok: true, feedback }, 200)
  } catch (error) {
    const mapped = mapearErroIntegracaoReal(error)
    return respostaPrivadaJson(
      { ok: false, code: mapped.code, error: mapped.message },
      mapped.status
    )
  }
}
