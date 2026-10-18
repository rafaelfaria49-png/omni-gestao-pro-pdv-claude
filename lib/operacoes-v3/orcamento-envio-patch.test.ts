import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { semCamposFinanceirosDoServidorV3 } from "./os-payload-lock";

describe("orçamento — patches genéricos/intenções legadas não contornam confirmação", () => {
  it("bloqueia fabricar enviado via patch de orçamento, comercial ou timeline", () => {
    expect(() => semCamposFinanceirosDoServidorV3({ orcamento: { status: "enviado" } }, { orcamento: { status: "rascunho" } })).toThrow(/confirmação explícita/);
    expect(() => semCamposFinanceirosDoServidorV3({ comercialV4: { statusComercial: "enviado" } })).toThrow(/exige/);
    expect(() => semCamposFinanceirosDoServidorV3({ timeline: [{ id: "novo", tipo: "orcamento_enviado" }] })).toThrow(/confirmação auditada/);
  });
  it("preserva recibos e instante do servidor; remove recibo/instante injetado em orçamento novo", () => {
    const recibos = [{ id: "legitimo" }];
    const atual = { orcamento: { status: "enviado", compartilhamentosV3: recibos, enviadoEm: "2026-10-18T12:00:00Z" } };
    expect(semCamposFinanceirosDoServidorV3({ orcamento: { status: "enviado", compartilhamentosV3: [], enviadoEm: "falso" } }, atual).orcamento).toEqual(atual.orcamento);
    expect(semCamposFinanceirosDoServidorV3({ orcamento: { status: "rascunho", compartilhamentosV3: [{ id: "falso" }], enviadoEm: "falso" } }).orcamento).toEqual({ status: "rascunho" });
  });
});
