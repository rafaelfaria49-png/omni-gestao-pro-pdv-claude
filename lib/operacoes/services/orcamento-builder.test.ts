import { describe, it, expect } from "vitest";
import { buildOrcamentoRascunhoFromOS, selectEstoquePecaSource, type BuildOrcamentoDeps } from "./orcamento-builder";
import type { PecaUsada } from "@/types/os";

function makeDeps(): BuildOrcamentoDeps {
  let n = 0;
  return {
    uid: (prefix: string) => `${prefix}_${++n}`,
    nowIso: () => "2026-06-02T00:00:00.000Z",
  };
}

describe("buildOrcamentoRascunhoFromOS", () => {
  it("monta rascunho a partir de serviços + peças e soma o total", () => {
    const orc = buildOrcamentoRascunhoFromOS(
      {
        servicosCatalogo: [
          { servicoId: "s1", descricao: "Troca de tela", custoInterno: 180, valorVenda: 320, prazoGarantiaDias: 90, termoGarantia: "" },
        ],
        pecas: [
          { id: "p1", produtoId: "p1", nome: "Bateria", quantidade: 1, valorUnitario: 90, custoUnitario: 40 },
        ],
      },
      makeDeps(),
    );
    expect(orc.status).toBe("rascunho");
    expect(orc.sintetizado).toBe(false);
    expect(orc.servicos).toHaveLength(1);
    expect(orc.pecas).toHaveLength(1);
    expect(orc.servicos[0].valor).toBe(320);
    expect(orc.total).toBe(410); // 320 + 90
  });

  it("respeita desconto de linha das peças e quantidade", () => {
    const orc = buildOrcamentoRascunhoFromOS(
      {
        servicosCatalogo: [],
        pecas: [
          { id: "p1", nome: "Película", quantidade: 2, valorUnitario: 25, desconto: 10 } as PecaUsada,
        ],
      },
      makeDeps(),
    );
    // 2 * 25 - 10 = 40
    expect(orc.total).toBe(40);
    expect(orc.servicos).toHaveLength(0);
  });

  it("OS sem itens → total 0 e arrays vazios", () => {
    const orc = buildOrcamentoRascunhoFromOS({ servicosCatalogo: [], pecas: [] }, makeDeps());
    expect(orc.total).toBe(0);
    expect(orc.servicos).toHaveLength(0);
    expect(orc.pecas).toHaveLength(0);
  });

  it("brinde (valor 0) não soma ao total mas permanece como linha", () => {
    const orc = buildOrcamentoRascunhoFromOS(
      {
        servicosCatalogo: [],
        pecas: [{ id: "p1", produtoId: "p1", nome: "Capinha (brinde)", quantidade: 1, valorUnitario: 0, custoUnitario: 8 }],
      },
      makeDeps(),
    );
    expect(orc.total).toBe(0);
    expect(orc.pecas).toHaveLength(1);
  });
});

describe("selectEstoquePecaSource (fonte única — anti dupla-baixa)", () => {
  const payloadPecas: PecaUsada[] = [{ id: "p1", produtoId: "p1", nome: "Bateria", quantidade: 1, valorUnitario: 90 }];
  const orcamentoPecas: PecaUsada[] = [{ id: "p1", produtoId: "p1", nome: "Bateria", quantidade: 1, valorUnitario: 90 }];

  it("usa o orçamento quando ele tem peças (autoritativo)", () => {
    const r = selectEstoquePecaSource(payloadPecas, orcamentoPecas);
    expect(r.source).toBe("payload.orcamento.pecas");
    expect(r.rows).toHaveLength(1);
  });

  it("não duplica: nunca retorna as duas fontes somadas", () => {
    const r = selectEstoquePecaSource(payloadPecas, orcamentoPecas);
    // mesma peça nas duas fontes → 1 linha só (sem somar 1+1)
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].quantidade).toBe(1);
  });

  it("cai para payload.pecas quando o orçamento não tem peças", () => {
    const r = selectEstoquePecaSource(payloadPecas, []);
    expect(r.source).toBe("payload.pecas");
    expect(r.rows).toHaveLength(1);
  });

  it("ambos vazios → payload.pecas vazio", () => {
    const r = selectEstoquePecaSource(undefined, undefined);
    expect(r.source).toBe("payload.pecas");
    expect(r.rows).toHaveLength(0);
  });
});
