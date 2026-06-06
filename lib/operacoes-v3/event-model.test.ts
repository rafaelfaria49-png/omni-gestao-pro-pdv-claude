import { describe, expect, it } from "vitest";
import type { OrdemServico } from "@/types/os";
import {
  EVENTOS_V3,
  EVENTOS_V3_LIST,
  construirEventoV3,
  isOperacaoEventoV3Tipo,
  statusV3ParaEvento,
  validarEventoV3,
  type OperacaoEventoV3Payload,
} from "./event-model";

const AT = "2026-06-06T12:00:00.000Z";

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

describe("event-model · inventário", () => {
  it("tem os 10 eventos oficiais, cada um com meta", () => {
    expect(EVENTOS_V3_LIST).toHaveLength(10);
    for (const tipo of EVENTOS_V3_LIST) {
      expect(EVENTOS_V3[tipo].label).toBeTruthy();
      expect(EVENTOS_V3[tipo].descricao).toBeTruthy();
    }
  });

  it("isOperacaoEventoV3Tipo aceita oficiais e rejeita o resto", () => {
    expect(isOperacaoEventoV3Tipo("os_pronta")).toBe(true);
    expect(isOperacaoEventoV3Tipo("os_retorno_aberto")).toBe(true);
    expect(isOperacaoEventoV3Tipo("venda_finalizada")).toBe(false);
    expect(isOperacaoEventoV3Tipo("")).toBe(false);
    expect(isOperacaoEventoV3Tipo(null)).toBe(false);
  });
});

describe("event-model · construirEventoV3 (payload)", () => {
  it("monta um payload consistente a partir da OS", () => {
    const evento = construirEventoV3({
      tipo: "os_pronta",
      os: os({ operacaoStatusV3: "pronta" }),
      storeId: "loja-9",
      origem: "status-machine",
      metadata: { de: "em_execucao", para: "pronta" },
      at: AT,
    });

    expect(evento).toMatchObject<Partial<OperacaoEventoV3Payload>>({
      tipo: "os_pronta",
      osId: "os1",
      numeroOS: "OS-2026-0001",
      clienteId: "cli1",
      clienteNome: "Maria",
      status: "pronta",
      loja: "loja-9",
      timestamp: AT,
    });
    // origem entra no metadata (observabilidade) junto dos dados do evento.
    expect(evento.metadata).toMatchObject({ origem: "status-machine", de: "em_execucao", para: "pronta" });
  });

  it("deriva o status pela máquina única (fallback do status V2 quando não há V3)", () => {
    const evento = construirEventoV3({ tipo: "os_criada", os: os({ status: "aberta" }), storeId: "loja-1", at: AT });
    expect(evento.status).toBe("aberta");
  });

  it("usa cliente.id quando clienteId de topo está ausente", () => {
    const evento = construirEventoV3({
      tipo: "os_criada",
      os: os({ clienteId: undefined, cliente: { id: "cliX", nome: "João" } }),
      storeId: "loja-1",
      at: AT,
    });
    expect(evento.clienteId).toBe("cliX");
    expect(evento.clienteNome).toBe("João");
  });

  it("não inclui origem no metadata quando não informada", () => {
    const evento = construirEventoV3({ tipo: "os_criada", os: os({}), storeId: "loja-1", at: AT });
    expect(evento.metadata.origem).toBeUndefined();
  });
});

describe("event-model · statusV3ParaEvento (status → evento)", () => {
  it("mapeia os status com evento de negócio dedicado", () => {
    expect(statusV3ParaEvento("pronta")).toBe("os_pronta");
    expect(statusV3ParaEvento("aguardando_peca")).toBe("os_aguardando_peca");
    expect(statusV3ParaEvento("entregue")).toBe("os_entregue");
  });

  it("retorna null para status sem evento dedicado", () => {
    for (const s of ["aberta", "diagnostico", "aguardando_aprovacao", "aprovado", "em_execucao", "recebida", "cancelada"]) {
      expect(statusV3ParaEvento(s)).toBeNull();
    }
    expect(statusV3ParaEvento("inexistente")).toBeNull();
    expect(statusV3ParaEvento(null)).toBeNull();
  });
});

describe("event-model · validarEventoV3 (eventos inválidos)", () => {
  const base: OperacaoEventoV3Payload = {
    tipo: "os_criada",
    osId: "os1",
    numeroOS: "OS-1",
    clienteId: "cli1",
    clienteNome: "Maria",
    status: "aberta",
    loja: "loja-1",
    timestamp: AT,
    metadata: {},
  };

  it("aprova um evento bem formado", () => {
    expect(validarEventoV3(base).ok).toBe(true);
  });

  it("reprova tipo inválido", () => {
    expect(validarEventoV3({ ...base, tipo: "qualquer" as never }).ok).toBe(false);
  });

  it("reprova sem osId", () => {
    expect(validarEventoV3({ ...base, osId: "  " }).ok).toBe(false);
  });

  it("reprova sem loja", () => {
    expect(validarEventoV3({ ...base, loja: "" }).ok).toBe(false);
  });

  it("reprova timestamp inválido", () => {
    expect(validarEventoV3({ ...base, timestamp: "ontem" }).ok).toBe(false);
  });

  it("reprova evento nulo/sem objeto", () => {
    expect(validarEventoV3(null).ok).toBe(false);
    expect(validarEventoV3(undefined).ok).toBe(false);
  });
});
