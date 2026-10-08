import { beforeEach, describe, expect, it, vi } from "vitest";
import { novaOSDraftVazioV3, type NovaOSDraftV3, type NovaOSItemV3 } from "./nova-os-model";

const mocks = vi.hoisted(() => ({
  criarOS: vi.fn(),
  resolverCliente: vi.fn(),
  emitirEvento: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "qa-003", name: "Operador QA" } })) }));
vi.mock("@/lib/auth/guard-enterprise", () => ({ requireEnterpriseWith: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/operacoes/assert-active-store", () => ({ assertActiveStoreId: vi.fn() }));
vi.mock("@/components/operacoes/lovable/api/os", () => ({ criarOS: mocks.criarOS }));
vi.mock("./cliente-resolver", () => ({ resolverClienteOperacoesV3: mocks.resolverCliente }));
vi.mock("./event-publisher", () => ({ emitirEventoOperacaoV3: mocks.emitirEvento }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { criarOSEnterpriseV3, criarOSServicoAutorizadoV3 } from "./nova-os-actions";

function servico(id: string, descricao: string, venda: number, custo: number, garantiaDias: number): NovaOSItemV3 {
  return {
    id, categoria: "servico", descricao, quantidade: 1, custoUnitario: custo,
    valorUnitario: venda, kind: "cobrado", baixaEstoque: false, garantiaDias,
  };
}

function draft(itens: NovaOSItemV3[] = [servico("tela", "Troca de tela", 300, 92, 90)]): NovaOSDraftV3 {
  const base = novaOSDraftVazioV3();
  return {
    ...base,
    cliente: { id: "cli-003", nome: "Cliente QA", tipo: "PF" },
    equipamento: { ...base.equipamento, marca: "Samsung", modelo: "Galaxy QA" },
    problema: { defeitoRelatado: "Tela quebrada" },
    recepcao: { ...base.recepcao, origem: "balcao" },
    garantia: { modelo: "tela", label: "Troca de Tela", prazoDias: 90 },
    itens,
    desconto: 0,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolverCliente.mockResolvedValue({ id: "cli-003", nome: "Cliente QA" });
  mocks.criarOS.mockImplementation(async (input: Record<string, unknown>) => ({ ...input, id: "os-003", codigo: "OS-003" }));
});

describe("OPS-V4-FLUXO-CURTO-003 — criação comercial autorizada", () => {
  it("A01–A06/A10: persiste aprovação, orçamento real, autorização auditável e nenhum efeito de execução", async () => {
    const { os } = await criarOSServicoAutorizadoV3("loja-003", draft());
    const salvo = mocks.criarOS.mock.calls[0]?.[0];
    expect(mocks.criarOS).toHaveBeenCalledTimes(1);
    expect(salvo.storeId).toBe("loja-003");
    expect(salvo.status).toBe("aprovado");
    expect(salvo.operacaoStatusV3).toBe("aprovado");
    expect(salvo.orcamento).toMatchObject({ status: "aprovado", total: 300, sintetizado: false });
    expect(salvo.orcamento.respondidoEm).toEqual(expect.any(String));
    expect(salvo.orcamento.enviadoEm).toBeUndefined();
    expect(salvo.orcamento.servicos[0]).toMatchObject({ descricao: "Troca de tela", valor: 300, custoV3: 92, prazoGarantiaDias: 90 });
    expect(salvo.orcamentoVersoesV3).toHaveLength(1);
    expect(salvo.orcamentoVersoesV3[0]).toMatchObject({ status: "aprovado", total: 300, registradoPor: "Operador QA" });
    expect(salvo.autorizacaoComercialV3).toMatchObject({
      autorizada: true, registradaPor: "Operador QA", origem: "balcao",
      escopo: "servicos_da_abertura", total: 300,
    });
    expect(Date.parse(salvo.autorizacaoComercialV3.registradaEm)).not.toBeNaN();
    expect(salvo.valorTotal).toBe(300);
    expect(salvo.garantia).toMatchObject({ ativa: false, prazoDias: 90 });
    expect(salvo.aberturaV3.garantiaPrevista.prazoDias).toBe(90);
    expect(salvo.tecnico).toBeUndefined();
    expect(salvo.entregueEm).toBeUndefined();
    expect(salvo.recebimentos).toBeUndefined();
    expect(mocks.emitirEvento).toHaveBeenCalledTimes(1);
    expect(mocks.emitirEvento.mock.calls[0]?.[0].tipo).toBe("os_criada");
    expect(os.id).toBe("os-003");
  });

  it("A07: dois serviços somam sem perder custo e garantia individuais", async () => {
    await criarOSServicoAutorizadoV3("loja-003", draft([
      servico("tela", "Troca de tela", 300, 92, 90),
      servico("conector", "Troca de conector", 120, 30, 30),
    ]));
    const salvo = mocks.criarOS.mock.calls[0]?.[0];
    expect(salvo.orcamento.total).toBe(420);
    expect(salvo.valorTotal).toBe(420);
    expect(salvo.servicosCatalogo).toHaveLength(2);
    expect(salvo.orcamento.servicos).toEqual([
      expect.objectContaining({ descricao: "Troca de tela", valor: 300, custoV3: 92, prazoGarantiaDias: 90 }),
      expect.objectContaining({ descricao: "Troca de conector", valor: 120, custoV3: 30, prazoGarantiaDias: 30 }),
    ]);
  });

  it("A08/A09: diagnóstico e retorno continuam abertos, sem autorização ou orçamento aprovado", async () => {
    for (const origem of ["balcao", "garantia"] as const) {
      const d = { ...draft([]), recepcao: { ...draft([]).recepcao, origem } };
      await criarOSEnterpriseV3("loja-003", d);
      const salvo = mocks.criarOS.mock.lastCall?.[0];
      expect(salvo.status).toBe("aberta");
      expect(salvo.operacaoStatusV3).toBe("aberta");
      expect(salvo.autorizacaoComercialV3).toBeUndefined();
      expect(salvo.orcamento).toBeUndefined();
    }
  });

  it("rejeita abertura autorizada sem serviço válido antes de resolver cliente ou criar OS", async () => {
    await expect(criarOSServicoAutorizadoV3("loja-003", draft([]))).rejects.toThrow(/serviço autorizado/i);
    expect(mocks.resolverCliente).not.toHaveBeenCalled();
    expect(mocks.criarOS).not.toHaveBeenCalled();
  });
});
