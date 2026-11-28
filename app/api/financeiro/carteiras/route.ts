import { gestorMoneyAtivo } from "@/lib/gastos/ativacao"
import { GET as getLegadoMain } from "@/lib/financeiro/legado-main/rotas/carteiras"
import { requireModuleApi } from "@/lib/auth/module-access"
import { erroConsultaFinanceira } from "@/lib/gastos/query"
import { consultarFinanceiroEmpresa, reaisConsulta, diaNoFusoConsulta } from "@/lib/gastos/query"
import { apiGuardLeituraFinanceira, respostaFinanceiraPrivada } from "@/lib/gastos/read-scope"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import {
  listarCarteiras,
  criarCarteira,
  TIPOS_CARTEIRA,
} from "@/lib/financeiro/services/carteiras-service"
import { apiGuardEnterpriseOrOps } from "@/lib/auth/api-enterprise-guard"
import { opsLojaIdFromRequest, opsLojaIdFromRequestForWrite } from "@/lib/ops-api-gate"
import { auth } from "@/auth"
import { extractAuditoriaActor, logAuditoriaFinanceira } from "@/lib/financeiro/services/auditoria-actor"

function err(msg: string, code: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg, code }, { status })
}

// ─── GET /api/financeiro/carteiras ───────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Ativação controlada: desligado, a rota é a da main (consulta limitada ao período, tolerante ao legado).
  if (!gestorMoneyAtivo()) return respostaFinanceiraPrivada(await getLegadoMain(req as never))
  const moduleDenied = await requireModuleApi(req, "finance")
  if (moduleDenied) return moduleDenied

  const storeId = opsLojaIdFromRequest(req)
  if (!storeId) return respostaFinanceiraPrivada(err("Loja não identificada.", "STORE_REQUIRED", 400))
  const denied = await apiGuardLeituraFinanceira(storeId, undefined, req)
  if (denied) return respostaFinanceiraPrivada(denied)
  const apenasAtivas = req.nextUrl.searchParams.get("ativas") === "1"

  try {
    const q=await consultarFinanceiroEmpresa(storeId,{dataInicio:"1900-01-01",dataFim:diaNoFusoConsulta(new Date())})
    const carteiras=q.contas.filter(c=>!apenasAtivas||c.ativo).map(c=>({...c,storeId,saldoAtual:reaisConsulta(c.saldoCentavos),saldoInicial:reaisConsulta(c.saldoInicialCentavos)}))
    return respostaFinanceiraPrivada(NextResponse.json({ok:true,carteiras,saldoTotal:reaisConsulta(q.saldoCentavos),apuracao:{asOf:q.asOf,base:q.base,versaoCalculo:q.versaoCalculo,criterios:q.criterios,semCarteira:q.semCarteira}}))
  } catch (e) {
    const erro=erroConsultaFinanceira(e)
    return respostaFinanceiraPrivada(NextResponse.json(erro.body,{status:erro.status}))
  }
}

// ─── POST /api/financeiro/carteiras ──────────────────────────────────────────

const postSchema = z.object({
  nome: z.string().min(1).max(80),
  tipo: z.enum(TIPOS_CARTEIRA).optional().default("caixa"),
  saldoInicial: z.number().min(0).optional().default(0),
  cor: z.string().optional(),
  icone: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const moduleDenied = await requireModuleApi(req, "finance")
  if (moduleDenied) return moduleDenied

  const storeId = opsLojaIdFromRequestForWrite(req)
  if (!storeId) return err("Loja não identificada.", "STORE_REQUIRED", 400)
  const denied = await apiGuardEnterpriseOrOps(
    storeId,
    (p) => p.financeiro.edit,
    "Sem permissão para criar carteiras.",
    { errorBody: "okFalse" },
  )
  if (denied) return denied

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return err("Body inválido.", "INVALID_BODY")
  }

  const parsed = postSchema.safeParse(body)
  if (!parsed.success) {
    return err(parsed.error.errors[0]?.message ?? "Dados inválidos.", "VALIDATION_ERROR")
  }

  const duplicada = await prisma.carteiraFinanceira.findFirst({
    where: { storeId, nome: parsed.data.nome.trim() },
  })
  if (duplicada) {
    return err(`Já existe uma carteira com o nome "${parsed.data.nome}".`, "DUPLICATE_NAME", 409)
  }

  try {
    const carteira = await criarCarteira({ storeId, ...parsed.data })
    void logAuditoriaFinanceira({
      storeId, entidade: "carteira", entidadeId: carteira.id, acao: "criar",
      actor: extractAuditoriaActor(await auth(), req),
      depois: { nome: carteira.nome, tipo: carteira.tipo, saldoInicial: carteira.saldoInicial },
    })
    return NextResponse.json({ ok: true, carteira }, { status: 201 })
  } catch (e) {
    console.error("[POST /api/financeiro/carteiras]", e)
    return err("Erro ao criar carteira.", "INTERNAL_ERROR", 500)
  }
}
