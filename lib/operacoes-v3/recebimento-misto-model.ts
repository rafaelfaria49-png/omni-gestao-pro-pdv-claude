// ============================================================================
// Operações V3 — Recebimento MISTO: pagamento imediato + saldo "a prazo"
// ----------------------------------------------------------------------------
// Módulo PURO (sem I/O, sem React, sem Prisma). Usado pela tela (validação do
// rascunho) e pelo servidor (revalidação + assinatura de idempotência).
//
// "A prazo" NÃO é forma de dinheiro recebido: a linha a prazo é separada das
// linhas imediatas ANTES de qualquer soma de recebimento. Só `pagamentosAgora`
// vira baixa/caixa/movimentação; `saldoAPrazo` só formaliza o saldo restante no
// MESMO título da OS, com vencimento. Valores sempre comparados em centavos.
// ============================================================================

import {
  PAGAMENTO_STATUS_META_V3,
  formaLabelRecebimentoV3,
  formaSuportadaV3,
  type APrazoV3,
  type ComprovanteReciboV3,
  type PagamentoV3,
  type RecebimentoIntencaoV3,
  type SplitLinhaV3,
} from "./payment-model";
import type { OrdemServico } from "@/types/os";

/** Fuso da loja (convenção do repositório para "hoje" de negócio). */
export const FUSO_LOJA_V3 = "America/Sao_Paulo";

/** Identidade da confirmação: opaca, longa, sem ":" (não forja chaves de outra loja/OS). */
export const OPERACAO_ID_PATTERN_V3 = /^[A-Za-z0-9._-]{8,120}$/;

export const OBSERVACAO_MAX_V3 = 500;

export interface SaldoAPrazoInputV3 {
  valor: number;
  /** Data escolhida pelo operador, `YYYY-MM-DD`. Gravada como texto, sem fuso. */
  vencimento: string;
  observacao?: string;
}

/** Contrato discriminado da confirmação mista (enviado pela tela ao servidor). */
export interface RecebimentoMistoInputV3 {
  operacaoId: string;
  /** Obrigatório quando há pagamento imediato (caixa aberto da loja). */
  sessaoId?: string;
  /** Somente dinheiro efetivamente recebido agora (dinheiro/pix/débito/crédito). */
  pagamentosAgora: SplitLinhaV3[];
  /** Saldo restante formalizado a prazo — nunca entra na soma recebida. */
  saldoAPrazo: SaldoAPrazoInputV3;
  /** Saldo que o operador viu ao montar a operação (asserção de concorrência). */
  saldoEsperado: number;
  /** Rótulo da parte imediata (sinal/entrada/parcial). */
  intencao?: RecebimentoIntencaoV3;
  observacao?: string;
}

export interface LinhaImediataNormalizadaV3 {
  forma: SplitLinhaV3["forma"];
  centavos: number;
}

export interface RecebimentoMistoNormalizadoV3 {
  operacaoId: string;
  sessaoId: string | null;
  pagamentosAgora: LinhaImediataNormalizadaV3[];
  aPrazo: { centavos: number; vencimento: string; observacao: string | null };
  saldoEsperadoCentavos: number;
  intencao: Exclude<RecebimentoIntencaoV3, "quitacao"> | null;
  observacao: string | null;
  /** Σ das linhas imediatas, em centavos. */
  receberAgoraCentavos: number;
}

export type RecebimentoMistoErroCodigoV3 =
  | "entrada_invalida"
  | "nao_autenticado"
  | "sem_permissao"
  | "periodo_fechado"
  | "caixa_fechado"
  | "os_nao_encontrada"
  | "os_cancelada"
  | "sem_valor"
  | "titulo_inconsistente"
  | "titulo_encerrado"
  | "os_quitada"
  | "total_divergente"
  | "saldo_divergente"
  | "distribuicao_inconsistente"
  | "valor_acima_do_saldo"
  | "titulo_alterado"
  | "idempotencia_conflito"
  | "a_prazo_ja_formalizado"
  | "movimentacao_falhou"
  /** GOAL OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-002: preço não aprovado ou inconsistente (`elegibilidade-comercial`). */
  | "comercial_nao_elegivel";

export type ValidacaoMistaV3<T> =
  | { ok: true; valor: T }
  | { ok: false; code: RecebimentoMistoErroCodigoV3; mensagem: string };

// ----------------------------------------------------------------------------
// Dinheiro em centavos (estrito: nunca arredonda um valor inválido para "caber")
// ----------------------------------------------------------------------------

/** Centavos de um número finito, ≥ 0 e com no máximo 2 casas. `null` se inválido. */
export function centavosEstritosV3(valor: unknown): number | null {
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0) return null;
  const centavos = Math.round(valor * 100);
  if (Math.abs(valor * 100 - centavos) > 1e-6) return null;
  return centavos;
}

export function deCentavosV3(centavos: number): number {
  return Math.round(centavos) / 100;
}

/**
 * Converte o texto digitado (pt-BR) em centavos. Aceita "350", "350,00", "350.5",
 * "1.234,56". Vazio, negativo, letras ou mais de 2 casas → `null` (erro visível).
 */
export function parseValorDigitadoV3(texto: string | null | undefined): number | null {
  const t = (texto ?? "").trim();
  if (!t) return null;
  let normalizado: string | null = null;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t)) normalizado = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d+([.,]\d{1,2})?$/.test(t)) normalizado = t.replace(",", ".");
  if (normalizado === null) return null;
  return centavosEstritosV3(Number(normalizado));
}

export function formatarCentavosBRLV3(centavos: number): string {
  return deCentavosV3(centavos).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ----------------------------------------------------------------------------
// Vencimento: data civil YYYY-MM-DD, sem conversão de fuso
// ----------------------------------------------------------------------------

/** "Hoje" na loja (America/Sao_Paulo) como `YYYY-MM-DD`. */
export function hojeLojaV3(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO_LOJA_V3, year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}

/** `YYYY-MM-DD` de calendário real (rejeita 2026-02-30, formatos com hora, etc.). */
export function dataCivilValidaV3(texto: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (!m) return false;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  if (mes < 1 || mes > 12 || dia < 1) return false;
  const diasNoMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return dia <= diasNoMes;
}

export function validarVencimentoAPrazoV3(vencimento: string | null | undefined, hoje: string): { ok: true } | { ok: false; mensagem: string } {
  const v = (vencimento ?? "").trim();
  if (!v) return { ok: false, mensagem: "Informe o vencimento da parte a prazo." };
  if (!dataCivilValidaV3(v)) return { ok: false, mensagem: "Vencimento inválido: use uma data real (dd/mm/aaaa)." };
  if (v < hoje) return { ok: false, mensagem: "O vencimento a prazo não pode ser anterior a hoje." };
  return { ok: true };
}

/** "2026-11-10" → "10/11/2026" sem passar por `Date` (nenhum deslocamento de fuso). */
export function formatarVencimentoV3(vencimento: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec((vencimento ?? "").trim());
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (vencimento ?? "").trim() || "—";
}

// ----------------------------------------------------------------------------
// Normalização estrita da entrada (servidor E tela)
// ----------------------------------------------------------------------------

function textoOpcional(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, OBSERVACAO_MAX_V3) : null;
}

function invalida<T>(mensagem: string): ValidacaoMistaV3<T> {
  return { ok: false, code: "entrada_invalida", mensagem };
}

/**
 * Valida a FORMA da confirmação sem consultar o banco. Nada é descartado em
 * silêncio: linha vazia, negativa, com mais de 2 casas ou forma que não é
 * dinheiro recebido torna a entrada inválida.
 */
export function normalizarRecebimentoMistoV3(input: RecebimentoMistoInputV3, hoje: string): ValidacaoMistaV3<RecebimentoMistoNormalizadoV3> {
  if (!input || typeof input !== "object") return invalida("Dados do recebimento ausentes.");
  const operacaoId = typeof input.operacaoId === "string" ? input.operacaoId.trim() : "";
  if (!OPERACAO_ID_PATTERN_V3.test(operacaoId)) return invalida("Identificador da operação inválido.");

  const linhasBrutas = Array.isArray(input.pagamentosAgora) ? input.pagamentosAgora : null;
  if (!linhasBrutas) return invalida("Formas de pagamento imediato inválidas.");
  const pagamentosAgora: LinhaImediataNormalizadaV3[] = [];
  for (const linha of linhasBrutas) {
    const forma = linha?.forma;
    // Forma ausente nunca vira uma forma (GOAL OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-002, item E).
    if (forma === undefined || forma === null || (typeof forma === "string" && !forma.trim())) {
      return invalida("Escolha a forma de pagamento de cada valor recebido agora.");
    }
    if (typeof forma !== "string" || !formaSuportadaV3(forma)) {
      return invalida(`Forma "${formaLabelRecebimentoV3(String(forma ?? ""))}" não é dinheiro recebido agora. Use a linha "A prazo / crediário" para o saldo devido.`);
    }
    const centavos = centavosEstritosV3(linha.valor);
    if (centavos === null || centavos <= 0) {
      return invalida(`Valor inválido em ${formaLabelRecebimentoV3(forma)}: informe um valor maior que zero (ou remova a linha).`);
    }
    pagamentosAgora.push({ forma, centavos });
  }

  const aPrazoBruto = input.saldoAPrazo;
  if (!aPrazoBruto || typeof aPrazoBruto !== "object") return invalida("Informe a parte a prazo.");
  const aPrazoCentavos = centavosEstritosV3(aPrazoBruto.valor);
  if (aPrazoCentavos === null || aPrazoCentavos <= 0) return invalida("O valor a prazo deve ser maior que zero.");
  const vencimento = typeof aPrazoBruto.vencimento === "string" ? aPrazoBruto.vencimento.trim() : "";
  const vencimentoOk = validarVencimentoAPrazoV3(vencimento, hoje);
  if (!vencimentoOk.ok) return invalida(vencimentoOk.mensagem);

  const saldoEsperadoCentavos = centavosEstritosV3(input.saldoEsperado);
  if (saldoEsperadoCentavos === null || saldoEsperadoCentavos <= 0) return invalida("Saldo esperado inválido.");

  const receberAgoraCentavos = pagamentosAgora.reduce((acc, l) => acc + l.centavos, 0);
  const sessaoId = typeof input.sessaoId === "string" && input.sessaoId.trim() ? input.sessaoId.trim() : null;
  if (receberAgoraCentavos > 0 && !sessaoId) return invalida("Caixa fechado: abra o caixa no PDV antes de receber o pagamento imediato.");

  const intencao = input.intencao === "sinal" || input.intencao === "entrada" || input.intencao === "parcial" ? input.intencao : null;

  return {
    ok: true,
    valor: {
      operacaoId,
      // Sessão só faz parte da operação quando existe dinheiro entrando no caixa.
      sessaoId: receberAgoraCentavos > 0 ? sessaoId : null,
      pagamentosAgora,
      aPrazo: { centavos: aPrazoCentavos, vencimento, observacao: textoOpcional(aPrazoBruto.observacao) },
      saldoEsperadoCentavos,
      intencao,
      observacao: textoOpcional(input.observacao),
      receberAgoraCentavos,
    },
  };
}

/**
 * Distribuição contra o saldo REAL do ledger (calculado no servidor):
 * saldo observado ≠ saldo atual → conflito recuperável; Σ imediatos + a prazo
 * precisa cobrir exatamente o saldo atual — sem redistribuir nada.
 */
export function validarDistribuicaoMistaV3(
  n: Pick<RecebimentoMistoNormalizadoV3, "pagamentosAgora" | "aPrazo" | "saldoEsperadoCentavos" | "receberAgoraCentavos">,
  saldoAtualCentavos: number,
): ValidacaoMistaV3<{ saldoAtualCentavos: number }> {
  if (saldoAtualCentavos <= 0) return { ok: false, code: "os_quitada", mensagem: "Esta OS já está quitada — não há saldo para formalizar." };
  if (n.saldoEsperadoCentavos !== saldoAtualCentavos) {
    return {
      ok: false,
      code: "saldo_divergente",
      mensagem: `O saldo da OS mudou (agora ${formatarCentavosBRLV3(saldoAtualCentavos)}). Confira os valores e confirme de novo.`,
    };
  }
  if (n.pagamentosAgora.some((l) => l.centavos > saldoAtualCentavos) || n.aPrazo.centavos > saldoAtualCentavos) {
    return { ok: false, code: "valor_acima_do_saldo", mensagem: `Valor acima do saldo a receber (${formatarCentavosBRLV3(saldoAtualCentavos)}).` };
  }
  const distribuido = n.receberAgoraCentavos + n.aPrazo.centavos;
  if (distribuido > saldoAtualCentavos) {
    return { ok: false, code: "valor_acima_do_saldo", mensagem: `Receber agora + a prazo (${formatarCentavosBRLV3(distribuido)}) passa do saldo (${formatarCentavosBRLV3(saldoAtualCentavos)}).` };
  }
  if (distribuido !== saldoAtualCentavos) {
    return {
      ok: false,
      code: "distribuicao_inconsistente",
      mensagem: `Receber agora + a prazo (${formatarCentavosBRLV3(distribuido)}) precisa somar exatamente o saldo (${formatarCentavosBRLV3(saldoAtualCentavos)}).`,
    };
  }
  return { ok: true, valor: { saldoAtualCentavos } };
}

/**
 * Total em CENTAVOS por forma de pagamento: linhas da MESMA forma somam (PIX 50 + PIX 50 =
 * PIX 100), a ordem não importa e o resultado sai ordenado pela forma. Linha com valor não
 * finito ou ≤ 0 é ignorada — a mesma regra que a identidade já aplicava antes de agregar.
 * Formas diferentes nunca se fundem (não há alias entre formas).
 */
export function centavosPorFormaV3(linhas: ReadonlyArray<{ forma: unknown; centavos: number }>): Array<{ forma: string; centavos: number }> {
  const porForma = new Map<string, number>();
  for (const l of linhas) {
    if (!Number.isSafeInteger(l.centavos) || l.centavos <= 0) continue;
    const forma = String(l.forma ?? "");
    porForma.set(forma, (porForma.get(forma) ?? 0) + l.centavos);
  }
  return [...porForma.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([forma, centavos]) => ({ forma, centavos }));
}

/**
 * Assinatura canônica do conteúdo econômico protegido pelo `operacaoId`. A identidade é o
 * TOTAL por forma (em centavos), não a quantidade de linhas usada para representá-lo. O
 * servidor faz o hash (sha256) desta string — aqui fica só a forma canônica, sem `node:crypto`.
 */
export function assinaturaRecebimentoMistoV3(escopo: { storeId: string; osId: string }, n: RecebimentoMistoNormalizadoV3): string {
  return JSON.stringify({
    v: 2,
    storeId: escopo.storeId,
    osId: escopo.osId,
    sessaoId: n.sessaoId,
    pagamentosAgora: centavosPorFormaV3(n.pagamentosAgora),
    aPrazo: n.aPrazo,
    saldoEsperadoCentavos: n.saldoEsperadoCentavos,
    intencao: n.intencao,
    observacao: n.observacao,
  });
}

/**
 * Assinatura v1 (anterior ao agregado por forma), mantida SÓ para reconhecer confirmações
 * gravadas antes do fix: o servidor compara o fingerprint gravado com o v1 calculado para a
 * MESMA requisição — nunca aceita um fingerprint arbitrário. Novas operações gravam a v2.
 */
export function assinaturaRecebimentoMistoLegadaV1(escopo: { storeId: string; osId: string }, n: RecebimentoMistoNormalizadoV3): string {
  const linhas = [...n.pagamentosAgora]
    .map((l) => ({ forma: l.forma, centavos: l.centavos }))
    .sort((a, b) => (a.forma < b.forma ? -1 : a.forma > b.forma ? 1 : a.centavos - b.centavos));
  return JSON.stringify({
    v: 1,
    storeId: escopo.storeId,
    osId: escopo.osId,
    sessaoId: n.sessaoId,
    pagamentosAgora: linhas,
    aPrazo: n.aPrazo,
    saldoEsperadoCentavos: n.saldoEsperadoCentavos,
    intencao: n.intencao,
    observacao: n.observacao,
  });
}

// ----------------------------------------------------------------------------
// Rascunho da tela (mesmas regras, antes do servidor)
// ----------------------------------------------------------------------------

export interface LinhaRascunhoMistoV3 {
  /** `""` = forma ainda não escolhida pelo operador (nunca pré-selecionada). */
  forma: SplitLinhaV3["forma"] | "a_prazo" | "";
  valorStr: string;
}

export interface RascunhoMistoV3 {
  ok: boolean;
  erros: string[];
  pagamentosAgora: SplitLinhaV3[];
  receberAgoraCentavos: number;
  aPrazoCentavos: number;
  /** Saldo ainda não distribuído entre imediato e a prazo. */
  restanteCentavos: number;
  temAPrazo: boolean;
}

/** Valida o rascunho misto como o servidor validará (linha inválida = erro visível). */
export function avaliarRascunhoMistoV3(input: {
  linhas: LinhaRascunhoMistoV3[];
  vencimento: string;
  saldo: number;
  hoje: string;
}): RascunhoMistoV3 {
  const erros: string[] = [];
  const saldoCentavos = centavosEstritosV3(Math.max(0, input.saldo)) ?? 0;
  const linhasAPrazo = input.linhas.filter((l) => l.forma === "a_prazo");
  const pagamentosAgora: SplitLinhaV3[] = [];
  let receberAgoraCentavos = 0;
  let aPrazoCentavos = 0;

  if (linhasAPrazo.length > 1) erros.push("Use no máximo uma linha a prazo (um vencimento).");
  input.linhas.forEach((l, idx) => {
    if (!l.forma) {
      erros.push(`Linha ${idx + 1}: escolha a forma de pagamento.`);
      return;
    }
    const centavos = parseValorDigitadoV3(l.valorStr);
    const rotulo = l.forma === "a_prazo" ? "A prazo" : formaLabelRecebimentoV3(l.forma);
    if (centavos === null || centavos <= 0) {
      erros.push(`Linha ${idx + 1} (${rotulo}): informe um valor maior que zero ou remova a linha.`);
      return;
    }
    if (l.forma === "a_prazo") {
      aPrazoCentavos += centavos;
      return;
    }
    if (!formaSuportadaV3(l.forma)) {
      erros.push(`Linha ${idx + 1}: "${rotulo}" não é dinheiro recebido agora.`);
      return;
    }
    receberAgoraCentavos += centavos;
    pagamentosAgora.push({ forma: l.forma, valor: deCentavosV3(centavos) });
  });

  const temAPrazo = linhasAPrazo.length > 0;
  if (temAPrazo) {
    const venc = validarVencimentoAPrazoV3(input.vencimento, input.hoje);
    if (!venc.ok) erros.push(venc.mensagem);
  }
  if (saldoCentavos <= 0) erros.push("Esta OS não tem saldo a receber.");
  const distribuido = receberAgoraCentavos + aPrazoCentavos;
  if (saldoCentavos > 0 && distribuido > saldoCentavos) {
    erros.push(`Receber agora + a prazo (${formatarCentavosBRLV3(distribuido)}) passa do saldo (${formatarCentavosBRLV3(saldoCentavos)}).`);
  } else if (saldoCentavos > 0 && temAPrazo && distribuido !== saldoCentavos) {
    erros.push(`Distribua exatamente o saldo: faltam ${formatarCentavosBRLV3(saldoCentavos - distribuido)}.`);
  }

  return {
    ok: erros.length === 0,
    erros,
    pagamentosAgora,
    receberAgoraCentavos,
    aPrazoCentavos,
    restanteCentavos: Math.max(0, saldoCentavos - distribuido),
    temAPrazo,
  };
}

/** Valor a sugerir ao escolher "A prazo": o restante ainda não distribuído pelas outras linhas. */
export function sugestaoAPrazoCentavosV3(linhas: LinhaRascunhoMistoV3[], indiceAPrazo: number, saldo: number): number {
  const saldoCentavos = centavosEstritosV3(Math.max(0, saldo)) ?? 0;
  const outras = linhas.reduce((acc, l, idx) => {
    if (idx === indiceAPrazo) return acc;
    const c = parseValorDigitadoV3(l.valorStr);
    return acc + (c !== null && c > 0 ? c : 0);
  }, 0);
  return Math.max(0, saldoCentavos - outras);
}

export function rotuloBotaoRecebimentoMistoV3(receberAgoraCentavos: number, aPrazoCentavos: number): string {
  if (receberAgoraCentavos <= 0) return `Formalizar ${formatarCentavosBRLV3(aPrazoCentavos)} a prazo`;
  return `Registrar ${formatarCentavosBRLV3(receberAgoraCentavos)} + ${formatarCentavosBRLV3(aPrazoCentavos)} a prazo`;
}

// ----------------------------------------------------------------------------
// Comprovante (dinheiro recebido ≠ saldo a prazo)
// ----------------------------------------------------------------------------

export const SITUACAO_PARCIAL_A_PRAZO_V3 = "Pagamento parcial — saldo a prazo";
export const SITUACAO_INTEGRAL_A_PRAZO_V3 = "Saldo a prazo — nenhum valor recebido nesta operação";

/** Comprovante da confirmação mista: o "valor pago" é só o dinheiro recebido agora. */
export function montarComprovanteMistoV3(input: {
  os: OrdemServico;
  pagamentosAgora: SplitLinhaV3[];
  valorRecebidoAgora: number;
  recebidoAnteriormente: number;
  pagamento: PagamentoV3;
  aPrazo: Pick<APrazoV3, "valor" | "vencimento" | "observacao">;
  operador: string;
  dataHora: string;
  observacao?: string;
}): ComprovanteReciboV3 {
  const { os } = input;
  const recebeuAgora = input.valorRecebidoAgora > 0;
  const equipamento =
    [os.equipamento?.marca, os.equipamento?.modelo].filter(Boolean).join(" ").trim() || os.equipamento?.tipo || "—";
  return {
    numeroOS: os.codigo ?? os.id ?? "—",
    cliente: os.cliente?.nome ?? "—",
    equipamento,
    formas: input.pagamentosAgora
      .filter((l) => l.valor > 0)
      .map((l) => ({ forma: l.forma, label: formaLabelRecebimentoV3(l.forma), valor: deCentavosV3(centavosEstritosV3(l.valor) ?? 0) })),
    intencaoLabel: recebeuAgora ? SITUACAO_PARCIAL_A_PRAZO_V3 : "Formalização a prazo",
    valorPago: input.valorRecebidoAgora,
    totalOS: input.pagamento.total,
    recebidoAcumulado: input.pagamento.recebido,
    saldoRestante: input.pagamento.saldo,
    statusPagamento: input.pagamento.status,
    statusLabel: PAGAMENTO_STATUS_META_V3[input.pagamento.status].label,
    dataHora: input.dataHora,
    operador: input.operador,
    observacao: input.observacao?.trim() || undefined,
    tipoComprovante: recebeuAgora ? "recebimento_misto" : "formalizacao_a_prazo",
    recebidoAnteriormente: input.recebidoAnteriormente,
    situacaoLabel: recebeuAgora ? SITUACAO_PARCIAL_A_PRAZO_V3 : SITUACAO_INTEGRAL_A_PRAZO_V3,
    aPrazo: {
      valor: input.aPrazo.valor,
      vencimento: input.aPrazo.vencimento,
      observacao: input.aPrazo.observacao?.trim() || undefined,
    },
  };
}

/** Identificador novo para UMA confirmação (reusado nas tentativas da mesma confirmação). */
export function gerarOperacaoIdV3(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

type EntradaConteudoRecebimentoV3 = {
  sessaoId?: string | null;
  linhas?: ReadonlyArray<{ forma: string; valor: unknown }> | null;
  forma?: string | null;
  valor?: unknown;
};

/** Linhas brutas (split, ou forma única como 1 linha) já em centavos inteiros. */
function linhasEmCentavosV3(input: EntradaConteudoRecebimentoV3): Array<{ forma: string; centavos: number }> {
  const brutas = Array.isArray(input.linhas) && input.linhas.length > 0 ? input.linhas : input.forma ? [{ forma: input.forma, valor: input.valor }] : [];
  return brutas.map((l) => ({ forma: String(l.forma ?? ""), centavos: Math.round(Number(l.valor) * 100) }));
}

/**
 * Conteúdo ECONÔMICO de um recebimento canônico (`receberOSV3`): sessão de caixa + TOTAL EM
 * CENTAVOS POR FORMA. É a identidade de UMA confirmação, igual na tela e no servidor: PIX 100,
 * PIX 50 + PIX 50 e forma única/split equivalentes são o MESMO recebimento; formas, centavos
 * ou sessão diferentes não. Rótulos (intenção, observação) e o saldo visto não mudam a identidade.
 */
export function conteudoRecebimentoCanonicoV3(input: EntradaConteudoRecebimentoV3): string {
  const formas = centavosPorFormaV3(linhasEmCentavosV3(input)).map((l) => [l.forma, l.centavos] as [string, number]);
  return JSON.stringify({ v: 2, sessaoId: (input.sessaoId ?? "").trim(), formas });
}

/**
 * Conteúdo v1 (linhas ordenadas, SEM agregar por forma) — só para reconhecer recebimentos
 * gravados antes do fix, recalculado para a MESMA requisição (compatibilidade estrita).
 */
export function conteudoRecebimentoCanonicoLegadoV1(input: EntradaConteudoRecebimentoV3): string {
  const linhas = linhasEmCentavosV3(input)
    .filter((l) => Number.isFinite(l.centavos) && l.centavos > 0)
    .map((l) => [l.forma, l.centavos] as [string, number])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]));
  return JSON.stringify({ v: 1, sessaoId: (input.sessaoId ?? "").trim(), linhas });
}
