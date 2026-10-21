import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrdemServico } from "@/types/os";
import { getEnterprisePermissions } from "@/lib/auth/enterprise-permissions";

const db = vi.hoisted(() => ({
  payload: {} as Record<string, any>, messages: [] as Record<string, any>[], writes: 0,
  failConfirm: 0, failHistory: false, failCache: false, permission: true, apiPermission: true,
  authenticated: true, emptyReceipt: false, transportError: false, credentialError: false,
  queue: Promise.resolve() as Promise<unknown>, transport: vi.fn(), publicar: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => { if (db.failCache) throw new Error("cache indisponível"); } }));
vi.mock("./event-publisher", () => ({ emitirEventoOperacaoV3: db.publicar }));
vi.mock("@/auth", () => ({ auth: async () => db.authenticated ? { user: { id: "operador-1", name: "Ana Operadora" } } : null }));
vi.mock("@/lib/auth/guard-enterprise", () => ({ requireEnterpriseWith: async (sid: string, check: (p: unknown) => boolean) => {
  const p = structuredClone(getEnterprisePermissions("admin"));
  p.operacoes.editarOs = db.permission;
  p.hubs.whatsapp = db.apiPermission;
  return sid === "unidade-a" && check(p) ? { ok: true } : { ok: false, error: "Sem permissão para esta loja." };
} }));
vi.mock("@/lib/whatsapp/store-credentials", () => ({ resolveStoreWhatsAppCredentials: async () => {
  if (db.credentialError) return null;
  return { phoneNumberId: "fixture-phone", accessToken: "fixture-token" };
} }));
vi.mock("@/lib/whatsapp", () => ({
  assertValidWhatsAppRecipientDigits: (s: string) => s,
  firstOutboundWamid: (r: { messages?: { id: string }[] }) => r.messages?.[0]?.id ?? "",
  sendTextMessage: async (...args: unknown[]) => {
    db.transport(...args);
    if (db.transportError) throw new Error("conexão interrompida");
    return { messages: db.emptyReceipt ? [] : [{ id: `wamid.fixture.${db.transport.mock.calls.length}` }] };
  },
}));
vi.mock("@/lib/prisma", () => {
  const client: any = {
    $queryRaw: async () => [{ id: "os-a" }],
    ordemServico: {
      findFirst: async (q: any) => q.where.storeId === "unidade-a" && q.where.id === "os-a" ? { id: "os-a", storeId: "unidade-a", payload: structuredClone(db.payload), valorTotal: 300 } : null,
      update: async (q: any) => {
        const ultimo = q.data.payload.orcamento?.compartilhamentosV3?.at(-1);
        if ((ultimo?.estado === "aceito_api" || ultimo?.estado === "informado_operador") && db.failConfirm > 0) { db.failConfirm--; throw new Error("gravação interrompida"); }
        db.payload = structuredClone(q.data.payload); db.writes++; return q.data;
      },
    },
    whatsAppConversation: {
      findFirst: async (q: any) => q.where.storeId === "unidade-a" ? { id: "conversa-a", contact: { phoneDigits: "5511999990000" } } : null,
      update: async () => ({}),
    },
    whatsAppMessage: {
      create: async (q: any) => {
        if (db.failHistory) throw new Error("histórico indisponível");
        const m = { id: `mensagem-${db.messages.length}`, ...structuredClone(q.data) }; db.messages.push(m); return m;
      },
      findFirst: async (q: any) => db.messages.find((m) => m.storeId === q.where.storeId && m.direction === q.where.direction && m.payload.orcamentoV3?.tentativaId === q.where.payload.equals) ?? null,
    },
    logsAuditoria: { create: async () => ({}) },
    contaReceberTitulo: { findUnique: async () => null },
  };
  client.$transaction = (fn: (tx: unknown) => unknown) => {
    const run = db.queue.then(async () => {
      const anterior = structuredClone(db.payload), mensagens = structuredClone(db.messages);
      try { return await fn(client); } catch (e) { db.payload = anterior; db.messages = mensagens; throw e; }
    });
    db.queue = run.catch(() => undefined); return run;
  };
  return { prisma: client };
});

import { enviarOrcamentoPorCanalV3, prepararCompartilhamentoOrcamentoV3 } from "./orcamento-envio-actions";
import { resumoEnvioOrcamentoV3 } from "./orcamento-envio-model";
import type { OrcamentoV3 } from "./orcamento-model";
import { addMessage, CloudApiTextAcceptedError, sendCloudApiTextAndRecord } from "@/lib/whatsapp/whatsapp-service";
import { aprovarOrcamentoV3, corrigirOrcamentoV3, enviarOrcamentoV3, registrarEnvioOrcamento, salvarOrcamentoV3 } from "./orcamento-actions";
import { atualizarStatusComercialV3, marcarOrcamentoPreOsV3, converterOrcamentoEmOSV3 } from "./comercial-pre-os-actions";

beforeEach(() => {
  db.payload = { id: "os-a", codigo: "ORC-001", status: "aberta", timeline: [],
    cliente: { id: "cliente-a", nome: "Cliente Fixture", telefone: "11999990000" }, equipamento: { marca: "Marca", modelo: "Modelo", defeitoRelatado: "Tela" },
    comercialV4: { tipo: "orcamento_pre_os", statusComercial: "rascunho", observacaoInterna: "SEGREDO INTERNO" },
    orcamento: { id: "orc-a", status: "rascunho", total: 300, desconto: 0, criadoEm: "2026-10-01T12:00:00.000Z", servicos: [{ id: "sv", descricao: "Troca de tela", valor: 300, custoV3: 81.23 }], pecas: [] },
  };
  Object.assign(db, { writes: 0, failConfirm: 0, failHistory: false, failCache: false, permission: true, apiPermission: true, authenticated: true, emptyReceipt: false, transportError: false, credentialError: false, messages: [], queue: Promise.resolve() });
  db.transport.mockReset();
  db.publicar.mockReset();
});
const preparar = (canal = "whatsapp" as const) => prepararCompartilhamentoOrcamentoV3("unidade-a", "os-a", canal);
const confirmar = (tentativaId: string, modo: "manual" | "api" | "recuperar_api" = "manual") => enviarOrcamentoPorCanalV3("unidade-a", "os-a", "whatsapp", { tentativaId, confirmado: true, modo });
const orc = () => db.payload.orcamento as OrcamentoV3;

describe("orçamento — preparação e confirmação honesta", () => {
  it("prepara sem envio, sem transição de OS, sem prazo inventado e sem custos na mensagem", async () => {
    const r = await preparar();
    expect(orc().status).toBe("rascunho");
    expect(orc().enviadoEm).toBeUndefined(); expect(orc().validoAte).toBeUndefined();
    expect(db.payload.status).toBe("aberta"); expect(db.payload.comercialV4.statusComercial).toBe("rascunho");
    expect(db.payload.timeline.map((e: any) => e.tipo)).toEqual(["observacao"]);
    expect(r.mensagem).toContain("300,00"); expect(r.mensagem).not.toMatch(/81,23|SEGREDO|custoV3/);
    expect(resumoEnvioOrcamentoV3(orc()).estado).toBe("compartilhamento_iniciado");
    expect(db.transport).not.toHaveBeenCalled();
  });
  it("preparação repetida e concorrente reutiliza tentativa sem duplicar timeline", async () => {
    const [a, b] = await Promise.all([preparar(), preparar()]);
    expect(a.tentativaId).toBe(b.tentativaId); expect(db.payload.timeline).toHaveLength(1);
  });
  it("chamada antiga ou confirmação falsa nunca registra enviado", async () => {
    await expect(enviarOrcamentoPorCanalV3("unidade-a", "os-a", "whatsapp")).rejects.toThrow(/explicitamente/);
    const p = await preparar();
    await expect(enviarOrcamentoPorCanalV3("unidade-a", "os-a", "whatsapp", { tentativaId: p.tentativaId, confirmado: false } as any)).rejects.toThrow(/explicitamente/);
    expect(orc().status).toBe("rascunho");
  });
  it("declaração manual sincroniza orçamento, pré-OS, OS e timeline numa escrita e registra operador/instante/canal/natureza", async () => {
    const p = await preparar(); const antes = db.writes;
    const r = await confirmar(p.tentativaId);
    expect(r.ok).toBe(true); expect(db.writes - antes).toBe(1);
    expect(orc().status).toBe("enviado"); expect(db.payload.status).toBe("aguardando_aprovacao");
    expect(db.payload.comercialV4.statusComercial).toBe("enviado");
    expect(orc().compartilhamentosV3?.[0]).toMatchObject({ canal: "whatsapp", natureza: "declaracao_manual", confirmadoPor: { id: "operador-1", nome: "Ana Operadora" }, confirmadoEm: expect.any(String) });
    expect(db.payload.timeline.at(-1).metadata).toMatchObject({ natureza: "declaracao_manual", canal: "whatsapp", operadorId: "operador-1", entregaConfirmada: false });
    expect(db.transport).not.toHaveBeenCalled();
    expect(resumoEnvioOrcamentoV3(orc())).toMatchObject({ estado: "envio_informado_operador", entregaConfirmada: false });
  });
  it("confirmações concorrentes e retry após perda da resposta são no-op; reenvio explícito preserva validade/enviadoEm", async () => {
    const p = await preparar();
    await Promise.all([confirmar(p.tentativaId), confirmar(p.tentativaId)]);
    const validade = orc().validoAte, enviadoEm = orc().enviadoEm;
    expect(db.payload.timeline.filter((e: any) => e.tipo === "orcamento_enviado")).toHaveLength(1);
    const novo = await preparar(); expect(novo.tentativaId).not.toBe(p.tentativaId);
    expect((await confirmar(novo.tentativaId)).reenvio).toBe(true);
    expect(orc().validoAte).toBe(validade); expect(orc().enviadoEm).toBe(enviadoEm);
  });
  it("erro antes da confirmação faz rollback completo e permite retry da mesma declaração", async () => {
    const p = await preparar(); db.failConfirm = 1;
    await expect(confirmar(p.tentativaId)).rejects.toThrow(/interrompida/);
    expect(orc().status).toBe("rascunho"); expect(db.payload.comercialV4.statusComercial).toBe("rascunho");
    expect(db.payload.timeline).toHaveLength(1);
    await confirmar(p.tentativaId); expect(orc().status).toBe("enviado");
  });
  it("falha de cache após commit preserva evidência e repetição não duplica evento", async () => {
    const p = await preparar(); db.failCache = true;
    expect((await confirmar(p.tentativaId)).avisoRegistro).toBe(true);
    await confirmar(p.tentativaId); expect(db.payload.timeline).toHaveLength(2);
  });
  it("orçamento editado depois de preparar exige nova preparação", async () => {
    const p = await preparar(); db.payload.orcamento.servicos[0].valor = 500;
    await expect(confirmar(p.tentativaId)).rejects.toThrow(/mudou/);
    expect(orc().status).toBe("rascunho");
  });
  it.each(["aprovado", "recusado"])("não prepara orçamento %s", async (status) => {
    db.payload.orcamento.status = status; await expect(preparar()).rejects.toThrow(status);
  });
  it("sem orçamento materializado, canal inválido ou sem itens visíveis não prepara", async () => {
    await expect(prepararCompartilhamentoOrcamentoV3("unidade-a", "os-a", "email" as any)).rejects.toThrow(/Canal/);
    db.payload.orcamento.sintetizado = true; await expect(preparar()).rejects.toThrow(/materializado/);
    delete db.payload.orcamento.sintetizado; db.payload.orcamento.servicos = [];
    await expect(preparar()).rejects.toThrow(/itens visíveis/);
  });
});

describe("API oficial — transporte mockado, aceite verificável e recuperação", () => {
  it("resumo prioriza reserva pendente mesmo quando há preparação posterior de outro canal", async () => {
    const p = await preparar();
    await prepararCompartilhamentoOrcamentoV3("unidade-a", "os-a", "presencial");
    db.transportError = true;
    await confirmar(p.tentativaId, "api");
    expect(resumoEnvioOrcamentoV3(orc())).toMatchObject({ estado: "api_sem_confirmacao", ultimo: { id: p.tentativaId }, pendente: { id: p.tentativaId } });
    await expect(preparar()).rejects.toThrow(/sem resultado confirmado/);
    const manual = orc().compartilhamentosV3!.find((e) => e.canal === "presencial")!;
    await expect(enviarOrcamentoPorCanalV3("unidade-a", "os-a", "presencial", { tentativaId: manual.id, confirmado: true })).rejects.toThrow(/outro envio pela API pendente/);
    expect(db.transport).toHaveBeenCalledOnce();
  });
  it("API usa WhatsApp do cliente quando o telefone está ausente, como a UI", async () => {
    db.payload.cliente.whatsapp = db.payload.cliente.telefone;
    delete db.payload.cliente.telefone;
    const p = await preparar();
    expect(await confirmar(p.tentativaId, "api")).toMatchObject({ ok: true, aceitoApi: true });
  });
  it("aceite recebido depois da aprovação preserva a decisão e não publica nova transição", async () => {
    const p = await preparar();
    db.transport.mockImplementation(() => { db.payload.orcamento.status = "aprovado"; db.payload.comercialV4.statusComercial = "aprovado"; });
    expect(await confirmar(p.tentativaId, "api")).toMatchObject({ ok: true, aceitoApi: true });
    expect(orc().status).toBe("aprovado");
    expect(db.payload.comercialV4.statusComercial).toBe("aprovado");
    expect(db.publicar).not.toHaveBeenCalled();
  });
  it("envio comum do Hub preserva o contrato legado sem exigir recibo de orçamento", async () => {
    db.emptyReceipt = true;
    expect(await sendCloudApiTextAndRecord("unidade-a", "conversa-a", "Mensagem comum")).toMatchObject({ wamid: "", message: { body: "Mensagem comum" } });
    db.failHistory = true;
    await expect(sendCloudApiTextAndRecord("unidade-a", "conversa-a", "Mensagem comum")).rejects.not.toBeInstanceOf(CloudApiTextAcceptedError);
  });
  it("só marca enviado após wamid e reserva antes de transportar; nunca confirma entrega", async () => {
    const p = await preparar();
    db.transport.mockImplementation(() => { expect(orc().status).toBe("rascunho"); expect(orc().compartilhamentosV3?.[0].estado).toBe("api_em_andamento"); });
    const r = await confirmar(p.tentativaId, "api");
    expect(r).toMatchObject({ ok: true, aceitoApi: true, wamid: "wamid.fixture.1" });
    expect(orc().status).toBe("enviado"); expect(resumoEnvioOrcamentoV3(orc())).toMatchObject({ estado: "aceito_api", entregaConfirmada: false });
    expect(db.messages[0].payload.orcamentoV3).toEqual({ osId: "os-a", tentativaId: p.tentativaId });
    expect(db.transport.mock.calls[0][2]).not.toMatch(/81,23|SEGREDO|custo/);
    await confirmar(p.tentativaId, "api"); expect(db.transport).toHaveBeenCalledTimes(1);
  });
  it("credenciais ausentes falham antes do transporte e preservam rascunho/tentativa preparada", async () => {
    const p = await preparar(); db.credentialError = true;
    await expect(confirmar(p.tentativaId, "api")).rejects.toThrow(/não configurado/);
    expect(orc().status).toBe("rascunho"); expect(orc().compartilhamentosV3?.[0].estado).toBe("preparado"); expect(db.transport).not.toHaveBeenCalled();
  });
  it.each(["emptyReceipt", "transportError"] as const)("%s: resultado incerto bloqueia nova tentativa e retry automático", async (flag) => {
    const p = await preparar(); db[flag] = true;
    expect(await confirmar(p.tentativaId, "api")).toMatchObject({ ok: false, pendente: true });
    expect(orc().status).toBe("rascunho");
    await confirmar(p.tentativaId, "api"); await expect(preparar()).rejects.toThrow(/sem resultado confirmado/);
    expect(db.transport).toHaveBeenCalledTimes(1);
  });
  it("erro no histórico após aceite mantém evidência/status e não duplica o transporte", async () => {
    const p = await preparar(); db.failHistory = true;
    const r = await confirmar(p.tentativaId, "api");
    expect(r).toMatchObject({ ok: true, aceitoApi: true, avisoRegistro: true, wamid: "wamid.fixture.1" });
    expect(orc().status).toBe("enviado");
    await confirmar(p.tentativaId, "api"); expect(db.transport).toHaveBeenCalledTimes(1);
  });
  it("erro na gravação do aceite recupera pelo recibo oficial persistido, sem transporte adicional", async () => {
    const p = await preparar(); db.failConfirm = 2;
    const r = await confirmar(p.tentativaId, "api");
    expect(r).toMatchObject({ ok: false, aceitoApi: true, pendente: true, wamid: "wamid.fixture.1" });
    expect(orc().status).toBe("rascunho"); expect(db.messages).toHaveLength(1);
    await confirmar(p.tentativaId, "api"); expect(db.transport).toHaveBeenCalledTimes(1);
    expect(await confirmar(p.tentativaId, "recuperar_api")).toMatchObject({ ok: true, aceitoApi: true });
    expect(orc().status).toBe("enviado"); expect(db.transport).toHaveBeenCalledTimes(1);
  });
  it("dois cliques concorrentes fazem no máximo um transporte", async () => {
    const p = await preparar(); await Promise.allSettled([confirmar(p.tentativaId, "api"), confirmar(p.tentativaId, "api")]);
    expect(db.transport).toHaveBeenCalledTimes(1);
  });
  it("falha nas duas persistências devolve recibo para conferência e mantém reserva contra duplicação", async () => {
    const p = await preparar(); db.failConfirm = 2; db.failHistory = true;
    expect(await confirmar(p.tentativaId, "api")).toMatchObject({ ok: false, aceitoApi: true, pendente: true, wamid: "wamid.fixture.1" });
    expect(orc().compartilhamentosV3?.[0].estado).toBe("api_em_andamento");
    await confirmar(p.tentativaId, "api"); expect(db.transport).toHaveBeenCalledTimes(1);
  });
  it("alteração durante transporte guarda recibo da versão anterior sem marcar a proposta nova como enviada", async () => {
    const p = await preparar(); db.transport.mockImplementation(() => { db.payload.orcamento.servicos[0].valor = 500; });
    await confirmar(p.tentativaId, "api");
    expect(orc().status).toBe("rascunho"); expect(orc().compartilhamentosV3?.[0].api?.wamid).toBe("wamid.fixture.1");
    expect(db.payload.timeline.at(-1).metadata.versaoAlterada).toBe(true);
    expect(db.payload.timeline.at(-1).metadata.totalSnapshot).toBe(300);
  });
  it("recuperação sem recibo oficial nunca transforma alegação em aceite", async () => {
    const p = await preparar(); db.transportError = true; await confirmar(p.tentativaId, "api");
    expect(await confirmar(p.tentativaId, "recuperar_api")).toMatchObject({ ok: false, pendente: true });
    expect(orc().status).toBe("rascunho");
  });
  it("histórico anexado por cliente não pode forjar o vínculo do transporte oficial", async () => {
    const p = await preparar(); db.transportError = true; await confirmar(p.tentativaId, "api");
    await addMessage("unidade-a", "conversa-a", {
      direction: "outbound", body: "Anotação manual", externalMessageId: "wamid.forjado",
      payload: { cloud: { wamid: "wamid.forjado", aceitoEm: new Date().toISOString() }, orcamentoV3: { osId: "os-a", tentativaId: p.tentativaId } },
    });
    expect(db.messages[0].payload.orcamentoV3).toBeUndefined();
    expect(await confirmar(p.tentativaId, "recuperar_api")).toMatchObject({ ok: false, pendente: true });
    expect(orc().status).toBe("rascunho");
  });
});

describe("loja ativa e permissões", () => {
  it.each([null, 42, {}, []])("tentativaId inválido %s não escreve nem gera TypeError", async (tentativaId) => {
    await expect(enviarOrcamentoPorCanalV3("unidade-a", "os-a", "whatsapp", { tentativaId, confirmado: true } as any)).rejects.toThrow(/explicitamente/);
    expect(db.writes).toBe(0);
  });
  it("loja ausente, loja sem acesso, OS de outra loja e sessão ausente não escrevem", async () => {
    await expect(prepararCompartilhamentoOrcamentoV3("", "os-a", "whatsapp")).rejects.toThrow(/unidade ativa/);
    await expect(prepararCompartilhamentoOrcamentoV3("unidade-b", "os-a", "whatsapp")).rejects.toThrow(/permissão/);
    await expect(prepararCompartilhamentoOrcamentoV3("unidade-a", "os-b", "whatsapp")).rejects.toThrow(/OS não encontrada/);
    db.authenticated = false; await expect(preparar()).rejects.toThrow(/login/);
    expect(db.writes).toBe(0);
  });
  it("permissão de editar e acesso ao WhatsApp são revalidados no servidor", async () => {
    const p = await preparar(); db.permission = false;
    await expect(confirmar(p.tentativaId)).rejects.toThrow(/permissão/);
    db.permission = true; db.apiPermission = false;
    await expect(confirmar(p.tentativaId, "api")).rejects.toThrow(/permissão/);
    expect(db.transport).not.toHaveBeenCalled(); expect(orc().status).toBe("rascunho");
  });
  it("tentativa de outra OS/canal e recibo alegado pelo cliente não são aceitos", async () => {
    const p = await preparar();
    await expect(enviarOrcamentoPorCanalV3("unidade-a", "os-a", "presencial", { tentativaId: p.tentativaId, confirmado: true })).rejects.toThrow(/canal/);
    await expect(confirmar("tentativa-outra-os", "api")).rejects.toThrow(/não encontrada/);
    expect(db.transport).not.toHaveBeenCalled();
  });
});

describe("contratos V3/V4 e conversão", () => {
  it("edição preserva vencido e correção mapeia expirado sem perder a classificação pré-OS", async () => {
    db.payload.comercialV4.statusComercial = "vencido";
    const input = { servicos: orc().servicos, pecas: [], desconto: 0 };
    await salvarOrcamentoV3("unidade-a", "os-a", input);
    expect(db.payload.comercialV4.statusComercial).toBe("vencido");
    db.payload.status = "aprovado";
    db.payload.orcamento.status = "expirado";
    await corrigirOrcamentoV3("unidade-a", "os-a", input);
    expect(db.payload.comercialV4.statusComercial).toBe("vencido");
  });
  it("actions antigas sem declaração e carimbos/status enviados sem prova falham fechados", async () => {
    await expect(enviarOrcamentoV3("unidade-a", "os-a")).rejects.toThrow(/explicitamente/);
    await expect(registrarEnvioOrcamento("unidade-a", "os-a", "whatsapp")).rejects.toThrow(/explicitamente/);
    await expect(atualizarStatusComercialV3("unidade-a", "os-a", "enviado")).rejects.toThrow(/declaração manual/);
    await expect(marcarOrcamentoPreOsV3("unidade-a", "os-a", { statusComercial: "enviado" })).rejects.toThrow(/declaração manual/);
    expect(db.writes).toBe(0);
  });
  it("carimbo atrasado nunca regride status comercial depois da confirmação", async () => {
    const p = await preparar(); await confirmar(p.tentativaId);
    await expect(marcarOrcamentoPreOsV3("unidade-a", "os-a", { statusComercial: "rascunho" })).rejects.toThrow(/orçamento vigente/);
    expect(db.payload.comercialV4.statusComercial).toBe("enviado");
  });
  it("aprovação exige alternativa completa; converte o mesmo registro e preserva evidência/validade", async () => {
    db.payload.orcamento.gruposV3 = [{ id: "g", regra: "escolha_1", rotulo: "Escolha a tela" }];
    db.payload.orcamento.servicos = [
      { id: "a", descricao: "Tela A", valor: 300, custoV3: 100, grupoId: "g", varianteV3: { rotulo: "A" } },
      { id: "b", descricao: "Tela B", valor: 500, custoV3: 200, grupoId: "g", varianteV3: { rotulo: "B" } },
    ];
    const p = await preparar(); await confirmar(p.tentativaId);
    const validade = orc().validoAte;
    await expect(aprovarOrcamentoV3("unidade-a", "os-a")).rejects.toThrow(/escolha|selecion/i);
    await salvarOrcamentoV3("unidade-a", "os-a", { servicos: orc().servicos.map((s) => ({ ...s, selecionadaV3: s.id === "b" })), pecas: [], desconto: 0 });
    await aprovarOrcamentoV3("unidade-a", "os-a");
    expect(orc().status).toBe("aprovado"); expect(orc().total).toBe(500); expect(db.payload.comercialV4.statusComercial).toBe("aprovado");
    const input = { previsaoEsperada: "", dataEntrada: { iso: "2026-10-01T15:00:00.000Z", meta: { precisao: "dia" as const, dia: "2026-10-01" } } };
    expect(await converterOrcamentoEmOSV3("unidade-a", "os-a", input)).toEqual({ osId: "os-a", jaConvertido: false });
    expect(await converterOrcamentoEmOSV3("unidade-a", "os-a", input)).toEqual({ osId: "os-a", jaConvertido: true });
    expect(db.payload.comercialV4.statusComercial).toBe("convertido"); expect(orc().validoAte).toBe(validade); expect(orc().compartilhamentosV3).toHaveLength(1);
  });
});
