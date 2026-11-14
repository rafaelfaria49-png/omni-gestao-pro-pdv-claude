import { describe, expect, it } from "vitest";
import { planejarEdicaoFinanceiraV3, redistribuirParcelasEdicaoV3 } from "./edicao-financeira";
import { orcamentoEditadoCompletoV3, semearEdicaoCompletaV3, totalEdicaoCompletaV3, validarEdicaoCompletaV3 } from "./edicao-completa-model";
import type { OrdemServico } from "@/types/os";

const titulo = (historico: unknown[] = [], status = "pendente") => ({ valor: 330, status, payload: { historico, parcelas: [{ id: "p1", valor: 110, vencimento: "2026-12-01" }, { id: "p2", valor: 110, vencimento: "2027-01-01" }, { id: "p3", valor: 110, vencimento: "2027-02-01" }] } });
const os = (status = "aberta") => ({ id: "qa-os", storeId: "qa-loja", clienteId: "qa-cliente", cliente: { id: "qa-cliente", nome: "Cliente Sintético", documento: "52998224725" }, equipamento: { tipo: "Smartphone", marca: "QA", modelo: "Sintético", defeitoRelatado: "Problema sintético" }, status, timeline: [], pecas: [], orcamento: { id: "orc-qa", status: status === "aberta" ? "rascunho" : "aprovado", total: 330, desconto: 0, servicos: [{ id: "s1", descricao: "Serviço sintético", valor: 330, custoV3: 50 }], pecas: [] } }) as unknown as OrdemServico;

describe("correção financeira da OS", () => {
  it.each([400, 250, 330.01])("reconcilia R$ 330 a prazo para R$ %s sem perder as identidades das parcelas", (novo) => {
    expect(() => planejarEdicaoFinanceiraV3(titulo(), 330, novo, false, false, false)).not.toThrow();
    const parcelas = redistribuirParcelasEdicaoV3(titulo().payload.parcelas, 330, novo) as Array<{ id: string; valor: number; vencimento: string }>;
    expect(parcelas.reduce((s, p) => s + Math.round(p.valor * 100), 0)).toBe(Math.round(novo * 100));
    expect(parcelas.map((p) => [p.id, p.vencimento])).toEqual(titulo().payload.parcelas.map((p) => [p.id, p.vencimento]));
  });
  it.each([
    ["parcial", titulo([{ tipo: "pagamento", valor: 100 }])],
    ["quitado", titulo([{ tipo: "liquidacao", valor: 330 }], "pago")],
    ["estornado", titulo([{ tipo: "pagamento", valor: 100 }, { tipo: "estorno_pagamento", valor: 100 }])],
    ["divergente", { ...titulo(), valor: 300 }],
    ["histórico ilegível", { ...titulo(), payload: { historico: "inválido" } }],
  ])("bloqueia %s e exige ajuste seguro", (_, t) => {
    expect(() => planejarEdicaoFinanceiraV3(t as ReturnType<typeof titulo>, 330, 400, false, false, false)).toThrow(/ajuste\/compensação/);
  });
  it("bloqueia alteração com caixa ou período fechado", () => {
    expect(() => planejarEdicaoFinanceiraV3(titulo(), 330, 400, false, true, false)).toThrow(/ajuste/);
    expect(() => planejarEdicaoFinanceiraV3(titulo(), 330, 400, false, false, true)).toThrow(/ajuste/);
  });
  it("recusa parcela paga, valor negativo e soma divergente", () => {
    expect(() => redistribuirParcelasEdicaoV3([{ valor: 330, status: "pago" }], 330, 400)).toThrow();
    expect(() => redistribuirParcelasEdicaoV3([{ valor: -330 }], 330, 400)).toThrow();
    expect(() => redistribuirParcelasEdicaoV3([{ valor: 300 }], 330, 400)).toThrow();
  });
  it.each(["aberta", "aprovado", "entregue"])("preserva identidade e estado da OS %s", (status) => {
    const original = os(status), dados = validarEdicaoCompletaV3(semearEdicaoCompletaV3(original));
    dados.servicos[0].valor = 400;
    const orc = orcamentoEditadoCompletoV3(original, dados, "2026-11-14T15:00:00Z");
    expect(orc.id).toBe(original.orcamento!.id);
    expect(orc.status).toBe(original.orcamento!.status);
    expect(orc.total).toBe(400);
    expect(original.status).toBe(status);
  });
  it("rejeita CPF incorreto e aceita sua correção pelo validador canônico", () => {
    const d = semearEdicaoCompletaV3(os()); d.cliente.documento = "11111111111";
    expect(() => validarEdicaoCompletaV3(d)).toThrow(/CPF/);
    d.cliente.documento = "529.982.247-25";
    expect(validarEdicaoCompletaV3(d).cliente.documento).toBe(d.cliente.documento);
  });
  it("alterar só custo não muda preço nem exige movimento financeiro, mesmo após quitação", () => {
    const d = semearEdicaoCompletaV3(os("entregue")); d.servicos[0].custoV3 = 180;
    expect(totalEdicaoCompletaV3(d)).toBe(330);
    expect(() => planejarEdicaoFinanceiraV3(titulo([{ tipo: "pagamento", valor: 330 }], "pago"), 330, 330, false, true, true)).not.toThrow();
  });
});
