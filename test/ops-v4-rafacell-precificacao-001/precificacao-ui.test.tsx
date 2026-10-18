import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import type { V4Vals } from "@/components/operacoes-v4-preview/use-v4-preview";
import type { OrdemServico } from "@/types/os";

const mocks = vi.hoisted(() => ({ loja: "unidade-a", criar: vi.fn(), marcar: vi.fn(), enviar: vi.fn() }));
vi.mock("@/lib/loja-ativa", () => ({ useLojaAtiva: () => ({ lojaAtivaId: mocks.loja }) }));
vi.mock("@/lib/operacoes-v3/orcamento-rapido-actions", () => ({ criarOrcamentoRapidoV3: mocks.criar }));
vi.mock("@/lib/operacoes-v3/comercial-pre-os-actions", () => ({ marcarOrcamentoPreOsV3: mocks.marcar, atualizarStatusComercialV3: vi.fn() }));
vi.mock("@/lib/operacoes-v3/orcamento-envio-actions", () => ({ enviarOrcamentoPorCanalV3: mocks.enviar }));
vi.mock("@/components/operacoes-v4-preview/parts/atendimento/ClienteAtendimentoSection", () => ({ ClienteAtendimentoSection: () => null }));
vi.mock("@/components/operacoes-v4-preview/parts/atendimento/AparelhoAtendimentoSection", () => ({ AparelhoAtendimentoSection: () => null }));
vi.mock("@/components/operacoes-v4-preview/parts/atendimento/ServicoCatalogLookup", () => ({ ServicoCatalogLookup: () => null }));

import { OrcamentoRapidoModal } from "@/components/operacoes-v4-preview/parts/OrcamentoRapidoModal";
import { OrcamentoClienteDocV4 } from "@/components/operacoes-v4-preview/parts/OrcamentoClienteDocV4";
import { buildOrcamentoRapidoInputFromFormV4, definirCortesiaTelaV4, orcamentoRapidoFormVazioV4 } from "@/lib/operacoes-v4/orcamento-rapido-form";
import { montarOrcamentoClienteViewV4 } from "@/lib/operacoes-v4/orcamento-cliente-view";
import { montarServicosOrcamentoRapidoV3 } from "@/lib/operacoes-v3/orcamento-rapido-model";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loja = "unidade-a";
  mocks.criar.mockResolvedValue({ osId: "os-teste" });
  mocks.marcar.mockResolvedValue({});
});
afterEach(cleanup);

function formInicial() {
  const f = orcamentoRapidoFormVazioV4();
  return {
    ...f, clienteModo: "novo" as const, clienteNovoNome: "Cliente teste", clienteNovoTelefone: "11999990000",
    aparelhoMarca: "Marca", aparelhoModelo: "Modelo", defeitoRelatado: "Tela", grupoRotulo: "Escolha a tela",
    variantes: f.variantes.map((v, i) => ({ ...v, rotulo: `Tela ${i + 1}`, valor: i === 0 ? 500 : 700, custoV3: i === 0 ? 60 : 230 })),
  };
}
function montar(form = formInicial()) {
  const v = { orcamentoRapidoOpen: true, orcamentoRapidoInitialValues: form, closeOrcamentoRapido: vi.fn(), onOrcamentoRapidoCriado: vi.fn() } as unknown as V4Vals;
  return { ...render(<OrcamentoRapidoModal v={v} />), v };
}
function ativar() {
  fireEvent.click(screen.getByRole("checkbox", { name: "Usar sugestão de preço para troca de tela neste orçamento" }));
}

describe("Orçamento Rápido V4 — sugestão revisável e local", () => {
  it("opt-in desligado; sugerir não altera preço manual; aplicação exige clique e continua editável", () => {
    montar();
    expect(screen.queryByRole("button", { name: "Sugerir preço" })).toBeNull();
    ativar();
    fireEvent.click(screen.getAllByRole("button", { name: "Sugerir preço" })[0]);
    expect((screen.getByLabelText("Venda da opção 1") as HTMLInputElement).value).toBe("500");
    expect(screen.getByRole("status").textContent).toMatch(/260,00/);
    fireEvent.click(screen.getByRole("button", { name: "Aplicar sugestão" }));
    expect((screen.getByLabelText("Venda da opção 1") as HTMLInputElement).value).toBe("260");
    fireEvent.change(screen.getByLabelText("Venda da opção 1"), { target: { value: "310.29" } });
    fireEvent.change(screen.getByLabelText("Custo interno da opção 1"), { target: { value: "80" } });
    expect((screen.getByLabelText("Venda da opção 1") as HTMLInputElement).value).toBe("310.29");
    expect(mocks.criar).not.toHaveBeenCalled();
    expect(mocks.enviar).not.toHaveBeenCalled();
  });

  it("trocar o custo invalida uma sugestão pendente; custo ausente não gera preço nem resultado fictício", () => {
    const form = formInicial();
    form.variantes[1].custoV3 = 0;
    montar(form);
    ativar();
    expect((screen.getAllByRole("button", { name: "Sugerir preço" })[1] as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Resultado bruto estimado: indisponível/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Sugerir preço" })[0]);
    fireEvent.change(screen.getByLabelText("Custo interno da opção 1"), { target: { value: "100" } });
    expect(screen.queryByRole("button", { name: "Aplicar sugestão" })).toBeNull();
    expect((screen.getByLabelText("Venda da opção 1") as HTMLInputElement).value).toBe("500");
  });

  it("salva somente preço revisado e duas cortesias fixas; não envia nem seleciona opção", async () => {
    const form = formInicial();
    form.variantes[0].valor = 260;
    montar(form);
    ativar();
    fireEvent.click(screen.getByRole("checkbox", { name: /Capinha de cortesia/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Película de cortesia/ }));
    expect(screen.getByText(/Resultado bruto estimado:.*195,00/)).toBeTruthy();
    expect(screen.getByText(/Resultado bruto estimado:.*465,00/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Salvar rascunho" }));
    await waitFor(() => expect(mocks.marcar).toHaveBeenCalledTimes(1));
    expect(mocks.criar.mock.calls[0][0]).toBe("unidade-a");
    const input = mocks.criar.mock.calls[0][1];
    expect(input.itensFixos).toEqual([
      { descricao: "Capinha", valor: 0, kindV3: "brinde", custoV3: 3.5 },
      { descricao: "Película", valor: 0, kindV3: "brinde", custoV3: 1.5 },
    ]);
    expect(input.grupo.variantes.map((v: { valor: number }) => v.valor)).toEqual([260, 700]);
    expect(JSON.stringify(input)).not.toMatch(/selecionada|precificacaoTela|reserva|maoDeObra/);
    expect(mocks.marcar.mock.calls[0][2].statusComercial).toBe("rascunho");
    expect(mocks.enviar).not.toHaveBeenCalled();
  });

  it("trocar de loja limpa ativação, custos, preços, cortesias e prefill anterior", () => {
    const { rerender, v } = montar();
    ativar();
    fireEvent.click(screen.getByRole("checkbox", { name: /Capinha de cortesia/ }));
    mocks.loja = "unidade-b";
    rerender(<OrcamentoRapidoModal v={v} />);
    expect((screen.getByRole("checkbox", { name: /Usar sugestão de preço/ }) as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByRole("button", { name: "Sugerir preço" })).toBeNull();
    expect((screen.getByLabelText("Venda da opção 1") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Custo interno da opção 1") as HTMLInputElement).value).toBe("");
    expect(screen.queryByDisplayValue("Capinha")).toBeNull();
    expect(mocks.criar).not.toHaveBeenCalled();
  });

  it("fechar e reabrir também desliga a regra; sem loja ativa não permite ativação", () => {
    const { rerender, v } = montar();
    ativar();
    rerender(<OrcamentoRapidoModal v={{ ...v, orcamentoRapidoOpen: false }} />);
    rerender(<OrcamentoRapidoModal v={v} />);
    expect((screen.getByRole("checkbox", { name: /Usar sugestão de preço/ }) as HTMLInputElement).checked).toBe(false);
    mocks.loja = "";
    rerender(<OrcamentoRapidoModal v={v} />);
    expect((screen.getByRole("checkbox", { name: /Usar sugestão de preço/ }) as HTMLInputElement).disabled).toBe(true);
  });

  it("documento usado na impressão/PDF só recebe projeção segura, com brindes grátis", () => {
    const form = definirCortesiaTelaV4(definirCortesiaTelaV4(formInicial(), "capinha", true), "pelicula", true);
    const input = buildOrcamentoRapidoInputFromFormV4(form);
    const os = { codigo: "TESTE", cliente: { nome: "Cliente teste" }, equipamento: { marca: "Marca", modelo: "Modelo" }, orcamento: { id: "orc-teste", status: "rascunho", criadoEm: "2026-10-18T15:00:00Z", desconto: 0, servicos: montarServicosOrcamentoRapidoV3(input, "g"), pecas: [] } } as unknown as OrdemServico;
    const view = montarOrcamentoClienteViewV4(os, { nomeFantasia: "Unidade teste" })!;
    const html = renderToStaticMarkup(<OrcamentoClienteDocV4 doc={view} />);
    expect(html).toMatch(/Capinha/);
    expect(html).toMatch(/Película/);
    expect(html).not.toMatch(/custo|lucro|resultado bruto|3,50|1,50|cortesiaTelaV4/i);
  });
});
