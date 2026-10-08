import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Banco em memória mínimo: OS por (id, loja) + as três consultas cruas que a action usa
// (trava FOR UPDATE, busca da filha pelo vínculo, busca de origens). A prova de
// concorrência real fica no PostgreSQL (test/ops-v4-fluxo-curto-007/retorno.pg.test.ts).
type Row = { id: string; storeId: string; numero: string | null; payload: Record<string, any> };

const mocks = vi.hoisted(() => ({
  rows: new Map<string, Row>(),
  update: vi.fn(),
  auth: vi.fn(),
  guard: vi.fn(),
  assertStore: vi.fn(),
  emitirEvento: vi.fn(),
  revalidatePath: vi.fn(),
  criarOS: vi.fn(),
  seq: 0,
}));

vi.mock("@/lib/prisma", () => {
  const db: Record<string, unknown> = {
    ordemServico: {
      findFirst: async (args: { where: { id: string; storeId: string } }) => {
        const row = mocks.rows.get(args.where.id);
        if (!row || row.storeId !== args.where.storeId) return null;
        return { id: row.id, storeId: row.storeId, numero: row.numero, payload: structuredClone(row.payload), valorTotal: 0, valorBase: 0, updatedAt: new Date() };
      },
      update: async (args: { where: { id: string }; data: { payload: Record<string, any> } }) => {
        mocks.update(args);
        const row = mocks.rows.get(args.where.id)!;
        row.payload = structuredClone(args.data.payload);
        return row;
      },
    },
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?");
      if (sql.includes("FOR UPDATE")) {
        const [id, storeId] = values as string[];
        const row = mocks.rows.get(id);
        return row && row.storeId === storeId ? [{ id }] : [];
      }
      if (sql.includes("vinculoRetornoV3")) {
        const [storeId, origem, retornoId] = values as string[];
        return [...mocks.rows.values()]
          .filter((r) => r.storeId === storeId && r.payload.vinculoRetornoV3?.osOrigemId === origem && r.payload.vinculoRetornoV3?.retornoId === retornoId && !r.payload.vinculoRetornoV3?.descartadoEm)
          .map((r) => ({ id: r.id, numero: r.numero, codigo: r.payload.codigo }));
      }
      if (sql.includes("ILIKE")) {
        const [storeId, like] = values as string[];
        const termo = String(like).replace(/%/g, "").toLowerCase();
        return [...mocks.rows.values()]
          .filter((r) => r.storeId === storeId && JSON.stringify(r.payload).toLowerCase().includes(termo))
          .map((r) => ({ payload: structuredClone(r.payload) }));
      }
      throw new Error(`consulta inesperada: ${sql}`);
    },
  };
  db.$transaction = async (fn: (tx: unknown) => unknown) => fn(db);
  return { prisma: db };
});
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/auth/guard-enterprise", () => ({ requireEnterpriseWith: mocks.guard }));
vi.mock("@/lib/operacoes/assert-active-store", () => ({ assertActiveStoreId: mocks.assertStore }));
vi.mock("./event-publisher", () => ({ emitirEventoOperacaoV3: mocks.emitirEvento }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("./nova-os-actions", () => ({ criarOSEnterpriseV3: mocks.criarOS }));

import { abrirRetornoV3, buscarOrigensRetornoV3, finalizarRetornoV3, lerOrigemRetornoV3 } from "./retorno-actions";
import { planejarCorrecaoDatasV3 } from "./datas-correcao-model";

const storeId = "store-real";
const osId = "os-1042";
const OP = "op-retorno-0001";

function payload(extra: Record<string, unknown> = {}) {
  return {
    id: osId,
    codigo: "OS-1042",
    status: "entregue",
    operacaoStatusV3: "entregue",
    clienteId: "cli-1",
    cliente: { id: "cli-1", nome: "Cliente", telefone: "11988887777" },
    equipamento: { tipo: "Smartphone", marca: "Samsung", modelo: "S22", numeroSerie: "IMEI-1", acessorios: ["Capa", "Chip"] },
    senhaEquipamento: "1478",
    senhaEquipamentoTipo: "numerica",
    entregaV3: { entregueEm: "2026-08-01T12:00:00.000Z" },
    aberturaV3: { garantiaPrevista: { modelo: "tela", label: "Troca de tela", prazoDias: 90 } },
    timeline: [],
    ...extra,
  };
}

function semear(extra: Record<string, unknown> = {}, id = osId, loja = storeId) {
  mocks.rows.set(id, { id, storeId: loja, numero: "OS-1042", payload: { ...payload(extra), id } });
}
const original = () => mocks.rows.get(osId)!.payload;
const filhas = () => [...mocks.rows.values()].filter((r) => r.payload.vinculoRetornoV3?.osOrigemId === osId);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-15T12:00:00.000Z"));
  mocks.rows.clear();
  mocks.seq = 0;
  semear();
  mocks.update.mockReset();
  mocks.auth.mockReset().mockResolvedValue({ user: { id: "user-1", name: "Operadora" } });
  mocks.guard.mockReset().mockResolvedValue({ ok: true });
  mocks.assertStore.mockReset();
  mocks.emitirEvento.mockReset();
  mocks.revalidatePath.mockReset();
  mocks.criarOS.mockReset().mockImplementation(async (loja: string, draft: any, extras: any) => {
    mocks.seq += 1;
    const id = `os-20${mocks.seq.toString().padStart(2, "0")}`;
    const os = { id, codigo: `OS-20${mocks.seq.toString().padStart(2, "0")}`, storeId: loja, cliente: draft.cliente, equipamento: draft.equipamento, timeline: [], ...extras };
    mocks.rows.set(id, { id, storeId: loja, numero: os.codigo, payload: os });
    return { os };
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("abrirRetornoV3 — abertura canônica", () => {
  it("rejeita storeId vazio antes de autenticação ou I/O", async () => {
    mocks.assertStore.mockImplementationOnce(() => {
      throw new Error("Loja ativa inválida.");
    });
    await expect(abrirRetornoV3("", osId, { motivo: "Touch voltou a falhar" })).rejects.toThrow("Loja ativa inválida.");
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.guard).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("reserva, cria UM atendimento vinculado nos dois lados e não herda senha nem acessórios", async () => {
    const result = await abrirRetornoV3(storeId, osId, {
      motivo: "  Touch voltou a falhar  ",
      observacao: "  Deixou o aparelho  ",
      operacaoId: OP,
      recepcao: { acessorios: ["Carregador", "carregador", " "], senha: "  9090 ", senhaTipo: "numerica" },
    });

    expect(mocks.guard).toHaveBeenCalledWith(storeId, expect.any(Function), "Sem permissão para gerenciar retornos desta OS.");
    expect(mocks.guard).toHaveBeenCalledWith(storeId, expect.any(Function), "Sem permissão para abrir o atendimento de retorno.");
    expect(mocks.criarOS).toHaveBeenCalledTimes(1);
    const [, draft, extras] = mocks.criarOS.mock.calls[0]!;
    expect(draft.cliente).toMatchObject({ id: "cli-1", nome: "Cliente" });
    expect(draft.equipamento).toMatchObject({ marca: "Samsung", modelo: "S22", imei: "IMEI-1", senha: "9090", acessorios: ["Carregador"] });
    expect(draft.equipamento.senha).not.toBe("1478");
    expect(draft.recepcao).toMatchObject({ origem: "garantia", prioridade: "alta" });
    expect(draft.problema).toMatchObject({ defeitoRelatado: "Touch voltou a falhar" });
    expect(draft.garantia).toMatchObject({ modelo: "sem_garantia", prazoDias: 0 });
    expect(extras).toMatchObject({
      tags: ["retorno-garantia", "origem:OS-1042"],
      vinculoRetornoV3: { osOrigemId: osId, osOrigemCodigo: "OS-1042", retornoId: `ret-${OP}`, operacaoId: OP, garantiaAtivaNaAbertura: true, garantiaSituacaoNaAbertura: "ativa" },
    });

    expect(original().retornosV3).toEqual([
      expect.objectContaining({
        id: `ret-${OP}`,
        osOriginalId: osId,
        motivo: "Touch voltou a falhar",
        observacao: "Deixou o aparelho",
        status: "aberto",
        garantiaAtivaNaAbertura: true,
        osRetornoId: "os-2001",
        osRetornoCodigo: "OS-2001",
        operacaoId: OP,
      }),
    ]);
    expect(original().retornosV3[0].reserva).toBeUndefined();
    expect(original().timeline).toEqual([
      expect.objectContaining({ tipo: "garantia_acionada", metadata: expect.objectContaining({ evento: "retorno_aberto", retornoId: `ret-${OP}`, osRetornoId: "os-2001" }) }),
    ]);
    expect(mocks.rows.get("os-2001")!.payload.timeline).toEqual([
      expect.objectContaining({ metadata: expect.objectContaining({ evento: "retorno_atendimento_aberto", retornoId: `ret-${OP}` }) }),
    ]);
    expect(mocks.emitirEvento).toHaveBeenCalledTimes(1);
    expect(mocks.emitirEvento).toHaveBeenCalledWith(expect.objectContaining({ tipo: "os_retorno_aberto", storeId }));
    expect(result).toMatchObject({ situacao: "criado", retornoId: `ret-${OP}` });
    expect(result.atendimento?.id).toBe("os-2001");
  });

  it("R9: entrega só pelo dia — retorno às 16:00 do último dia abre COM garantia; antecipar a entrega depois é impedido", async () => {
    vi.setSystemTime(new Date("2026-04-01T19:00:00.000Z"));
    semear({ entregaV3: { entregueEm: "2026-01-01T15:00:00.000Z", entregueEmMeta: { precisao: "dia", dia: "2026-01-01" } } });
    await abrirRetornoV3(storeId, osId, { motivo: "Tela piscando", operacaoId: OP });
    const gravado = original();
    expect(gravado.retornosV3[0].garantiaAtivaNaAbertura).toBe(true);
    const r = planejarCorrecaoDatasV3(
      gravado as never,
      {
        alteracoes: { dataEntrega: { iso: "2025-12-31T15:00:00.000Z", meta: { precisao: "dia", dia: "2025-12-31" } } },
        esperados: { dataEntrega: "2026-01-01T15:00:00.000Z|dia" },
        motivo: "Entregue um dia antes.",
        confirmarImpactoGarantia: true,
      },
      { agora: new Date("2026-10-04T18:00:00.000Z"), operador: "QA", operadorId: "qa" },
    );
    expect(r.ok).toBe(false);
    expect(!r.ok && r.tipo).toBe("impedimento");
  });

  it("fora da garantia: registra sem cobertura confirmada (origem retorno, texto honesto)", async () => {
    semear({ entregaV3: { entregueEm: "2025-01-01T12:00:00.000Z" } });
    await abrirRetornoV3(storeId, osId, { motivo: "Falha recorrente", operacaoId: OP });
    const retorno = original().retornosV3[0];
    expect(retorno.garantiaAtivaNaAbertura).toBe(false);
    expect(retorno.garantiaSituacaoNaAbertura).toBe("vencida");
    expect(mocks.criarOS.mock.calls[0]![1].recepcao.origem).toBe("retorno");
    expect(original().timeline[0].conteudo).toContain("sem cobertura confirmada");
  });

  it("garantia não informada nunca vira cobertura positiva", async () => {
    semear({ aberturaV3: {} });
    await abrirRetornoV3(storeId, osId, { motivo: "Voltou", operacaoId: OP });
    expect(original().retornosV3[0]).toMatchObject({ garantiaAtivaNaAbertura: false, garantiaSituacaoNaAbertura: "nenhuma" });
    expect(original().timeline[0].conteudo).toContain("Garantia não informada");
  });

  it("exige motivo e não grava estado parcial", async () => {
    await expect(abrirRetornoV3(storeId, osId, { motivo: "  " })).rejects.toThrow("Informe o motivo do retorno.");
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.emitirEvento).not.toHaveBeenCalled();
    expect(mocks.criarOS).not.toHaveBeenCalled();
  });

  it("sem permissão de criar OS: recusa ANTES de qualquer escrita", async () => {
    mocks.guard.mockImplementation(async (_s: string, _c: unknown, msg: string) => (msg.includes("abrir o atendimento") ? { ok: false, error: msg } : { ok: true }));
    await expect(abrirRetornoV3(storeId, osId, { motivo: "Falha", operacaoId: OP })).rejects.toThrow("Sem permissão para abrir o atendimento de retorno.");
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.criarOS).not.toHaveBeenCalled();
  });

  it("OS de outra loja: 'OS não encontrada' sem reserva, atendimento ou leitura de dados", async () => {
    semear({}, "os-loja-b", "store-b");
    await expect(abrirRetornoV3(storeId, "os-loja-b", { motivo: "Falha", operacaoId: OP })).rejects.toThrow("OS não encontrada.");
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.criarOS).not.toHaveBeenCalled();
    expect(mocks.rows.get("os-loja-b")!.payload.retornosV3).toBeUndefined();
  });

  it("identificador de operação malformado é recusado", async () => {
    await expect(abrirRetornoV3(storeId, osId, { motivo: "Falha", operacaoId: "x y" })).rejects.toThrow("Identificador da operação de retorno inválido.");
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe("abrirRetornoV3 — enquadramento recusado no servidor", () => {
  it("OS não entregue: recusa (ocorrência é observação interna), nada gravado", async () => {
    semear({ entregaV3: undefined, entregueEm: undefined, status: "pronta", operacaoStatusV3: "pronta" });
    await expect(abrirRetornoV3(storeId, osId, { motivo: "Relato antecipado", operacaoId: OP })).rejects.toThrow("observação interna");
    expect(mocks.criarOS).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(original().retornosV3).toBeUndefined();
  });

  it("OS cancelada: recusa", async () => {
    semear({ status: "cancelada", operacaoStatusV3: "cancelada" });
    await expect(abrirRetornoV3(storeId, osId, { motivo: "Falha", operacaoId: OP })).rejects.toThrow("OS cancelada não admite retorno.");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("OS original sem cliente cadastrado: recusa sem criar cadastro novo nem reserva", async () => {
    semear({ clienteId: "", cliente: { nome: "Avulso" } });
    await expect(abrirRetornoV3(storeId, osId, { motivo: "Falha", operacaoId: OP })).rejects.toThrow("não tem cliente cadastrado vinculado");
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.criarOS).not.toHaveBeenCalled();
  });

  it("aparelho sem marca/modelo: a validação oficial bloqueia antes da reserva", async () => {
    semear({ equipamento: { tipo: "Smartphone", marca: "", modelo: "" } });
    await expect(abrirRetornoV3(storeId, osId, { motivo: "Falha", operacaoId: OP })).rejects.toThrow("Informe marca e modelo do equipamento.");
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe("abrirRetornoV3 — idempotência e concorrência (T56, unidade)", () => {
  it("replay da MESMA operação devolve o mesmo atendimento: zero criação, zero escrita, zero evento", async () => {
    await abrirRetornoV3(storeId, osId, { motivo: "Touch", operacaoId: OP });
    mocks.update.mockClear();
    mocks.emitirEvento.mockClear();
    const replay = await abrirRetornoV3(storeId, osId, { motivo: "Touch", operacaoId: OP });
    expect(replay).toMatchObject({ situacao: "recuperado", retornoId: `ret-${OP}` });
    expect(replay.atendimento?.id).toBe("os-2001");
    expect(mocks.criarOS).toHaveBeenCalledTimes(1);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.emitirEvento).not.toHaveBeenCalled();
    expect(original().timeline).toHaveLength(1);
  });

  it("mesma operação com relato divergente: recusa e preserva o motivo original", async () => {
    await abrirRetornoV3(storeId, osId, { motivo: "Touch", operacaoId: OP });
    await expect(abrirRetornoV3(storeId, osId, { motivo: "Outra coisa", operacaoId: OP })).rejects.toThrow("outro relato");
    expect(original().retornosV3[0].motivo).toBe("Touch");
    expect(filhas()).toHaveLength(1);
  });

  it("outra operação com retorno já vinculado: recusa apontando o atendimento existente", async () => {
    await abrirRetornoV3(storeId, osId, { motivo: "Touch", operacaoId: OP });
    await expect(abrirRetornoV3(storeId, osId, { motivo: "Touch", operacaoId: "op-retorno-0002" })).rejects.toThrow(
      "Já existe um retorno em andamento para esta OS. Continue no atendimento OS-2001.",
    );
    expect(mocks.criarOS).toHaveBeenCalledTimes(1);
  });

  it("reserva VIVA sem atendimento: mesma operação aguarda; outra operação também — nada é criado", async () => {
    semear({
      retornosV3: [{ id: `ret-${OP}`, osOriginalId: osId, motivo: "Touch", criadoEm: "2026-08-15T11:59:00.000Z", status: "aberto", operacaoId: OP, reserva: { token: "t1", expiraEm: "2026-08-15T12:10:00.000Z" } }],
    });
    await expect(abrirRetornoV3(storeId, osId, { motivo: "Touch", operacaoId: OP })).rejects.toThrow("ainda está em processamento");
    await expect(abrirRetornoV3(storeId, osId, { motivo: "Outro", operacaoId: "op-retorno-0002" })).rejects.toThrow("Outra abertura de retorno");
    expect(mocks.criarOS).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("falha entre criação e vínculo: a filha existente é ADOTADA no retry (sem nova criação)", async () => {
    semear({
      retornosV3: [{ id: `ret-${OP}`, osOriginalId: osId, motivo: "Touch", criadoEm: "2026-08-15T11:59:00.000Z", status: "aberto", operacaoId: OP, garantiaSituacaoNaAbertura: "ativa", reserva: { token: "t1", expiraEm: "2026-08-15T12:10:00.000Z" } }],
    });
    mocks.rows.set("os-orfa", { id: "os-orfa", storeId, numero: "OS-ORFA", payload: { id: "os-orfa", codigo: "OS-ORFA", timeline: [], vinculoRetornoV3: { osOrigemId: osId, retornoId: `ret-${OP}`, operacaoId: OP } } });
    const r = await abrirRetornoV3(storeId, osId, { motivo: "Touch", operacaoId: OP });
    expect(r).toMatchObject({ situacao: "recuperado" });
    expect(r.atendimento?.id).toBe("os-orfa");
    expect(mocks.criarOS).not.toHaveBeenCalled();
    expect(original().retornosV3[0]).toMatchObject({ osRetornoId: "os-orfa", osRetornoCodigo: "OS-ORFA" });
    expect(original().retornosV3[0].reserva).toBeUndefined();
    expect(original().timeline.filter((e: any) => e.metadata?.evento === "retorno_aberto")).toHaveLength(1);
  });

  it("retorno legado (sem operação) sem atendimento: abre o atendimento DELE, preservando o relato", async () => {
    semear({ retornosV3: [{ id: "ret-open", osOriginalId: osId, motivo: "Primeiro", criadoEm: "2026-08-14T12:00:00.000Z", status: "aberto" }] });
    const r = await abrirRetornoV3(storeId, osId, { motivo: "Primeiro", operacaoId: OP });
    expect(mocks.criarOS).toHaveBeenCalledTimes(1);
    expect(mocks.criarOS.mock.calls[0]![1].problema.defeitoRelatado).toBe("Primeiro");
    expect(original().retornosV3).toEqual([expect.objectContaining({ id: "ret-open", motivo: "Primeiro", osRetornoId: "os-2001", operacaoId: OP })]);
    expect(r.retornoId).toBe("ret-open");
  });

  it("reserva EXPIRADA de outra operação, sem atendimento: descartada com auditoria e nova abertura", async () => {
    semear({
      retornosV3: [{ id: "ret-op-velha-0001", osOriginalId: osId, motivo: "Abandonado", criadoEm: "2026-08-15T10:00:00.000Z", status: "aberto", operacaoId: "op-velha-0001", reserva: { token: "t0", expiraEm: "2026-08-15T10:15:00.000Z" } }],
    });
    await abrirRetornoV3(storeId, osId, { motivo: "Novo relato", operacaoId: OP });
    expect(original().retornosV3).toEqual([expect.objectContaining({ id: `ret-${OP}`, motivo: "Novo relato", osRetornoId: "os-2001" })]);
    expect(original().timeline.map((e: any) => e.metadata?.evento)).toEqual(["retorno_reserva_descartada", "retorno_aberto"]);
  });

  it("falha na criação: a PRÓPRIA reserva é removida e o erro sobe (nada fica aberto)", async () => {
    mocks.criarOS.mockRejectedValueOnce(new Error("Falha ao criar a OS."));
    await expect(abrirRetornoV3(storeId, osId, { motivo: "Touch", operacaoId: OP })).rejects.toThrow("Falha ao criar a OS.");
    expect(original().retornosV3).toEqual([]);
    expect(filhas()).toHaveLength(0);
    expect(mocks.emitirEvento).not.toHaveBeenCalled();
  });

  it("criação gravou mas a action falhou depois: a compensação ADOTA a filha (sucesso honesto)", async () => {
    mocks.criarOS.mockImplementationOnce(async (loja: string, _draft: any, extras: any) => {
      mocks.rows.set("os-gravada", { id: "os-gravada", storeId: loja, numero: "OS-G", payload: { id: "os-gravada", codigo: "OS-G", timeline: [], ...extras } });
      throw new Error("revalidate falhou depois do commit");
    });
    const r = await abrirRetornoV3(storeId, osId, { motivo: "Touch", operacaoId: OP });
    expect(r).toMatchObject({ situacao: "recuperado" });
    expect(original().retornosV3[0]).toMatchObject({ osRetornoId: "os-gravada" });
  });

  it("retry concorrente da MESMA operação adotou a filha antes do meu vínculo: sucesso, sem segundo anúncio nem evento duplicado", async () => {
    mocks.criarOS.mockImplementationOnce(async (loja: string, _draft: any, extras: any) => {
      mocks.rows.set("os-minha", { id: "os-minha", storeId: loja, numero: "OS-MINHA", payload: { id: "os-minha", codigo: "OS-MINHA", timeline: [], ...extras } });
      // O retry (outra requisição) achou a filha pelo vínculo e a adotou, anunciando ele mesmo.
      const o = mocks.rows.get(osId)!.payload;
      o.retornosV3 = o.retornosV3.map((r: any) => ({ ...r, osRetornoId: "os-minha", osRetornoCodigo: "OS-MINHA", reserva: undefined }));
      o.timeline = [...o.timeline, { id: "ev-adocao", tipo: "garantia_acionada", metadata: { evento: "retorno_aberto", retornoId: `ret-${OP}` } }];
      return { os: { id: "os-minha", codigo: "OS-MINHA" } };
    });
    const r = await abrirRetornoV3(storeId, osId, { motivo: "Touch", operacaoId: OP });
    expect(r).toMatchObject({ situacao: "criado" });
    expect(r.atendimento?.id).toBe("os-minha");
    expect(mocks.emitirEvento).not.toHaveBeenCalled();
    expect(original().timeline.filter((e: any) => e.metadata?.evento === "retorno_aberto")).toHaveLength(1);
    expect(mocks.rows.get("os-minha")!.payload.timeline.filter((e: any) => e.metadata?.evento === "retorno_atendimento_aberto")).toHaveLength(1);
  });

  it("replay repara o evento informativo da filha se faltar (sem nova filha, sem novo vínculo)", async () => {
    await abrirRetornoV3(storeId, osId, { motivo: "Touch", operacaoId: OP });
    mocks.rows.get("os-2001")!.payload.timeline = [];
    const r = await abrirRetornoV3(storeId, osId, { motivo: "Touch", operacaoId: OP });
    expect(r.situacao).toBe("recuperado");
    expect(mocks.rows.get("os-2001")!.payload.timeline).toHaveLength(1);
    expect(mocks.criarOS).toHaveBeenCalledTimes(1);
  });

  it("filha excedente (retorno já vinculado a outra no meio do caminho): descartada explicitamente, erro aponta a válida", async () => {
    mocks.criarOS.mockImplementationOnce(async (loja: string, _draft: any, extras: any) => {
      // Enquanto esta criação roda, outro processo vinculou o retorno a OUTRO atendimento.
      const o = mocks.rows.get(osId)!.payload;
      o.retornosV3 = o.retornosV3.map((r: any) => ({ ...r, osRetornoId: "os-valida", osRetornoCodigo: "OS-VALIDA", reserva: undefined }));
      mocks.rows.set("os-extra", { id: "os-extra", storeId: loja, numero: "OS-EXTRA", payload: { id: "os-extra", codigo: "OS-EXTRA", timeline: [], ...extras } });
      return { os: { id: "os-extra", codigo: "OS-EXTRA" } };
    });
    await expect(abrirRetornoV3(storeId, osId, { motivo: "Touch", operacaoId: OP })).rejects.toThrow("já foi aberto no atendimento OS-VALIDA");
    const extra = mocks.rows.get("os-extra")!.payload;
    expect(extra.vinculoRetornoV3).toMatchObject({ descartadoMotivo: "abertura_concorrente", vinculoValidoId: "os-valida" });
    expect(extra.vinculoRetornoV3.descartadoEm).toBeTruthy();
    expect(extra.timeline).toEqual([expect.objectContaining({ metadata: expect.objectContaining({ evento: "retorno_atendimento_descartado" }) })]);
    expect(original().retornosV3[0].osRetornoId).toBe("os-valida");
  });
});

describe("finalizarRetornoV3", () => {
  it("finaliza o retorno correto, preserva vínculo e registra resolução uma vez", async () => {
    semear({ retornosV3: [{ id: "ret-1", osOriginalId: osId, osOriginalCodigo: "OS-1042", motivo: "Touch", criadoEm: "2026-08-14T12:00:00.000Z", status: "aberto", garantiaAtivaNaAbertura: true, osRetornoId: "os-9" }] });
    await finalizarRetornoV3(storeId, osId, "ret-1", { observacao: "  Tela substituída novamente  " });
    expect(original().retornosV3).toEqual([
      expect.objectContaining({ id: "ret-1", osOriginalId: osId, status: "finalizado", observacaoFinal: "Tela substituída novamente", finalizadoPor: "Operadora", osRetornoId: "os-9" }),
    ]);
    expect(original().timeline).toEqual([
      expect.objectContaining({ tipo: "observacao", metadata: expect.objectContaining({ retornoId: "ret-1", evento: "retorno_finalizado" }) }),
    ]);
    expect(mocks.emitirEvento).toHaveBeenCalledWith(expect.objectContaining({ tipo: "os_retorno_finalizado", storeId }));
  });

  it("rejeita retorno já finalizado sem duplicar timeline", async () => {
    semear({ retornosV3: [{ id: "ret-1", osOriginalId: osId, motivo: "Touch", criadoEm: "2026-08-14T12:00:00.000Z", status: "finalizado" }] });
    await expect(finalizarRetornoV3(storeId, osId, "ret-1")).rejects.toThrow("Este retorno já está finalizado.");
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.emitirEvento).not.toHaveBeenCalled();
  });

  it("não finaliza retorno cuja abertura ainda está em processamento", async () => {
    semear({ retornosV3: [{ id: "ret-1", osOriginalId: osId, motivo: "Touch", criadoEm: "2026-08-15T11:59:00.000Z", status: "aberto", operacaoId: OP, reserva: { token: "t", expiraEm: "2026-08-15T12:10:00.000Z" } }] });
    await expect(finalizarRetornoV3(storeId, osId, "ret-1")).rejects.toThrow("ainda está em processamento");
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe("buscarOrigensRetornoV3 / lerOrigemRetornoV3 — leitura da loja ativa", () => {
  it("exige acesso à loja e devolve resumo SEM senha", async () => {
    const itens = await buscarOrigensRetornoV3(storeId, "S22");
    expect(mocks.guard).toHaveBeenCalledWith(storeId, expect.any(Function), "Sem permissão para consultar ordens desta unidade.");
    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({ osId, codigo: "OS-1042", enquadramento: { id: "garantia_ativa", acao: "abrir_retorno" }, acessoriosOriginais: ["Capa", "Chip"] });
    expect(JSON.stringify(itens)).not.toContain("1478");
  });

  it("termo curto não consulta; outra loja nunca aparece", async () => {
    semear({}, "os-b", "store-b");
    expect(await buscarOrigensRetornoV3(storeId, "S")).toEqual([]);
    const itens = await buscarOrigensRetornoV3(storeId, "Samsung");
    expect(itens.map((i) => i.osId)).toEqual([osId]);
  });

  it("sem permissão de leitura: recusa", async () => {
    mocks.guard.mockResolvedValue({ ok: false, error: "Sem permissão para esta unidade" });
    await expect(buscarOrigensRetornoV3(storeId, "S22")).rejects.toThrow("Sem permissão para esta unidade");
  });

  it("lerOrigemRetornoV3: OS de outra loja = null", async () => {
    semear({}, "os-b", "store-b");
    expect(await lerOrigemRetornoV3(storeId, "os-b")).toBeNull();
    expect((await lerOrigemRetornoV3(storeId, osId))?.codigo).toBe("OS-1042");
  });
});
