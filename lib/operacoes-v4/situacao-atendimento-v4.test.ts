/**
 * OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-001 — view-model único da situação do
 * atendimento. Puro: mesma projeção → mesmos textos para as quatro superfícies.
 */
import { describe, expect, it } from "vitest";
import type { OrdemServico } from "@/types/os";
import { localKeyContaReceberOSV3 } from "@/lib/operacoes-v3/payment-model";
import { projectFinancialOSV4, type ProjectFinancialOSV4Input } from "./financial-projection";
import { derivarSituacaoAtendimentoV4, formaRegistradaV4, pagamentoComPendenciaComercialV4, TEXTO_SITUACAO_V4 } from "./situacao-atendimento-v4";

const storeId = "loja-sit";
const osId = "os-sit";
const localKey = localKeyContaReceberOSV3(storeId, osId);

function os(status: string, extra: Record<string, unknown> = {}) {
  return {
    id: osId,
    codigo: "OS-SIT",
    status: "pronta",
    operacaoStatusV3: "pronta",
    orcamento: { id: "orc", status, sintetizado: false, total: 420, desconto: 0, servicos: [{ id: "s1", descricao: "Troca de Tela", valor: 420 }], pecas: [], criadoEm: "2026-09-18T10:00:00.000Z" },
    timeline: [{ id: "ev-1", tipo: "operacao_cobranca_gerada", autor: "Op", conteudo: "Quitação", criadoEm: "2026-10-05T21:37:38.000Z", metadata: { operacaoId: "op-1", total: 420, linhas: [{ forma: "dinheiro", valor: 420 }] } }],
    ...extra,
  } as unknown as OrdemServico & Record<string, unknown>;
}

const liquidado = { id: "cr", storeId, localKey, valor: 420, status: "pago", payload: { ordemServicoId: osId, historico: [{ tipo: "liquidacao", valor: 420, loteId: "op-1" }] } };

function projecao(over: Partial<ProjectFinancialOSV4Input> = {}) {
  return projectFinancialOSV4({ storeId, osId, payload: os("rascunho"), prismaValorTotal: 420, titulo: liquidado, loadedAt: "2026-10-09T12:00:00.000Z", ...over });
}

const ler = (projection: ReturnType<typeof projecao> | null, extra: { loading?: boolean; error?: string | null; osId?: string } = {}) =>
  derivarSituacaoAtendimentoV4({ osId: extra.osId ?? osId, projection, loading: extra.loading ?? false, error: extra.error ?? null });

describe("situação do atendimento — pagamento ≠ aprovação comercial ≠ entrega", () => {
  it("A1: pagamento verificado e pendência comercial aparecem separados, com uma ação para o comercial", () => {
    const s = ler(projecao());
    expect(s.estado).toBe("pronta");
    expect(s.pagamento).toMatchObject({
      estado: "registrado",
      tom: "success",
      rotulo: "Pagamento registrado — R$ 420,00",
      saldoRotulo: "Saldo do título — R$ 0,00",
      meio: "Dinheiro",
      verificavel: true,
      liquidado: true,
    });
    expect(s.comercial).toMatchObject({ pendente: true, tom: "warning", rotulo: TEXTO_SITUACAO_V4.aprovacaoPendente });
    expect(s.comercial.detalhe).toBe("Orçamento em rascunho · R$ 420,00 · confere com o título");
    expect(s.impedimento).toMatchObject({ codigo: "APROVACAO_COMERCIAL_PENDENTE", destino: "comercial", titulo: "Revisar aprovação comercial", acao: "Abrir orçamento" });
    expect(pagamentoComPendenciaComercialV4(s)).toBe(true);
  });

  it("A2: orçamento aprovado + título liquidado — nenhum impedimento, comercial aprovado", () => {
    const s = ler(projecao({ payload: os("aprovado") }));
    expect(s.impedimento).toBeNull();
    expect(s.comercial).toMatchObject({ pendente: false, rotulo: "Orçamento aprovado", detalhe: "R$ 420,00" });
    expect(s.pagamento).toMatchObject({ estado: "registrado", liquidado: true });
  });

  it("registro de pagamento sem verificação: conferência pendente, nunca selo verde nem valores", () => {
    const s = ler(projecao({ titulo: { ...liquidado, payload: { ordemServicoId: osId, historico: [{ tipo: "liquidacao", valor: 420 }, { tipo: "liquidacao", valor: 420 }] } } }));
    expect(s.pagamento).toMatchObject({ estado: "conferencia_pendente", tom: "warning", rotulo: TEXTO_SITUACAO_V4.conferenciaPendente, verificavel: false, liquidado: false, recebidoLiquido: null, saldoTitulo: null });
    expect(pagamentoComPendenciaComercialV4(s)).toBe(false);
  });

  it("falha real de leitura é o ÚNICO caso de 'Financeiro indisponível'", () => {
    expect(ler(null, { error: "timeout" })).toMatchObject({ estado: "erro", pagamento: { rotulo: TEXTO_SITUACAO_V4.indisponivel }, impedimento: { codigo: "FALHA_LEITURA", destino: "recarregar" } });
    expect(ler(projecao({ falhaLeituraTitulo: true })).pagamento.rotulo).toBe(TEXTO_SITUACAO_V4.indisponivel);
    expect(ler(projecao()).pagamento.rotulo).not.toBe(TEXTO_SITUACAO_V4.indisponivel);
  });

  it("A8: projeção de OUTRA OS (resposta tardia) ou em leitura = carregando, sem fatos nem impedimento", () => {
    expect(ler(projecao(), { osId: "outra-os" })).toMatchObject({ estado: "carregando", impedimento: null, pagamento: { verificavel: false, recebidoLiquido: null } });
    expect(ler(projecao(), { loading: true }).estado).toBe("carregando");
  });

  it("sem título: nenhuma Conta a Receber, sem inventar zero", () => {
    const s = ler(projecao({ titulo: null }));
    expect(s.pagamento).toMatchObject({ estado: "sem_titulo", rotulo: TEXTO_SITUACAO_V4.semTitulo, recebidoLiquido: null, saldoTitulo: null });
    expect(s.impedimento?.codigo).toBe("APROVACAO_COMERCIAL_PENDENTE");
  });

  it("pagamento sem meio identificável não ganha forma inventada", () => {
    const s = ler(projecao({ payload: os("rascunho", { timeline: [] }) }));
    expect(s.pagamento.meio).toBe("Forma não identificada no título");
  });
});

describe("OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-001 — R1: forma de pagamento só pelos fatos", () => {
  it("baixa op-1 + timeline Pix de OUTRA operação: forma não identificada (nunca Pix)", () => {
    const p = projecao({ payload: os("aprovado", { timeline: [{ id: "ev-x", tipo: "operacao_cobranca_gerada", autor: "Op", conteudo: "Pix", criadoEm: "2026-10-05T21:37:38.000Z", metadata: { operacaoId: "op-outra", total: 420, linhas: [{ forma: "pix", valor: 420 }] } }] }) });
    expect(p.paymentMethods.map((m) => m.label)).toEqual(["Pix"]);
    expect(formaRegistradaV4(p, "Pix")).toBe("Forma não identificada no título");
  });

  it("título em conferência = 'Em conferência'; sem título = 'Não registrada'; falha = 'Indisponível'", () => {
    expect(formaRegistradaV4(projecao({ titulo: { ...liquidado, payload: { ordemServicoId: osId, historico: [{ tipo: "liquidacao", valor: 420 }, null] } } }), "Dinheiro")).toBe("Em conferência");
    expect(formaRegistradaV4(projecao({ titulo: null }), "Dinheiro")).toBe("Não registrada");
    expect(formaRegistradaV4(projecao({ falhaLeituraTitulo: true }), "Dinheiro")).toBe("Indisponível");
    expect(formaRegistradaV4(projecao(), "x")).toBe("Dinheiro");
  });
});
