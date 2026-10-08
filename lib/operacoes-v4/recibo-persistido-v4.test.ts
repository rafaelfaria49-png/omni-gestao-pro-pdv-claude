// OPS-V4-FLUXO-CURTO-006 — comprovante persistido (reimpressão após reload).
import { describe, expect, it } from "vitest";
import type { OrdemServico } from "@/types/os";
import { montarComprovanteReciboV3, type PagamentoV3 } from "@/lib/operacoes-v3/payment-model";
import { montarComprovanteMistoV3 } from "@/lib/operacoes-v3/recebimento-misto-model";
import { comprovantesValidosDaOSV4, escolherReciboV4, lerReciboPersistidoV4 } from "./recibo-persistido-v4";

const os = { id: "os-a", codigo: "OS-A", cliente: { nome: "Cliente QA" }, equipamento: { marca: "Samsung", modelo: "A54" } } as OrdemServico;
const pag = (total: number, recebido: number): PagamentoV3 =>
  ({ total, recebido, saldo: total - recebido, status: recebido >= total ? "quitado" : recebido > 0 ? "parcial" : "aberto" }) as PagamentoV3;

function recebimento(id: string, valor: number, acumulado: number, total = 300) {
  return {
    id,
    tipo: "operacao_cobranca_gerada",
    metadata: {
      operacaoId: `op-${id}`,
      comprovante: montarComprovanteReciboV3({
        os,
        linhas: [{ forma: "pix", valor }],
        valorPago: valor,
        pagamento: pag(total, acumulado),
        intencaoLabel: acumulado >= total ? "Quitação" : "Parcial",
        operador: "QA",
        dataHora: "2026-10-08T12:00:00.000Z",
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

describe("OPS-V4-FLUXO-CURTO-006 — comprovante oferecido (sessão × persistido, R1)", () => {
  const sessaoQuitacao = recebimento("s", 200, 300).metadata.comprovante;

  it("sessão coerente com o recebido atual: oferece o da sessão", () => {
    expect(escolherReciboV4({ sessao: sessaoQuitacao, os: { timeline: [] }, recebidoAtual: 300 })).toMatchObject({ estado: "disponivel", origem: "sessao", recibo: { valorPago: 200 } });
  });

  it("sessão estornada depois (recebido atual 100): nunca a da sessão — vale o persistido coerente", () => {
    const timeline = [recebimento("e1", 100, 100), recebimento("e2", 200, 300), estorno("e3", 200)];
    expect(escolherReciboV4({ sessao: sessaoQuitacao, os: { timeline }, recebidoAtual: 100 })).toMatchObject({ estado: "disponivel", origem: "persistido", eventoId: "e1" });
    expect(escolherReciboV4({ sessao: sessaoQuitacao, os: { timeline: [] }, recebidoAtual: 100 })).toEqual({ estado: "indisponivel" });
    expect(escolherReciboV4({ sessao: sessaoQuitacao, os: { timeline: [] }, recebidoAtual: 0 })).toEqual({ estado: "sem_recebimento" });
  });

  it("sem leitura confirmada nada é oferecido, nem o da sessão", () => {
    expect(escolherReciboV4({ sessao: sessaoQuitacao, os: null, recebidoAtual: null })).toEqual({ estado: "confirmando" });
  });
});
