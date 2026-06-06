// ============================================================================
// Operações V3 — Fase 3C.0 · MODELO DE EVENTOS (fonte de verdade, PURA)
// ----------------------------------------------------------------------------
// Módulo PURO (sem I/O, sem React, sem Prisma, sem WhatsApp). Define os eventos
// oficiais que a Operações V3 PRODUZ e o formato consistente do payload.
//
// Esta fase (3C.0) é PRODUTORA-ONLY: a V3 deixa de ser muda e passa a anunciar
// o que acontece. NÃO há entrega externa aqui (Meta/WhatsApp/Portal/Prisma são
// proibidos no escopo) — o consumo real (notificação) é fase posterior (3C.1+),
// que se conecta via `subscribeOperacaoEventoV3` SEM tocar este modelo.
//
// Coerência timeline × status × evento: o `status` do evento é derivado da OS
// pela MÁQUINA ÚNICA (`statusV3FromOS`), exatamente a mesma fonte que a timeline
// usa — então evento e timeline nunca divergem por construção.
// ============================================================================

import { type OperacaoStatusV3, statusV3FromOS } from "./status-machine";

// ----------------------------------------------------------------------------
// 1. Inventário de eventos — os 10 eventos oficiais da V3.
// ----------------------------------------------------------------------------

export type OperacaoEventoV3Tipo =
  | "os_criada"
  | "os_orcamento_criado"
  | "os_orcamento_aprovado"
  | "os_aguardando_peca"
  | "os_pronta"
  | "os_entregue"
  | "os_garantia_criada"
  | "os_garantia_expirada"
  | "os_retorno_aberto"
  | "os_retorno_finalizado";

export interface EventoMetaV3 {
  tipo: OperacaoEventoV3Tipo;
  label: string;
  /** Resumo do que o evento significa no ciclo da OS. */
  descricao: string;
  /** Onde (qual write-path) deveria emiti-lo. "—" = sem emissor nesta fase. */
  origemEsperada: string;
}

/**
 * Catálogo dos eventos. `os_garantia_expirada` é DEFINIDO mas NÃO EMITIDO na
 * 3C.0 — depende de um gatilho temporal (job/cron), fora do escopo desta fase
 * (a expiração hoje é derivada na leitura por `pos-venda-model`). Documentado
 * como honesto: o tipo existe para o ecossistema, o emissor chega na 3C.3.
 */
export const EVENTOS_V3: Record<OperacaoEventoV3Tipo, EventoMetaV3> = {
  os_criada: {
    tipo: "os_criada",
    label: "OS criada",
    descricao: "Uma nova ordem de serviço foi aberta.",
    origemEsperada: "nova-os-actions:criarOSEnterpriseV3",
  },
  os_orcamento_criado: {
    tipo: "os_orcamento_criado",
    label: "Orçamento criado",
    descricao: "O orçamento foi materializado e enviado ao cliente.",
    origemEsperada: "orcamento-actions:enviarOrcamentoV3",
  },
  os_orcamento_aprovado: {
    tipo: "os_orcamento_aprovado",
    label: "Orçamento aprovado",
    descricao: "O orçamento da OS foi aprovado.",
    origemEsperada: "orcamento-actions:aprovarOrcamentoV3",
  },
  os_aguardando_peca: {
    tipo: "os_aguardando_peca",
    label: "Aguardando peça",
    descricao: "A OS entrou em espera por peça.",
    origemEsperada: "status-actions:aplicarTransicaoStatusV3(aguardando_peca)",
  },
  os_pronta: {
    tipo: "os_pronta",
    label: "OS pronta",
    descricao: "O equipamento está pronto para retirada/entrega.",
    origemEsperada: "status-actions:aplicarTransicaoStatusV3(pronta)",
  },
  os_entregue: {
    tipo: "os_entregue",
    label: "OS entregue",
    descricao: "O equipamento foi entregue ao cliente.",
    origemEsperada: "entrega-actions:registrarEntregaV3 · status-actions(entregue)",
  },
  os_garantia_criada: {
    tipo: "os_garantia_criada",
    label: "Garantia criada",
    descricao: "A garantia prevista da OS foi definida/alterada.",
    origemEsperada: "garantia-actions:salvarGarantiaOSV3",
  },
  os_garantia_expirada: {
    tipo: "os_garantia_expirada",
    label: "Garantia expirada",
    descricao: "A garantia da OS expirou (gatilho temporal — fase 3C.3).",
    origemEsperada: "— (sem emissor na 3C.0; requer job/cron)",
  },
  os_retorno_aberto: {
    tipo: "os_retorno_aberto",
    label: "Retorno aberto",
    descricao: "Um retorno/retrabalho em garantia foi aberto.",
    origemEsperada: "retorno-actions:abrirRetornoV3",
  },
  os_retorno_finalizado: {
    tipo: "os_retorno_finalizado",
    label: "Retorno finalizado",
    descricao: "Um retorno/retrabalho foi concluído.",
    origemEsperada: "retorno-actions:finalizarRetornoV3",
  },
};

export const EVENTOS_V3_LIST: OperacaoEventoV3Tipo[] = Object.keys(EVENTOS_V3) as OperacaoEventoV3Tipo[];

export function isOperacaoEventoV3Tipo(v: unknown): v is OperacaoEventoV3Tipo {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(EVENTOS_V3, v);
}

// ----------------------------------------------------------------------------
// 2. Payload consistente do evento.
// ----------------------------------------------------------------------------

export interface OperacaoEventoV3Payload {
  /** Tipo do evento (um dos 10 oficiais). */
  tipo: OperacaoEventoV3Tipo;
  /** Id real da OS (Prisma). */
  osId: string;
  /** Código humano (ex.: OS-2026-00123). */
  numeroOS: string;
  /** Id do cliente cadastrado vinculado à OS (pode ser vazio em dados legados). */
  clienteId: string;
  /** Nome do cliente (snapshot da OS). */
  clienteNome: string;
  /** Status V3 da OS no momento do evento (mesma fonte da timeline). */
  status: OperacaoStatusV3;
  /** storeId da loja dona da OS (multi-loja). */
  loja: string;
  /** ISO-8601 do instante do evento. */
  timestamp: string;
  /** Contexto adicional — inclui `origem` (write-path emissor) e dados do evento. */
  metadata: Record<string, unknown>;
}

/** Forma mínima de OS que o construtor de evento lê. `OrdemServico` a satisfaz. */
export interface OSParaEventoV3 {
  id?: string;
  codigo?: string;
  clienteId?: string;
  cliente?: { id?: string; nome?: string } | null;
  status?: unknown;
  operacaoStatus?: unknown;
  operacaoStatusV3?: unknown;
}

export interface ConstruirEventoV3Params {
  tipo: OperacaoEventoV3Tipo;
  /** A OS já no estado pós-mudança (para o status casar com a timeline). */
  os: OSParaEventoV3;
  storeId: string;
  /** Write-path que originou o evento (observabilidade). Vai para metadata.origem. */
  origem?: string;
  /** Dados extras do evento (mesclados em metadata). */
  metadata?: Record<string, unknown>;
  /** Override do timestamp (testes/determinismo). Default: agora. */
  at?: string;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Constrói o payload do evento a partir de uma OS. Função PURA e determinística
 * (com `at` fixo). Lê o status pela máquina única — mesma fonte da timeline.
 */
export function construirEventoV3(params: ConstruirEventoV3Params): OperacaoEventoV3Payload {
  const { tipo, os, storeId } = params;
  const cliente = (os.cliente ?? {}) as { id?: string; nome?: string };
  const metadata: Record<string, unknown> = { ...(params.metadata ?? {}) };
  const origem = str(params.origem);
  if (origem) metadata.origem = origem;

  return {
    tipo,
    osId: str(os.id),
    numeroOS: str(os.codigo),
    clienteId: str(os.clienteId) || str(cliente.id),
    clienteNome: str(cliente.nome),
    status: statusV3FromOS(os as Parameters<typeof statusV3FromOS>[0]),
    loja: str(storeId),
    timestamp: params.at ?? new Date().toISOString(),
    metadata,
  };
}

// ----------------------------------------------------------------------------
// 3. Validação — barra eventos malformados antes de publicar.
// ----------------------------------------------------------------------------

export interface VereditoEventoV3 {
  ok: boolean;
  motivo?: string;
}

function timestampValido(ts: unknown): boolean {
  if (typeof ts !== "string" || !ts.trim()) return false;
  const t = Date.parse(ts);
  return Number.isFinite(t);
}

/**
 * Requisitos duros: tipo oficial, `osId`, `loja` e `timestamp` válidos. Os
 * campos de cliente/numeroOS são tolerantes (dados legados podem faltar) — sua
 * ausência não invalida o evento, apenas reduz a riqueza para o consumidor.
 */
export function validarEventoV3(evento: Partial<OperacaoEventoV3Payload> | null | undefined): VereditoEventoV3 {
  if (!evento || typeof evento !== "object") return { ok: false, motivo: "Evento ausente." };
  if (!isOperacaoEventoV3Tipo(evento.tipo)) return { ok: false, motivo: `Tipo de evento inválido: ${String(evento.tipo)}.` };
  if (!str(evento.osId)) return { ok: false, motivo: "Evento sem osId." };
  if (!str(evento.loja)) return { ok: false, motivo: "Evento sem loja (storeId)." };
  if (!timestampValido(evento.timestamp)) return { ok: false, motivo: "Evento com timestamp inválido." };
  return { ok: true };
}

// ----------------------------------------------------------------------------
// 4. Mapa status → evento (integração com a máquina única).
// Apenas os status que correspondem a um evento de negócio do inventário.
// As demais transições da máquina não têm evento dedicado nesta fase.
// ----------------------------------------------------------------------------

const STATUS_PARA_EVENTO: Partial<Record<OperacaoStatusV3, OperacaoEventoV3Tipo>> = {
  aguardando_peca: "os_aguardando_peca",
  pronta: "os_pronta",
  entregue: "os_entregue",
};

/**
 * Evento de negócio correspondente a um status-alvo da máquina única, ou `null`
 * quando aquele status não tem evento dedicado (ex.: diagnostico, em_execucao,
 * recebida, cancelada). Mantém um único ponto de mapeamento status→evento.
 */
export function statusV3ParaEvento(status: unknown): OperacaoEventoV3Tipo | null {
  if (typeof status !== "string") return null;
  return STATUS_PARA_EVENTO[status as OperacaoStatusV3] ?? null;
}
