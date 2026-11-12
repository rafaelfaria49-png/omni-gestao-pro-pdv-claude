/**
 * Recebimento de Contas a Receber pelo Financeiro HUB (`/dashboard/financeiro-v2`).
 *
 * Um ou N títulos do MESMO cliente numa única transação: título + histórico +
 * `MovimentacaoFinanceira` por título + recálculo de carteira. Ou tudo grava, ou nada.
 *
 * Substitui, na tela do HUB, o laço de N `PATCH /api/financeiro/receber` (não atômico:
 * a 3ª baixa falhava e as 2 primeiras ficavam gravadas) e a baixa singular sem chave de
 * idempotência (clique duplo / retry após resposta perdida = segunda baixa).
 *
 * Idempotência: a chave da operação é carimbada como `loteId` em cada entrada do
 * histórico. Sob advisory lock na mesma chave, o retry acha a entrada e devolve o MESMO
 * resultado sem regravar (`jaRegistrado: true`).
 *
 * Caixa: o Financeiro HUB nunca lançou na gaveta (não há sessão de caixa neste fluxo) —
 * comportamento preservado. Recebimento com lançamento no caixa é o do PDV (F5/F9).
 */
import type { Prisma } from "@/generated/prisma"
import { PAY_EPS, safeMoney } from "@/lib/financeiro/contracts/valores"
import { RECEBER_STATUS, normalizeReceberStatus } from "@/lib/financeiro/contracts/status"
import {
  buildContaReceberAuditTrail,
  liquidarContaReceber,
  registrarPagamentoParcial,
} from "@/lib/financeiro/services/contas-receber-service"
import { createMovimentacaoEntradaFromReceber } from "@/lib/financeiro/services/movimentacoes-service"
import { recalcularSaldoCarteira } from "@/lib/financeiro/services/carteiras-service"
import {
  RecebimentoLoteError,
  recebimentoLoteAdvisoryLock,
  type RecebimentoLoteDetalhe,
  type RecebimentoLoteItemNormalizado,
} from "@/lib/financeiro/services/recebimento-lote-service"
import { mapearNomesAmbiguos, normalizeNomeCliente } from "@/lib/contas-receber-cliente-match"
import { pagamentosDoLedger } from "@/lib/financeiro/recibo-recebimento"

type Tx = Prisma.TransactionClient

export type RecebimentoFinanceiroInput = {
  storeId: string
  formaPagamento: string
  observacao?: string
  idempotencyKey: string
  userLabel: string
}

export type RecebimentoFinanceiroItem = {
  tituloId: string
  localKey: string
  descricao: string
  saldoAntes: number
  valorRecebido: number
  saldoDepois: number
  statusFinal: string
}

export type RecebimentoFinanceiroResultado = {
  jaRegistrado: boolean
  operacaoId: string
  recebidoEm: string
  cliente: string
  formaPagamento: string
  totalRecebido: number
  itens: RecebimentoFinanceiroItem[]
  /**
   * Saldo total do cliente na loja DEPOIS da operação, só quando a identidade é um
   * `Cliente.id` estável (`payload.clienteId`). `null` = não dá para afirmar sem
   * aproximar nomes; o comprovante omite a linha em vez de inventar.
   */
  saldoDevedorCliente: number | null
}

export const RECEBIMENTO_FIN_LOCK_PREFIX = "fin-rc"

/**
 * A operação já está gravada em algum título da loja? Leitura simples (sem lock), usada
 * pela rota para deixar o RETRY de uma operação já registrada responder com o resultado
 * mesmo depois de o período ser fechado — sem isso o operador nunca vê o comprovante do
 * pagamento que aconteceu e tende a cobrar de novo.
 */
export async function operacaoJaRegistrada(db: Pick<Tx, "$queryRaw">, storeId: string, key: string): Promise<boolean> {
  return (await titulosComOperacao(db, storeId, key.trim())).length > 0
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : ""
}

function clienteIdDoPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null
  const v = (payload as Record<string, unknown>).clienteId
  return typeof v === "string" && v.trim() ? v.trim() : null
}

function carteiraIdDoPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null
  const v = (payload as Record<string, unknown>).carteiraId
  return typeof v === "string" && v.trim() ? v.trim() : null
}

type TituloRow = Awaited<ReturnType<Tx["contaReceberTitulo"]["findMany"]>>[number]

/**
 * Identidade única do lote. Nome/documento NÃO são chave financeira — mas misturar
 * dois clientes num comprovante só é exatamente o erro que este guard impede.
 *  - qualquer título com `payload.clienteId` ⇒ TODOS precisam ter o mesmo id;
 *  - nenhum com id ⇒ mesmo nome normalizado e, com 2+ títulos, nome NÃO homônimo na loja.
 */
export function identidadeDoLote(
  titulos: Array<{ payload: unknown; cliente: string; localKey: string | null }>,
  nomeAmbiguo: (nomeNorm: string) => boolean,
): { ok: true; clienteId: string | null; cliente: string } | { ok: false; detalhes: RecebimentoLoteDetalhe[] } {
  const ids = titulos.map((t) => clienteIdDoPayload(t.payload))
  const comId = new Set(ids.filter((x): x is string => !!x))
  if (comId.size > 1 || (comId.size === 1 && ids.some((x) => !x))) {
    return {
      ok: false,
      detalhes: titulos.map((t, i) => ({ localKey: t.localKey ?? "", motivo: ids[i] ? "cliente_divergente" : "titulo_sem_vinculo_cliente" })),
    }
  }
  const nomes = new Set(titulos.map((t) => normalizeNomeCliente(t.cliente)))
  if (comId.size === 0) {
    const [nome] = [...nomes]
    if (nomes.size !== 1 || !nome) {
      return { ok: false, detalhes: titulos.map((t) => ({ localKey: t.localKey ?? "", motivo: "cliente_divergente" })) }
    }
    if (titulos.length > 1 && nomeAmbiguo(nome)) {
      return { ok: false, detalhes: titulos.map((t) => ({ localKey: t.localKey ?? "", motivo: "cliente_homonimo" })) }
    }
  }
  return { ok: true, clienteId: [...comId][0] ?? null, cliente: titulos[0]?.cliente.trim() || "—" }
}

/**
 * Saldo total do cliente na loja pelo `Cliente.id`. Se existir título EM ABERTO com o
 * mesmo nome e SEM vínculo de cadastro (legado), o total por id seria menor do que a
 * dívida real — nesse caso devolve `null` e o comprovante não afirma "saldo devedor".
 */
async function saldoDevedorPorClienteId(tx: Tx, storeId: string, clienteId: string, nomeCliente: string): Promise<number | null> {
  const titulos = await tx.contaReceberTitulo.findMany({
    where: { storeId, payload: { path: ["clienteId"], equals: clienteId } },
  })
  const nome = normalizeNomeCliente(nomeCliente)
  if (nome) {
    const mesmoNome = await tx.contaReceberTitulo.findMany({
      where: { storeId, cliente: { equals: nomeCliente.trim(), mode: "insensitive" } },
    })
    const legadoAberto = mesmoNome.some(
      (t) =>
        !clienteIdDoPayload(t.payload) &&
        normalizeNomeCliente(t.cliente) === nome &&
        (buildContaReceberAuditTrail([t])[0]?.saldoAberto ?? 0) > PAY_EPS,
    )
    if (legadoAberto) return null
  }
  return safeMoney(buildContaReceberAuditTrail(titulos).reduce((s, a) => s + (a.saldoAberto ?? 0), 0))
}

/** Títulos da loja que já têm, no ledger, uma entrada com esta identidade de operação. */
async function titulosComOperacao(tx: Pick<Tx, "$queryRaw">, storeId: string, key: string): Promise<string[]> {
  const filtro = JSON.stringify([{ loteId: key }])
  const rows = await tx.$queryRaw<Array<{ localKey: string | null }>>`
    SELECT "localKey" FROM "contas_receber_titulos"
    WHERE "storeId" = ${storeId} AND "payload"->'historico' @> ${filtro}::jsonb
    LIMIT 60`
  return rows.map((r) => r.localKey ?? "")
}

/** Replay: reconstrói o resultado gravado pela 1ª execução desta chave. */
function resultadoGravado(
  titulos: TituloRow[],
  input: RecebimentoFinanceiroInput,
  itens: RecebimentoLoteItemNormalizado[],
): Omit<RecebimentoFinanceiroResultado, "saldoDevedorCliente"> | null {
  const key = input.idempotencyKey
  const gravados: RecebimentoFinanceiroItem[] = []
  let recebidoEm: string | null = null
  let forma: string | null = null
  for (const t of titulos) {
    const pags = pagamentosDoLedger(t.payload, Number(t.valor) || 0).filter((p) => p.loteId === key)
    if (pags.length === 0) continue
    // Operação estornada depois: o retry NÃO pode devolver "recebido" nem gerar comprovante.
    if (pags.some((p) => p.estornado)) {
      throw new RecebimentoLoteError(
        "titulo_alterado",
        409,
        "Esta operação foi estornada depois de registrada. Atualize a lista antes de receber de novo.",
        [{ localKey: t.localKey ?? t.id, motivo: "operacao_estornada" }],
      )
    }
    const ultimo = pags[pags.length - 1]!
    const valor = safeMoney(pags.reduce((s, p) => s + p.valor, 0))
    recebidoEm = recebidoEm ?? ultimo.at
    forma = forma ?? ultimo.formaPagamento
    gravados.push({
      tituloId: t.id,
      localKey: t.localKey ?? t.id,
      descricao: t.descricao,
      saldoAntes: safeMoney(ultimo.saldoDepois + valor),
      valorRecebido: valor,
      saldoDepois: ultimo.saldoDepois,
      statusFinal: normalizeReceberStatus(t.status) ?? t.status,
    })
  }
  if (gravados.length === 0) return null

  // Mesma chave, pedido diferente (outros títulos/valores) = conflito, nunca replay.
  const pedido = new Map(itens.map((i) => [i.localKey, i.valorReceber]))
  const igual =
    gravados.length === itens.length &&
    gravados.every((g) => pedido.has(g.localKey) && Math.abs((pedido.get(g.localKey) ?? 0) - g.valorRecebido) <= PAY_EPS)
  if (!igual) {
    throw new RecebimentoLoteError(
      "idempotency_conflict",
      409,
      "Esta chave de operação já foi usada para outro recebimento. Recarregue e tente de novo.",
    )
  }
  return {
    jaRegistrado: true,
    operacaoId: key,
    recebidoEm: recebidoEm ?? new Date().toISOString(),
    cliente: titulos.find((t) => t.localKey === gravados[0]!.localKey)?.cliente.trim() || "—",
    formaPagamento: forma ?? input.formaPagamento,
    totalRecebido: safeMoney(gravados.reduce((s, g) => s + g.valorRecebido, 0)),
    itens: gravados,
  }
}

export async function executarRecebimentoFinanceiro(
  tx: Tx,
  input: RecebimentoFinanceiroInput,
  itens: RecebimentoLoteItemNormalizado[],
): Promise<RecebimentoFinanceiroResultado> {
  const { storeId } = input
  const key = input.idempotencyKey.trim()

  // 1. Serializa execuções concorrentes da MESMA operação (clique duplo, retry).
  await recebimentoLoteAdvisoryLock(tx, `${RECEBIMENTO_FIN_LOCK_PREFIX}:${storeId}:${key}`)

  // 2. Carga escopada pela loja: título de outra unidade simplesmente não existe aqui.
  const titulos = await tx.contaReceberTitulo.findMany({
    where: { storeId, localKey: { in: itens.map((i) => i.localKey) } },
  })
  const porLocalKey = new Map(titulos.map((t) => [t.localKey ?? "", t]))

  // 3. Replay ANTES de qualquer escrita.
  // A chave pode já existir em títulos FORA deste pedido (cliente bugado/hostil reusando
  // a chave): replay só vale se a operação gravada for exatamente esta.
  const comOperacao = await titulosComOperacao(tx, storeId, key)
  const pedidas = new Set(itens.map((i) => i.localKey))
  if (comOperacao.some((lk) => !pedidas.has(lk))) {
    throw new RecebimentoLoteError(
      "idempotency_conflict",
      409,
      "Esta chave de operação já foi usada para outro recebimento. Recarregue e tente de novo.",
    )
  }
  const replay = resultadoGravado(titulos, { ...input, idempotencyKey: key }, itens)
  if (replay) {
    const ident = identidadeDoLote(titulos, () => false)
    const saldoDevedorCliente =
      ident.ok && ident.clienteId ? await saldoDevedorPorClienteId(tx, storeId, ident.clienteId, ident.cliente) : null
    return { ...replay, saldoDevedorCliente }
  }

  // 4. Revalidação server-side (mesmas regras do lote do PDV).
  const alterados: RecebimentoLoteDetalhe[] = []
  const divergencias: RecebimentoLoteDetalhe[] = []
  const plano: Array<{ titulo: TituloRow; item: RecebimentoLoteItemNormalizado; saldoReal: number; quita: boolean }> = []
  for (const item of itens) {
    const titulo = porLocalKey.get(item.localKey)
    if (!titulo) {
      alterados.push({ localKey: item.localKey, motivo: "titulo_nao_encontrado" })
      continue
    }
    if (item.tituloId && item.tituloId !== titulo.id) {
      alterados.push({ localKey: item.localKey, motivo: "titulo_id_divergente" })
      continue
    }
    const status = normalizeReceberStatus(titulo.status)
    if (status === RECEBER_STATUS.CANCELADO || status === RECEBER_STATUS.ESTORNADO || status === RECEBER_STATUS.PAGO) {
      alterados.push({ localKey: item.localKey, motivo: `titulo_${status}` })
      continue
    }
    const saldoReal = buildContaReceberAuditTrail([titulo])[0]?.saldoAberto ?? 0
    if (!(saldoReal > PAY_EPS)) {
      alterados.push({ localKey: item.localKey, motivo: "titulo_sem_saldo", saldoReal })
      continue
    }
    if (Math.abs(saldoReal - item.saldoEsperado) > PAY_EPS) {
      divergencias.push({ localKey: item.localKey, motivo: "saldo_esperado_divergente", saldoReal, saldoEsperado: item.saldoEsperado })
      continue
    }
    if (item.valorReceber > saldoReal + PAY_EPS) {
      divergencias.push({ localKey: item.localKey, motivo: "valor_maior_que_saldo", saldoReal, saldoEsperado: item.saldoEsperado })
      continue
    }
    plano.push({ titulo, item, saldoReal, quita: item.valorReceber + PAY_EPS >= saldoReal })
  }
  if (alterados.length > 0) {
    throw new RecebimentoLoteError("titulo_alterado", 409, "Um ou mais títulos mudaram de estado. Recarregue a lista e tente de novo.", alterados)
  }
  if (divergencias.length > 0) {
    throw new RecebimentoLoteError("saldo_divergente", 409, "O saldo de um ou mais títulos mudou. Recarregue a lista e tente de novo.", divergencias)
  }

  // 5. Um comprovante = um cliente. Homônimos só importam sem `clienteId` e com 2+ títulos.
  const titulosPlano = plano.map((p) => p.titulo)
  let ambiguos = new Set<string>()
  if (plano.length > 1 && titulosPlano.every((t) => !clienteIdDoPayload(t.payload))) {
    const clientes = await tx.cliente.findMany({ where: { storeId }, select: { id: true, name: true } })
    ambiguos = mapearNomesAmbiguos(clientes)
  }
  const identFinal = identidadeDoLote(titulosPlano, (n) => ambiguos.has(n))
  if (!identFinal.ok) {
    throw new RecebimentoLoteError(
      "cliente_divergente",
      422,
      "Os títulos selecionados não pertencem comprovadamente ao mesmo cliente. Receba título a título.",
      identFinal.detalhes,
    )
  }

  // 6. Escrita.
  const forma = input.formaPagamento.trim()
  const obsBase = str(input.observacao)
  const observacao = obsBase ? `${obsBase} · Financeiro · ${forma}` : `Recebimento Financeiro · ${forma}`
  const carteirasValidadas = new Map<string, string | null>()
  const carteirasAfetadas = new Set<string>()
  const resultados: RecebimentoFinanceiroItem[] = []
  let recebidoEm: string | null = null

  for (const { titulo, item, saldoReal, quita } of plano) {
    const valorAplicado = quita ? saldoReal : item.valorReceber
    const res = quita
      ? await liquidarContaReceber({
          storeId, id: titulo.id, observacao, formaPagamento: forma, userLabel: input.userLabel,
          loteId: key, tituloSnapshot: titulo, db: tx,
        })
      : await registrarPagamentoParcial({
          storeId, id: titulo.id, valorPago: valorAplicado, observacao, formaPagamento: forma,
          userLabel: input.userLabel, loteId: key, tituloSnapshot: titulo, db: tx,
        })
    if (!res.ok) {
      throw new RecebimentoLoteError("titulo_alterado", 409, "Título recusado na gravação.", [
        { localKey: item.localKey, motivo: res.reason, saldoReal },
      ])
    }

    const candidata = carteiraIdDoPayload(res.data.payload)
    let carteiraId: string | null = null
    if (candidata) {
      if (!carteirasValidadas.has(candidata)) {
        const c = await tx.carteiraFinanceira.findFirst({ where: { id: candidata, storeId, ativo: true }, select: { id: true } })
        carteirasValidadas.set(candidata, c?.id ?? null)
      }
      carteiraId = carteirasValidadas.get(candidata) ?? null
    }

    const mov = await createMovimentacaoEntradaFromReceber(
      { id: res.data.id, storeId: res.data.storeId, descricao: res.data.descricao, cliente: res.data.cliente },
      valorAplicado,
      { parcial: !quita, carteiraId, db: tx, idempotenciaDoChamador: true, adiarRecalculoCarteira: true },
    )
    if (!mov.ok) {
      throw new RecebimentoLoteError("movimentacao_financeira_falhou", 503, `Falha ao lançar a movimentação financeira (${mov.reason}).`, [
        { localKey: item.localKey, motivo: mov.reason },
      ])
    }
    if (carteiraId) carteirasAfetadas.add(carteiraId)

    const pags = pagamentosDoLedger(res.data.payload, Number(res.data.valor) || 0).filter((p) => p.loteId === key)
    recebidoEm = recebidoEm ?? pags[pags.length - 1]?.at ?? null
    resultados.push({
      tituloId: res.data.id,
      localKey: res.data.localKey ?? item.localKey,
      descricao: res.data.descricao,
      saldoAntes: saldoReal,
      valorRecebido: valorAplicado,
      saldoDepois: buildContaReceberAuditTrail([res.data])[0]?.saldoAberto ?? 0,
      statusFinal: normalizeReceberStatus(res.data.status) ?? res.data.status,
    })
  }

  for (const carteiraId of [...carteirasAfetadas].sort()) {
    await recalcularSaldoCarteira(carteiraId, storeId, tx)
  }

  const saldoDevedorCliente = identFinal.clienteId
    ? await saldoDevedorPorClienteId(tx, storeId, identFinal.clienteId, identFinal.cliente)
    : null

  return {
    jaRegistrado: false,
    operacaoId: key,
    recebidoEm: recebidoEm ?? new Date().toISOString(),
    cliente: identFinal.cliente,
    formaPagamento: forma,
    totalRecebido: resultados.reduce((acc, r) => safeMoney(acc + r.valorRecebido), 0),
    itens: resultados,
    saldoDevedorCliente,
  }
}
