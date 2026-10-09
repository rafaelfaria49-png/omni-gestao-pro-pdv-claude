// ============================================================================
// Operações V4 — RETIRADA da OS (GOAL OPS-V4-FLUXO-CURTO-006).
// ----------------------------------------------------------------------------
// Módulo PURO (sem I/O, sem React). Traduz, para o contexto final da OS
// (etapa Entrega), o que já existe: a projeção financeira server-side da MESMA
// OS e os dados persistidos da OS. Não calcula saldo próprio, não cria título,
// não decide entrega — a decisão final é sempre refeita por `registrarEntregaV3`.
//
// Fatos distintos: preço aprovado ≠ título formalizado ≠ dinheiro recebido ≠
// entrega. "A prazo autorizado" nunca é "quitado"; UNKNOWN / INCONSISTENT /
// CHARGE_NOT_CREATED / erro nunca liberam entrega (fail-closed).
// ============================================================================

import type { OrdemServico } from "@/types/os";
import { orcamentoRealV3 } from "@/lib/operacoes-v3/orcamento-model";
import { itensImprimiveisV3 } from "@/lib/operacoes-v3/print-model";
import { formatarVencimentoV3 } from "@/lib/operacoes-v3/recebimento-misto-model";
import type { FinancialProjectionOSV4 } from "./financial-projection";
import {
  derivarSituacaoAtendimentoV4,
  explicacaoConferenciaV4,
  pagamentoEmConferenciaV4,
  TEXTO_SITUACAO_V4,
} from "./situacao-atendimento-v4";

export type SituacaoRetiradaFinanceiraV4 =
  | "carregando"
  | "indisponivel"
  | "inconsistente"
  | "previa"
  | "sem_cobranca_pendente"
  | "nao_formalizada"
  | "saldo_aberto"
  | "parcial"
  | "quitado"
  | "a_prazo"
  | "sem_cobranca_autorizada"
  | "cancelada"
  | "estornada"
  /** GOAL OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-001: o que bloqueia é a aprovação comercial, não a leitura. */
  | "pendencia_comercial";

export type ToneRetiradaV4 = "success" | "info" | "warning" | "danger" | "neutral";

export interface RetiradaFinanceiraV4 {
  situacao: SituacaoRetiradaFinanceiraV4;
  /** Rótulo curto da situação (o estado nunca é comunicado só por cor). */
  rotulo: string;
  /** Frase que explica o estado real e o que falta. */
  descricao: string;
  tone: ToneRetiradaV4;
  total: number | null;
  recebido: number | null;
  saldo: number | null;
  /** Parte a prazo vigente (somente com autorização válida pelo guard). */
  aPrazo: { valor: number | null; vencimento: string | null } | null;
  /**
   * Há valor a receber pelo contrato canônico (saldo aberto/parcial sem a prazo,
   * ou cobrança ainda não formalizada com total positivo confiável). O título
   * único da OS é criado pelo próprio recebimento — nunca pela leitura.
   */
  podeReceber: boolean;
  /** Espelha `projection.canDeliver` (guard compartilhado); fail-closed. */
  liberaEntrega: boolean;
  /**
   * Os valores vêm dos FATOS do título (valor, recebido líquido, saldo do título),
   * não do total comercial — a tela usa rótulos próprios.
   */
  valoresDoTitulo?: boolean;
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function dinheiro(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

function fmt(value: number | null): string | null {
  return value == null ? null : brl.format(value);
}

function base(
  situacao: SituacaoRetiradaFinanceiraV4,
  rotulo: string,
  descricao: string,
  tone: ToneRetiradaV4,
  valores: Partial<Pick<RetiradaFinanceiraV4, "total" | "recebido" | "saldo" | "aPrazo" | "podeReceber" | "liberaEntrega" | "valoresDoTitulo">> = {},
): RetiradaFinanceiraV4 {
  return {
    situacao,
    rotulo,
    descricao,
    tone,
    total: valores.total ?? null,
    recebido: valores.recebido ?? null,
    saldo: valores.saldo ?? null,
    aPrazo: valores.aPrazo ?? null,
    podeReceber: valores.podeReceber ?? false,
    liberaEntrega: valores.liberaEntrega ?? false,
    ...(valores.valoresDoTitulo ? { valoresDoTitulo: true } : {}),
  };
}

/**
 * Condição financeira da retirada. `osId` é a OS selecionada: projeção de
 * outra OS (stale) conta como carregando — nunca decide nada pela OS atual.
 */
export function derivarRetiradaFinanceiraV4(input: {
  osId: string | null | undefined;
  projection: FinancialProjectionOSV4 | null | undefined;
  loading: boolean;
  error: string | null | undefined;
  entregue?: boolean;
}): RetiradaFinanceiraV4 {
  const legado = derivarRetiradaPorStatusV4(input);
  // GOAL OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-001: a leitura estrita do título não
  // comprova o histórico — nenhuma quitação nem valor do título aparece. Gating
  // (receber/entregar) continua o da decisão legada, sem mudança.
  // (pendência comercial já descreve o pagamento pelos fatos — "conferência pendente" inclusive.)
  if (legado.situacao === "carregando" || legado.situacao === "indisponivel" || legado.situacao === "inconsistente" ||
      legado.situacao === "cancelada" || legado.situacao === "estornada" || legado.situacao === "pendencia_comercial") return legado;
  const s = derivarSituacaoAtendimentoV4({ osId: input.osId, projection: input.projection, loading: input.loading, error: input.error });
  if (!pagamentoEmConferenciaV4(s)) return legado;
  return {
    ...legado,
    rotulo: "Pagamento em conferência",
    descricao: `${TEXTO_SITUACAO_V4.conferenciaPendente}. ${explicacaoConferenciaV4(input.projection)}${
      legado.liberaEntrega ? " Confira o histórico no Financeiro antes de entregar." : " A entrega fica bloqueada."
    }`,
    tone: "warning",
    total: null,
    recebido: null,
    saldo: null,
    aPrazo: null,
  };
}

function derivarRetiradaPorStatusV4(input: {
  osId: string | null | undefined;
  projection: FinancialProjectionOSV4 | null | undefined;
  loading: boolean;
  error: string | null | undefined;
  entregue?: boolean;
}): RetiradaFinanceiraV4 {
  const osId = (input.osId ?? "").trim();
  const p = input.projection ?? null;
  if (input.error) {
    return base("indisponivel", "Situação financeira indisponível", `${input.error} A entrega fica bloqueada até a leitura.`, "danger");
  }
  if (input.loading || !p || !osId || p.osId !== osId) {
    return base("carregando", "Confirmando situação financeira…", "A entrega aguarda a leitura do saldo desta OS.", "neutral");
  }

  const total = dinheiro(p.expectedTotal);
  const recebido = dinheiro(p.receivedTotal);
  const saldo = dinheiro(p.balance);
  const valores = { total, recebido, saldo, liberaEntrega: p.canDeliver === true };
  const motivo = p.consistencyIssues[0];

  switch (p.financialStatus) {
    case "PAID":
      return base(
        "quitado",
        "Quitado",
        input.entregue ? "Pagamento quitado." : "Pagamento quitado — confirmar entrega.",
        "success",
        valores,
      );
    case "AUTHORIZED_CREDIT": {
      const parcela = p.installments[0] ?? null;
      const aPrazo = { valor: dinheiro(parcela?.amount ?? p.balance), vencimento: parcela?.dueAt ?? null };
      const valor = fmt(aPrazo.valor);
      return base(
        "a_prazo",
        "Entrega autorizada a prazo",
        `Não quitada: ${valor ? `${valor} ` : "o saldo "}fica a prazo${aPrazo.vencimento ? ` (vencimento ${formatarVencimentoV3(aPrazo.vencimento)})` : ""}. Nenhum valor desta parte entra no caixa.`,
        "info",
        { ...valores, aPrazo },
      );
    }
    case "AUTHORIZED_NO_CHARGE":
      return base(
        "sem_cobranca_autorizada",
        "Sem cobrança autorizada",
        `Entrega sem cobrança autorizada${p.noChargeCategory ? ` (${p.noChargeCategory})` : ""}; a autorização é revalidada pelo servidor.`,
        "info",
        valores,
      );
    case "OPEN":
      return base("saldo_aberto", "Saldo em aberto", `Falta receber ${fmt(saldo) ?? "o saldo"}. A entrega fica bloqueada até receber ou autorizar a prazo.`, "warning", {
        ...valores,
        podeReceber: p.canReceive === true && (saldo ?? 0) > 0,
      });
    case "PARTIAL":
      return base(
        "parcial",
        "Pagamento parcial",
        `Recebido ${fmt(recebido) ?? "parte"}; faltam ${fmt(saldo) ?? "o saldo"}. A entrega fica bloqueada até receber ou autorizar a prazo.`,
        "warning",
        { ...valores, podeReceber: p.canReceive === true && (saldo ?? 0) > 0 },
      );
    case "CHARGE_NOT_CREATED": {
      const confiavel = (total ?? 0) > 0 && p.consistencyStatus !== "INCONSISTENT" && p.consistencyStatus !== "UNKNOWN";
      return base(
        "nao_formalizada",
        "Cobrança ainda não formalizada",
        `O total${total != null ? ` de ${fmt(total)}` : ""} está aprovado, mas a Conta a Receber desta OS ainda não existe. Ela é criada uma única vez no primeiro recebimento (ou no lançamento a prazo).`,
        "warning",
        { ...valores, recebido: recebido ?? 0, saldo: saldo ?? total, podeReceber: confiavel },
      );
    }
    case "PRICE_DEFINED":
      return base("previa", "Preço previsto, sem aprovação", "O valor ainda é uma prévia: aprove o orçamento antes de cobrar ou entregar.", "warning", valores);
    case "NO_PRICE":
      return base(
        "sem_cobranca_pendente",
        "Sem cobrança lançada",
        "Total zero: a entrega exige classificação (cortesia, garantia ou serviço sem valor) e motivo.",
        "warning",
        valores,
      );
    case "INCONSISTENT":
      return base("inconsistente", "Financeiro inconsistente", motivo ?? "As fontes financeiras desta OS divergem. Revise antes de entregar.", "danger", valores);
    case "CANCELLED":
      return base("cancelada", "Cobrança cancelada", "A Conta a Receber desta OS está cancelada. Revise o financeiro antes de entregar.", "danger", valores);
    case "REVERSED":
      return base("estornada", "Cobrança estornada", "A Conta a Receber desta OS foi estornada. Revise o financeiro antes de entregar.", "danger", valores);
    default: {
      // A leitura funcionou e o motivo é COMERCIAL: os fatos do título aparecem
      // (só se verificáveis) e a pendência fica separada — nunca "desconhecida".
      const s = derivarSituacaoAtendimentoV4({ osId, projection: p, loading: false, error: null });
      if (s.comercial.pendente) {
        const fatos = [
          s.pagamento.rotulo,
          s.pagamento.saldoRotulo,
          s.pagamento.meio ? `Forma registrada: ${s.pagamento.meio}` : null,
        ].filter(Boolean).join(" · ");
        return base("pendencia_comercial", s.comercial.rotulo, `${fatos}.`, "warning", {
          total: s.pagamento.valorTitulo,
          recebido: s.pagamento.recebidoLiquido,
          saldo: s.pagamento.saldoTitulo,
          liberaEntrega: false,
          valoresDoTitulo: true,
        });
      }
      return base("indisponivel", "Situação financeira desconhecida", motivo ?? "Não foi possível confirmar preço e título desta OS. A entrega fica bloqueada.", "danger", valores);
    }
  }
}

export interface ServicoRetiradaV4 {
  /** Descrições visíveis ao cliente (mesmo leitor do Termo de Entrega). */
  itens: string[];
  /** Orçamento real aprovado; falso = previsto/sem orçamento. */
  aprovado: boolean;
}

/** Serviço da retirada a partir do orçamento real (nunca orçamento sintetizado). */
export function servicoDaRetiradaV4(os: OrdemServico | null | undefined): ServicoRetiradaV4 {
  if (!os) return { itens: [], aprovado: false };
  const itens = itensImprimiveisV3(os)
    .filter((item) => item.categoria === "Serviço" || !item.brinde)
    .map((item) => item.descricao.trim())
    .filter(Boolean);
  return { itens, aprovado: orcamentoRealV3(os)?.status === "aprovado" };
}

export const RETIRANTE_MAX_V4 = 120;

/**
 * "Retirado por" (contrato F do GOAL 006): obrigatório — a entrega sempre
 * registra quem levou o aparelho, nunca um nome genérico deduzido. Espaços
 * normalizados; nunca maior que o limite. `obrigatorio: false` só existe para
 * leitores sem a guia da retirada (o servidor então usa o cliente da OS).
 */
export function validarRetiranteV4(
  valor: string | null | undefined,
  opcoes: { obrigatorio?: boolean } = {},
): { ok: true; recebidoPor: string | undefined } | { ok: false; mensagem: string } {
  const nome = (valor ?? "").replace(/\s+/g, " ").trim();
  if (!nome && opcoes.obrigatorio !== false) return { ok: false, mensagem: "Informe quem está retirando o aparelho." };
  if (nome.length > RETIRANTE_MAX_V4) {
    return { ok: false, mensagem: `Informe até ${RETIRANTE_MAX_V4} caracteres em "Retirado por".` };
  }
  return { ok: true, recebidoPor: nome || undefined };
}
