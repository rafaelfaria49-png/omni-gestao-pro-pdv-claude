import { describe, expect, it } from "vitest";
import type { OrdemServico } from "@/types/os";
import { computeTotaisV3, validarSelecaoCompletaV3 } from "@/lib/operacoes-v3/orcamento-model";
import { montarGrupoMetaOrcamentoRapidoV3, montarServicosOrcamentoRapidoV3 } from "@/lib/operacoes-v3/orcamento-rapido-model";
import {
  buildOrcamentoRapidoInputFromFormV4, definirCortesiaTelaV4,
  novaVarianteVaziaV4, orcamentoRapidoFormVazioV4, previaResultadosAlternativasV4,
  previaTotaisOrcamentoRapidoV4, type OrcamentoRapidoFormV4,
} from "./orcamento-rapido-form";
import { reaisParaCentavosV4, sugerirPrecoTelaCentavos } from "./precificacao-telas";
import { marcarSelecaoVarianteV4 } from "./orcamento-selecao";
import { montarOrcamentoClienteViewV4 } from "./orcamento-cliente-view";
import { montarMensagemOrcamentoV4 } from "./orcamento-mensagem";

function proposta(custos = [60, 230]): OrcamentoRapidoFormV4 {
  const form = {
    ...orcamentoRapidoFormVazioV4(), grupoRotulo: "Escolha a tela",
    variantes: custos.map((custo, i) => ({
      ...novaVarianteVaziaV4(), rotulo: `Tela ${i + 1}`, custoV3: custo,
      valor: sugerirPrecoTelaCentavos(reaisParaCentavosV4(custo))! / 100,
    })),
  };
  return definirCortesiaTelaV4(definirCortesiaTelaV4(form, "capinha", true), "pelicula", true);
}

describe("telas → contratos canônicos V3/V4", () => {
  it("kit R$ 5 uma vez, R$ 0 ao cliente, 4 alternativas sem seleção antecipada", () => {
    let form = proposta([60, 230, 701, 1001]);
    const original = JSON.stringify(form);
    form = definirCortesiaTelaV4(definirCortesiaTelaV4(form, "capinha", true), "pelicula", true);
    expect(JSON.stringify(form)).toBe(original);
    const input = buildOrcamentoRapidoInputFromFormV4(form);
    expect(input.itensFixos).toEqual([
      { descricao: "Capinha", valor: 0, kindV3: "brinde", custoV3: 3.5 },
      { descricao: "Película", valor: 0, kindV3: "brinde", custoV3: 1.5 },
    ]);
    const servicos = montarServicosOrcamentoRapidoV3(input, "g");
    expect(servicos).toHaveLength(6);
    expect(servicos.every((s) => s.selecionadaV3 === undefined)).toBe(true);
    expect(previaTotaisOrcamentoRapidoV4(form).custo).toBe(5);
    expect(previaResultadosAlternativasV4(form).map((r) => r.resultadoBrutoCentavos)).toEqual([19500, 22500, 69500, 69570]);
    // Nenhuma despesa automática de mão de obra, garantia, taxa ou tributo.
    expect(input.itensFixos).toHaveLength(2);
    expect(JSON.stringify(form)).toBe(original);
  });

  it("uma cortesia e nenhuma cortesia afetam somente o custo incluído", () => {
    let form = proposta();
    form = definirCortesiaTelaV4(form, "pelicula", false);
    expect(previaResultadosAlternativasV4(form)[0].resultadoBrutoCentavos).toBe(19650);
    form = definirCortesiaTelaV4(form, "capinha", false);
    expect(previaResultadosAlternativasV4(form)[0].resultadoBrutoCentavos).toBe(20000);
  });

  it("reconhece cortesia existente/duplicada pelo prefill sem adicionar outra", () => {
    const form = proposta();
    delete form.itensFixos[0].cortesiaTelaV4;
    expect(definirCortesiaTelaV4(form, "capinha", true).itensFixos).toHaveLength(2);
    form.itensFixos[0].custoV3 = 4.25; // referência editável, custo real informado prevalece
    expect(previaResultadosAlternativasV4(form)[0].resultadoBrutoCentavos).toBe(19425);
  });

  it("seleção canônica continua exclusiva, com kit uma vez depois de cada escolha", () => {
    const input = buildOrcamentoRapidoInputFromFormV4(proposta());
    const base = { pecas: [], servicos: montarServicosOrcamentoRapidoV3(input, "g"), gruposV3: [montarGrupoMetaOrcamentoRapidoV3(input, "g")] };
    expect(validarSelecaoCompletaV3(base)).toContain("Selecione");
    const escolhida = marcarSelecaoVarianteV4(base, "g", base.servicos[3].id);
    expect(validarSelecaoCompletaV3({ ...base, ...escolhida })).toBeNull();
    expect(computeTotaisV3({ ...escolhida, desconto: 0 })).toMatchObject({ total: 460, custo: 235, lucro: 225, faixa: undefined });
    const trocada = marcarSelecaoVarianteV4(escolhida, "g", base.servicos[2].id);
    expect(computeTotaisV3({ ...trocada, desconto: 0 })).toMatchObject({ total: 260, custo: 65, lucro: 195 });
    expect(base.servicos.every((s) => s.selecionadaV3 === undefined)).toBe(true);
  });

  it("custo ausente em uma alternativa não vira zero nem invalida a outra", () => {
    const form = proposta();
    form.variantes[0].custoV3 = 0;
    const previa = previaResultadosAlternativasV4(form);
    expect(previa[0].resultadoBrutoCentavos).toBeNull();
    expect(previa[0].motivo).toContain("Custo não informado");
    expect(previa[1].resultadoBrutoCentavos).toBe(22500);
    form.itensFixos[0].custoV3 = 0;
    expect(previaResultadosAlternativasV4(form).every((r) => r.resultadoBrutoCentavos === null)).toBe(true);
  });

  it("preserva preço manual e garantia; não altera o form ao calcular", () => {
    const form = proposta();
    form.variantes[0].valor = 317.89;
    form.variantes[0].garantiaDias = 120;
    const antes = structuredClone(form);
    expect(previaResultadosAlternativasV4(form)[0].resultadoBrutoCentavos).toBe(25289);
    expect(form).toEqual(antes);
    const input = buildOrcamentoRapidoInputFromFormV4(form);
    expect(input.grupo.variantes[0]).toMatchObject({ valor: 317.89, garantiaDias: 120 });
    expect(input.grupo.variantes[1].garantiaDias).toBeUndefined();
  });

  it("usa centavos também para itens fixos fracionários e resultado negativo", () => {
    const form = proposta();
    form.variantes[0].valor = 60.01;
    form.itensFixos[0].custoV3 = 3.51;
    form.itensFixos[1].custoV3 = 1.52;
    expect(previaResultadosAlternativasV4(form)[0].resultadoBrutoCentavos).toBe(-502);
    form.variantes[0].valor = 60.005;
    expect(previaResultadosAlternativasV4(form)[0].resultadoBrutoCentavos).toBeNull();
  });

  it("projeção e mensagem ao cliente não recebem nenhum dado interno", () => {
    const form = proposta();
    const input = buildOrcamentoRapidoInputFromFormV4(form);
    const os = {
      id: "os-teste", codigo: "OS-TESTE", cliente: { nome: "Cliente teste" },
      equipamento: { marca: "Marca", modelo: "Modelo", defeitoRelatado: "Tela" },
      observacaoInterna: "SEGREDO_INTERNO",
      orcamento: { id: "orc", status: "rascunho", criadoEm: "2026-10-18T15:00:00Z", desconto: 0, pecas: [], servicos: montarServicosOrcamentoRapidoV3(input, "g"), gruposV3: [montarGrupoMetaOrcamentoRapidoV3(input, "g")] },
    } as unknown as OrdemServico;
    const view = montarOrcamentoClienteViewV4(os, { nomeFantasia: "Unidade teste", semFallback: true })!;
    expect(view.itensFixosVisiveis).toEqual([
      { descricao: "Capinha", quantidade: 1, valorCliente: 0, cortesia: true },
      { descricao: "Película", quantidade: 1, valorCliente: 0, cortesia: true },
    ]);
    expect(view.grupos[0].variantes.map((v) => v.totalComOpcao)).toEqual([260, 460]);
    const publico = JSON.stringify(view) + montarMensagemOrcamentoV4(view);
    expect(publico).not.toMatch(/custoV3|custoCentavos|cortesiaTelaV4|resultadoBruto|SEGREDO_INTERNO|lucro|3,50|1,50/);
  });
});
