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
import { separarSmart, persistirSmartSeparado } from "@/lib/importador-avancado/smart-genius/orquestrar"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const maxDuration = 120

// ── Auth helper ──────────────────────────────────────────────────────────────

async function requireSubscription(_req: NextRequest) {
  // NextAuth v5 primeiro
  try {
    const session = await auth()
    if (session?.user) return { ok: true as const, userLabel: session.user.email ?? session.user.name ?? "" }
  } catch { /* fora de contexto — cai no fallback */ }

  // Fallback: cookie legacy
  const sub = await getVerifiedSubscriptionFromCookies()
  if (!sub || !sub.ok) return { ok: false as const, res: NextResponse.json({ error: "forbidden" }, { status: 403 }) }
  const now = await getTrustedTimeMs()
  if (isVencimentoExpired(now, sub.vencimento)) {
    return { ok: false as const, res: NextResponse.json({ error: "subscription_expired" }, { status: 402 }) }
  }
  return { ok: true as const, userLabel: "" }
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

  // ── Fase 1.5: adaptador Smart Genius (clientes / contas a receber) ───────
  // Intercepta SOMENTE os dois relatórios Smart Genius desta entrega; os demais
  // arquivos seguem 100% pelo fluxo genérico (Gestão Clique etc. inalterados).
  let sep
  try {
    sep = await separarSmart(arquivos)
  } catch (e) {
    return NextResponse.json(
      { error: "Falha ao analisar arquivos Smart Genius", detalhe: e instanceof Error ? e.message : String(e) },
      { status: 422 }
    )
  }
  // Respeita o filtro de domínios também para os arquivos Smart.
  const smartDetectados =
    dominiosFiltro.length > 0
      ? sep.detectados.filter((d) => dominiosFiltro.includes(d.dominio as DominioImport))
      : sep.detectados
  const temSmart = smartDetectados.length > 0

  // ── Fase 2: parse genérico (apenas dos arquivos NÃO-Smart) ───────────────
  let planilhas
  try {
    planilhas = await parsearArquivos(sep.restantes)
  } catch (e) {
    return NextResponse.json(
      { error: "Falha ao parsear arquivos", detalhe: e instanceof Error ? e.message : String(e) },
      { status: 422 }
    )
  }

  if (planilhas.length === 0 && !temSmart) {
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

  // Anexa as detecções Smart no MESMO formato (confiança 1 — banner explícito).
  for (const d of smartDetectados) {
    deteccao.push({
      arquivo: d.arquivo,
      dominio: d.dominio as DominioImport,
      label: d.label,
      confianca: 1,
      totalLinhas: d.totalLinhas,
      headers: [],
    })
  }

  const totaisDetectados: Record<string, number> = {}
  for (const [dom, regs] of grupos) {
    totaisDetectados[dom] = regs.length
  }
  // Smart entra na contagem por domínio (clientes = nº de clientes;
  // contas_receber = nº de títulos previstos, não de linhas).
  for (const d of smartDetectados) {
    const prev = d.dominio === "contas_receber" ? (d.titulosPrevistos ?? 0) : d.validos
    totaisDetectados[d.dominio] = (totaisDetectados[d.dominio] ?? 0) + prev
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

  // Persiste os arquivos Smart (respeitando o filtro de domínios).
  let smartAgg: Awaited<ReturnType<typeof persistirSmartSeparado>> | null = null
  if (temSmart) {
    try {
      const sepFiltrada =
        dominiosFiltro.length > 0
          ? {
              detectados: smartDetectados,
              clientes: dominiosFiltro.includes("clientes" as DominioImport) ? sep.clientes : [],
              contas: dominiosFiltro.includes("contas_receber" as DominioImport) ? sep.contas : [],
              restantes: sep.restantes,
            }
          : sep
      smartAgg = await persistirSmartSeparado(storeId, sepFiltrada)
    } catch (e) {
      return NextResponse.json(
        { error: "Falha ao persistir importação Smart Genius", detalhe: e instanceof Error ? e.message : String(e) },
        { status: 500 }
      )
    }
  }

  // Totais finais = genérico + Smart (Smart não passa pelo `resultado.log`).
  const totaisFinais = {
    criados: resultado.criados + (smartAgg?.totais.criados ?? 0),
    atualizados: resultado.atualizados + (smartAgg?.totais.atualizados ?? 0),
    ignorados: resultado.ignorados + (smartAgg?.totais.ignorados ?? 0),
    erros: resultado.erros + (smartAgg?.totais.erros ?? 0),
    duracaoMs: resultado.duracaoMs,
  }
  const okFinal = resultado.ok && (smartAgg?.totais.erros ?? 0) === 0

  // Agrupa erros por domínio para facilitar diagnóstico no cliente
  const errosDetalhados = resultado.log
    .filter((l) => l.acao === "erro")
    .slice(0, 50)
    .map((l) => ({ dominio: l.dominio as string, chave: l.chave, detalhe: l.detalhe }))
  if (smartAgg) errosDetalhados.push(...smartAgg.errosDetalhados.slice(0, 50))

  const porDominio: Record<string, { criados: number; atualizados: number; erros: number }> = {}
  for (const entry of resultado.log) {
    if (!porDominio[entry.dominio]) porDominio[entry.dominio] = { criados: 0, atualizados: 0, erros: 0 }
    if (entry.acao === "criado") porDominio[entry.dominio]!.criados++
    else if (entry.acao === "atualizado") porDominio[entry.dominio]!.atualizados++
    else if (entry.acao === "erro") porDominio[entry.dominio]!.erros++
  }
  if (smartAgg) {
    for (const [dom, t] of Object.entries(smartAgg.porDominio)) {
      const slot = (porDominio[dom] ??= { criados: 0, atualizados: 0, erros: 0 })
      slot.criados += t.criados
      slot.atualizados += t.atualizados
      slot.erros += t.erros
    }
  }

  // ── Auditoria: registra batch para a aba Histórico do Importação HUB ────
  // Não interrompe o fluxo se o log falhar (best-effort). Usa o modelo
  // LogsAuditoria já existente — nenhum schema novo.
  try {
    const partes = Object.entries(porDominio)
      .map(([dom, t]) => `${labelDominio(dom as DominioImport)}: ${t.criados + t.atualizados}`)
      .slice(0, 6)
      .join(" · ")
    const detalhe =
      `${totaisFinais.criados} criados · ${totaisFinais.atualizados} atualizados · ${totaisFinais.ignorados} ignorados · ${totaisFinais.erros} erros` +
      (partes ? ` — ${partes}` : "")
    const userLabel = (authResult.userLabel && authResult.userLabel.trim()) || "Importador Avançado"
    await prisma.logsAuditoria.create({
      data: {
        action: okFinal ? "import.planilha" : "import.planilha.erro",
        userLabel: userLabel.slice(0, 500),
        detail: detalhe.slice(0, 4000),
        source: "importador_avancado",
        metadata: JSON.stringify({
          batchId,
          storeId,
          duracaoMs: totaisFinais.duracaoMs,
          totais: {
            criados: totaisFinais.criados,
            atualizados: totaisFinais.atualizados,
            ignorados: totaisFinais.ignorados,
            erros: totaisFinais.erros,
          },
          porDominio,
          arquivos: deteccao.map((d) => ({ arquivo: d.arquivo, dominio: d.dominio, confianca: d.confianca, totalLinhas: d.totalLinhas })),
        }).slice(0, 8000),
      },
    })
  } catch (e) {
    console.error("[api/import/advanced] falha ao registrar auditoria:", e instanceof Error ? e.message : String(e))
  }

  return NextResponse.json({
    batchId,
    modo: "importar",
    ok: okFinal,
    planilhasDetectadas: deteccao,
    totais: totaisFinais,
    porDominio,
    errosDetalhados,
  })
}
