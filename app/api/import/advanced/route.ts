import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { getVerifiedSubscriptionFromCookies } from "@/lib/api-auth"
import { isVencimentoExpired } from "@/lib/subscription-seal"
import { getTrustedTimeMs } from "@/lib/trusted-time"
import { storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"
import { parsearArquivos } from "@/lib/importador-avancado/parser"
import { agruparEMerge, labelDominio } from "@/lib/importador-avancado"
import { persistirImportacao } from "@/lib/importador-avancado/persistidor"
import type { DominioImport } from "@/lib/importador-avancado/types"

export const runtime = "nodejs"
export const maxDuration = 120

// ── Auth helper ──────────────────────────────────────────────────────────────

async function requireSubscription(_req: NextRequest) {
  // NextAuth v5 primeiro
  try {
    const session = await auth()
    if (session?.user) return { ok: true as const }
  } catch { /* fora de contexto — cai no fallback */ }

  // Fallback: cookie legacy
  const sub = await getVerifiedSubscriptionFromCookies()
  if (!sub || !sub.ok) return { ok: false as const, res: NextResponse.json({ error: "forbidden" }, { status: 403 }) }
  const now = await getTrustedTimeMs()
  if (isVencimentoExpired(now, sub.vencimento)) {
    return { ok: false as const, res: NextResponse.json({ error: "subscription_expired" }, { status: 402 }) }
  }
  return { ok: true as const }
}

// ── GET: capabilities ────────────────────────────────────────────────────────

export async function GET() {
  return NextResponse.json({
    versao: "1.0",
    formatos: ["xlsx", "xls", "csv", "tsv", "zip"],
    dominios: [
      "clientes", "fornecedores", "produtos", "servicos_catalogo",
      "ordens_servicos", "vendas", "contas_pagar", "contas_receber",
    ] satisfies DominioImport[],
    sistemas: ["GestãoClick", "Bling", "TinyERP", "genérico (xlsx/csv)"],
    limites: {
      maxArquivos: 20,
      maxTamanhoMB: 50,
      maxLinhasPorArquivo: 100_000,
    },
  })
}

// ── POST: parse → detect → merge → preview | importar ───────────────────────

export async function POST(req: NextRequest) {
  const authResult = await requireSubscription(req)
  if (!authResult.ok) return authResult.res

  const storeId = storeIdFromAssistecRequestForWrite(req)
  if (!storeId) return NextResponse.json({ error: "storeId ausente" }, { status: 400 })

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: "FormData inválido" }, { status: 400 })
  }

  const modoQuery = req.nextUrl.searchParams.get("modo")
  const modoForm = formData.get("modo") as string | null
  const modo = modoQuery ?? modoForm ?? "preview"
  const dominiosFiltro = (formData.getAll("dominios") as string[]).filter(Boolean) as DominioImport[]
  const batchId = `adv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

  // ── Fase 1: coleta arquivos ──────────────────────────────────────────────
  const arquivosRaw = formData.getAll("arquivos[]") as File[]
  if (arquivosRaw.length === 0) {
    return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 })
  }
  if (arquivosRaw.length > 20) {
    return NextResponse.json({ error: "Máximo de 20 arquivos por importação" }, { status: 400 })
  }

  const arquivos: Array<{ buffer: Buffer; nome: string }> = []
  for (const file of arquivosRaw) {
    const arrayBuffer = await file.arrayBuffer()
    arquivos.push({ buffer: Buffer.from(arrayBuffer), nome: file.name })
  }

  // ── Fase 2: parse ────────────────────────────────────────────────────────
  let planilhas
  try {
    planilhas = await parsearArquivos(arquivos)
  } catch (e) {
    return NextResponse.json(
      { error: "Falha ao parsear arquivos", detalhe: e instanceof Error ? e.message : String(e) },
      { status: 422 }
    )
  }

  if (planilhas.length === 0) {
    return NextResponse.json({ error: "Nenhuma planilha válida encontrada nos arquivos enviados" }, { status: 422 })
  }

  // ── Fase 3: detect + merge ───────────────────────────────────────────────
  const grupos = agruparEMerge(planilhas)

  // Aplica filtro de domínios se informado
  if (dominiosFiltro.length > 0) {
    for (const dom of [...grupos.keys()]) {
      if (!dominiosFiltro.includes(dom)) grupos.delete(dom)
    }
  }

  // Sumário de detecção (útil em ambos os modos)
  const deteccao = planilhas.map((p) => ({
    arquivo: p.nomeArquivo,
    dominio: p.dominio,
    label: labelDominio(p.dominio),
    confianca: p.confianca,
    totalLinhas: p.totalLinhas,
    headers: p.headers.slice(0, 20),
  }))

  const totaisDetectados: Record<string, number> = {}
  for (const [dom, regs] of grupos) {
    totaisDetectados[dom] = regs.length
  }

  // ── Modo preview: retorna detecção sem persistir ─────────────────────────
  if (modo === "preview") {
    return NextResponse.json({
      batchId,
      modo: "preview",
      planilhasDetectadas: deteccao,
      grupos: totaisDetectados,
      dominiosParaImportar: Object.keys(totaisDetectados),
    })
  }

  // ── Modo importar: persiste ──────────────────────────────────────────────
  let resultado
  try {
    resultado = await persistirImportacao(storeId, grupos, batchId)
  } catch (e) {
    return NextResponse.json(
      { error: "Falha ao persistir importação", detalhe: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }

  // Agrupa erros por domínio para facilitar diagnóstico no cliente
  const errosDetalhados = resultado.log
    .filter((l) => l.acao === "erro")
    .slice(0, 50)
    .map((l) => ({ dominio: l.dominio, chave: l.chave, detalhe: l.detalhe }))

  const porDominio: Record<string, { criados: number; atualizados: number; erros: number }> = {}
  for (const entry of resultado.log) {
    if (!porDominio[entry.dominio]) porDominio[entry.dominio] = { criados: 0, atualizados: 0, erros: 0 }
    if (entry.acao === "criado") porDominio[entry.dominio]!.criados++
    else if (entry.acao === "atualizado") porDominio[entry.dominio]!.atualizados++
    else if (entry.acao === "erro") porDominio[entry.dominio]!.erros++
  }

  return NextResponse.json({
    batchId,
    modo: "importar",
    ok: resultado.ok,
    planilhasDetectadas: deteccao,
    totais: {
      criados: resultado.criados,
      atualizados: resultado.atualizados,
      ignorados: resultado.ignorados,
      erros: resultado.erros,
      duracaoMs: resultado.duracaoMs,
    },
    porDominio,
    errosDetalhados,
  })
}
