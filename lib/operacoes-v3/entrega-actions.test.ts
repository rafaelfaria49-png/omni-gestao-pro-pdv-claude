import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { localKeyContaReceberOSV3 } from "./payment-model";

const mocks = vi.hoisted(() => ({
  osFindFirst: vi.fn(),
  osUpdate: vi.fn(),
  tituloFindUnique: vi.fn(),
  auth: vi.fn(),
  requireEnterpriseWith: vi.fn(),
  consumirEstoque: vi.fn(),
  emitirEvento: vi.fn(),
  revalidatePath: vi.fn(),
  autoClose: vi.fn(),
  lock: vi.fn(),
  travarOS: vi.fn(),
}));

vi.mock("@/lib/prisma", () => {
  const tx = {
    ordemServico: { findFirst: mocks.osFindFirst, update: mocks.osUpdate },
    contaReceberTitulo: { findUnique: mocks.tituloFindUnique },
  };
  return {
    prisma: {
      ordemServico: { findFirst: mocks.osFindFirst, update: mocks.osUpdate },
      contaReceberTitulo: { findUnique: mocks.tituloFindUnique },
      // Trava por OS: o callback recebe o mesmo cliente de OS mockado (a trava real
      // é provada no PostgreSQL em test/ops-datas-retroativas-001/datas.pg.ts).
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  };
});
vi.mock("@/lib/financeiro/services/recebimento-lote-service", () => ({ recebimentoLoteAdvisoryLock: mocks.lock }));
vi.mock("./recebimento-misto-service", () => ({
  chaveLockRecebimentoMistoV3: (sid: string, id: string) => `lock:${sid}:${id}`,
  travarOS: mocks.travarOS,
}));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/auth/guard-enterprise", () => ({ requireEnterpriseWith: mocks.requireEnterpriseWith }));
vi.mock("@/lib/operacoes/assert-active-store", () => ({ assertActiveStoreId: vi.fn() }));
vi.mock("./estoque-sync", () => ({ consumirEstoqueOSV3: mocks.consumirEstoque }));
vi.mock("./event-publisher", () => ({ emitirEventoOperacaoV3: mocks.emitirEvento }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("./retorno-auto-close-actions", () => ({ finalizarRetornoPorEntregaVinculadaV3: mocks.autoClose }));

import { adicionarFotoSaidaV3, registrarEntregaV3, removerFotoSaidaV3, salvarAssinaturaRetiradaV3 } from "./entrega-actions";

const storeId = "store-a";
const osId = "os-1";
const localKey = localKeyContaReceberOSV3(storeId, osId);

function payload(total = 100, over: Record<string, unknown> = {}) {
  return {
    id: osId,
    codigo: "OS-1",
    status: "pronta",
    operacaoStatusV3: "pronta",
    cliente: { id: "cli-1", nome: "Cliente" },
    timeline: [],
    orcamento: {
      id: "orc-1",
      status: "aprovado",
      sintetizado: false,
      total,
      desconto: 0,
      servicos: total > 0 ? [{ id: "serv-1", descricao: "Serviço", valor: total }] : [],
      pecas: [],
      criadoEm: "2026-07-01T10:00:00.000Z",
    },
    ...over,
  };
}

function row(total = 100, over: Record<string, unknown> = {}) {
  return { id: osId, valorTotal: total, payload: payload(total, over) };
}

function titulo(over: Record<string, unknown> = {}) {
  return {
    id: "titulo-1",
    storeId,
    localKey,
    valor: 100,
    status: "pago",
    payload: { ordemServicoId: osId, historico: [{ tipo: "liquidacao", valor: 100 }] },
    ...over,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-15T15:30:00.000Z"));
  mocks.osFindFirst.mockReset().mockResolvedValue(row());
  mocks.osUpdate.mockReset().mockResolvedValue({});
  mocks.lock.mockReset().mockResolvedValue(undefined);
  mocks.travarOS.mockReset().mockResolvedValue(true);
  mocks.tituloFindUnique.mockReset().mockResolvedValue(titulo());
  mocks.auth.mockReset().mockResolvedValue({ user: { id: "server-user", name: "Operadora Server", email: "server@example.com" } });
  mocks.requireEnterpriseWith.mockReset().mockResolvedValue({ ok: true });
  mocks.consumirEstoque.mockReset().mockResolvedValue({ status: "consumed", itens: 1 });
  mocks.emitirEvento.mockReset();
  mocks.revalidatePath.mockReset();
  mocks.autoClose.mockReset().mockResolvedValue({ status: "skipped" });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("registrarEntregaV3 — guard financeiro server-side", () => {
  it("permite OS quitada e só executa estoque/evento depois do write de entrega", async () => {
    await registrarEntregaV3(storeId, osId);

    expect(mocks.tituloFindUnique).toHaveBeenCalledWith({ where: { storeId_localKey: { storeId, localKey } } });
    expect(mocks.osUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.consumirEstoque).toHaveBeenCalledTimes(1);
    expect(mocks.emitirEvento).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ decisaoFinanceira: "ALLOW_PAID", entregaSemCobranca: false }),
    }));
    expect(mocks.osUpdate.mock.invocationCallOrder[0]).toBeLessThan(mocks.consumirEstoque.mock.invocationCallOrder[0]);
  });

  it("bloqueia chamada direta com saldo aberto e não produz efeito parcial", async () => {
    mocks.tituloFindUnique.mockResolvedValue(titulo({ status: "pendente", payload: { ordemServicoId: osId, historico: [] } }));

    await expect(registrarEntregaV3(storeId, osId)).rejects.toThrow(
      "Esta OS possui saldo pendente. Receba o valor ou autorize o pagamento a prazo antes de confirmar a entrega.",
    );
    expect(mocks.osUpdate).not.toHaveBeenCalled();
    expect(mocks.consumirEstoque).not.toHaveBeenCalled();
    expect(mocks.emitirEvento).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.autoClose).not.toHaveBeenCalled();
  });

  it("bloqueia pagamento parcial na chamada direta", async () => {
    mocks.tituloFindUnique.mockResolvedValue(titulo({ status: "parcial", payload: { historico: [{ tipo: "pagamento", valor: 40 }] } }));
    await expect(registrarEntregaV3(storeId, osId)).rejects.toThrow(/saldo pendente/i);
    expect(mocks.osUpdate).not.toHaveBeenCalled();
  });

  it("bloqueia total positivo sem título", async () => {
    mocks.tituloFindUnique.mockResolvedValue(null);
    await expect(registrarEntregaV3(storeId, osId)).rejects.toThrow(/Não foi possível confirmar a situação financeira/i);
    expect(mocks.osUpdate).not.toHaveBeenCalled();
  });

  it("persiste cortesia com ator/loja/horário do servidor e evento de timeline", async () => {
    mocks.osFindFirst.mockResolvedValue(row(0));
    mocks.tituloFindUnique.mockResolvedValue(null);

    await registrarEntregaV3(storeId, osId, {
      semCobranca: {
        categoria: "cortesia",
        motivo: "  Relacionamento comercial  ",
        autorizadoPorId: "client-user",
        autorizadoPorNome: "Cliente forjado",
        autorizadoEm: "2000-01-01T00:00:00.000Z",
        storeId: "store-forjada",
      } as never,
    });

    const write = mocks.osUpdate.mock.calls[0]![0] as { data: { payload: Record<string, unknown> } };
    const next = write.data.payload;
    expect(next.entregaSemCobrancaV3).toMatchObject({
      versao: 1,
      categoria: "cortesia",
      motivo: "Relacionamento comercial",
      autorizadoPorId: "server-user",
      autorizadoPorNome: "Operadora Server",
      autorizadoEm: "2026-07-15T15:30:00.000Z",
      storeId,
      status: "ativo",
      snapshotFinanceiro: { decisao: "ALLOW_AUTHORIZED_NO_CHARGE" },
    });
    expect(next.timeline).toEqual(expect.arrayContaining([
      expect.objectContaining({
        tipo: "observacao",
        metadata: expect.objectContaining({ evento: "entrega_sem_cobranca_autorizada", entregaSemCobranca: true }),
      }),
      expect.objectContaining({
        tipo: "entrega_cliente",
        metadata: expect.objectContaining({ decisaoFinanceira: "ALLOW_AUTHORIZED_NO_CHARGE", entregaSemCobranca: true }),
      }),
    ]));
  });

  it("persiste garantia sem cobrança e permite entrega", async () => {
    mocks.osFindFirst.mockResolvedValue(row(0));
    mocks.tituloFindUnique.mockResolvedValue(null);
    await registrarEntregaV3(storeId, osId, { semCobranca: { categoria: "garantia", motivo: "Retorno coberto" } });
    const next = (mocks.osUpdate.mock.calls[0]![0] as { data: { payload: Record<string, unknown> } }).data.payload;
    expect(next.entregaSemCobrancaV3).toMatchObject({ categoria: "garantia", autorizadoPorId: "server-user" });
  });

  it("rejeita categoria inválida e motivo vazio no servidor", async () => {
    mocks.osFindFirst.mockResolvedValue(row(0));
    mocks.tituloFindUnique.mockResolvedValue(null);
    await expect(registrarEntregaV3(storeId, osId, { semCobranca: { categoria: "outra", motivo: "Motivo" } as never })).rejects.toThrow(/categoria válida/i);
    await expect(registrarEntregaV3(storeId, osId, { semCobranca: { categoria: "cortesia", motivo: "  " } })).rejects.toThrow(/motivo/i);
    expect(mocks.osUpdate).not.toHaveBeenCalled();
  });

  it("permite contrato a prazo existente somente quando espelho e título são válidos", async () => {
    mocks.osFindFirst.mockResolvedValue(row(100, {
      aPrazoV3: {
        modo: "a_prazo",
        status: "pendente",
        valor: 100,
        vencimento: "2026-08-15",
        tituloLocalKey: localKey,
        autorizadoEntrega: true,
        autorizadoEm: "2026-07-15T12:00:00.000Z",
        autorizadoPor: "Operadora Server",
      },
    }));
    mocks.tituloFindUnique.mockResolvedValue(titulo({
      status: "pendente",
      payload: { ordemServicoId: osId, historico: [{ tipo: "a_prazo_autorizado", valor: 100 }] },
    }));

    await registrarEntregaV3(storeId, osId);
    expect(mocks.emitirEvento).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ decisaoFinanceira: "ALLOW_AUTHORIZED_CREDIT" }),
    }));
  });

  it("falha fechada quando a leitura da Conta a Receber lança erro", async () => {
    mocks.tituloFindUnique.mockRejectedValue(new Error("database unavailable"));
    await expect(registrarEntregaV3(storeId, osId)).rejects.toThrow(
      "Não foi possível confirmar a situação financeira desta OS. Revise a cobrança antes de entregar.",
    );
    expect(mocks.osUpdate).not.toHaveBeenCalled();
    expect(mocks.consumirEstoque).not.toHaveBeenCalled();
  });

  it("bloqueia tentativa cross-store antes da leitura financeira", async () => {
    mocks.osFindFirst.mockResolvedValue(null);
    await expect(registrarEntregaV3("store-b", osId)).rejects.toThrow("OS não encontrada.");
    expect(mocks.osFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: osId, storeId: "store-b" } }));
    expect(mocks.tituloFindUnique).not.toHaveBeenCalled();
    expect(mocks.osUpdate).not.toHaveBeenCalled();
  });

  it("OS já entregue preserva idempotência sem reler financeiro nem repetir efeitos", async () => {
    const entregue = payload(100, { operacaoStatusV3: "entregue", status: "entregue" });
    mocks.osFindFirst.mockResolvedValue({ id: osId, valorTotal: 100, payload: entregue });

    await expect(registrarEntregaV3(storeId, osId)).resolves.toBe(entregue);
    expect(mocks.tituloFindUnique).not.toHaveBeenCalled();
    expect(mocks.osUpdate).not.toHaveBeenCalled();
    expect(mocks.consumirEstoque).not.toHaveBeenCalled();
    expect(mocks.emitirEvento).not.toHaveBeenCalled();
    expect(mocks.autoClose).toHaveBeenCalledTimes(1);
    expect(mocks.autoClose).toHaveBeenCalledWith(expect.objectContaining({
      storeId,
      osFilha: expect.objectContaining({ id: osId }),
    }));
  });

  // GOAL OPS-DATAS-ENTRADA-ENTREGA-RETROATIVAS-001 — confirmação concorrente perdedora.
  it("decide e grava sob a trava por OS (advisory lock + FOR UPDATE) antes de qualquer efeito", async () => {
    await registrarEntregaV3(storeId, osId);
    expect(mocks.lock).toHaveBeenCalledWith(expect.anything(), `lock:${storeId}:${osId}`);
    expect(mocks.travarOS).toHaveBeenCalledWith(expect.anything(), storeId, osId);
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(mocks.osFindFirst.mock.invocationCallOrder[0]);
    expect(mocks.osUpdate.mock.invocationCallOrder[0]).toBeLessThan(mocks.consumirEstoque.mock.invocationCallOrder[0]);
  });

  it("OS já entregue com OUTRA data efetiva pedida: conflito explícito, sem gravar nem repetir efeitos", async () => {
    const entregue = payload(100, {
      operacaoStatusV3: "entregue",
      status: "entregue",
      entregueEm: "2026-07-10T15:00:00.000Z",
      entregaV3: { entregueEm: "2026-07-10T15:00:00.000Z", entregueEmMeta: { precisao: "dia", dia: "2026-07-10" } },
    });
    mocks.osFindFirst.mockResolvedValue({ id: osId, valorTotal: 100, payload: entregue });
    await expect(
      registrarEntregaV3(storeId, osId, { dataEntrega: { iso: "2026-07-12T15:00:00.000Z", meta: { precisao: "dia", dia: "2026-07-12" } } }),
    ).rejects.toThrow('Esta OS já foi entregue em 10/07/2026. Para ajustar a data, use "Corrigir datas".');
    expect(mocks.osUpdate).not.toHaveBeenCalled();
    expect(mocks.consumirEstoque).not.toHaveBeenCalled();
    expect(mocks.emitirEvento).not.toHaveBeenCalled();
    expect(mocks.autoClose).not.toHaveBeenCalled();
  });

  it("perdedor concorrente (entrega efetivada agora por outra chamada): não repete o fechamento do retorno", async () => {
    const entregue = payload(100, {
      operacaoStatusV3: "entregue",
      status: "entregue",
      // Registrada há 30 s pela confirmação vencedora (relógio fixo do teste: 15:30Z).
      entregaV3: { entregueEm: "2026-07-15T15:00:00.000Z", registradoEm: "2026-07-15T15:29:30.000Z" },
    });
    mocks.osFindFirst.mockResolvedValue({ id: osId, valorTotal: 100, payload: entregue });
    await expect(registrarEntregaV3(storeId, osId)).resolves.toBe(entregue);
    expect(mocks.autoClose).not.toHaveBeenCalled();
    expect(mocks.osUpdate).not.toHaveBeenCalled();
  });

  it("retentativa de entrega antiga continua tentando fechar um retorno vinculado pendente", async () => {
    const entregue = payload(100, {
      operacaoStatusV3: "entregue",
      status: "entregue",
      entregaV3: { entregueEm: "2026-07-10T15:00:00.000Z", registradoEm: "2026-07-10T15:00:00.000Z" },
    });
    mocks.osFindFirst.mockResolvedValue({ id: osId, valorTotal: 100, payload: entregue });
    await expect(registrarEntregaV3(storeId, osId)).resolves.toBe(entregue);
    expect(mocks.autoClose).toHaveBeenCalledTimes(1);
  });

  it("entrega sem data informada valida o 'agora' contra a entrada (entrada no futuro bloqueia, sem efeitos)", async () => {
    // Relógio do teste: 15/07 15:30Z; entrada legada registrada para 15/07 18:00Z.
    mocks.osFindFirst.mockResolvedValue(row(100, { aberturaV3: { versao: 1, recepcao: { dataEntrada: "2026-07-15T18:00:00.000Z" } } }));
    await expect(registrarEntregaV3(storeId, osId)).rejects.toThrow(/anterior à entrada/);
    expect(mocks.osUpdate).not.toHaveBeenCalled();
    expect(mocks.consumirEstoque).not.toHaveBeenCalled();
  });

  it("data efetiva dentro da folga do relógio (minuto à frente) é gravada no horário do servidor", async () => {
    // 15/07 12:33 na loja = 15:33Z, com o servidor em 15:30Z.
    await registrarEntregaV3(storeId, osId, { dataEntrega: { iso: "2026-07-15T15:33:00.000Z", meta: { precisao: "data_hora", dia: "2026-07-15" } } });
    const gravado = mocks.osUpdate.mock.calls[0]![0] as { data: { payload: Record<string, any> } };
    expect(gravado.data.payload.entregaV3.entregueEm).toBe("2026-07-15T15:30:00.000Z");
    expect(gravado.data.payload.entregueEm).toBe("2026-07-15T15:30:00.000Z");
  });

  it("R4: mesmo pedido 'à frente' que a vencedora gravou limitado ao relógio do servidor continua no-op", async () => {
    // Vencedora gravou 15:30Z (limitado); o perdedor pediu 15:33Z (dentro da folga).
    const entregue = payload(100, {
      operacaoStatusV3: "entregue",
      status: "entregue",
      entregaV3: { entregueEm: "2026-07-15T15:30:00.000Z", entregueEmMeta: { precisao: "data_hora", dia: "2026-07-15" }, registradoEm: "2026-07-15T15:30:00.000Z" },
    });
    mocks.osFindFirst.mockResolvedValue({ id: osId, valorTotal: 100, payload: entregue });
    await expect(
      registrarEntregaV3(storeId, osId, { dataEntrega: { iso: "2026-07-15T15:33:00.000Z", meta: { precisao: "data_hora", dia: "2026-07-15" } } }),
    ).resolves.toBe(entregue);
    expect(mocks.osUpdate).not.toHaveBeenCalled();
  });

  it("R5: a folga não vale para entrega antiga — ontem 10:00 × novo pedido 10:04 é conflito", async () => {
    const entregue = payload(100, {
      operacaoStatusV3: "entregue",
      status: "entregue",
      entregaV3: { entregueEm: "2026-07-14T13:00:00.000Z", entregueEmMeta: { precisao: "data_hora", dia: "2026-07-14" }, registradoEm: "2026-07-14T13:00:00.000Z" },
    });
    mocks.osFindFirst.mockResolvedValue({ id: osId, valorTotal: 100, payload: entregue });
    await expect(
      registrarEntregaV3(storeId, osId, { dataEntrega: { iso: "2026-07-14T13:04:00.000Z", meta: { precisao: "data_hora", dia: "2026-07-14" } } }),
    ).rejects.toThrow('Esta OS já foi entregue em 14/07/2026 10:00. Para ajustar a data, use "Corrigir datas".');
    expect(mocks.osUpdate).not.toHaveBeenCalled();
  });

  it("R5: registro recente com horário informado (não limitado ao relógio) só aceita o MESMO horário", async () => {
    // Registrada há 30 s com entrega efetiva às 12:00 (15:00Z); pedido de 12:03 é outra data.
    const entregue = payload(100, {
      operacaoStatusV3: "entregue",
      status: "entregue",
      entregaV3: { entregueEm: "2026-07-15T15:00:00.000Z", entregueEmMeta: { precisao: "data_hora", dia: "2026-07-15" }, registradoEm: "2026-07-15T15:29:30.000Z" },
    });
    mocks.osFindFirst.mockResolvedValue({ id: osId, valorTotal: 100, payload: entregue });
    await expect(
      registrarEntregaV3(storeId, osId, { dataEntrega: { iso: "2026-07-15T15:03:00.000Z", meta: { precisao: "data_hora", dia: "2026-07-15" } } }),
    ).rejects.toThrow(/já foi entregue em 15\/07\/2026 12:00/);
    await expect(
      registrarEntregaV3(storeId, osId, { dataEntrega: { iso: "2026-07-15T15:00:00.000Z", meta: { precisao: "data_hora", dia: "2026-07-15" } } }),
    ).resolves.toBe(entregue);
    expect(mocks.osUpdate).not.toHaveBeenCalled();
  });

  it("OS já entregue com a MESMA data efetiva: continua no-op idempotente", async () => {
    const entregue = payload(100, {
      operacaoStatusV3: "entregue",
      status: "entregue",
      entregaV3: { entregueEm: "2026-07-10T15:00:00.000Z", entregueEmMeta: { precisao: "dia", dia: "2026-07-10" } },
    });
    mocks.osFindFirst.mockResolvedValue({ id: osId, valorTotal: 100, payload: entregue });
    await expect(
      registrarEntregaV3(storeId, osId, { dataEntrega: { iso: "2026-07-10T15:00:00.000Z", meta: { precisao: "dia", dia: "2026-07-10" } } }),
    ).resolves.toBe(entregue);
    expect(mocks.osUpdate).not.toHaveBeenCalled();
    expect(mocks.emitirEvento).not.toHaveBeenCalled();
  });

  it("após persistir a entrega, tenta finalizar o retorno original vinculado", async () => {
    await registrarEntregaV3(storeId, osId);
    expect(mocks.osUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.autoClose).toHaveBeenCalledTimes(1);
    expect(mocks.osUpdate.mock.invocationCallOrder[0]).toBeLessThan(mocks.autoClose.mock.invocationCallOrder[0]);
  });

  it("preserva fotos de saída já gravadas em entregaV3 ao confirmar a entrega", async () => {
    const foto = {
      id: "f-saida-1",
      categoria: "reparado",
      dataUrl: "data:image/jpeg;base64,AAAA",
      tamanho: 12,
      criadoEm: "2026-07-14T10:00:00.000Z",
    };
    mocks.osFindFirst.mockResolvedValue(row(100, { entregaV3: { fotosSaida: [foto] } }));
    await registrarEntregaV3(storeId, osId);
    const write = mocks.osUpdate.mock.calls[0]![0] as { data: { payload: { entregaV3: { fotosSaida: unknown[] } } } };
    expect(write.data.payload.entregaV3.fotosSaida).toEqual([foto]);
  });
});

describe("fotos de saída", () => {
  it("grava foto de saída no payload sem alterar status", async () => {
    const dataUrl = `data:image/jpeg;base64,${"A".repeat(40)}`;
    await adicionarFotoSaidaV3(storeId, osId, { categoria: "reparado", nome: "depois.jpg", dataUrl });
    const write = mocks.osUpdate.mock.calls[0]![0] as { data: { payload: Record<string, unknown> } };
    const fotos = (write.data.payload.entregaV3 as { fotosSaida: Array<{ categoria: string; nome?: string }> }).fotosSaida;
    expect(fotos).toHaveLength(1);
    expect(fotos[0]).toMatchObject({ categoria: "reparado", nome: "depois.jpg" });
    expect(write.data.payload.operacaoStatusV3).toBe("pronta");
  });

  it("remove foto de saída existente", async () => {
    mocks.osFindFirst.mockResolvedValue(
      row(100, {
        entregaV3: {
          fotosSaida: [
            { id: "f1", categoria: "reparado", dataUrl: "data:image/jpeg;base64,AAAA", tamanho: 4, criadoEm: "2026-07-14T10:00:00.000Z" },
          ],
        },
      }),
    );
    await removerFotoSaidaV3(storeId, osId, "f1");
    const write = mocks.osUpdate.mock.calls[0]![0] as { data: { payload: { entregaV3: { fotosSaida: unknown[] } } } };
    expect(write.data.payload.entregaV3.fotosSaida).toEqual([]);
  });

  it("R7: assinatura e fotos de saída gravam sob a trava por OS (advisory + FOR UPDATE), sobre o estado relido", async () => {
    const entregue = row(100, { operacaoStatusV3: "entregue", status: "entregue", entregaV3: { entregueEm: "2026-07-10T15:00:00.000Z", recebidoPor: "Cliente" } });
    mocks.osFindFirst.mockResolvedValue(entregue);
    await salvarAssinaturaRetiradaV3(storeId, osId, "data:image/png;base64,AAAA");
    await adicionarFotoSaidaV3(storeId, osId, { dataUrl: `data:image/jpeg;base64,${"A".repeat(40)}` });
    mocks.osFindFirst.mockResolvedValue(
      row(100, { operacaoStatusV3: "entregue", status: "entregue", entregaV3: { fotosSaida: [{ id: "f1", categoria: "reparado", dataUrl: "data:image/jpeg;base64,AAAA", tamanho: 4, criadoEm: "2026-07-14T10:00:00.000Z" }] } }),
    );
    await removerFotoSaidaV3(storeId, osId, "f1");
    expect(mocks.lock).toHaveBeenCalledTimes(3);
    expect(mocks.travarOS).toHaveBeenCalledTimes(3);
    const assinatura = mocks.osUpdate.mock.calls[0]![0] as { data: { payload: { entregaV3: Record<string, unknown> } } };
    expect(assinatura.data.payload.entregaV3).toMatchObject({ entregueEm: "2026-07-10T15:00:00.000Z", assinaturaRetirada: { por: "Cliente" } });
  });

  it("bloqueia foto de saída em OS cancelada", async () => {
    mocks.osFindFirst.mockResolvedValue(row(100, { operacaoStatusV3: "cancelada", status: "cancelada" }));
    await expect(
      adicionarFotoSaidaV3(storeId, osId, { dataUrl: `data:image/jpeg;base64,${"A".repeat(40)}` }),
    ).rejects.toThrow(/cancelada/);
    expect(mocks.osUpdate).not.toHaveBeenCalled();
  });
});
