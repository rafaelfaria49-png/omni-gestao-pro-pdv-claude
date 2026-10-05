import { afterEach, describe, expect, it } from "vitest";
import type { OrdemServico } from "@/types/os";
import { lerSlaV3 } from "./producao-model";
import {
  alterarDiaCampoV3,
  alterarHoraCampoV3,
  ancoraDiaIsoV3,
  campoAgoraV3,
  campoDeDataLidaV3,
  compararDatasOperacionaisV3,
  dataFuturaV3,
  diaNaLojaV3,
  diasAtrasV3,
  fimDoDiaLojaIsoV3,
  formatarDataOperacionalV3,
  formatarDiaDeIsoNaLojaV3,
  isoInstanteValidoV3,
  lerDataOperacionalV3,
  lerDatasOSV3,
  limitarFatoAoAgoraV3,
  prazoSlaDaPrevisaoV3,
  montarDataOperacionalOpcionalV3,
  montarDataOperacionalV3,
  paredeLojaParaIsoV3,
  previsaoVencidaV3,
  somarDiasCivisV3,
  validadeVencidaV3,
  validarDataEntregaV3,
  validarDatasAtendimentoV3,
  validarDatasPropostaV3,
  validarDatasRecepcaoV3,
  validarEntradaDataV3,
  type DataOperacionalLidaV3,
} from "./datas-operacionais-model";

const TZ_ORIGINAL = process.env.TZ;
afterEach(() => {
  if (TZ_ORIGINAL === undefined) delete process.env.TZ;
  else process.env.TZ = TZ_ORIGINAL;
});

function lida(campo: { dia: string; hora: string }): DataOperacionalLidaV3 {
  const r = montarDataOperacionalV3(campo);
  if (!r.ok) throw new Error(r.mensagem);
  const l = lerDataOperacionalV3(r.valor.iso, r.valor.meta);
  if (!l) throw new Error("leitura vazia");
  return l;
}

// 04/10/2026 15:00 na loja (America/Sao_Paulo, UTC-3) = 18:00Z
const AGORA = new Date("2026-10-04T18:00:00.000Z");

describe("montarDataOperacionalV3 — precisão e fuso da loja", () => {
  it("D03: data sem horário vira âncora técnica 12:00 na loja e precisão 'dia'", () => {
    const r = montarDataOperacionalV3({ dia: "2026-09-25", hora: "" });
    expect(r).toEqual({ ok: true, valor: { iso: "2026-09-25T15:00:00.000Z", meta: { precisao: "dia", dia: "2026-09-25" } } });
  });

  it("D04: data com horário converte a parede da loja (UTC-3), não o fuso do navegador", () => {
    for (const tz of ["UTC", "Asia/Tokyo", "America/Los_Angeles", "Pacific/Kiritimati"]) {
      process.env.TZ = tz;
      const r = montarDataOperacionalV3({ dia: "2026-09-25", hora: "09:30" });
      expect(r).toEqual({ ok: true, valor: { iso: "2026-09-25T12:30:00.000Z", meta: { precisao: "data_hora", dia: "2026-09-25" } } });
    }
  });

  it("rejeita datas impossíveis em vez de normalizar (31/02, 30/02, mês 13)", () => {
    for (const dia of ["2026-02-30", "2026-02-31", "2026-13-01", "2026-04-31", "26-01-01", "2026-1-01"]) {
      const r = montarDataOperacionalV3({ dia, hora: "" });
      expect(r.ok, dia).toBe(false);
    }
  });

  it("ano bissexto: 29/02/2024 vale; 29/02/2025 não", () => {
    expect(montarDataOperacionalV3({ dia: "2024-02-29", hora: "10:00" }).ok).toBe(true);
    const r = montarDataOperacionalV3({ dia: "2025-02-29", hora: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codigo).toBe("dia_invalido");
  });

  it("horário inválido e horário inexistente (horário de verão histórico de 2018)", () => {
    expect(montarDataOperacionalV3({ dia: "2026-09-25", hora: "24:00" }).ok).toBe(false);
    expect(montarDataOperacionalV3({ dia: "2026-09-25", hora: "9:5" }).ok).toBe(false);
    // 04/11/2018 00:30 não existiu em São Paulo (relógios pularam 00:00 → 01:00).
    const lacuna = montarDataOperacionalV3({ dia: "2018-11-04", hora: "00:30" });
    expect(lacuna.ok).toBe(false);
    if (!lacuna.ok) expect(lacuna.codigo).toBe("hora_inexistente");
    // 01/12/2018 10:00 era UTC-2 (horário de verão) → 12:00Z, nunca offset fixo -3.
    expect(montarDataOperacionalV3({ dia: "2018-12-01", hora: "10:00" })).toEqual({
      ok: true,
      valor: { iso: "2018-12-01T12:00:00.000Z", meta: { precisao: "data_hora", dia: "2018-12-01" } },
    });
  });

  it("campo opcional vazio = não informado (null), sem inventar hoje", () => {
    expect(montarDataOperacionalOpcionalV3({ dia: "", hora: "" })).toBeNull();
    expect(montarDataOperacionalOpcionalV3({ dia: "", hora: "10:00" })?.ok).toBe(false);
  });
});

describe("viradas de dia, mês e ano no fuso da loja", () => {
  it("23:30 de 30/09 na loja já é 01/10 em UTC, mas o dia continua 30/09", () => {
    const r = montarDataOperacionalV3({ dia: "2026-09-30", hora: "23:30" });
    expect(r.ok && r.valor.iso).toBe("2026-10-01T02:30:00.000Z");
    expect(diaNaLojaV3("2026-10-01T02:30:00.000Z")).toBe("2026-09-30");
  });

  it("31/12 23:59 na loja não vira o ano seguinte na exibição (qualquer fuso de navegador)", () => {
    for (const tz of ["UTC", "Asia/Tokyo"]) {
      process.env.TZ = tz;
      const d = lida({ dia: "2025-12-31", hora: "23:59" });
      expect(d.dia).toBe("2025-12-31");
      expect(formatarDataOperacionalV3(d)).toBe("31/12/2025 23:59");
    }
  });

  it("só-dia nunca mostra a âncora técnica como horário e não retrocede o dia", () => {
    for (const tz of ["UTC", "America/Los_Angeles", "Pacific/Kiritimati"]) {
      process.env.TZ = tz;
      const d = lida({ dia: "2026-01-01", hora: "" });
      expect(formatarDataOperacionalV3(d)).toBe("01/01/2026");
    }
  });

  it("somarDiasCivisV3 atravessa mês, ano e 29/02 sem fuso", () => {
    expect(somarDiasCivisV3("2024-02-28", 1)).toBe("2024-02-29");
    expect(somarDiasCivisV3("2025-02-28", 1)).toBe("2025-03-01");
    expect(somarDiasCivisV3("2025-12-31", 1)).toBe("2026-01-01");
    expect(somarDiasCivisV3("2026-10-04", -10)).toBe("2026-09-24");
  });

  it("fim do dia na loja (validade) e sua exibição no dia certo", () => {
    expect(fimDoDiaLojaIsoV3("2026-10-11")).toBe("2026-10-12T02:59:59.999Z");
    process.env.TZ = "Asia/Tokyo";
    expect(formatarDiaDeIsoNaLojaV3("2026-10-12T02:59:59.999Z")).toBe("11/10/2026");
  });
});

describe("round-trip formulário → gravação → leitura → formulário", () => {
  it("D03/D04: campo volta idêntico (com e sem horário)", () => {
    for (const campo of [{ dia: "2026-09-25", hora: "" }, { dia: "2026-09-25", hora: "07:05" }]) {
      const d = lida(campo);
      expect(d.origem).toBe("informada");
      const volta = campoDeDataLidaV3(d);
      expect({ dia: volta.dia, hora: volta.hora }).toEqual(campo);
      expect(volta.horaAutomatica).toBe(false);
    }
  });

  it("legado sem metadata: data/hora registrada, origem 'legado' (nunca vira 'só dia')", () => {
    const d = lerDataOperacionalV3("2026-09-25T13:45:10.000Z");
    expect(d).toEqual({ iso: "2026-09-25T13:45:10.000Z", precisao: "data_hora", dia: "2026-09-25", origem: "legado" });
  });

  it("metadata incoerente com a ISO é ignorada (não inventa precisão)", () => {
    const d = lerDataOperacionalV3("2026-09-25T13:45:00.000Z", { precisao: "data_hora", dia: "2026-09-24" });
    expect(d?.origem).toBe("legado");
    expect(d?.dia).toBe("2026-09-25");
    expect(lerDataOperacionalV3("", { precisao: "dia", dia: "2026-09-25" })).toBeNull();
    expect(lerDataOperacionalV3("lixo")).toBeNull();
  });

  it("fato dentro da folga do relógio é gravado no 'agora' do servidor; passado e só-dia ficam como estão (R3)", () => {
    const agora = new Date("2026-10-04T18:00:30.000Z"); // 15:00:30 na loja
    const minutoDigitado = montarDataOperacionalV3({ dia: "2026-10-04", hora: "15:03" });
    if (!minutoDigitado.ok) throw new Error(minutoDigitado.mensagem);
    expect(limitarFatoAoAgoraV3(minutoDigitado.valor, agora)).toEqual({ iso: agora.toISOString(), meta: { precisao: "data_hora", dia: "2026-10-04" } });
    const passado = montarDataOperacionalV3({ dia: "2026-10-04", hora: "14:00" });
    if (!passado.ok) throw new Error(passado.mensagem);
    expect(limitarFatoAoAgoraV3(passado.valor, agora)).toEqual(passado.valor);
    const soDia = montarDataOperacionalV3({ dia: "2026-10-04", hora: "" });
    if (!soDia.ok) throw new Error(soDia.mensagem);
    expect(limitarFatoAoAgoraV3(soDia.valor, agora)).toEqual(soDia.valor);
    // Virada de dia dentro da folga: o dia gravado acompanha o horário do servidor.
    const virada = montarDataOperacionalV3({ dia: "2026-10-05", hora: "00:02" });
    if (!virada.ok) throw new Error(virada.mensagem);
    const antesDaMeiaNoite = new Date("2026-10-05T02:59:00.000Z"); // 04/10 23:59 na loja
    expect(limitarFatoAoAgoraV3(virada.valor, antesDaMeiaNoite).meta).toEqual({ precisao: "data_hora", dia: "2026-10-04" });
  });

  it("SLA espelhado de previsão só-dia vale até o FIM do dia; não vira 'prazo interno' nem 'atrasada' ao meio-dia (R2)", () => {
    const prev = montarDataOperacionalV3({ dia: "2026-10-04", hora: "" });
    if (!prev.ok) throw new Error(prev.mensagem);
    expect(prazoSlaDaPrevisaoV3(prev.valor)).toBe("2026-10-05T02:59:59.999Z");
    const comHora = montarDataOperacionalV3({ dia: "2026-10-04", hora: "16:30" });
    if (!comHora.ok) throw new Error(comHora.mensagem);
    expect(prazoSlaDaPrevisaoV3(comHora.valor)).toBe(comHora.valor.iso);
    const os = {
      id: "os-1",
      codigo: "OS-1",
      criadoEm: "2026-10-01T12:00:00.000Z",
      operacaoStatusV3: "em_execucao",
      aberturaV3: { versao: 1, recepcao: { previsaoEntrega: prev.valor.iso, previsaoEntregaMeta: prev.valor.meta } },
      sla: { prazo: prazoSlaDaPrevisaoV3(prev.valor), status: "ok", origemV3: "informada" },
      timeline: [],
    };
    expect(lerDatasOSV3(os).prazoInterno).toBeNull();
    // 15:00 do próprio dia prometido na loja: ainda no prazo (antes era "atrasada" desde 12:00).
    expect(lerSlaV3(os as unknown as OrdemServico, new Date("2026-10-04T18:00:00.000Z")).situacao).not.toBe("atrasada");
    expect(lerSlaV3(os as unknown as OrdemServico, new Date("2026-10-05T03:00:00.000Z")).situacao).toBe("atrasada");
  });

  it("só-dia só vale com a âncora EXATA do dia; ISO alterada por outro caminho vira leitura legada", () => {
    // Âncora de 24/09 = 15:00Z: coerente.
    expect(lerDataOperacionalV3("2026-09-24T15:00:00.000Z", { precisao: "dia", dia: "2026-09-24" })).toEqual({
      iso: "2026-09-24T15:00:00.000Z",
      precisao: "dia",
      dia: "2026-09-24",
      origem: "informada",
    });
    // ISO ancorada em 25/09 com metadata de 24/09: nunca exibe 24/09.
    const outroDia = lerDataOperacionalV3("2026-09-25T15:00:00.000Z", { precisao: "dia", dia: "2026-09-24" });
    expect(outroDia).toMatchObject({ precisao: "data_hora", dia: "2026-09-25", origem: "legado" });
    // Mesmo dia, horário diferente da âncora (ISO regravada sem a metadata): mostra o horário real.
    const mesmoDia = lerDataOperacionalV3("2026-09-24T18:30:00.000Z", { precisao: "dia", dia: "2026-09-24" });
    expect(mesmoDia).toMatchObject({ precisao: "data_hora", dia: "2026-09-24", origem: "legado" });
    expect(formatarDataOperacionalV3(mesmoDia)).toBe("24/09/2026 15:30");
  });
});

describe("validarEntradaDataV3 — validação estrita no servidor", () => {
  it("aceita só-dia com a âncora exata e data/hora coerente", () => {
    const dia = validarEntradaDataV3("2026-09-25T15:00:00.000Z", { precisao: "dia", dia: "2026-09-25" }, "Entrada");
    expect(dia.ok && dia.data.precisao).toBe("dia");
    const dh = validarEntradaDataV3("2026-09-25T12:30:00.000Z", { precisao: "data_hora", dia: "2026-09-25" }, "Entrada");
    expect(dh.ok && dh.data.origem).toBe("informada");
  });

  it("recusa âncora divergente, dia divergente, ISO normalizada pelo Date e formato solto", () => {
    expect(validarEntradaDataV3("2026-09-25T10:00:00.000Z", { precisao: "dia", dia: "2026-09-25" }, "Entrada").ok).toBe(false);
    expect(validarEntradaDataV3("2026-09-25T12:30:00.000Z", { precisao: "data_hora", dia: "2026-09-26" }, "Entrada").ok).toBe(false);
    expect(validarEntradaDataV3("2026-02-30T12:00:00.000Z", null, "Entrada").ok).toBe(false);
    expect(validarEntradaDataV3("2026-10-05T14:00", null, "Entrada").ok).toBe(false);
    expect(validarEntradaDataV3("2026-09-25T12:30:00.000Z", { precisao: "hora", dia: "2026-09-25" }, "Entrada").ok).toBe(false);
    expect(isoInstanteValidoV3("2026-09-25T12:30:00Z")).toBe(true);
  });

  it("chamada antiga sem metadata continua aceita como data/hora", () => {
    const r = validarEntradaDataV3("2026-09-25T12:30:00.000Z", undefined, "Entrada");
    expect(r.ok && r.data.origem).toBe("legado");
    expect(r.ok && r.meta).toBeNull();
  });
});

describe("cronologia respeitando a precisão", () => {
  it("só-dia × data/hora no mesmo dia não gera erro falso pela âncora 12:00", () => {
    const entradaManha = lida({ dia: "2026-09-25", hora: "08:00" });
    const entregaSoDia = lida({ dia: "2026-09-25", hora: "" });
    expect(compararDatasOperacionaisV3(entregaSoDia, entradaManha)).toBe(0);
    const entradaNoite = lida({ dia: "2026-09-25", hora: "18:00" });
    expect(compararDatasOperacionaisV3(entregaSoDia, entradaNoite)).toBe(0);
  });

  it("duas data/hora comparam instantes", () => {
    expect(compararDatasOperacionaisV3(lida({ dia: "2026-09-25", hora: "10:00" }), lida({ dia: "2026-09-25", hora: "10:01" }))).toBe(-1);
  });

  it("fato futuro: hoje só-dia não é futuro; amanhã é; folga de relógio de 5 min", () => {
    expect(dataFuturaV3(lida({ dia: "2026-10-04", hora: "" }), AGORA)).toBe(false);
    expect(dataFuturaV3(lida({ dia: "2026-10-05", hora: "" }), AGORA)).toBe(true);
    expect(dataFuturaV3(lida({ dia: "2026-10-04", hora: "15:03" }), AGORA)).toBe(false);
    expect(dataFuturaV3(lida({ dia: "2026-10-04", hora: "15:10" }), AGORA)).toBe(true);
  });

  it("previsão vencida e dias atrás", () => {
    expect(previsaoVencidaV3(lida({ dia: "2026-09-28", hora: "" }), AGORA)).toBe(true);
    expect(previsaoVencidaV3(lida({ dia: "2026-10-04", hora: "" }), AGORA)).toBe(false);
    expect(diasAtrasV3(lida({ dia: "2026-09-24", hora: "" }), AGORA)).toBe(10);
  });
});

describe("campo do formulário — horário automático nunca vira hora histórica", () => {
  it("trocar o dia descarta o horário automático da abertura", () => {
    const inicial = campoAgoraV3(AGORA);
    expect(inicial).toEqual({ dia: "2026-10-04", hora: "15:00", horaAutomatica: true });
    expect(alterarDiaCampoV3(inicial, "2026-09-24")).toEqual({ dia: "2026-09-24", hora: "", horaAutomatica: false });
  });

  it("horário digitado pelo operador é preservado ao trocar o dia", () => {
    const digitado = alterarHoraCampoV3(campoAgoraV3(AGORA), "09:15");
    expect(alterarDiaCampoV3(digitado, "2026-09-24")).toEqual({ dia: "2026-09-24", hora: "09:15", horaAutomatica: false });
  });
});

describe("regras de validação (servidor e formulário)", () => {
  it("D01/D02: entrada de ontem e de 10 dias atrás (outro mês) passam, sem limite arbitrário", () => {
    for (const dia of ["2026-10-03", "2026-09-24", "2025-12-20", "2019-01-02"]) {
      expect(validarDatasRecepcaoV3({ entrada: lida({ dia, hora: "" }), previsao: null, entradaObrigatoria: true }, AGORA)).toEqual([]);
    }
  });

  it("D05: entrada no futuro e previsão antes da entrada são recusadas com o campo certo", () => {
    const erros = validarDatasRecepcaoV3(
      { entrada: lida({ dia: "2026-10-06", hora: "" }), previsao: lida({ dia: "2026-10-05", hora: "" }), entradaObrigatoria: true },
      AGORA,
    );
    expect(erros.map((e) => e.campo)).toEqual(["dataEntrada", "previsaoEntrega"]);
    expect(erros[0]!.mensagem).toMatch(/não pode ficar no futuro/);
  });

  it("D06/D07: previsão vazia é válida; previsão vencida não é erro (só aviso)", () => {
    expect(validarDatasRecepcaoV3({ entrada: lida({ dia: "2026-09-25", hora: "" }), previsao: null, entradaObrigatoria: true }, AGORA)).toEqual([]);
    expect(
      validarDatasRecepcaoV3(
        { entrada: lida({ dia: "2026-09-25", hora: "" }), previsao: lida({ dia: "2026-09-28", hora: "" }), entradaObrigatoria: true },
        AGORA,
      ),
    ).toEqual([]);
  });

  it("entrada obrigatória ausente vs orçamento sem aparelho na loja", () => {
    expect(validarDatasRecepcaoV3({ entrada: null, previsao: null, entradaObrigatoria: true }, AGORA)[0]?.campo).toBe("dataEntrada");
    expect(validarDatasRecepcaoV3({ entrada: null, previsao: null, entradaObrigatoria: false }, AGORA)).toEqual([]);
  });

  it("atendimento: saída antes da entrada é recusada; mesmo instante é válido", () => {
    const entrada = lida({ dia: "2026-09-25", hora: "10:00" });
    expect(validarDatasAtendimentoV3({ entrada, conclusao: lida({ dia: "2026-09-25", hora: "09:59" }) }, AGORA)[0]?.campo).toBe("dataConclusao");
    expect(validarDatasAtendimentoV3({ entrada, conclusao: entrada }, AGORA)).toEqual([]);
  });

  it("entrega: não antes da entrada, igual vale, futuro não", () => {
    const entrada = lida({ dia: "2026-09-25", hora: "14:00" });
    expect(validarDataEntregaV3({ entrega: lida({ dia: "2026-09-24", hora: "" }), entrada }, AGORA)[0]?.campo).toBe("dataEntrega");
    expect(validarDataEntregaV3({ entrega: lida({ dia: "2026-09-25", hora: "" }), entrada }, AGORA)).toEqual([]);
    expect(validarDataEntregaV3({ entrega: lida({ dia: "2026-10-05", hora: "" }), entrada }, AGORA)[0]?.mensagem).toMatch(/futuro/);
    expect(validarDataEntregaV3({ entrega: lida({ dia: "2026-09-29", hora: "" }), entrada: null }, AGORA)).toEqual([]);
  });

  it("proposta: validade antes da data do orçamento é erro; validade vencida é aceita (sem prorrogar)", () => {
    const proposta = lida({ dia: "2026-09-10", hora: "" });
    expect(validarDatasPropostaV3({ proposta, validoAteDia: "2026-09-09" }, AGORA)[0]?.campo).toBe("validoAte");
    expect(validarDatasPropostaV3({ proposta, validoAteDia: "2026-09-17" }, AGORA)).toEqual([]);
    expect(validadeVencidaV3("2026-09-17", AGORA)).toBe(true);
    expect(validarDatasPropostaV3({ proposta, validoAteDia: "2026-02-30" }, AGORA)[0]?.mensagem).toMatch(/inválida/);
    expect(validarDatasPropostaV3({ proposta: lida({ dia: "2026-10-05", hora: "" }), validoAteDia: "2026-10-12" }, AGORA)[0]?.campo).toBe("dataProposta");
  });
});

describe("conversões auxiliares", () => {
  it("paredeLojaParaIsoV3 recusa entradas soltas", () => {
    expect(paredeLojaParaIsoV3("2026-09-25", "")).toBe("");
    expect(paredeLojaParaIsoV3("", "10:00")).toBe("");
    expect(ancoraDiaIsoV3("2026-09-25")).toBe("2026-09-25T15:00:00.000Z");
  });
});
