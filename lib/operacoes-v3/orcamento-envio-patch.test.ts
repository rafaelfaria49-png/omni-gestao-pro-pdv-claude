import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { semCamposFinanceirosDoServidorV3 } from "./os-payload-lock";

const proposta = { id: "orc-qa", status: "rascunho", total: 300, servicos: [], pecas: [] };
const reserva = { id: "tentativa-qa", estado: "api_em_andamento", conteudoHash: "hash-do-servidor" };
const protegido = { orcamento: { ...proposta, compartilhamentosV3: [reserva] } };

describe("orçamento — patches genéricos/intenções legadas não contornam confirmação", () => {
  it("bloqueia fabricar enviado via patch de orçamento, comercial ou timeline", () => {
    expect(() => semCamposFinanceirosDoServidorV3({ orcamento: { status: "enviado" } }, { orcamento: { status: "rascunho" } })).toThrow(/confirmação explícita/);
    expect(() => semCamposFinanceirosDoServidorV3({ comercialV4: { statusComercial: "enviado" } })).toThrow(/exige/);
    expect(() => semCamposFinanceirosDoServidorV3({ timeline: [{ id: "novo", tipo: "orcamento_enviado" }] })).toThrow(/confirmação auditada/);
  });
  it("preserva recibos e instante idênticos; rejeita recibo/instante injetado", () => {
    const recibos = [{ id: "legitimo" }];
    const atual = { orcamento: { ...proposta, status: "enviado", compartilhamentosV3: recibos, enviadoEm: "2026-10-18T12:00:00Z" } };
    expect(semCamposFinanceirosDoServidorV3(structuredClone(atual), atual)).toEqual(atual);
    expect(() => semCamposFinanceirosDoServidorV3({ orcamento: { ...atual.orcamento, compartilhamentosV3: [], enviadoEm: "falso" } }, atual)).toThrow(/protegida/);
    expect(() => semCamposFinanceirosDoServidorV3({ orcamento: { ...proposta, compartilhamentosV3: [{ id: "falso" }] } })).toThrow(/ações auditadas/);
    expect(() => semCamposFinanceirosDoServidorV3({ orcamento: { ...proposta, enviadoEm: "falso" } })).toThrow(/ações auditadas/);
  });

  it.each([null, undefined, false, 0, "inválido", [], [proposta], {}, { total: 400 }, proposta].map(orcamento => ({ orcamento })))("rejeita substituição inválida/incompleta com reserva: $orcamento", ({ orcamento }) => {
    expect(() => semCamposFinanceirosDoServidorV3({ orcamento }, protegido)).toThrow(/reserva ou evidência de envio protegida/);
    expect(protegido.orcamento.compartilhamentosV3).toEqual([reserva]);
  });

  it.each(["preparado", "api_em_andamento", "informado_operador", "aceito_api"])("não apaga nem libera registro do servidor em estado %s", (estado) => {
    const atual = { orcamento: { ...proposta, compartilhamentosV3: [{ ...reserva, estado }] } };
    expect(() => semCamposFinanceirosDoServidorV3({ orcamento: null }, atual)).toThrow(/protegida/);
    expect(() => semCamposFinanceirosDoServidorV3({ orcamento: { ...atual.orcamento, compartilhamentosV3: [{ ...reserva, estado: "preparado", conteudoHash: "forjado" }] } }, atual)).toThrow(/protegida/);
  });

  it.each(["id", "estado", "conteudoHash", "iniciadoPor", "confirmadoPor", "natureza", "api"])("rejeita falsificação aninhada de %s", (campo) => {
    const entrada = { ...protegido.orcamento, compartilhamentosV3: [{ ...reserva, [campo]: "forjado" }] };
    expect(() => semCamposFinanceirosDoServidorV3({ orcamento: entrada }, protegido)).toThrow(/protegida/);
  });

  it("rejeita troca de identidade ou proposta truncada mesmo conservando os metadados", () => {
    expect(() => semCamposFinanceirosDoServidorV3({ orcamento: { ...protegido.orcamento, id: "outro" } }, protegido)).toThrow(/protegida/);
    expect(() => semCamposFinanceirosDoServidorV3({ orcamento: { id: proposta.id, compartilhamentosV3: [reserva] } }, protegido)).toThrow(/protegida/);
  });

  it("aceita edição de OS e proposta completa que conserva a proteção, sem mutar a entrada", () => {
    const entrada = { orcamento: { ...structuredClone(protegido.orcamento), total: 350 } };
    const antes = structuredClone(entrada);
    expect(semCamposFinanceirosDoServidorV3(entrada, protegido)).toEqual(antes);
    expect(entrada).toEqual(antes);
    expect(semCamposFinanceirosDoServidorV3({ observacoes: "Bancada" }, protegido)).toEqual({ observacoes: "Bancada" });
    const comChavesReordenadas = { orcamento: { ...entrada.orcamento, compartilhamentosV3: [{ conteudoHash: reserva.conteudoHash, estado: reserva.estado, id: reserva.id }] } };
    expect(semCamposFinanceirosDoServidorV3(comChavesReordenadas, protegido).orcamento.total).toBe(350);
  });

  it("mantém edição e remoção legadas sem reserva/evidência", () => {
    expect(semCamposFinanceirosDoServidorV3({ orcamento: { ...proposta, total: 350 } }, { orcamento: proposta }).orcamento.total).toBe(350);
    expect(semCamposFinanceirosDoServidorV3({ orcamento: null }, { orcamento: proposta })).toEqual({ orcamento: null });
    expect(semCamposFinanceirosDoServidorV3({ orcamento: { ...proposta, status: "enviado", total: 350 } }, { orcamento: { ...proposta, status: "enviado" } }).orcamento.total).toBe(350);
    expect(semCamposFinanceirosDoServidorV3({}, protegido)).toEqual({});
  });

  it.each([null, undefined, false, 42, "inválido", []].map(patch => ({ patch })))("rejeita patch raiz inválido com erro explícito: $patch", ({ patch }) => {
    expect(() => semCamposFinanceirosDoServidorV3(patch as unknown as object, protegido)).toThrow(/Patch da OS deve ser um objeto/);
  });
});
