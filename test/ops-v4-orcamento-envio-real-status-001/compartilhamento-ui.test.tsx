import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { V4Vals } from "@/components/operacoes-v4-preview/use-v4-preview";
import { OrcamentoEnvioCluster } from "@/components/operacoes-v4-preview/parts/stages/OrcamentoEnvioCluster";
import { montarOrcamentoClienteViewV4 } from "@/lib/operacoes-v4/orcamento-cliente-view";
import type { OrdemServico } from "@/types/os";

const copy = vi.fn();
beforeEach(() => {
  sessionStorage.clear();
  copy.mockReset(); copy.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } });
  vi.spyOn(window, "open").mockReturnValue(null);
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function vals() {
  const os = { id: "os-a", codigo: "ORC-1", cliente: { nome: "Cliente", telefone: "11999990000" }, equipamento: { marca: "Marca", modelo: "Modelo" }, orcamento: { id: "o", status: "rascunho", criadoEm: "2026-10-01", total: 300, desconto: 0, pecas: [], servicos: [{ id: "s", descricao: "Troca de tela", valor: 300, custoV3: 81.23 }] } } as unknown as OrdemServico;
  return {
    recebimentoContextKey: "unidade-a:os-a", os: { telefone: "11999990000" },
    orcamentoClienteView: montarOrcamentoClienteViewV4(os),
    orcamentoEnvio: { estado: "rascunho", rotulo: "Rascunho — envio não registrado" },
    prepararCompartilhamento: vi.fn(async () => ({ tentativaId: "tentativa-a", mensagem: "Mensagem segura" })),
    enviarOrcamentoPorCanal: vi.fn(async () => ({ ok: true })), openDocPrint: vi.fn(),
  } as unknown as V4Vals;
}
const montar = (v = vals()) => ({ v, ...render(<OrcamentoEnvioCluster v={v} />) });
async function preparar() {
  fireEvent.click(screen.getByRole("button", { name: "Preparar compartilhamento" }));
  await screen.findByRole("checkbox", { name: /Declaro que já enviei/ });
}

describe("compartilhamento V4 — gestos sem envio e declaração separada", () => {
  it("pré-visualizar, copiar e abrir WhatsApp não chamam preparação ou confirmação", async () => {
    const { v } = montar();
    fireEvent.click(screen.getByRole("button", { name: "Pré-visualizar mensagem" }));
    fireEvent.click(screen.getByRole("button", { name: "Copiar mensagem" }));
    await waitFor(() => expect(copy).toHaveBeenCalledOnce());
    expect(copy.mock.calls[0][0]).toContain("300,00"); expect(copy.mock.calls[0][0]).not.toMatch(/81,23|custo/);
    fireEvent.click(screen.getByRole("button", { name: "Abrir WhatsApp" }));
    expect(window.open).toHaveBeenCalledWith(expect.stringContaining("https://wa.me/5511999990000"), "_blank", "noopener,noreferrer");
    expect(v.prepararCompartilhamento).not.toHaveBeenCalled(); expect(v.enviarOrcamentoPorCanal).not.toHaveBeenCalled();
    expect(screen.getByText("Rascunho — envio não registrado")).toBeTruthy();
  });
  it("falha de cópia e popup bloqueado nunca registram envio", async () => {
    const { v } = montar(); copy.mockRejectedValue(new Error("negado"));
    fireEvent.click(screen.getByRole("button", { name: "Copiar mensagem" }));
    await screen.findByText(/Não foi possível copiar/);
    fireEvent.click(screen.getByRole("button", { name: "Abrir WhatsApp" }));
    expect(v.enviarOrcamentoPorCanal).not.toHaveBeenCalled();
  });
  it("preparar não confirma; envio manual exige declaração explícita e usa a tentativa preparada", async () => {
    const { v } = montar(); await preparar();
    expect(v.prepararCompartilhamento).toHaveBeenCalledWith("whatsapp"); expect(v.enviarOrcamentoPorCanal).not.toHaveBeenCalled();
    const confirmar = screen.getByRole("button", { name: "Confirmar envio manual" }) as HTMLButtonElement;
    expect(confirmar.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: /Declaro que já enviei/ }));
    fireEvent.click(confirmar);
    await waitFor(() => expect(v.enviarOrcamentoPorCanal).toHaveBeenCalledWith("whatsapp", { tentativaId: "tentativa-a", confirmado: true, modo: "manual" }));
    expect(await screen.findByText(/Envio informado pelo operador\. Entrega e leitura não confirmadas/)).toBeTruthy();
  });
  it("API só é solicitada por clique confirmado e resultado é aceite, sem entrega/leitura", async () => {
    const v = vals(); vi.mocked(v.enviarOrcamentoPorCanal).mockResolvedValue({ ok: true, aceitoApi: true, wamid: "wamid.fixture" });
    montar(v); await preparar();
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole("button", { name: "Enviar pela API oficial" }));
    expect(v.enviarOrcamentoPorCanal).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Enviar pela API oficial" }));
    await screen.findByText(/Envio aceito pela API oficial\. Entrega e leitura não confirmadas/);
    expect(screen.getByText(/Identificador de aceite para conferência: wamid.fixture/)).toBeTruthy();
  });
  it("duplo clique em confirmação só dispara uma action; erro permite retry da mesma chave", async () => {
    const v = vals(); let terminar!: (r: { ok: boolean }) => void;
    vi.mocked(v.enviarOrcamentoPorCanal).mockImplementationOnce(() => new Promise((r) => { terminar = r; }));
    montar(v); await preparar(); fireEvent.click(screen.getByRole("checkbox", { name: /Declaro que já enviei/ }));
    const botao = screen.getByRole("button", { name: "Confirmar envio manual" });
    fireEvent.click(botao); fireEvent.click(botao); expect(v.enviarOrcamentoPorCanal).toHaveBeenCalledOnce();
    terminar({ ok: false }); await screen.findByText("A confirmação não foi registrada.");
    fireEvent.click(botao); await waitFor(() => expect(v.enviarOrcamentoPorCanal).toHaveBeenCalledTimes(2));
    expect(vi.mocked(v.enviarOrcamentoPorCanal).mock.calls[1][1]?.tentativaId).toBe("tentativa-a");
  });
  it("troca de loja/OS descarta declaração e tentativa locais", async () => {
    const { v, rerender } = montar(); await preparar(); fireEvent.click(screen.getByRole("checkbox", { name: /Declaro que já enviei/ }));
    rerender(<OrcamentoEnvioCluster v={{ ...v, recebimentoContextKey: "unidade-b:os-b" }} />);
    expect(screen.queryByRole("button", { name: "Confirmar envio manual" })).toBeNull();
    expect(v.enviarOrcamentoPorCanal).not.toHaveBeenCalled();
  });
  it("API pendente após recarga oferece recuperação e impede novo envio", async () => {
    const v = vals(); v.orcamentoEnvio = { estado: "api_sem_confirmacao", rotulo: "API em conferência", entregaConfirmada: false, ultimo: { id: "t-pendente", canal: "whatsapp", estado: "api_em_andamento" } } as any;
    montar(v); expect((screen.getByRole("button", { name: "Preparar compartilhamento" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Enviar pela API oficial" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Recuperar registro da API" }));
    await waitFor(() => expect(v.enviarOrcamentoPorCanal).toHaveBeenCalledWith("whatsapp", { tentativaId: "t-pendente", confirmado: true, modo: "recuperar_api" }));
  });
  it("recibo retornado após falha permanece disponível depois de remontar, isolado por loja/OS", async () => {
    const v = vals(); vi.mocked(v.enviarOrcamentoPorCanal).mockResolvedValue({ ok: false, aceitoApi: true, pendente: true, wamid: "wamid.recuperavel" });
    const { unmount } = montar(v); await preparar();
    fireEvent.click(screen.getByRole("button", { name: "Enviar pela API oficial" }));
    await screen.findByText(/Identificador de aceite para conferência: wamid.recuperavel/);
    unmount(); const novo = montar(v);
    await screen.findByText(/Identificador de aceite para conferência: wamid.recuperavel/);
    novo.rerender(<OrcamentoEnvioCluster v={{ ...v, recebimentoContextKey: "unidade-b:os-b" }} />);
    expect(screen.queryByText(/wamid.recuperavel/)).toBeNull();
  });
});
