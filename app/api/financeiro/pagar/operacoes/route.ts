import { NextResponse } from "next/server"
import { requireModuleApi } from "@/lib/auth/module-access"
import { z } from "zod"
import { storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"
import { apiGuardFinanceiroEditEnterpriseOrLegacy } from "@/lib/auth/api-enterprise-guard"
import { respostaFinanceiraPrivada } from "@/lib/gastos/read-scope"
import { aplicarOperacaoGasto } from "@/lib/gastos/apply"
import { cancelarRevisaoGasto, contextoEmpresaOperacao, corrigirRevisaoGasto, prepararRevisaoGasto } from "@/lib/gastos/operacoes"
import { identificadorOperacao, chaveOperacao, instante, normalizarPropostaGasto, OperacaoGastoError } from "@/lib/gastos/operacao-schema"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0
const revisao = { revisaoId: identificadorOperacao, versaoEsperada: z.number().int().positive() }
const schema = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("preparar"), grupoChave: identificadorOperacao, proposta: z.unknown(), expiraEm: instante.optional() }).strict(),
  z.object({ acao: z.literal("corrigir"), ...revisao, proposta: z.unknown(), expiraEm: instante.optional() }).strict(),
  z.object({ acao: z.literal("cancelar"), ...revisao }).strict(),
  z.object({ acao: z.literal("confirmar"), ...revisao, chave: chaveOperacao }).strict(),
])
const responder = (body: unknown, status = 200) => respostaFinanceiraPrivada(NextResponse.json(body, { status }))

/** Exclusivamente EMPRESA; o body não seleciona perfil, owner ou autoridade. */
export async function POST(req: Request) {
  // Reconciliação main: toda rota financeira exige o módulo finance contratado para a loja.
  const moduleDenied = await requireModuleApi(req, "finance")
  if (moduleDenied) return respostaFinanceiraPrivada(moduleDenied)
  const storeId = storeIdFromAssistecRequestForWrite(req)
  if (!storeId) return responder({ ok: false, code: "store_missing" }, 400)
  const denied = await apiGuardFinanceiroEditEnterpriseOrLegacy(storeId)
  if (denied) return respostaFinanceiraPrivada(denied)
  let raw: unknown
  try { raw = await req.json() } catch { return responder({ ok: false, code: "invalid_json" }, 400) }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) return responder({ ok: false, code: "validation_error" }, 422)
  try {
    const ctx = await contextoEmpresaOperacao(storeId), { acao, ...input } = parsed.data
    if ("proposta" in input && normalizarPropostaGasto(input.proposta).tipo === "ESTORNAR_LEGADO") {
      throw new OperacaoGastoError("proposta_invalida")
    }
    const resultado = acao === "preparar" ? await prepararRevisaoGasto(ctx, input)
      : acao === "corrigir" ? await corrigirRevisaoGasto(ctx, input)
        : acao === "cancelar" ? await cancelarRevisaoGasto(ctx, input) : await aplicarOperacaoGasto(ctx, input)
    return responder({ ok: true, resultado })
  } catch (e) {
    if (e instanceof OperacaoGastoError) return responder({ ok: false, code: e.code, error: e.message }, e.status)
    return responder({ ok: false, code: "db_error", error: "Não foi possível confirmar a operação. Reenvie a mesma identidade." }, 503)
  }
}
