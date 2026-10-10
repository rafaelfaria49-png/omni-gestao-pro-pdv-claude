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
// GOAL OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-002 (item B): título lido pelo `gerarOrcamentoDaOS`.
const tituloMock = vi.fn<AnyFn>(async () => null);
// Ordem das chamadas no `tx`: prova que a trava (`FOR UPDATE`) vem ANTES da leitura gravada.
const ordemTx: string[] = [];
let emTransacao = false;
vi.mock("@/lib/prisma", () => {
  const prismaTx: Record<string, unknown> = {
    ordemServico: {
      findFirst: (...args: unknown[]) => {
        ordemTx.push("findFirst");
        return findFirstMock(...args);
      },
      update: (...args: unknown[]) => {
        ordemTx.push("update");
        return updateMock(...args);
      },
    },
    contaReceberTitulo: {
      findUnique: (...args: unknown[]) => {
        ordemTx.push("titulo");
        return tituloMock(...args);
      },
    },
  };
  prismaTx.$transaction = async (fn: (tx: unknown) => unknown) => {
    emTransacao = true;
    try {
      return await fn(prismaTx);
    } finally {
      emTransacao = false;
    }
  };
  prismaTx.$queryRaw = async (strings: TemplateStringsArray) => {
    if (strings.join("?").includes("pg_advisory_xact_lock")) {
      ordemTx.push("advisory");
      return [{ lock: "" }];
    }
    ordemTx.push("forUpdate");
    return [{ id: "os-travada" }];
  };
  return { prisma: prismaTx };
});

import {
  aprovarOrcamentoParaReceberV3,
  aprovarOrcamentoV3,
  corrigirOrcamentoV3,
  gerarOrcamentoDaOS,
  recusarOrcamentoV3,
  salvarOrcamentoV3,
} from "./orcamento-actions";
import { requireEnterpriseWith } from "@/lib/auth/guard-enterprise";
import { totalCobravelV3, lerPagamentoV3, localKeyContaReceberOSV3 } from "./payment-model";
import { gerarOrcamentoDaOS as materializarImpl } from "@/components/operacoes/lovable/api/os";
import type { OrdemServico } from "@/types/os";

describe("gerarOrcamentoDaOS — GOAL OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-002 (item B)", () => {
  const impl = vi.mocked(materializarImpl);
  const titulo = (historico: unknown, status = "pago") => ({ id: "cr-1", storeId: "loja-1", localKey: localKeyContaReceberOSV3("loja-1", "os-1"), valor: 420, status, payload: { ordemServicoId: "os-1", historico } });
  afterEach(() => {
    tituloMock.mockReset();
    tituloMock.mockResolvedValue(null);
    impl.mockClear();
    ordemTx.length = 0;
  });

  it("OS com pagamento vigente: recusa e orienta à formalização; nada é materializado", async () => {
    tituloMock.mockResolvedValue(titulo([{ tipo: "liquidacao", valor: 420, loteId: "op-1" }]));
    await expect(gerarOrcamentoDaOS("loja-1", "os-1")).rejects.toThrow(/já tem pagamento registrado[\s\S]*Formalizar aprovação pendente/);
    expect(impl).not.toHaveBeenCalled();
    expect(ordemTx).toEqual(["advisory", "titulo"]);
  });

  it("pagamento parcial também é pagamento vigente", async () => {
    tituloMock.mockResolvedValue(titulo([{ tipo: "pagamento", valor: 100, loteId: "op-1" }], "parcial"));
    await expect(gerarOrcamentoDaOS("loja-1", "os-1")).rejects.toThrow(/já tem pagamento registrado/);
    expect(impl).not.toHaveBeenCalled();
  });

  it("histórico ilegível: recusa (não comprova ausência de pagamento), nada materializado", async () => {
    tituloMock.mockResolvedValue(titulo([{ tipo: "pagamento", valor: "abc" }]));
    await expect(gerarOrcamentoDaOS("loja-1", "os-1")).rejects.toThrow(/Não foi possível conferir os pagamentos/);
    expect(impl).not.toHaveBeenCalled();
  });

  it("sem título, ou com pagamento estornado por inteiro: materializa DENTRO da transação que segura a trava dos writers", async () => {
    const dentro: boolean[] = [];
    impl.mockImplementation(async () => {
      dentro.push(emTransacao);
      return {} as OrdemServico;
    });
    await gerarOrcamentoDaOS("loja-1", "os-1");
    tituloMock.mockResolvedValue(titulo([{ tipo: "pagamento", valor: 420, loteId: "op-1" }, { tipo: "estorno_pagamento", valor: 420 }], "pendente"));
    await gerarOrcamentoDaOS("loja-1", "os-1");
    expect(impl).toHaveBeenCalledTimes(2);
    expect(impl).toHaveBeenCalledWith("loja-1", "os-1");
    expect(dentro).toEqual([true, true]);
    expect(ordemTx).toEqual(["advisory", "titulo", "advisory", "titulo"]);
  });

  it("o título conferido é o da chave canônica DESTA loja e OS", async () => {
    await gerarOrcamentoDaOS(" loja-1 ", " os-1 ");
    expect(tituloMock).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId_localKey: { storeId: "loja-1", localKey: localKeyContaReceberOSV3("loja-1", "os-1") } } }));
  });

  it("loja ou OS vazias seguem o caminho (e a mensagem) de sempre", async () => {
    await gerarOrcamentoDaOS("", "os-1");
    expect(impl).toHaveBeenCalledWith("", "os-1");
    expect(ordemTx).toEqual([]);
  });
});

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
  ordemTx.length = 0;
});

// GOAL OPS-DATAS-ENTRADA-ENTREGA-RETROATIVAS-001 garantiu que "uma gravação atrasada nunca
// desfaz outra" (lá por CAS em updatedAt). Na árvore reconciliada com o hardening
// OPS-RECEBIMENTO-MISTO-P1, o orçamento decide e grava sob a trava da linha da OS
// (os-payload-lock): a garantia vem da releitura do payload mais recente sob `FOR UPDATE`.
describe("gravação sob a trava da OS — gravação atrasada nunca desfaz outra", () => {
  it("trava, relê e grava na mesma transação; estado mudado em paralelo (ex.: recusa) é visto e nada é gravado", async () => {
    findFirstMock.mockResolvedValue(baseRow({ servicos: [{ id: "s1", descricao: "Serviço", valor: 100 }] }));
    await aprovarOrcamentoV3("loja-1", "os-1");
    expect(ordemTx).toEqual(["forUpdate", "findFirst", "update"]);
    expect(findFirstMock.mock.calls[0]![0]).toMatchObject({ where: { id: "os-1", storeId: "loja-1" } });

    vi.clearAllMocks();
    ordemTx.length = 0;
    // Outra operação já recusou o orçamento: a releitura sob a trava enxerga isso.
    findFirstMock.mockResolvedValue(baseRow({ status: "recusado", servicos: [{ id: "s1", descricao: "Serviço", valor: 100 }] }));
    await expect(aprovarOrcamentoV3("loja-1", "os-1")).rejects.toThrow();
    expect(updateMock).not.toHaveBeenCalled();
    expect(salvarGarantiaMock).not.toHaveBeenCalled();
  });
});

describe("aprovarOrcamentoV3 — proposta vencida (R3)", () => {
  it("recusa aprovar orçamento vencido e aponta a renovação auditada; nada é gravado", async () => {
    findFirstMock.mockResolvedValue(
      baseRow({ servicos: [{ id: "s1", descricao: "Serviço", valor: 100 }], validoAte: "2020-01-02T02:59:59.999Z" }),
    );
    await expect(aprovarOrcamentoV3("loja-1", "os-1")).rejects.toThrow(/venceu em 01\/01\/2020.*Corrigir datas/);
    expect(updateMock).not.toHaveBeenCalled();
    expect(salvarGarantiaMock).not.toHaveBeenCalled();
  });
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

describe("aprovarOrcamentoParaReceberV3 — GOAL OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-002 (item C)", () => {
  // Em build de produção a mensagem de um erro lançado numa Server Action não chega ao
  // navegador: o "Aprovar e receber" recebe a recusa DEVOLVIDA, com o mesmo núcleo de aprovação.
  const guard = vi.mocked(requireEnterpriseWith);
  afterEach(() => {
    guard.mockReset();
    guard.mockImplementation(async () => ({ ok: true }) as never);
    findFirstMock.mockReset();
    updateMock.mockClear();
    vi.restoreAllMocks();
  });

  it("aprova pelo MESMO núcleo de aprovarOrcamentoV3 e devolve ok", async () => {
    findFirstMock.mockResolvedValue(baseRow({ servicos: [{ id: "s1", descricao: "Serviço", valor: 100 }] }));
    await expect(aprovarOrcamentoParaReceberV3("loja-1", "os-1")).resolves.toEqual({ ok: true });
    expect(updateMock).toHaveBeenCalledTimes(1);
    const gravado = updateMock.mock.calls[0]![0] as { data: { payload: { orcamento: { status: string } } } };
    expect(gravado.data.payload.orcamento.status).toBe("aprovado");
  });

  it("sem permissão de editar OS: DEVOLVE quem pode aprovar; nada é lido nem gravado", async () => {
    guard.mockImplementation((async (_sid: string, _check: unknown, mensagem: string) => ({ ok: false, error: mensagem, status: 403 })) as never);
    const r = await aprovarOrcamentoParaReceberV3(" loja-1 ", "os-1");
    expect(r).toEqual({ ok: false, mensagem: expect.stringMatching(/^Seu perfil não pode aprovar orçamentos nesta loja\. Peça a aprovação a quem pode editar OS/) });
    const [sid, check] = guard.mock.calls[0]! as unknown as [string, (p: { operacoes: { editarOs: boolean } }) => boolean];
    expect(sid).toBe("loja-1");
    expect(check({ operacoes: { editarOs: false } })).toBe(false);
    expect(check({ operacoes: { editarOs: true } })).toBe(true);
    expect(findFirstMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("recusa da própria regra (orçamento já recusado) volta como mensagem, sem lançar e sem gravar", async () => {
    findFirstMock.mockResolvedValue(baseRow({ status: "recusado" }));
    await expect(aprovarOrcamentoParaReceberV3("loja-1", "os-1")).resolves.toEqual({
      ok: false,
      mensagem: 'Não é possível aprovar um orçamento com status "recusado".',
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("falha inesperada (não é recusa da regra) vira texto genérico, sem detalhe interno", async () => {
    class ErroDeInfra extends Error {}
    vi.spyOn(console, "error").mockImplementation(() => {});
    findFirstMock.mockRejectedValue(new ErroDeInfra("connection terminated: host=10.0.0.1 user=app"));
    const r = await aprovarOrcamentoParaReceberV3("loja-1", "os-1");
    expect(r).toEqual({ ok: false, mensagem: "Não foi possível confirmar a aprovação agora. Confira o orçamento da OS antes de tentar de novo." });
    expect(JSON.stringify(r)).not.toContain("10.0.0.1");
  });

  it("controle interno do Next (erro com digest) continua lançado", async () => {
    const interno = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" });
    findFirstMock.mockRejectedValue(interno);
    await expect(aprovarOrcamentoParaReceberV3("loja-1", "os-1")).rejects.toBe(interno);
  });
});
