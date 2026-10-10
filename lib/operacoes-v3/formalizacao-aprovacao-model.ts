// ============================================================================
// Operações V3 — "Formalizar aprovação pendente" · modelo PURO
// (GOAL OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-002, item D)
// ----------------------------------------------------------------------------
// Ação administrativa EXCEPCIONAL para OS que já têm pagamento vigente sobre um
// orçamento ainda em rascunho/enviado. Os caminhos canônicos não servem com
// segurança: `aprovarOrcamentoV3` recusa vencido, regrava `valorTotal`, pode trocar
// a garantia e registra uma aprovação comum, apagando a ordem real dos fatos.
//
// A formalização é um ATO NOVO e auditável do responsável — nunca a aprovação
// original do cliente: não retrodata, não renova validade e não altera preço,
// serviços, garantia, Conta a Receber, Caixa, pagamentos, status técnico ou
// entrega. Valores iguais são condição necessária, não prova de autorização.
// Sem I/O: a action lê e trava; aqui só se decide sobre o estado lido.
// ============================================================================

import type { EventoTimeline, OrdemServico } from "@/types/os";
import { reconciliarRecebimentosFinanceirosV3 } from "./delivery-financial-guard";
import {
  computeTotaisV3,
  orcamentoRealV3,
  validadeExpiradaV3,
  validarSelecaoCompletaV3,
  type OrcamentoV3,
  type OrcamentoVersaoV3,
} from "./orcamento-model";
import { localKeyContaReceberOSV3 } from "./payment-model";
import { OPERACAO_ID_PATTERN_V3 } from "./recebimento-misto-model";
import { statusV3FromOS } from "./status-machine";

export const NATUREZA_FORMALIZACAO_APROVACAO_V3 = "formalizacao_aprovacao_pendente" as const;

/** Texto da declaração que o responsável aceita (gravado junto com quem e quando). */
export const DECLARACAO_FORMALIZACAO_APROVACAO_V3 =
  "Declaro, como responsável, que o cliente aprovou este escopo e este total, e que esta formalização é registrada agora, sem substituir a data real dos fatos.";

export const MOTIVO_FORMALIZACAO_MIN_V3 = 10;
export const MOTIVO_FORMALIZACAO_MAX_V3 = 500;
export const EVIDENCIA_FORMALIZACAO_MAX_V3 = 300;

export type CodigoFormalizacaoV3 =
  | "entrada_invalida"
  | "nao_autenticado"
  | "sem_permissao"
  | "os_nao_encontrada"
  | "os_cancelada"
  | "nao_pendente"
  | "orcamento_ilegivel"
  | "escopo_incompleto"
  | "titulo_nao_verificavel"
  | "sem_pagamento_vigente"
  | "valores_divergentes"
  | "vencido_sem_ratificacao"
  | "escopo_divergente"
  | "idempotencia_conflito"
  | "conflito_concorrente";

export interface RecusaFormalizacaoV3 {
  ok: false;
  code: CodigoFormalizacaoV3;
  mensagem: string;
}

/** Linha do orçamento como o responsável a confere (exibição). */
export interface LinhaEscopoFormalizacaoV3 {
  tipo: "servico" | "peca";
  id: string;
  descricao: string;
  quantidade: number | null;
  /** Valor da linha ao cliente (centavos) quando legível; `null` caso contrário. */
  valorCentavos: number | null;
}

/** Lançamento financeiro do título (pagamento, liquidação ou estorno), na ordem do histórico. */
export interface LancamentoEscopoFormalizacaoV3 {
  tipo: "pagamento" | "liquidacao" | "estorno_pagamento";
  valorCentavos: number;
  operacaoId: string | null;
  em: string | null;
}

/**
 * Assinatura do escopo que o responsável viu: orçamento (conteúdo exato das linhas, revisão,
 * totais), título vinculado e lançamentos vigentes. O servidor recalcula sob a trava e exige
 * igualdade canônica — qualquer mudança no meio é conflito, nunca correção automática.
 */
export interface EscopoFormalizacaoV3 {
  versao: 1;
  osId: string;
  orcamento: {
    id: string | null;
    status: "rascunho" | "enviado";
    /** Versões já registradas do orçamento (`orcamentoVersoesV3`). */
    revisao: number;
    atualizadoEm: string | null;
    validoAte: string | null;
    linhas: LinhaEscopoFormalizacaoV3[];
    descontoCentavos: number;
    totalCentavos: number;
    /** Conteúdo exato (canônico) de serviços, peças, desconto e grupos. */
    conteudo: string;
  };
  titulo: { id: string; valorCentavos: number; status: string };
  lancamentos: LancamentoEscopoFormalizacaoV3[];
  recebidoLiquidoCentavos: number;
}

export interface TituloFormalizacaoV3 {
  id: string;
  storeId: string;
  localKey: string | null;
  valor: number;
  status: string;
  payload: unknown;
}

export interface EstadoFormalizacaoV3 {
  storeId: string;
  osId: string;
  payload: OrdemServico & Record<string, unknown>;
  /** Coluna `valorTotal` da OS. */
  prismaValorTotal: number;
  titulo: TituloFormalizacaoV3 | null;
  /** Instante da decisão (ms). */
  agora: number;
}

export type MontagemEscopoFormalizacaoV3 = { ok: true; escopo: EscopoFormalizacaoV3; vencido: boolean } | RecusaFormalizacaoV3;

export interface EntradaFormalizacaoV3 {
  operacaoId: string;
  motivo: string;
  declaracaoAceita: boolean;
  evidencia?: string | null;
  escopo: EscopoFormalizacaoV3;
  /** Obrigatório (true) quando o orçamento está vencido: ratificação no momento atual. */
  ratificarVencido?: boolean;
}

export interface EntradaFormalizacaoNormalizadaV3 {
  operacaoId: string;
  motivo: string;
  evidencia: string | null;
  escopo: EscopoFormalizacaoV3;
  ratificarVencido: boolean;
}

/** Registro persistido em `payload.formalizacaoAprovacaoV3` (ato atual, auditável). */
export interface RegistroFormalizacaoAprovacaoV3 {
  versao: 1;
  natureza: typeof NATUREZA_FORMALIZACAO_APROVACAO_V3;
  /** Ato do responsável no momento do registro — não é a aprovação original do cliente. */
  atoAtual: true;
  operacaoId: string;
  requestFingerprint: string;
  motivo: string;
  declaracao: string;
  evidencia: string | null;
  escopo: EscopoFormalizacaoV3;
  orcamentoStatusAnterior: "rascunho" | "enviado";
  validoAte: string | null;
  vencido: boolean;
  vencimentoRatificado: boolean;
  formalizadoPorId: string;
  formalizadoPorNome: string;
  formalizadoEm: string;
}

export type VersaoFormalizacaoV3 = OrcamentoVersaoV3 & {
  natureza: typeof NATUREZA_FORMALIZACAO_APROVACAO_V3;
  operacaoId: string;
};

const FORMALIZACAO_CAMPO = "formalizacaoAprovacaoV3";

function recusa(code: CodigoFormalizacaoV3, mensagem: string): RecusaFormalizacaoV3 {
  return { ok: false, code, mensagem };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Centavos de um número finito ≥ 0 — sem coerção de texto/objeto. */
function centavosEstritos(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return null;
  return Math.round(v * 100);
}

function textoOuNull(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/**
 * JSON canônico (chaves ordenadas, sem `undefined`). Monta o texto diretamente — nunca
 * atribui chaves num objeto novo, então `__proto__`/`constructor` são só dados.
 */
export function canonicoFormalizacaoV3(valor: unknown): string {
  if (valor === null || typeof valor === "number" || typeof valor === "boolean" || typeof valor === "string") {
    return JSON.stringify(typeof valor === "number" && !Number.isFinite(valor) ? null : valor);
  }
  if (Array.isArray(valor)) return `[${valor.map((v) => (v === undefined ? "null" : canonicoFormalizacaoV3(v))).join(",")}]`;
  if (isRecord(valor)) {
    const chaves = Object.keys(valor).filter((k) => valor[k] !== undefined).sort();
    return `{${chaves.map((k) => `${JSON.stringify(k)}:${canonicoFormalizacaoV3(valor[k])}`).join(",")}}`;
  }
  return "null";
}

function linhasDeExibicao(orc: OrcamentoV3): LinhaEscopoFormalizacaoV3[] {
  const servicos = Array.isArray(orc.servicos) ? (orc.servicos as unknown[]) : [];
  const pecas = Array.isArray(orc.pecas) ? (orc.pecas as unknown[]) : [];
  return [
    ...servicos.map((s): LinhaEscopoFormalizacaoV3 => {
      const r = isRecord(s) ? s : {};
      return { tipo: "servico", id: textoOuNull(r.id) ?? "", descricao: textoOuNull(r.descricao) ?? "", quantidade: null, valorCentavos: centavosEstritos(r.valor) };
    }),
    ...pecas.map((p): LinhaEscopoFormalizacaoV3 => {
      const r = isRecord(p) ? p : {};
      const quantidade = typeof r.quantidade === "number" && Number.isFinite(r.quantidade) ? r.quantidade : null;
      const unitario = centavosEstritos(r.valorUnitario);
      return {
        tipo: "peca",
        id: textoOuNull(r.id) ?? "",
        descricao: textoOuNull(r.nome) ?? "",
        quantidade,
        valorCentavos: quantidade !== null && unitario !== null ? Math.round(quantidade * unitario) : null,
      };
    }),
  ];
}

function lancamentosDoTitulo(payload: unknown): LancamentoEscopoFormalizacaoV3[] | null {
  if (!isRecord(payload)) return [];
  const historico = payload.historico;
  if (historico == null) return [];
  if (!Array.isArray(historico)) return null;
  const lancamentos: LancamentoEscopoFormalizacaoV3[] = [];
  for (const evento of historico) {
    if (!isRecord(evento)) continue;
    const tipo = String(evento.tipo ?? "").trim().toLowerCase();
    if (tipo !== "pagamento" && tipo !== "liquidacao" && tipo !== "estorno_pagamento") continue;
    const valor = typeof evento.valor === "number" ? evento.valor : Number(evento.valor);
    if (!Number.isFinite(valor) || valor < 0) return null;
    const operacaoId = textoOuNull(evento.loteId) ?? textoOuNull(evento.operacaoId);
    lancamentos.push({ tipo, valorCentavos: Math.round(valor * 100), operacaoId, em: textoOuNull(evento.at) ?? textoOuNull(evento.data) });
  }
  return lancamentos;
}

/**
 * Pré-condições + escopo, sobre o estado atual (a action chama sob as travas dos writers de
 * pagamento). Nada aqui decide a favor por aproximação: qualquer fonte divergente recusa.
 */
export function montarEscopoFormalizacaoV3(estado: EstadoFormalizacaoV3): MontagemEscopoFormalizacaoV3 {
  const { storeId, osId, payload } = estado;
  if (!isRecord(payload)) return recusa("os_nao_encontrada", "OS sem dados compatíveis nesta loja.");
  if (statusV3FromOS(payload) === "cancelada") return recusa("os_cancelada", "OS cancelada não tem aprovação a formalizar.");

  const real = orcamentoRealV3(payload);
  if (!real || (real.status !== "rascunho" && real.status !== "enviado")) {
    return recusa("nao_pendente", "Esta OS não tem orçamento aguardando aprovação. Nada a formalizar.");
  }

  let totalCentavos: number | null;
  try {
    totalCentavos = centavosEstritos(computeTotaisV3({ servicos: real.servicos, pecas: real.pecas, desconto: real.desconto }).total);
    const erroSelecao = validarSelecaoCompletaV3(real);
    if (erroSelecao) return recusa("escopo_incompleto", `O escopo do orçamento não está fechado: ${erroSelecao}`);
  } catch {
    return recusa("orcamento_ilegivel", "O orçamento está fora do formato esperado. Confira o orçamento antes de formalizar.");
  }
  const declaradoCentavos = centavosEstritos(real.total);
  const descontoCentavos = real.desconto === undefined || real.desconto === null ? 0 : centavosEstritos(real.desconto);
  if (totalCentavos === null || declaradoCentavos === null || descontoCentavos === null) {
    return recusa("orcamento_ilegivel", "O total do orçamento não é legível. Confira o orçamento antes de formalizar.");
  }

  const titulo = estado.titulo;
  const localKey = localKeyContaReceberOSV3(storeId, osId);
  const tituloPayload = titulo && isRecord(titulo.payload) ? titulo.payload : {};
  if (
    !titulo ||
    titulo.storeId !== storeId ||
    titulo.localKey !== localKey ||
    (typeof tituloPayload.ordemServicoId === "string" && tituloPayload.ordemServicoId !== osId)
  ) {
    return recusa("titulo_nao_verificavel", "Não há Conta a Receber verificável desta OS nesta loja. Confira o Financeiro.");
  }
  const statusTitulo = String(titulo.status ?? "").trim().toLowerCase();
  if (statusTitulo === "cancelado" || statusTitulo === "estornado") {
    return recusa("titulo_nao_verificavel", "A Conta a Receber desta OS está cancelada ou estornada. Nada a formalizar.");
  }
  const valorTituloCentavos = centavosEstritos(titulo.valor);
  const recebimentos = reconciliarRecebimentosFinanceirosV3(titulo.payload);
  const lancamentos = lancamentosDoTitulo(titulo.payload);
  if (valorTituloCentavos === null || !recebimentos.valido || lancamentos === null || recebimentos.centavos > valorTituloCentavos) {
    return recusa("titulo_nao_verificavel", "O histórico da Conta a Receber não permite conferir os pagamentos. Confira o Financeiro.");
  }
  if (recebimentos.centavos <= 0) {
    return recusa("sem_pagamento_vigente", "Esta OS não tem pagamento vigente. Aprove o orçamento pelo caminho normal.");
  }

  const colunaCentavos = centavosEstritos(estado.prismaValorTotal);
  const temValorLegado = Object.prototype.hasOwnProperty.call(payload, "valorTotal");
  const legadoCentavos = temValorLegado ? centavosEstritos(payload.valorTotal) : null;
  const fontes = [declaradoCentavos, valorTituloCentavos, colunaCentavos, ...(temValorLegado ? [legadoCentavos] : [])];
  if (fontes.some((f) => f !== totalCentavos)) {
    return recusa(
      "valores_divergentes",
      "Orçamento, Conta a Receber e total da OS não conferem em centavos. Nada foi alterado — confira os valores antes de formalizar.",
    );
  }

  const versoes = Array.isArray(payload.orcamentoVersoesV3) ? payload.orcamentoVersoesV3.length : 0;
  const validoAte = textoOuNull(real.validoAte);
  const vencido = validadeExpiradaV3(validoAte, estado.agora);
  const escopo: EscopoFormalizacaoV3 = {
    versao: 1,
    osId,
    orcamento: {
      id: textoOuNull(real.id),
      status: real.status,
      revisao: versoes,
      atualizadoEm: textoOuNull(real.atualizadoEm),
      validoAte,
      linhas: linhasDeExibicao(real),
      descontoCentavos,
      totalCentavos,
      conteudo: canonicoFormalizacaoV3({
        servicos: real.servicos ?? null,
        pecas: real.pecas ?? null,
        desconto: real.desconto ?? null,
        gruposV3: real.gruposV3 ?? null,
      }),
    },
    titulo: { id: titulo.id, valorCentavos: valorTituloCentavos, status: statusTitulo },
    lancamentos,
    recebidoLiquidoCentavos: recebimentos.centavos,
  };
  return { ok: true, escopo, vencido };
}

/** Entrada do responsável (sem consultar o banco). */
export function normalizarEntradaFormalizacaoV3(input: unknown): { ok: true; valor: EntradaFormalizacaoNormalizadaV3 } | RecusaFormalizacaoV3 {
  if (!isRecord(input)) return recusa("entrada_invalida", "Dados da formalização ausentes.");
  const operacaoId = typeof input.operacaoId === "string" ? input.operacaoId.trim() : "";
  if (!OPERACAO_ID_PATTERN_V3.test(operacaoId)) return recusa("entrada_invalida", "Identificador da operação inválido.");
  const motivo = typeof input.motivo === "string" ? input.motivo.trim() : "";
  if (motivo.length < MOTIVO_FORMALIZACAO_MIN_V3) {
    return recusa("entrada_invalida", `Explique o motivo da formalização (mínimo de ${MOTIVO_FORMALIZACAO_MIN_V3} caracteres).`);
  }
  if (motivo.length > MOTIVO_FORMALIZACAO_MAX_V3) return recusa("entrada_invalida", `O motivo passa de ${MOTIVO_FORMALIZACAO_MAX_V3} caracteres.`);
  if (input.declaracaoAceita !== true) return recusa("entrada_invalida", "Aceite a declaração do responsável para formalizar.");
  const evidenciaBruta = input.evidencia;
  if (evidenciaBruta !== undefined && evidenciaBruta !== null && typeof evidenciaBruta !== "string") {
    return recusa("entrada_invalida", "Referência de evidência inválida.");
  }
  const evidencia = typeof evidenciaBruta === "string" && evidenciaBruta.trim() ? evidenciaBruta.trim() : null;
  if (evidencia && evidencia.length > EVIDENCIA_FORMALIZACAO_MAX_V3) {
    return recusa("entrada_invalida", `A referência de evidência passa de ${EVIDENCIA_FORMALIZACAO_MAX_V3} caracteres.`);
  }
  if (!isRecord(input.escopo) || input.escopo.versao !== 1) return recusa("entrada_invalida", "Confira o escopo antes de formalizar.");
  if (input.ratificarVencido !== undefined && typeof input.ratificarVencido !== "boolean") {
    return recusa("entrada_invalida", "Confirmação de ratificação inválida.");
  }
  return {
    ok: true,
    valor: {
      operacaoId,
      motivo,
      evidencia,
      escopo: input.escopo as unknown as EscopoFormalizacaoV3,
      ratificarVencido: input.ratificarVencido === true,
    },
  };
}

/** Identidade de CONTEÚDO da formalização (a action faz o hash): mesma chave + outro conteúdo = conflito. */
export function assinaturaFormalizacaoV3(escopoOS: { storeId: string; osId: string }, e: EntradaFormalizacaoNormalizadaV3): string {
  return canonicoFormalizacaoV3({
    storeId: escopoOS.storeId,
    osId: escopoOS.osId,
    motivo: e.motivo,
    evidencia: e.evidencia,
    ratificarVencido: e.ratificarVencido,
    escopo: e.escopo,
  });
}

export function lerFormalizacaoAprovacaoV3(payload: unknown): RegistroFormalizacaoAprovacaoV3 | null {
  const registro = isRecord(payload) ? payload[FORMALIZACAO_CAMPO] : null;
  return isRecord(registro) && typeof registro.operacaoId === "string" ? (registro as unknown as RegistroFormalizacaoAprovacaoV3) : null;
}

/** Decide sobre o estado TRAVADO; a entrada já passou pela normalização e o replay já foi tratado. */
export function decidirFormalizacaoV3(
  estado: EstadoFormalizacaoV3,
  entrada: EntradaFormalizacaoNormalizadaV3,
): { ok: true; escopo: EscopoFormalizacaoV3; vencido: boolean } | RecusaFormalizacaoV3 {
  const montagem = montarEscopoFormalizacaoV3(estado);
  if (!montagem.ok) return montagem;
  if (canonicoFormalizacaoV3(montagem.escopo) !== canonicoFormalizacaoV3(entrada.escopo)) {
    return recusa(
      "escopo_divergente",
      "O orçamento, a Conta a Receber ou os pagamentos mudaram desde a conferência. Nada foi gravado — confira de novo.",
    );
  }
  if (montagem.vencido && !entrada.ratificarVencido) {
    return recusa("vencido_sem_ratificacao", "O orçamento está vencido: confirme a ratificação no momento atual para formalizar.");
  }
  return montagem;
}

/**
 * Gravação: orçamento aprovado no instante ATUAL (validade, linhas e totais intactos), registro
 * do ato, nova versão com a natureza e UM evento. Colunas, status técnico, garantia e entrega
 * não mudam (a action grava só o payload).
 */
export function aplicarFormalizacaoV3(
  payload: OrdemServico & Record<string, unknown>,
  p: {
    entrada: EntradaFormalizacaoNormalizadaV3;
    escopo: EscopoFormalizacaoV3;
    vencido: boolean;
    requestFingerprint: string;
    operador: string;
    operadorId: string;
    agora: string;
    eventoId: string;
  },
): { payload: OrdemServico & Record<string, unknown>; registro: RegistroFormalizacaoAprovacaoV3 } {
  const atual = orcamentoRealV3(payload)!;
  const statusAnterior = atual.status as "rascunho" | "enviado";
  const aprovado: OrcamentoV3 = { ...atual, status: "aprovado", respondidoEm: p.agora, atualizadoEm: p.agora };
  const registro: RegistroFormalizacaoAprovacaoV3 = {
    versao: 1,
    natureza: NATUREZA_FORMALIZACAO_APROVACAO_V3,
    atoAtual: true,
    operacaoId: p.entrada.operacaoId,
    requestFingerprint: p.requestFingerprint,
    motivo: p.entrada.motivo,
    declaracao: DECLARACAO_FORMALIZACAO_APROVACAO_V3,
    evidencia: p.entrada.evidencia,
    escopo: p.escopo,
    orcamentoStatusAnterior: statusAnterior,
    validoAte: p.escopo.orcamento.validoAte,
    vencido: p.vencido,
    vencimentoRatificado: p.vencido && p.entrada.ratificarVencido,
    formalizadoPorId: p.operadorId,
    formalizadoPorNome: p.operador,
    formalizadoEm: p.agora,
  };
  const versoes = Array.isArray(payload.orcamentoVersoesV3) ? (payload.orcamentoVersoesV3 as OrcamentoVersaoV3[]) : [];
  const versao: VersaoFormalizacaoV3 = {
    versao: versoes.length + 1,
    status: "aprovado",
    total: atual.total,
    desconto: atual.desconto ?? 0,
    registradoEm: p.agora,
    registradoPor: p.operador,
    snapshot: aprovado,
    natureza: NATUREZA_FORMALIZACAO_APROVACAO_V3,
    operacaoId: p.entrada.operacaoId,
  };
  const total = (p.escopo.orcamento.totalCentavos / 100).toFixed(2).replace(".", ",");
  const evento: EventoTimeline = {
    id: p.eventoId,
    tipo: "orcamento_aprovado",
    autor: p.operador,
    autorTipo: "usuario",
    conteudo:
      `Aprovação comercial formalizada por ${p.operador}: ato administrativo excepcional registrado agora, ` +
      `não a aprovação original do cliente. Total R$ ${total}.` +
      (registro.vencimentoRatificado ? " Orçamento vencido ratificado neste momento." : "") +
      ` Motivo: ${p.entrada.motivo}`,
    metadata: {
      natureza: NATUREZA_FORMALIZACAO_APROVACAO_V3,
      formalizacao: true,
      operacaoId: p.entrada.operacaoId,
      orcamentoStatusAnterior: statusAnterior,
      totalCentavos: p.escopo.orcamento.totalCentavos,
      vencimentoRatificado: registro.vencimentoRatificado,
    },
    criadoEm: p.agora,
  };
  const timeline = Array.isArray(payload.timeline) ? (payload.timeline as EventoTimeline[]) : [];
  return {
    payload: {
      ...payload,
      orcamento: aprovado,
      orcamentoVersoesV3: [...versoes, versao],
      [FORMALIZACAO_CAMPO]: registro,
      timeline: [...timeline, evento],
      atualizadoEm: p.agora,
    } as OrdemServico & Record<string, unknown>,
    registro,
  };
}
