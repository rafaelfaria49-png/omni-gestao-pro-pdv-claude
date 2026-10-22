import { describe, expect, it } from "vitest";
import { buildOrcamentoRapidoInputFromFormV4, definirCortesiaTelaV4, novaVarianteVaziaV4, orcamentoRapidoFormVazioV4, previaResultadosAlternativasV4, previaTotaisOrcamentoRapidoV4, validarOrcamentoRapidoFormV4 } from "./orcamento-rapido-form";
import { montarServicosOrcamentoRapidoV3, validarOrcamentoRapidoInputV3 } from "@/lib/operacoes-v3/orcamento-rapido-model";
import { computeTotaisV3, validarGruposOrcamentoV3, validarSelecaoCompletaV3 } from "@/lib/operacoes-v3/orcamento-model";
import { padroesGarantiaServicosV3 } from "@/lib/operacoes-v3/garantia-servicos-model";
import { montarOrcamentoClienteViewV4 } from "./orcamento-cliente-view";
import { montarMensagemOrcamentoV4 } from "./orcamento-mensagem";
import type { OrdemServico } from "@/types/os";
import type { OrcamentoRapidoFormV4 } from "./orcamento-rapido-form";

function form(n: number) {
  let f: OrcamentoRapidoFormV4 = { ...orcamentoRapidoFormVazioV4(), clienteExistente: { id: "qa", nome: "Cliente fictício" }, aparelhoMarca: "QA", aparelhoModelo: "QA", defeitoRelatado: "Tela", grupoRotulo: n > 1 ? "Escolha" : "", variantes: Array.from({ length: n }, (_, i) => ({ ...novaVarianteVaziaV4(), rotulo: `Tela ${i}`, valor: 265 + i * 100, custoV3: 65 + i * 50, garantiaDias: 90 + i })) };
  f = definirCortesiaTelaV4(f, "capinha", true);
  f = definirCortesiaTelaV4(f, "pelicula", true);
  return f;
}

describe("RafaCell — uma a quatro opções no motor canônico", () => {
  it("uma opção vira serviço sem grupo; preserva custo, preço, garantia e kit uma vez", () => {
    const f = form(1);
    expect(validarOrcamentoRapidoFormV4(f)).toBeNull();
    const input = buildOrcamentoRapidoInputFromFormV4(f);
    expect(validarOrcamentoRapidoInputV3(input)).toBeNull();
    const servicos = montarServicosOrcamentoRapidoV3(input, "grupo");
    expect(servicos).toHaveLength(3);
    expect(servicos.every(s => !s.grupoId)).toBe(true);
    expect(servicos.find(s => s.descricao === "Tela 0")).toMatchObject({ valor: 265, custoV3: 65, varianteV3: { garantiaDias: 90 } });
    expect(validarGruposOrcamentoV3({ servicos, pecas: [] })).toEqual([]);
    expect(validarSelecaoCompletaV3({ servicos, pecas: [], gruposV3: [] })).toBeNull();
    expect(computeTotaisV3({ servicos, pecas: [], desconto: 0 })).toMatchObject({ total: 265, custo: 70, lucro: 195 });
    expect(previaTotaisOrcamentoRapidoV4(f)).toMatchObject({ total: 265, custo: 70, lucro: 195 });
    expect(previaResultadosAlternativasV4(f)[0].resultadoBrutoCentavos).toBe(19500);
    expect(padroesGarantiaServicosV3({ orcamento: { status: "aprovado", servicos, pecas: [] } }).find(c => c.descricao === "Tela 0")?.prazoDias).toBe(90);
    const view = montarOrcamentoClienteViewV4({ orcamento: { status: "rascunho", servicos, pecas: [], desconto: 0 } } as unknown as OrdemServico)!;
    expect(view.grupos).toEqual([]);
    const mensagem = montarMensagemOrcamentoV4(view);
    expect(mensagem).toMatch(/Garantia de 90 dias/);
    expect(mensagem).not.toMatch(/custo|lucro|(?<!\d)(?:65,00|3,50|1,50)/i);
  });

  it.each([2, 3, 4])("%i opções preservam grupo e exigem escolha expressa", n => {
    const input = buildOrcamentoRapidoInputFromFormV4(form(n));
    expect(validarOrcamentoRapidoInputV3(input)).toBeNull();
    const servicos = montarServicosOrcamentoRapidoV3(input, "grupo");
    const orc = { servicos, pecas: [], desconto: 0, gruposV3: [{ id: "grupo", rotulo: "Escolha", regra: "escolha_1" as const }] };
    expect(validarGruposOrcamentoV3(orc)).toEqual([]);
    expect(validarSelecaoCompletaV3(orc)).toMatch(/Selecione/);
    expect(servicos.filter(s => s.grupoId)).toHaveLength(n);
    expect(servicos.some(s => s.selecionadaV3)).toBe(false);
    servicos.find(s => s.grupoId)!.selecionadaV3 = true;
    expect(validarSelecaoCompletaV3(orc)).toBeNull();
    expect(computeTotaisV3(orc)).toMatchObject({ total: 265, custo: 70, lucro: 195 });
  });

  it("zero opções continua inválido mesmo com brindes", () => {
    const f = form(0);
    expect(validarOrcamentoRapidoFormV4(f)).not.toBeNull();
    expect(validarOrcamentoRapidoInputV3(buildOrcamentoRapidoInputFromFormV4(f))).not.toBeNull();
  });
});
