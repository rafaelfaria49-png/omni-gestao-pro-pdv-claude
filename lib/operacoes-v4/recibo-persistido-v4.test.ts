// OPS-V4-FLUXO-CURTO-006 — comprovante persistido (reimpressão após reload).
import { describe, expect, it } from "vitest";
import type { OrdemServico } from "@/types/os";
import { montarComprovanteReciboV3, type PagamentoV3 } from "@/lib/operacoes-v3/payment-model";
import { montarComprovanteMistoV3 } from "@/lib/operacoes-v3/recebimento-misto-model";
import { comprovantesValidosDaOSV4, escolherReciboV4, lerReciboDaProjecaoV4, lerReciboPersistidoV4 } from "./recibo-persistido-v4";

const os = { id: "os-a", codigo: "OS-A", cliente: { nome: "Cliente QA" }, equipamento: { marca: "Samsung", modelo: "A54" } } as OrdemServico;
const pag = (total: number, recebido: number): PagamentoV3 =>
  ({ total, recebido, saldo: total - recebido, status: recebido >= total ? "quitado" : recebido > 0 ? "parcial" : "aberto" }) as PagamentoV3;

function recebimento(id: string, valor: number, acumulado: number, total = 300, forma: "pix" | "dinheiro" = "pix") {
  return {
    id,
    tipo: "operacao_cobranca_gerada",
    metadata: {
      operacaoId: `op-${id}`,
      comprovante: montarComprovanteReciboV3({
        os,
        linhas: [{ forma, valor }],
        valorPago: valor,
        pagamento: pag(total, acumulado),
        intencaoLabel: acumulado >= total ? "Quitação" : "Parcial",
        operador: "QA",
        dataHora: `2026-10-08T12:00:00.000Z#${id}`,
      }),
    },
  };
}
const estorno = (id: string, valor: number) => ({
  id,
  tipo: "financeiro_conta_receber_atualizada",
  metadata: { estornado: valor, saldo: 0, status: "parcial", modo: "ultimo_pagamento" },
});

describe("OPS-V4-FLUXO-CURTO-006 — recibo persistido", () => {
  it("parcial 100 + 200: reimprime o último comprovante da MESMA OS, coerente com o recebido atual", () => {
    const leitura = lerReciboPersistidoV4({ os: { timeline: [recebimento("e1", 100, 100), recebimento("e2", 200, 300)] }, recebidoAtual: 300 });
    expect(leitura.estado).toBe("disponivel");
    if (leitura.estado !== "disponivel") return;
    expect(leitura.persistido.eventoId).toBe("e2");
    expect(leitura.persistido.recibo).toMatchObject({ numeroOS: "OS-A", valorPago: 200, recebidoAcumulado: 300, saldoRestante: 0 });
  });

  it("estorno do último pagamento invalida o comprovante estornado e devolve o anterior", () => {
    const timeline = [recebimento("e1", 100, 100), recebimento("e2", 200, 300), estorno("e3", 200)];
    expect(comprovantesValidosDaOSV4({ timeline }).map((r) => r.eventoId)).toEqual(["e1"]);
    const leitura = lerReciboPersistidoV4({ os: { timeline }, recebidoAtual: 100 });
    expect(leitura.estado === "disponivel" && leitura.persistido.eventoId).toBe("e1");
  });

  it("estorno de tudo: sem recebimento → nada é oferecido", () => {
    const timeline = [recebimento("e1", 300, 300), estorno("e2", 300)];
    expect(lerReciboPersistidoV4({ os: { timeline }, recebidoAtual: 0 })).toEqual({ estado: "sem_recebimento" });
  });

  it("histórico alterado fora da OS (recebido atual diverge do comprovante) → indisponível, nunca um estado que não existe", () => {
    expect(lerReciboPersistidoV4({ os: { timeline: [recebimento("e1", 100, 100)] }, recebidoAtual: 250 })).toEqual({ estado: "indisponivel" });
  });

  it("recebido atual desconhecido (projeção carregando/erro) → confirmando", () => {
    expect(lerReciboPersistidoV4({ os: { timeline: [recebimento("e1", 100, 100)] }, recebidoAtual: null })).toEqual({ estado: "confirmando" });
  });

  it("misto 350 + 50 a prazo: o comprovante gravado no evento a prazo é reimpresso (recebido 350)", () => {
    const comprovante = montarComprovanteMistoV3({
      os,
      pagamentosAgora: [{ forma: "debito", valor: 350 }],
      valorRecebidoAgora: 350,
      recebidoAnteriormente: 0,
      pagamento: pag(400, 350),
      aPrazo: { valor: 50, vencimento: "2099-12-31" },
      operador: "QA",
      dataHora: "2026-10-08T12:00:00.000Z",
    });
    const timeline = [
      { id: "m1", tipo: "operacao_cobranca_gerada", metadata: { operacaoId: "op-m", modo: "recebimento_misto", total: 350 } },
      { id: "m2", tipo: "financeiro_conta_receber_criada", metadata: { modo: "a_prazo", operacaoId: "op-m", comprovante } },
    ];
    const leitura = lerReciboPersistidoV4({ os: { timeline }, recebidoAtual: 350 });
    expect(leitura.estado === "disponivel" && leitura.persistido.recibo).toMatchObject({ valorPago: 350, aPrazo: { valor: 50 } });
  });

  it("ignora metadados que não têm o formato do comprovante canônico (nunca fabrica recibo)", () => {
    const timeline = [{ id: "x", tipo: "operacao_cobranca_gerada", metadata: { comprovante: { numeroOS: "OS-A", valorPago: "300" } } }];
    expect(comprovantesValidosDaOSV4({ timeline })).toEqual([]);
    expect(comprovantesValidosDaOSV4(null)).toEqual([]);
    expect(lerReciboPersistidoV4({ os: { timeline }, recebidoAtual: 300 })).toEqual({ estado: "indisponivel" });
  });
});

describe("OPS-V4-FLUXO-CURTO-006 — comprovante oferecido: OS × pagamentos vigentes do título (R1/R2)", () => {
  const pagou = (valor: number, id: string) => ({ amount: valor, operationId: `op-${id}` });
  const comprovante = (ev: ReturnType<typeof recebimento>) => ev.metadata.comprovante;

  it("parcial 100 + 200: casa com o título e a sessão marca 'acabou de receber'", () => {
    const e1 = recebimento("e1", 100, 100);
    const e2 = recebimento("e2", 200, 300);
    const leitura = escolherReciboV4({ sessao: comprovante(e2), os: { timeline: [e1, e2] }, recebidoAtual: 300, pagamentosVigentes: [pagou(100, "e1"), pagou(200, "e2")] });
    expect(leitura).toMatchObject({ estado: "disponivel", origem: "sessao", eventoId: "e2", recibo: { valorPago: 200 } });
  });

  it("R2: estorno do PIX 200 e reposição de 200 em dinheiro (mesmo acumulado) — nunca o PIX estornado da sessão", () => {
    const e1 = recebimento("e1", 100, 100);
    const e2 = recebimento("e2", 200, 300);
    const e4 = recebimento("e4", 200, 300, 300, "dinheiro");
    const leitura = escolherReciboV4({
      sessao: comprovante(e2),
      os: { timeline: [e1, e2, estorno("e3", 200), e4] },
      recebidoAtual: 300,
      pagamentosVigentes: [pagou(100, "e1"), pagou(200, "e4")],
    });
    expect(leitura).toMatchObject({ estado: "disponivel", origem: "persistido", eventoId: "e4" });
    expect(leitura.estado === "disponivel" && leitura.recibo.formas.map((f) => f.forma)).toEqual(["dinheiro"]);
  });

  it("estorno e reposição feitos FORA da OS (só no título): nada é oferecido, nem com o mesmo acumulado", () => {
    const e1 = recebimento("e1", 100, 100);
    const e2 = recebimento("e2", 200, 300);
    // Título: 100 (e1) + 200 externo; o PIX 200 da OS foi estornado no Financeiro.
    expect(escolherReciboV4({ sessao: comprovante(e2), os: { timeline: [e1, e2] }, recebidoAtual: 300, pagamentosVigentes: [pagou(100, "e1"), { amount: 200, operationId: "baixa-externa" }] })).toEqual({ estado: "indisponivel" });
    // Baixa externa a mais (sem comprovante na OS): sequência não casa.
    expect(escolherReciboV4({ sessao: null, os: { timeline: [e1] }, recebidoAtual: 300, pagamentosVigentes: [pagou(100, "e1"), { amount: 200, operationId: null }] })).toEqual({ estado: "indisponivel" });
  });

  it("estorno pela OS sem reposição: volta ao comprovante anterior; estorno de tudo = sem recebimento", () => {
    const e1 = recebimento("e1", 100, 100);
    const e2 = recebimento("e2", 200, 300);
    expect(escolherReciboV4({ sessao: comprovante(e2), os: { timeline: [e1, e2, estorno("e3", 200)] }, recebidoAtual: 100, pagamentosVigentes: [pagou(100, "e1")] })).toMatchObject({ estado: "disponivel", origem: "persistido", eventoId: "e1" });
    expect(escolherReciboV4({ sessao: comprovante(e1), os: { timeline: [e1, estorno("e2", 100)] }, recebidoAtual: 0, pagamentosVigentes: [] })).toEqual({ estado: "sem_recebimento" });
  });

  it("pagamento do título sem identidade (misto) casa só por valor e ordem; identidade divergente nunca casa", () => {
    const e1 = recebimento("e1", 300, 300);
    expect(escolherReciboV4({ sessao: null, os: { timeline: [e1] }, recebidoAtual: 300, pagamentosVigentes: [{ amount: 300, operationId: null }] })).toMatchObject({ estado: "disponivel" });
    expect(escolherReciboV4({ sessao: null, os: { timeline: [e1] }, recebidoAtual: 300, pagamentosVigentes: [{ amount: 300, operationId: "op-outra" }] })).toEqual({ estado: "indisponivel" });
  });

  it("sem leitura confirmada do título ou do recebido, nada é oferecido — nem o da sessão", () => {
    const e1 = recebimento("e1", 300, 300);
    expect(escolherReciboV4({ sessao: comprovante(e1), os: { timeline: [e1] }, recebidoAtual: null, pagamentosVigentes: [pagou(300, "e1")] })).toEqual({ estado: "confirmando" });
    expect(escolherReciboV4({ sessao: comprovante(e1), os: { timeline: [e1] }, recebidoAtual: 300, pagamentosVigentes: null })).toEqual({ estado: "confirmando" });
    expect(escolherReciboV4({ sessao: comprovante(e1), os: { timeline: [] }, recebidoAtual: 300, pagamentosVigentes: [pagou(300, "e1")] })).toEqual({ estado: "indisponivel" });
  });
});

describe("OPS-V4-FLUXO-CURTO-006 — comprovante a partir da projeção estabelecida", () => {
  it("sem título = nada recebido (nunca 'confirmando' eterno); título ilegível = indisponível", () => {
    expect(lerReciboDaProjecaoV4({ sessao: null, os: { timeline: [] }, projection: { receivedTotal: null, receivableFound: false, receivablePayments: [] } })).toEqual({ estado: "sem_recebimento" });
    expect(lerReciboDaProjecaoV4({ sessao: null, os: { timeline: [] }, projection: { receivedTotal: null, receivableFound: true, receivablePayments: null } })).toEqual({ estado: "indisponivel" });
    expect(lerReciboDaProjecaoV4({ sessao: null, os: { timeline: [] }, projection: { receivedTotal: 100, receivableFound: true } })).toEqual({ estado: "indisponivel" });
  });

  it("projeção legível delega para a regra OS × título", () => {
    const e1 = recebimento("e1", 300, 300);
    expect(lerReciboDaProjecaoV4({ sessao: e1.metadata.comprovante, os: { timeline: [e1] }, projection: { receivedTotal: 300, receivableFound: true, receivablePayments: [{ amount: 300, operationId: "op-e1" }] } })).toMatchObject({ estado: "disponivel", origem: "sessao" });
  });
});
