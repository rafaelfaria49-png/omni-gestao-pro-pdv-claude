// Testes PUROS do editor de orçamento V4 (OPS-V4-ORCAMENTO-REAL-002).
// Ambiente node: o helper, computeTotaisV3 e pecaFromProdutoV3 são puros.
import { describe, expect, it } from "vitest";
import {
  custoInformadoPeca,
  custoInformadoServico,
  editorToSalvarInputV4,
  editorVazioV4,
  itensSemCustoV4,
  margemPercentualV4,
  novoServicoManualV4,
  pecaFromProdutoV4,
  seedEditorFromOS,
  totaisEditorV4,
  validarEditorParaSalvarV4,
  type OrcamentoEditorV4,
} from "./orcamento-form";
import type { ProdutoCatalogoV3 } from "@/lib/operacoes-v3/produto-link";
import type { OrdemServico } from "@/types/os";

const PRODUTO: ProdutoCatalogoV3 = {
  id: "prod-1",
  nome: "Tela iPhone 13",
  sku: "TELA-13",
  barcode: "789",
  estoque: 5,
  custo: 200,
  preco: 500,
  garantiaDias: 90,
};

describe("novoServicoManualV4", () => {
  it("cria serviço cobrado com valor clampado e descrição trimada", () => {
    const s = novoServicoManualV4({ descricao: "  Troca de tela  ", valor: 150 });
    expect(s.descricao).toBe("Troca de tela");
    expect(s.valor).toBe(150);
    expect(s.kindV3).toBe("cobrado");
    expect(s.id).toMatch(/^srv_/);
  });

  it("valor negativo vira 0 e garantia opcional só quando > 0", () => {
    const s = novoServicoManualV4({ descricao: "X", valor: -10 });
    expect(s.valor).toBe(0);
    expect(s.prazoGarantiaDias).toBeUndefined();
    const g = novoServicoManualV4({ descricao: "Y", valor: 10, garantiaDias: 30 });
    expect(g.prazoGarantiaDias).toBe(30);
  });

  it("custo interno só é gravado quando > 0 (custo ausente/zerado = não informado)", () => {
    const semCusto = novoServicoManualV4({ descricao: "X", valor: 100 });
    expect(semCusto.custoV3).toBeUndefined();
    const zerado = novoServicoManualV4({ descricao: "X", valor: 100, custo: 0 });
    expect(zerado.custoV3).toBeUndefined();
    const negativo = novoServicoManualV4({ descricao: "X", valor: 100, custo: -5 });
    expect(negativo.custoV3).toBeUndefined();
    const comCusto = novoServicoManualV4({ descricao: "Troca de tela", valor: 320, custo: 120 });
    expect(comCusto.custoV3).toBe(120);
  });
});

describe("custoInformadoServico / custoInformadoPeca", () => {
  it("custo > 0 é informado; ausente/zero/negativo não é", () => {
    expect(custoInformadoServico({ id: "s1", descricao: "X", valor: 10 })).toBe(false);
    expect(custoInformadoServico({ id: "s1", descricao: "X", valor: 10, custoV3: 0 })).toBe(false);
    expect(custoInformadoServico({ id: "s1", descricao: "X", valor: 10, custoV3: 50 })).toBe(true);

    expect(custoInformadoPeca(pecaFromProdutoV4({ ...PRODUTO, custo: 0 }))).toBe(false);
    expect(custoInformadoPeca(pecaFromProdutoV4(PRODUTO))).toBe(true);
  });
});

describe("margemPercentualV4", () => {
  it("calcula lucro/total em %; sem total vira null", () => {
    expect(margemPercentualV4({ total: 0, lucro: 0 })).toBeNull();
    expect(margemPercentualV4({ total: 200, lucro: 100 })).toBe(50);
    expect(margemPercentualV4({ total: 200, lucro: -50 })).toBe(-25);
  });
});

describe("itensSemCustoV4", () => {
  it("conta só linhas válidas (com dados) sem custo informado", () => {
    const editor: OrcamentoEditorV4 = {
      servicos: [
        novoServicoManualV4({ descricao: "Com custo", valor: 100, custo: 40 }),
        novoServicoManualV4({ descricao: "Sem custo", valor: 50 }),
        novoServicoManualV4({ descricao: "   ", valor: 10 }), // inválido, não conta
      ],
      pecas: [pecaFromProdutoV4({ ...PRODUTO, custo: 0 })], // peça sem custo cadastrado
      desconto: 0,
    };
    expect(itensSemCustoV4(editor)).toBe(2); // 1 serviço sem custo + 1 peça sem custo
  });

  it("editor totalmente informado retorna 0", () => {
    const editor: OrcamentoEditorV4 = {
      servicos: [novoServicoManualV4({ descricao: "Com custo", valor: 100, custo: 40 })],
      pecas: [pecaFromProdutoV4(PRODUTO)],
      desconto: 0,
    };
    expect(itensSemCustoV4(editor)).toBe(0);
  });
});

describe("pecaFromProdutoV4", () => {
  it("vincula a peça ao produto do catálogo (referência, sem baixa de estoque)", () => {
    const p = pecaFromProdutoV4(PRODUTO, { quantidade: 2 });
    expect(p.produtoId).toBe("prod-1");
    expect(p.nome).toBe("Tela iPhone 13");
    expect(p.sku).toBe("TELA-13");
    expect(p.produtoOrigem).toBe("prisma");
    expect(p.valorUnitario).toBe(500);
    expect(p.custoUnitario).toBe(200);
    expect(p.quantidade).toBe(2);
    expect(p.kindV3).toBe("cobrado");
  });
});

describe("totaisEditorV4", () => {
  it("soma cobrados; brinde fica fora do total ao cliente, mas no custo", () => {
    const editor: OrcamentoEditorV4 = {
      servicos: [novoServicoManualV4({ descricao: "Mão de obra", valor: 100 })],
      pecas: [
        { ...pecaFromProdutoV4(PRODUTO, { quantidade: 1 }) }, // cobrado: cliente 500, custo 200
        { ...pecaFromProdutoV4(PRODUTO, { quantidade: 1, kindV3: "brinde" }) }, // brinde: cliente 0, custo 200
      ],
      desconto: 50,
    };
    const t = totaisEditorV4(editor);
    expect(t.subtotal).toBe(600); // 100 serviço + 500 peça cobrada
    expect(t.desconto).toBe(50);
    expect(t.total).toBe(550);
    expect(t.custo).toBe(400); // 200 + 200 (ambas as peças contam no custo)
    expect(t.lucro).toBe(150); // 550 - 400
  });

  it("editor vazio → tudo zero", () => {
    const t = totaisEditorV4(editorVazioV4());
    expect(t).toEqual({ subtotal: 0, desconto: 0, total: 0, custo: 0, lucro: 0 });
  });

  it("custo interno de serviço manual entra no custo/lucro do orçamento", () => {
    const editor: OrcamentoEditorV4 = {
      servicos: [novoServicoManualV4({ descricao: "Troca de tela", valor: 320, custo: 120 })],
      pecas: [],
      desconto: 0,
    };
    const t = totaisEditorV4(editor);
    expect(t.total).toBe(320);
    expect(t.custo).toBe(120);
    expect(t.lucro).toBe(200);
  });
});

describe("editorToSalvarInputV4", () => {
  it("descarta serviço sem descrição e peça sem nome/quantidade; clampa desconto", () => {
    const editor: OrcamentoEditorV4 = {
      servicos: [
        novoServicoManualV4({ descricao: "Válido", valor: 80 }),
        novoServicoManualV4({ descricao: "   ", valor: 50 }), // descartado
      ],
      pecas: [
        pecaFromProdutoV4(PRODUTO, { quantidade: 1 }),
        { ...pecaFromProdutoV4(PRODUTO, { quantidade: 1 }), nome: "  ", quantidade: 1 }, // descartado (sem nome)
      ],
      desconto: -5,
      observacao: "  obs  ",
    };
    const input = editorToSalvarInputV4(editor);
    expect(input.servicos).toHaveLength(1);
    expect(input.servicos[0]!.descricao).toBe("Válido");
    expect(input.pecas).toHaveLength(1);
    expect(input.desconto).toBe(0);
    expect(input.observacao).toBe("obs");
  });

  it("preserva custoV3 do serviço manual (clampado) e omite quando ausente/zerado", () => {
    const editor: OrcamentoEditorV4 = {
      servicos: [
        novoServicoManualV4({ descricao: "Com custo", valor: 200, custo: 80 }),
        { ...novoServicoManualV4({ descricao: "Custo negativo", valor: 100 }), custoV3: -10 },
        novoServicoManualV4({ descricao: "Sem custo", valor: 50 }),
      ],
      pecas: [],
      desconto: 0,
    };
    const input = editorToSalvarInputV4(editor);
    expect(input.servicos[0]!.custoV3).toBe(80);
    expect(input.servicos[1]!.custoV3).toBeUndefined(); // negativo clampado para 0 → omitido
    expect(input.servicos[2]!.custoV3).toBeUndefined(); // nunca informado
  });
});

describe("validarEditorParaSalvarV4 (GOAL OPS-V4-ORCAMENTO-READBACK-EDIT-002)", () => {
  it("serviço com valor e descrição → ok", () => {
    const editor: OrcamentoEditorV4 = { servicos: [novoServicoManualV4({ descricao: "Troca de tela", valor: 320 })], pecas: [], desconto: 0 };
    expect(validarEditorParaSalvarV4(editor)).toEqual({ ok: true });
  });

  it("serviço com valor mas SEM descrição → erro (não descarta em silêncio)", () => {
    const editor: OrcamentoEditorV4 = { servicos: [novoServicoManualV4({ descricao: "", valor: 320 })], pecas: [], desconto: 0 };
    const r = validarEditorParaSalvarV4(editor);
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/descrição do serviço/i);
  });

  it("serviço com CUSTO mas sem descrição → erro (custo também conta como valor)", () => {
    const editor: OrcamentoEditorV4 = { servicos: [{ ...novoServicoManualV4({ descricao: "", valor: 0 }), custoV3: 90 }], pecas: [], desconto: 0 };
    expect(validarEditorParaSalvarV4(editor).ok).toBe(false);
  });

  it("peça com valor mas SEM nome → erro", () => {
    const editor: OrcamentoEditorV4 = { servicos: [], pecas: [{ ...pecaFromProdutoV4(PRODUTO, { quantidade: 1 }), nome: "  " }], desconto: 0 };
    const r = validarEditorParaSalvarV4(editor);
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/nome da peça/i);
  });

  it("linha totalmente vazia (sem valor, sem descrição) → ok (ignorável, não é erro)", () => {
    const editor: OrcamentoEditorV4 = { servicos: [novoServicoManualV4({ descricao: "", valor: 0 })], pecas: [], desconto: 0 };
    expect(validarEditorParaSalvarV4(editor)).toEqual({ ok: true });
  });

  it("editor vazio → ok", () => {
    expect(validarEditorParaSalvarV4(editorVazioV4())).toEqual({ ok: true });
  });
});

describe("seedEditorFromOS", () => {
  it("sem OS / sem orçamento → editor vazio", () => {
    expect(seedEditorFromOS(null)).toEqual(editorVazioV4());
    expect(seedEditorFromOS({} as OrdemServico)).toEqual(editorVazioV4());
  });

  it("semeia servicos/pecas/desconto do orçamento real, preservando kindV3", () => {
    const os = {
      orcamento: {
        id: "orc-1",
        status: "rascunho",
        servicos: [{ id: "s1", descricao: "Serv", valor: 100, kindV3: "cobrado" }],
        pecas: [{ id: "p1", nome: "Peça", quantidade: 2, valorUnitario: 30, kindV3: "brinde" }],
        desconto: 10,
        total: 0,
        criadoEm: "x",
        observacao: "nota",
      },
    } as unknown as OrdemServico;
    const editor = seedEditorFromOS(os);
    expect(editor.servicos).toHaveLength(1);
    expect(editor.pecas[0]!.kindV3).toBe("brinde");
    expect(editor.desconto).toBe(10);
    expect(editor.observacao).toBe("nota");
  });
});
