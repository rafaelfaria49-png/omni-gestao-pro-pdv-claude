import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { OrdemServico } from "@/types/os";
import type { V4Vals } from "@/components/operacoes-v4-preview/use-v4-preview";
import type { OrcamentoEditorV4 } from "@/lib/operacoes-v4/orcamento-form";
import { seedEditorFromOS } from "@/lib/operacoes-v4/orcamento-form";
import { marcarSelecaoVarianteV4 } from "@/lib/operacoes-v4/orcamento-selecao";
import { adaptOrcamento } from "@/components/operacoes-v4-preview/os-adapter";
import { validarSelecaoCompletaV3, type OrcamentoV3 } from "@/lib/operacoes-v3/orcamento-model";

vi.mock("@/lib/loja-ativa", () => ({ useLojaAtiva: () => ({ lojaAtivaId: "qa" }) }));
vi.mock("@/lib/operacoes-v3/comercial-pre-os-actions", () => ({ converterOrcamentoEmOSV3: vi.fn() }));
vi.mock("@/components/operacoes-v4-preview/parts/ProdutoLookupV4", () => ({ ProdutoLookupV4: () => null }));
vi.mock("@/components/operacoes-v4-preview/parts/stages/OrcamentoEnvioCluster", () => ({ OrcamentoEnvioCluster: () => null }));
vi.mock("@/components/operacoes-v4-preview/parts/stages/OrcamentoDuplicarButton", () => ({ OrcamentoDuplicarButton: () => null }));
vi.mock("@/components/operacoes-v4-preview/parts/FormalizarAprovacaoV4", () => ({ FormalizarAprovacaoV4: () => null }));
import { OrcamentoStage } from "@/components/operacoes-v4-preview/parts/stages/OrcamentoStage";
import { converterOrcamentoEmOSV3 } from "@/lib/operacoes-v3/comercial-pre-os-actions";
import { OrcamentoDecisaoCluster } from "@/components/operacoes-v4-preview/parts/stages/OrcamentoDecisaoCluster";

afterEach(cleanup);

describe("RafaCell — decisão após seleção persistida", () => {
  it("não salva, aprova ou abre recebimento enquanto a nova seleção está pendente", async () => {
    let finalizar!: () => void;
    const pendente = new Promise<boolean>(resolve => { finalizar = () => resolve(true); });
    const os = { id: "qa", orcamento: { id: "o", status: "enviado", total: 265, desconto: 0, criadoEm: new Date().toISOString(), gruposV3: [{ id: "g", rotulo: "Escolha", regra: "escolha_1" }], pecas: [], servicos: [{ id: "a", descricao: "Tela atual", valor: 265, grupoId: "g", selecionadaV3: true }, { id: "b", descricao: "Tela outra", valor: 365, grupoId: "g" }] } } as unknown as OrdemServico;
    const salvar = vi.fn(async () => true);
    const v = { realOS: os, orcamento: adaptOrcamento(os), selecionarVarianteOrcamento: vi.fn(() => pendente), aprovarOrcamento: vi.fn(), aprovacaoReceber: { disponivel: true, abrir: vi.fn() } } as unknown as V4Vals;
    render(<OrcamentoDecisaoCluster v={v} guard={{ total: 265, salvarEditor: salvar }} />);
    fireEvent.click(screen.getByRole("radio", { name: /Tela outra/ }));
    const aprovar = screen.getByRole("button", { name: "Salvar e aprovar orçamento" }) as HTMLButtonElement;
    const receber = screen.getByRole("button", { name: "Aprovar e receber" }) as HTMLButtonElement;
    expect(aprovar.disabled).toBe(true);
    expect(receber.disabled).toBe(true);
    fireEvent.click(aprovar); fireEvent.click(receber);
    expect(salvar).not.toHaveBeenCalled();
    expect(v.aprovarOrcamento).not.toHaveBeenCalled();
    expect(v.aprovacaoReceber?.abrir).not.toHaveBeenCalled();
    await act(async () => { finalizar(); await pendente; });
    expect(aprovar.disabled).toBe(false);
  });

  it("converte pela action oficial e relê o detalhe, além da lista, antes de mostrar o mesmo orçamento", async () => {
    vi.mocked(converterOrcamentoEmOSV3).mockResolvedValueOnce({ osId: "qa-os", jaConvertido: false });
    const os = { id: "qa-os", storeId: "qa", status: "aprovado", orcamento: { id: "o", status: "aprovado", total: 265, desconto: 0, criadoEm: new Date().toISOString(), servicos: [{ id: "s", descricao: "Tela", valor: 265, custoV3: 65 }], pecas: [] } } as unknown as OrdemServico;
    const v = { realOS: os, selectedOsId: os.id, osSelected: true, orcamento: adaptOrcamento(os), orcamentoEditavel: false, comercialV4: { tipo: "orcamento_pre_os", statusComercial: "aprovado" }, reloadOrdens: vi.fn(), reloadDetail: vi.fn(), goOrcamento: vi.fn() } as unknown as V4Vals;
    const { container } = render(<OrcamentoStage v={v} />);
    fireEvent.change(container.querySelector("#converter-entrada-dia")!, { target: { value: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()) } });
    fireEvent.click(screen.getByRole("button", { name: "Criar Ordem de Serviço" }));
    await waitFor(() => expect(v.reloadDetail).toHaveBeenCalledOnce());
    expect(v.reloadOrdens).toHaveBeenCalledOnce();
    expect(v.goOrcamento).toHaveBeenCalledOnce();
    expect(converterOrcamentoEmOSV3).toHaveBeenCalledWith("qa", "qa-os", expect.objectContaining({ previsaoEsperada: "", dataEntrada: expect.objectContaining({ iso: expect.any(String) }) }));
  });

  it("aprova a seleção atual sem apagar texto/custo que ainda estão no editor", async () => {
    const saved = vi.fn();
    const approved = vi.fn();
    function Harness() {
      const [os, setOS] = useState({ id: "qa-os", status: "aberta", orcamento: { id: "orc", status: "enviado", total: 265, criadoEm: new Date().toISOString(), desconto: 0, pecas: [], gruposV3: [{ id: "g", rotulo: "Escolha", regra: "escolha_1" }], servicos: [{ id: "s1", descricao: "Tela Premium", valor: 265, custoV3: 65, grupoId: "g", varianteV3: { rotulo: "Premium", garantiaDias: 90 } }, { id: "s2", descricao: "Tela outra", valor: 365, custoV3: 165, grupoId: "g", varianteV3: { rotulo: "Outra", garantiaDias: 30 } }] } } as unknown as OrdemServico);
      const current = useRef(os); current.current = os;
      const v = { realOS: os, osSelected: true, selectedOsId: os.id, orcamentoEditavel: true, orcamentoPodeDecidir: true, orcamento: adaptOrcamento(os), orcamentoEditorSeed: seedEditorFromOS(os),
        selecionarVarianteOrcamento: async (g: string, id: string) => { setOS(p => ({ ...p, orcamento: { ...p.orcamento!, ...marcarSelecaoVarianteV4(p.orcamento as OrcamentoV3, g, id) } })); return true; },
        salvarOrcamento: async (editor: OrcamentoEditorV4) => { saved(editor); const p = { ...current.current, orcamento: { ...current.current.orcamento!, ...editor } } as OrdemServico; current.current = p; setOS(p); return true; },
        aprovarOrcamento: async () => { const orc = current.current.orcamento as OrcamentoV3; if (validarSelecaoCompletaV3(orc)) return false; approved(orc); return true; },
      } as unknown as V4Vals;
      return <OrcamentoStage v={v} />;
    }
    render(<Harness />);
    const approve = screen.getByRole("button", { name: "Salvar e aprovar orçamento" }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    fireEvent.change(screen.getAllByPlaceholderText("Descrição do serviço")[0], { target: { value: "Tela editada localmente" } });
    fireEvent.change(screen.getAllByLabelText("Custo interno do serviço")[0], { target: { value: "66" } });
    fireEvent.click(screen.getByRole("radio", { name: /Tela Premium/ }));
    await waitFor(() => expect(approve.disabled).toBe(false));
    fireEvent.click(approve);
    await waitFor(() => expect(approved).toHaveBeenCalledOnce());
    expect(saved.mock.calls[0][0].servicos[0]).toMatchObject({ descricao: "Tela editada localmente", custoV3: 66, selecionadaV3: true, varianteV3: { garantiaDias: 90 } });
    expect(saved.mock.calls[0][0].servicos[1].selecionadaV3).not.toBe(true);
  });
});
