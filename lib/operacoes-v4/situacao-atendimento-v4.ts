// ============================================================================
// Operações V4 — SITUAÇÃO DO ATENDIMENTO (GOAL OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-001).
// ----------------------------------------------------------------------------
// Módulo PURO (sem I/O, sem React). Uma única leitura das três dimensões da
// projeção server-side — fatos do título, situação comercial e impedimento da
// entrega — para Header, Financeiro, Entrega e Próxima ação dizerem a MESMA
// coisa. Não decide nada: só traduz o que a projeção já decidiu. Pagamento
// registrado ≠ aprovação comercial ≠ aparelho entregue.
// ============================================================================

import type {
  DestinoImpedimentoV4,
  FinancialProjectionOSV4,
  ImpedimentoCodigoV4,
} from "./financial-projection";

export type TomSituacaoV4 = "success" | "info" | "warning" | "danger" | "neutral";

export type EstadoPagamentoSituacaoV4 =
  | "carregando"
  | "indisponivel"
  | "sem_titulo"
  | "sem_pagamento"
  | "registrado"
  | "conferencia_pendente";

export interface PagamentoSituacaoV4 {
  estado: EstadoPagamentoSituacaoV4;
  tom: TomSituacaoV4;
  /** Ex.: "Pagamento registrado — R$ 420,00". */
  rotulo: string;
  /** Ex.: "Saldo do título — R$ 0,00" (só com fatos verificáveis). */
  saldoRotulo: string | null;
  /** Meios efetivamente registrados, ligados ao pagamento pela identidade da operação. */
  meio: string | null;
  verificavel: boolean;
  liquidado: boolean;
  valorTitulo: number | null;
  recebidoLiquido: number | null;
  saldoTitulo: number | null;
}

export interface ComercialSituacaoV4 {
  /** A aprovação comercial é o que impede a entrega agora. */
  pendente: boolean;
  tom: TomSituacaoV4;
  rotulo: string;
  detalhe: string | null;
}

export interface ImpedimentoSituacaoV4 {
  codigo: ImpedimentoCodigoV4;
  destino: DestinoImpedimentoV4;
  /** Título da próxima ação (verbo). */
  titulo: string;
  /** A ÚNICA explicação do impedimento (mostrada uma vez, na próxima ação). */
  explicacao: string;
  /** Rótulo do botão que leva ao destino. */
  acao: string;
}

export interface SituacaoAtendimentoV4 {
  estado: "carregando" | "erro" | "pronta";
  pagamento: PagamentoSituacaoV4;
  comercial: ComercialSituacaoV4;
  impedimento: ImpedimentoSituacaoV4 | null;
}

/** Mesmo formato do restante da V4 (`formatBRLFinanceiroV4`): "R$ 420,00", espaço comum. */
export function formatarValorSituacaoV4(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `R$ ${(Math.round(value * 100) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const TEXTO_SITUACAO_V4 = {
  pagamentoRegistrado: (valor: number) => `Pagamento registrado — ${formatarValorSituacaoV4(valor)}`,
  saldoTitulo: (valor: number) => `Saldo do título — ${formatarValorSituacaoV4(valor)}`,
  conferenciaPendente: "Há registro de pagamento; conferência pendente",
  semPagamento: "Nenhum pagamento registrado",
  semTitulo: "Nenhuma Conta a Receber criada",
  indisponivel: "Financeiro indisponível",
  carregando: "Confirmando pagamentos…",
  aprovacaoPendente: "Aprovação comercial pendente — revisar autorização",
} as const;

const IMPEDIMENTO_TEXTO: Record<ImpedimentoCodigoV4, { titulo: string; explicacao: string; acao: string }> = {
  APROVACAO_COMERCIAL_PENDENTE: {
    titulo: "Revisar aprovação comercial",
    explicacao: "O orçamento desta OS não está aprovado. A entrega continua bloqueada até a aprovação ser registrada.",
    acao: "Abrir orçamento",
  },
  ORCAMENTO_RECUSADO: {
    titulo: "Revisar orçamento recusado",
    explicacao: "O orçamento desta OS foi recusado. Revise a autorização comercial antes de entregar.",
    acao: "Abrir orçamento",
  },
  ORCAMENTO_EXPIRADO: {
    titulo: "Revisar orçamento vencido",
    explicacao: "O orçamento desta OS venceu sem aprovação. Revise a autorização comercial antes de entregar.",
    acao: "Abrir orçamento",
  },
  PRECO_AUSENTE: {
    titulo: "Definir cobrança",
    explicacao: "Esta OS não tem preço confiável definido. Defina a cobrança antes de entregar.",
    acao: "Abrir orçamento",
  },
  SEM_COBRANCA_EXIGE_AUTORIZACAO: {
    titulo: "Classificar entrega sem cobrança",
    explicacao: "Total zero exige classificação (cortesia, garantia ou serviço sem valor) e motivo.",
    acao: "Abrir entrega",
  },
  VALORES_DIVERGENTES: {
    titulo: "Revisar valores",
    explicacao: "Os valores do orçamento, da OS e da Conta a Receber não conferem. Revise antes de entregar.",
    acao: "Abrir financeiro",
  },
  TITULO_NAO_VINCULADO: {
    titulo: "Revisar Conta a Receber",
    explicacao: "A Conta a Receber encontrada não pertence inequivocamente a esta OS e loja.",
    acao: "Abrir financeiro",
  },
  HISTORICO_INVALIDO: {
    titulo: "Conferir histórico do título",
    explicacao: "O histórico ou o status da Conta a Receber não permite calcular o saldo com segurança.",
    acao: "Abrir financeiro",
  },
  ESTORNO_AMBIGUO: {
    titulo: "Conferir estornos",
    explicacao: "Há estorno sem referência segura ao pagamento estornado.",
    acao: "Abrir financeiro",
  },
  RECEBIDO_ACIMA_DO_TITULO: {
    titulo: "Conferir recebimentos",
    explicacao: "O total recebido supera o valor da Conta a Receber.",
    acao: "Abrir financeiro",
  },
  FALHA_LEITURA: {
    titulo: "Financeiro indisponível",
    explicacao: "Não foi possível ler a situação financeira desta OS. A entrega fica bloqueada até a leitura.",
    acao: "Tentar novamente",
  },
  COBRANCA_NAO_FORMALIZADA: {
    titulo: "Receber pagamento",
    explicacao: "A Conta a Receber desta OS ainda não existe; ela nasce no primeiro recebimento (ou no lançamento a prazo).",
    acao: "Abrir financeiro",
  },
  SALDO_EM_ABERTO: {
    titulo: "Receber pagamento",
    explicacao: "Há saldo em aberto no título. Receba ou autorize a prazo antes de entregar.",
    acao: "Abrir financeiro",
  },
  COBRANCA_CANCELADA: {
    titulo: "Revisar cobrança cancelada",
    explicacao: "A Conta a Receber desta OS está cancelada. Revise o financeiro antes de entregar.",
    acao: "Abrir financeiro",
  },
  PAGAMENTO_ESTORNADO: {
    titulo: "Revisar pagamento estornado",
    explicacao: "A Conta a Receber desta OS foi estornada. Revise o financeiro antes de entregar.",
    acao: "Abrir financeiro",
  },
};

export function textoImpedimentoV4(codigo: ImpedimentoCodigoV4): { titulo: string; explicacao: string; acao: string } {
  return IMPEDIMENTO_TEXTO[codigo];
}

const COMERCIAL_PENDENTE = new Set<ImpedimentoCodigoV4>([
  "APROVACAO_COMERCIAL_PENDENTE",
  "ORCAMENTO_RECUSADO",
  "ORCAMENTO_EXPIRADO",
  "PRECO_AUSENTE",
]);

/**
 * Forma de pagamento EXIBÍVEL: só a dos fatos (identidade da operação ou a própria
 * baixa do título). Título não verificável = "Em conferência"; sem título = "Não
 * registrada". Nunca cai na timeline/espelho sem vínculo.
 */
export function formaRegistradaV4(projection: FinancialProjectionOSV4 | null | undefined, legado: string): string {
  const fatos = projection?.fatos;
  if (!projection || !fatos) return legado;
  if (!fatos.tituloEncontrado) return fatos.motivo === "FALHA_LEITURA" ? "Indisponível" : "Não registrada";
  if (!fatos.verificavel) return "Em conferência";
  return meiosDe(projection) ?? "Não registrada";
}

function meiosDe(projection: FinancialProjectionOSV4): string | null {
  const fatos = projection.fatos;
  if (!fatos || !fatos.verificavel) return null;
  const labels = [...new Set(fatos.meios.map((m) => m.label))];
  const semMeio = (fatos.semMeioIdentificado ?? 0) > 0;
  if (labels.length === 0) return semMeio ? "Forma não identificada no título" : null;
  return semMeio ? `${labels.join(" + ")} + forma não identificada` : labels.join(" + ");
}

const pagamentoBase = (
  estado: EstadoPagamentoSituacaoV4,
  tom: TomSituacaoV4,
  rotulo: string,
): PagamentoSituacaoV4 => ({
  estado,
  tom,
  rotulo,
  saldoRotulo: null,
  meio: null,
  verificavel: false,
  liquidado: false,
  valorTitulo: null,
  recebidoLiquido: null,
  saldoTitulo: null,
});

function pagamentoDe(projection: FinancialProjectionOSV4): PagamentoSituacaoV4 {
  const fatos = projection.fatos;
  if (!fatos) {
    // Projeção sem a dimensão (fixtures/leitores anteriores): só o legado verificado.
    if (projection.receivedTotal == null) return pagamentoBase("indisponivel", "danger", TEXTO_SITUACAO_V4.indisponivel);
    return pagamentoBase(projection.receivedTotal > 0 ? "registrado" : "sem_pagamento", "neutral",
      projection.receivedTotal > 0 ? TEXTO_SITUACAO_V4.pagamentoRegistrado(projection.receivedTotal) : TEXTO_SITUACAO_V4.semPagamento);
  }
  if (fatos.motivo === "FALHA_LEITURA") return pagamentoBase("indisponivel", "danger", TEXTO_SITUACAO_V4.indisponivel);
  if (!fatos.tituloEncontrado) return pagamentoBase("sem_titulo", "neutral", TEXTO_SITUACAO_V4.semTitulo);
  if (!fatos.verificavel) {
    return pagamentoBase("conferencia_pendente", "warning",
      fatos.temRegistroDePagamento ? TEXTO_SITUACAO_V4.conferenciaPendente : "Conta a Receber em conferência");
  }
  const recebido = fatos.recebidoLiquido ?? 0;
  const saldo = fatos.saldoTitulo ?? 0;
  return {
    estado: recebido > 0 ? "registrado" : "sem_pagamento",
    tom: fatos.liquidado ? "success" : recebido > 0 ? "warning" : "neutral",
    rotulo: recebido > 0 ? TEXTO_SITUACAO_V4.pagamentoRegistrado(recebido) : TEXTO_SITUACAO_V4.semPagamento,
    saldoRotulo: TEXTO_SITUACAO_V4.saldoTitulo(saldo),
    meio: meiosDe(projection),
    verificavel: true,
    liquidado: fatos.liquidado,
    valorTitulo: fatos.valorTitulo,
    recebidoLiquido: fatos.recebidoLiquido,
    saldoTitulo: fatos.saldoTitulo,
  };
}

function comercialDe(projection: FinancialProjectionOSV4): ComercialSituacaoV4 {
  const comercial = projection.comercial;
  const codigo = projection.acoes?.impedimento?.codigo ?? null;
  if (!comercial) return { pendente: false, tom: "neutral", rotulo: "", detalhe: null };
  const pendente = !!codigo && COMERCIAL_PENDENTE.has(codigo);
  const total = comercial.totalOrcamento != null ? formatarValorSituacaoV4(comercial.totalOrcamento) : null;
  const confere =
    comercial.confereComTitulo === true ? "confere com o título" : comercial.confereComTitulo === false ? "diverge do título" : null;
  const detalhe = (estado: string) => [estado, total, confere].filter(Boolean).join(" · ") || null;
  if (pendente && codigo === "ORCAMENTO_RECUSADO") return { pendente, tom: "danger", rotulo: "Orçamento recusado — revisar autorização", detalhe: detalhe("Orçamento recusado") };
  if (pendente && codigo === "ORCAMENTO_EXPIRADO") return { pendente, tom: "warning", rotulo: "Orçamento vencido — revisar autorização", detalhe: detalhe("Orçamento vencido sem aprovação") };
  if (pendente && codigo === "PRECO_AUSENTE") return { pendente, tom: "warning", rotulo: "Preço não definido — definir cobrança", detalhe: null };
  if (pendente) {
    const estado = comercial.orcamento === "enviado" ? "Orçamento enviado, sem aprovação" : "Orçamento em rascunho";
    return { pendente, tom: "warning", rotulo: TEXTO_SITUACAO_V4.aprovacaoPendente, detalhe: detalhe(estado) };
  }
  if (comercial.orcamento === "aprovado") return { pendente: false, tom: "success", rotulo: "Orçamento aprovado", detalhe: comercial.totalAprovado != null ? formatarValorSituacaoV4(comercial.totalAprovado) : null };
  if (comercial.orcamento === "ausente") return { pendente: false, tom: "neutral", rotulo: "Sem orçamento formal", detalhe: null };
  return { pendente: false, tom: "neutral", rotulo: "", detalhe: null };
}

/**
 * Situação da OS selecionada. Projeção de OUTRA OS (resposta tardia) ou em leitura
 * conta como carregando — nunca descreve o alvo atual com dado de outro.
 */
export function derivarSituacaoAtendimentoV4(input: {
  osId: string | null | undefined;
  projection: FinancialProjectionOSV4 | null | undefined;
  loading: boolean;
  error: string | null | undefined;
}): SituacaoAtendimentoV4 {
  const osId = (input.osId ?? "").trim();
  const p = input.projection ?? null;
  const vazioComercial: ComercialSituacaoV4 = { pendente: false, tom: "neutral", rotulo: "", detalhe: null };
  if (input.error) {
    return {
      estado: "erro",
      pagamento: pagamentoBase("indisponivel", "danger", TEXTO_SITUACAO_V4.indisponivel),
      comercial: vazioComercial,
      impedimento: { codigo: "FALHA_LEITURA", destino: "recarregar", ...IMPEDIMENTO_TEXTO.FALHA_LEITURA },
    };
  }
  if (input.loading || !p || !osId || p.osId !== osId) {
    return { estado: "carregando", pagamento: pagamentoBase("carregando", "neutral", TEXTO_SITUACAO_V4.carregando), comercial: vazioComercial, impedimento: null };
  }
  const imp = p.acoes?.impedimento ?? null;
  return {
    estado: "pronta",
    pagamento: pagamentoDe(p),
    comercial: comercialDe(p),
    impedimento: imp ? { ...imp, ...IMPEDIMENTO_TEXTO[imp.codigo] } : null,
  };
}

/**
 * Situação a partir dos valores da tela. Quem monta só parte dos valores (testes e
 * hospedeiros antigos) recebe a MESMA derivação feita sobre `financial` — nunca um
 * estado diferente do que o hook calcularia.
 */
export function situacaoAtendimentoDe(v: {
  situacaoAtendimento?: SituacaoAtendimentoV4 | null;
  realOS?: { id?: string | null } | null;
  financial?: { projection?: FinancialProjectionOSV4 | null; loading?: boolean; error?: string | null } | null;
}): SituacaoAtendimentoV4 {
  if (v.situacaoAtendimento) return v.situacaoAtendimento;
  const projection = v.financial?.projection ?? null;
  return derivarSituacaoAtendimentoV4({
    osId: v.realOS?.id ?? projection?.osId ?? null,
    projection,
    loading: v.financial?.loading === true,
    error: v.financial?.error ?? null,
  });
}

/**
 * Há Conta a Receber desta OS, mas a leitura estrita NÃO comprova seu histórico
 * (estorno sem referência, entrada malformada, vínculo, excesso…). Vale para
 * QUALQUER status legado: nenhuma superfície mostra quitação nem valores do título;
 * a decisão legada de receber/entregar não muda.
 */
export function pagamentoEmConferenciaV4(s: SituacaoAtendimentoV4): boolean {
  return s.estado === "pronta" && s.pagamento.estado === "conferencia_pendente";
}

/** Explicação do motivo pelo qual o histórico do título está em conferência. */
export function explicacaoConferenciaV4(projection: FinancialProjectionOSV4 | null | undefined): string {
  const motivo = projection?.fatos?.motivo;
  return motivo ? IMPEDIMENTO_TEXTO[motivo].explicacao : "O histórico da Conta a Receber não pôde ser conferido com segurança.";
}

/** Pendência comercial com pagamento VERIFICADO — o caso que a V4 antes chamava de "indisponível". */
export function pagamentoComPendenciaComercialV4(s: SituacaoAtendimentoV4): boolean {
  return s.estado === "pronta" && s.comercial.pendente && s.pagamento.verificavel;
}
