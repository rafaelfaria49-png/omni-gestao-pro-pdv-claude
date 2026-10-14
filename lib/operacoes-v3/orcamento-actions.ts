"use server";

// ============================================================================
// Operações V3 — Fase 1C · write-path de ORÇAMENTO (side-effect-free)
// ----------------------------------------------------------------------------
// Grava SOMENTE estrutura de orçamento + status do orçamento + status da OS
// (via máquina única) + timeline + histórico de versões. NÃO toca Financeiro
// (Conta a Receber), estoque, garantia, WhatsApp. Não usa `approveOrcamento`/
// `rejectOrcamento` do V2 (que materializam/cancelam cobrança).
//
//   • gerarOrcamentoDaOS  — REUSO do @/api/os (materializa rascunho; seguro).
//   • salvarOrcamentoV3   — edita itens/desconto/brindes + histórico de versão.
//   • enviarOrcamentoV3   — rascunho/enviado → enviado (+ OS → aguardando_aprovacao).
//   • aprovarOrcamentoV3  — → aprovado (+ OS → aprovado pela máquina). Sem financeiro.
//   • recusarOrcamentoV3  — → recusado (+ timeline). Sem outros efeitos.
//   • registrarEnvioOrcamento — auditoria best-effort do canal de envio (mesmo
//     molde de `registrarImpressaoDocumentoV3`); NÃO muda status do orçamento.
// Toda decisão e gravação usa o payload MAIS RECENTE, relido sob a trava da linha
// da OS (`os-payload-lock`) — nunca regrava um snapshot lido antes de um `await`.
// ============================================================================

import { revalidatePath } from "next/cache";
import type { Session } from "next-auth";
import type { Prisma } from "@/generated/prisma";
import type { EventoTimeline, EventoTipo, OrdemServico } from "@/types/os";
import { auth } from "@/auth";
import { requireEnterpriseWith } from "@/lib/auth/guard-enterprise";
import { assertActiveStoreId } from "@/lib/operacoes/assert-active-store";
import { operacaoStatusToPrismaStatus } from "@/components/operacoes/lovable/utils/os-status";
import {
  projetarStatusV2,
  statusOSAposAprovarOrcamento,
  statusOSAposEnviarOrcamento,
  statusV3FromOS,
  type OperacaoStatusV3,
} from "./status-machine";
// Caminho completo (em vez do alias `@/api/os`) para resolver também sob o
// `vitest.config.ts` (só mapeia `@` → raiz, sem os aliases finos do
// tsconfig) — mesmo arquivo físico; permite mockar este módulo em teste
// (mesmo ajuste já aplicado a `cliente-resolver.ts`, GOAL 022).
import { gerarOrcamentoDaOS as gerarOrcamentoDaOSImpl } from "@/components/operacoes/lovable/api/os";
import {
  computeTotaisV3,
  garantiaResultanteAprovacaoV3,
  montarEventoEnvioOrcamentoV3,
  montarEventoRecusaOrcamentoV3,
  recalcOrcamentoV3,
  validarGruposOrcamentoV3,
  validarSelecaoCompletaV3,
  validadeExpiradaV3,
  VALIDADE_PADRAO_DIAS,
  type CanalEnvioOrcamentoV3,
  type OrcamentoV3,
  type OrcamentoVersaoV3,
  type RecusarOrcamentoV3Input,
  type SalvarOrcamentoV3Input,
} from "./orcamento-model";
import { emitirEventoOperacaoV3 } from "./event-publisher";
import { salvarGarantiaOSV3 } from "./garantia-actions";
import { mutarPayloadOSV3 } from "./os-payload-lock";
import { buildOrcamentoRascunhoFromOS } from "@/lib/operacoes/services/orcamento-builder";
import { uid as uidLovable } from "@/components/operacoes/lovable/api/_helpers";
import { prisma } from "@/lib/prisma";
import { getContaReceberByLocalKey } from "@/lib/financeiro/services/contas-receber-service";
import { recebimentoLoteAdvisoryLock } from "@/lib/financeiro/services/recebimento-lote-service";
import { reconciliarRecebimentosFinanceirosV3 } from "./delivery-financial-guard";
import { localKeyContaReceberOSV3 } from "./payment-model";
import { chaveLockRecebimentoMistoV3 } from "./recebimento-misto-service";
import {
  MENSAGEM_GERAR_ORCAMENTO_COM_PAGAMENTO_V3,
  MENSAGEM_GERAR_ORCAMENTO_PAGAMENTOS_EM_CONFERENCIA_V3,
} from "./elegibilidade-comercial";
import {
  conferirFormalizacaoAprovacaoV3 as conferirFormalizacaoAprovacaoImplV3,
  formalizarAprovacaoPendenteV3 as formalizarAprovacaoPendenteImplV3,
  type ConferenciaFormalizacaoResultV3,
  type FormalizacaoAprovacaoResultV3,
} from "./formalizacao-aprovacao-actions";
import {
  conteudoOrcamentoV3,
  escopoAprovacaoOrcamentoV3,
  MENSAGEM_ESCOPO_APROVACAO_ALTERADO_V3,
  type ConferenciaEscopoAprovacaoResultV3,
  type EntradaFormalizacaoV3,
} from "./formalizacao-aprovacao-model";
import {
  diaNaLojaV3,
  fimDoDiaLojaIsoV3,
  formatarDataOperacionalV3,
  formatarDiaDeIsoNaLojaV3,
  hojeNaLojaV3,
  isoInstanteValidoV3,
  lerDatasOSV3,
  somarDiasCivisV3,
} from "./datas-operacionais-model";

/** Conferência + materialização na mesma transação, com os limites dos writers de pagamento. */
const TX_MATERIALIZAR_ORCAMENTO_V3 = { maxWait: 5_000, timeout: 15_000 } as const;

/**
 * Materializa o rascunho a partir dos itens da OS (mesmo construtor puro do @/api/os,
 * `buildOrcamentoRascunhoFromOS`; orçamento real já existente = no-op).
 *
 * GOAL OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-002 (item B): nunca sobre OS cujo título já tem
 * pagamento vigente — o rascunho novo deixaria esse pagamento sem aprovação comercial. Conferência
 * E gravação acontecem na MESMA transação, na ordem de travas dos writers de pagamento (consultiva
 * por OS → linha da OS): nenhum recebimento entra entre as duas, e a expiração da transação desfaz
 * as duas juntas. Nada é apagado ou alterado na recusa (orçamento, título, histórico).
 */
export async function gerarOrcamentoDaOS(storeId: string, osId: string): Promise<OrdemServico> {
  const sid0 = (storeId ?? "").trim();
  const id0 = (osId ?? "").trim();
  // Entrada inválida segue o caminho (e a mensagem) de sempre.
  if (!sid0 || !id0) return gerarOrcamentoDaOSImpl(storeId, osId);
  const { sid, id, session } = await autorizar(sid0, id0);
  const os = await prisma.$transaction(async (tx) => {
    await recebimentoLoteAdvisoryLock(tx, chaveLockRecebimentoMistoV3(sid, id));
    const titulo = await getContaReceberByLocalKey(sid, localKeyContaReceberOSV3(sid, id), tx);
    if (titulo) {
      const recebimentos = reconciliarRecebimentosFinanceirosV3(titulo.payload);
      if (!recebimentos.valido) throw new Error(MENSAGEM_GERAR_ORCAMENTO_PAGAMENTOS_EM_CONFERENCIA_V3);
      if (recebimentos.centavos > 0) throw new Error(MENSAGEM_GERAR_ORCAMENTO_COM_PAGAMENTO_V3);
    }
    return mutarPayloadOSV3({
      storeId: sid,
      osId: id,
      tx,
      mutate: ({ payload }) => {
        const atual = payload.orcamento as { sintetizado?: boolean } | undefined;
        // Orçamento real já persistido: não recria (no-op sobre o estado atual).
        if (atual && typeof atual === "object" && atual.sintetizado !== true) {
          return { payload: null, resultado: payload as unknown as OrdemServico };
        }
        const orcamento = buildOrcamentoRascunhoFromOS(payload as unknown as OrdemServico, { uid: uidLovable, nowIso }) as unknown as OrcamentoV3;
        const { nextPayload, colunas } = montarGravacao(payload as OSPayloadFull, {
          orcamento,
          eventos: [makeEvento("orcamento_criado", operadorLabel(session), "Orçamento gerado a partir dos itens da OS (rascunho editável).")],
        });
        return { payload: nextPayload, colunas, resultado: nextPayload as unknown as OrdemServico };
      },
    });
  }, TX_MATERIALIZAR_ORCAMENTO_V3);
  revalidatePath("/dashboard/operacoes-v3");
  return os;
}

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
function makeEvento(tipo: EventoTipo, autor: string, conteudo: string, metadata?: Record<string, unknown>): EventoTimeline {
  return { id: eventId(), tipo, autor, autorTipo: "usuario", conteudo, metadata, criadoEm: nowIso() };
}

type OSPayloadFull = OrdemServico & Record<string, unknown>;

async function autorizar(storeId: string, osId: string): Promise<{ sid: string; id: string; session: Session | null }> {
  const sid = (storeId ?? "").trim();
  const id = (osId ?? "").trim();
  assertActiveStoreId(sid, "Operações V3");
  if (!id) throw new Error("OS não informada.");

  const session = await auth();
  if (!session?.user?.id) throw new Error("Faça login para editar o orçamento.");
  const guard = await requireEnterpriseWith(sid, (p) => p.operacoes.editarOs, "Sem permissão para editar o orçamento desta OS.");
  if (!guard.ok) throw new Error(guard.error);
  return { sid, id, session };
}

function orcamentoEditavel(payload: OSPayloadFull): OrcamentoV3 {
  const orc = payload.orcamento as (OrcamentoV3 & { sintetizado?: boolean }) | undefined;
  if (!orc || typeof orc !== "object") throw new Error("Esta OS ainda não tem orçamento. Gere o orçamento da OS primeiro.");
  if (orc.sintetizado === true) throw new Error("O orçamento ainda é uma prévia. Gere o orçamento da OS para materializá-lo.");
  return orc;
}

function assertStatus(orc: OrcamentoV3, permitidos: OrcamentoV3["status"][], acao: string): void {
  if (!permitidos.includes(orc.status)) {
    throw new Error(`Não é possível ${acao} um orçamento com status "${orc.status}".`);
  }
}

type GravacaoOrcamentoV3 = { orcamento: OrcamentoV3; eventos: EventoTimeline[]; statusOS?: OperacaoStatusV3 | null; versoes?: OrcamentoVersaoV3[] };

/**
 * Decide (`montar`) e grava sobre o payload MAIS RECENTE, sob a trava da linha da OS, numa
 * única transação. `montar` valida/lança sobre o latest; `extra` volta ao chamador.
 */
async function gravarSobTrava<T>(
  sid: string,
  id: string,
  montar: (payload: OSPayloadFull) => { gravacao: GravacaoOrcamentoV3; extra: T },
): Promise<{ os: OrdemServico; extra: T }> {
  const r = await mutarPayloadOSV3({
    storeId: sid,
    osId: id,
    mutate: ({ payload }) => {
      const { gravacao, extra } = montar(payload);
      const { nextPayload, colunas } = montarGravacao(payload, gravacao);
      return { payload: nextPayload, colunas, resultado: { os: nextPayload as unknown as OrdemServico, extra } };
    },
  });
  revalidatePath("/dashboard/operacoes-v3");
  return r;
}

function montarGravacao(
  payload: OSPayloadFull,
  next: GravacaoOrcamentoV3,
): { nextPayload: OSPayloadFull; colunas: Omit<Prisma.OrdemServicoUpdateInput, "payload"> } {
  const timeline = Array.isArray(payload.timeline) ? (payload.timeline as EventoTimeline[]) : [];
  const nextPayload: OSPayloadFull = {
    ...payload,
    orcamento: next.orcamento,
    timeline: [...timeline, ...next.eventos],
    atualizadoEm: nowIso(),
  };
  if (next.versoes) nextPayload.orcamentoVersoesV3 = next.versoes;

  const colunas: Omit<Prisma.OrdemServicoUpdateInput, "payload"> = {};
  if (next.statusOS) {
    const statusV2 = projetarStatusV2(next.statusOS);
    nextPayload.status = statusV2;
    nextPayload.operacaoStatus = statusV2;
    nextPayload.operacaoStatusV3 = next.statusOS;
    colunas.status = operacaoStatusToPrismaStatus(statusV2);
  }
  // total da OS reflete o total ao cliente do orçamento.
  const totalCliente = computeTotaisV3(next.orcamento).total;
  if (Number.isFinite(totalCliente)) colunas.valorTotal = totalCliente;
  return { nextPayload, colunas };
}

// ----------------------------------------------------------------------------
// Edição de itens / desconto / brindes (+ histórico de versão)
// ----------------------------------------------------------------------------

export async function salvarOrcamentoV3(storeId: string, osId: string, input: SalvarOrcamentoV3Input): Promise<OrdemServico> {
  const { sid, id, session } = await autorizar(storeId, osId);
  const servicosInput = Array.isArray(input.servicos) ? input.servicos : [];
  const pecasInput = Array.isArray(input.pecas) ? input.pecas : [];

  const { os } = await gravarSobTrava(sid, id, (payload) => {
    const atual = orcamentoEditavel(payload);
    assertStatus(atual, ["rascunho", "enviado"], "editar");

    // GOAL OPS-V4-ORC-RAPIDO-024: valida o limite de linhas por grupo de escolha
    // (MAX_LINHAS_POR_GRUPO_V3). Sem `grupoId` em nenhuma linha (caso de sempre
    // até aqui), `validarGruposOrcamentoV3` retorna [] — comportamento inalterado.
    const errosGrupos = validarGruposOrcamentoV3({ pecas: pecasInput, servicos: servicosInput });
    if (errosGrupos.length > 0) throw new Error(errosGrupos[0]);

    const versoesAtuais = Array.isArray(payload.orcamentoVersoesV3) ? (payload.orcamentoVersoesV3 as OrcamentoVersaoV3[]) : [];
    const versao: OrcamentoVersaoV3 = {
      versao: versoesAtuais.length + 1,
      status: atual.status,
      total: atual.total,
      desconto: atual.desconto ?? 0,
      registradoEm: nowIso(),
      registradoPor: operadorLabel(session),
      snapshot: atual,
    };

    // Validade: definida uma única vez (criação da proposta); editar itens nunca a reinicia.
    // Decidida sobre o payload relido sob a trava: uma validade gravada em paralelo é vista.
    let validoAte = atual.validoAte;
    if (input.validoAte !== undefined) {
      if (atual.validoAte) throw new Error("A validade deste orçamento já foi definida. Use “Corrigir datas” para alterá-la.");
      if (!isoInstanteValidoV3(input.validoAte)) throw new Error("Validade do orçamento inválida.");
      // "Válido até" é um DIA civil na loja: vale até o fim desse dia e nunca antes
      // da data do orçamento (mesma regra do formulário e da correção).
      const dia = diaNaLojaV3(input.validoAte);
      const proposta = lerDatasOSV3(payload).proposta;
      if (proposta && dia < proposta.dia) {
        throw new Error(`A validade não pode ser anterior à data do orçamento (${formatarDataOperacionalV3(proposta)}).`);
      }
      validoAte = fimDoDiaLojaIsoV3(dia);
    }

    const editado = recalcOrcamentoV3({
      ...atual,
      servicos: servicosInput,
      pecas: pecasInput,
      desconto: Math.max(0, Number(input.desconto) || 0),
      observacao: input.observacao ?? atual.observacao,
      // GOAL 026: contrato oficial de grupos — ausente preserva os grupos já
      // existentes (chamadores que não editam grupos, ex. editor de itens V4).
      gruposV3: input.gruposV3 ?? atual.gruposV3,
      ...(validoAte ? { validoAte } : {}),
      atualizadoEm: nowIso(),
  });

  return {
    gravacao: {
      orcamento: editado,
      eventos: [makeEvento("orcamento_atualizado", operadorLabel(session), "Orçamento atualizado.", { versao: versao.versao })],
      versoes: [...versoesAtuais, versao],
    },
    extra: null,
  };
  });
  return os;
}

// ----------------------------------------------------------------------------
// Correção de orçamento em OS avançada (GOAL OPS-V4-ORCAMENTO-REABRIR-MOTOR-003)
// ----------------------------------------------------------------------------
// Caminho SEPARADO e explícito para corrigir um orçamento materializado cujo
// valor ficou vazio/perdido numa OS já avançada (aprovada/em execução/pronta/
// recebida/entregue). Diferente de `salvarOrcamentoV3` (que só aceita
// rascunho/enviado), esta action aceita OS avançada: reescreve itens/desconto/
// observação/grupos, recalcula o total e o `valorTotal` da OS, e NÃO muda o
// status da OS (preserva "entregue"/"pronta"/... — não regressa a orçamento).
// Não cria Conta a Receber, não cria venda, não mexe em estoque/caixa — só
// persiste o orçamento + timeline. Com `valorTotal > 0`, os readers financeiros
// (`totalCobravelV3`/`lerPagamentoV3`) passam a ver cobrança pendente e a OS
// fica elegível para recebimento pelos filtros existentes (total > 0).
//
// Status do orçamento é PRESERVADO (ex.: continua "aprovado") — a decisão
// comercial anterior continua de pé; só os itens/valores perdidos são repostos.
// Evento de timeline `orcamento_aprovado_revisado` (tipo já existente em
// `@/types/os`, não toca o union protegido) registra total anterior/novo e a
// origem `operacoes_v4_orcamento_reaberto` para auditoria.
/** Status da OS que admitem correção avançada do orçamento (pós-aprovação). */
const STATUS_CORRECAO_AVANCADA_V3: ReadonlySet<OperacaoStatusV3> = new Set([
  "aprovado",
  "aguardando_peca",
  "em_execucao",
  "pronta",
  "recebida",
  "entregue",
]);

export async function corrigirOrcamentoV3(storeId: string, osId: string, input: SalvarOrcamentoV3Input): Promise<OrdemServico> {
  const { sid, id, session } = await autorizar(storeId, osId);
  const { os } = await gravarSobTrava(sid, id, (payload) => {
    const atual = orcamentoEditavel(payload);

    const statusOS = statusV3FromOS(payload);
    if (!STATUS_CORRECAO_AVANCADA_V3.has(statusOS)) {
      throw new Error(
        statusOS === "cancelada"
          ? "Não é possível corrigir o orçamento de uma OS cancelada."
          : "Correção de orçamento avançada só vale para OS já aprovada/em execução/pronta/recebida/entregue.",
      );
    }

    const servicosInput = Array.isArray(input.servicos) ? input.servicos : [];
    const pecasInput = Array.isArray(input.pecas) ? input.pecas : [];
    const errosGrupos = validarGruposOrcamentoV3({ pecas: pecasInput, servicos: servicosInput });
    if (errosGrupos.length > 0) throw new Error(errosGrupos[0]);

    const totalAnterior = computeTotaisV3(atual).total;

    // Preserva o status do orçamento (ex.: "aprovado") — a correção só reescreve
    // itens/desconto/observação/grupos; a decisão comercial anterior continua de pé.
    const corrigido = recalcOrcamentoV3({
      ...atual,
      servicos: servicosInput,
      pecas: pecasInput,
      desconto: Math.max(0, Number(input.desconto) || 0),
      observacao: input.observacao ?? atual.observacao,
      gruposV3: input.gruposV3 ?? atual.gruposV3,
      atualizadoEm: nowIso(),
  });

  const totalNovo = computeTotaisV3(corrigido).total;

  return {
    gravacao: {
      orcamento: corrigido,
      // Sem `statusOS`: o status da OS (entregue/pronta/...) é preservado.
      eventos: [
        makeEvento(
          "orcamento_aprovado_revisado",
          operadorLabel(session),
          `Orçamento corrigido manualmente. Total anterior R$ ${totalAnterior.toFixed(2).replace(".", ",")} → novo R$ ${totalNovo.toFixed(2).replace(".", ",")}.`,
          { origem: "operacoes_v4_orcamento_reaberto", totalAnterior, totalNovo, correcaoAvancada: true },
        ),
      ],
    },
    extra: null,
  };
  });
  return os;
}

// ----------------------------------------------------------------------------
// Enviar / Aprovar / Recusar
// ----------------------------------------------------------------------------

export async function enviarOrcamentoV3(storeId: string, osId: string): Promise<OrdemServico> {
  const { sid, id, session } = await autorizar(storeId, osId);
  const { os, extra: { enviado, reenvio } } = await gravarSobTrava(sid, id, (payload) => {
    const atual = orcamentoEditavel(payload);
    assertStatus(atual, ["rascunho", "enviado"], "enviar");

    const enviado = recalcOrcamentoV3({
      ...atual,
      status: "enviado",
      // Evento REAL do envio (nunca a data retroativa da proposta).
      enviadoEm: atual.enviadoEm ?? nowIso(),
      // Validade já definida (na proposta ou num envio anterior) é preservada:
      // reenviar nunca prorroga em silêncio. Sem validade, vale o padrão contado em
      // DIAS CIVIS a partir de hoje, até o fim do dia na loja (como as telas leem).
      validoAte: atual.validoAte ?? fimDoDiaLojaIsoV3(somarDiasCivisV3(hojeNaLojaV3(), VALIDADE_PADRAO_DIAS)),
      atualizadoEm: nowIso(),
  });
  const reenvio = atual.status === "enviado";
  return {
    gravacao: {
      orcamento: enviado,
      statusOS: statusOSAposEnviarOrcamento(payload.status),
      eventos: [makeEvento("orcamento_enviado", operadorLabel(session), reenvio ? "Orçamento reenviado ao cliente." : "Orçamento enviado ao cliente.")],
    },
    extra: { enviado, reenvio },
  };
  });

  // Espinha de eventos (3C.0): orçamento materializado e enviado ao cliente.
  emitirEventoOperacaoV3({
    tipo: "os_orcamento_criado",
    os,
    storeId: sid,
    origem: "orcamento",
    metadata: { reenvio, total: computeTotaisV3(enviado).total, validoAte: enviado.validoAte },
  });
  return os;
}

/**
 * Aprova o orçamento. GOAL OPS-V4-ORC-APROVACAO-SELECAO-026: quando o
 * orçamento tem grupos de escolha, EXIGE que toda linha `selecionadaV3`
 * já tenha sido gravada (via `salvarOrcamentoV3` com `gruposV3` — a seleção
 * acontece ANTES de aprovar, num passo separado) — se faltar seleção em
 * qualquer grupo, lança erro e NÃO aprova. Sem grupos, comportamento
 * idêntico ao anterior (N=0). Ao aprovar: congela um snapshot na mesma
 * lista de versões que `salvarOrcamentoV3` já usa (`orcamentoVersoesV3`) e,
 * melhor esforço, aplica a garantia da variante escolhida (a MENOR entre as
 * selecionadas que informam `garantiaDias` — nenhuma falha aqui desfaz a
 * aprovação, que já foi gravada).
 */
export async function aprovarOrcamentoV3(
  storeId: string,
  osId: string,
  opcoes?: { conteudoEsperado?: string },
): Promise<OrdemServico> {
  const { sid, id, session } = await autorizar(storeId, osId);
  const { os, extra: aprovado } = await gravarSobTrava(sid, id, (payload) => {
    const atual = orcamentoEditavel(payload);
    assertStatus(atual, ["rascunho", "enviado"], "aprovar");
    // GOAL OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-002 (item C): com escopo consentido, só aprova o
    // MESMO conteúdo conferido — sob a trava, sobre o payload mais recente.
    if (opcoes?.conteudoEsperado !== undefined && conteudoOrcamentoV3(atual) !== opcoes.conteudoEsperado) {
      throw new Error(MENSAGEM_ESCOPO_APROVACAO_ALTERADO_V3);
    }
    // Proposta vencida continua vencida: renovar a validade é a correção auditada
    // ("Corrigir datas" → Válido até), nunca um efeito colateral do aceite.
    if (validadeExpiradaV3(atual.validoAte)) {
      throw new Error(`Este orçamento venceu em ${formatarDiaDeIsoNaLojaV3(atual.validoAte)}. Para aprovar, atualize o "Válido até" em "Corrigir datas".`);
    }

    const erroSelecao = validarSelecaoCompletaV3(atual);
    if (erroSelecao) throw new Error(erroSelecao);

    const aprovado = recalcOrcamentoV3({
      ...atual,
      status: "aprovado",
      respondidoEm: nowIso(),
      atualizadoEm: nowIso(),
  });

  const versoesAtuais = Array.isArray(payload.orcamentoVersoesV3) ? (payload.orcamentoVersoesV3 as OrcamentoVersaoV3[]) : [];
  const versaoAprovacao: OrcamentoVersaoV3 = {
    versao: versoesAtuais.length + 1,
    status: "aprovado",
    total: aprovado.total,
    desconto: aprovado.desconto ?? 0,
    registradoEm: nowIso(),
    registradoPor: operadorLabel(session),
    // Snapshot congelado: itens (com a seleção já marcada) + total resolvido.
    snapshot: aprovado,
  };

  return {
    gravacao: {
      orcamento: aprovado,
      statusOS: statusOSAposAprovarOrcamento(payload.status),
      eventos: [makeEvento("orcamento_aprovado", operadorLabel(session), "Orçamento aprovado.")],
      versoes: [...versoesAtuais, versaoAprovacao],
    },
    extra: aprovado,
  };
  });

  // Garantia da variante escolhida — melhor esforço (best-effort): se falhar,
  // a aprovação já gravada NÃO é desfeita (efeito auxiliar, não o núcleo da
  // decisão comercial). Nenhuma sobrescrita quando nenhuma variante informa garantia.
  const garantia = garantiaResultanteAprovacaoV3(aprovado);
  if (garantia) {
    await salvarGarantiaOSV3(sid, id, {
      modeloId: "personalizado",
      prazoDias: garantia.prazoDias,
      termoCustom: garantia.rotulo ? `Garantia da opção aprovada: ${garantia.rotulo}.` : undefined,
    }).catch((err) => console.error("[orcamento] aplicar garantia da variante falhou", err));
  }

  // Espinha de eventos (3C.0): aprovação do orçamento.
  emitirEventoOperacaoV3({
    tipo: "os_orcamento_aprovado",
    os,
    storeId: sid,
    origem: "orcamento",
    metadata: { total: computeTotaisV3(aprovado).total },
  });
  return os;
}

/** Quem não pode aprovar recebe a orientação de quem pode (GOAL 002, item C). */
const SEM_PERMISSAO_APROVAR_NO_RECEBIMENTO_V3 =
  "Seu perfil não pode aprovar orçamentos nesta loja. Peça a aprovação a quem pode editar OS (por exemplo, gerente ou administrador).";

/**
 * GOAL OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-002 (item C): a MESMA aprovação de
 * `aprovarOrcamentoV3` (permissão, validações, versão, garantia best-effort) para o
 * "Aprovar e receber", com a recusa DEVOLVIDA em vez de lançada: em build de produção a
 * mensagem de um erro lançado numa Server Action não chega ao navegador, e o operador precisa
 * do motivo (inclusive de quem pode aprovar). Só as recusas da própria regra (`Error` simples)
 * atravessam; falha inesperada vira texto genérico, sem detalhe interno; controle interno do
 * Next (erro com `digest`) segue lançado.
 */
export async function aprovarOrcamentoParaReceberV3(
  storeId: string,
  osId: string,
  esperado: { conteudo: string },
): Promise<{ ok: true } | { ok: false; mensagem: string }> {
  try {
    const guard = await requireEnterpriseWith((storeId ?? "").trim(), (p) => p.operacoes.editarOs, SEM_PERMISSAO_APROVAR_NO_RECEBIMENTO_V3);
    if (!guard.ok) return { ok: false, mensagem: guard.error };
    // A aprovação vale para o escopo que o operador conferiu e o cliente consentiu — nunca "o mais recente".
    const conteudo = typeof esperado?.conteudo === "string" ? esperado.conteudo : "";
    if (!conteudo) return { ok: false, mensagem: "Confira o escopo do orçamento antes de aprovar e receber." };
    await aprovarOrcamentoV3(storeId, osId, { conteudoEsperado: conteudo });
    return { ok: true };
  } catch (e) {
    if (typeof (e as { digest?: unknown } | null)?.digest === "string") throw e;
    if (e instanceof Error && Object.getPrototypeOf(e) === Error.prototype && e.message.trim()) return { ok: false, mensagem: e.message };
    console.error("[orcamento] aprovar no recebimento falhou", e);
    return { ok: false, mensagem: "Não foi possível confirmar a aprovação agora. Confira o orçamento da OS antes de tentar de novo." };
  }
}

/**
 * GOAL OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-002 (item C): leitura do escopo que o operador confere
 * no "Aprovar e receber" (linhas efetivas, total e a assinatura que a aprovação exige depois).
 * Mesma permissão da aprovação; resultado devolvido (legível em produção); não grava nada.
 */
export async function conferirEscopoAprovacaoV3(storeId: string, osId: string): Promise<ConferenciaEscopoAprovacaoResultV3> {
  const sid = (storeId ?? "").trim();
  const id = (osId ?? "").trim();
  if (!sid || !id) return { ok: false, mensagem: "Selecione uma OS na loja ativa para conferir o orçamento." };
  const session = await auth();
  if (!session?.user?.id) return { ok: false, mensagem: "Faça login para conferir o orçamento." };
  const guard = await requireEnterpriseWith(sid, (p) => p.operacoes.editarOs, SEM_PERMISSAO_APROVAR_NO_RECEBIMENTO_V3);
  if (!guard.ok) return { ok: false, mensagem: guard.error };
  const row = await prisma.ordemServico.findFirst({ where: { id, storeId: sid }, select: { payload: true } });
  if (!row) return { ok: false, mensagem: "OS não encontrada nesta loja." };
  return escopoAprovacaoOrcamentoV3(row.payload);
}

/**
 * Recusa o orçamento. Aceita a entrada estruturada `{motivo, observacao?}`
 * (GOAL OPS-V4-ORC-APROVACAO-SELECAO-026) OU uma string livre legada —
 * chamadores antigos (ex. `use-orcamento-v3.ts`, hub V3) continuam
 * funcionando sem mudança. Transição de status preservada (nenhuma nova).
 */
export async function recusarOrcamentoV3(
  storeId: string,
  osId: string,
  motivo?: string | RecusarOrcamentoV3Input,
): Promise<OrdemServico> {
  const { sid, id, session } = await autorizar(storeId, osId);
  const { os } = await gravarSobTrava(sid, id, (payload) => {
    const atual = orcamentoEditavel(payload);
    assertStatus(atual, ["rascunho", "enviado"], "recusar");

    const recusado = recalcOrcamentoV3({
      ...atual,
      status: "recusado",
      respondidoEm: nowIso(),
      atualizadoEm: nowIso(),
  });
  const evt = montarEventoRecusaOrcamentoV3(motivo);
  return {
    gravacao: {
      orcamento: recusado,
      eventos: [makeEvento("orcamento_recusado", operadorLabel(session), evt.conteudo, Object.keys(evt.metadata).length ? evt.metadata : undefined)],
    },
    extra: null,
  };
  });
  return os;
}

// ----------------------------------------------------------------------------
// "Formalizar aprovação pendente" (GOAL OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-002, item D)
// ----------------------------------------------------------------------------
// Ponto de entrada do domínio de orçamento para as telas; regras, permissões, travas e
// idempotência vivem em `formalizacao-aprovacao-actions.ts`.

export async function conferirFormalizacaoAprovacaoV3(storeId: string, osId: string): Promise<ConferenciaFormalizacaoResultV3> {
  return conferirFormalizacaoAprovacaoImplV3(storeId, osId);
}

export async function formalizarAprovacaoPendenteV3(
  storeId: string,
  osId: string,
  input: EntradaFormalizacaoV3,
): Promise<FormalizacaoAprovacaoResultV3> {
  return formalizarAprovacaoPendenteImplV3(storeId, osId, input);
}

// ----------------------------------------------------------------------------
// Registro de envio por canal (auditoria — não muda status do orçamento)
// ----------------------------------------------------------------------------

/**
 * Registra na timeline que o orçamento foi enviado ao cliente por um canal
 * específico (WhatsApp/impresso/presencial/outro). Best-effort, mesmo molde de
 * `registrarImpressaoDocumentoV3` (garantia-actions.ts): só grava evento +
 * timeline, NÃO altera `orcamento.status`/`validoAte` — complementa
 * `enviarOrcamentoV3` (que já muda status) para os casos em que o canal
 * precisa ficar auditado (reenvio por outro canal, envio manual/presencial).
 */
export async function registrarEnvioOrcamento(
  storeId: string,
  osId: string,
  canal: CanalEnvioOrcamentoV3,
): Promise<OrdemServico> {
  const { sid, id, session } = await autorizar(storeId, osId);
  const nextPayload = await mutarPayloadOSV3({
    storeId: sid,
    osId: id,
    mutate: ({ payload }) => {
      const atual = orcamentoEditavel(payload);
      const totalSnapshot = computeTotaisV3(atual).total;
      const evt = montarEventoEnvioOrcamentoV3(canal, totalSnapshot);
      const evento = makeEvento(evt.tipo, operadorLabel(session), evt.conteudo, evt.metadata);
      const timeline = Array.isArray(payload.timeline) ? (payload.timeline as EventoTimeline[]) : [];
      const proximo: OSPayloadFull = { ...payload, timeline: [...timeline, evento] };
      return { payload: proximo, resultado: proximo };
    },
  });
  revalidatePath("/dashboard/operacoes-v3");
  return nextPayload as unknown as OrdemServico;
}
