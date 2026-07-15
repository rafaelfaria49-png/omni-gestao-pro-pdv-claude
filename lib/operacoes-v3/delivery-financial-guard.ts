import type { OrdemServico } from "@/types/os";
import { normalizeReceberStatus, RECEBER_STATUS } from "@/lib/financeiro/contracts/status";
import { computeTotaisV3, orcamentoRealV3 } from "./orcamento-model";
import { localKeyContaReceberOSV3 } from "./payment-model";

const TOLERANCIA_CENTAVOS = 1;

export type EntregaSemCobrancaCategoriaV3 = "cortesia" | "garantia" | "sem_valor";

export interface EntregaSemCobrancaSolicitacaoV3 {
  categoria: EntregaSemCobrancaCategoriaV3;
  motivo: string;
}

export interface EntregaSemCobrancaSnapshotFinanceiroV3 {
  totalEsperado: number | null;
  origensTotal: string[];
  tituloEncontrado: boolean;
  tituloLocalKey?: string;
  valorTitulo: number | null;
  totalRecebido: number | null;
  saldo: number | null;
  decisao: "ALLOW_AUTHORIZED_NO_CHARGE";
}

export interface EntregaSemCobrancaV3 {
  versao: 1;
  categoria: EntregaSemCobrancaCategoriaV3;
  motivo: string;
  autorizadoPorId: string;
  autorizadoPorNome: string;
  autorizadoEm: string;
  storeId: string;
  status: "ativo" | "revogado";
  snapshotFinanceiro?: EntregaSemCobrancaSnapshotFinanceiroV3;
}

export type EntregaFinanceiraDecisaoV3 =
  | "ALLOW_PAID"
  | "ALLOW_AUTHORIZED_CREDIT"
  | "ALLOW_AUTHORIZED_NO_CHARGE"
  | "BLOCK_PENDING_BALANCE"
  | "BLOCK_CHARGE_NOT_CREATED"
  | "BLOCK_UNKNOWN"
  | "BLOCK_INCONSISTENT"
  | "BLOCK_NO_CHARGE_AUTH_REQUIRED";

export interface TituloEntregaFinanceiraV3 {
  id: string;
  storeId: string;
  localKey: string | null;
  valor: number;
  status: string;
  payload: unknown;
}

export interface ProjetarEntregaFinanceiraInputV3 {
  storeId: string;
  osId: string;
  payload: OrdemServico & Record<string, unknown>;
  prismaValorTotal: number;
  titulo: TituloEntregaFinanceiraV3 | null;
  falhaLeituraTitulo?: boolean;
}

export interface ProjecaoEntregaFinanceiraV3 {
  totalEsperado: number | null;
  origensTotal: string[];
  tituloEncontrado: boolean;
  valorTitulo: number | null;
  totalRecebido: number | null;
  saldo: number | null;
  estadoCobranca: "quitada" | "pendente" | "ausente" | "sem_cobranca" | "desconhecida" | "inconsistente";
  consistencia: "consistente" | "desconhecida" | "inconsistente";
  autorizacaoAPrazo: boolean;
  autorizacaoSemCobranca: boolean;
  motivoBloqueio?: string;
  decisao: EntregaFinanceiraDecisaoV3;
}

interface FonteTotal {
  origem: string;
  centavos: number;
}

interface TotaisEsperados {
  fontes: FonteTotal[];
  totalCentavos: number | null;
  temZeroComercialExplicito: boolean;
  desconhecido: boolean;
  inconsistencia?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function toCents(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.round(number * 100);
}

function fromCents(value: number | null): number | null {
  return value == null ? null : value / 100;
}

function diverge(a: number, b: number): boolean {
  return Math.abs(a - b) > TOLERANCIA_CENTAVOS;
}

function coletarTotaisEsperados(input: ProjetarEntregaFinanceiraInputV3): TotaisEsperados {
  const fontes: FonteTotal[] = [];
  let temZeroComercialExplicito = false;
  let desconhecido = false;
  const orcamento = orcamentoRealV3(input.payload);

  if (orcamento) {
    if (orcamento.status !== "aprovado") {
      desconhecido = true;
    } else {
      const calculado = toCents(computeTotaisV3({
        servicos: orcamento.servicos,
        pecas: orcamento.pecas,
        desconto: orcamento.desconto,
      }).total);
      const declarado = toCents(orcamento.total);
      if (calculado == null || declarado == null) {
        return { fontes, totalCentavos: null, temZeroComercialExplicito, desconhecido: true, inconsistencia: "Orçamento aprovado possui total inválido." };
      }
      if (diverge(calculado, declarado)) {
        return { fontes, totalCentavos: null, temZeroComercialExplicito, desconhecido: false, inconsistencia: "Total calculado do orçamento diverge do total persistido." };
      }
      fontes.push({ origem: "orcamento_aprovado", centavos: calculado });
      if (calculado === 0) temZeroComercialExplicito = true;
    }
  }

  const prismaTotal = toCents(input.prismaValorTotal);
  if (prismaTotal == null) {
    return { fontes, totalCentavos: null, temZeroComercialExplicito, desconhecido: false, inconsistencia: "Valor total da OS é inválido." };
  }
  fontes.push({ origem: "ordem_servico.valor_total", centavos: prismaTotal });

  if (Object.prototype.hasOwnProperty.call(input.payload, "valorTotal")) {
    const payloadTotal = toCents(input.payload.valorTotal);
    if (payloadTotal == null) {
      return { fontes, totalCentavos: null, temZeroComercialExplicito, desconhecido: false, inconsistencia: "Valor total legado da OS é inválido." };
    }
    fontes.push({ origem: "payload.valorTotal", centavos: payloadTotal });
  }

  if (input.payload.faturamentoPendente === true && input.payload.faturamentoStatus === "pendente") {
    const faturamentoTotal = toCents(input.payload.faturamentoTotal);
    if (faturamentoTotal == null) {
      return { fontes, totalCentavos: null, temZeroComercialExplicito, desconhecido: false, inconsistencia: "Snapshot de faturamento pendente possui total inválido." };
    }
    fontes.push({ origem: "payload.faturamentoTotal", centavos: faturamentoTotal });
  }

  const base = fontes[0]?.centavos ?? null;
  if (base != null) {
    const divergente = fontes.find((fonte) => diverge(fonte.centavos, base));
    if (divergente) {
      return { fontes, totalCentavos: null, temZeroComercialExplicito, desconhecido: false, inconsistencia: "Fontes positivas do total da OS divergem entre si." };
    }
  }

  // Zero gravado também participa da reconciliação. Caso contrário, uma coluna
  // zerada poderia ser ignorada e liberar um orçamento positivo (ou o inverso).
  // Sem orçamento aprovado, porém, um conjunto composto apenas por zeros segue
  // sendo preço desconhecido — nunca cortesia implícita.
  if (!orcamento || orcamento.status !== "aprovado") {
    desconhecido = desconhecido || fontes.every((fonte) => fonte.centavos === 0);
  }

  return { fontes, totalCentavos: base, temZeroComercialExplicito, desconhecido };
}

function somarRecebimentosEstritos(payload: unknown): { centavos: number; valido: boolean } {
  if (!isRecord(payload)) return { centavos: 0, valido: true };
  const historico = payload.historico;
  if (historico == null) return { centavos: 0, valido: true };
  if (!Array.isArray(historico)) return { centavos: 0, valido: false };
  let centavos = 0;
  for (const evento of historico) {
    if (!isRecord(evento)) continue;
    const tipo = String(evento.tipo ?? "").trim().toLowerCase();
    if (tipo !== "pagamento" && tipo !== "liquidacao" && tipo !== "estorno_pagamento") continue;
    const valor = toCents(evento.valor);
    if (valor == null) return { centavos: 0, valido: false };
    centavos += tipo === "estorno_pagamento" ? -valor : valor;
  }
  return { centavos, valido: centavos >= -TOLERANCIA_CENTAVOS };
}

function temMarcadorAPrazo(payload: unknown): boolean {
  if (!isRecord(payload) || !Array.isArray(payload.historico)) return false;
  return payload.historico.some((evento) => isRecord(evento) && String(evento.tipo ?? "").toLowerCase() === "a_prazo_autorizado");
}

function autorizacaoAPrazoValida(input: ProjetarEntregaFinanceiraInputV3, saldoCentavos: number, valorTituloCentavos: number): boolean {
  const autorizacao = input.payload.aPrazoV3;
  if (!isRecord(autorizacao) || !input.titulo) return false;
  const valorAutorizado = toCents(autorizacao.valor);
  const vencimento = typeof autorizacao.vencimento === "string" ? autorizacao.vencimento.trim() : "";
  const autorizadoEm = typeof autorizacao.autorizadoEm === "string" ? autorizacao.autorizadoEm.trim() : "";
  const autorizadoPor = typeof autorizacao.autorizadoPor === "string" ? autorizacao.autorizadoPor.trim() : "";
  return (
    autorizacao.modo === "a_prazo" &&
    autorizacao.status === "pendente" &&
    autorizacao.autorizadoEntrega === true &&
    autorizacao.tituloLocalKey === localKeyContaReceberOSV3(input.storeId, input.osId) &&
    valorAutorizado != null &&
    valorAutorizado > 0 &&
    valorAutorizado + TOLERANCIA_CENTAVOS >= saldoCentavos &&
    valorAutorizado <= valorTituloCentavos + TOLERANCIA_CENTAVOS &&
    vencimento.length > 0 &&
    Number.isFinite(Date.parse(vencimento)) &&
    autorizadoEm.length > 0 &&
    Number.isFinite(Date.parse(autorizadoEm)) &&
    autorizadoPor.length > 0 &&
    temMarcadorAPrazo(input.titulo.payload)
  );
}

export function criarAutorizacaoEntregaSemCobrancaV3(input: {
  solicitacao: EntregaSemCobrancaSolicitacaoV3;
  storeId: string;
  autorizadoPorId: string;
  autorizadoPorNome: string;
  autorizadoEm: string;
}): EntregaSemCobrancaV3 {
  const categoria = input.solicitacao?.categoria;
  if (categoria !== "cortesia" && categoria !== "garantia" && categoria !== "sem_valor") {
    throw new Error("Selecione uma categoria válida para a entrega sem cobrança.");
  }
  const motivo = (input.solicitacao?.motivo ?? "").trim();
  if (!motivo) throw new Error("Informe o motivo da entrega sem cobrança.");
  return {
    versao: 1,
    categoria,
    motivo,
    autorizadoPorId: input.autorizadoPorId,
    autorizadoPorNome: input.autorizadoPorNome,
    autorizadoEm: input.autorizadoEm,
    storeId: input.storeId,
    status: "ativo",
  };
}

function autorizacaoSemCobrancaValida(payload: ProjetarEntregaFinanceiraInputV3["payload"], storeId: string): boolean {
  const autorizacao = payload.entregaSemCobrancaV3;
  if (!isRecord(autorizacao)) return false;
  return (
    autorizacao.versao === 1 &&
    (autorizacao.categoria === "cortesia" || autorizacao.categoria === "garantia" || autorizacao.categoria === "sem_valor") &&
    typeof autorizacao.motivo === "string" &&
    autorizacao.motivo.trim().length > 0 &&
    typeof autorizacao.autorizadoPorId === "string" &&
    autorizacao.autorizadoPorId.trim().length > 0 &&
    typeof autorizacao.autorizadoPorNome === "string" &&
    autorizacao.autorizadoPorNome.trim().length > 0 &&
    typeof autorizacao.autorizadoEm === "string" &&
    Number.isFinite(Date.parse(autorizacao.autorizadoEm)) &&
    autorizacao.storeId === storeId &&
    autorizacao.status === "ativo"
  );
}

function bloquear(
  base: Omit<ProjecaoEntregaFinanceiraV3, "decisao" | "motivoBloqueio">,
  decisao: Exclude<EntregaFinanceiraDecisaoV3, `ALLOW_${string}`>,
  motivoBloqueio: string,
): ProjecaoEntregaFinanceiraV3 {
  return { ...base, decisao, motivoBloqueio };
}

export function projetarEntregaFinanceiraV3(input: ProjetarEntregaFinanceiraInputV3): ProjecaoEntregaFinanceiraV3 {
  const totais = coletarTotaisEsperados(input);
  const origensTotal = totais.fontes.map((fonte) => fonte.origem);
  const totalEsperado = fromCents(totais.totalCentavos);
  const tituloEncontrado = !!input.titulo;
  const valorTituloCentavos = input.titulo ? toCents(input.titulo.valor) : null;
  const valorTitulo = fromCents(valorTituloCentavos);
  const base = {
    totalEsperado,
    origensTotal,
    tituloEncontrado,
    valorTitulo,
    totalRecebido: null,
    saldo: null,
    estadoCobranca: "desconhecida" as const,
    consistencia: "desconhecida" as const,
    autorizacaoAPrazo: false,
    autorizacaoSemCobranca: autorizacaoSemCobrancaValida(input.payload, input.storeId),
  };

  if (input.falhaLeituraTitulo) return bloquear(base, "BLOCK_UNKNOWN", "Falha ao consultar a Conta a Receber da OS.");
  if (totais.inconsistencia) {
    return bloquear({ ...base, estadoCobranca: "inconsistente", consistencia: "inconsistente" }, "BLOCK_INCONSISTENT", totais.inconsistencia);
  }
  if (input.titulo) {
    const localKeyEsperada = localKeyContaReceberOSV3(input.storeId, input.osId);
    const tituloPayload = isRecord(input.titulo.payload) ? input.titulo.payload : {};
    if (
      input.titulo.storeId !== input.storeId ||
      input.titulo.localKey !== localKeyEsperada ||
      (typeof tituloPayload.ordemServicoId === "string" && tituloPayload.ordemServicoId !== input.osId) ||
      valorTituloCentavos == null
    ) {
      return bloquear({ ...base, estadoCobranca: "inconsistente", consistencia: "inconsistente" }, "BLOCK_INCONSISTENT", "Título financeiro não pertence inequivocamente à mesma OS e loja.");
    }
  }

  if (totais.desconhecido) {
    if (totais.totalCentavos != null && valorTituloCentavos != null && diverge(totais.totalCentavos, valorTituloCentavos)) {
      return bloquear({ ...base, estadoCobranca: "inconsistente", consistencia: "inconsistente" }, "BLOCK_INCONSISTENT", "Existe título financeiro divergente das fontes de preço disponíveis.");
    }
    return bloquear(base, "BLOCK_UNKNOWN", "Preço ou aprovação comercial da OS não está materializado de forma confiável.");
  }

  if (totais.totalCentavos == null) {
    if (valorTituloCentavos != null && valorTituloCentavos > TOLERANCIA_CENTAVOS) {
      return bloquear({ ...base, estadoCobranca: "inconsistente", consistencia: "inconsistente" }, "BLOCK_INCONSISTENT", "Existe título positivo sem total comercial confiável na OS.");
    }
    if (base.autorizacaoSemCobranca) {
      return { ...base, estadoCobranca: "sem_cobranca", consistencia: "consistente", decisao: "ALLOW_AUTHORIZED_NO_CHARGE" };
    }
    return bloquear(
      { ...base, estadoCobranca: totais.temZeroComercialExplicito ? "sem_cobranca" : "desconhecida" },
      totais.temZeroComercialExplicito ? "BLOCK_NO_CHARGE_AUTH_REQUIRED" : "BLOCK_UNKNOWN",
      totais.temZeroComercialExplicito ? "Total zero exige classificação e justificativa persistidas." : "Preço da OS não está materializado de forma confiável.",
    );
  }

  if (totais.totalCentavos === 0) {
    if (valorTituloCentavos != null && valorTituloCentavos > TOLERANCIA_CENTAVOS) {
      return bloquear({ ...base, estadoCobranca: "inconsistente", consistencia: "inconsistente" }, "BLOCK_INCONSISTENT", "Existe título positivo para uma OS com total comercial zero.");
    }
    if (base.autorizacaoSemCobranca) {
      return { ...base, estadoCobranca: "sem_cobranca", consistencia: "consistente", decisao: "ALLOW_AUTHORIZED_NO_CHARGE" };
    }
    return bloquear(
      { ...base, estadoCobranca: "sem_cobranca", consistencia: "consistente" },
      "BLOCK_NO_CHARGE_AUTH_REQUIRED",
      "Total zero exige classificação e justificativa persistidas.",
    );
  }

  if (!input.titulo) {
    return bloquear({ ...base, estadoCobranca: "ausente", consistencia: "consistente" }, "BLOCK_CHARGE_NOT_CREATED", "Total positivo sem Conta a Receber correspondente.");
  }
  if (valorTituloCentavos == null || diverge(valorTituloCentavos, totais.totalCentavos)) {
    return bloquear({ ...base, estadoCobranca: "inconsistente", consistencia: "inconsistente" }, "BLOCK_INCONSISTENT", "Valor do título diverge do total esperado da OS.");
  }

  const recebimentos = somarRecebimentosEstritos(input.titulo.payload);
  const recebidoCentavos = recebimentos.centavos;
  const saldoCentavos = Math.max(0, valorTituloCentavos - recebidoCentavos);
  const status = normalizeReceberStatus(input.titulo.status);
  const comValores = { ...base, totalRecebido: fromCents(recebidoCentavos), saldo: fromCents(saldoCentavos) };
  if (!recebimentos.valido || recebidoCentavos > valorTituloCentavos + TOLERANCIA_CENTAVOS || !status) {
    return bloquear({ ...comValores, estadoCobranca: "inconsistente", consistencia: "inconsistente" }, "BLOCK_INCONSISTENT", "Histórico ou status do título não permite calcular o saldo com segurança.");
  }

  if (saldoCentavos <= TOLERANCIA_CENTAVOS) {
    if (status !== RECEBER_STATUS.PAGO || recebidoCentavos + TOLERANCIA_CENTAVOS < valorTituloCentavos) {
      return bloquear({ ...comValores, estadoCobranca: "inconsistente", consistencia: "inconsistente" }, "BLOCK_INCONSISTENT", "Status do título diverge do histórico de recebimentos.");
    }
    return { ...comValores, estadoCobranca: "quitada", consistencia: "consistente", decisao: "ALLOW_PAID" };
  }

  const statusAbertoValido =
    status === RECEBER_STATUS.VENCIDO ||
    (recebidoCentavos <= TOLERANCIA_CENTAVOS && status === RECEBER_STATUS.PENDENTE) ||
    (recebidoCentavos > TOLERANCIA_CENTAVOS && status === RECEBER_STATUS.PARCIAL);
  if (!statusAbertoValido) {
    return bloquear({ ...comValores, estadoCobranca: "inconsistente", consistencia: "inconsistente" }, "BLOCK_INCONSISTENT", "Status do título diverge do saldo calculado.");
  }

  const autorizacaoAPrazo = autorizacaoAPrazoValida(input, saldoCentavos, valorTituloCentavos);
  if (autorizacaoAPrazo) {
    return { ...comValores, estadoCobranca: "pendente", consistencia: "consistente", autorizacaoAPrazo: true, decisao: "ALLOW_AUTHORIZED_CREDIT" };
  }
  return bloquear({ ...comValores, estadoCobranca: "pendente", consistencia: "consistente" }, "BLOCK_PENDING_BALANCE", "Título possui saldo pendente sem autorização a prazo válida.");
}

export function mensagemBloqueioEntregaFinanceiraV3(decisao: EntregaFinanceiraDecisaoV3): string {
  if (decisao === "BLOCK_PENDING_BALANCE") {
    return "Esta OS possui saldo pendente. Receba o valor ou autorize o pagamento a prazo antes de confirmar a entrega.";
  }
  if (decisao === "BLOCK_NO_CHARGE_AUTH_REQUIRED") {
    return "Classifique e justifique a entrega sem cobrança antes de confirmar a entrega.";
  }
  return "Não foi possível confirmar a situação financeira desta OS. Revise a cobrança antes de entregar.";
}

export function autorizadaParaEntregaFinanceiraV3(decisao: EntregaFinanceiraDecisaoV3): boolean {
  return decisao === "ALLOW_PAID" || decisao === "ALLOW_AUTHORIZED_CREDIT" || decisao === "ALLOW_AUTHORIZED_NO_CHARGE";
}
