// OPS-DATAS-ENTRADA-ENTREGA-RETROATIVAS-001 — regras de datas dos fluxos (puras):
// Nova OS, Atendimento rápido, Orçamento, dados básicos e leitura canônica da OS.
import { describe, expect, it } from "vitest";
import { normalizarDatasRecepcaoV3, resolverDatasRecepcaoFormV3, novaOSDraftVazioV3 } from "./nova-os-model";
import {
  camposDatasAtendimentoAgoraV3,
  normalizarDatasAtendimentoRapidoV3,
  resolverDatasAtendimentoFormV3,
} from "./atendimento-rapido-model";
import {
  alterarDataPropostaV3,
  normalizarDatasOrcamentoRapidoV3,
  resolverDatasOrcamentoFormV3,
  validadePadraoDiaV3,
  type CamposDatasOrcamentoV3,
} from "./orcamento-rapido-model";
import {
  campoAgoraV3,
  campoHojeV3,
  campoVazioV3,
  dataRetroativaV3,
  fimDoDiaLojaIsoV3,
  formatarDataOperacionalV3,
  lerDatasOSV3,
  montarDataOperacionalV3,
  rotuloEntradaV3,
  type DataOperacionalV3,
} from "./datas-operacionais-model";
import { montarProximosDadosBasicos } from "@/lib/operacoes-v4/entrada-form";
import { buildNovaOSDraftFromFormV4 } from "@/lib/operacoes-v4/nova-os-draft-from-form";
import type { OrdemServico } from "@/types/os";

const AGORA = new Date("2026-10-04T18:00:00.000Z"); // 04/10/2026 15:00 na loja

function data(dia: string, hora = ""): DataOperacionalV3 {
  const r = montarDataOperacionalV3({ dia, hora });
  if (!r.ok) throw new Error(r.mensagem);
  return r.valor;
}

describe("Nova OS — datas da recepção (D01/D02/D05/D06)", () => {
  it("D01: entrada de ontem e D02: dez dias atrás em outro mês/ano passam; cadastro não entra na regra", () => {
    for (const dia of ["2026-10-03", "2026-09-24", "2025-12-28"]) {
      const r = normalizarDatasRecepcaoV3({ dataEntrada: data(dia).iso, dataEntradaMeta: data(dia).meta }, { entradaObrigatoria: true, agora: AGORA });
      expect(r.ok, dia).toBe(true);
    }
  });

  it("D05: futuro, ISO normalizada pelo Date e previsão antes da entrada são recusadas antes de qualquer efeito", () => {
    const futuro = normalizarDatasRecepcaoV3({ dataEntrada: data("2026-10-05").iso, dataEntradaMeta: data("2026-10-05").meta }, { entradaObrigatoria: true, agora: AGORA });
    expect(!futuro.ok && futuro.erros[0]).toMatchObject({ campo: "dataEntrada" });
    const impossivel = normalizarDatasRecepcaoV3({ dataEntrada: "2026-02-30T15:00:00.000Z" }, { entradaObrigatoria: true, agora: AGORA });
    expect(impossivel.ok).toBe(false);
    const ordem = normalizarDatasRecepcaoV3(
      { dataEntrada: data("2026-09-25").iso, dataEntradaMeta: data("2026-09-25").meta, previsaoEntrega: data("2026-09-24").iso, previsaoEntregaMeta: data("2026-09-24").meta },
      { entradaObrigatoria: true, agora: AGORA },
    );
    expect(!ordem.ok && ordem.erros[0]).toMatchObject({ campo: "previsaoEntrega" });
  });

  it("D06: previsão vazia continua não informada; chamada antiga sem metadata segue aceita", () => {
    const r = normalizarDatasRecepcaoV3({ dataEntrada: novaOSDraftVazioV3(AGORA).recepcao.dataEntrada }, { entradaObrigatoria: true, agora: AGORA });
    expect(r).toMatchObject({ ok: true, previsao: null, entrada: { meta: null } });
  });

  it("orçamento sem aparelho: entrada pode faltar só quando não obrigatória", () => {
    expect(normalizarDatasRecepcaoV3({ dataEntrada: "" }, { entradaObrigatoria: true, agora: AGORA }).ok).toBe(false);
    expect(normalizarDatasRecepcaoV3({ dataEntrada: "" }, { entradaObrigatoria: false, agora: AGORA })).toMatchObject({ ok: true, entrada: null });
  });

  it("formulário → mesmas regras do servidor, com campo e mensagem", () => {
    const ok = resolverDatasRecepcaoFormV3({ entrada: { dia: "2026-09-24", hora: "" }, previsao: campoVazioV3() }, { entradaObrigatoria: true, agora: AGORA });
    expect(ok.erros).toEqual([]);
    expect(ok.entrada).toEqual(data("2026-09-24"));
    const ruim = resolverDatasRecepcaoFormV3({ entrada: { dia: "2026-13-01", hora: "" }, previsao: { dia: "2026-10-10", hora: "25:00" } }, { entradaObrigatoria: true, agora: AGORA });
    expect(ruim.erros.map((e) => e.campo)).toEqual(["dataEntrada", "previsaoEntrega"]);
  });

  it("V4: o formulário leva entrada + precisão ao rascunho canônico; sem campo, mantém o padrão (compatível)", () => {
    const base = { clienteNovo: { nome: "Ana" }, equipamentoTipo: "celular" as const, marca: "Moto", modelo: "G", defeitoRelatado: "x", origem: "balcao" as const };
    const com = buildNovaOSDraftFromFormV4({ ...base, dataEntrada: data("2026-09-24"), previsaoEntrega: data("2026-10-08").iso, previsaoEntregaMeta: data("2026-10-08").meta }, AGORA);
    expect(com.recepcao).toMatchObject({
      dataEntrada: data("2026-09-24").iso,
      dataEntradaMeta: { precisao: "dia", dia: "2026-09-24" },
      previsaoEntrega: data("2026-10-08").iso,
      previsaoEntregaMeta: { precisao: "dia", dia: "2026-10-08" },
    });
    const sem = buildNovaOSDraftFromFormV4(base, AGORA);
    expect(sem.recepcao.dataEntrada).toBe(AGORA.toISOString());
    expect(sem.recepcao.dataEntradaMeta).toBeUndefined();
  });
});

describe("Atendimento rápido — data do serviço ≠ data do pagamento (D11)", () => {
  it("sem datas: agora (comportamento anterior); com datas: validadas e com precisão", () => {
    const padrao = normalizarDatasAtendimentoRapidoV3({}, AGORA);
    expect(padrao).toMatchObject({ ok: true, datas: { informadas: false, entrada: { iso: AGORA.toISOString(), meta: null } } });
    const d = data("2026-09-29");
    const retro = normalizarDatasAtendimentoRapidoV3({ dataEntrada: d.iso, dataEntradaMeta: d.meta, dataConclusao: d.iso, dataConclusaoMeta: d.meta }, AGORA);
    expect(retro).toMatchObject({ ok: true, datas: { informadas: true, conclusao: { iso: d.iso, meta: d.meta } } });
  });

  it("saída antes da entrada e serviço no futuro são recusados", () => {
    const e = data("2026-09-29", "10:00");
    const s = data("2026-09-29", "09:00");
    expect(normalizarDatasAtendimentoRapidoV3({ dataEntrada: e.iso, dataEntradaMeta: e.meta, dataConclusao: s.iso, dataConclusaoMeta: s.meta }, AGORA).ok).toBe(false);
    const f = data("2026-10-06");
    expect(normalizarDatasAtendimentoRapidoV3({ dataConclusao: f.iso, dataConclusaoMeta: f.meta }, AGORA).ok).toBe(false);
  });

  it("formulário compacto: um dia só vira entrada = saída; erro aponta 'dataAtendimento'", () => {
    const campos = { ...camposDatasAtendimentoAgoraV3(AGORA), dataAtendimento: { dia: "2026-09-29", hora: "", horaAutomatica: false } };
    const r = resolverDatasAtendimentoFormV3(campos, AGORA);
    expect(r.erros).toEqual([]);
    expect(r.entrada).toEqual(r.conclusao);
    const futuro = resolverDatasAtendimentoFormV3({ ...campos, dataAtendimento: { dia: "2026-10-09", hora: "", horaAutomatica: false } }, AGORA);
    expect(futuro.erros[0]).toMatchObject({ campo: "dataAtendimento" });
  });

  it("formulário detalhado: saída antes da entrada aponta 'dataConclusao'", () => {
    const r = resolverDatasAtendimentoFormV3(
      {
        ...camposDatasAtendimentoAgoraV3(AGORA),
        detalhar: true,
        dataEntrada: { dia: "2026-09-29", hora: "14:00", horaAutomatica: false },
        dataSaida: { dia: "2026-09-29", hora: "13:00", horaAutomatica: false },
      },
      AGORA,
    );
    expect(r.erros.map((e) => e.campo)).toEqual(["dataConclusao"]);
  });
});

describe("Orçamento — proposta não é entrada física (D08/D09/D10)", () => {
  function campos(over: Partial<CamposDatasOrcamentoV3> = {}): CamposDatasOrcamentoV3 {
    return {
      dataProposta: campoHojeV3(AGORA),
      validoAteDia: validadePadraoDiaV3("2026-10-04"),
      validadeEditada: false,
      aparelhoNaLoja: false,
      dataEntrada: campoAgoraV3(AGORA),
      ...over,
    };
  }

  it("D08: sem 'aparelho na loja' não há entrada; validade padrão = proposta + 7 dias", () => {
    const r = resolverDatasOrcamentoFormV3(campos(), AGORA);
    expect(r.erros).toEqual([]);
    expect(r.datas?.entradaAparelho).toBeNull();
    expect(r.datas?.validoAteDia).toBe("2026-10-11");
  });

  it("D09: com o aparelho na loja, a entrada real vai junto (independente da proposta)", () => {
    const r = resolverDatasOrcamentoFormV3(campos({ aparelhoNaLoja: true, dataEntrada: { dia: "2026-10-02", hora: "11:30", horaAutomatica: false } }), AGORA);
    expect(r.datas?.entradaAparelho).toEqual(data("2026-10-02", "11:30"));
  });

  it("D10: proposta retroativa — a validade acompanha até ser editada; vencida é aceita e fica vencida", () => {
    const retro = alterarDataPropostaV3(campos(), { dia: "2026-09-10", hora: "", horaAutomatica: false });
    expect(retro.validoAteDia).toBe("2026-09-17");
    const editada = alterarDataPropostaV3({ ...retro, validoAteDia: "2026-09-30", validadeEditada: true }, { dia: "2026-09-08", hora: "", horaAutomatica: false });
    expect(editada.validoAteDia).toBe("2026-09-30");
    const n = normalizarDatasOrcamentoRapidoV3({ dataProposta: data("2026-09-10"), validoAteDia: "2026-09-17" }, AGORA);
    expect(n).toMatchObject({ ok: true, datas: { validoAte: fimDoDiaLojaIsoV3("2026-09-17"), validadeDias: 7, entrada: null } });
  });

  it("validade antes da proposta, proposta futura e entrada futura são recusadas", () => {
    expect(resolverDatasOrcamentoFormV3(campos({ validoAteDia: "2026-10-03" }), AGORA).erros[0]).toMatchObject({ campo: "validoAte" });
    expect(resolverDatasOrcamentoFormV3(campos({ dataProposta: { dia: "2026-10-05", hora: "", horaAutomatica: false } }), AGORA).erros[0]).toMatchObject({ campo: "dataProposta" });
    expect(
      resolverDatasOrcamentoFormV3(campos({ aparelhoNaLoja: true, dataEntrada: { dia: "2026-10-07", hora: "", horaAutomatica: false } }), AGORA).erros[0],
    ).toMatchObject({ campo: "dataEntrada" });
  });
});

describe("leitura canônica da OS (lerDatasOSV3) — precedência e legado", () => {
  it("legado sem metadata vale como data/hora registrada; sem aberturaV3 só há cadastro", () => {
    const legado = lerDatasOSV3({ criadoEm: "2026-10-01T12:00:00.000Z", aberturaV3: { versao: 1, recepcao: { dataEntrada: "2026-09-30T13:00:00.000Z" } } });
    expect(legado.entrada).toMatchObject({ origem: "legado", precisao: "data_hora" });
    expect(rotuloEntradaV3(legado.entradaOuCadastro)).toBe("Entrada");
    const v2 = lerDatasOSV3({ criadoEm: "2026-10-01T12:00:00.000Z" });
    expect(v2.entrada).toBeNull();
    expect(rotuloEntradaV3(v2.entradaOuCadastro)).toBe("Cadastro");
  });

  it("orçamento pré-OS antigo (entrada carimbada automaticamente) não vira entrada confirmada", () => {
    const d = lerDatasOSV3({
      criadoEm: "2026-10-01T12:00:00.000Z",
      comercialV4: { tipo: "orcamento_pre_os", statusComercial: "rascunho" },
      aberturaV3: { versao: 1, recepcao: { dataEntrada: "2026-10-01T12:00:00.000Z" } },
    });
    expect(d.entrada).toBeNull();
    expect(d.semEntradaFisica).toBe(true);
  });

  it("prazo interno automático nunca vira previsão combinada", () => {
    const auto = lerDatasOSV3({ aberturaV3: { versao: 1, recepcao: {} }, sla: { prazo: "2026-10-06T12:00:00.000Z", status: "ok" } });
    expect(auto.previsao).toBeNull();
    expect(auto.prazoInterno).toMatchObject({ origem: "automatico" });
    const v2 = lerDatasOSV3({ sla: { prazo: "2026-10-06T12:00:00.000Z", status: "ok" } });
    expect(v2.prazoInterno).toMatchObject({ origem: "sla" });
    const p = data("2026-10-08");
    const informada = lerDatasOSV3({ aberturaV3: { recepcao: { previsaoEntrega: p.iso, previsaoEntregaMeta: p.meta } }, sla: { prazo: p.iso, origemV3: "informada" } });
    expect(informada.previsao?.precisao).toBe("dia");
    expect(informada.prazoInterno).toBeNull();
  });

  it("entrega: entregaV3 > entregueEm > retirada, com a precisão do atendimento rápido quando é ele", () => {
    const d = data("2026-09-29");
    const ar = lerDatasOSV3({ entregueEm: d.iso, atendimentoRapidoV3: { concluidoEm: d.iso, concluidoEmMeta: d.meta, registradoEm: "2026-10-04T18:00:00.000Z" } });
    expect(ar.entrega).toMatchObject({ precisao: "dia", dia: "2026-09-29", origem: "informada" });
    expect(ar.entregaRegistradaEm).toBe("2026-10-04T18:00:00.000Z");
    expect(formatarDataOperacionalV3(ar.entrega)).toBe("29/09/2026");
    expect(dataRetroativaV3(ar.entrega, AGORA)).toBe(true);
  });
});

describe("dados básicos (Entrada V4) — sem fabricar entrada nem materializar o prazo automático", () => {
  const payload = {
    criadoEm: "2026-10-04T17:00:00.000Z",
    equipamento: { defeitoRelatado: "Tela" },
    aberturaV3: { versao: 1, recepcao: { recebidoPor: "Ana", localFisico: "balcao", origem: "balcao" } },
    sla: { prazo: "2026-10-06T17:00:00.000Z", status: "ok", origemV3: "automatico" },
    timeline: [],
  } as unknown as OrdemServico & Record<string, unknown>;
  const input = { defeitoRelatado: "Tela", prioridade: "media", origem: "balcao", recebidoPor: "Ana", localFisico: "balcao", previsaoEntrega: "", observacoes: "" } as const;

  it("salvar outro campo não cria dataEntrada a partir do cadastro nem previsão a partir do SLA", () => {
    const { next } = montarProximosDadosBasicos(payload, { ...input, observacoes: "VIP" }, "Op", { observacoes: "" });
    const recepcao = (next as any).aberturaV3.recepcao;
    expect(recepcao.dataEntrada).toBeUndefined();
    expect(recepcao.previsaoEntrega).toBeUndefined();
    expect((next as any).sla).toEqual(payload.sla);
  });

  it("previsão informada grava precisão e marca o SLA como informado; antes da entrada é recusada", () => {
    const p = data("2026-10-10");
    const { next } = montarProximosDadosBasicos(payload, { ...input, previsaoEntrega: p.iso, previsaoEntregaMeta: p.meta }, "Op", { previsaoEntrega: "" });
    expect((next as any).aberturaV3.recepcao).toMatchObject({ previsaoEntrega: p.iso, previsaoEntregaMeta: p.meta });
    // Só-dia: o SLA espelha a promessa até o FIM do dia (nunca "atrasada" ao meio-dia).
    expect((next as any).sla).toMatchObject({ prazo: fimDoDiaLojaIsoV3("2026-10-10"), origemV3: "informada" });
    const comEntrada = { ...payload, aberturaV3: { versao: 1, recepcao: { dataEntrada: data("2026-10-02").iso, dataEntradaMeta: data("2026-10-02").meta } } } as typeof payload;
    const antes = data("2026-10-01");
    expect(() =>
      montarProximosDadosBasicos(comEntrada, { ...input, previsaoEntrega: antes.iso, previsaoEntregaMeta: antes.meta }, "Op", { previsaoEntrega: "" }),
    ).toThrow(/não pode ser anterior/);
  });
});
