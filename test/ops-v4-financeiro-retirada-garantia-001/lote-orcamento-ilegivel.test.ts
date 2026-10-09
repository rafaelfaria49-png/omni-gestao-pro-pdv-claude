// @vitest-environment node
//
// OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-001 (R4-P2) — o reader REAL em lote
// (`lerProjecoesFinanceirasOSV4`) com Prisma/sessão espiões, em memória: uma OS com
// linhas de orçamento malformadas não derruba o lote; a OS íntegra vizinha volta
// inteira e a malformada mantém decisões legadas e fatos, com o total comercial
// desconhecido e diagnóstico. Massa sintética; nenhuma escrita.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { localKeyContaReceberOSV3 } from "@/lib/operacoes-v3/payment-model";

const mocks = vi.hoisted(() => ({
  osFindMany: vi.fn(),
  titleFindMany: vi.fn(),
  auth: vi.fn(),
  requireEnterpriseWith: vi.fn(),
  assertActiveStoreId: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ordemServico: { findMany: mocks.osFindMany },
    contaReceberTitulo: { findMany: mocks.titleFindMany },
  },
}));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/auth/guard-enterprise", () => ({ requireEnterpriseWith: mocks.requireEnterpriseWith }));
vi.mock("@/lib/operacoes/assert-active-store", () => ({ assertActiveStoreId: mocks.assertActiveStoreId }));

import { lerProjecoesFinanceirasOSV4 } from "@/lib/operacoes-v4/financial-projection-actions";

const LOJA = "loja-qa-lote";

function osRow(id: string, orcStatus: string, servicos: unknown, pecas: unknown = []) {
  return {
    id, numero: `OS-${id}`, status: "Pronta", valorTotal: 420,
    payload: {
      id, codigo: `OS-${id}`, status: "pronta", operacaoStatusV3: "pronta", valorTotal: 420,
      orcamento: { id: `orc-${id}`, status: orcStatus, sintetizado: false, total: 420, desconto: 0, servicos, pecas, criadoEm: "2026-09-18T10:00:00.000Z" },
      timeline: [{
        id: `ev-${id}`, tipo: "operacao_cobranca_gerada", autor: "Op", conteudo: "Quitação", criadoEm: "2026-10-05T21:37:38.000Z",
        metadata: { operacaoId: `op-${id}`, total: 420, linhas: [{ forma: "dinheiro", valor: 420 }] },
      }],
    },
  };
}

function titleRow(id: string) {
  return {
    id: `cr-${id}`, storeId: LOJA, localKey: localKeyContaReceberOSV3(LOJA, id), valor: 420, status: "pago",
    payload: { ordemServicoId: id, historico: [{ tipo: "liquidacao", valor: 420, loteId: `op-${id}` }] },
  };
}

beforeEach(() => {
  mocks.auth.mockReset().mockResolvedValue({ user: { id: "qa" } });
  mocks.requireEnterpriseWith.mockReset().mockResolvedValue({ ok: true });
  mocks.assertActiveStoreId.mockReset();
});

describe("R4-P2 — orçamento malformado não derruba o lote de projeções", () => {
  const integra = () => osRow("boa", "aprovado", [{ id: "s1", descricao: "Troca de Tela", valor: 420 }]);
  const malformadas: Array<[string, ReturnType<typeof osRow>]> = [
    ["serviço null", osRow("ruim", "rascunho", [null])],
    ["grupoId numérico", osRow("ruim", "rascunho", [{ id: "s1", descricao: "Troca de Tela", valor: 420, grupoId: 17 }])],
    ["grupoId objeto em peça", osRow("ruim", "rascunho", [{ id: "s1", valor: 420 }], [{ id: "p1", grupoId: { x: 1 }, quantidade: 1, valorUnitario: 10 }])],
    ["servicos não é lista", osRow("ruim", "rascunho", "Troca de Tela")],
    // R5: objetos sem conversão primitiva (chegam por JSON) em campos numéricos e na validade
    ["desconto do serviço sem primitivo", osRow("ruim", "rascunho", [{ id: "s1", valor: 420, desconto: JSON.parse('{"toString":null}') }])],
    ["custoV3 sem primitivo", osRow("ruim", "rascunho", [{ id: "s1", valor: 420, custoV3: JSON.parse('{"toString":null}') }])],
    ["valor do serviço sem primitivo", osRow("ruim", "rascunho", [{ id: "s1", valor: JSON.parse('{"valueOf":null,"toString":null}') }])],
    ["quantidade/valor/custo de peça sem primitivo", osRow("ruim", "rascunho", [{ id: "s1", valor: 420 }], [{ id: "p1", quantidade: JSON.parse('{"toString":null}'), valorUnitario: JSON.parse('{"toString":null}'), custoUnitario: JSON.parse('{"toString":null}') }])],
  ];

  it("desconto do orçamento e validade sem primitivo (enviado) também não derrubam o lote", async () => {
    const desconto = osRow("ruim", "rascunho", [{ id: "s1", valor: 420 }]);
    (desconto.payload.orcamento as Record<string, unknown>).desconto = JSON.parse('{"toString":null}');
    const validade = osRow("vence", "enviado", [{ id: "s1", valor: 420 }]);
    (validade.payload.orcamento as Record<string, unknown>).validoAte = JSON.parse('{"toString":null}');
    mocks.osFindMany.mockReset().mockResolvedValue([integra(), desconto, validade]);
    mocks.titleFindMany.mockReset().mockResolvedValue([titleRow("boa"), titleRow("ruim"), titleRow("vence")]);
    const lote = await lerProjecoesFinanceirasOSV4(LOJA, ["boa", "ruim", "vence"]);
    const porId = new Map(lote.map((p) => [p.osId, p]));
    expect(porId.get("boa")).toMatchObject({ financialStatus: "PAID", canDeliver: true });
    expect(porId.get("ruim")?.comercial).toMatchObject({ totalOrcamento: null });
    expect(porId.get("vence")?.comercial).toMatchObject({ orcamento: "desconhecido" });
    for (const id of ["ruim", "vence"]) {
      expect(porId.get(id)?.comercial?.divergencias.map((d) => d.codigo), id).toContain("ORCAMENTO_ILEGIVEL");
      expect(porId.get(id)?.fatos, id).toMatchObject({ verificavel: true, recebidoLiquido: 420 });
    }
  });

  it("status do título que não é texto não derruba o lote (fatos em conferência)", async () => {
    const ruim = { ...titleRow("ruim"), status: JSON.parse('{"toString":null}') };
    mocks.osFindMany.mockReset().mockResolvedValue([integra(), osRow("ruim", "rascunho", [{ id: "s1", valor: 420 }])]);
    mocks.titleFindMany.mockReset().mockResolvedValue([titleRow("boa"), ruim]);
    const lote = await lerProjecoesFinanceirasOSV4(LOJA, ["boa", "ruim"]);
    const porId = new Map(lote.map((p) => [p.osId, p]));
    expect(porId.get("boa")).toMatchObject({ financialStatus: "PAID", canDeliver: true });
    expect(porId.get("ruim")?.fatos).toMatchObject({ verificavel: false, motivo: "HISTORICO_INVALIDO" });
  });

  for (const [nome, ruim] of malformadas) {
    it(`${nome}: a OS íntegra volta inteira e a malformada só perde o total comercial`, async () => {
      mocks.osFindMany.mockReset().mockResolvedValue([integra(), ruim]);
      mocks.titleFindMany.mockReset().mockResolvedValue([titleRow("boa"), titleRow("ruim")]);
      const lote = await lerProjecoesFinanceirasOSV4(LOJA, ["boa", "ruim"]);
      const porId = new Map(lote.map((p) => [p.osId, p]));
      expect([...porId.keys()].sort()).toEqual(["boa", "ruim"]);
      expect(porId.get("boa")).toMatchObject({ financialStatus: "PAID", canDeliver: true, receivedTotal: 420, balance: 0 });
      const p = porId.get("ruim")!;
      expect(p).toMatchObject({ canDeliver: false, canReceive: false });
      expect(p.fatos).toMatchObject({ verificavel: true, recebidoLiquido: 420, saldoTitulo: 0, liquidado: true });
      expect(p.comercial).toMatchObject({ totalOrcamento: null, confereComTitulo: null });
      expect(p.comercial?.divergencias.map((d) => d.codigo)).toContain("ORCAMENTO_ILEGIVEL");
    });
  }
});

describe("R6 — forma ou evento com nome herdado do protótipo não derruba nem contamina o lote", () => {
  const integra = () => osRow("boa", "aprovado", [{ id: "s1", descricao: "Troca de Tela", valor: 420 }]);
  const comHistorico = (id: string, historico: unknown[]) => ({ ...titleRow(id), payload: { ordemServicoId: id, historico } });
  const baixa = (id: string, extra: Record<string, unknown> = {}) => ({ tipo: "liquidacao", valor: 420, loteId: `op-${id}`, ...extra });

  /** Saída que não é texto (objeto/função herdados) ou texto de coerção em qualquer ponto do lote. */
  function rotulosInvalidos(raiz: unknown): string[] {
    const achados: string[] = [];
    const vistos = new Set<unknown>();
    const visitar = (v: unknown, caminho: string) => {
      if (typeof v === "function") { achados.push(`${caminho}: função`); return; }
      if (typeof v === "string") { if (/\[object |function [A-Za-z]*\(/.test(v)) achados.push(`${caminho}: "${v}"`); return; }
      if (!v || typeof v !== "object" || vistos.has(v)) return;
      if (v === Object.prototype || v === Array.prototype || v === Function.prototype) { achados.push(`${caminho}: protótipo`); return; }
      vistos.add(v);
      for (const [k, filho] of Object.entries(v)) visitar(filho, `${caminho}.${k}`);
    };
    visitar(raiz, "$");
    return achados;
  }

  it("OS com __proto__/constructor na baixa, no split e no tipo do evento ao lado de uma íntegra: o lote volta inteiro, serializável e só com texto", async () => {
    const aprovado = (id: string) => osRow(id, "aprovado", [{ id: "s1", descricao: "Troca de Tela", valor: 420 }]);
    mocks.osFindMany.mockReset().mockResolvedValue([integra(), aprovado("proto"), aprovado("cons"), aprovado("split"), aprovado("tipo"), aprovado("valor")]);
    mocks.titleFindMany.mockReset().mockResolvedValue([
      titleRow("boa"),
      comHistorico("proto", [baixa("proto", { formaPagamento: "__proto__" })]),
      comHistorico("cons", [baixa("cons", { formaPagamento: "constructor" })]),
      comHistorico("split", [baixa("split", { split: [{ forma: "pix", valor: 100 }, { forma: "constructor", valor: 320 }] })]),
      comHistorico("tipo", [baixa("tipo"), { tipo: "__proto__" }, { tipo: "constructor" }]),
      comHistorico("valor", [baixa("valor", { split: [{ forma: "pix", valor: 100 }, { forma: "__proto__", valor: JSON.parse('{"toString":null}') }] })]),
    ]);
    const lote = await lerProjecoesFinanceirasOSV4(LOJA, ["boa", "proto", "cons", "split", "tipo", "valor"]);
    const porId = new Map(lote.map((p) => [p.osId, p]));
    expect([...porId.keys()].sort()).toEqual(["boa", "cons", "proto", "split", "tipo", "valor"]);
    // O retorno do reader cruza a fronteira da Server Action: função/objeto herdado não pode estar lá.
    expect(() => structuredClone(lote)).not.toThrow();
    expect(rotulosInvalidos(lote)).toEqual([]);
    const boa = porId.get("boa")!;
    for (const id of ["proto", "cons", "split", "tipo", "valor"]) {
      const p = porId.get(id)!;
      // decisões e fatos idênticos aos da OS íntegra: a forma/tipo não muda nada financeiro
      expect(p, id).toMatchObject({ financialStatus: boa.financialStatus, canDeliver: boa.canDeliver, canReceive: boa.canReceive, receivedTotal: 420, balance: 0 });
      expect(p.fatos, id).toMatchObject({ verificavel: true, recebidoLiquido: 420, saldoTitulo: 0, liquidado: true });
    }
    expect(porId.get("proto")?.fatos?.meios).toEqual([{ label: "__proto__", valor: 420, operacaoId: "op-proto", fonte: "RECEIVABLE_HISTORY" }]);
    expect(porId.get("cons")?.fatos?.meios).toEqual([{ label: "constructor", valor: 420, operacaoId: "op-cons", fonte: "RECEIVABLE_HISTORY" }]);
    expect(porId.get("split")?.fatos).toMatchObject({ meios: [{ label: "Pix", valor: 100 }, { label: "constructor", valor: 320 }], semMeioIdentificado: 0 });
    expect(porId.get("valor")?.fatos).toMatchObject({ meios: [{ label: "Pix", valor: 100 }], semMeioIdentificado: 320 });
    expect(porId.get("tipo")?.financialEvents.filter((e) => e.source === "RECEIVABLE" && e.type !== "liquidacao").map((e) => e.description)).toEqual(["Evento financeiro do título", "Evento financeiro do título"]);
  });
});
