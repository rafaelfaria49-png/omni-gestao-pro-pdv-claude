import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { computeTotaisV3, type PecaV3, type ServicoV3 } from "@/lib/operacoes-v3/orcamento-model";
import { montarOrcamentoClienteViewV4 } from "./orcamento-cliente-view";
import type { OrdemServico } from "@/types/os";

function mkOS(orcamento: Record<string, unknown> | undefined, over: Record<string, unknown> = {}): OrdemServico {
  return {
    id: "os-1",
    codigo: "OS-0001",
    cliente: { id: "c1", nome: "Ana Cliente" },
    equipamento: { id: "eq1", tipo: "Smartphone", marca: "Marca X", modelo: "Modelo Y", defeitoRelatado: "Tela quebrada" },
    orcamento,
    ...over,
  } as unknown as OrdemServico;
}

const ORCAMENTO_BASE = {
  id: "orc-1",
  status: "rascunho" as const,
  desconto: 0,
  total: 0,
  criadoEm: "2026-01-01T10:00:00.000Z",
};

describe("montarOrcamentoClienteViewV4 — gate honesto", () => {
  it("retorna null quando não há orçamento", () => {
    expect(montarOrcamentoClienteViewV4(mkOS(undefined))).toBeNull();
  });

  it("retorna null quando o orçamento é sintetizado (prévia)", () => {
    expect(montarOrcamentoClienteViewV4(mkOS({ ...ORCAMENTO_BASE, sintetizado: true, servicos: [], pecas: [] }))).toBeNull();
  });
});

describe("montarOrcamentoClienteViewV4 — whitelist estrita de chaves", () => {
  it("o objeto raiz tem EXATAMENTE as chaves esperadas, nenhuma extra", () => {
    const view = montarOrcamentoClienteViewV4(
      mkOS({ ...ORCAMENTO_BASE, servicos: [{ id: "s1", descricao: "Limpeza", valor: 50 }], pecas: [] }),
    )!;
    expect(Object.keys(view).sort()).toEqual(
      [
        "loja",
        "osNumero",
        "dataCriacao",
        "validade",
        "cliente",
        "aparelho",
        "defeitoRelatado",
        "itensFixosVisiveis",
        "grupos",
        "totais",
        "observacoesAoCliente",
      ].sort(),
    );
    expect(Object.keys(view.loja).sort()).toEqual(["nome", "documento", "contato"].sort());
    expect(Object.keys(view.cliente)).toEqual(["nome"]);
    expect(Object.keys(view.aparelho).sort()).toEqual(["marca", "modelo"].sort());
    expect(Object.keys(view.itensFixosVisiveis[0]!).sort()).toEqual(["descricao", "quantidade", "valorCliente"].sort());
  });

  it("chave de variante não tem campos extras além dos whitelisted", () => {
    const view = montarOrcamentoClienteViewV4(
      mkOS({
        ...ORCAMENTO_BASE,
        servicos: [
          { id: "a", descricao: "Genérica", valor: 100, kindV3: "cobrado", grupoId: "g1" },
          { id: "b", descricao: "Original", valor: 200, kindV3: "cobrado", grupoId: "g1" },
        ],
        pecas: [],
      }),
    )!;
    expect(Object.keys(view.grupos[0]!.variantes[0]!).sort()).toEqual(
      ["rotulo", "descricaoCurta", "garantiaDias", "prazoTexto", "badge", "valorVariante", "totalComOpcao", "selecionada"].sort(),
    );
  });
});

describe("montarOrcamentoClienteViewV4 — visibilidade por kind", () => {
  it("linha 'interno' nunca aparece (nem fixa, nem em grupo)", () => {
    const view = montarOrcamentoClienteViewV4(
      mkOS({
        ...ORCAMENTO_BASE,
        servicos: [
          { id: "s1", descricao: "Serviço público", valor: 50, kindV3: "cobrado" },
          { id: "s2", descricao: "Anotação interna", valor: 0, kindV3: "interno" },
        ],
        pecas: [
          { id: "p1", nome: "Peça oculta", quantidade: 1, valorUnitario: 30, kindV3: "interno", grupoId: "g1" },
          { id: "p2", nome: "Peça visível", quantidade: 1, valorUnitario: 40, kindV3: "cobrado", grupoId: "g1" },
        ],
      }),
    )!;
    const descricoesFixas = view.itensFixosVisiveis.map((i) => i.descricao);
    expect(descricoesFixas).toEqual(["Serviço público"]);
    expect(descricoesFixas).not.toContain("Anotação interna");
    // grupo g1 só deve ter a linha visível — a interna nunca entra, nem como variante.
    expect(view.grupos).toHaveLength(1);
    expect(view.grupos[0]!.variantes.map((v) => v.rotulo)).toEqual(["Peça visível"]);
  });

  it("brinde vira cortesia (valorCliente 0) e continua visível", () => {
    const view = montarOrcamentoClienteViewV4(
      mkOS({
        ...ORCAMENTO_BASE,
        servicos: [{ id: "s1", descricao: "Película grátis", valor: 30, kindV3: "brinde" }],
        pecas: [],
      }),
    )!;
    expect(view.itensFixosVisiveis).toEqual([{ descricao: "Película grátis", quantidade: 1, valorCliente: 0, cortesia: true }]);
  });

  it("linha cobrada não tem a chave 'cortesia'", () => {
    const view = montarOrcamentoClienteViewV4(
      mkOS({ ...ORCAMENTO_BASE, servicos: [{ id: "s1", descricao: "Troca de tela", valor: 100, kindV3: "cobrado" }], pecas: [] }),
    )!;
    expect(view.itensFixosVisiveis[0]).toEqual({ descricao: "Troca de tela", quantidade: 1, valorCliente: 100 });
    expect("cortesia" in view.itensFixosVisiveis[0]!).toBe(false);
  });
});

describe("montarOrcamentoClienteViewV4 — grupos e rótulo", () => {
  it("usa o rótulo de gruposV3 quando existe", () => {
    const view = montarOrcamentoClienteViewV4(
      mkOS({
        ...ORCAMENTO_BASE,
        gruposV3: [{ id: "g1", rotulo: "Escolha a tela", regra: "escolha_1" }],
        servicos: [
          { id: "a", descricao: "Genérica", valor: 100, kindV3: "cobrado", grupoId: "g1" },
          { id: "b", descricao: "Original", valor: 200, kindV3: "cobrado", grupoId: "g1" },
        ],
        pecas: [],
      }),
    )!;
    expect(view.grupos[0]!.rotulo).toBe("Escolha a tela");
  });

  it("cai em fallback honesto quando gruposV3 não tem o id referenciado", () => {
    const view = montarOrcamentoClienteViewV4(
      mkOS({
        ...ORCAMENTO_BASE,
        servicos: [
          { id: "a", descricao: "Genérica", valor: 100, kindV3: "cobrado", grupoId: "sem-meta" },
          { id: "b", descricao: "Original", valor: 200, kindV3: "cobrado", grupoId: "sem-meta" },
        ],
        pecas: [],
      }),
    )!;
    expect(view.grupos[0]!.rotulo).toBe("Opções 1");
  });

  it("variante sem varianteV3 usa a descrição/nome real da linha como rótulo (nunca inventa texto)", () => {
    const view = montarOrcamentoClienteViewV4(
      mkOS({
        ...ORCAMENTO_BASE,
        pecas: [
          { id: "a", nome: "Tela genérica", quantidade: 1, valorUnitario: 100, kindV3: "cobrado", grupoId: "g1" },
          { id: "b", nome: "Tela original", quantidade: 1, valorUnitario: 200, kindV3: "cobrado", grupoId: "g1", varianteV3: { rotulo: "Original premium" } },
        ],
        servicos: [],
      }),
    )!;
    const porRotulo = new Map(view.grupos[0]!.variantes.map((v) => [v.rotulo, v]));
    expect(porRotulo.has("Tela genérica")).toBe(true);
    expect(porRotulo.has("Original premium")).toBe(true);
  });

  it("combina peça + serviço no mesmo grupo (grupoId cruzado entre tipos)", () => {
    const view = montarOrcamentoClienteViewV4(
      mkOS({
        ...ORCAMENTO_BASE,
        pecas: [{ id: "peca-a", nome: "Peça avulsa", quantidade: 1, valorUnitario: 80, kindV3: "cobrado", grupoId: "g1" }],
        servicos: [{ id: "serv-b", descricao: "Serviço combo", valor: 120, kindV3: "cobrado", grupoId: "g1" }],
      }),
    )!;
    expect(view.grupos).toHaveLength(1);
    expect(view.grupos[0]!.variantes.map((v) => v.rotulo).sort()).toEqual(["Peça avulsa", "Serviço combo"].sort());
  });
});

describe("montarOrcamentoClienteViewV4 — propriedade: totalComOpcao === computeTotaisV3(comSeleção).total", () => {
  it("para toda variante em todo grupo (2 grupos, mistos peça/serviço)", () => {
    const orc = {
      ...ORCAMENTO_BASE,
      pecas: [
        { id: "fix-p", nome: "Peça fixa", quantidade: 1, valorUnitario: 20, kindV3: "cobrado" },
        { id: "g1-a", nome: "Tela genérica", quantidade: 1, valorUnitario: 100, kindV3: "cobrado", grupoId: "g1" },
        { id: "g1-b", nome: "Tela original", quantidade: 1, valorUnitario: 200, kindV3: "cobrado", grupoId: "g1" },
      ],
      servicos: [
        { id: "fix-s", descricao: "Serviço fixo", valor: 30, kindV3: "cobrado" },
        { id: "g2-a", descricao: "Bateria genérica", valor: 50, kindV3: "cobrado", grupoId: "g2" },
        { id: "g2-b", descricao: "Bateria original", valor: 90, kindV3: "cobrado", grupoId: "g2" },
      ],
    };
    const view = montarOrcamentoClienteViewV4(mkOS(orc))!;
    expect(view.grupos).toHaveLength(2);

    for (const grupo of view.grupos) {
      for (const variante of grupo.variantes) {
        // Reconstrução independente (sem usar o builder) para provar a propriedade.
        const gid = grupo === view.grupos[0] ? "g1" : "g2";
        const marcar = <T extends { id: string; grupoId?: string; selecionadaV3?: boolean }>(linhas: T[]): T[] =>
          linhas.map((l) => ((l.grupoId ?? "") === gid ? { ...l, selecionadaV3: (l as { nome?: string; descricao?: string }).nome === variante.rotulo || (l as { descricao?: string }).descricao === variante.rotulo } : l));
        const pecasComSelecao = marcar(orc.pecas as unknown as PecaV3[]);
        const servicosComSelecao = marcar(orc.servicos as unknown as ServicoV3[]);
        const esperado = computeTotaisV3({ pecas: pecasComSelecao, servicos: servicosComSelecao, desconto: orc.desconto }).total;
        expect(variante.totalComOpcao).toBe(esperado);
      }
    }
  });
});

describe("montarOrcamentoClienteViewV4 — totais: faixa vs exato", () => {
  it("grupo sem seleção → totais.faixa (exato ausente)", () => {
    const view = montarOrcamentoClienteViewV4(
      mkOS({
        ...ORCAMENTO_BASE,
        servicos: [
          { id: "a", descricao: "A", valor: 100, kindV3: "cobrado", grupoId: "g1" },
          { id: "b", descricao: "B", valor: 200, kindV3: "cobrado", grupoId: "g1" },
        ],
        pecas: [],
      }),
    )!;
    expect(view.totais.faixa).toEqual({ min: 100, max: 200 });
    expect(view.totais.exato).toBeUndefined();
  });

  it("grupo com seleção feita → totais.exato (faixa ausente)", () => {
    const view = montarOrcamentoClienteViewV4(
      mkOS({
        ...ORCAMENTO_BASE,
        servicos: [
          { id: "a", descricao: "A", valor: 100, kindV3: "cobrado", grupoId: "g1" },
          { id: "b", descricao: "B", valor: 200, kindV3: "cobrado", grupoId: "g1", selecionadaV3: true },
        ],
        pecas: [],
      }),
    )!;
    expect(view.totais.exato).toBe(200);
    expect(view.totais.faixa).toBeUndefined();
  });

  it("sem grupos: sempre exato", () => {
    const view = montarOrcamentoClienteViewV4(mkOS({ ...ORCAMENTO_BASE, servicos: [{ id: "s1", descricao: "X", valor: 50 }], pecas: [] }))!;
    expect(view.totais.exato).toBe(50);
    expect(view.totais.faixa).toBeUndefined();
  });
});

describe("montarOrcamentoClienteViewV4 — validade honesta", () => {
  it("com validoAte gravado: usa a data real, sem texto de política", () => {
    const view = montarOrcamentoClienteViewV4(
      mkOS({ ...ORCAMENTO_BASE, validoAte: "2026-02-01T00:00:00.000Z", servicos: [{ id: "s1", descricao: "X", valor: 10 }], pecas: [] }),
    )!;
    expect(view.validade).toEqual({ validoAte: "2026-02-01T00:00:00.000Z" });
  });

  it("sem validoAte (ainda não enviado): usa texto de política com o prazo padrão, nunca uma data inventada", () => {
    const view = montarOrcamentoClienteViewV4(mkOS({ ...ORCAMENTO_BASE, servicos: [{ id: "s1", descricao: "X", valor: 10 }], pecas: [] }))!;
    expect(view.validade.validoAte).toBeUndefined();
    expect(view.validade.politicaTexto).toBe("Validade de 7 dias a partir do envio ao cliente.");
  });
});

describe("montarOrcamentoClienteViewV4 — observação do cliente (nunca a lista interna)", () => {
  it("usa orcamento.observacao (campo do próprio orçamento), não os.observacoes", () => {
    const view = montarOrcamentoClienteViewV4(
      mkOS(
        { ...ORCAMENTO_BASE, observacao: "Trazer o carregador na retirada.", servicos: [{ id: "s1", descricao: "X", valor: 10 }], pecas: [] },
        { observacoes: [{ id: "o1", autor: "Técnico", conteudo: "Nota interna sensível", interna: true }] },
      ),
    )!;
    expect(view.observacoesAoCliente).toBe("Trazer o carregador na retirada.");
  });

  it("ausente quando o orçamento não tem observação", () => {
    const view = montarOrcamentoClienteViewV4(mkOS({ ...ORCAMENTO_BASE, servicos: [{ id: "s1", descricao: "X", valor: 10 }], pecas: [] }))!;
    expect(view.observacoesAoCliente).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Guard estático — nenhum identificador de dado não-client-safe pode aparecer
// no texto-fonte da projeção (nem em comentário: o guard é uma varredura de
// texto, não de AST). Inclui caso negativo (arquivo real) e positivo (fixture
// sintética que viola, provando que o detector funciona).
// ---------------------------------------------------------------------------

const TERMOS_PROIBIDOS_V4_ORC_CLIENTE = [
  "custoV3",
  "custoUnitario",
  "pecaCusto",
  "servicoCusto",
  "lucro",
  "margem",
  "fornecedor",
  "senha",
  "credencial",
  "provaEntradaV3",
  ".payload",
  "observacoesInternas",
];

function scanProibidosV4(source: string): string[] {
  return TERMOS_PROIBIDOS_V4_ORC_CLIENTE.filter((termo) => source.includes(termo));
}

describe("OPS-V4-ORC-VIEWMODEL-DOC-023 — guard estático (dados não-client-safe)", () => {
  it("[negativo] o arquivo real da projeção não contém nenhum termo proibido", () => {
    const source = readFileSync(join(__dirname, "orcamento-cliente-view.ts"), "utf8");
    expect(scanProibidosV4(source)).toEqual([]);
  });

  it("[positivo] a fixture sintética que viola é detectada pelo mesmo scanner", () => {
    const fixtureViolando = `
      function vazamento(linha: { custoV3?: number }) {
        return linha.custoV3; // nunca deveria existir na projeção client-safe
      }
    `;
    expect(scanProibidosV4(fixtureViolando)).toEqual(["custoV3"]);
  });

  it("[positivo] detecta múltiplos termos na mesma fixture", () => {
    const fixtureViolando = "const lucro = totais.lucro; const senha = os.senhaEquipamento;";
    const achados = scanProibidosV4(fixtureViolando);
    expect(achados).toContain("lucro");
    expect(achados).toContain("senha");
  });
});
