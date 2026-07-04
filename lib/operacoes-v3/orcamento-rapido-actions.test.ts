import { afterEach, describe, expect, it, vi } from "vitest";
import { computeTotaisV3, validarGruposOrcamentoV3, type PecaV3, type ServicoV3 } from "./orcamento-model";
import { montarServicosOrcamentoRapidoV3, type OrcamentoRapidoInputV3 } from "./orcamento-rapido-model";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "u1", name: "Operador Teste" } })) }));
vi.mock("@/lib/auth/guard-enterprise", () => ({ requireEnterpriseWith: vi.fn(async () => ({ ok: true })) }));

type AnyFn = (...args: any[]) => any;

const findFirstMock = vi.fn<AnyFn>();
const updateMock = vi.fn<AnyFn>(async () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    ordemServico: {
      findFirst: (...args: unknown[]) => findFirstMock(...args),
      update: (...args: unknown[]) => updateMock(...args),
    },
  },
}));

const resolverClienteMock = vi.fn<AnyFn>();
vi.mock("./cliente-resolver", () => ({ resolverClienteOperacoesV3: (...args: unknown[]) => resolverClienteMock(...args) }));

let proximoOsId = 1;
const criarOSMock = vi.fn<AnyFn>(async () => {
  const id = `os-${proximoOsId++}`;
  return { os: { id, codigo: `OS-${id}` } };
});
vi.mock("./nova-os-actions", () => ({ criarOSEnterpriseV3: (...args: unknown[]) => criarOSMock(...args) }));

const gerarOrcamentoMock = vi.fn<AnyFn>(async () => ({}));
const salvarOrcamentoMock = vi.fn<AnyFn>(async (_sid: string, _osId: string, input: { servicos: ServicoV3[]; pecas: PecaV3[] }) => {
  // Espelha o comportamento REAL wired (GOAL 024): valida grupos antes de "gravar".
  const erros = validarGruposOrcamentoV3({ pecas: input.pecas, servicos: input.servicos });
  if (erros.length > 0) throw new Error(erros[0]);
  return {};
});
vi.mock("./orcamento-actions", () => ({
  gerarOrcamentoDaOS: (...args: unknown[]) => gerarOrcamentoMock(...args),
  salvarOrcamentoV3: (...args: [string, string, { servicos: ServicoV3[]; pecas: PecaV3[] }]) => salvarOrcamentoMock(...args),
}));

const aplicarTransicaoMock = vi.fn<AnyFn>(async () => ({}));
vi.mock("./status-actions", () => ({ aplicarTransicaoStatusV3: (...args: unknown[]) => aplicarTransicaoMock(...args) }));

import { criarOrcamentoRapidoV3 } from "./orcamento-rapido-actions";

function inputBase(over: Partial<OrcamentoRapidoInputV3> = {}): OrcamentoRapidoInputV3 {
  return {
    cliente: { modo: "novo", nome: "Cliente Teste", telefone: "11999990000" },
    aparelho: { marca: "Marca X", modelo: "Modelo Y" },
    defeitoRelatado: "Tela quebrada",
    grupo: {
      rotulo: "Escolha a tela",
      variantes: [
        { rotulo: "Genérica", valor: 150 },
        { rotulo: "Original", valor: 300, garantiaDias: 90, badge: "Recomendado" },
      ],
    },
    ...over,
  };
}

afterEach(() => {
  vi.clearAllMocks();
  proximoOsId = 1;
});

function mockOrcamentoRow(osId: string, servicos: ServicoV3[] = []) {
  return { id: osId, payload: { id: osId, orcamento: { id: `orc-${osId}`, status: "rascunho", desconto: 0, total: 0, criadoEm: "x", servicos, pecas: [] } } };
}

describe("criarOrcamentoRapidoV3 — happy path", () => {
  it("cria a OS e grava o orçamento com grupo (gruposV3 sempre presente)", async () => {
    resolverClienteMock.mockResolvedValue({ id: "c1", nome: "Cliente Teste", telefone: "11999990000" });
    findFirstMock.mockResolvedValue(mockOrcamentoRow("os-1"));

    const res = await criarOrcamentoRapidoV3("loja-x", inputBase());

    expect(res).toEqual({ osId: "os-1", codigo: "OS-os-1", clienteNome: "Cliente Teste" });
    expect(criarOSMock).toHaveBeenCalledTimes(1);
    expect(gerarOrcamentoMock).toHaveBeenCalledWith("loja-x", "os-1");
    expect(salvarOrcamentoMock).toHaveBeenCalledTimes(1);
    const [, , salvarInput] = salvarOrcamentoMock.mock.calls[0]!;
    expect(salvarInput.servicos.filter((s: ServicoV3) => s.grupoId)).toHaveLength(2);

    // Grava gruposV3 no payload (patch dedicado, único write cru desta action).
    expect(updateMock).toHaveBeenCalledTimes(1);
    const dataGravada = updateMock.mock.calls[0]![0] as { data: { payload: { orcamento: { gruposV3: unknown[] } } } };
    expect(dataGravada.data.payload.orcamento.gruposV3).toEqual([{ id: expect.any(String), rotulo: "Escolha a tela", regra: "escolha_1" }]);

    expect(aplicarTransicaoMock).not.toHaveBeenCalled();
  });

  it("multi-loja: storeId é repassado com trim a todas as chamadas", async () => {
    resolverClienteMock.mockResolvedValue({ id: "c1", nome: "Cliente Teste" });
    findFirstMock.mockResolvedValue(mockOrcamentoRow("os-1"));
    await criarOrcamentoRapidoV3("  loja-y  ", inputBase());
    expect(resolverClienteMock.mock.calls[0]![0]).toBe("loja-y");
    expect(criarOSMock.mock.calls[0]![0]).toBe("loja-y");
    expect(gerarOrcamentoMock).toHaveBeenCalledWith("loja-y", "os-1");
  });

  it("rejeita storeId vazio antes de qualquer I/O", async () => {
    await expect(criarOrcamentoRapidoV3("", inputBase())).rejects.toThrow(/unidade ativa/);
    expect(resolverClienteMock).not.toHaveBeenCalled();
    expect(criarOSMock).not.toHaveBeenCalled();
  });

  it("dois envios sequenciais criam duas OS distintas (sem dedupe no motor — idempotência de UI é responsabilidade da modal)", async () => {
    resolverClienteMock.mockResolvedValue({ id: "c1", nome: "Cliente Teste" });
    findFirstMock.mockResolvedValueOnce(mockOrcamentoRow("os-1")).mockResolvedValueOnce(mockOrcamentoRow("os-2"));
    const r1 = await criarOrcamentoRapidoV3("loja-x", inputBase());
    const r2 = await criarOrcamentoRapidoV3("loja-x", inputBase());
    expect(r1.osId).not.toBe(r2.osId);
    expect(criarOSMock).toHaveBeenCalledTimes(2);
  });
});

describe("criarOrcamentoRapidoV3 — compensação (falha pós-criação cancela pelo caminho seguro)", () => {
  it("grupo com 5 variantes é rejeitado ANTES de criar a OS (validação amigável, sem compensação)", async () => {
    const variantes = [1, 2, 3, 4, 5].map((i) => ({ rotulo: `Opção ${i}`, valor: 10 }));
    await expect(criarOrcamentoRapidoV3("loja-x", inputBase({ grupo: { rotulo: "G", variantes } }))).rejects.toThrow(/no máximo 4/);
    expect(criarOSMock).not.toHaveBeenCalled();
    expect(aplicarTransicaoMock).not.toHaveBeenCalled();
  });

  it("falha ao salvar o orçamento cancela a OS pelo caminho seguro (aplicarTransicaoStatusV3) com motivo automático", async () => {
    resolverClienteMock.mockResolvedValue({ id: "c1", nome: "Cliente Teste" });
    findFirstMock.mockResolvedValue(mockOrcamentoRow("os-1"));
    salvarOrcamentoMock.mockRejectedValueOnce(new Error("Falha simulada ao gravar."));

    await expect(criarOrcamentoRapidoV3("loja-x", inputBase())).rejects.toThrow(/Não foi possível concluir o Orçamento Rápido/);

    expect(aplicarTransicaoMock).toHaveBeenCalledTimes(1);
    const [sidArg, osIdArg, toArg, optsArg] = aplicarTransicaoMock.mock.calls[0]!;
    expect(sidArg).toBe("loja-x");
    expect(osIdArg).toBe("os-1");
    expect(toArg).toBe("cancelada");
    expect((optsArg as { motivo: string }).motivo).toContain("Falha simulada ao gravar.");
    // Nunca grava os grupos depois de uma falha no salvar (nada meio-montado).
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("falha ao gravar os grupos (patch cru não encontra a OS) também compensa", async () => {
    resolverClienteMock.mockResolvedValue({ id: "c1", nome: "Cliente Teste" });
    // `gravarGruposOrcamentoRapidoV3` é o único ponto que lê via `findFirst` nesta
    // action (salvarOrcamentoV3 está mockado acima); simula a leitura falhando.
    findFirstMock.mockResolvedValueOnce(null);
    await expect(criarOrcamentoRapidoV3("loja-x", inputBase())).rejects.toThrow(/Não foi possível concluir o Orçamento Rápido/);
    expect(aplicarTransicaoMock).toHaveBeenCalledTimes(1);
    expect(aplicarTransicaoMock.mock.calls[0]![1]).toBe("os-1");
  });

  it("falha na compensação (aplicarTransicaoStatusV3 rejeita) não mascara o erro original", async () => {
    resolverClienteMock.mockResolvedValue({ id: "c1", nome: "Cliente Teste" });
    findFirstMock.mockResolvedValue(mockOrcamentoRow("os-1"));
    salvarOrcamentoMock.mockRejectedValueOnce(new Error("Falha original."));
    aplicarTransicaoMock.mockRejectedValueOnce(new Error("Compensação também falhou."));

    await expect(criarOrcamentoRapidoV3("loja-x", inputBase())).rejects.toThrow(/Falha original/);
  });
});

// Prova de propriedade cruzada com o GOAL 021 (não redundante — usa o builder
// real deste GOAL, não uma reconstrução manual dos grupos).
describe("criarOrcamentoRapidoV3 — coerência com computeTotaisV3 (GOAL 021)", () => {
  it("os serviços montados produzem faixa {min,max} coerente antes de qualquer seleção", () => {
    const input = inputBase();
    const servicos = montarServicosOrcamentoRapidoV3(input, "g1");
    const totais = computeTotaisV3({ servicos, pecas: [], desconto: 0 });
    expect(totais.faixa).toEqual({ min: 150, max: 300 });
  });
});
