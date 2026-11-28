import { requireModuleApi } from "@/lib/auth/module-access"
/**
 * /api/financeiro/receber
 *
 * GET    → lista títulos  (storeId por header)
 * GET    → ?localKey=<k>  detalhe + payload.historico
 * POST   → cria título manual
 * PATCH  → op: liquidar | parcial | estornar | cancelar
 * DELETE → cancelamento seguro (não destrói dados)
 */
import { apiGuardLeituraFinanceira, respostaFinanceiraPrivada } from "@/lib/gastos/read-scope"
import { leituraEmpresaWhere } from "@/lib/gastos/read-scope"
import { NextResponse } from "next/server"
import { z } from "zod"
import { prismaEnsureConnected, prisma } from "@/lib/prisma"
import { opsLojaIdFromRequest } from "@/lib/ops-api-gate"
import { storeIdFromAssistecRequestForWrite } from "@/lib/store-id-from-request"
import { auth } from "@/auth"
import { getOperatorLabelFromSession } from "@/lib/auth/session-operator"
import { extractAuditoriaActor, logAuditoriaFinanceira } from "@/lib/financeiro/services/auditoria-actor"
import { apiGuardFinanceiroEditEnterpriseOrLegacy } from "@/lib/auth/api-enterprise-guard"
import {
  buildContaReceberAuditTrail,
  buildContaReceberSummary,
  cancelContaReceber,
  getContaReceberByLocalKey,
  upsertContaReceber,
} from "@/lib/financeiro/services"
import { isRecebimentoLoteError, validarRecebimentoLote } from "@/lib/financeiro/services/recebimento-lote-service"
import { executarRecebimentoFinanceiro, operacaoJaRegistrada } from "@/lib/financeiro/services/recebimento-financeiro-service"
import {
  EstornoRecebimentoError,
  estornarRecebimentoContaReceber,
} from "@/lib/financeiro/services/estorno-recebimento-service"
import { verificarPeriodoFechado } from "@/lib/financeiro/services/fechamento-service"
import { registrarRecebimentoCrSeCaixaAberto } from "@/lib/caixa/recebimento-cr-caixa"
import { mapearNomesAmbiguos } from "@/lib/contas-receber-cliente-match"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

// ─── helpers ──────────────────────────────────────────────────────────────────

function err(error: string, code: string, status = 400) {
  return NextResponse.json({ ok: false, error, code }, { status })
}

function readSid(req: Request, forWrite = false): string | null {
  return forWrite
    ? storeIdFromAssistecRequestForWrite(req)
    : opsLojaIdFromRequest(req)
}

type HistEntry = { at?: string; tipo?: string; userLabel?: string; valor?: number; observacao?: string; formaPagamento?: string }

function parseHistorico(payload: unknown): HistEntry[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return []
  const hist = (payload as Record<string, unknown>).historico
  if (!Array.isArray(hist)) return []
  return hist.filter((e) => e && typeof e === "object") as HistEntry[]
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const postSchema = z.object({
  lojaId: z.string().min(1).max(120).optional(),
  descricao: z.string().min(1, "Descrição obrigatória").max(240),
  cliente: z.string().min(1, "Cliente obrigatório").max(240),
  valor: z.number({ required_error: "Valor obrigatório" }).finite().nonnegative("Valor deve ser ≥ 0"),
  vencimento: z.string().min(1, "Vencimento obrigatório").max(32),
  observacao: z.string().max(2000).optional(),
  /** Metadados opcionais — gravados no `payload` (não há colunas dedicadas no Prisma). */
  origem: z.enum(["manual", "venda", "os", "crediario", "ajuste"]).optional(),
  numeroDocumento: z.string().max(120).optional(),
  competencia: z.string().max(32).optional(),
  formaPagamento: z.string().max(80).optional(),
  carteiraId: z.string().max(120).optional(),
})

const patchSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("liquidar"),
    lojaId: z.string().max(120).optional(),
    localKey: z.string().min(1).max(260),
    observacao: z.string().max(2000).optional(),
    formaPagamento: z.string().max(80).optional(),
    /** Identidade da operação: retry com a MESMA chave devolve o resultado gravado (sem 2ª baixa). */
    idempotencyKey: z.string().min(1).max(160).optional(),
    /** Saldo em aberto que o operador viu. Diferente do atual = 409 sem escrita. */
    saldoEsperado: z.number().finite().nonnegative().max(1e12).optional(),
  }),
  z.object({
    op: z.literal("parcial"),
    lojaId: z.string().max(120).optional(),
    localKey: z.string().min(1).max(260),
    valor: z.number().finite().positive("Valor deve ser positivo"),
    observacao: z.string().max(2000).optional(),
    formaPagamento: z.string().max(80).optional(),
    idempotencyKey: z.string().min(1).max(160).optional(),
    saldoEsperado: z.number().finite().nonnegative().max(1e12).optional(),
  }),
  z.object({
    op: z.literal("estornar"),
    lojaId: z.string().max(120).optional(),
    localKey: z.string().min(1).max(260),
    modo: z.enum(["titulo_completo", "ultimo_pagamento"]),
    motivo: z.string().max(2000).optional(),
    /** Identidade do pagamento (índice no `historico`). Retry do mesmo índice = 409 sem escrita. */
    pagamentoIndex: z.number().int().nonnegative().max(100_000).optional(),
    /** Recebido que o operador viu. Diferente do atual = 409 sem escrita (retry seguro). */
    recebidoEsperado: z.number().finite().nonnegative().max(1e12).optional(),
  }),
  z.object({
    op: z.literal("cancelar"),
    lojaId: z.string().max(120).optional(),
    localKey: z.string().min(1).max(260),
    motivo: z.string().max(2000).optional(),
  }),
  // Espelho da baixa no caixa operacional: cria CaixaOperacao(recebimento_cr) na
  // sessão aberta para que o recebimento entre no fechamento. Usado pela tela
  // Financeiro → Contas a Receber, que baixa o título no cliente (localStorage)
  // e depois sincroniza a gaveta via esta op. Idempotente por `movimentoId`.
  z.object({
    op: z.literal("vincular-caixa"),
    lojaId: z.string().max(120).optional(),
    valor: z.number().finite().positive().max(1e12),
    formaPagamento: z.string().max(80).optional(),
    movimentoId: z.string().min(1).max(200),
    tituloId: z.string().max(200).optional(),
    localKey: z.string().max(260).optional(),
    cliente: z.string().max(240).optional(),
    descricao: z.string().max(240).optional(),
    sessaoId: z.string().max(120).optional(),
    terminalId: z.string().max(120).optional(),
  }),
])

const deleteQuerySchema = z.object({
  localKey: z.string().min(1).max(260),
  motivo: z.string().max(2000).optional(),
})

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const moduleDenied = await requireModuleApi(req, "finance")
  if (moduleDenied) return moduleDenied

  const storeId = readSid(req)
  if (!storeId) return respostaFinanceiraPrivada(err("Unidade obrigatória", "store_missing", 400))
  const denied = await apiGuardLeituraFinanceira(storeId, undefined, req)
  if (denied) return respostaFinanceiraPrivada(denied)

  const url = new URL(req.url)
  const localKeyParam = url.searchParams.get("localKey")?.trim()

  try {
    await prismaEnsureConnected()

    // Detalhe de um título específico
    if (localKeyParam) {
      const titulo = await prisma.contaReceberTitulo.findUnique({
        where: { ...leituraEmpresaWhere(storeId, {}), storeId_localKey: { storeId, localKey: localKeyParam } },
      })
      if (!titulo) return respostaFinanceiraPrivada(err("Título não encontrado", "not_found", 404))
      return respostaFinanceiraPrivada(NextResponse.json({
        ok: true,
        titulo: {
          id: titulo.id,
          localKey: titulo.localKey,
          descricao: titulo.descricao,
          cliente: titulo.cliente,
          valor: titulo.valor,
          vencimento: titulo.vencimento,
          status: titulo.status,
          historico: parseHistorico(titulo.payload),
        },
      }))
    }

    // Lista paginada
    const titulos = await prisma.contaReceberTitulo.findMany({
      where: leituraEmpresaWhere(storeId, { storeId }),
      orderBy: { updatedAt: "desc" },
    })

    const rows = titulos.map((t) => {
      const pl = (t.payload as Record<string, unknown> | null) ?? null
      const parcelaObj = pl && typeof pl === "object" ? (pl.parcela as Record<string, unknown> | undefined) : undefined
      const numero = typeof parcelaObj?.numero === "number" ? parcelaObj.numero : null
      const total = typeof parcelaObj?.total === "number" ? parcelaObj.total : null
      const parcelaLabel = numero && total ? `${numero}/${total}` : null
      const clienteIdRaw = pl && typeof pl.clienteId === "string" ? pl.clienteId.trim() : ""
      return {
        id: (t.localKey?.trim() || t.id) as string,
        descricao: t.descricao,
        cliente: t.cliente,
        valor: t.valor,
        vencimento: t.vencimento,
        status: t.status,
        parcela: parcelaLabel,
        /** `Cliente.id` gravado pela origem (`payload.clienteId`) — identidade segura p/ agrupar. */
        ...(clienteIdRaw ? { clienteId: clienteIdRaw } : {}),
      }
    })

    // Nomes com 2+ cadastros na loja: o HUB não junta títulos só pelo nome nesses casos.
    const clientesLoja = await prisma.cliente.findMany({ where: { storeId }, select: { id: true, name: true } })
    const nomesAmbiguos = Array.from(mapearNomesAmbiguos(clientesLoja))
    return respostaFinanceiraPrivada(NextResponse.json({
      ok: true,
      rows,
      nomesAmbiguos,
      summary: buildContaReceberSummary(titulos),
      audit: buildContaReceberAuditTrail(titulos),
      metadata: { source: "server", storeId, generatedAt: new Date().toISOString() },
    }))
  } catch {
    return respostaFinanceiraPrivada(NextResponse.json({ ok: false, error: "Não foi possível consultar os dados financeiros." }, { status: 503 }))
  }
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const moduleDenied = await requireModuleApi(req, "finance")
  if (moduleDenied) return moduleDenied

  let json: unknown
  try { json = await req.json() } catch {
    return err("JSON inválido", "invalid_json", 400)
  }

  const parsed = postSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Dados inválidos", code: "validation_error", issues: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const storeId = readSid(req, true)
  if (!storeId) return err("Unidade obrigatória (x-assistec-loja-id)", "store_missing", 400)
  if (parsed.data.lojaId && parsed.data.lojaId !== storeId) {
    return err("storeId inconsistente (body vs header)", "store_mismatch", 400)
  }

  const deniedPostCr = await apiGuardFinanceiroEditEnterpriseOrLegacy(storeId)
  if (deniedPostCr) return deniedPostCr

  try {
    await prismaEnsureConnected()
    const uuid = crypto.randomUUID()
    const localKey = `receber:manual:${storeId}:${uuid}`
    const titulo = await upsertContaReceber({
      storeId,
      localKey,
      descricao: parsed.data.descricao,
      cliente: parsed.data.cliente,
      valor: parsed.data.valor,
      vencimento: parsed.data.vencimento,
      status: "pendente",
      payloadPatch: {
        origem: parsed.data.origem ?? "manual",
        referencia: `CR manual ${uuid}`,
        createdFrom: "financeiro_hub",
        ...(parsed.data.observacao ? { observacoes: parsed.data.observacao } : {}),
        ...(parsed.data.numeroDocumento ? { numeroDocumento: parsed.data.numeroDocumento } : {}),
        ...(parsed.data.competencia ? { competencia: parsed.data.competencia } : {}),
        ...(parsed.data.formaPagamento ? { formaPagamento: parsed.data.formaPagamento } : {}),
        ...(parsed.data.carteiraId ? { carteiraId: parsed.data.carteiraId } : {}),
      },
    })
    void logAuditoriaFinanceira({
      storeId, entidade: "receber", entidadeId: titulo.id, acao: "criar",
      actor: extractAuditoriaActor(await auth(), req),
      depois: { localKey, descricao: titulo.descricao, cliente: titulo.cliente, valor: titulo.valor, vencimento: titulo.vencimento },
    })
    return NextResponse.json({ ok: true, id: titulo.id, localKey }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha interna"
    console.error("[financeiro/receber POST]", msg)
    return err(msg, "db_error", 503)
  }
}

// ─── PATCH ────────────────────────────────────────────────────────────────────

export async function PATCH(req: Request) {
  const moduleDenied = await requireModuleApi(req, "finance")
  if (moduleDenied) return moduleDenied

  let json: unknown
  try { json = await req.json() } catch {
    return err("JSON inválido", "invalid_json", 400)
  }

  const parsed = patchSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Dados inválidos", code: "validation_error", issues: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const storeId = readSid(req, true)
  if (!storeId) return err("Unidade obrigatória (x-assistec-loja-id)", "store_missing", 400)
  if (parsed.data.lojaId && parsed.data.lojaId !== storeId) {
    return err("storeId inconsistente (body vs header)", "store_mismatch", 400)
  }

  const deniedPatchCr = await apiGuardFinanceiroEditEnterpriseOrLegacy(storeId)
  if (deniedPatchCr) return deniedPatchCr

  const session = await auth()
  const userLabel = getOperatorLabelFromSession(session)
  const actor = extractAuditoriaActor(session, req)

  try {
    await prismaEnsureConnected()

    // Bloqueio de período fechado para operações de mutação. O retry de uma baixa JÁ gravada
    // (mesma idempotencyKey) segue para o replay, que não escreve — igual ao `receber-lote`.
    if (["liquidar", "parcial", "estornar"].includes(parsed.data.op)) {
      const lock = await verificarPeriodoFechado(storeId, new Date())
      const chaveReplay =
        (parsed.data.op === "liquidar" || parsed.data.op === "parcial") && parsed.data.idempotencyKey?.trim()
          ? parsed.data.idempotencyKey.trim()
          : ""
      if (lock.fechado && !(chaveReplay && (await operacaoJaRegistrada(prisma, storeId, chaveReplay)))) {
        return err(
          "Período financeiro fechado. Reabra o fechamento para alterar lançamentos.",
          "periodo_fechado",
          409,
        )
      }
    }

    if (parsed.data.op === "vincular-caixa") {
      // Espelho da baixa no caixa operacional. NÃO finge sucesso: se não houver
      // sessão aberta, retorna vinculadoCaixa=false para a UI avisar que a baixa
      // ficou só no financeiro (não entrou na gaveta/fechamento).
      const r = await registrarRecebimentoCrSeCaixaAberto({
        storeId,
        valor: parsed.data.valor,
        formaPagamento: parsed.data.formaPagamento,
        origem: "financeiro",
        tituloId: parsed.data.tituloId,
        localKey: parsed.data.localKey,
        cliente: parsed.data.cliente,
        descricao: parsed.data.descricao,
        operador: userLabel,
        idempotencyKey: parsed.data.movimentoId,
        sessaoId: parsed.data.sessaoId,
        terminalId: parsed.data.terminalId,
      })
      if (r.vinculado) {
        return NextResponse.json({
          ok: true,
          op: "vincular-caixa",
          vinculadoCaixa: true,
          sessaoId: r.sessaoId,
          jaRegistrado: r.jaRegistrado,
        })
      }
      return NextResponse.json({
        ok: true,
        op: "vincular-caixa",
        vinculadoCaixa: false,
        motivo: r.motivo,
      })
    }

    if (parsed.data.op === "liquidar" || parsed.data.op === "parcial") {
      // Mesmo motor do `POST /api/financeiro/receber-lote` (1 título): título + histórico +
      // movimentação + carteira numa ÚNICA transação — antes a movimentação era gravada
      // depois, fora da transação, e uma falha nela era só logada (baixa sem entrada).
      //  - com `idempotencyKey` (+ `saldoEsperado`): retry/clique duplo = replay sem 2ª baixa;
      //  - sem chave (legado): chave gerada aqui — atômico, mas sem proteção de retry.
      const d = parsed.data
      const op = d.op
      const chaveCliente = d.idempotencyKey?.trim() ?? ""
      if (chaveCliente && d.saldoEsperado === undefined) {
        return err("saldoEsperado é obrigatório junto com idempotencyKey", `${op}_saldo_esperado_obrigatorio`, 400)
      }
      let saldoEsperado = d.saldoEsperado
      if (saldoEsperado === undefined) {
        const atual = await getContaReceberByLocalKey(storeId, d.localKey)
        if (!atual) return err("not_found", `${op}_not_found`, 422)
        saldoEsperado = buildContaReceberAuditTrail([atual])[0]?.saldoAberto ?? 0
        if (op === "liquidar" && !(saldoEsperado > 0.009)) return err("ja_pago", "liquidar_ja_pago", 422)
      }
      const chave = chaveCliente || `fin-patch-${crypto.randomUUID()}`
      const validacao = validarRecebimentoLote({
        idempotencyKey: chave,
        itens: [{ localKey: d.localKey, saldoEsperado, valorReceber: op === "parcial" ? d.valor : saldoEsperado }],
      })
      if (!validacao.ok) return err(validacao.mensagem, `${op}_${validacao.code}`, 400)
      let outcome: Awaited<ReturnType<typeof executarRecebimentoFinanceiro>>
      try {
        outcome = await prisma.$transaction(
          (tx) =>
            executarRecebimentoFinanceiro(
              tx,
              {
                storeId,
                formaPagamento: d.formaPagamento?.trim() ?? "",
                observacao: d.observacao,
                idempotencyKey: chave,
                userLabel,
              },
              validacao.itens,
            ),
          { maxWait: 5_000, timeout: 15_000 },
        )
      } catch (e) {
        if (isRecebimentoLoteError(e)) {
          return NextResponse.json({ ok: false, error: e.message, code: `${op}_${e.code}`, detalhes: e.detalhes }, { status: e.status })
        }
        throw e
      }
      const item = outcome.itens[0]
      if (!outcome.jaRegistrado && item) {
        void logAuditoriaFinanceira({
          storeId, entidade: "receber", entidadeId: item.tituloId, acao: "liquidar", actor,
          depois: {
            localKey: d.localKey, valor: item.valorRecebido, ...(op === "parcial" ? { parcial: true } : {}),
            saldoDepois: item.saldoDepois, operacao: outcome.operacaoId,
            ...(d.formaPagamento ? { formaPagamento: d.formaPagamento } : {}),
          },
        })
      }
      return NextResponse.json({
        ok: true,
        op,
        jaRegistrado: outcome.jaRegistrado,
        operacaoId: outcome.operacaoId,
        valorRecebido: item?.valorRecebido ?? 0,
        saldoDepois: item?.saldoDepois ?? 0,
        statusFinal: item?.statusFinal ?? null,
      })
    }

    if (parsed.data.op === "estornar") {
      // Ledger + movimentação (valor exato do pagamento) + compensação no Caixa numa única
      // transação. Recusa = nada gravado; a mensagem diz por quê.
      let r: Awaited<ReturnType<typeof estornarRecebimentoContaReceber>>
      try {
        r = await estornarRecebimentoContaReceber({
          storeId,
          localKey: parsed.data.localKey,
          modo: parsed.data.modo,
          pagamentoIndex: parsed.data.pagamentoIndex,
          recebidoEsperado: parsed.data.recebidoEsperado,
          motivo: parsed.data.motivo,
          userLabel,
        })
      } catch (e) {
        if (e instanceof EstornoRecebimentoError) return err(e.message, `estornar_${e.code}`, e.status)
        throw e
      }
      if (!r.jaEstornado) {
        void logAuditoriaFinanceira({
          storeId, entidade: "receber", entidadeId: r.titulo.id, acao: "estornar", actor,
          depois: {
            localKey: parsed.data.localKey, modo: parsed.data.modo, motivo: parsed.data.motivo,
            valorEstornado: r.valorEstornado, pagamentos: r.pagamentos, movimentacao: r.movimentacao,
          },
        })
      }
      return NextResponse.json({
        ok: true,
        op: "estornar",
        jaEstornado: r.jaEstornado,
        valorEstornado: r.valorEstornado,
        pagamentos: r.pagamentos,
      })
    }

    // cancelar — não gera movimentação nova
    const res = await cancelContaReceber({ storeId, localKey: parsed.data.localKey, motivo: parsed.data.motivo, userLabel })
    if (!res.ok) return err(res.reason, `cancelar_${res.reason}`, 422)
    void logAuditoriaFinanceira({
      storeId, entidade: "receber", entidadeId: res.data.id, acao: "cancelar", actor,
      depois: { localKey: parsed.data.localKey, motivo: parsed.data.motivo },
    })
    return NextResponse.json({ ok: true, op: "cancelar" })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha interna"
    console.error("[financeiro/receber PATCH]", msg)
    return err(msg, "db_error", 503)
  }
}

// ─── DELETE ───────────────────────────────────────────────────────────────────
// Cancelamento seguro — não destrói dados, apenas muda status para "cancelado".

export async function DELETE(req: Request) {
  const moduleDenied = await requireModuleApi(req, "finance")
  if (moduleDenied) return moduleDenied

  const storeId = readSid(req, true)
  if (!storeId) return err("Unidade obrigatória (x-assistec-loja-id)", "store_missing", 400)

  const url = new URL(req.url)
  const localKeyParam = url.searchParams.get("localKey")?.trim()
  const motivoParam = url.searchParams.get("motivo")?.trim()

  const body = deleteQuerySchema.safeParse({
    localKey: localKeyParam,
    motivo: motivoParam || undefined,
  })
  if (!body.success) return err("localKey obrigatório via query ?localKey=", "missing_localKey", 400)

  const deniedDelCr = await apiGuardFinanceiroEditEnterpriseOrLegacy(storeId)
  if (deniedDelCr) return deniedDelCr

  const sessionDel = await auth()
  const userLabelDel = getOperatorLabelFromSession(sessionDel)
  const actorDel = extractAuditoriaActor(sessionDel, req)

  try {
    await prismaEnsureConnected()
    const res = await cancelContaReceber({ storeId, localKey: body.data.localKey, motivo: body.data.motivo, userLabel: userLabelDel })
    if (!res.ok) return err(res.reason, `cancel_${res.reason}`, 422)
    void logAuditoriaFinanceira({
      storeId, entidade: "receber", entidadeId: res.data.id, acao: "cancelar", actor: actorDel,
      depois: { localKey: body.data.localKey, motivo: body.data.motivo, via: "DELETE" },
    })
    return NextResponse.json({ ok: true, action: "cancelled" })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha interna"
    console.error("[financeiro/receber DELETE]", msg)
    return err(msg, "db_error", 503)
  }
}
