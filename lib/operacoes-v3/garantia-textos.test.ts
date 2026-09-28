import { describe, expect, it } from "vitest";
import { normalizarGarantiaPrevistaV3 } from "./garantia-textos";

describe("G04–G08 — normalização canônica da garantia", () => {
  it("modelos sem cobertura descartam prazo positivo", () => {
    expect(normalizarGarantiaPrevistaV3({ modeloId: "sem_garantia", prazoDias: 90 }).prazoDias).toBe(0);
    expect(normalizarGarantiaPrevistaV3({ modeloId: "oxidacao", prazoDias: 90 }).prazoDias).toBe(0);
  });

  it("modelo coberto com prazo ausente, zero ou inválido usa o padrão do catálogo", () => {
    for (const prazoDias of [undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const garantia = normalizarGarantiaPrevistaV3({ modeloId: "tela", prazoDias });
      expect(garantia.modelo.id).toBe("tela");
      expect(garantia.prazoDias).toBe(90);
    }
  });

  it("edição sem cobertura → cobertura → sem cobertura mantém modelo e prazo coerentes", () => {
    const sem = normalizarGarantiaPrevistaV3({ modeloId: "sem_garantia", prazoDias: 90 });
    const tela = normalizarGarantiaPrevistaV3({ modeloId: "tela", prazoDias: sem.prazoDias });
    const editada = normalizarGarantiaPrevistaV3({ modeloId: tela.modelo.id, prazoDias: 45 });
    const removida = normalizarGarantiaPrevistaV3({ modeloId: "sem_garantia", prazoDias: editada.prazoDias });
    expect([sem.prazoDias, tela.prazoDias, editada.prazoDias, removida.prazoDias]).toEqual([0, 90, 45, 0]);
    expect([tela.modelo.id, editada.modelo.id, removida.modelo.id]).toEqual(["tela", "tela", "sem_garantia"]);
  });

  it("personalizado com cobertura preserva prazo positivo informado", () => {
    expect(normalizarGarantiaPrevistaV3({ modeloId: "personalizado", prazoDias: 60 }).prazoDias).toBe(60);
  });
});
