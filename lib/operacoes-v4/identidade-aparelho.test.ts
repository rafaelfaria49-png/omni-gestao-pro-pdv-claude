import { describe, expect, it } from "vitest";
import type { OrdemServico } from "@/types/os";
import { aplicarIdentidadeNoEquipamentoV4, identidadeAtualV4, resolverIdentidadeAparelhoV4 } from "./identidade-aparelho";

function mkOS(p: Record<string, unknown>): OrdemServico {
  return p as unknown as OrdemServico;
}

describe("identidade canônica do aparelho", () => {
  it("reutiliza marca, modelo e IMEI informados na abertura", () => {
    const id = resolverIdentidadeAparelhoV4(mkOS({
      equipamento: { tipo: "Smartphone", marca: "Samsung", modelo: "S22", numeroSerie: "35ABC" },
    }));
    expect(id.marca.value).toBe("Samsung");
    expect(id.modelo.value).toBe("S22");
    expect(id.imei.value).toBe("35ABC");
    expect(id.marca.informedAtOpening).toBe(true);
    expect(id.modelo.source).toBe("equipamento");
  });

  it("OS legado só com provaEntrada continua legível", () => {
    const atual = identidadeAtualV4(mkOS({
      provaEntradaV3: {
        versao: 1,
        criadoEm: "x",
        identificacao: { modelo: "iPhone 13", imei: "99", serial: "SN1", cor: "preto", operadora: "Vivo" },
      },
    }));
    expect(atual.modelo).toBe("iPhone 13");
    expect(atual.imei).toBe("99");
    expect(atual.serial).toBe("SN1");
    expect(atual.cor).toBe("preto");
    expect(atual.operadora).toBe("Vivo");
  });

  it("equipamento vence a prova quando ambos existem", () => {
    const atual = identidadeAtualV4(mkOS({
      equipamento: { marca: "Samsung", modelo: "S22", numeroSerie: "35ABC" },
      provaEntradaV3: {
        versao: 1,
        criadoEm: "x",
        identificacao: { modelo: "legado", imei: "000" },
      },
    }));
    expect(atual.modelo).toBe("S22");
    expect(atual.imei).toBe("35ABC");
  });

  it("editar modelo/IMEI preserva tipo e marca no cadastro vivo", () => {
    const next = aplicarIdentidadeNoEquipamentoV4(
      { tipo: "Smartphone", marca: "Samsung", modelo: "S21", numeroSerie: "111" },
      { modelo: "S22", imei: "35ABC" },
    );
    expect(next).toMatchObject({ tipo: "Smartphone", marca: "Samsung", modelo: "S22", numeroSerie: "35ABC" });
  });

  it("cor vem de campo próprio (equipamento.cor → prova.cor), nunca de condicaoAparelho (T07/T08)", () => {
    const doEquip = resolverIdentidadeAparelhoV4(mkOS({
      equipamento: { modelo: "S22", cor: "Violeta" },
      provaEntradaV3: {
        versao: 1,
        criadoEm: "x",
        identificacao: { cor: "Preto" },
      },
    }));
    expect(doEquip.cor.value).toBe("Violeta");
    expect(doEquip.cor.source).toBe("equipamento");

    const daProva = resolverIdentidadeAparelhoV4(mkOS({
      equipamento: { modelo: "S22" },
      provaEntradaV3: { versao: 1, criadoEm: "x", identificacao: { cor: "Preto" } },
    }));
    expect(daProva.cor.value).toBe("Preto");
    expect(daProva.cor.source).toBe("prova");
  });

  it("legado ambíguo: condicaoAparelho NÃO vira cor e a nota original não é perdida (T08)", () => {
    const os = mkOS({
      equipamento: { modelo: "S22" },
      problema: { condicaoAparelho: "tela trincada, bordas gastas" },
    });
    const id = resolverIdentidadeAparelhoV4(os);
    expect(id.cor.value).toBe("");
    expect(id.cor.source).toBe("ausente");
    expect((os as unknown as { problema: { condicaoAparelho: string } }).problema.condicaoAparelho)
      .toBe("tela trincada, bordas gastas");
  });
});
