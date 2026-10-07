// ============================================================================
// Operações V4 — formulário de recebimento (GOAL OPS-V4-RECEBIMENTO-TRANSVERSAL-005)
// ----------------------------------------------------------------------------
// Módulo PURO. Monta o input canônico de `receberOSV3` e valida o rascunho da
// UX (intenção + split) com os mesmos helpers da V3. Sem motor novo.
// ============================================================================

import { avaliarRascunhoMistoV3, deCentavosV3, hojeLojaV3, parseValorDigitadoV3, validarVencimentoAPrazoV3, type LinhaRascunhoMistoV3 } from "@/lib/operacoes-v3/recebimento-misto-model";
import type { DadosRecebimentoMistoV3 } from "@/components/operacoes-v3/hooks/use-pdv-servico-v3";
import type { ReceberOSInputV3 } from "@/lib/operacoes-v3/pdv-servico-actions";
import {
  INTENCOES_RECEBIMENTO_V3,
  money,
  somaSplitV3,
  validarSplitV3,
  type FormaRecebimentoV3,
  type RecebimentoIntencaoV3,
  type SplitLinhaV3,
} from "@/lib/operacoes-v3/payment-model";

export type IntencaoRecebimentoV4 = RecebimentoIntencaoV3 | "quitacao";

export const INTENCOES_RECEBIMENTO_V4: { value: IntencaoRecebimentoV4; label: string }[] = [
  { value: "quitacao", label: "Quitar saldo" },
  ...INTENCOES_RECEBIMENTO_V3,
];

export interface LinhaDraftRecebimentoV4 {
  forma: FormaRecebimentoV3;
  valorStr: string;
}

export function parseValorRecebimentoV4(raw: string): number {
  return deCentavosV3(parseValorDigitadoV3(raw) ?? 0);
}

export function valorSugeridoRecebimentoV4(intencao: IntencaoRecebimentoV4, saldo: number): number {
  const s = money(saldo);
  if (!(s > 0)) return 0;
  if (intencao === "quitacao") return s;
  return 0;
}

export function linhasValidasRecebimentoV4(linhas: LinhaDraftRecebimentoV4[]): SplitLinhaV3[] {
  return linhas
    .map((linha) => ({ forma: linha.forma, valor: parseValorRecebimentoV4(linha.valorStr) }))
    .filter((linha) => linha.valor > 0);
}

export function rascunhoRecebimentoValidoV4(input: {
  linhas: LinhaDraftRecebimentoV4[];
  saldo: number;
  intencao: IntencaoRecebimentoV4;
}): { ok: boolean; motivo?: string; totalInformado: number; restante: number } {
  const algumaLinhaInvalida = input.linhas.some((linha) => !(parseValorRecebimentoV4(linha.valorStr) > 0));
  const linhas = linhasValidasRecebimentoV4(input.linhas);
  const totalInformado = somaSplitV3(linhas);
  const restante = money(Math.max(0, money(input.saldo) - totalInformado));
  if (algumaLinhaInvalida) {
    return { ok: false, motivo: "Informe um valor maior que zero em todas as formas adicionadas.", totalInformado, restante };
  }
  const veredito = validarSplitV3(linhas, input.saldo);
  if (!veredito.ok) return { ok: false, motivo: veredito.motivo, totalInformado, restante };
  if (input.intencao === "quitacao" && restante > 0.009) {
    return { ok: false, motivo: "Para quitar, o informado precisa cobrir o saldo.", totalInformado, restante };
  }
  return { ok: true, totalInformado, restante };
}

/** Data civil real, validada no fuso da loja pelo helper canônico V3. */
export function vencimentoAPrazoValidoV4(vencimento: string, hoje = hojeLojaV3()): boolean {
  return validarVencimentoAPrazoV3(vencimento, hoje).ok;
}

/** "a_prazo" discrimina a linha de dívida; nunca é FormaRecebimentoV3 imediata. */
export type LinhaRecebimentoV4 = LinhaRascunhoMistoV3;

export function avaliarRecebimentoV4(input: {
  linhas: LinhaRecebimentoV4[];
  saldo: number;
  intencao: IntencaoRecebimentoV4;
  vencimento: string;
  caixaAberto: boolean;
  aPrazoExistente: boolean;
  hoje?: string;
}) {
  const rascunho = avaliarRascunhoMistoV3({ ...input, hoje: input.hoje ?? hojeLojaV3() });
  const erros = [...rascunho.erros];
  if (!rascunho.temAPrazo) {
    const imediato = rascunhoRecebimentoValidoV4({
      linhas: rascunho.pagamentosAgora.map((l) => ({ forma: l.forma, valorStr: String(l.valor) })),
      saldo: input.saldo,
      intencao: input.intencao,
    });
    if (!imediato.ok && imediato.motivo) erros.push(imediato.motivo);
  }
  if (rascunho.receberAgoraCentavos > 0 && !input.caixaAberto) erros.push("Abra o caixa para registrar o valor recebido agora.");
  if (rascunho.temAPrazo && input.aPrazoExistente) erros.push("Este saldo já está a prazo. Escolha uma forma imediata para recebê-lo.");
  return { ...rascunho, erros, ok: erros.length === 0 };
}

/** Um campo visual de observação: mesma nota na operação e na formalização. */
export function buildRecebimentoMistoV4(input: {
  rascunho: ReturnType<typeof avaliarRecebimentoV4>;
  saldo: number;
  vencimento: string;
  sessaoId?: string;
  intencao: IntencaoRecebimentoV4;
  observacao?: string;
}): DadosRecebimentoMistoV3 {
  const observacao = input.observacao?.trim() || undefined;
  return {
    pagamentosAgora: input.rascunho.pagamentosAgora,
    saldoAPrazo: { valor: deCentavosV3(input.rascunho.aPrazoCentavos), vencimento: input.vencimento.trim(), observacao },
    saldoEsperado: input.saldo,
    ...(input.rascunho.receberAgoraCentavos > 0 ? { sessaoId: input.sessaoId } : {}),
    intencao: input.intencao === "quitacao" ? "parcial" : input.intencao,
    observacao,
  };
}

/** Converte o rascunho no input canônico de `receberOSV3`. Quitação é rótulo UX — o motor deriva. */
export function buildReceberOSInputV4(input: {
  linhas: SplitLinhaV3[];
  sessaoId: string;
  intencao: IntencaoRecebimentoV4;
  observacao?: string;
}): ReceberOSInputV3 {
  return {
    linhas: input.linhas,
    sessaoId: input.sessaoId.trim(),
    intencao: input.intencao === "quitacao" ? undefined : input.intencao,
    observacao: input.observacao?.trim() || undefined,
  };
}
