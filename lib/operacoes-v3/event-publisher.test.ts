import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { OrdemServico } from "@/types/os";
import type { OperacaoEventoV3Payload } from "./event-model";
import {
  __resetOperacaoEventoV3ParaTeste,
  emitirEventoOperacaoV3,
  lerDebugEventosV3,
  publicarEventoV3,
  setDebugOperacaoEventoV3,
  subscribeOperacaoEventoV3,
} from "./event-publisher";

const AT = "2026-06-06T12:00:00.000Z";

function evento(over: Partial<OperacaoEventoV3Payload> = {}): OperacaoEventoV3Payload {
  return {
    tipo: "os_pronta",
    osId: "os1",
    numeroOS: "OS-1",
    clienteId: "cli1",
    clienteNome: "Maria",
    status: "pronta",
    loja: "loja-1",
    timestamp: AT,
    metadata: {},
    ...over,
  };
}

function os(over: Record<string, unknown>): OrdemServico {
  return {
    id: "os1",
    codigo: "OS-2026-0001",
    clienteId: "cli1",
    cliente: { id: "cli1", nome: "Maria" },
    timeline: [],
    ...over,
  } as unknown as OrdemServico;
}

beforeEach(() => {
  __resetOperacaoEventoV3ParaTeste();
  setDebugOperacaoEventoV3(false);
});
afterEach(() => {
  __resetOperacaoEventoV3ParaTeste();
});

describe("event-publisher · publicarEventoV3", () => {
  it("publica um evento válido, entrega aos assinantes e retém no buffer", () => {
    const recebidos: OperacaoEventoV3Payload[] = [];
    subscribeOperacaoEventoV3((e) => recebidos.push(e));

    const res = publicarEventoV3(evento());

    expect(res.ok).toBe(true);
    expect(res.evento?.tipo).toBe("os_pronta");
    expect(recebidos).toHaveLength(1);
    expect(lerDebugEventosV3()).toHaveLength(1);
  });

  it("descarta evento inválido: não entrega e não retém (sem lançar)", () => {
    const recebidos: OperacaoEventoV3Payload[] = [];
    subscribeOperacaoEventoV3((e) => recebidos.push(e));

    const res = publicarEventoV3(evento({ tipo: "lixo" as never }));

    expect(res.ok).toBe(false);
    expect(res.motivo).toBeTruthy();
    expect(recebidos).toHaveLength(0);
    expect(lerDebugEventosV3()).toHaveLength(0);
  });

  it("isola assinante que lança — os demais continuam recebendo", () => {
    const recebidos: string[] = [];
    subscribeOperacaoEventoV3(() => {
      throw new Error("assinante quebrado");
    });
    subscribeOperacaoEventoV3((e) => recebidos.push(e.tipo));

    const res = publicarEventoV3(evento());

    expect(res.ok).toBe(true);
    expect(recebidos).toEqual(["os_pronta"]);
  });

  it("unsubscribe interrompe a entrega", () => {
    const recebidos: OperacaoEventoV3Payload[] = [];
    const off = subscribeOperacaoEventoV3((e) => recebidos.push(e));

    publicarEventoV3(evento());
    off();
    publicarEventoV3(evento());

    expect(recebidos).toHaveLength(1);
  });

  it("mantém apenas os últimos 50 no buffer de debug", () => {
    for (let i = 0; i < 60; i++) {
      publicarEventoV3(evento({ osId: `os${i}` }));
    }
    const buf = lerDebugEventosV3();
    expect(buf).toHaveLength(50);
    expect(buf[buf.length - 1].osId).toBe("os59");
    expect(buf[0].osId).toBe("os10");
  });
});

describe("event-publisher · emitirEventoOperacaoV3 (ponto único das actions)", () => {
  it("constrói a partir da OS, publica e carrega a origem no metadata", () => {
    const recebidos: OperacaoEventoV3Payload[] = [];
    subscribeOperacaoEventoV3((e) => recebidos.push(e));

    const res = emitirEventoOperacaoV3({
      tipo: "os_entregue",
      os: os({ operacaoStatusV3: "entregue" }),
      storeId: "loja-7",
      origem: "entrega",
      metadata: { recebidoPor: "Maria" },
      at: AT,
    });

    expect(res.ok).toBe(true);
    expect(recebidos).toHaveLength(1);
    expect(recebidos[0]).toMatchObject({ tipo: "os_entregue", status: "entregue", loja: "loja-7", numeroOS: "OS-2026-0001" });
    expect(recebidos[0].metadata).toMatchObject({ origem: "entrega", recebidoPor: "Maria" });
  });

  it("nunca lança mesmo com OS malformada — retorna ok=false", () => {
    const res = emitirEventoOperacaoV3({
      tipo: "os_criada",
      os: null as unknown as OrdemServico,
      storeId: "loja-1",
      at: AT,
    });
    expect(res.ok).toBe(false);
    expect(lerDebugEventosV3()).toHaveLength(0);
  });
});
