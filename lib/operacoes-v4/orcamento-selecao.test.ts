import { describe, expect, it } from "vitest";
import { marcarSelecaoVarianteV4 } from "./orcamento-selecao";
import type { PecaV3, ServicoV3 } from "@/lib/operacoes-v3/orcamento-model";

const servico = (over: Partial<ServicoV3>): ServicoV3 => ({ id: "s", descricao: "Serviço", valor: 0, ...over });
const peca = (over: Partial<PecaV3>): PecaV3 => ({ id: "p", nome: "Peça", quantidade: 1, valorUnitario: 0, ...over });

describe("marcarSelecaoVarianteV4", () => {
  it("marca a linha escolhida como selecionada e desmarca as demais do MESMO grupo", () => {
    const orc = {
      servicos: [
        servico({ id: "a", grupoId: "g1", selecionadaV3: true }),
        servico({ id: "b", grupoId: "g1" }),
      ],
      pecas: [] as PecaV3[],
    };
    const r = marcarSelecaoVarianteV4(orc, "g1", "b");
    expect(r.servicos.find((s) => s.id === "a")!.selecionadaV3).toBe(false);
    expect(r.servicos.find((s) => s.id === "b")!.selecionadaV3).toBe(true);
  });

  it("preserva a seleção de OUTROS grupos", () => {
    const orc = {
      servicos: [
        servico({ id: "a", grupoId: "g1" }),
        servico({ id: "b", grupoId: "g1" }),
        servico({ id: "c", grupoId: "g2", selecionadaV3: true }),
        servico({ id: "d", grupoId: "g2" }),
      ],
      pecas: [] as PecaV3[],
    };
    const r = marcarSelecaoVarianteV4(orc, "g1", "a");
    // g2 nunca é tocado por uma marcação em g1 — "c" continua selecionada,
    // "d" continua exatamente como estava (nunca chega a ser marcado false).
    expect(r.servicos.find((s) => s.id === "c")!.selecionadaV3).toBe(true);
    expect(r.servicos.find((s) => s.id === "d")!.selecionadaV3).toBeUndefined();
  });

  it("nunca toca linhas fixas (sem grupoId)", () => {
    const orc = {
      servicos: [servico({ id: "fixo" }), servico({ id: "a", grupoId: "g1" }), servico({ id: "b", grupoId: "g1" })],
      pecas: [] as PecaV3[],
    };
    const r = marcarSelecaoVarianteV4(orc, "g1", "a");
    expect(r.servicos.find((s) => s.id === "fixo")!.selecionadaV3).toBeUndefined();
  });

  it("combina peça + serviço no mesmo grupo", () => {
    const orc = {
      pecas: [peca({ id: "p1", grupoId: "g1" })],
      servicos: [servico({ id: "s1", grupoId: "g1", selecionadaV3: true })],
    };
    const r = marcarSelecaoVarianteV4(orc, "g1", "p1");
    expect(r.pecas.find((p) => p.id === "p1")!.selecionadaV3).toBe(true);
    expect(r.servicos.find((s) => s.id === "s1")!.selecionadaV3).toBe(false);
  });
});
