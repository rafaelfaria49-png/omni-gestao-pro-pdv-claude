import { describe, expect, it } from "vitest";
import {
  campoDoServidorNaImportacaoOSV3,
  mesclarImportacaoOSV3,
  payloadComEstadoFinanceiroOuTerminalV3,
} from "./os-payload-import";
import { semCamposFinanceirosDoServidorV3 } from "./os-payload-lock";
// Espelho .mjs usado pelos scripts de manutenção (fora do runtime Next).
import {
  campoDoServidorNaImportacaoOS,
  mesclarImportacaoOS,
  payloadComEstadoFinanceiroOuTerminal,
} from "../../scripts/lib/os-payload-lock.mjs";

const LATEST = {
  id: "os-1",
  storeId: "loja-1",
  codigo: "OS-1",
  criadoEm: "2026-10-01T12:00:00.000Z",
  cliente: { nome: "Antigo" },
  defeito: "Tela",
  status: "pronta",
  operacaoStatusV3: "pronta",
  valorTotal: 400,
  orcamento: { total: 400 },
  recebimentoMistoRecusasV3: [{ operacaoId: "K", code: "periodo_fechado" }],
  timeline: [{ id: "ev-1", tipo: "os_criada" }],
  estoqueConsumido: true,
  campoDesconhecido: { preservar: true },
};

const ARQUIVO = {
  id: "outro-id",
  storeId: "outra-loja",
  codigo: "X",
  cliente: { nome: "Novo" },
  defeito: "Bateria",
  status: "aberta",
  operacaoStatusV3: "aberta",
  valorTotal: 999,
  orcamento: { total: 999 },
  recebimentoMistoRecusasV3: [],
  pagamentoV3: { recebido: 999 },
  timeline: [],
  estoqueConsumido: false,
  importadoEm: "2026-10-05",
};

describe("importação sobre OS existente — patch intencional", () => {
  it("estado do servidor nunca vem do arquivo; campos desconhecidos do latest permanecem", () => {
    const next = mesclarImportacaoOSV3(LATEST, ARQUIVO, false);
    expect(next).toMatchObject({
      id: "os-1",
      storeId: "loja-1",
      codigo: "OS-1",
      operacaoStatusV3: "pronta",
      recebimentoMistoRecusasV3: LATEST.recebimentoMistoRecusasV3,
      timeline: LATEST.timeline,
      estoqueConsumido: true,
      campoDesconhecido: { preservar: true },
      cliente: { nome: "Novo" },
      defeito: "Bateria",
      importadoEm: "2026-10-05",
      // sem estado financeiro: o arquivo pode trocar valores/status legados
      valorTotal: 999,
      status: "aberta",
    });
    expect(next.pagamentoV3).toBeUndefined();
  });

  it("com estado financeiro/terminal, valores e status do arquivo não entram", () => {
    const next = mesclarImportacaoOSV3(LATEST, ARQUIVO, true);
    expect(next).toMatchObject({ valorTotal: 400, orcamento: { total: 400 }, status: "pronta", defeito: "Bateria" });
  });

  it("detecta estado financeiro/terminal no payload", () => {
    expect(payloadComEstadoFinanceiroOuTerminalV3(LATEST)).toBe(true);
    expect(payloadComEstadoFinanceiroOuTerminalV3({ pagamentoV3: { recebido: 0 } })).toBe(true);
    expect(payloadComEstadoFinanceiroOuTerminalV3({ aPrazoV3: { valor: 50 } })).toBe(true);
    expect(payloadComEstadoFinanceiroOuTerminalV3({ operacaoStatusV3: "entregue" })).toBe(true);
    expect(payloadComEstadoFinanceiroOuTerminalV3({ status: "cancelada" })).toBe(true);
    expect(payloadComEstadoFinanceiroOuTerminalV3({ status: "pronta", recebimentoMistoRecusasV3: [] })).toBe(false);
  });

  it("patch genérico (updateOSPayload) nunca troca os campos financeiros do servidor", () => {
    expect(semCamposFinanceirosDoServidorV3({ pagamentoV3: {}, aPrazoV3: {}, recebimentoMistoRecusasV3: [], observacoes: "x" })).toEqual({
      observacoes: "x",
    });
  });
});

describe("paridade TS × .mjs dos scripts de manutenção", () => {
  const campos = [...new Set([...Object.keys(LATEST), ...Object.keys(ARQUIVO), "aPrazoV3", "entregaV3", "estoqueMovimentos", "estoque", "historico", "financeiro", "servicos"])];

  it("mesmos campos do servidor", () => {
    for (const c of campos) expect(campoDoServidorNaImportacaoOS(c), c).toBe(campoDoServidorNaImportacaoOSV3(c));
  });

  it("mesmo patch com e sem proteção financeira", () => {
    for (const proteger of [false, true]) expect(mesclarImportacaoOS(LATEST, ARQUIVO, proteger)).toEqual(mesclarImportacaoOSV3(LATEST, ARQUIVO, proteger));
  });

  it("o .mjs protege sempre que o TS protege (superconjunto conservador)", () => {
    const amostras = [
      LATEST,
      {},
      { status: "pronta" },
      { status: "entregue" },
      { status: "finalizado" },
      { operacaoStatus: "cancelada" },
      { operacaoStatusV3: "entregue" },
      { pagamentoV3: null },
      { aPrazoV3: {} },
      { recebimentoMistoRecusasV3: [] },
    ];
    for (const p of amostras) {
      if (payloadComEstadoFinanceiroOuTerminalV3(p)) expect(payloadComEstadoFinanceiroOuTerminal(p), JSON.stringify(p)).toBe(true);
    }
  });
});
