import { describe, expect, it } from "vitest";
import type { OrdemServico } from "@/types/os";
import {
  criarAutorizacaoEntregaSemCobrancaV3,
  projetarEntregaFinanceiraV3,
  type ProjetarEntregaFinanceiraInputV3,
  type TituloEntregaFinanceiraV3,
} from "./delivery-financial-guard";
import { localKeyContaReceberOSV3 } from "./payment-model";

const storeId = "store-a";
const osId = "os-1";
const localKey = localKeyContaReceberOSV3(storeId, osId);

function payload(total = 100): OrdemServico & Record<string, unknown> {
  return {
    id: osId,
    codigo: "OS-1",
    status: "pronta",
    operacaoStatusV3: "pronta",
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
  } as unknown as OrdemServico & Record<string, unknown>;
}

function titulo(over: Partial<TituloEntregaFinanceiraV3> = {}): TituloEntregaFinanceiraV3 {
  return {
    id: "titulo-1",
    storeId,
    localKey,
    valor: 100,
    status: "pendente",
    payload: { ordemServicoId: osId, historico: [] },
    ...over,
  };
}

function projetar(over: Partial<ProjetarEntregaFinanceiraInputV3> = {}) {
  return projetarEntregaFinanceiraV3({
    storeId,
    osId,
    payload: payload(),
    prismaValorTotal: 100,
    titulo: titulo(),
    ...over,
  });
}

describe("delivery-financial-guard — decisão pura e fail-closed", () => {
  it("permite título quitado somente com histórico e status coerentes", () => {
    const out = projetar({
      titulo: titulo({ status: "pago", payload: { ordemServicoId: osId, historico: [{ tipo: "liquidacao", valor: 100 }] } }),
    });
    expect(out).toMatchObject({ decisao: "ALLOW_PAID", totalRecebido: 100, saldo: 0, consistencia: "consistente" });
  });

  it("bloqueia saldo totalmente pendente", () => {
    expect(projetar().decisao).toBe("BLOCK_PENDING_BALANCE");
  });

  it("bloqueia pagamento parcial", () => {
    const out = projetar({
      titulo: titulo({ status: "parcial", payload: { ordemServicoId: osId, historico: [{ tipo: "pagamento", valor: 40 }] } }),
    });
    expect(out).toMatchObject({ decisao: "BLOCK_PENDING_BALANCE", totalRecebido: 40, saldo: 60 });
  });

  it("bloqueia total positivo sem título", () => {
    expect(projetar({ titulo: null }).decisao).toBe("BLOCK_CHARGE_NOT_CREATED");
  });

  it("bloqueia orçamento/coluna e título divergentes além de um centavo", () => {
    expect(projetar({ titulo: titulo({ valor: 100.02 }) }).decisao).toBe("BLOCK_INCONSISTENT");
  });

  it("bloqueia divergência entre orçamento aprovado positivo e coluna zerada", () => {
    expect(projetar({ prismaValorTotal: 0 })).toMatchObject({
      decisao: "BLOCK_INCONSISTENT",
      consistencia: "inconsistente",
    });
  });

  it("bloqueia divergência entre orçamento aprovado zero e coluna positiva", () => {
    expect(projetar({ payload: payload(0), prismaValorTotal: 100, titulo: titulo() })).toMatchObject({
      decisao: "BLOCK_INCONSISTENT",
      consistencia: "inconsistente",
    });
  });

  it("tolera diferença centesimal de um centavo na quitação", () => {
    const out = projetar({
      titulo: titulo({ valor: 100.01, status: "pago", payload: { ordemServicoId: osId, historico: [{ tipo: "liquidacao", valor: 100 }] } }),
    });
    expect(out.decisao).toBe("ALLOW_PAID");
  });

  it("bloqueia total zero sem autorização persistida", () => {
    const out = projetar({ payload: payload(0), prismaValorTotal: 0, titulo: null });
    expect(out.decisao).toBe("BLOCK_NO_CHARGE_AUTH_REQUIRED");
  });

  it("bloqueia preço não materializado como desconhecido", () => {
    const out = projetar({ payload: { id: osId, status: "pronta" } as unknown as OrdemServico & Record<string, unknown>, prismaValorTotal: 0, titulo: null });
    expect(out.decisao).toBe("BLOCK_UNKNOWN");
  });

  it("bloqueia orçamento real ainda não aprovado mesmo que coluna e título coincidam", () => {
    const os = payload();
    (os.orcamento as { status: string }).status = "rascunho";
    expect(projetar({ payload: os }).decisao).toBe("BLOCK_UNKNOWN");
  });

  it("permite cortesia explicitamente classificada e persistida", () => {
    const autorizacao = criarAutorizacaoEntregaSemCobrancaV3({
      solicitacao: { categoria: "cortesia", motivo: "Relacionamento comercial" },
      storeId,
      autorizadoPorId: "user-server",
      autorizadoPorNome: "Ana",
      autorizadoEm: "2026-07-15T12:00:00.000Z",
    });
    const out = projetar({ payload: { ...payload(0), entregaSemCobrancaV3: autorizacao }, prismaValorTotal: 0, titulo: null });
    expect(out).toMatchObject({ decisao: "ALLOW_AUTHORIZED_NO_CHARGE", autorizacaoSemCobranca: true });
  });

  it("permite garantia sem cobrança explicitamente classificada", () => {
    const autorizacao = criarAutorizacaoEntregaSemCobrancaV3({
      solicitacao: { categoria: "garantia", motivo: "Retorno coberto pela garantia" },
      storeId,
      autorizadoPorId: "user-server",
      autorizadoPorNome: "Ana",
      autorizadoEm: "2026-07-15T12:00:00.000Z",
    });
    expect(projetar({ payload: { ...payload(0), entregaSemCobrancaV3: autorizacao }, prismaValorTotal: 0, titulo: null }).decisao)
      .toBe("ALLOW_AUTHORIZED_NO_CHARGE");
  });

  it("não deixa autorização sem cobrança ocultar um título positivo", () => {
    const autorizacao = criarAutorizacaoEntregaSemCobrancaV3({
      solicitacao: { categoria: "sem_valor", motivo: "Solicitação indevida para o cenário" },
      storeId,
      autorizadoPorId: "user-server",
      autorizadoPorNome: "Ana",
      autorizadoEm: "2026-07-15T12:00:00.000Z",
    });
    const semPreco = { id: osId, status: "pronta", entregaSemCobrancaV3: autorizacao } as unknown as OrdemServico & Record<string, unknown>;
    expect(projetar({ payload: semPreco, prismaValorTotal: 0, titulo: titulo() }).decisao).toBe("BLOCK_INCONSISTENT");
  });

  it("permite a prazo válido no mesmo título da OS", () => {
    const os = {
      ...payload(),
      aPrazoV3: {
        modo: "a_prazo",
        status: "pendente",
        valor: 100,
        vencimento: "2026-08-15",
        tituloLocalKey: localKey,
        autorizadoEntrega: true,
        autorizadoEm: "2026-07-15T12:00:00.000Z",
        autorizadoPor: "Ana",
      },
    };
    const out = projetar({ payload: os, titulo: titulo({ payload: { ordemServicoId: osId, historico: [{ tipo: "a_prazo_autorizado", valor: 100 }] } }) });
    expect(out).toMatchObject({ decisao: "ALLOW_AUTHORIZED_CREDIT", autorizacaoAPrazo: true });
  });

  it("bloqueia a prazo cancelado/revogado", () => {
    const os = {
      ...payload(),
      aPrazoV3: {
        modo: "a_prazo",
        status: "cancelado",
        valor: 100,
        vencimento: "2026-08-15",
        tituloLocalKey: localKey,
        autorizadoEntrega: true,
        autorizadoEm: "2026-07-15T12:00:00.000Z",
        autorizadoPor: "Ana",
      },
    };
    expect(projetar({ payload: os }).decisao).toBe("BLOCK_PENDING_BALANCE");
  });

  it("bloqueia a prazo sem marcador real no histórico do título", () => {
    const os = {
      ...payload(),
      aPrazoV3: {
        modo: "a_prazo",
        status: "pendente",
        valor: 100,
        vencimento: "2026-08-15",
        tituloLocalKey: localKey,
        autorizadoEntrega: true,
        autorizadoEm: "2026-07-15T12:00:00.000Z",
        autorizadoPor: "Ana",
      },
    };
    expect(projetar({ payload: os }).decisao).toBe("BLOCK_PENDING_BALANCE");
  });

  it("bloqueia falha de consulta financeira mesmo com autorização sem cobrança", () => {
    const autorizacao = criarAutorizacaoEntregaSemCobrancaV3({
      solicitacao: { categoria: "cortesia", motivo: "Cortesia autorizada" },
      storeId,
      autorizadoPorId: "user-server",
      autorizadoPorNome: "Ana",
      autorizadoEm: "2026-07-15T12:00:00.000Z",
    });
    const out = projetar({ payload: { ...payload(0), entregaSemCobrancaV3: autorizacao }, prismaValorTotal: 0, titulo: null, falhaLeituraTitulo: true });
    expect(out.decisao).toBe("BLOCK_UNKNOWN");
  });

  it("bloqueia título de outra loja/OS", () => {
    expect(projetar({ titulo: titulo({ storeId: "store-b" }) }).decisao).toBe("BLOCK_INCONSISTENT");
    expect(projetar({ titulo: titulo({ payload: { ordemServicoId: "os-outra", historico: [] } }) }).decisao).toBe("BLOCK_INCONSISTENT");
  });

  it("bloqueia status pago sem histórico de liquidação", () => {
    expect(projetar({ titulo: titulo({ status: "pago" }) }).decisao).toBe("BLOCK_INCONSISTENT");
  });

  it("bloqueia histórico quitado com status pendente", () => {
    expect(projetar({ titulo: titulo({ status: "pendente", payload: { historico: [{ tipo: "liquidacao", valor: 100 }] } }) }).decisao)
      .toBe("BLOCK_INCONSISTENT");
  });

  it("aceita OS legada sem orçamento quando coluna, título, histórico e status comprovam a quitação", () => {
    const out = projetar({
      payload: { id: osId, status: "pronta" } as unknown as OrdemServico & Record<string, unknown>,
      prismaValorTotal: 100,
      titulo: titulo({ status: "pago", payload: { historico: [{ tipo: "liquidacao", valor: 100 }] } }),
    });
    expect(out.decisao).toBe("ALLOW_PAID");
  });
});

describe("delivery-financial-guard — contrato sem cobrança", () => {
  it("rejeita categoria inválida", () => {
    expect(() => criarAutorizacaoEntregaSemCobrancaV3({
      solicitacao: { categoria: "outra" as "cortesia", motivo: "Motivo" },
      storeId,
      autorizadoPorId: "u1",
      autorizadoPorNome: "Ana",
      autorizadoEm: "2026-07-15T12:00:00.000Z",
    })).toThrow(/categoria válida/i);
  });

  it("rejeita motivo vazio", () => {
    expect(() => criarAutorizacaoEntregaSemCobrancaV3({
      solicitacao: { categoria: "cortesia", motivo: "   " },
      storeId,
      autorizadoPorId: "u1",
      autorizadoPorNome: "Ana",
      autorizadoEm: "2026-07-15T12:00:00.000Z",
    })).toThrow(/motivo/i);
  });

  it("mantém ator, loja e timestamp fornecidos pela camada server-side", () => {
    expect(criarAutorizacaoEntregaSemCobrancaV3({
      solicitacao: { categoria: "sem_valor", motivo: "Serviço sem valor comercial" },
      storeId,
      autorizadoPorId: "server-user",
      autorizadoPorNome: "Operador Server",
      autorizadoEm: "2026-07-15T12:34:56.000Z",
    })).toMatchObject({
      versao: 1,
      storeId,
      autorizadoPorId: "server-user",
      autorizadoPorNome: "Operador Server",
      autorizadoEm: "2026-07-15T12:34:56.000Z",
      status: "ativo",
    });
  });
});
