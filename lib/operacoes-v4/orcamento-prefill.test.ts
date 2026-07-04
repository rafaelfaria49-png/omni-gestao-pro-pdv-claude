import { describe, expect, it } from "vitest";
import { montarPrefillDuplicarOrcamentoV4 } from "./orcamento-prefill";
import type { OrdemServico } from "@/types/os";

function mkOS(orcamento: Record<string, unknown> | undefined, over: Record<string, unknown> = {}): OrdemServico {
  return {
    id: "os-1",
    codigo: "OS-0001",
    cliente: { id: "c1", nome: "Ana Cliente", telefone: "11999990000" },
    equipamento: { id: "eq1", tipo: "Smartphone", marca: "Apple", modelo: "iPhone 12", defeitoRelatado: "Tela quebrada" },
    orcamento,
    ...over,
  } as unknown as OrdemServico;
}

const ORCAMENTO_BASE = { id: "orc-1", status: "enviado" as const, desconto: 0, total: 0, criadoEm: "x" };

describe("montarPrefillDuplicarOrcamentoV4 — gate honesto", () => {
  it("retorna null sem orçamento", () => {
    expect(montarPrefillDuplicarOrcamentoV4(mkOS(undefined))).toBeNull();
  });

  it("retorna null para orçamento sintetizado (prévia)", () => {
    expect(montarPrefillDuplicarOrcamentoV4(mkOS({ ...ORCAMENTO_BASE, sintetizado: true, servicos: [], pecas: [] }))).toBeNull();
  });
});

describe("montarPrefillDuplicarOrcamentoV4 — cliente NUNCA pré-preenchido", () => {
  it("cliente sempre vazio mesmo com cliente real presente na OS", () => {
    const form = montarPrefillDuplicarOrcamentoV4(
      mkOS({ ...ORCAMENTO_BASE, servicos: [{ id: "s1", descricao: "X", valor: 10 }], pecas: [] }),
    )!;
    expect(form.clienteModo).toBe("existente");
    expect(form.clienteExistente).toBeNull();
    expect(form.clienteNovoNome).toBe("");
    expect(form.clienteNovoTelefone).toBe("");
  });
});

describe("montarPrefillDuplicarOrcamentoV4 — aparelho/defeito", () => {
  it("copia marca/modelo/defeito da OS real", () => {
    const form = montarPrefillDuplicarOrcamentoV4(
      mkOS({ ...ORCAMENTO_BASE, servicos: [{ id: "s1", descricao: "X", valor: 10 }], pecas: [] }),
    )!;
    expect(form.aparelhoMarca).toBe("Apple");
    expect(form.aparelhoModelo).toBe("iPhone 12");
    expect(form.defeitoRelatado).toBe("Tela quebrada");
  });
});

describe("montarPrefillDuplicarOrcamentoV4 — itens fixos com kindV3 e custo interno", () => {
  it("item cobrado com custo interno preservado", () => {
    const form = montarPrefillDuplicarOrcamentoV4(
      mkOS({
        ...ORCAMENTO_BASE,
        servicos: [{ id: "s1", descricao: "Mão de obra", valor: 50, kindV3: "cobrado", custoV3: 15 }],
        pecas: [],
      }),
    )!;
    const item = form.itensFixos.find((it) => it.descricao === "Mão de obra")!;
    expect(item.valor).toBe(50);
    expect(item.cortesia).toBe(false);
    expect(item.custoV3).toBe(15);
  });

  it("item brinde vira cortesia:true", () => {
    const form = montarPrefillDuplicarOrcamentoV4(
      mkOS({ ...ORCAMENTO_BASE, servicos: [{ id: "s1", descricao: "Película", valor: 0, kindV3: "brinde", custoV3: 5 }], pecas: [] }),
    )!;
    const item = form.itensFixos.find((it) => it.descricao === "Película")!;
    expect(item.cortesia).toBe(true);
    expect(item.custoV3).toBe(5);
  });

  it("peça fixa (sem grupoId) também entra em itensFixos", () => {
    const form = montarPrefillDuplicarOrcamentoV4(
      mkOS({ ...ORCAMENTO_BASE, pecas: [{ id: "p1", nome: "Cabo", quantidade: 1, valorUnitario: 20, custoUnitario: 8 }], servicos: [] }),
    )!;
    const item = form.itensFixos.find((it) => it.descricao === "Cabo")!;
    expect(item.valor).toBe(20);
    expect(item.custoV3).toBe(8);
  });
});

describe("montarPrefillDuplicarOrcamentoV4 — grupo com variantes completas", () => {
  it("copia rótulo do grupo e variantes com garantia/badge/descrição/custo", () => {
    const form = montarPrefillDuplicarOrcamentoV4(
      mkOS({
        ...ORCAMENTO_BASE,
        gruposV3: [{ id: "g1", rotulo: "Escolha a tela", regra: "escolha_1" }],
        servicos: [
          { id: "a", descricao: "Genérica", valor: 150, kindV3: "cobrado", grupoId: "g1", custoV3: 60, varianteV3: { rotulo: "Genérica" } },
          {
            id: "b",
            descricao: "Original",
            valor: 300,
            kindV3: "cobrado",
            grupoId: "g1",
            custoV3: 180,
            varianteV3: { rotulo: "Original", garantiaDias: 90, badge: "Recomendado", descricaoCurta: "Peça original Apple" },
          },
        ],
        pecas: [],
      }),
    )!;
    expect(form.grupoRotulo).toBe("Escolha a tela");
    expect(form.variantes).toHaveLength(2);
    const original = form.variantes.find((v) => v.rotulo === "Original")!;
    expect(original.valor).toBe(300);
    expect(original.garantiaDias).toBe(90);
    expect(original.badge).toBe("Recomendado");
    expect(original.descricaoCurta).toBe("Peça original Apple");
    expect(original.custoV3).toBe(180);
  });

  it("combina peça + serviço no mesmo grupo", () => {
    const form = montarPrefillDuplicarOrcamentoV4(
      mkOS({
        ...ORCAMENTO_BASE,
        gruposV3: [{ id: "g1", rotulo: "G", regra: "escolha_1" }],
        pecas: [{ id: "p1", nome: "Peça avulsa", quantidade: 1, valorUnitario: 80, grupoId: "g1" }],
        servicos: [{ id: "s1", descricao: "Serviço combo", valor: 120, grupoId: "g1" }],
      }),
    )!;
    expect(form.variantes.map((v) => v.rotulo).sort()).toEqual(["Peça avulsa", "Serviço combo"].sort());
  });

  it("sem grupo no orçamento original: grupoRotulo vazio e 2 variantes vazias (piso do formulário)", () => {
    const form = montarPrefillDuplicarOrcamentoV4(
      mkOS({ ...ORCAMENTO_BASE, servicos: [{ id: "s1", descricao: "Serviço fixo", valor: 50 }], pecas: [] }),
    )!;
    expect(form.grupoRotulo).toBe("");
    expect(form.variantes).toHaveLength(2);
    expect(form.variantes.every((v) => v.rotulo === "")).toBe(true);
  });

  it("linha de grupo sem varianteV3.rotulo cai no nome/descrição real (nunca inventa texto)", () => {
    const form = montarPrefillDuplicarOrcamentoV4(
      mkOS({
        ...ORCAMENTO_BASE,
        gruposV3: [{ id: "g1", rotulo: "G", regra: "escolha_1" }],
        servicos: [
          { id: "a", descricao: "Bateria genérica", valor: 50, grupoId: "g1" },
          { id: "b", descricao: "Bateria original", valor: 90, grupoId: "g1" },
        ],
        pecas: [],
      }),
    )!;
    expect(form.variantes.map((v) => v.rotulo).sort()).toEqual(["Bateria genérica", "Bateria original"].sort());
  });
});
