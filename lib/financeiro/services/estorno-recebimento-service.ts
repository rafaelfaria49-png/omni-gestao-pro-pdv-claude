/**
 * Estorno de recebimento de Conta a Receber — GOAL FINANCEIRO-ESTORNO-RECEBIMENTOS-P1-001.
 *
 * UMA transação, sob a trava do título (`SELECT … FOR UPDATE`):
 *  1. ledger do título (`estornarContaReceber`) — o `estorno_pagamento` com
 *     `refHistoricoIndex` é a identidade do estorno e a trava contra estorno duplicado;
 *  2. `MovimentacaoFinanceira` de saída com o valor EXATO do pagamento estornado;
 *  3. compensação no Caixa: `CaixaOperacao(estorno_recebimento_cr)` na MESMA sessão (aberta)
 *     em que o pagamento entrou, referenciando a operação original.
 * Ou tudo grava, ou nada.
 *
 * Fail-closed (nada é gravado, a resposta diz por quê):
 *  - sessão do pagamento já FECHADA: não há contrato de compensação retroativa;
 *  - não dá para saber com segurança QUAL entrada de caixa é a do pagamento (legado sem
 *    identidade) ou o ledger do título é ambíguo.
 * Nenhum valor é inferido de descrição ou nome — só de campos gravados.
 */
import { prisma } from "@/lib/prisma"
import type { ContaReceberTitulo, Prisma } from "@/generated/prisma"
import {
  buildContaReceberAuditTrail,
  estornarContaReceber,
  getContaReceberById,
  getContaReceberByLocalKey,
  pagamentosAtivosDoHistorico,
  sumPagamentosFromHistoricoPayload,
  travarTituloContaReceber,
  type EstornoContaReceberModo,
  type PagamentoAtivoHistorico,
} from "@/lib/financeiro/services/contas-receber-service"
import { estornarMovimentacaoDePagamentoReceber } from "@/lib/financeiro/services/movimentacoes-service"

type Tx = Prisma.TransactionClient

const EPS = 0.009
/** Transação curta (pgBouncer em modo transação). Mesmos limites dos writers de pagamento. */
const TX_ESTORNO = { maxWait: 5_000, timeout: 15_000 } as const

function money(n: unknown): number {
  const v = typeof n === "number" ? n : parseFloat(String(n ?? "0"))
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0
}

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : ""
}

// ─── localização da entrada de caixa do pagamento (puro) ─────────────────────

export type OperacaoCaixaTitulo = {
  id: string
  sessaoId: string
  sessaoStatus: string
  tipo: string
  valor: number
  at: Date
  payload: unknown
}

export type EntradaCaixaDoPagamento =
  | { kind: "sem_caixa" }
  /** Uma ou mais entradas (V3 dividido por forma: N operações com a mesma identidade). */
  | { kind: "encontrada"; parcelas: Array<{ operacao: OperacaoCaixaTitulo; valor: number }> }
  | { kind: "ambigua"; motivo: string }

/** Valor que a operação de caixa atribui a ESTE título (lote: o item dele). */
function valorDoTitulo(op: OperacaoCaixaTitulo, tituloId: string): number {
  const itens = rec(op.payload).itens
  if (Array.isArray(itens)) {
    const item = itens.find((i) => str(rec(i).tituloId) === tituloId)
    return item ? money(rec(item).valor) : 0
  }
  return money(op.valor)
}

/** Identidade explícita gravada na operação de caixa que liga a ESTE pagamento. */
function ligadaPorIdentidade(op: OperacaoCaixaTitulo, pag: PagamentoAtivoHistorico): boolean {
  const p = rec(op.payload)
  if (typeof p.historicoIndex === "number") return p.historicoIndex === pag.index
  if (!pag.loteId) return false
  return (
    str(p.idempotencyKey) === pag.loteId ||
    str(p.operacaoId) === pag.loteId ||
    str(p.localId).endsWith(`:${pag.loteId}`)
  )
}

function temIdentidade(op: OperacaoCaixaTitulo): boolean {
  const p = rec(op.payload)
  return typeof p.historicoIndex === "number" || Array.isArray(p.itens)
}

/**
 * Qual `recebimento_cr` corresponde a este pagamento?
 *
 *  1. identidade gravada (`historicoIndex`, ou `loteId` do ledger = chave da operação). Se
 *     a mesma identidade aparece em N operações (V3 dividido por forma), elas valem juntas
 *     SÓ se a soma livre bate com o pagamento;
 *  2. legado sem identidade: casa por valor SÓ quando o número de entradas de caixa livres
 *     com aquele valor é igual ao de pagamentos ativos com aquele valor e elas são
 *     economicamente intercambiáveis (mesma sessão, forma e origem);
 *  3. entrada de caixa legada livre que nenhum pagamento ativo explica (valor diferente de
 *     todos) torna o título ambíguo — não se presume que o pagamento ficou fora do caixa.
 * `jaPlanejado` (modo título completo): valor de cada operação já reservado a outro
 * pagamento nesta mesma chamada + pagamentos já planejados — nada é usado duas vezes.
 */
export function localizarEntradaCaixaDoPagamento(input: {
  tituloId: string
  pagamento: PagamentoAtivoHistorico
  ativos: PagamentoAtivoHistorico[]
  operacoes: OperacaoCaixaTitulo[]
  jaPlanejado?: { operacoes: Map<string, number>; pagamentos: Set<number> }
}): EntradaCaixaDoPagamento {
  const { tituloId, pagamento, ativos, operacoes } = input
  const planejadoOps = input.jaPlanejado?.operacoes ?? new Map<string, number>()
  const planejadoPags = input.jaPlanejado?.pagamentos ?? new Set<number>()
  const recebimentos = operacoes.filter((o) => o.tipo === "recebimento_cr")
  const estornos = operacoes.filter((o) => o.tipo === "estorno_recebimento_cr")

  const compensado = new Map<string, number>()
  let estornosSemReferencia = 0
  for (const e of estornos) {
    const ref = str(rec(e.payload).refCaixaOperacaoId)
    if (!ref) {
      estornosSemReferencia += 1
      continue
    }
    compensado.set(ref, money((compensado.get(ref) ?? 0) + money(e.valor)))
  }
  const livre = (op: OperacaoCaixaTitulo) =>
    money(valorDoTitulo(op, tituloId) - (compensado.get(op.id) ?? 0) - (planejadoOps.get(op.id) ?? 0))

  const porIdentidade = recebimentos.filter((o) => ligadaPorIdentidade(o, pagamento))
  if (porIdentidade.length > 0) {
    if (porIdentidade.length === 1) {
      const op = porIdentidade[0]!
      if (livre(op) + EPS < pagamento.valor) return { kind: "ambigua", motivo: "entrada_de_caixa_ja_compensada" }
      return { kind: "encontrada", parcelas: [{ operacao: op, valor: pagamento.valor }] }
    }
    const soma = money(porIdentidade.reduce((s, o) => s + livre(o), 0))
    if (Math.abs(soma - pagamento.valor) > EPS || porIdentidade.some((o) => livre(o) <= EPS)) {
      return { kind: "ambigua", motivo: "entradas_com_a_mesma_identidade_nao_somam_o_pagamento" }
    }
    return { kind: "encontrada", parcelas: porIdentidade.map((o) => ({ operacao: o, valor: livre(o) })) }
  }

  // Legado: só operações SEM identidade, livres e não reclamadas por outro pagamento ativo.
  const reclamadas = new Set<string>()
  for (const a of ativos) for (const o of recebimentos) if (ligadaPorIdentidade(o, a)) reclamadas.add(o.id)
  const livres = recebimentos.filter((o) => !reclamadas.has(o.id) && livre(o) > EPS)
  if (livres.length > 0 && estornosSemReferencia > 0) return { kind: "ambigua", motivo: "estorno_de_caixa_legado_sem_referencia" }
  const candidatas = livres.filter((o) => !temIdentidade(o) && Math.abs(livre(o) - pagamento.valor) <= EPS)
  if (candidatas.length === 0) {
    // Legado Operações V3 (misto dividido por forma, antes do `loteId` no ledger): UMA operação
    // = N entradas com o MESMO `operacaoId`. Vale só se for o único grupo, numa sessão, cuja
    // soma livre é exatamente este pagamento, e o único pagamento ativo candidato a ele.
    const grupos = new Map<string, OperacaoCaixaTitulo[]>()
    for (const o of livres) {
      const k = str(rec(o.payload).operacaoId)
      if (k && !temIdentidade(o)) grupos.set(k, [...(grupos.get(k) ?? []), o])
    }
    const gruposDoValor = [...grupos.values()].filter(
      (g) =>
        g.length > 1 &&
        new Set(g.map((o) => o.sessaoId)).size === 1 &&
        Math.abs(money(g.reduce((s, o) => s + livre(o), 0)) - pagamento.valor) <= EPS,
    )
    const paresDoGrupo = ativos.filter(
      (a) =>
        !planejadoPags.has(a.index) &&
        Math.abs(a.valor - pagamento.valor) <= EPS &&
        !recebimentos.some((o) => ligadaPorIdentidade(o, a)),
    )
    if (gruposDoValor.length === 1 && paresDoGrupo.length === 1) {
      return { kind: "encontrada", parcelas: gruposDoValor[0]!.map((o) => ({ operacao: o, valor: livre(o) })) }
    }
    const semExplicacao = livres.filter((o) => !ativos.some((a) => Math.abs(a.valor - livre(o)) <= EPS))
    if (semExplicacao.length > 0) return { kind: "ambigua", motivo: "entrada_de_caixa_sem_pagamento_correspondente" }
    return { kind: "sem_caixa" }
  }

  const pares = ativos.filter(
    (a) =>
      !planejadoPags.has(a.index) &&
      Math.abs(a.valor - pagamento.valor) <= EPS &&
      !recebimentos.some((o) => ligadaPorIdentidade(o, a)),
  )
  if (candidatas.length !== pares.length) return { kind: "ambigua", motivo: "entradas_de_caixa_sem_identidade" }
  const chave = (o: OperacaoCaixaTitulo) =>
    `${o.sessaoId}|${str(rec(o.payload).formaPagamento).toLowerCase()}|${str(rec(o.payload).origem)}`
  if (new Set(candidatas.map(chave)).size !== 1) return { kind: "ambigua", motivo: "entradas_de_caixa_sem_identidade" }
  const escolhida = [...candidatas].sort((a, b) => b.at.getTime() - a.at.getTime())[0]!
  return { kind: "encontrada", parcelas: [{ operacao: escolhida, valor: pagamento.valor }] }
}

// ─── serviço ─────────────────────────────────────────────────────────────────

export type EstornoRecebimentoErro =
  | "not_found"
  | "titulo_cancelado"
  | "sem_pagamento_para_estornar"
  | "pagamento_nao_encontrado"
  | "pagamento_ja_estornado"
  | "historico_ambiguo"
  | "caixa_sessao_fechada"
  | "caixa_identidade_insuficiente"
  | "titulo_alterado"

export class EstornoRecebimentoError extends Error {
  constructor(
    readonly code: EstornoRecebimentoErro,
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = "EstornoRecebimentoError"
  }
}

const MENSAGENS: Record<EstornoRecebimentoErro, [string, number]> = {
  not_found: ["Título não encontrado nesta loja.", 404],
  titulo_cancelado: ["Título cancelado: não há recebimento para estornar.", 422],
  sem_pagamento_para_estornar: ["Não há pagamento ativo para estornar neste título.", 422],
  pagamento_nao_encontrado: ["O pagamento indicado não existe neste título.", 404],
  pagamento_ja_estornado: ["Este pagamento já foi estornado. Nada foi alterado.", 409],
  historico_ambiguo: [
    "O histórico deste título tem estornos sem identificação do pagamento. Estorno bloqueado: requer conciliação manual.",
    409,
  ],
  caixa_sessao_fechada: [
    "Este pagamento entrou num caixa que já foi fechado. O estorno não altera sessões fechadas: registre a devolução no caixa atual (sangria/devolução) e ajuste o fechamento pelo procedimento de conciliação.",
    409,
  ],
  caixa_identidade_insuficiente: [
    "Não foi possível identificar com segurança a entrada de caixa deste pagamento (lançamento antigo sem vínculo). Estorno bloqueado para não deixar Financeiro e Caixa divergentes.",
    409,
  ],
  titulo_alterado: ["O título foi alterado por outra operação. Atualize e tente de novo.", 409],
}

function falha(code: EstornoRecebimentoErro): never {
  const [msg, status] = MENSAGENS[code]
  throw new EstornoRecebimentoError(code, msg, status)
}

export type EstornoRecebimentoInput = {
  storeId: string
  id?: string
  localKey?: string
  modo: EstornoContaReceberModo
  /** Só `ultimo_pagamento`: estorna exatamente este pagamento (índice no `historico`). */
  pagamentoIndex?: number
  /**
   * Pré-condição de concorrência: o total líquido recebido que o operador VIU ao pedir o
   * estorno. Diferente do atual ⇒ `titulo_alterado` sem escrita. Impede que um retry (ou
   * um 2º clique) depois de um estorno já gravado reverta OUTRO pagamento.
   */
  recebidoEsperado?: number
  motivo?: string
  userLabel?: string
}

export type EstornoRecebimentoResultado = {
  titulo: ContaReceberTitulo
  /** true = título já estava estornado (modo título); nada foi gravado agora. */
  jaEstornado: boolean
  pagamentos: Array<{
    pagamentoIndex: number
    valor: number
    caixa: Array<{ sessaoId: string; operacaoId: string; compensacaoId: string; valor: number }>
  }>
  valorEstornado: number
  movimentacao: { valor: number; divergente: boolean }
}

/** Entradas e compensações de caixa ligadas ao título (lote incluído). Exportada para o estorno da OS V3. */
export async function lerOperacoesCaixaDoTitulo(tx: Tx, storeId: string, titulo: { id: string; localKey: string | null }): Promise<OperacaoCaixaTitulo[]> {
  const rows = await tx.$queryRaw<Array<OperacaoCaixaTitulo & { valor: number | string }>>`
    SELECT o."id", o."sessaoId", s."status"::text AS "sessaoStatus", o."tipo", o."valor", o."at", o."payload"
    FROM "caixa_operacoes" o
    JOIN "sessoes_caixa" s ON s."id" = o."sessaoId" AND s."storeId" = o."storeId"
    WHERE o."storeId" = ${storeId}
      AND o."tipo" IN ('recebimento_cr', 'estorno_recebimento_cr')
      AND (
        o."payload"->>'tituloId' = ${titulo.id}
        OR (${titulo.localKey ?? ""} <> '' AND o."payload"->>'localKey' = ${titulo.localKey ?? ""})
        OR o."payload"->'itens' @> jsonb_build_array(jsonb_build_object('tituloId', ${titulo.id}::text))
      )
  `
  return rows.map((r) => ({ ...r, valor: money(r.valor) }))
}

async function travarSessaoParaCompensar(tx: Tx, storeId: string, sessaoId: string): Promise<string | null> {
  // FOR SHARE: o fechamento do caixa (UPDATE) espera esta transação; outros recebimentos
  // na mesma sessão não esperam (mesmo padrão de `travarSessaoCaixa` da Operações V3).
  const rows = await tx.$queryRaw<Array<{ status: string }>>`
    SELECT "status"::text AS status FROM "sessoes_caixa"
    WHERE "id" = ${sessaoId} AND "storeId" = ${storeId}
    FOR SHARE
  `
  return rows[0]?.status ?? null
}

/** Deadlock / conflito de serialização: a outra operação venceu — nada aqui foi gravado. */
function ehConflitoDeConcorrencia(e: unknown): boolean {
  const r = rec(e)
  const meta = rec(r.meta)
  const texto = `${str(r.code)} ${str(meta.code)} ${e instanceof Error ? e.message : ""}`
  return /P2034|40P01|40001|deadlock/i.test(texto)
}

export async function estornarRecebimentoContaReceber(input: EstornoRecebimentoInput): Promise<EstornoRecebimentoResultado> {
  try {
    return await executarEstorno(input)
  } catch (e) {
    if (!(e instanceof EstornoRecebimentoError) && ehConflitoDeConcorrencia(e)) falha("titulo_alterado")
    throw e
  }
}

async function executarEstorno(input: EstornoRecebimentoInput): Promise<EstornoRecebimentoResultado> {
  const storeId = str(input.storeId)
  if (!storeId) throw new Error("estorno-recebimento: storeId é obrigatório")

  return prisma.$transaction(async (tx) => {
    // Ordem de travas = a dos recebimentos (o lote trava a SESSÃO e depois grava o título):
    // sessões de caixa do título (FOR SHARE) ANTES da trava do título. A leitura prévia, sem
    // trava, só descobre quais sessões; tudo é relido depois da trava do título.
    const previa = input.id
      ? await getContaReceberById(storeId, input.id, tx)
      : input.localKey
        ? await getContaReceberByLocalKey(storeId, input.localKey, tx)
        : null
    if (!previa) falha("not_found")
    const sessaoStatus = new Map<string, string | null>()
    const travarSessao = async (sessaoId: string) => {
      if (!sessaoStatus.has(sessaoId)) sessaoStatus.set(sessaoId, await travarSessaoParaCompensar(tx, storeId, sessaoId))
      return sessaoStatus.get(sessaoId) ?? null
    }
    const sessoesPrevias = [...new Set((await lerOperacoesCaixaDoTitulo(tx, storeId, previa)).map((o) => o.sessaoId))].sort()
    for (const s of sessoesPrevias) await travarSessao(s)

    if (!(await travarTituloContaReceber(tx, storeId, { id: previa.id }))) falha("not_found")
    const lido = await getContaReceberById(storeId, previa.id, tx)
    if (!lido) falha("not_found")
    const titulo: ContaReceberTitulo = lido

    const status = String(titulo.status ?? "").toLowerCase()
    if (status === "cancelado") falha("titulo_cancelado")
    if (status === "estornado") {
      return { titulo, jaEstornado: true, pagamentos: [], valorEstornado: 0, movimentacao: { valor: 0, divergente: false } }
    }

    const historico = rec(titulo.payload).historico
    const ledger = pagamentosAtivosDoHistorico(historico)
    if (ledger.ambiguo) falha("historico_ambiguo")

    // Pagamentos alvo — o mesmo critério que `estornarContaReceber` aplicará a seguir.
    let alvos: PagamentoAtivoHistorico[]
    if (input.modo === "titulo_completo") {
      alvos = ledger.ativos
    } else if (input.pagamentoIndex !== undefined) {
      if (ledger.estornados.has(input.pagamentoIndex)) falha("pagamento_ja_estornado")
      const alvo = ledger.ativos.find((a) => a.index === input.pagamentoIndex)
      if (!alvo) falha("pagamento_nao_encontrado")
      alvos = [alvo]
    } else {
      const ultimo = ledger.ativos[ledger.ativos.length - 1]
      if (!ultimo) falha("sem_pagamento_para_estornar")
      alvos = [ultimo]
    }

    // Mesma fórmula que o Financeiro HUB exibe (valor − saldo em aberto da trilha).
    if (input.recebidoEsperado !== undefined) {
      const saldo = buildContaReceberAuditTrail([titulo])[0]?.saldoAberto ?? 0
      const recebidoAtual = money(Math.max(0, money(titulo.valor) - saldo))
      if (Math.abs(recebidoAtual - money(input.recebidoEsperado)) > EPS) falha("titulo_alterado")
    }

    // Caixa: decide TUDO antes de escrever qualquer coisa (relido sob a trava do título).
    const operacoes = alvos.length > 0 ? await lerOperacoesCaixaDoTitulo(tx, storeId, titulo) : []
    const jaPlanejado = { operacoes: new Map<string, number>(), pagamentos: new Set<number>() }
    const planos = alvos.map((pagamento) => {
      const caixa = localizarEntradaCaixaDoPagamento({ tituloId: titulo.id, pagamento, ativos: ledger.ativos, operacoes, jaPlanejado })
      if (caixa.kind === "encontrada") {
        for (const p of caixa.parcelas) {
          jaPlanejado.operacoes.set(p.operacao.id, money((jaPlanejado.operacoes.get(p.operacao.id) ?? 0) + p.valor))
        }
      }
      jaPlanejado.pagamentos.add(pagamento.index)
      return { pagamento, caixa }
    })
    for (const p of planos) {
      if (p.caixa.kind === "ambigua") falha("caixa_identidade_insuficiente")
    }
    for (const p of planos) {
      if (p.caixa.kind !== "encontrada") continue
      for (const parcela of p.caixa.parcelas) {
        if ((await travarSessao(parcela.operacao.sessaoId)) !== "ABERTA") falha("caixa_sessao_fechada")
      }
    }

    // 1. Ledger do título.
    const res = await estornarContaReceber({
      storeId,
      id: titulo.id,
      modo: input.modo,
      ...(input.modo === "ultimo_pagamento" ? { pagamentoIndex: alvos[0]!.index } : {}),
      motivo: input.motivo,
      userLabel: input.userLabel,
      db: tx,
    })
    if (!res.ok) {
      const code = res.reason as EstornoRecebimentoErro
      falha(code in MENSAGENS ? code : "titulo_alterado")
    }
    const valorEstornado = money(alvos.reduce((s, a) => s + a.valor, 0))

    // 2. Movimentação financeira — valor exato, reconciliado com o ledger.
    const recebidoRestante = input.modo === "titulo_completo" ? 0 : sumPagamentosFromHistoricoPayload(res.data.payload)
    const mov =
      valorEstornado > EPS
        ? await estornarMovimentacaoDePagamentoReceber(tx, {
            storeId,
            tituloId: titulo.id,
            valor: valorEstornado,
            recebidoRestante,
          })
        : { valor: 0, divergente: false }

    // 3. Caixa — compensação na sessão de origem (aberta), com referência à operação original.
    const pagamentos: EstornoRecebimentoResultado["pagamentos"] = []
    for (const p of planos) {
      const caixa: EstornoRecebimentoResultado["pagamentos"][number]["caixa"] = []
      if (p.caixa.kind === "encontrada") {
        for (const parcela of p.caixa.parcelas) {
          const orig = rec(parcela.operacao.payload)
          const forma = str(orig.formaPagamento).toLowerCase()
          const origem = str(orig.origem)
          const localIdOrig = str(orig.localId) || `rc:${storeId}:${parcela.operacao.id}`
          const comp = await tx.caixaOperacao.create({
            data: {
              sessaoId: parcela.operacao.sessaoId,
              storeId,
              tipo: "estorno_recebimento_cr",
              valor: parcela.valor,
              motivo: `Estorno de recebimento — ${titulo.cliente || titulo.descricao}${input.motivo ? ` — ${input.motivo}` : ""}`.slice(0, 240),
              operador: str(input.userLabel),
              payload: {
                localId: `${localIdOrig}:estorno:${titulo.id}:${p.pagamento.index}`,
                ...(origem ? { origem } : {}),
                estornoVia: "financeiro",
                ...(forma ? { formaPagamento: forma } : {}),
                tituloId: titulo.id,
                ...(titulo.localKey ? { localKey: titulo.localKey } : {}),
                refCaixaOperacaoId: parcela.operacao.id,
                historicoIndex: p.pagamento.index,
              } as Prisma.InputJsonValue,
            },
            select: { id: true },
          })
          caixa.push({ sessaoId: parcela.operacao.sessaoId, operacaoId: parcela.operacao.id, compensacaoId: comp.id, valor: parcela.valor })
        }
      }
      pagamentos.push({ pagamentoIndex: p.pagamento.index, valor: p.pagamento.valor, caixa })
    }

    return { titulo: res.data, jaEstornado: false, pagamentos, valorEstornado, movimentacao: mov }
  }, TX_ESTORNO)
}
