import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@/generated/prisma";
import type { OrdemServico } from "@/types/os";
import type { OrcamentoV3 } from "@/lib/operacoes-v3/orcamento-model";
import { lerComercialV4 } from "@/lib/operacoes-v4/orcamento-pre-os";
import { diaNaLojaV3 } from "@/lib/operacoes-v3/datas-operacionais-model";

// Banco e transações reais. Apenas identidade/cache/credenciais/transporte externo são seams.
const transport = vi.hoisted(() => ({ send: vi.fn(), cacheFails: false }));
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: "qa-prepub003", name: "Operador QA" } }) }));
vi.mock("@/lib/auth/guard-enterprise", () => ({ requireEnterpriseWith: async () => ({ ok: true }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => { if (transport.cacheFails) throw new Error("cache indisponível"); } }));
vi.mock("@/lib/whatsapp/store-credentials", () => ({ resolveStoreWhatsAppCredentials: async () => ({ phoneNumberId: "qa-sem-numero-real", accessToken: "qa-sem-token-real" }) }));
vi.mock("@/lib/whatsapp", () => ({
  assertValidWhatsAppRecipientDigits: (s: string) => s,
  firstOutboundWamid: (r: { messages?: { id: string }[] }) => r.messages?.[0]?.id ?? "",
  sendTextMessage: (...args: unknown[]) => transport.send(...args),
}));

function exigirDescartavel() {
  const raw = process.env.OPS_V4_PREPUBLISH_TEST_DATABASE_URL;
  if (!raw || raw !== process.env.DATABASE_URL || raw !== process.env.DIRECT_URL) throw new Error("BLOQUEIO_PG: três URLs idênticas do banco descartável são obrigatórias.");
  const url = new URL(raw);
  if (url.hostname !== "127.0.0.1" || !/^\/ops_v4_prepub003_[a-f0-9]{10}$/.test(url.pathname)) throw new Error("BLOQUEIO_PG: alvo deve ser o cluster descartável exclusivo deste aceite.");
}
exigirDescartavel();

import { prisma } from "@/lib/prisma";
import { PrismaClient } from "@/generated/prisma";
import { prepararCompartilhamentoOrcamentoV3, enviarOrcamentoPorCanalV3 } from "@/lib/operacoes-v3/orcamento-envio-actions";
import { aprovarOrcamentoV3, salvarOrcamentoV3 } from "@/lib/operacoes-v3/orcamento-actions";
import { converterOrcamentoEmOSV3 } from "@/lib/operacoes-v3/comercial-pre-os-actions";
import { updateOSPayload } from "@/app/actions/operacoes";

const conexaoB = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
const run = randomUUID().replaceAll("-", "");
const sid = `qa-prepub003-${run}`;
const outraLoja = `${sid}-b`;
const triggerName = `qa_prepub003_${run}`;
let osId = "";

const ler = async () => {
  const row = await prisma.ordemServico.findFirstOrThrow({ where: { id: osId, storeId: sid } });
  return { row, payload: row.payload as unknown as OrdemServico, orc: (row.payload as unknown as OrdemServico).orcamento as OrcamentoV3 };
};
const preparar = () => prepararCompartilhamentoOrcamentoV3(sid, osId, "whatsapp");
const confirmar = (id: string, modo: "manual" | "api" | "recuperar_api" = "manual") => enviarOrcamentoPorCanalV3(sid, osId, "whatsapp", { tentativaId: id, confirmado: true, modo });
const eventos = (payload: OrdemServico) => payload.timeline?.filter(e => e.tipo === "orcamento_enviado") ?? [];

async function removerFalhas() {
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${triggerName} ON ordens_servico`);
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${triggerName} ON whatsapp_messages`);
  await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${triggerName}()`);
}
async function falharGravacao(tabela: "ordens_servico" | "whatsapp_messages") {
  // Identificadores/literal são UUIDs criados pelo teste; o guard acima recusa bancos externos.
  const condicao = tabela === "ordens_servico" ? `AND NEW.payload #>> '{orcamento,compartilhamentosV3,0,estado}' = 'aceito_api'` : "";
  await prisma.$executeRawUnsafe(`CREATE FUNCTION ${triggerName}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."storeId" = '${sid}' ${condicao} THEN RAISE EXCEPTION 'QA_FALHA_GRAVACAO'; END IF; RETURN NEW; END $$`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER ${triggerName} BEFORE INSERT OR UPDATE ON ${tabela} FOR EACH ROW EXECUTE FUNCTION ${triggerName}()`);
}
function barreiraTransporte() {
  let liberar!: () => void;
  let entrou!: () => void;
  const entrada = new Promise<void>(resolve => { entrou = resolve; });
  const saida = new Promise<void>(resolve => { liberar = resolve; });
  transport.send.mockImplementationOnce(async () => { entrou(); await saida; return { messages: [{ id: `wamid.qa.${randomUUID()}` }] }; });
  return { entrada, liberar };
}

beforeAll(async () => {
  await prisma.store.createMany({ data: [{ id: sid, name: "QA descartável" }, { id: outraLoja, name: "QA outra loja" }] });
  const contact = await prisma.whatsAppContact.create({ data: { storeId: sid, phoneDigits: "5511999990000" } });
  await prisma.whatsAppConversation.create({ data: { storeId: sid, contactId: contact.id } });
});
beforeEach(async () => {
  transport.cacheFails = false;
  transport.send.mockReset().mockImplementation(async () => ({ messages: [{ id: `wamid.qa.${randomUUID()}` }] }));
  osId = randomUUID();
  const payload = {
    id: osId, storeId: sid, codigo: "ORC-QA", status: "aberta", timeline: [],
    cliente: { id: "cliente-qa-payload", nome: "Cliente QA", telefone: "11999990000" },
    equipamento: { marca: "Marca QA", modelo: "Tela QA", defeitoRelatado: "Tela" },
    comercialV4: { tipo: "orcamento_pre_os", statusComercial: "rascunho", observacaoInterna: "SEGREDO QA" },
    orcamento: { id: randomUUID(), status: "rascunho", total: 300, desconto: 0, criadoEm: new Date().toISOString(), servicos: [{ id: "sv", descricao: "Troca de tela", valor: 300, custoV3: 81.23 }], pecas: [] },
  };
  await prisma.ordemServico.create({ data: { id: osId, storeId: sid, valorTotal: 300, payload: payload as unknown as Prisma.InputJsonValue } });
});
afterEach(async () => { transport.cacheFails = false; await removerFalhas(); });
afterAll(async () => {
  await removerFalhas();
  await prisma.ordemServico.deleteMany({ where: { storeId: { in: [sid, outraLoja] } } });
  await prisma.store.deleteMany({ where: { id: { in: [sid, outraLoja] } } });
  await Promise.all([prisma.$disconnect(), conexaoB.$disconnect()]);
});

describe("aceite real PostgreSQL — orçamento RafaCell", () => {
  it("preparações e confirmações manuais simultâneas serializam sem duplicar prova/timeline", async () => {
    const [a, b] = await Promise.all([preparar(), preparar()]);
    expect(a.tentativaId).toBe(b.tentativaId);
    expect((await ler()).orc.status).toBe("rascunho");
    const result = await Promise.all([confirmar(a.tentativaId), confirmar(a.tentativaId)]);
    expect(result.every(r => r.ok)).toBe(true);
    const atual = await ler();
    expect(atual.orc.status).toBe("enviado");
    expect(lerComercialV4(atual.payload)?.statusComercial).toBe("enviado");
    expect(atual.row.status).toBe("EmAnalise");
    expect(atual.payload.status).toBe("aguardando_aprovacao");
    expect(eventos(atual.payload)).toHaveLength(1);
    expect(atual.orc.compartilhamentosV3).toHaveLength(1);
    expect(atual.orc.compartilhamentosV3?.[0]).toMatchObject({ natureza: "declaracao_manual", confirmadoPor: { id: "qa-prepub003" }, canal: "whatsapp" });
    expect(transport.send).not.toHaveBeenCalled();
  });

  it("duas chamadas API concorrentes reservam uma vez e liberam a trava antes do transporte", async () => {
    const p = await preparar();
    const gate = barreiraTransporte();
    const primeiro = confirmar(p.tentativaId, "api");
    await gate.entrada;
    try {
      const segundo = await confirmar(p.tentativaId, "api");
      expect(segundo.pendente).toBe(true);
      await expect(preparar()).rejects.toThrow(/sem resultado confirmado/);
      await conexaoB.$transaction(async tx => { await tx.$queryRaw`SELECT id FROM ordens_servico WHERE id = ${osId} AND "storeId" = ${sid} FOR UPDATE`; }, { timeout: 1500 });
      expect((await ler()).orc.status).toBe("rascunho");
    } finally { gate.liberar(); }
    expect((await primeiro).aceitoApi).toBe(true);
    expect(transport.send).toHaveBeenCalledTimes(1);
    expect(eventos((await ler()).payload)).toHaveLength(1);
    expect(await prisma.whatsAppMessage.count({ where: { storeId: sid } })).toBe(1);
  });

  it("falha do histórico após aceite preserva commit e replay não repete o transporte", async () => {
    const p = await preparar();
    await falharGravacao("whatsapp_messages");
    const r = await confirmar(p.tentativaId, "api");
    expect(r).toMatchObject({ ok: true, aceitoApi: true, avisoRegistro: true });
    expect((await ler()).orc.status).toBe("enviado");
    await removerFalhas();
    await confirmar(p.tentativaId, "api");
    expect(transport.send).toHaveBeenCalledTimes(1);
    expect(eventos((await ler()).payload)).toHaveLength(1);
  });

  it("rollback real da confirmação mantém reserva e recupera recibo oficial sem reenviar", async () => {
    const p = await preparar();
    await falharGravacao("ordens_servico");
    const r = await confirmar(p.tentativaId, "api");
    expect(r).toMatchObject({ ok: false, aceitoApi: true, pendente: true });
    let atual = await ler();
    expect(atual.orc.status).toBe("rascunho");
    expect(eventos(atual.payload)).toHaveLength(0);
    expect(atual.orc.compartilhamentosV3?.[0].estado).toBe("api_em_andamento");
    await removerFalhas();
    expect((await confirmar(p.tentativaId, "recuperar_api")).ok).toBe(true);
    atual = await ler();
    expect(atual.orc.status).toBe("enviado");
    expect(eventos(atual.payload)).toHaveLength(1);
    expect(transport.send).toHaveBeenCalledTimes(1);
  });

  it("resultado incerto mantém reserva durável e impede tentativa nova ou retry automático", async () => {
    const p = await preparar();
    transport.send.mockRejectedValueOnce(new Error("resultado de rede incerto"));
    expect((await confirmar(p.tentativaId, "api")).pendente).toBe(true);
    await expect(preparar()).rejects.toThrow(/sem resultado confirmado/);
    expect((await confirmar(p.tentativaId, "api")).pendente).toBe(true);
    expect((await confirmar(p.tentativaId, "recuperar_api")).pendente).toBe(true);
    expect(transport.send).toHaveBeenCalledTimes(1);
    expect((await ler()).orc.status).toBe("rascunho");
  });

  it("patch genérico nulo não pode apagar a reserva de um transporte com resultado incerto", async () => {
    const original = structuredClone((await ler()).orc);
    const p = await preparar();
    transport.send.mockRejectedValueOnce(new Error("resultado de rede incerto"));
    expect((await confirmar(p.tentativaId, "api")).pendente).toBe(true);
    // Server Actions recebem JSON em runtime: o cast representa um caller legado/malformado.
    const patch = { orcamento: null } as unknown as Parameters<typeof updateOSPayload>[2];
    let bloqueado = false;
    try { await updateOSPayload(sid, osId, patch); } catch { bloqueado = true; }
    const reserva = (await ler()).orc?.compartilhamentosV3?.[0]?.estado ?? null;
    if (!bloqueado) {
      // Reposição por caller legado de uma proposta válida após a limpeza indevida.
      await updateOSPayload(sid, osId, { orcamento: original } as unknown as Parameters<typeof updateOSPayload>[2]);
      await confirmar((await preparar()).tentativaId, "api");
    }
    const observado = { bloqueado, reserva, transportes: transport.send.mock.calls.length };
    expect(observado, `OBSERVADO_PG=${JSON.stringify(observado)}`).toEqual({ bloqueado: true, reserva: "api_em_andamento", transportes: 1 });
  });

  it("edição real durante o POST preserva proposta atual e guarda aceite da versão anterior", async () => {
    const p = await preparar();
    const gate = barreiraTransporte();
    const primeiro = confirmar(p.tentativaId, "api");
    await gate.entrada;
    try { await salvarOrcamentoV3(sid, osId, { servicos: [{ id: "sv", descricao: "Troca de tela", valor: 350 }], pecas: [], desconto: 0 }); }
    finally { gate.liberar(); }
    expect((await primeiro).aceitoApi).toBe(true);
    const atual = await ler();
    expect(atual.orc.status).toBe("rascunho");
    expect(atual.orc.total).toBe(350);
    expect(atual.orc.compartilhamentosV3?.[0]).toMatchObject({ estado: "aceito_api", versaoAlterada: true, totalSnapshot: 300 });
    expect(lerComercialV4(atual.payload)?.statusComercial).toBe("rascunho");
  });

  it("falha de cache e reenvio explícito preservam validade e primeiro envio", async () => {
    const p = await preparar();
    transport.cacheFails = true;
    expect((await confirmar(p.tentativaId)).avisoRegistro).toBe(true);
    const antes = (await ler()).orc;
    transport.cacheFails = false;
    const novo = await preparar();
    expect(novo.tentativaId).not.toBe(p.tentativaId);
    expect((await confirmar(novo.tentativaId)).reenvio).toBe(true);
    const depois = await ler();
    expect(depois.orc.validoAte).toBe(antes.validoAte);
    expect(depois.orc.enviadoEm).toBe(antes.enviadoEm);
    expect(eventos(depois.payload)).toHaveLength(2);
  });

  it("OS e recibos de outra loja não são lidos nem confirmados", async () => {
    const p = await preparar();
    await expect(prepararCompartilhamentoOrcamentoV3(outraLoja, osId, "whatsapp")).rejects.toThrow(/OS não encontrada/);
    await expect(enviarOrcamentoPorCanalV3(outraLoja, osId, "whatsapp", { tentativaId: p.tentativaId, confirmado: true, modo: "manual" })).rejects.toThrow(/materializado/);
    expect((await ler()).orc.status).toBe("rascunho");
    expect(transport.send).not.toHaveBeenCalled();
  });

  it("aprovação e conversão posteriores preservam identidade e prova de envio", async () => {
    const p = await preparar();
    await confirmar(p.tentativaId);
    const antes = (await ler()).orc;
    await aprovarOrcamentoV3(sid, osId);
    const entrada = new Date(Date.now() - 60000).toISOString();
    const result = await converterOrcamentoEmOSV3(sid, osId, { previsaoEsperada: "", dataEntrada: { iso: entrada, meta: { precisao: "data_hora", dia: diaNaLojaV3(entrada) } } });
    expect(result.osId).toBe(osId);
    const atual = await ler();
    expect(atual.orc.status).toBe("aprovado");
    expect(lerComercialV4(atual.payload)?.statusComercial).toBe("convertido");
    expect(atual.orc.compartilhamentosV3).toEqual(antes.compartilhamentosV3);
    expect(atual.orc.validoAte).toBe(antes.validoAte);
    expect((await converterOrcamentoEmOSV3(sid, osId, { previsaoEsperada: "" })).jaConvertido).toBe(true);
  });
});
