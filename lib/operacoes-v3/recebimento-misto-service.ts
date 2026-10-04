// ============================================================================
// Operações V3 — Recebimento MISTO (imediato + a prazo) · camada transacional
// ----------------------------------------------------------------------------
// Roda INTEIRO dentro da `$transaction` do chamador (`Prisma.TransactionClient`
// obrigatório). Todos os helpers financeiros recebem o MESMO `tx`: título,
// histórico, movimentação, caixa, formalização a prazo e payload da OS entram
// juntos ou não entram. Qualquer recusa é LANÇADA (nunca devolvida): devolver
// erro de dentro da transação faria o Prisma commitar o que já tivesse sido
// escrito. Mesmo padrão do recebimento em lote (`recebimento-lote-service.ts`).
//
// Ordem deliberada: lock da OS → replay/conflito → sessão de caixa (só com
// dinheiro entrando) → OS travada → título travado → saldo real + distribuição
// → baixa do imediato → movimentação → caixa por forma → marcador a prazo no
// MESMO título → espelhos + timeline. Nada é gravado antes da última recusa
// possível pela validação.
// ============================================================================

import { createHash } from "node:crypto";
import type { ContaReceberTitulo, Prisma } from "@/generated/prisma";
import type { EventoTimeline, OrdemServico } from "@/types/os";
import { normalizeReceberStatus, RECEBER_STATUS } from "@/lib/financeiro/contracts/status";
import {
  buildContaReceberAuditTrail,
  getContaReceberByLocalKey,
  registrarPagamentoParcial,
  sumPagamentosFromHistoricoPayload,
  upsertContaReceber,
} from "@/lib/financeiro/services/contas-receber-service";
import { createMovimentacaoEntradaFromReceber } from "@/lib/financeiro/services/movimentacoes-service";
import { recebimentoLoteAdvisoryLock } from "@/lib/financeiro/services/recebimento-lote-service";
import { statusV3FromOS } from "./status-machine";
import {
  descreverSplitV3,
  formaLabelRecebimentoV3,
  lerAPrazoV3,
  localKeyContaReceberOSV3,
  money,
  montarAPrazoMirrorV3,
  montarPagamentoMirrorV3,
  rotuloIntencaoV3,
  statusTituloAPrazoV3,
  totalCobravelV3,
  type APrazoV3,
  type ComprovanteReciboV3,
  type PagamentoV3,
  type SplitLinhaV3,
} from "./payment-model";
import {
  assinaturaRecebimentoMistoV3,
  deCentavosV3,
  formatarCentavosBRLV3,
  formatarVencimentoV3,
  montarComprovanteMistoV3,
  validarDistribuicaoMistaV3,
  type RecebimentoMistoErroCodigoV3,
  type RecebimentoMistoNormalizadoV3,
} from "./recebimento-misto-model";

export type RecebimentoMistoTxV3 = Prisma.TransactionClient;

type OSPayloadFull = OrdemServico & Record<string, unknown>;

export interface ContextoRecebimentoMistoV3 {
  storeId: string;
  osId: string;
  /** Rótulo do operador vindo da SESSÃO do servidor (nunca do browser). */
  operador: string;
  operadorId: string;
  /** Horário do servidor (ISO) desta confirmação. */
  agora: string;
}

export interface ResultadoRecebimentoMistoV3 {
  /** `true` = a mesma confirmação já estava gravada; nada foi lançado de novo. */
  jaRegistrado: boolean;
  operacaoId: string;
  tituloId: string;
  pagamento: PagamentoV3;
  aPrazo: APrazoV3;
  valorRecebidoAgora: number;
  valorAPrazo: number;
  recibo: ComprovanteReciboV3;
}

/** Recusa da confirmação. LANÇADA para abortar a transação inteira. */
export class RecebimentoMistoErroV3 extends Error {
  readonly code: RecebimentoMistoErroCodigoV3;
  /** Saldo real do ledger, quando a recusa depende dele (conflito recuperável). */
  readonly saldoAtual?: number;

  constructor(code: RecebimentoMistoErroCodigoV3, message: string, saldoAtual?: number) {
    super(message);
    this.name = "RecebimentoMistoErroV3";
    this.code = code;
    this.saldoAtual = saldoAtual;
  }
}

export function isRecebimentoMistoErroV3(e: unknown): e is RecebimentoMistoErroV3 {
  return e instanceof RecebimentoMistoErroV3;
}

const MARCADOR_A_PRAZO = "a_prazo_autorizado";

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function eventId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `ev_${Date.now()}`;
}

export function chaveLockRecebimentoMistoV3(storeId: string, osId: string): string {
  return `ops-v3-receb-misto:${storeId}:${osId}`;
}

export function fingerprintRecebimentoMistoV3(escopo: { storeId: string; osId: string }, n: RecebimentoMistoNormalizadoV3): string {
  return createHash("sha256").update(assinaturaRecebimentoMistoV3(escopo, n)).digest("hex");
}

/** Marcador `a_prazo_autorizado` desta confirmação no ledger do título (identidade persistente). */
function marcadorDaOperacao(payload: unknown, operacaoId: string): Record<string, unknown> | null {
  if (!isRecord(payload) || !Array.isArray(payload.historico)) return null;
  for (const e of payload.historico) {
    if (isRecord(e) && String(e.tipo ?? "").toLowerCase() === MARCADOR_A_PRAZO && e.operacaoId === operacaoId) return e;
  }
  return null;
}

/**
 * Identidade de conteúdo de um recebimento CANÔNICO (`receberOSV3`): mesma `operacaoId`
 * com outro conteúdo econômico é conflito, nunca replay.
 */
export function fingerprintRecebimentoCanonicoV3(p: {
  storeId: string;
  osId: string;
  sessaoId: string;
  linhas: SplitLinhaV3[];
  intencao?: string | null;
  observacao?: string | null;
}): string {
  const linhas = p.linhas.map((l) => [l.forma, Math.round(money(l.valor) * 100)]);
  const canonico = JSON.stringify([p.storeId, p.osId, p.sessaoId, linhas, p.intencao ?? null, (p.observacao ?? "").trim()]);
  return createHash("sha256").update(canonico).digest("hex");
}

// ─── travas dentro da transação ───────────────────────────────────────────────
// Compartilhadas por TODOS os writers de pagamento da OS na V3 (misto, recebimento
// canônico, estorno, lançamento a prazo): advisory lock por OS → sessão → OS → título.

/**
 * Sessão de caixa relida e travada em modo COMPARTILHADO: o fechamento do caixa
 * (UPDATE) espera esta transação; outros recebimentos na mesma sessão (FK das
 * `CaixaOperacao`) não esperam — evita ciclo de espera com a rota F5.
 */
export async function travarSessaoCaixa(tx: RecebimentoMistoTxV3, storeId: string, sessaoId: string): Promise<{ id: string; status: string } | null> {
  const rows = await tx.$queryRaw<Array<{ id: string; status: string }>>`
    SELECT "id", "status"::text AS status
    FROM "sessoes_caixa"
    WHERE "id" = ${sessaoId} AND "storeId" = ${storeId}
    FOR SHARE
  `;
  return Array.isArray(rows) && rows.length > 0 ? rows[0]! : null;
}

/** OS travada: o payload lido a seguir é o mais recente e nenhum outro writer o troca até o commit. */
export async function travarOS(tx: RecebimentoMistoTxV3, storeId: string, osId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "ordens_servico" WHERE "id" = ${osId} AND "storeId" = ${storeId} FOR UPDATE
  `;
  return Array.isArray(rows) && rows.length > 0;
}

/**
 * Título travado: escritores CAS (Financeiro, PDV F5/lote, V4 via `receberOSV3`)
 * esperam o commit e então falham no `updatedAt` — nenhum lost update em nenhum
 * dos lados. Também protege o `upsertContaReceber` da formalização (sem CAS).
 */
export async function travarTitulo(tx: RecebimentoMistoTxV3, storeId: string, localKey: string): Promise<void> {
  await tx.$queryRaw`
    SELECT "id" FROM "contas_receber_titulos" WHERE "storeId" = ${storeId} AND "localKey" = ${localKey} FOR UPDATE
  `;
}

/**
 * Título canônico ÚNICO da OS (mesma localKey do V2/V3), travado e relido na transação;
 * criado se ausente. ON CONFLICT DO NOTHING: um título criado em paralelo é preservado (um
 * upsert sobrescreveria o histórico dele) e passa a ser o alvo. `null` = não existe e não há
 * valor a cobrar para criá-lo (ou a releitura falhou) — o chamador decide a recusa.
 */
export async function garantirTituloOSTravadoV3(
  tx: RecebimentoMistoTxV3,
  p: { storeId: string; osId: string; codigo: string; cliente: string; total: number; vencimento: string },
): Promise<ContaReceberTitulo | null> {
  const localKey = localKeyContaReceberOSV3(p.storeId, p.osId);
  await travarTitulo(tx, p.storeId, localKey);
  const existente = await getContaReceberByLocalKey(p.storeId, localKey, tx);
  if (existente || !(p.total > 0)) return existente;
  await tx.contaReceberTitulo.createMany({
    data: [
      {
        storeId: p.storeId,
        localKey,
        descricao: `OS ${p.codigo}`,
        cliente: p.cliente,
        valor: p.total,
        vencimento: p.vencimento,
        status: "pendente",
        payload: { origem: "operacoes-v3", ordemServicoId: p.osId, codigo: p.codigo } as Prisma.InputJsonValue,
      },
    ],
    skipDuplicates: true,
  });
  await travarTitulo(tx, p.storeId, localKey);
  return getContaReceberByLocalKey(p.storeId, localKey, tx);
}

// ─── replay ───────────────────────────────────────────────────────────────────

async function montarReplay(
  tx: RecebimentoMistoTxV3,
  ctx: ContextoRecebimentoMistoV3,
  n: RecebimentoMistoNormalizadoV3,
  titulo: ContaReceberTitulo,
  marcador: Record<string, unknown>,
): Promise<ResultadoRecebimentoMistoV3> {
  const localKey = localKeyContaReceberOSV3(ctx.storeId, ctx.osId);
  const os = await tx.ordemServico.findFirst({ where: { id: ctx.osId, storeId: ctx.storeId }, select: { payload: true } });
  const payload = (isRecord(os?.payload) ? os!.payload : {}) as OSPayloadFull;
  const recebido = sumPagamentosFromHistoricoPayload(titulo.payload);
  const pagamento = montarPagamentoMirrorV3({ total: money(titulo.valor), recebido, tituloLocalKey: localKey, now: ctx.agora });

  const espelho = lerAPrazoV3(payload);
  const valorAPrazo = money(marcador.valor);
  const vencimento = typeof marcador.vencimento === "string" ? marcador.vencimento : "";
  const aPrazo: APrazoV3 =
    espelho && espelho.operacaoId === n.operacaoId
      ? espelho
      : {
          ...montarAPrazoMirrorV3({
            valor: valorAPrazo,
            vencimento,
            tituloLocalKey: localKey,
            autorizadoPor: typeof marcador.userLabel === "string" ? marcador.userLabel : undefined,
            observacao: typeof marcador.observacao === "string" ? marcador.observacao : undefined,
            now: typeof marcador.at === "string" ? marcador.at : ctx.agora,
          }),
          operacaoId: n.operacaoId,
        };

  const timeline = Array.isArray(payload.timeline) ? (payload.timeline as EventoTimeline[]) : [];
  const evento = timeline.find((e) => isRecord(e?.metadata) && e.metadata.operacaoId === n.operacaoId && e.metadata.modo === "a_prazo");
  const reciboPersistido = evento && isRecord(evento.metadata) && isRecord(evento.metadata.comprovante)
    ? (evento.metadata.comprovante as unknown as ComprovanteReciboV3)
    : null;
  const valorRecebidoAgora = money(marcador.recebidoAgora);
  const recibo =
    reciboPersistido ??
    montarComprovanteMistoV3({
      os: payload,
      pagamentosAgora: [],
      valorRecebidoAgora,
      recebidoAnteriormente: Math.max(0, money(recebido - valorRecebidoAgora)),
      pagamento,
      aPrazo,
      operador: typeof marcador.userLabel === "string" ? marcador.userLabel : ctx.operador,
      dataHora: typeof marcador.at === "string" ? marcador.at : ctx.agora,
    });

  return { jaRegistrado: true, operacaoId: n.operacaoId, tituloId: titulo.id, pagamento, aPrazo, valorRecebidoAgora, valorAPrazo, recibo };
}

/** Replay / conflito pela identidade persistida no ledger do título (chamar SOB a trava da OS). */
async function replayDaOperacao(
  tx: RecebimentoMistoTxV3,
  ctx: ContextoRecebimentoMistoV3,
  n: RecebimentoMistoNormalizadoV3,
): Promise<ResultadoRecebimentoMistoV3 | null> {
  const titulo = await getContaReceberByLocalKey(ctx.storeId, localKeyContaReceberOSV3(ctx.storeId, ctx.osId), tx);
  const marcador = titulo ? marcadorDaOperacao(titulo.payload, n.operacaoId) : null;
  if (!titulo || !marcador) return null;
  if (marcador.requestFingerprint !== fingerprintRecebimentoMistoV3({ storeId: ctx.storeId, osId: ctx.osId }, n)) {
    throw new RecebimentoMistoErroV3(
      "idempotencia_conflito",
      "Esta confirmação já foi registrada com outros valores. Atualize a OS antes de lançar outra operação.",
    );
  }
  return montarReplay(tx, ctx, n, titulo, marcador);
}

/**
 * SÓ o replay: a confirmação com esta `operacaoId` já está gravada? Para quando a operação
 * NOVA seria recusada antes da transação (período fechado, vencimento que virou passado) —
 * reenviar uma confirmação já gravada continua devolvendo o que foi gravado, nunca uma
 * recusa que faria a tela trocar de chave. `null` = nada gravado com esta chave.
 */
export async function buscarRecebimentoMistoGravadoV3(
  tx: RecebimentoMistoTxV3,
  ctx: ContextoRecebimentoMistoV3,
  n: RecebimentoMistoNormalizadoV3,
): Promise<ResultadoRecebimentoMistoV3 | null> {
  await recebimentoLoteAdvisoryLock(tx, chaveLockRecebimentoMistoV3(ctx.storeId, ctx.osId));
  return replayDaOperacao(tx, ctx, n);
}

// ─── execução ─────────────────────────────────────────────────────────────────

export async function executarRecebimentoMistoOSV3(
  tx: RecebimentoMistoTxV3,
  ctx: ContextoRecebimentoMistoV3,
  n: RecebimentoMistoNormalizadoV3,
): Promise<ResultadoRecebimentoMistoV3> {
  const { storeId, osId } = ctx;
  const localKey = localKeyContaReceberOSV3(storeId, osId);
  const requestFingerprint = fingerprintRecebimentoMistoV3({ storeId, osId }, n);

  // 1. Serialização por OS: PRIMEIRA instrução, antes de qualquer leitura de estado.
  await recebimentoLoteAdvisoryLock(tx, chaveLockRecebimentoMistoV3(storeId, osId));

  // 2. Replay / conflito pela identidade persistida no ledger do título. Vem antes
  // da sessão: repetir uma confirmação já gravada continua válido com o caixa fechado.
  const replay = await replayDaOperacao(tx, ctx, n);
  if (replay) return replay;

  // 3. Caixa aberto da loja — exigido só quando há dinheiro entrando agora.
  let sessaoId: string | null = null;
  if (n.receberAgoraCentavos > 0) {
    const sessao = n.sessaoId ? await travarSessaoCaixa(tx, storeId, n.sessaoId) : null;
    if (!sessao || sessao.status !== "ABERTA") {
      throw new RecebimentoMistoErroV3("caixa_fechado", "Caixa fechado: abra o caixa no PDV antes de receber o pagamento imediato.");
    }
    sessaoId = sessao.id;
  }

  // 4. OS da MESMA loja, travada, com o payload mais recente.
  if (!(await travarOS(tx, storeId, osId))) {
    throw new RecebimentoMistoErroV3("os_nao_encontrada", "OS não encontrada nesta loja.");
  }
  const osRow = await tx.ordemServico.findFirst({
    where: { id: osId, storeId },
    select: { id: true, payload: true, valorTotal: true, valorBase: true },
  });
  if (!osRow || !isRecord(osRow.payload)) throw new RecebimentoMistoErroV3("os_nao_encontrada", "OS sem payload compatível nesta loja.");
  const payload = osRow.payload as unknown as OSPayloadFull;
  if (statusV3FromOS(payload) === "cancelada") {
    throw new RecebimentoMistoErroV3("os_cancelada", "OS cancelada não recebe pagamento nem formalização a prazo.");
  }
  const totalCobravel = totalCobravelV3({
    ...payload,
    prismaValorTotal: Number(osRow.valorTotal ?? 0) || 0,
    prismaValorBase: Number(osRow.valorBase ?? 0) || 0,
  } as unknown as OrdemServico);
  const codigo = payload.codigo ?? osId;

  // 5. Título canônico ÚNICO da OS (mesma localKey do V2/V3), travado; criado se ausente.
  const titulo = await garantirTituloOSTravadoV3(tx, {
    storeId,
    osId,
    codigo,
    cliente: payload.cliente?.nome ?? "",
    total: totalCobravel,
    vencimento: n.aPrazo.vencimento,
  });
  if (!titulo) {
    throw totalCobravel > 0
      ? new RecebimentoMistoErroV3("titulo_inconsistente", "Não foi possível garantir o título da OS.")
      : new RecebimentoMistoErroV3("sem_valor", "Esta OS não tem valor a cobrar. Gere/aprove o orçamento antes de receber.");
  }
  const tituloPayload = isRecord(titulo.payload) ? titulo.payload : {};
  if (
    titulo.storeId !== storeId ||
    titulo.localKey !== localKey ||
    (typeof tituloPayload.ordemServicoId === "string" && tituloPayload.ordemServicoId !== osId)
  ) {
    throw new RecebimentoMistoErroV3("titulo_inconsistente", "O título financeiro não pertence inequivocamente a esta OS e loja.");
  }
  const statusTitulo = normalizeReceberStatus(titulo.status);
  if (statusTitulo === RECEBER_STATUS.CANCELADO || statusTitulo === RECEBER_STATUS.ESTORNADO) {
    throw new RecebimentoMistoErroV3("titulo_encerrado", "O título desta OS está cancelado/estornado.");
  }
  if (statusTitulo === RECEBER_STATUS.PAGO) {
    throw new RecebimentoMistoErroV3("os_quitada", "Esta OS já está quitada — não há saldo para formalizar.");
  }
  if (Math.abs(Math.round(money(titulo.valor) * 100) - Math.round(totalCobravel * 100)) > 1) {
    throw new RecebimentoMistoErroV3(
      "total_divergente",
      `O valor do título (${formatarCentavosBRLV3(Math.round(money(titulo.valor) * 100))}) diverge do total da OS (${formatarCentavosBRLV3(Math.round(totalCobravel * 100))}). Revise a cobrança antes de receber.`,
    );
  }

  // 6. Saldo REAL do ledger (valor − pagamentos líquidos) e distribuição exata.
  const saldoAtual = buildContaReceberAuditTrail([titulo])[0]?.saldoAberto ?? 0;
  const distribuicao = validarDistribuicaoMistaV3(n, Math.round(saldoAtual * 100));
  if (!distribuicao.ok) throw new RecebimentoMistoErroV3(distribuicao.code, distribuicao.mensagem, saldoAtual);
  const recebidoAnteriormente = sumPagamentosFromHistoricoPayload(titulo.payload);

  const linhas: SplitLinhaV3[] = n.pagamentosAgora.map((l) => ({ forma: l.forma, valor: deCentavosV3(l.centavos) }));
  const valorRecebidoAgora = deCentavosV3(n.receberAgoraCentavos);
  const valorAPrazo = deCentavosV3(n.aPrazo.centavos);
  const vencimentoLabel = formatarVencimentoV3(n.aPrazo.vencimento);
  const intencaoLabel = rotuloIntencaoV3(n.intencao ?? "parcial", false);
  const splitDesc = descreverSplitV3(linhas);

  // 7. Parte imediata: SÓ o dinheiro recebido agora vira baixa, movimentação e caixa.
  let tituloAtual = titulo;
  if (n.receberAgoraCentavos > 0) {
    const obs = [
      n.observacao,
      `OS ${codigo} · PDV Serviço · ${intencaoLabel} · ${splitDesc} · saldo a prazo R$ ${valorAPrazo.toFixed(2)} (venc. ${vencimentoLabel})`,
    ]
      .filter(Boolean)
      .join(" · ");
    // O MESMO snapshot que definiu o saldo fornece o token CAS (updatedAt).
    const baixa = await registrarPagamentoParcial({
      storeId,
      localKey,
      valorPago: valorRecebidoAgora,
      observacao: obs,
      userLabel: ctx.operador,
      tituloSnapshot: titulo,
      db: tx,
    });
    if (!baixa.ok) {
      throw new RecebimentoMistoErroV3(
        baixa.reason === "titulo_alterado" ? "titulo_alterado" : "titulo_inconsistente",
        `Não foi possível registrar o pagamento imediato (${baixa.reason}).`,
      );
    }
    tituloAtual = baixa.data;

    const mov = await createMovimentacaoEntradaFromReceber(
      { id: tituloAtual.id, storeId: tituloAtual.storeId, descricao: tituloAtual.descricao, cliente: tituloAtual.cliente },
      valorRecebidoAgora,
      // A identidade é desta confirmação (lock + operacaoId): a heurística de soma do
      // helper suprimiria um segundo recebimento parcial legítimo de valor menor.
      { parcial: true, db: tx, idempotenciaDoChamador: true },
    );
    if (!mov.ok) throw new RecebimentoMistoErroV3("movimentacao_falhou", `Falha ao lançar a movimentação financeira (${mov.reason}).`);

    // Uma operação de caixa POR FORMA → o fechamento separa dinheiro/pix/débito/crédito.
    for (const [indice, l] of linhas.entries()) {
      await tx.caixaOperacao.create({
        data: {
          sessaoId: sessaoId!,
          storeId,
          tipo: "recebimento_cr",
          valor: l.valor,
          motivo: `Serviço/OS ${codigo} — ${tituloAtual.cliente || ""} (${formaLabelRecebimentoV3(l.forma)})`,
          operador: ctx.operador,
          payload: {
            origem: "operacoes-v3-os",
            ordemServicoId: osId,
            tituloId: tituloAtual.id,
            localKey,
            formaPagamento: l.forma,
            intencao: intencaoLabel,
            op: "parcial",
            operacaoId: n.operacaoId,
            localId: `ops-v3-misto:${storeId}:${osId}:${n.operacaoId}:${indice}`,
          } as Prisma.InputJsonValue,
        },
      });
    }
  }

  // 8. Formalização a prazo no MESMO título: marcador de auditoria (não é baixa),
  // vencimento e status canônico (parcial com recebimento; pendente sem).
  const recebidoDepois = sumPagamentosFromHistoricoPayload(tituloAtual.payload);
  tituloAtual = await upsertContaReceber({
    storeId,
    localKey,
    vencimento: n.aPrazo.vencimento,
    status: statusTituloAPrazoV3(recebidoDepois),
    historicoEntrada: {
      tipo: MARCADOR_A_PRAZO,
      valor: valorAPrazo,
      vencimento: n.aPrazo.vencimento,
      observacao: n.aPrazo.observacao ?? undefined,
      userLabel: ctx.operador,
      autorizadoPorId: ctx.operadorId,
      operacaoId: n.operacaoId,
      requestFingerprint,
      recebidoAgora: valorRecebidoAgora,
      origem: "operacoes-v3-recebimento-misto",
    },
    db: tx,
  });

  // Invariante: depois da operação o saldo aberto é exatamente o valor a prazo.
  const saldoDepois = buildContaReceberAuditTrail([tituloAtual])[0]?.saldoAberto ?? 0;
  if (Math.round(saldoDepois * 100) !== n.aPrazo.centavos || sumPagamentosFromHistoricoPayload(tituloAtual.payload) !== recebidoDepois) {
    throw new RecebimentoMistoErroV3("titulo_inconsistente", "O saldo após a operação diverge do valor a prazo — nada foi gravado.");
  }

  // 9. Espelhos + histórico canônico da OS sobre o payload TRAVADO (mais recente).
  const formasLabel = linhas.map((l) => formaLabelRecebimentoV3(l.forma)).join(" + ");
  const pagamentoAnterior = isRecord(payload.pagamentoV3) ? payload.pagamentoV3 : null;
  const pagamento = montarPagamentoMirrorV3({
    total: money(tituloAtual.valor),
    recebido: recebidoDepois,
    ultimaForma: formasLabel || (typeof pagamentoAnterior?.ultimaForma === "string" ? pagamentoAnterior.ultimaForma : undefined),
    tituloLocalKey: localKey,
    now: ctx.agora,
  });
  const aPrazo: APrazoV3 = {
    ...montarAPrazoMirrorV3({
      valor: valorAPrazo,
      vencimento: n.aPrazo.vencimento,
      tituloLocalKey: localKey,
      autorizadoPor: ctx.operador,
      observacao: n.aPrazo.observacao ?? undefined,
      now: ctx.agora,
    }),
    operacaoId: n.operacaoId,
  };
  const recibo = montarComprovanteMistoV3({
    os: payload,
    pagamentosAgora: linhas,
    valorRecebidoAgora,
    recebidoAnteriormente,
    pagamento,
    aPrazo,
    operador: ctx.operador,
    dataHora: ctx.agora,
    observacao: n.observacao ?? undefined,
  });

  const eventos: EventoTimeline[] = [];
  if (n.receberAgoraCentavos > 0) {
    eventos.push({
      id: eventId(),
      tipo: "operacao_cobranca_gerada",
      autor: ctx.operador,
      autorTipo: "usuario",
      conteudo: `${intencaoLabel}: ${splitDesc} (total R$ ${valorRecebidoAgora.toFixed(2)}) · saldo R$ ${valorAPrazo.toFixed(2)} a prazo, vencimento ${vencimentoLabel} (${pagamento.status}).`,
      metadata: {
        intencao: n.intencao ?? "parcial",
        intencaoLabel,
        total: valorRecebidoAgora,
        linhas,
        op: "parcial",
        saldo: pagamento.saldo,
        status: pagamento.status,
        sessaoId,
        operacaoId: n.operacaoId,
        modo: "recebimento_misto",
      },
      criadoEm: ctx.agora,
    });
  }
  eventos.push({
    id: eventId(),
    tipo: "financeiro_conta_receber_criada",
    autor: ctx.operador,
    autorTipo: "usuario",
    conteudo: `Saldo de R$ ${valorAPrazo.toFixed(2)} formalizado a prazo (OS ${codigo}) · vencimento ${vencimentoLabel}. Valor NÃO recebido — não movimenta caixa.`,
    metadata: {
      modo: "a_prazo",
      valor: valorAPrazo,
      vencimento: n.aPrazo.vencimento,
      tituloLocalKey: localKey,
      autorizadoEntrega: true,
      operacaoId: n.operacaoId,
      requestFingerprint,
      recebidoAgora: valorRecebidoAgora,
      comprovante: recibo,
    },
    criadoEm: ctx.agora,
  });

  const timeline = Array.isArray(payload.timeline) ? (payload.timeline as EventoTimeline[]) : [];
  const nextPayload: OSPayloadFull = {
    ...payload,
    pagamentoV3: pagamento,
    aPrazoV3: aPrazo,
    timeline: [...timeline, ...eventos],
    atualizadoEm: ctx.agora,
  } as OSPayloadFull;
  await tx.ordemServico.update({ where: { id: osRow.id }, data: { payload: nextPayload as unknown as Prisma.InputJsonValue } });

  return {
    jaRegistrado: false,
    operacaoId: n.operacaoId,
    tituloId: tituloAtual.id,
    pagamento,
    aPrazo,
    valorRecebidoAgora,
    valorAPrazo,
    recibo,
  };
}
