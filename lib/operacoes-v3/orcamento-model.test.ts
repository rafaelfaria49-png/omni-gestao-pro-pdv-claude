import { describe, expect, it } from "vitest";
import {
  computeTotaisV3,
  contarOrcamentosPorStatusV3,
  linhaKind,
  recalcOrcamentoV3,
  statusEfetivoOrcamentoV3,
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
