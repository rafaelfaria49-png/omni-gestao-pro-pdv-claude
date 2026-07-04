import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CANAL_ENVIO_LABEL_V3,
  computeTotaisV3,
  contarOrcamentosPorStatusV3,
  linhaKind,
  MAX_LINHAS_POR_GRUPO_V3,
  montarEventoEnvioOrcamentoV3,
  recalcOrcamentoV3,
  statusEfetivoOrcamentoV3,
  validarGruposOrcamentoV3,
  VALIDADE_PADRAO_DIAS,
  type OrcamentoV3,
  type PecaV3,
  type ServicoV3,
} from "./orcamento-model";

const peca = (over: Partial<PecaV3>): PecaV3 => ({ id: "p", nome: "Peça", quantidade: 1, valorUnitario: 0, ...over });
const servico = (over: Partial<ServicoV3>): ServicoV3 => ({ id: "s", descricao: "Serviço", valor: 0, ...over });

describe("orçamento V3 — brindes e totais", () => {
  it("kind default é cobrado", () => {
    expect(linhaKind(peca({}))).toBe("cobrado");
    expect(linhaKind(peca({ kindV3: "brinde" }))).toBe("brinde");
    expect(linhaKind({} as PecaV3)).toBe("cobrado");
  });

  it("cobrado impacta custo e valor ao cliente; brinde/interno só custo", () => {
    const orc = {
      desconto: 0,
      servicos: [servico({ descricao: "Troca de tela", valor: 300, custoV3: 120, kindV3: "cobrado" })],
      pecas: [
        peca({ nome: "Película", quantidade: 1, valorUnitario: 40, custoUnitario: 10, kindV3: "brinde" }),
        peca({ nome: "Capinha", quantidade: 1, valorUnitario: 30, custoUnitario: 8, kindV3: "interno" }),
        peca({ nome: "Tela", quantidade: 1, valorUnitario: 250, custoUnitario: 150, kindV3: "cobrado" }),
      ],
    };
    const t = computeTotaisV3(orc);
    // valor ao cliente: 300 (serviço) + 250 (tela) — película/capinha não entram
    expect(t.subtotal).toBe(550);
    expect(t.total).toBe(550);
    // custo: 120 + 10 + 8 + 150
    expect(t.custo).toBe(288);
    expect(t.lucro).toBe(550 - 288);
  });

  it("desconto reduz total e lucro, total nunca negativo", () => {
    const orc = { desconto: 100, servicos: [servico({ valor: 300, custoV3: 100, kindV3: "cobrado" })], pecas: [] };
    const t = computeTotaisV3(orc);
    expect(t.total).toBe(200);
    expect(t.lucro).toBe(100);
    expect(computeTotaisV3({ ...orc, desconto: 99999 }).total).toBe(0);
  });

  it("desconto por linha é respeitado", () => {
    const t = computeTotaisV3({ desconto: 0, servicos: [], pecas: [peca({ quantidade: 2, valorUnitario: 100, desconto: 30, kindV3: "cobrado" })] });
    expect(t.subtotal).toBe(170);
  });

  it("recalcOrcamentoV3 fixa o campo total consistente com brindes", () => {
    const orc = {
      id: "o", status: "rascunho", criadoEm: "x", desconto: 0, total: 9999,
      servicos: [], pecas: [peca({ valorUnitario: 80, custoUnitario: 20, kindV3: "brinde" })],
    } as unknown as OrcamentoV3;
    expect(recalcOrcamentoV3(orc).total).toBe(0);
  });
});

describe("orçamento V3 — estados", () => {
  const base = { status: "enviado" as const };

  it("enviado vencido vira expirado (efetivo); válido permanece enviado", () => {
    const now = Date.parse("2026-06-10T00:00:00Z");
    expect(statusEfetivoOrcamentoV3({ ...base, validoAte: "2026-06-01T00:00:00Z" }, now)).toBe("expirado");
    expect(statusEfetivoOrcamentoV3({ ...base, validoAte: "2026-06-20T00:00:00Z" }, now)).toBe("enviado");
    expect(statusEfetivoOrcamentoV3({ ...base, validoAte: undefined }, now)).toBe("enviado");
  });

  it("rascunho/aprovado/recusado não expiram", () => {
    const now = Date.parse("2026-06-10T00:00:00Z");
    expect(statusEfetivoOrcamentoV3({ status: "rascunho", validoAte: "2020-01-01T00:00:00Z" }, now)).toBe("rascunho");
    expect(statusEfetivoOrcamentoV3({ status: "aprovado", validoAte: "2020-01-01T00:00:00Z" }, now)).toBe("aprovado");
  });
});

describe("orçamento V3 — métricas do dashboard", () => {
  it("conta orçamentos reais por status efetivo, ignorando sintetizados e sem-orçamento", () => {
    const now = Date.parse("2026-06-10T00:00:00Z");
    const ordens = [
      { orcamento: { status: "rascunho" } },
      { orcamento: { status: "aprovado" } },
      { orcamento: { status: "enviado", validoAte: "2026-06-01T00:00:00Z" } }, // expirado
      { orcamento: { status: "enviado", validoAte: "2026-06-20T00:00:00Z" } }, // enviado
      { orcamento: { status: "rascunho", sintetizado: true } }, // ignorado
      {}, // sem orçamento
    ];
    const c = contarOrcamentosPorStatusV3(ordens, now);
    expect(c.rascunho).toBe(1);
    expect(c.aprovado).toBe(1);
    expect(c.enviado).toBe(1);
    expect(c.expirado).toBe(1);
    expect(c.recusado).toBe(0);
  });
});

describe("orçamento V3 — grupos de escolha (GOAL 021) — regressão N=0", () => {
  it("orçamento sem nenhum grupoId: totais idênticos ao formato anterior (sem faixa)", () => {
    const orc = {
      desconto: 50,
      servicos: [servico({ descricao: "Troca de tela", valor: 300, custoV3: 120, kindV3: "cobrado" })],
      pecas: [
        peca({ nome: "Película", quantidade: 1, valorUnitario: 40, custoUnitario: 10, kindV3: "brinde" }),
        peca({ nome: "Tela", quantidade: 1, valorUnitario: 250, custoUnitario: 150, kindV3: "cobrado" }),
      ],
    };
    const t = computeTotaisV3(orc);
    expect(t).toEqual({ subtotal: 550, desconto: 50, total: 500, custo: 280, lucro: 220, faixa: undefined });
  });
});

describe("orçamento V3 — grupos de escolha (GOAL 021) — faixa e seleção", () => {
  it("grupo sem seleção vira faixa {min,max}; linhas fixas somam sempre", () => {
    const orc = {
      desconto: 0,
      servicos: [
        servico({ id: "fix", descricao: "Mão de obra", valor: 50, kindV3: "cobrado" }),
        servico({ id: "opt-a", descricao: "Tela genérica", valor: 150, kindV3: "cobrado", grupoId: "g1" }),
        servico({ id: "opt-b", descricao: "Tela original", valor: 300, kindV3: "cobrado", grupoId: "g1" }),
      ],
      pecas: [],
    };
    const t = computeTotaisV3(orc);
    // fixo (50) + faixa min do grupo (150) = 200 ; total = mínimo conservador
    expect(t.total).toBe(200);
    expect(t.faixa).toEqual({ min: 200, max: 350 }); // 50+150 .. 50+300
  });

  it("grupo com uma linha selecionada: soma só a selecionada, sem faixa", () => {
    const orc = {
      desconto: 0,
      servicos: [
        servico({ id: "opt-a", descricao: "Tela genérica", valor: 150, kindV3: "cobrado", grupoId: "g1" }),
        servico({ id: "opt-b", descricao: "Tela original", valor: 300, kindV3: "cobrado", grupoId: "g1", selecionadaV3: true }),
      ],
      pecas: [],
    };
    const t = computeTotaisV3(orc);
    expect(t.total).toBe(300);
    expect(t.faixa).toBeUndefined();
  });

  it("kindV3 (brinde/interno) é respeitado dentro de um grupo: opção brinde vale 0 ao cliente", () => {
    const orc = {
      desconto: 0,
      pecas: [
        peca({ id: "opt-a", nome: "Capa simples", quantidade: 1, valorUnitario: 0, custoUnitario: 20, kindV3: "brinde", grupoId: "g1" }),
        peca({ id: "opt-b", nome: "Capa premium", quantidade: 1, valorUnitario: 80, custoUnitario: 40, kindV3: "cobrado", grupoId: "g1" }),
      ],
      servicos: [],
    };
    const t = computeTotaisV3(orc);
    // sem seleção: faixa min=0 (brinde) .. max=80 (cobrado)
    expect(t.faixa).toEqual({ min: 0, max: 80 });
    expect(t.total).toBe(0);
  });

  it("custo de grupo não resolvido não é somado; custo de grupo resolvido soma só a escolhida", () => {
    const naoResolvido = computeTotaisV3({
      desconto: 0,
      servicos: [],
      pecas: [
        peca({ id: "a", nome: "A", quantidade: 1, valorUnitario: 100, custoUnitario: 50, kindV3: "cobrado", grupoId: "g1" }),
        peca({ id: "b", nome: "B", quantidade: 1, valorUnitario: 200, custoUnitario: 90, kindV3: "cobrado", grupoId: "g1" }),
      ],
    });
    expect(naoResolvido.custo).toBe(0);

    const resolvido = computeTotaisV3({
      desconto: 0,
      servicos: [],
      pecas: [
        peca({ id: "a", nome: "A", quantidade: 1, valorUnitario: 100, custoUnitario: 50, kindV3: "cobrado", grupoId: "g1" }),
        peca({ id: "b", nome: "B", quantidade: 1, valorUnitario: 200, custoUnitario: 90, kindV3: "cobrado", grupoId: "g1", selecionadaV3: true }),
      ],
    });
    expect(resolvido.custo).toBe(90);
  });

  it("desconto geral é aplicado sobre o total mínimo (faixa também reflete o desconto)", () => {
    const t = computeTotaisV3({
      desconto: 20,
      servicos: [
        servico({ id: "opt-a", descricao: "A", valor: 100, kindV3: "cobrado", grupoId: "g1" }),
        servico({ id: "opt-b", descricao: "B", valor: 200, kindV3: "cobrado", grupoId: "g1" }),
      ],
      pecas: [],
    });
    expect(t.total).toBe(80); // 100 - 20
    expect(t.faixa).toEqual({ min: 80, max: 180 }); // 200 - 20
  });
});

describe("orçamento V3 — validação de máximo de linhas por grupo (GOAL 021)", () => {
  it("grupo com até 4 linhas é válido", () => {
    const orc = {
      pecas: [
        peca({ id: "1", grupoId: "g1" }),
        peca({ id: "2", grupoId: "g1" }),
        peca({ id: "3", grupoId: "g1" }),
        peca({ id: "4", grupoId: "g1" }),
      ],
      servicos: [],
    };
    expect(validarGruposOrcamentoV3(orc)).toEqual([]);
    expect(MAX_LINHAS_POR_GRUPO_V3).toBe(4);
  });

  it("grupo com 5 linhas (combinando peças + serviços) é inválido", () => {
    const orc = {
      pecas: [peca({ id: "1", grupoId: "g1" }), peca({ id: "2", grupoId: "g1" }), peca({ id: "3", grupoId: "g1" })],
      servicos: [servico({ id: "4", grupoId: "g1" }), servico({ id: "5", grupoId: "g1" })],
    };
    const erros = validarGruposOrcamentoV3(orc);
    expect(erros).toHaveLength(1);
    expect(erros[0]).toContain("g1");
  });

  it("linhas fixas (sem grupoId) nunca contam para o limite", () => {
    const orc = { pecas: Array.from({ length: 10 }, (_, i) => peca({ id: `f${i}` })), servicos: [] };
    expect(validarGruposOrcamentoV3(orc)).toEqual([]);
  });
});

describe("orçamento V3 — registro de envio por canal (GOAL 021)", () => {
  it("monta evento com tipo/conteudo/metadata corretos por canal", () => {
    const evt = montarEventoEnvioOrcamentoV3("whatsapp", 550);
    expect(evt.tipo).toBe("orcamento_enviado");
    expect(evt.conteudo).toBe(`Orçamento enviado ao cliente via ${CANAL_ENVIO_LABEL_V3.whatsapp}.`);
    expect(evt.metadata).toEqual({ canal: "whatsapp", totalSnapshot: 550 });
  });

  it("todos os canais têm rótulo definido", () => {
    for (const canal of ["whatsapp", "impresso", "presencial", "outro"] as const) {
      expect(CANAL_ENVIO_LABEL_V3[canal]).toBeTruthy();
      expect(montarEventoEnvioOrcamentoV3(canal, 0).metadata.canal).toBe(canal);
    }
  });

  it("totalSnapshot nunca fica negativo/NaN", () => {
    expect(montarEventoEnvioOrcamentoV3("outro", -10).metadata.totalSnapshot).toBe(0);
    expect(montarEventoEnvioOrcamentoV3("outro", Number.NaN).metadata.totalSnapshot).toBe(0);
  });
});

describe("orçamento V3 — GOAL OPS-V4-ORC-RAPIDO-024 — constante única + wiring do validador", () => {
  it("VALIDADE_PADRAO_DIAS mantém o valor de sempre (7)", () => {
    expect(VALIDADE_PADRAO_DIAS).toBe(7);
  });

  // `orcamento-actions.ts` não é importável diretamente aqui (usa o alias fino
  // `@/api/os`, que o vitest.config.ts não resolve — só `@` → raiz). A leitura
  // de texto abaixo não executa o módulo, só confirma a fiação no source real.
  it("orcamento-actions.ts importa VALIDADE_PADRAO_DIAS de orcamento-model.ts (sem duplicar a constante)", () => {
    const src = readFileSync(join(__dirname, "orcamento-actions.ts"), "utf8");
    expect(src).toContain("VALIDADE_PADRAO_DIAS");
    expect(src).not.toMatch(/const\s+VALIDADE_PADRAO_DIAS\s*=/);
  });

  it("salvarOrcamentoV3 chama validarGruposOrcamentoV3 antes de gravar", () => {
    const src = readFileSync(join(__dirname, "orcamento-actions.ts"), "utf8");
    const inicio = src.indexOf("export async function salvarOrcamentoV3");
    const fimAprox = src.indexOf("\n}", inicio);
    const corpo = src.slice(inicio, fimAprox);
    expect(corpo).toContain("validarGruposOrcamentoV3(");
  });

  it("lib/operacoes-v4/orcamento-cliente-view.ts importa a mesma constante (sem duplicar)", () => {
    const src = readFileSync(join(__dirname, "..", "operacoes-v4", "orcamento-cliente-view.ts"), "utf8");
    expect(src).toContain("VALIDADE_PADRAO_DIAS");
    expect(src).not.toMatch(/const\s+VALIDADE_PADRAO_DIAS\s*=/);
    expect(src).not.toContain("DIAS_VALIDADE_PADRAO_DOC_CLIENTE");
  });
});
