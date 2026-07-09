import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "u1", name: "Operador Teste" } })) }));
vi.mock("@/lib/auth/guard-enterprise", () => ({ requireEnterpriseWith: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/components/operacoes/lovable/api/os", () => ({ gerarOrcamentoDaOS: vi.fn(async () => ({})) }));

type AnyFn = (...args: any[]) => any;
const salvarGarantiaMock = vi.fn<AnyFn>(async () => ({}));
vi.mock("./garantia-actions", () => ({ salvarGarantiaOSV3: (...args: unknown[]) => salvarGarantiaMock(...args) }));

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

import { aprovarOrcamentoV3, corrigirOrcamentoV3, recusarOrcamentoV3, salvarOrcamentoV3 } from "./orcamento-actions";
import { totalCobravelV3, lerPagamentoV3 } from "./payment-model";
import type { OrdemServico } from "@/types/os";

function baseRow(orcamentoOverrides: Record<string, unknown> = {}) {
  return {
    id: "os-1",
    payload: {
      id: "os-1",
      status: "aberta",
      timeline: [],
      orcamento: {
        id: "orc-1",
        status: "enviado",
        desconto: 0,
        total: 0,
        criadoEm: "2026-01-01T00:00:00.000Z",
        servicos: [],
        pecas: [],
        ...orcamentoOverrides,
      },
    },
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("aprovarOrcamentoV3 — GOAL OPS-V4-ORC-APROVACAO-SELECAO-026", () => {
  it("sem grupos: aprova normalmente (regressão N=0, comportamento idêntico ao anterior)", async () => {
    findFirstMock.mockResolvedValue(baseRow({ servicos: [{ id: "s1", descricao: "Serviço", valor: 100 }] }));
    const os = await aprovarOrcamentoV3("loja-x", "os-1");
    expect(os).toBeDefined();
    expect(updateMock).toHaveBeenCalledTimes(1);
    const dataGravada = updateMock.mock.calls[0]![0] as { data: { payload: { orcamento: { status: string; total: number } } } };
    expect(dataGravada.data.payload.orcamento.status).toBe("aprovado");
    expect(dataGravada.data.payload.orcamento.total).toBe(100);
    // Sem variante com garantia → não chama salvarGarantiaOSV3.
    expect(salvarGarantiaMock).not.toHaveBeenCalled();
  });

  it("com grupo e NENHUMA seleção: bloqueia, não grava nada", async () => {
    findFirstMock.mockResolvedValue(
      baseRow({
        servicos: [
          { id: "a", descricao: "A", valor: 100, grupoId: "g1" },
          { id: "b", descricao: "B", valor: 200, grupoId: "g1" },
        ],
        gruposV3: [{ id: "g1", rotulo: "Escolha a tela", regra: "escolha_1" }],
      }),
    );
    await expect(aprovarOrcamentoV3("loja-x", "os-1")).rejects.toThrow(/Selecione uma opção em "Escolha a tela"/);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("com grupo e seleção completa: aprova com total exato (via computeTotaisV3, a linha selecionada) + snapshot na lista de versões", async () => {
    findFirstMock.mockResolvedValue(
      baseRow({
        servicos: [
          { id: "a", descricao: "Genérica", valor: 150, grupoId: "g1", varianteV3: { rotulo: "Genérica" } },
          { id: "b", descricao: "Original", valor: 300, grupoId: "g1", selecionadaV3: true, varianteV3: { rotulo: "Original", garantiaDias: 90 } },
        ],
        gruposV3: [{ id: "g1", rotulo: "Escolha a tela", regra: "escolha_1" }],
      }),
    );
    const os = await aprovarOrcamentoV3("loja-x", "os-1");
    expect(os).toBeDefined();

    const dataGravada = updateMock.mock.calls[0]![0] as {
      data: { payload: { orcamento: { total: number }; orcamentoVersoesV3: Array<{ versao: number; status: string; snapshot: unknown }> } };
    };
    expect(dataGravada.data.payload.orcamento.total).toBe(300); // total EXATO, só a selecionada
    expect(dataGravada.data.payload.orcamentoVersoesV3).toHaveLength(1);
    expect(dataGravada.data.payload.orcamentoVersoesV3[0]!.status).toBe("aprovado");
    expect(dataGravada.data.payload.orcamentoVersoesV3[0]!.snapshot).toBeDefined();

    // Garantia da variante escolhida aplicada via salvarGarantiaOSV3.
    expect(salvarGarantiaMock).toHaveBeenCalledTimes(1);
    const [sidArg, osIdArg, garantiaInput] = salvarGarantiaMock.mock.calls[0]!;
    expect(sidArg).toBe("loja-x");
    expect(osIdArg).toBe("os-1");
    expect(garantiaInput).toEqual({ modeloId: "personalizado", prazoDias: 90, termoCustom: "Garantia da opção aprovada: Original." });
  });

  it("multi-grupo: aplica a MENOR garantia entre as variantes selecionadas", async () => {
    findFirstMock.mockResolvedValue(
      baseRow({
        servicos: [
          { id: "a", descricao: "Tela", valor: 100, grupoId: "g1", selecionadaV3: true, varianteV3: { rotulo: "Tela", garantiaDias: 90 } },
          { id: "b", descricao: "Bateria", valor: 50, grupoId: "g2", selecionadaV3: true, varianteV3: { rotulo: "Bateria", garantiaDias: 30 } },
        ],
        gruposV3: [
          { id: "g1", rotulo: "G1", regra: "escolha_1" },
          { id: "g2", rotulo: "G2", regra: "escolha_1" },
        ],
      }),
    );
    await aprovarOrcamentoV3("loja-x", "os-1");
    const [, , garantiaInput] = salvarGarantiaMock.mock.calls[0]!;
    expect((garantiaInput as { prazoDias: number }).prazoDias).toBe(30);
  });

  it("falha ao aplicar garantia (best-effort) NÃO desfaz a aprovação já gravada", async () => {
    findFirstMock.mockResolvedValue(
      baseRow({
        servicos: [{ id: "a", descricao: "Tela", valor: 100, grupoId: "g1", selecionadaV3: true, varianteV3: { rotulo: "Tela", garantiaDias: 90 } }],
        gruposV3: [{ id: "g1", rotulo: "G1", regra: "escolha_1" }],
      }),
    );
    salvarGarantiaMock.mockRejectedValueOnce(new Error("Falha ao gravar garantia."));
    const os = await aprovarOrcamentoV3("loja-x", "os-1");
    expect(os).toBeDefined();
    expect(updateMock).toHaveBeenCalledTimes(1); // aprovação foi gravada normalmente
  });

  it("rejeita quando o orçamento está em status inválido (aprovado/recusado)", async () => {
    findFirstMock.mockResolvedValue(baseRow({ status: "aprovado" }));
    await expect(aprovarOrcamentoV3("loja-x", "os-1")).rejects.toThrow(/aprovar um orçamento com status/);
  });

  it("multi-loja: storeId repassado com trim", async () => {
    findFirstMock.mockResolvedValue(baseRow());
    await aprovarOrcamentoV3("  loja-y  ", "os-1");
    expect(findFirstMock.mock.calls[0]![0]).toEqual(expect.objectContaining({ where: { id: "os-1", storeId: "loja-y" } }));
  });
});

describe("recusarOrcamentoV3 — GOAL 026 — motivo estruturado", () => {
  it("grava motivo estruturado + observação em metadata", async () => {
    findFirstMock.mockResolvedValue(baseRow());
    await recusarOrcamentoV3("loja-x", "os-1", { motivo: "preco", observacao: "Cliente achou caro" });
    const dataGravada = updateMock.mock.calls[0]![0] as { data: { payload: { timeline: Array<{ conteudo: string; metadata?: Record<string, unknown> }> } } };
    const evento = dataGravada.data.payload.timeline.at(-1)!;
    expect(evento.conteudo).toBe("Orçamento recusado: Preço — Cliente achou caro.");
    expect(evento.metadata).toEqual({ motivo: "preco", observacao: "Cliente achou caro" });
  });

  it("compatibilidade legada: string livre continua funcionando (chamador antigo, hub V3)", async () => {
    findFirstMock.mockResolvedValue(baseRow());
    await recusarOrcamentoV3("loja-x", "os-1", "cliente não aprovou o valor");
    const dataGravada = updateMock.mock.calls[0]![0] as { data: { payload: { timeline: Array<{ conteudo: string; metadata?: Record<string, unknown> }> } } };
    const evento = dataGravada.data.payload.timeline.at(-1)!;
    expect(evento.conteudo).toBe("Orçamento recusado: cliente não aprovou o valor");
  });

  it("sem motivo: mensagem genérica (comportamento de sempre)", async () => {
    findFirstMock.mockResolvedValue(baseRow());
    await recusarOrcamentoV3("loja-x", "os-1");
    const dataGravada = updateMock.mock.calls[0]![0] as { data: { payload: { orcamento: { status: string } } } };
    expect(dataGravada.data.payload.orcamento.status).toBe("recusado");
  });
});

describe("salvarOrcamentoV3 — GOAL 026 — contrato oficial de grupos", () => {
  it("grava gruposV3 quando fornecido", async () => {
    findFirstMock.mockResolvedValue(baseRow());
    const servicos = [{ id: "a", descricao: "A", valor: 10, grupoId: "g1" }];
    await salvarOrcamentoV3("loja-x", "os-1", { servicos, pecas: [], desconto: 0, gruposV3: [{ id: "g1", rotulo: "G", regra: "escolha_1" }] });
    const dataGravada = updateMock.mock.calls[0]![0] as { data: { payload: { orcamento: { gruposV3: unknown[] } } } };
    expect(dataGravada.data.payload.orcamento.gruposV3).toEqual([{ id: "g1", rotulo: "G", regra: "escolha_1" }]);
  });

  it("gruposV3 ausente PRESERVA os grupos já existentes (compat com o editor V4 que não edita grupos)", async () => {
    findFirstMock.mockResolvedValue(
      baseRow({
        servicos: [{ id: "a", descricao: "A", valor: 10, grupoId: "g1" }],
        gruposV3: [{ id: "g1", rotulo: "Já existia", regra: "escolha_1" }],
      }),
    );
    await salvarOrcamentoV3("loja-x", "os-1", { servicos: [{ id: "a", descricao: "A editada", valor: 20, grupoId: "g1" }], pecas: [], desconto: 0 });
    const dataGravada = updateMock.mock.calls[0]![0] as { data: { payload: { orcamento: { gruposV3: unknown[] } } } };
    expect(dataGravada.data.payload.orcamento.gruposV3).toEqual([{ id: "g1", rotulo: "Já existia", regra: "escolha_1" }]);
  });

  it("gruposV3: [] explícito remove todos os grupos", async () => {
    findFirstMock.mockResolvedValue(
      baseRow({ servicos: [{ id: "a", descricao: "A", valor: 10 }], gruposV3: [{ id: "g1", rotulo: "Antigo", regra: "escolha_1" }] }),
    );
    await salvarOrcamentoV3("loja-x", "os-1", { servicos: [{ id: "a", descricao: "A", valor: 10 }], pecas: [], desconto: 0, gruposV3: [] });
    const dataGravada = updateMock.mock.calls[0]![0] as { data: { payload: { orcamento: { gruposV3: unknown[] } } } };
    expect(dataGravada.data.payload.orcamento.gruposV3).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// GOAL OPS-V4-ORCAMENTO-REABRIR-MOTOR-003 — correção de orçamento em OS avançada.
// ---------------------------------------------------------------------------
// `salvarOrcamentoV3` só aceita rascunho/enviado; a UI de revisão (reaberta) da
// V4 chama `corrigirOrcamentoV3` (action separada) para persistir orçamento em OS
// já aprovada/em execução/pronta/recebida/entregue, recalculando o `valorTotal` e
// preservando o status da OS. Não cria CR/venda/estoque — só payload + timeline.
describe("corrigirOrcamentoV3 — GOAL OPS-V4-ORCAMENTO-REABRIR-MOTOR-003", () => {
  function advancedRow(overrides: { operacaoStatusV3?: string; orcamento?: Record<string, unknown> } = {}) {
    return {
      id: "os-1",
      payload: {
        id: "os-1",
        status: "entregue",
        operacaoStatusV3: overrides.operacaoStatusV3 ?? "entregue",
        timeline: [],
        orcamento: {
          id: "orc-1",
          status: "aprovado",
          desconto: 0,
          total: 0,
          criadoEm: "2026-01-01T00:00:00.000Z",
          servicos: [],
          pecas: [],
          ...(overrides.orcamento ?? {}),
        },
      },
    };
  }

  it("salvarOrcamentoV3 (comum) continua rejeitando orçamento aprovado — bloqueio original preservado", async () => {
    findFirstMock.mockResolvedValue(advancedRow({ operacaoStatusV3: "aprovado" }));
    await expect(
      salvarOrcamentoV3("loja-x", "os-1", { servicos: [{ id: "s1", descricao: "Troca de tela", valor: 100 }], pecas: [], desconto: 0 }),
    ).rejects.toThrow(/editar um orçamento com status "aprovado"/);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("permite OS entregue: persiste serviço/valor/custo, recalcula total E valorTotal", async () => {
    findFirstMock.mockResolvedValue(advancedRow({ operacaoStatusV3: "entregue" }));
    const os = await corrigirOrcamentoV3("loja-x", "os-1", {
      servicos: [{ id: "s1", descricao: "Troca de tela", valor: 250, custoV3: 120 }],
      pecas: [],
      desconto: 0,
    });
    expect(os).toBeDefined();
    expect(updateMock).toHaveBeenCalledTimes(1);
    const dataGravada = updateMock.mock.calls[0]![0] as {
      data: { valorTotal: number; payload: { orcamento: { servicos: Array<{ descricao: string; valor: number; custoV3?: number }>; total: number; status: string } } };
    };
    expect(dataGravada.data.payload.orcamento.servicos).toHaveLength(1);
    expect(dataGravada.data.payload.orcamento.servicos[0]!.descricao).toBe("Troca de tela");
    expect(dataGravada.data.payload.orcamento.servicos[0]!.valor).toBe(250);
    expect(dataGravada.data.payload.orcamento.servicos[0]!.custoV3).toBe(120);
    expect(dataGravada.data.payload.orcamento.total).toBe(250); // total do orçamento
    expect(dataGravada.data.valorTotal).toBe(250); // valorTotal da OS recalculado
    expect(dataGravada.data.payload.orcamento.status).toBe("aprovado"); // status do orçamento preservado
  });

  it("preserva o status da OS (não regressa; não toca a coluna Prisma status)", async () => {
    findFirstMock.mockResolvedValue(advancedRow({ operacaoStatusV3: "entregue" }));
    await corrigirOrcamentoV3("loja-x", "os-1", { servicos: [{ id: "s1", descricao: "Troca de tela", valor: 250 }], pecas: [], desconto: 0 });
    const dataGravada = updateMock.mock.calls[0]![0] as { data: { status?: string; payload: { operacaoStatusV3?: string; status?: string } } };
    expect(dataGravada.data.status).toBeUndefined(); // coluna Prisma status não foi tocada
    expect(dataGravada.data.payload.operacaoStatusV3).toBe("entregue"); // status V3 preservado
    expect(dataGravada.data.payload.status).toBe("entregue"); // projeção V2 preservada
  });

  it("rejeita OS cancelada (nenhuma gravação)", async () => {
    findFirstMock.mockResolvedValue(advancedRow({ operacaoStatusV3: "cancelada" }));
    await expect(
      corrigirOrcamentoV3("loja-x", "os-1", { servicos: [{ id: "s1", descricao: "Troca de tela", valor: 100 }], pecas: [], desconto: 0 }),
    ).rejects.toThrow(/OS cancelada/);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejeita OS ainda pré-aprovação (aberta/aguardando_aprovacao) — caminho desses é salvarOrcamentoV3", async () => {
    findFirstMock.mockResolvedValue(advancedRow({ operacaoStatusV3: "aguardando_aprovacao" }));
    await expect(
      corrigirOrcamentoV3("loja-x", "os-1", { servicos: [{ id: "s1", descricao: "Troca de tela", valor: 100 }], pecas: [], desconto: 0 }),
    ).rejects.toThrow(/só vale para OS já aprovada/);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejeita input inválido (grupo acima do limite de linhas)", async () => {
    findFirstMock.mockResolvedValue(advancedRow({ operacaoStatusV3: "entregue" }));
    const servicos = [0, 1, 2, 3, 4].map((i) => ({ id: `s${i}`, descricao: `S${i}`, valor: 10, grupoId: "g1" }));
    await expect(
      corrigirOrcamentoV3("loja-x", "os-1", {
        servicos,
        pecas: [],
        desconto: 0,
        gruposV3: [{ id: "g1", rotulo: "G", regra: "escolha_1" }],
      }),
    ).rejects.toThrow(/máximo permitido/);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejeita orçamento ainda sintetizado (prévia não materializada)", async () => {
    findFirstMock.mockResolvedValue(advancedRow({ operacaoStatusV3: "entregue", orcamento: { sintetizado: true } }));
    await expect(corrigirOrcamentoV3("loja-x", "os-1", { servicos: [], pecas: [], desconto: 0 })).rejects.toThrow(/materializá-lo/);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("registra evento orcamento_aprovado_revisado com total anterior/novo e origem (auditoria)", async () => {
    findFirstMock.mockResolvedValue(advancedRow({ operacaoStatusV3: "entregue", orcamento: { total: 0, servicos: [] } }));
    await corrigirOrcamentoV3("loja-x", "os-1", { servicos: [{ id: "s1", descricao: "Troca de tela", valor: 250 }], pecas: [], desconto: 0 });
    const dataGravada = updateMock.mock.calls[0]![0] as {
      data: { payload: { timeline: Array<{ tipo: string; conteudo: string; metadata?: Record<string, unknown> }> } };
    };
    const evento = dataGravada.data.payload.timeline.at(-1)!;
    expect(evento.tipo).toBe("orcamento_aprovado_revisado");
    expect(evento.conteudo).toContain("corrigido manualmente");
    expect(evento.metadata).toEqual(
      expect.objectContaining({ origem: "operacoes_v4_orcamento_reaberto", totalAnterior: 0, totalNovo: 250, correcaoAvancada: true }),
    );
  });

  it("multi-loja: storeId repassado com trim na cláusula where", async () => {
    findFirstMock.mockResolvedValue(advancedRow({ operacaoStatusV3: "entregue" }));
    await corrigirOrcamentoV3("  loja-y  ", "os-1", { servicos: [{ id: "s1", descricao: "Troca de tela", valor: 100 }], pecas: [], desconto: 0 });
    expect(findFirstMock.mock.calls[0]![0]).toEqual(expect.objectContaining({ where: { id: "os-1", storeId: "loja-y" } }));
  });

  it("pós-correção: totalCobravelV3 > 0 e lerPagamentoV3 passa de sem_cobranca para aberto (OS elegível para recebimento)", () => {
    // Antes da correção: orçamento aprovado vazio → sem cobrança (caso real da OS-2026-00014).
    const osAntes = {
      id: "os-1",
      operacaoStatusV3: "entregue",
      orcamento: { id: "orc-1", status: "aprovado", desconto: 0, total: 0, servicos: [], pecas: [] },
    } as unknown as OrdemServico;
    expect(totalCobravelV3(osAntes)).toBe(0);
    expect(lerPagamentoV3(osAntes).status).toBe("sem_cobranca");

    // Depois da correção: serviço R$ 250 persistido → cobrança pendente, sem criar CR/venda.
    const osDepois = {
      id: "os-1",
      operacaoStatusV3: "entregue",
      orcamento: { id: "orc-1", status: "aprovado", desconto: 0, total: 250, servicos: [{ id: "s1", descricao: "Troca de tela", valor: 250 }], pecas: [] },
    } as unknown as OrdemServico;
    expect(totalCobravelV3(osDepois)).toBe(250);
    const pag = lerPagamentoV3(osDepois);
    expect(pag.total).toBe(250);
    expect(pag.saldo).toBe(250);
    expect(pag.status).toBe("aberto"); // pendente — aparece para recebimento pelos filtros existentes
  });
});
