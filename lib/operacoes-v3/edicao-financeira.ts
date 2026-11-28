import type { ContaReceberTitulo, Prisma } from "@/generated/prisma";
import { normalizeReceberStatus, RECEBER_STATUS } from "@/lib/financeiro/contracts/status";
import { reconciliarRecebimentosFinanceirosV3 } from "./delivery-financial-guard";
import type { EdicaoCompletaV3 } from "./edicao-completa-model";
import type { OrcamentoV3 } from "./orcamento-model";
import { dadosFinanceirosEmpresa } from "@/lib/gastos/financeiro-scope";

export const AJUSTE_SEGURO_OBRIGATORIO = "Há recebimento, estorno, fechamento ou divergência financeira. Use o fluxo financeiro de ajuste/compensação antes de alterar a cobrança; nenhum histórico será reescrito.";
const centavos = (n: number) => Math.round(n * 100);
export const objetoEdicao = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};

/** Mantém identidades, vencimentos e ordem das parcelas; distribui o residual em centavos. */
export function redistribuirParcelasEdicaoV3(parcelas: unknown, anterior: number, novo: number): unknown {
  if (parcelas == null) return parcelas;
  if (!Array.isArray(parcelas) || !parcelas.length) throw new Error("Parcelamento inconsistente. Confira o título no Financeiro.");
  const linhas = parcelas.map(objetoEdicao);
  const soma = linhas.reduce((s, p) => s + (typeof p.valor === "number" && Number.isFinite(p.valor) && p.valor > 0 ? centavos(p.valor) : NaN), 0);
  if (!Number.isFinite(soma) || soma !== centavos(anterior) || linhas.some((p) => p.pago === true || p.status && !["pendente", "PENDENTE", "aberto"].includes(String(p.status)))) throw new Error(AJUSTE_SEGURO_OBRIGATORIO);
  const total = centavos(novo);
  if (total < linhas.length) throw new Error("O novo total não comporta as parcelas pendentes. Renegocie no Financeiro.");
  let distribuido = 0;
  return linhas.map((p, i) => {
    const valor = i === linhas.length - 1 ? total - distribuido : Math.floor(centavos(Number(p.valor)) * total / soma);
    if (valor < 1) throw new Error("O novo total gera parcela sem valor. Renegocie no Financeiro.");
    distribuido += valor;
    return { ...p, valor: valor / 100 };
  });
}

export function planejarEdicaoFinanceiraV3(titulo: { valor: number; status: string; payload: unknown } | null, anterior: number, novo: number, mudouPagamento: boolean, temMovimento: boolean, fechado: boolean): void {
  if (centavos(anterior) === centavos(novo) && !mudouPagamento) return;
  if (fechado || temMovimento) throw new Error(AJUSTE_SEGURO_OBRIGATORIO);
  if (!titulo) {
    if (mudouPagamento) throw new Error("Não existe cobrança formalizada. Gere a cobrança pelo fluxo financeiro antes de alterar suas condições.");
    return;
  }
  const r = reconciliarRecebimentosFinanceirosV3(titulo.payload);
  const p = objetoEdicao(titulo.payload);
  if (!r.valido || r.recebidoCentavos > 0 || r.estornadoCentavos > 0 || normalizeReceberStatus(titulo.status) !== RECEBER_STATUS.PENDENTE || centavos(titulo.valor) !== centavos(anterior) || novo <= 0 || Number(p.entry_value ?? 0) > 0 || p.movimentoBaixaId || p.canceladoEm || p.estornoTituloEm) throw new Error(AJUSTE_SEGURO_OBRIGATORIO);
  if (p.total_value !== undefined && centavos(Number(p.total_value)) !== centavos(anterior)) throw new Error(AJUSTE_SEGURO_OBRIGATORIO);
  for (const campo of ["valor", "total", "saldoAberto"]) if (p[campo] !== undefined && centavos(Number(p[campo])) !== centavos(anterior)) throw new Error(AJUSTE_SEGURO_OBRIGATORIO);
  if (Array.isArray(p.historicoPagamentos) && p.historicoPagamentos.length || p.pagoEm || p.recebidoEm) throw new Error(AJUSTE_SEGURO_OBRIGATORIO);
  if (p.parcelas) redistribuirParcelasEdicaoV3(p.parcelas, anterior, novo);
}

/** Nenhum pagamento, movimento de caixa ou título novo é criado por uma correção. */
export async function reconciliarEdicaoFinanceiraV3(tx: Prisma.TransactionClient, titulo: ContaReceberTitulo, d: EdicaoCompletaV3, total: number, contexto: { agora: string; operadorId: string; supervisorId: string; operacaoId: string; motivo: string }, orcamento: OrcamentoV3): Promise<Record<string, unknown>> {
  const anterior = objetoEdicao(titulo.payload);
  const payload = {
    ...anterior, valor: total, clienteId: d.cliente.id, cliente: d.cliente.nome, clienteNome: d.cliente.nome, orcamento,
    ...(anterior.total !== undefined ? { total } : {}),
    ...(anterior.saldoAberto !== undefined ? { saldoAberto: total } : {}),
    ...(anterior.total_value !== undefined ? { total_value: total } : {}),
    ...(anterior.parcelas ? { parcelas: redistribuirParcelasEdicaoV3(anterior.parcelas, titulo.valor, total) } : {}),
    formaPagamentoPreferida: d.pagamento.formaPreferida,
    vencimento: d.pagamento.vencimento,
    historico: [...(Array.isArray(anterior.historico) ? anterior.historico : []), { tipo: "correcao_os", at: contexto.agora, ...contexto, valorAnterior: titulo.valor, valorNovo: total, vencimentoAnterior: titulo.vencimento, vencimentoNovo: d.pagamento.vencimento }],
  };
  // Reconciliação G002: writer posterior à base — o valor novo carrega escopo EMPRESA e precisão
  // em centavos (CHECK valor×valorCentavos) na mesma transação; o título é sempre empresarial.
  if (!titulo.storeId) throw new Error(AJUSTE_SEGURO_OBRIGATORIO);
  const escopo = await dadosFinanceirosEmpresa(tx, titulo.storeId, total, { receberTituloId: titulo.id });
  await tx.contaReceberTitulo.update({ where: { id: titulo.id }, data: { ...escopo, valor: total, cliente: d.cliente.nome, vencimento: d.pagamento.vencimento, payload: payload as unknown as Prisma.InputJsonValue } });
  await tx.auditoriaFinanceira.create({ data: { storeId: titulo.storeId, entidade: "receber", entidadeId: titulo.id, acao: "editar", usuarioId: contexto.operadorId, antes: { valor: titulo.valor, vencimento: titulo.vencimento, payload: titulo.payload } as Prisma.InputJsonValue, depois: { valor: total, payload, ...contexto } as unknown as Prisma.InputJsonValue } });
  return payload;
}
