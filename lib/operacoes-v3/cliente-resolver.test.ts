import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/operacoes/lovable/api/clientes", () => ({
  listClientes: vi.fn(),
  criarCliente: vi.fn(),
}));

import { listClientes, criarCliente } from "@/components/operacoes/lovable/api/clientes";
import { CLIENTE_BALCAO_NOME_V3, resolverClienteOperacoesV3 } from "./cliente-resolver";

const listClientesMock = vi.mocked(listClientes);
const criarClienteMock = vi.mocked(criarCliente);

const NOVA_OS_OPTS = { permitirBalcao: false, permitirCamposEstendidos: true };
const ATENDIMENTO_RAPIDO_OPTS = { permitirBalcao: true, permitirCamposEstendidos: false };

afterEach(() => {
  vi.clearAllMocks();
});

describe("resolverClienteOperacoesV3 — modo existente", () => {
  it("Nova OS (permitirCamposEstendidos:true): retorna id/nome/telefone/documento/email como veio, sem tocar o banco", async () => {
    const r = await resolverClienteOperacoesV3(
      "loja-x",
      { modo: "existente", clienteId: "c1", nome: "Ana", telefone: "11999990000", documento: "111.111.111-11", email: "ana@x.com" },
      NOVA_OS_OPTS,
    );
    expect(r).toEqual({ id: "c1", nome: "Ana", telefone: "11999990000", documento: "111.111.111-11", email: "ana@x.com" });
    expect(listClientesMock).not.toHaveBeenCalled();
    expect(criarClienteMock).not.toHaveBeenCalled();
  });

  it("Nova OS: nome vazio no draft (id presente) NÃO ganha fallback — paridade com o comportamento antigo", async () => {
    const r = await resolverClienteOperacoesV3("loja-x", { modo: "existente", clienteId: "c1", nome: "" }, NOVA_OS_OPTS);
    expect(r.nome).toBe("");
  });

  it("Atendimento Rápido (permitirCamposEstendidos:false): documento/email nunca aparecem no retorno mesmo se enviados", async () => {
    const r = await resolverClienteOperacoesV3(
      "loja-x",
      { modo: "existente", clienteId: "c1", nome: "Cliente", telefone: undefined, documento: "999", email: "x@x.com" },
      ATENDIMENTO_RAPIDO_OPTS,
    );
    expect(r).toEqual({ id: "c1", nome: "Cliente", telefone: undefined, documento: undefined, email: undefined });
  });

  it("erro amigável quando clienteId está ausente/vazio", async () => {
    await expect(resolverClienteOperacoesV3("loja-x", { modo: "existente", clienteId: "  " }, NOVA_OS_OPTS)).rejects.toThrow(
      "Selecione o cliente existente.",
    );
  });
});

describe("resolverClienteOperacoesV3 — modo novo", () => {
  it("Nova OS PF: cria com tipo PF e documento (opts habilita campos estendidos)", async () => {
    criarClienteMock.mockResolvedValue({ id: "novo-1", nome: "Bruno", telefone: "11988887777", documento: "222" } as never);
    const r = await resolverClienteOperacoesV3(
      "loja-x",
      { modo: "novo", nome: "Bruno", telefone: "11988887777", documento: "222", tipo: "PF", email: "bruno@x.com" },
      NOVA_OS_OPTS,
    );
    expect(criarClienteMock).toHaveBeenCalledWith("loja-x", { nome: "Bruno", telefone: "11988887777", documento: "222", tipo: "PF" });
    expect(r).toEqual({ id: "novo-1", nome: "Bruno", telefone: "11988887777", documento: "222", email: "bruno@x.com" });
  });

  it("Nova OS PJ: tipo PJ é repassado à criação", async () => {
    criarClienteMock.mockResolvedValue({ id: "novo-2", nome: "Empresa X", telefone: undefined, documento: "33.333.333/0001-33" } as never);
    const r = await resolverClienteOperacoesV3(
      "loja-x",
      { modo: "novo", nome: "Empresa X", documento: "33.333.333/0001-33", tipo: "PJ" },
      NOVA_OS_OPTS,
    );
    expect(criarClienteMock).toHaveBeenCalledWith("loja-x", { nome: "Empresa X", telefone: undefined, documento: "33.333.333/0001-33", tipo: "PJ" });
    expect(r.documento).toBe("33.333.333/0001-33");
  });

  it("Nova OS: quando `criarCliente` não ecoa nome/telefone/documento, cai no fallback do que foi enviado", async () => {
    criarClienteMock.mockResolvedValue({ id: "novo-3", nome: "", telefone: undefined, documento: undefined } as never);
    const r = await resolverClienteOperacoesV3(
      "loja-x",
      { modo: "novo", nome: "Carla", telefone: "11977776666", documento: "444" },
      NOVA_OS_OPTS,
    );
    expect(r).toEqual({ id: "novo-3", nome: "Carla", telefone: "11977776666", documento: "444", email: undefined });
  });

  it("Atendimento Rápido: sempre cria como PF, sem documento (opts desabilita campos estendidos)", async () => {
    criarClienteMock.mockResolvedValue({ id: "novo-4", nome: "Diego", telefone: "11966665555" } as never);
    const r = await resolverClienteOperacoesV3(
      "loja-x",
      { modo: "novo", nome: "Diego", telefone: "11966665555", tipo: "PJ", documento: "999" }, // tipo/documento devem ser ignorados
      ATENDIMENTO_RAPIDO_OPTS,
    );
    expect(criarClienteMock).toHaveBeenCalledWith("loja-x", { nome: "Diego", telefone: "11966665555", documento: undefined, tipo: "PF" });
    expect(r).toEqual({ id: "novo-4", nome: "Diego", telefone: "11966665555", documento: undefined, email: undefined });
  });

  it("erro amigável quando nome está ausente/vazio", async () => {
    await expect(resolverClienteOperacoesV3("loja-x", { modo: "novo", nome: "   " }, NOVA_OS_OPTS)).rejects.toThrow(
      "Informe o nome do cliente.",
    );
    expect(criarClienteMock).not.toHaveBeenCalled();
  });
});

describe("resolverClienteOperacoesV3 — modo balcao (Cliente Balcão singleton)", () => {
  it("reaproveita o Cliente Balcão existente por nome (case-insensitive/trim), sem criar de novo", async () => {
    listClientesMock.mockResolvedValue([{ id: "cb-1", nome: "cliente balcão  ", telefone: undefined } as never]);
    const r = await resolverClienteOperacoesV3("loja-x", { modo: "balcao" }, ATENDIMENTO_RAPIDO_OPTS);
    expect(r).toEqual({ id: "cb-1", nome: "cliente balcão  ", telefone: undefined });
    expect(criarClienteMock).not.toHaveBeenCalled();
  });

  it("cria o Cliente Balcão quando ainda não existe na loja", async () => {
    listClientesMock.mockResolvedValue([]);
    criarClienteMock.mockResolvedValue({ id: "cb-novo", nome: CLIENTE_BALCAO_NOME_V3 } as never);
    const r = await resolverClienteOperacoesV3("loja-x", { modo: "balcao" }, ATENDIMENTO_RAPIDO_OPTS);
    expect(criarClienteMock).toHaveBeenCalledWith("loja-x", { nome: CLIENTE_BALCAO_NOME_V3, tipo: "PF" });
    expect(r).toEqual({ id: "cb-novo", nome: CLIENTE_BALCAO_NOME_V3, telefone: undefined });
  });

  it("Cliente Balcão é isolado por loja: busca sempre com o storeId informado", async () => {
    listClientesMock.mockResolvedValue([]);
    criarClienteMock.mockResolvedValue({ id: "cb-loja-y", nome: CLIENTE_BALCAO_NOME_V3 } as never);
    await resolverClienteOperacoesV3("loja-y", { modo: "balcao" }, ATENDIMENTO_RAPIDO_OPTS);
    expect(listClientesMock).toHaveBeenCalledWith("loja-y");
    expect(criarClienteMock).toHaveBeenCalledWith("loja-y", expect.anything());
  });

  it("erro amigável quando o modo balcao não é permitido (Nova OS)", async () => {
    await expect(resolverClienteOperacoesV3("loja-x", { modo: "balcao" }, NOVA_OS_OPTS)).rejects.toThrow(
      "Cliente balcão não é permitido neste fluxo.",
    );
    expect(listClientesMock).not.toHaveBeenCalled();
  });
});

describe("resolverClienteOperacoesV3 — isolamento por storeId", () => {
  it("modo novo: storeId é repassado para criarCliente sem cross-loja", async () => {
    criarClienteMock.mockResolvedValue({ id: "n1", nome: "X" } as never);
    await resolverClienteOperacoesV3("loja-z", { modo: "novo", nome: "X" }, NOVA_OS_OPTS);
    expect(criarClienteMock).toHaveBeenCalledWith("loja-z", expect.anything());
  });

  it("storeId com espaços é trimado antes de qualquer chamada", async () => {
    listClientesMock.mockResolvedValue([]);
    criarClienteMock.mockResolvedValue({ id: "cb", nome: CLIENTE_BALCAO_NOME_V3 } as never);
    await resolverClienteOperacoesV3("  loja-w  ", { modo: "balcao" }, ATENDIMENTO_RAPIDO_OPTS);
    expect(listClientesMock).toHaveBeenCalledWith("loja-w");
  });
});
