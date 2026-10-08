"use server";

// ============================================================================
// Operações V3 — Fase 3A · RETORNO em garantia (retrabalho/reincidência)
// ----------------------------------------------------------------------------
// Abre/finaliza um retorno VINCULADO à OS original em `payload.retornosV3[]`
// (`osOriginalId` + timeline). A original precisa estar ENTREGUE (status final):
// o atendimento novo nasce pelo contrato existente `criarOSEnterpriseV3`
// (origem retorno/garantia) e o vínculo é gravado nos dois lados. Sem schema
// novo, sem Financeiro/estoque/V2.
//
// GOAL OPS-V4-FLUXO-CURTO-007 — uma operação lógica = UM atendimento. A trava da
// original NÃO pode ser segurada durante a criação da filha (pgBouncer em modo
// transação com connection_limit=1: a transação esperaria a própria conexão).
// Protocolo, sempre em transações curtas sob a trava da original:
//   1. reserva: relê o payload MAIS RECENTE, revalida entrega/cancelamento/
//      retorno aberto e grava a entrada "aberto" com `operacaoId`, assinatura do
//      relato e `reserva {token, expiraEm}` (TTL > duração máxima de função);
//   2. só quem gravou o token cria a filha (fora da trava); falha → compensação;
//   3. vínculo: reserva sem atendimento → grava `osRetornoId` + evento único.
// Retry da mesma operação devolve o atendimento existente; reserva sem vínculo é
// resolvida ADOTANDO a filha já criada (busca pelo vínculo), aguardando a reserva
// viva ou retomando/descartando a expirada; filha excedente é DESCARTADA de forma
// explícita — nunca duplicada vinculada, nunca órfã silenciosa.
// Ordem de travas: "writers operacionais: SÓ a OS" — nenhum passo segura duas OS.
// ============================================================================

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { Session } from "next-auth";
import type { EventoTimeline, OrdemServico } from "@/types/os";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireEnterpriseWith } from "@/lib/auth/guard-enterprise";
import { assertActiveStoreId } from "@/lib/operacoes/assert-active-store";
import {
  chaveRelatoRetornoV4,
  LIMITE_TEXTO_RETORNO_V4,
  normalizarAcessoriosRetornoV4,
  resumirOrigemRetornoV4,
  type OrigemRetornoResumoV4,
} from "@/lib/operacoes-v4/retorno-origem-v4";
import {
  lerEntregaV3,
  lerGarantiaV3,
  lerRetornosV3,
  retornoEmAberturaV3,
  type GarantiaSituacaoV3,
  type RetornoV3,
} from "./pos-venda-model";
import { emitirEventoOperacaoV3 } from "./event-publisher";
import { criarOSEnterpriseV3 } from "./nova-os-actions";
import { validarNovaOSDraftV3, type NovaOSSenhaTipoV3 } from "./nova-os-model";
import { buildRetornoAtendimentoDraftV3, type RetornoRecepcaoInputV3 } from "./retorno-atendimento";
import { mutarPayloadOSV3, type MutacaoPayloadOSV3, type OSTravadaV3, type TxOSPayloadV3 } from "./os-payload-lock";
import { statusV3FromOS } from "./status-machine";

type OSPayloadFull = OrdemServico & Record<string, unknown>;
type RetornoBruto = Record<string, unknown> & { id: string };

/** Maior que a duração máxima de uma função na Vercel (300 s padrão, 800 s teto). */
const RESERVA_RETORNO_TTL_MS = 15 * 60_000;
const OPERACAO_ID_RE = /^[A-Za-z0-9_-]{8,80}$/;
const LIMITE_BUSCA_ORIGENS = 20;

const MSG_NAO_ENTREGUE =
  "A OS ainda não foi entregue: isto não é pós-venda. Registre a ocorrência como observação interna desta OS.";
const MSG_CANCELADA = "OS cancelada não admite retorno. Para um novo problema, abra uma Nova OS.";
const MSG_DIVERGENTE =
  "Esta operação de retorno já foi registrada com outro relato. Revise o retorno existente; o relato original foi preservado.";
const MSG_EM_PROCESSAMENTO =
  "A abertura deste retorno ainda está em processamento. Verifique novamente em instantes.";
const MSG_OUTRA_ABERTURA =
  "Outra abertura de retorno está em processamento para esta OS. Verifique novamente em instantes.";
const MSG_SEM_CLIENTE =
  "A OS original não tem cliente cadastrado vinculado. Vincule o cliente na OS original antes de abrir o retorno (o retorno não cria cadastro novo).";

function nowIso(): string {
  return new Date().toISOString();
}
function eventId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `ev_${Date.now()}`;
}
function operadorLabel(session: Session | null): string {
  const u = session?.user;
  return (u?.name || u?.email || "Você").trim() || "Você";
}
function makeEvento(tipo: EventoTimeline["tipo"], autor: string, conteudo: string, metadata?: Record<string, unknown>): EventoTimeline {
  return { id: eventId(), tipo, autor, autorTipo: "usuario", conteudo, metadata, criadoEm: nowIso() };
}
function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
function meta(evento: EventoTimeline): Record<string, unknown> {
  return evento?.metadata && typeof evento.metadata === "object" ? (evento.metadata as Record<string, unknown>) : {};
}
function timelineDe(payload: Record<string, unknown>): EventoTimeline[] {
  return Array.isArray(payload.timeline) ? (payload.timeline as EventoTimeline[]) : [];
}
/** Entradas cruas de `retornosV3[]` (campos desconhecidos preservados por spread). */
function retornosBrutos(payload: Record<string, unknown>): RetornoBruto[] {
  const raw = payload.retornosV3;
  if (!Array.isArray(raw)) return [];
  return raw.filter((r): r is RetornoBruto => !!r && typeof r === "object" && !!text((r as { id?: unknown }).id));
}
function revalidar(): void {
  revalidatePath("/dashboard/operacoes-v3");
  revalidatePath("/dashboard/operacoes-v4-preview");
}

/** Auth + leitura para DECIDIR (ex.: o atendimento a criar). Gravações relêem sob a trava (`mutar`). */
async function carregar(storeId: string, osId: string): Promise<{ id: string; session: Session | null; payload: OSPayloadFull }> {
  const sid = (storeId ?? "").trim();
  const id = (osId ?? "").trim();
  assertActiveStoreId(sid, "Operações V3");
  if (!id) throw new Error("OS não informada.");
  const session = await auth();
  if (!session?.user?.id) throw new Error("Faça login para gerenciar retornos.");
  const guard = await requireEnterpriseWith(sid, (p) => p.operacoes.editarOs, "Sem permissão para gerenciar retornos desta OS.");
  if (!guard.ok) throw new Error(guard.error);
  const row = await prisma.ordemServico.findFirst({ where: { id, storeId: sid }, select: { id: true, payload: true } });
  if (!row) throw new Error("OS não encontrada.");
  const payload = row.payload as unknown as OSPayloadFull | null;
  if (!payload || typeof payload !== "object") throw new Error("OS sem payload compatível.");
  return { id, session, payload };
}

/**
 * Executa `mutate` sobre o payload MAIS RECENTE da OS (loja + id) sob a trava da linha,
 * numa transação CURTA, e revalida após o commit. Nunca regrava o snapshot lido antes.
 */
async function travar<R>(
  storeId: string,
  id: string,
  mutate: (os: OSTravadaV3, tx: TxOSPayloadV3) => Promise<MutacaoPayloadOSV3<R>> | MutacaoPayloadOSV3<R>,
): Promise<R> {
  const resultado = await mutarPayloadOSV3<R>({ storeId, osId: id, mutate });
  revalidar();
  return resultado;
}


export interface AbrirRetornoV3Input {
  motivo: string;
  observacao?: string;
  /**
   * GOAL 007: identidade estável da operação lógica (o retry do MESMO relato
   * reenvia o MESMO id). Ausente = o servidor gera um (chamador legado).
   */
  operacaoId?: string;
  /** GOAL 007: recepção do atendimento NOVO (acessórios entregues agora, senha opcional). */
  recepcao?: { acessorios?: string[]; senha?: string; senhaTipo?: string };
}

export interface AbrirRetornoV3Result {
  /** OS original, relida depois do vínculo. */
  os: OrdemServico;
  /** Atendimento de retorno vinculado (sempre presente quando a action resolve). */
  atendimento: OrdemServico | null;
  /** `criado` = este comando criou o atendimento; `recuperado` = retry/adoção da mesma operação. */
  situacao: "criado" | "recuperado";
  retornoId: string;
}

interface FilhaRetornoV3 {
  id: string;
  codigo: string;
}

type DecisaoAberturaV3 =
  | { tipo: "replay"; os: OSPayloadFull; retorno: RetornoV3 }
  | { tipo: "adotado"; os: OSPayloadFull; retorno: RetornoV3; filha: FilhaRetornoV3; mesmaOperacao: boolean }
  /** `anterior`: entrada PREEXISTENTE retomada (legado ou a própria operação) — a compensação a restaura. */
  | { tipo: "criar"; os: OSPayloadFull; retorno: RetornoV3; anterior?: RetornoBruto };

function operacaoIdDe(valor: unknown): string {
  const id = text(valor);
  if (!id) return `srv-${randomUUID()}`;
  if (!OPERACAO_ID_RE.test(id)) throw new Error("Identificador da operação de retorno inválido.");
  return id;
}

function recepcaoDe(input: AbrirRetornoV3Input["recepcao"]): RetornoRecepcaoInputV3 {
  const senha = text(input?.senha).slice(0, 64) || undefined;
  const tipo = input?.senhaTipo;
  const senhaTipo: NovaOSSenhaTipoV3 | undefined = tipo === "numerica" || tipo === "texto" || tipo === "padrao" ? tipo : undefined;
  return {
    acessorios: normalizarAcessoriosRetornoV4(input?.acessorios),
    ...(senha ? { senha, ...(senhaTipo ? { senhaTipo } : {}) } : {}),
  };
}

/** Assinatura do relato: hash da chave canônica (motivo + observação + acessórios; nunca a senha). */
function assinaturaDe(motivo: string, observacao: string | undefined, acessorios: string[]): string {
  return createHash("sha256").update(chaveRelatoRetornoV4({ motivo, observacao, acessorios })).digest("hex").slice(0, 32);
}

function retornoIdDe(operacaoId: string): string {
  return `ret-${operacaoId}`;
}

function textoCobertura(situacao: GarantiaSituacaoV3 | undefined): string {
  if (situacao === "ativa") return "Garantia vigente na abertura (cobertura do novo defeito a avaliar no atendimento).";
  if (situacao === "vencida") return "Garantia vencida na abertura: sem cobertura confirmada.";
  if (situacao === "sem_garantia") return "OS sem cobertura de garantia: sem cobertura confirmada.";
  return "Garantia não informada: nenhuma cobertura presumida.";
}

/**
 * Evento de abertura do retorno. "Garantia acionada" só quando a garantia estava VIGENTE;
 * sem cobertura confirmada (vencida, sem garantia, não informada) é registro informativo,
 * com título explícito — a timeline nunca exibe garantia que não existe.
 */
function eventoDeRetorno(situacao: GarantiaSituacaoV3 | undefined, autor: string, conteudo: string, metadata: Record<string, unknown>): EventoTimeline {
  if (situacao === "ativa") return { ...makeEvento("garantia_acionada", autor, conteudo, metadata), titulo: "Retorno em garantia" };
  const titulo = situacao === "nenhuma" || !situacao ? "Retorno — garantia não informada" : "Retorno — sem cobertura confirmada";
  return { ...makeEvento("observacao", autor, conteudo, metadata), titulo };
}

/** Rascunho canônico do atendimento + validações que impedem criar (sem cadastro novo de cliente). */
function rascunhoValidado(
  os: OrdemServico,
  retorno: { motivo: string; observacao?: string; garantiaAtiva: boolean },
  recepcao: RetornoRecepcaoInputV3,
) {
  if (!text(os.clienteId) && !text(os.cliente?.id)) throw new Error(MSG_SEM_CLIENTE);
  const draft = buildRetornoAtendimentoDraftV3(os, { ...retorno, recepcao });
  const invalido = validarNovaOSDraftV3(draft);
  if (invalido) throw new Error(invalido);
  return draft;
}

/** Atendimento já criado para (origem, retornoId) nesta loja — não descartado. Leitura simples (sem trava). */
async function buscarFilhaDoRetornoV3(
  db: Pick<TxOSPayloadV3, "$queryRaw">,
  storeId: string,
  osOrigemId: string,
  retornoId: string,
): Promise<FilhaRetornoV3 | null> {
  const rows = await db.$queryRaw<Array<{ id: string; numero: string | null; codigo: string | null }>>`
    SELECT "id", "numero", "payload"->>'codigo' AS "codigo"
    FROM "ordens_servico"
    WHERE "storeId" = ${storeId}
      AND "payload"->'vinculoRetornoV3'->>'osOrigemId' = ${osOrigemId}
      AND "payload"->'vinculoRetornoV3'->>'retornoId' = ${retornoId}
      AND COALESCE("payload"->'vinculoRetornoV3'->>'descartadoEm', '') = ''
    ORDER BY "createdAt" ASC, "id" ASC
    LIMIT 1
  `;
  const row = Array.isArray(rows) ? rows[0] : undefined;
  if (!row?.id) return null;
  return { id: row.id, codigo: text(row.codigo) || text(row.numero) || row.id };
}

/** Grava o vínculo do retorno com a filha, remove a reserva e registra o evento UMA vez. */
function vincularNoPayload(payload: OSPayloadFull, retornoId: string, filha: FilhaRetornoV3, operador: string): OSPayloadFull {
  const lista = retornosBrutos(payload).map((r) => {
    if (r.id !== retornoId) return r;
    const { reserva: _reserva, ...resto } = r;
    void _reserva;
    return { ...resto, osRetornoId: filha.id, osRetornoCodigo: filha.codigo };
  });
  const retorno = lerRetornosV3({ ...payload, retornosV3: lista } as unknown as OrdemServico).find((r) => r.id === retornoId);
  const timeline = timelineDe(payload);
  const jaRegistrado = timeline.some((ev) => meta(ev).evento === "retorno_aberto" && meta(ev).retornoId === retornoId);
  const evento =
    jaRegistrado || !retorno
      ? null
      : eventoDeRetorno(
          retorno.garantiaSituacaoNaAbertura,
          operador,
          `Retorno aberto: ${retorno.motivo}. Atendimento ${filha.codigo} vinculado. ${textoCobertura(retorno.garantiaSituacaoNaAbertura)}`,
          {
            evento: "retorno_aberto",
            retornoId,
            motivo: retorno.motivo,
            observacao: retorno.observacao,
            garantiaAtivaNaAbertura: retorno.garantiaAtivaNaAbertura,
            garantiaSituacaoNaAbertura: retorno.garantiaSituacaoNaAbertura,
            osOriginalId: text(payload.id),
            osRetornoId: filha.id,
            osRetornoCodigo: filha.codigo,
            operacaoId: retorno.operacaoId,
          },
        );
  return {
    ...payload,
    retornosV3: lista,
    timeline: evento ? [...timeline, evento] : timeline,
    atualizadoEm: nowIso(),
  } as OSPayloadFull;
}

/** Evento de abertura na filha (idempotente por retornoId). A autoridade do vínculo é `vinculoRetornoV3`. */
async function registrarEventoNaFilha(storeId: string, filha: FilhaRetornoV3, origem: OSPayloadFull, retorno: RetornoV3, operador: string): Promise<OrdemServico | null> {
  const codigoOrigem = text(origem.codigo) || text(origem.id);
  return travar<OrdemServico | null>(storeId, filha.id, ({ payload }) => {
    const timeline = timelineDe(payload);
    const ja = timeline.some((ev) => meta(ev).evento === "retorno_atendimento_aberto" && meta(ev).retornoId === retorno.id);
    if (ja) return { payload: null, resultado: payload as unknown as OrdemServico };
    const evento = eventoDeRetorno(
      retorno.garantiaSituacaoNaAbertura,
      operador,
      `Atendimento de retorno da OS ${codigoOrigem}. Motivo: ${retorno.motivo}. ${textoCobertura(retorno.garantiaSituacaoNaAbertura)}`,
      { evento: "retorno_atendimento_aberto", osOriginalId: text(origem.id), osOriginalCodigo: codigoOrigem, retornoId: retorno.id, motivo: retorno.motivo },
    );
    const proximo = { ...payload, timeline: [...timeline, evento], atualizadoEm: nowIso() } as OSPayloadFull;
    return { payload: proximo, resultado: proximo as unknown as OrdemServico };
  });
}

/** Filha excedente de abertura concorrente: marcada (descartada) com evento — nunca órfã silenciosa. */
async function descartarFilhaExcedente(
  storeId: string,
  filha: FilhaRetornoV3,
  retornoId: string,
  valido: FilhaRetornoV3 | null,
  operador: string,
): Promise<void> {
  await mutarPayloadOSV3<void>({
    storeId,
    osId: filha.id,
    aoAusente: () => undefined,
    mutate: ({ payload }) => {
      const vinculo = payload.vinculoRetornoV3 && typeof payload.vinculoRetornoV3 === "object" ? (payload.vinculoRetornoV3 as Record<string, unknown>) : {};
      if (text(vinculo.descartadoEm)) return { payload: null, resultado: undefined };
      const agora = nowIso();
      const evento = makeEvento(
        "observacao",
        operador,
        valido
          ? `Atendimento descartado: o retorno da OS original ficou no atendimento ${valido.codigo} (abertura concorrente).`
          : "Atendimento descartado: a abertura do retorno foi interrompida antes do vínculo.",
        { evento: "retorno_atendimento_descartado", retornoId, vinculoValidoId: valido?.id },
      );
      return {
        payload: {
          ...payload,
          vinculoRetornoV3: {
            ...vinculo,
            descartadoEm: agora,
            descartadoMotivo: valido ? "abertura_concorrente" : "reserva_descartada",
            ...(valido ? { vinculoValidoId: valido.id, vinculoValidoCodigo: valido.codigo } : {}),
          },
          timeline: [...timelineDe(payload), evento],
          atualizadoEm: agora,
        },
        resultado: undefined,
      };
    },
  });
  revalidar();
}

async function lerPayloadOS(storeId: string, id: string): Promise<OrdemServico | null> {
  const row = await prisma.ordemServico.findFirst({ where: { id, storeId }, select: { payload: true } });
  const payload = row?.payload as unknown as OrdemServico | null | undefined;
  return payload && typeof payload === "object" ? payload : null;
}

/**
 * Abre o retorno de uma OS ENTREGUE: um atendimento novo, vinculado nos dois lados, por
 * operação lógica (idempotente por `operacaoId`). OS não entregue/cancelada é recusada.
 */
export async function abrirRetornoV3(storeId: string, osId: string, input: AbrirRetornoV3Input): Promise<AbrirRetornoV3Result> {
  const { id, session } = await carregar(storeId, osId);
  const sid = (storeId ?? "").trim();
  const motivo = (input?.motivo ?? "").trim();
  const observacao = (input?.observacao ?? "").trim() || undefined;
  if (!motivo) throw new Error("Informe o motivo do retorno.");
  if (motivo.length > LIMITE_TEXTO_RETORNO_V4 || (observacao?.length ?? 0) > LIMITE_TEXTO_RETORNO_V4) {
    throw new Error(`Motivo e observação do retorno têm no máximo ${LIMITE_TEXTO_RETORNO_V4} caracteres.`);
  }
  const recepcao = recepcaoDe(input?.recepcao);
  const operacaoId = operacaoIdDe(input?.operacaoId);
  const assinatura = assinaturaDe(motivo, observacao, recepcao.acessorios ?? []);
  // O atendimento é uma OS nova: a permissão de criar é checada ANTES de qualquer escrita.
  const guardCriar = await requireEnterpriseWith(sid, (p) => p.operacoes.criarOs, "Sem permissão para abrir o atendimento de retorno.");
  if (!guardCriar.ok) throw new Error(guardCriar.error);
  const operador = operadorLabel(session);
  const token = randomUUID();

  // ---- 1. Decisão + reserva sob a trava da original (payload MAIS RECENTE) ----
  const decisao = await travar<DecisaoAberturaV3>(sid, id, async ({ payload }, tx) => {
    const atual = payload as OSPayloadFull;
    const os = atual as unknown as OrdemServico;
    if (statusV3FromOS(os) === "cancelada") throw new Error(MSG_CANCELADA);
    if (!lerEntregaV3(os).entregue) throw new Error(MSG_NAO_ENTREGUE);
    const agora = new Date();
    const lidos = lerRetornosV3(os);

    // Mesma operação já vinculada (aberta ou finalizada): replay, zero escrita.
    const daOperacao = lidos.find((r) => r.operacaoId === operacaoId);
    if (daOperacao?.osRetornoId) {
      if (daOperacao.assinatura && daOperacao.assinatura !== assinatura) throw new Error(MSG_DIVERGENTE);
      return { payload: null, resultado: { tipo: "replay", os: atual, retorno: daOperacao } };
    }

    const aberto = lidos.find((r) => r.status === "aberto");
    if (aberto?.osRetornoId) {
      throw new Error(`Já existe um retorno em andamento para esta OS. Continue no atendimento ${aberto.osRetornoCodigo || aberto.osRetornoId}.`);
    }

    let brutos = retornosBrutos(atual);
    const extras: EventoTimeline[] = [];
    if (aberto) {
      // Retorno aberto SEM atendimento: legado, reserva viva ou reserva interrompida.
      if (aberto.operacaoId === operacaoId && aberto.assinatura && aberto.assinatura !== assinatura) throw new Error(MSG_DIVERGENTE);
      const filha = await buscarFilhaDoRetornoV3(tx, sid, id, aberto.id);
      if (filha) {
        const vinculado = vincularNoPayload(atual, aberto.id, filha, operador);
        const retorno = lerRetornosV3(vinculado as unknown as OrdemServico).find((r) => r.id === aberto.id) ?? aberto;
        return {
          payload: vinculado,
          resultado: { tipo: "adotado", os: vinculado, retorno, filha, mesmaOperacao: aberto.operacaoId === operacaoId },
        };
      }
      if (retornoEmAberturaV3(aberto, agora)) {
        throw new Error(aberto.operacaoId === operacaoId ? MSG_EM_PROCESSAMENTO : MSG_OUTRA_ABERTURA);
      }
      if (!aberto.operacaoId || aberto.operacaoId === operacaoId) {
        // Retomada (legado sem operação ou a própria operação interrompida): o relato
        // registrado é preservado; a cobertura é a de AGORA, quando o atendimento abre.
        const garantia = lerGarantiaV3(os, agora);
        rascunhoValidado(os, { motivo: aberto.motivo, observacao: aberto.observacao, garantiaAtiva: garantia.situacao === "ativa" }, recepcao);
        const lista = brutos.map((r) =>
          r.id === aberto.id
            ? {
                ...r,
                operacaoId,
                assinatura,
                garantiaAtivaNaAbertura: garantia.situacao === "ativa",
                garantiaSituacaoNaAbertura: garantia.situacao,
                reserva: { token, expiraEm: new Date(agora.getTime() + RESERVA_RETORNO_TTL_MS).toISOString() },
              }
            : r,
        );
        const proximo = { ...atual, retornosV3: lista, atualizadoEm: nowIso() } as OSPayloadFull;
        const retorno = lerRetornosV3(proximo as unknown as OrdemServico).find((r) => r.id === aberto.id)!;
        const anterior = brutos.find((r) => r.id === aberto.id);
        return { payload: proximo, resultado: { tipo: "criar", os: proximo, retorno, ...(anterior ? { anterior } : {}) } };
      }
      // Reserva expirada de OUTRA operação, sem atendimento: descartada com auditoria.
      brutos = brutos.filter((r) => r.id !== aberto.id);
      extras.push(
        makeEvento("observacao", operador, `Abertura de retorno interrompida descartada (reserva expirada sem atendimento): ${aberto.motivo}.`, {
          evento: "retorno_reserva_descartada",
          retornoId: aberto.id,
          operacaoId: aberto.operacaoId,
        }),
      );
    }

    const retornoId = retornoIdDe(operacaoId);
    if (brutos.some((r) => r.id === retornoId)) throw new Error(MSG_DIVERGENTE);
    const garantia = lerGarantiaV3(os, agora);
    rascunhoValidado(os, { motivo, observacao, garantiaAtiva: garantia.situacao === "ativa" }, recepcao);
    const entrada: RetornoBruto = {
      id: retornoId,
      osOriginalId: id,
      ...(text(os.codigo) ? { osOriginalCodigo: text(os.codigo) } : {}),
      motivo,
      ...(observacao ? { observacao } : {}),
      criadoEm: agora.toISOString(),
      criadoPor: operador,
      status: "aberto",
      garantiaAtivaNaAbertura: garantia.situacao === "ativa",
      garantiaSituacaoNaAbertura: garantia.situacao,
      operacaoId,
      assinatura,
      reserva: { token, expiraEm: new Date(agora.getTime() + RESERVA_RETORNO_TTL_MS).toISOString() },
    };
    const proximo = {
      ...atual,
      retornosV3: [...brutos, entrada],
      timeline: extras.length ? [...timelineDe(atual), ...extras] : timelineDe(atual),
      atualizadoEm: nowIso(),
    } as OSPayloadFull;
    const retorno = lerRetornosV3(proximo as unknown as OrdemServico).find((r) => r.id === retornoId)!;
    return { payload: proximo, resultado: { tipo: "criar", os: proximo, retorno } };
  });

  if (decisao.tipo === "replay") {
    const filhaId = decisao.retorno.osRetornoId;
    // Idempotente: só grava se o evento informativo da filha estiver faltando (reparo).
    const atendimento = filhaId
      ? await registrarEventoNaFilha(sid, { id: filhaId, codigo: decisao.retorno.osRetornoCodigo || filhaId }, decisao.os, decisao.retorno, operador)
      : null;
    return { os: decisao.os, atendimento, situacao: "recuperado", retornoId: decisao.retorno.id };
  }

  if (decisao.tipo === "adotado") {
    await registrarEventoNaFilha(sid, decisao.filha, decisao.os, decisao.retorno, operador);
    emitirAberto(sid, decisao.os, decisao.retorno, decisao.filha);
    if (!decisao.mesmaOperacao) {
      throw new Error(`Já existe um retorno em andamento para esta OS. Continue no atendimento ${decisao.filha.codigo}.`);
    }
    return { os: decisao.os, atendimento: await lerPayloadOS(sid, decisao.filha.id), situacao: "recuperado", retornoId: decisao.retorno.id };
  }

  // ---- 2. Criação da filha FORA da trava, só por quem detém o token ----
  const retorno = decisao.retorno;
  let filha: FilhaRetornoV3;
  let vinculadoNaCompensacao: OSPayloadFull | null = null;
  try {
    const draft = rascunhoValidado(
      decisao.os as unknown as OrdemServico,
      { motivo: retorno.motivo, observacao: retorno.observacao, garantiaAtiva: !!retorno.garantiaAtivaNaAbertura },
      recepcao,
    );
    const codigoOrigem = text(decisao.os.codigo) || id;
    const criado = await criarOSEnterpriseV3(sid, draft, {
      tags: ["retorno-garantia", `origem:${codigoOrigem}`],
      vinculoRetornoV3: {
        osOrigemId: id,
        osOrigemCodigo: text(decisao.os.codigo) || undefined,
        retornoId: retorno.id,
        motivo: retorno.motivo,
        garantiaAtivaNaAbertura: !!retorno.garantiaAtivaNaAbertura,
        garantiaSituacaoNaAbertura: retorno.garantiaSituacaoNaAbertura,
        operacaoId,
      },
    });
    filha = { id: criado.os.id, codigo: text(criado.os.codigo) || criado.os.id };
  } catch (erro) {
    // Compensação sob a trava: a filha pode ter sido gravada antes da falha (adota);
    // senão a PRÓPRIA reserva é removida. Erro nunca vira sucesso silencioso.
    const comp = await travar<{ filha: FilhaRetornoV3; os: OSPayloadFull } | null>(sid, id, async ({ payload }, tx) => {
      const atual = payload as OSPayloadFull;
      const alvo = lerRetornosV3(atual as unknown as OrdemServico).find((r) => r.id === retorno.id);
      if (!alvo || alvo.osRetornoId) return { payload: null, resultado: null };
      const encontrada = await buscarFilhaDoRetornoV3(tx, sid, id, retorno.id);
      if (encontrada) {
        const vinculado = vincularNoPayload(atual, retorno.id, encontrada, operador);
        return { payload: vinculado, resultado: { filha: encontrada, os: vinculado } };
      }
      if (alvo.reserva?.token !== token) return { payload: null, resultado: null };
      // Entrada criada por esta tentativa: some. Entrada PREEXISTENTE retomada (legado): volta
      // exatamente ao que era — relato, observação, autoria e histórico preservados.
      const anterior = decisao.anterior;
      const lista = anterior
        ? retornosBrutos(atual).map((r) => (r.id === retorno.id ? anterior : r))
        : retornosBrutos(atual).filter((r) => r.id !== retorno.id);
      return { payload: { ...atual, retornosV3: lista, atualizadoEm: nowIso() } as OSPayloadFull, resultado: null };
    });
    if (!comp) throw erro;
    filha = comp.filha;
    vinculadoNaCompensacao = comp.os;
  }

  // ---- 3. Vínculo sob a trava (idempotente) ----
  let original: OSPayloadFull;
  // Só quem GRAVOU o vínculo anuncia `os_retorno_aberto` (uma vez por retorno).
  let euVinculei = true;
  if (vinculadoNaCompensacao) {
    original = vinculadoNaCompensacao;
  } else {
    const passo = await travar<
      | { tipo: "vinculado"; os: OSPayloadFull }
      | { tipo: "ja_vinculado"; os: OSPayloadFull }
      | { tipo: "excedente"; valido: FilhaRetornoV3 | null }
    >(sid, id, ({ payload }) => {
      const atual = payload as OSPayloadFull;
      const alvo = lerRetornosV3(atual as unknown as OrdemServico).find((r) => r.id === retorno.id);
      if (!alvo) return { payload: null, resultado: { tipo: "excedente", valido: null } };
      if (alvo.osRetornoId === filha.id) return { payload: null, resultado: { tipo: "ja_vinculado", os: atual } };
      if (alvo.osRetornoId) {
        return { payload: null, resultado: { tipo: "excedente", valido: { id: alvo.osRetornoId, codigo: alvo.osRetornoCodigo || alvo.osRetornoId } } };
      }
      const vinculado = vincularNoPayload(atual, retorno.id, filha, operador);
      return { payload: vinculado, resultado: { tipo: "vinculado", os: vinculado } };
    });
    if (passo.tipo === "excedente") {
      await descartarFilhaExcedente(sid, filha, retorno.id, passo.valido, operador);
      throw new Error(
        passo.valido
          ? `Este retorno já foi aberto no atendimento ${passo.valido.codigo}. O atendimento ${filha.codigo}, criado em paralelo, foi marcado como descartado.`
          : `A abertura deste retorno foi interrompida antes do vínculo; o atendimento ${filha.codigo} foi marcado como descartado. Abra o retorno novamente.`,
      );
    }
    original = passo.os;
    // "ja_vinculado": um retry concorrente da MESMA operação adotou esta filha e já anunciou.
    euVinculei = passo.tipo === "vinculado";
  }

  const retornoFinal = lerRetornosV3(original as unknown as OrdemServico).find((r) => r.id === retorno.id) ?? retorno;
  const atendimento = (await registrarEventoNaFilha(sid, filha, original, retornoFinal, operador)) ?? (await lerPayloadOS(sid, filha.id));
  if (euVinculei) emitirAberto(sid, original, retornoFinal, filha);
  return { os: original, atendimento, situacao: vinculadoNaCompensacao ? "recuperado" : "criado", retornoId: retorno.id };
}

function emitirAberto(storeId: string, os: OSPayloadFull, retorno: RetornoV3, filha: FilhaRetornoV3): void {
  emitirEventoOperacaoV3({
    tipo: "os_retorno_aberto",
    os: os as unknown as OrdemServico,
    storeId,
    origem: "retorno",
    metadata: {
      retornoId: retorno.id,
      motivo: retorno.motivo,
      garantiaAtivaNaAbertura: retorno.garantiaAtivaNaAbertura,
      osRetornoId: filha.id,
      osRetornoCodigo: filha.codigo,
    },
  });
}

/** Finaliza um retorno (conclui o retrabalho). Registra observação + timeline. */
export async function finalizarRetornoV3(storeId: string, osId: string, retornoId: string, input: { observacao?: string } = {}): Promise<OrdemServico> {
  const { id, session } = await carregar(storeId, osId);
  const rid = (retornoId ?? "").trim();
  if (!rid) throw new Error("Retorno não informado.");

  const operador = operadorLabel(session);
  const observacao = (input.observacao ?? "").trim() || undefined;
  const now = nowIso();

  let motivoAlvo = "";
  const sid = (storeId ?? "").trim();
  const salva = await travar<OrdemServico>(sid, id, async ({ payload: bruto }, tx) => {
    const payload = bruto as OSPayloadFull;
    const lista = lerRetornosV3(payload as unknown as OrdemServico);
    const alvo = lista.find((r) => r.id === rid);
    if (!alvo) throw new Error("Retorno não encontrado nesta OS.");
    if (alvo.status === "finalizado") throw new Error("Este retorno já está finalizado.");
    if (retornoEmAberturaV3(alvo)) throw new Error(MSG_EM_PROCESSAMENTO);
    // GOAL 007: retorno ainda SEM vínculo não fecha se já existe atendimento criado para ele
    // (abertura interrompida entre a criação e o vínculo). Fechar aqui deixaria a filha órfã:
    // a reabertura adota esse atendimento (ou descarta a abertura) antes de qualquer final.
    if (!alvo.osRetornoId) {
      const filha = await buscarFilhaDoRetornoV3(tx, sid, id, alvo.id);
      if (filha) {
        throw new Error(
          `Este retorno tem o atendimento ${filha.codigo} criado e ainda não vinculado. Abra o retorno novamente para reconciliar o vínculo antes de finalizar.`,
        );
      }
    }
    motivoAlvo = alvo.motivo;

    const retornos = retornosBrutos(payload).map((r) => {
      if (r.id !== rid) return r;
      const { reserva: _reserva, ...resto } = r;
      void _reserva;
      return { ...resto, status: "finalizado" as const, finalizadoEm: now, finalizadoPor: operador, observacaoFinal: observacao };
    });

    const evento = makeEvento(
      "observacao",
      operador,
      `Retorno finalizado.${observacao ? " " + observacao : ""}`,
      { retornoId: rid, evento: "retorno_finalizado", motivo: alvo.motivo },
    );

    const timeline = timelineDe(payload);
    const proximo = { ...payload, retornosV3: retornos, timeline: [...timeline, evento], atualizadoEm: now } as OSPayloadFull;
    return { payload: proximo, resultado: proximo as unknown as OrdemServico };
  });

  // Espinha de eventos (3C.0): retorno concluído.
  emitirEventoOperacaoV3({
    tipo: "os_retorno_finalizado",
    os: salva,
    storeId: (storeId ?? "").trim(),
    origem: "retorno",
    metadata: { retornoId: rid, motivo: motivoAlvo },
  });
  return salva;
}

// ----------------------------------------------------------------------------
// Leitura para o seletor da OS original (GOAL 007) — sessão + acesso à loja,
// consulta SEMPRE filtrada por storeId no servidor, DTO sem senha/credencial.
// ----------------------------------------------------------------------------

async function exigirLeituraOrigens(storeId: string): Promise<string> {
  const sid = (storeId ?? "").trim();
  assertActiveStoreId(sid, "Operações V3");
  const guard = await requireEnterpriseWith(sid, (p) => p.hubs.operacoes, "Sem permissão para consultar ordens desta unidade.");
  if (!guard.ok) throw new Error(guard.error);
  return sid;
}

/** Busca a OS original por número, cliente (nome/telefone) ou aparelho (marca, modelo, IMEI/série). */
export async function buscarOrigensRetornoV3(storeId: string, termo: string): Promise<OrigemRetornoResumoV4[]> {
  const sid = await exigirLeituraOrigens(storeId);
  const q = (termo ?? "").trim().slice(0, 80);
  if (q.length < 2) return [];
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const digitos = q.replace(/\D/g, "");
  const likeDigitos = digitos.length >= 4 ? `%${digitos}%` : "";
  const rows = await prisma.$queryRaw<Array<{ payload: unknown }>>`
    SELECT "payload"
    FROM "ordens_servico"
    WHERE "storeId" = ${sid}
      AND jsonb_typeof("payload") = 'object'
      AND (
        COALESCE("numero", '') ILIKE ${like}
        OR COALESCE("payload"->>'codigo', '') ILIKE ${like}
        OR COALESCE("payload"->'cliente'->>'nome', '') ILIKE ${like}
        OR concat_ws(' ', "payload"->'equipamento'->>'marca', "payload"->'equipamento'->>'modelo') ILIKE ${like}
        OR COALESCE("payload"->'equipamento'->>'numeroSerie', '') ILIKE ${like}
        OR (${likeDigitos} <> '' AND regexp_replace(
              COALESCE("payload"->'cliente'->>'telefone', '') || ' ' || COALESCE("payload"->'cliente'->>'whatsapp', ''),
              '\\D', '', 'g'
            ) LIKE ${likeDigitos})
      )
    ORDER BY "updatedAt" DESC
    LIMIT ${LIMITE_BUSCA_ORIGENS}
  `;
  const agora = new Date();
  return (Array.isArray(rows) ? rows : [])
    .map((row) => row.payload as OrdemServico | null)
    .filter((os): os is OrdemServico => !!os && typeof os === "object" && !!text(os.id))
    .map((os) => resumirOrigemRetornoV4(os, agora));
}

/** Resumo da OS original pré-selecionada (ficha / portfólio), relido do servidor. `null` = não encontrada nesta loja. */
export async function lerOrigemRetornoV3(storeId: string, osId: string): Promise<OrigemRetornoResumoV4 | null> {
  const sid = await exigirLeituraOrigens(storeId);
  const id = (osId ?? "").trim();
  if (!id) return null;
  const os = await lerPayloadOS(sid, id);
  return os && text(os.id) ? resumirOrigemRetornoV4(os, new Date()) : null;
}
