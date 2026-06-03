import { describe, expect, it } from "vitest";
import {
  acaoPrimariaV3,
  KANBAN_PIPELINE_V3,
  podeTransicionarV3,
  projetarStatusV2,
  proximasTransicoesV3,
  statusV3FromOS,
  STATUS_V3_LIST,
  type OperacaoStatusV3,
} from "./status-machine";

// Grafo oficial da Fase 1B (espelho literal do blueprint).
const PERMITIDAS: [OperacaoStatusV3, OperacaoStatusV3][] = [
  ["aberta", "diagnostico"],
  ["diagnostico", "aguardando_aprovacao"],
  ["aguardando_aprovacao", "aprovado"],
  ["aprovado", "aguardando_peca"],
  ["aprovado", "em_execucao"],
  ["aguardando_peca", "em_execucao"],
  ["em_execucao", "pronta"],
  ["pronta", "recebida"],
  ["recebida", "entregue"],
];

describe("máquina de status V3 — transições do blueprint", () => {
  it("permite exatamente as transições oficiais de avanço", () => {
    for (const [from, to] of PERMITIDAS) {
      expect(podeTransicionarV3(from, to).ok, `${from} → ${to}`).toBe(true);
    }
  });

  it("permite cancelar qualquer status não-final", () => {
    for (const s of STATUS_V3_LIST) {
      const esperado = s !== "entregue" && s !== "cancelada";
      expect(podeTransicionarV3(s, "cancelada").ok, `${s} → cancelada`).toBe(esperado);
    }
  });

  it("bloqueia pulos de etapa com motivo amigável", () => {
    const bloqueadas: [OperacaoStatusV3, OperacaoStatusV3][] = [
      ["aberta", "aprovado"],
      ["aberta", "em_execucao"],
      ["diagnostico", "em_execucao"],
      ["aguardando_aprovacao", "em_execucao"],
      ["aprovado", "pronta"],
      ["pronta", "entregue"], // precisa passar por "recebida"
      ["em_execucao", "entregue"],
    ];
    for (const [from, to] of bloqueadas) {
      const v = podeTransicionarV3(from, to);
      expect(v.ok, `${from} → ${to}`).toBe(false);
      expect(v.motivo, `${from} → ${to}`).toBeTruthy();
    }
  });

  it("trata estados finais como imutáveis", () => {
    expect(podeTransicionarV3("entregue", "recebida").ok).toBe(false);
    expect(podeTransicionarV3("entregue", "cancelada").ok).toBe(false);
    expect(podeTransicionarV3("cancelada", "aberta").ok).toBe(false);
  });

  it("não considera transição para o mesmo status", () => {
    expect(podeTransicionarV3("aprovado", "aprovado").ok).toBe(false);
  });

  it("rejeita status fora do domínio", () => {
    expect(podeTransicionarV3("aberta", "foo").ok).toBe(false);
    expect(podeTransicionarV3("bar", "diagnostico").ok).toBe(false);
  });
});

describe("máquina de status V3 — derivações", () => {
  it("proximasTransicoesV3 lista avanços + cancelar (não-final) e nada (final)", () => {
    expect(proximasTransicoesV3("aprovado")).toEqual(["aguardando_peca", "em_execucao", "cancelada"]);
    expect(proximasTransicoesV3("pronta")).toEqual(["recebida", "cancelada"]);
    expect(proximasTransicoesV3("entregue")).toEqual([]);
    expect(proximasTransicoesV3("cancelada")).toEqual([]);
  });

  it("acaoPrimariaV3 aponta o avanço feliz e some nos finais", () => {
    expect(acaoPrimariaV3("aprovado")?.to).toBe("em_execucao");
    expect(acaoPrimariaV3("pronta")?.to).toBe("recebida");
    expect(acaoPrimariaV3("recebida")?.to).toBe("entregue");
    expect(acaoPrimariaV3("entregue")).toBeNull();
    expect(acaoPrimariaV3("cancelada")).toBeNull();
  });

  it("statusV3FromOS prioriza operacaoStatusV3 e cai no status V2 (sem produzir recebida)", () => {
    expect(statusV3FromOS({ operacaoStatusV3: "recebida", status: "pronta" })).toBe("recebida");
    expect(statusV3FromOS({ status: "aprovado" })).toBe("aprovado");
    expect(statusV3FromOS({ operacaoStatus: "pronta", status: "aberta" })).toBe("pronta");
    // "recebida" só existe via campo V3 — nunca derivado do legado.
    expect(statusV3FromOS({ status: "recebida" })).not.toBe("recebida");
  });

  it("projetarStatusV2 mapeia recebida → pronta e mantém o resto", () => {
    expect(projetarStatusV2("recebida")).toBe("pronta");
    expect(projetarStatusV2("aprovado")).toBe("aprovado");
    expect(projetarStatusV2("entregue")).toBe("entregue");
    expect(projetarStatusV2("cancelada")).toBe("cancelada");
  });

  it("o Kanban exibe 9 colunas (todos menos cancelada)", () => {
    expect(KANBAN_PIPELINE_V3).toHaveLength(9);
    expect(KANBAN_PIPELINE_V3).not.toContain("cancelada");
    expect(KANBAN_PIPELINE_V3).toContain("recebida");
  });
});
