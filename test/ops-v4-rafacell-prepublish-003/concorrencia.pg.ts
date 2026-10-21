import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@/generated/prisma";
import type { OrdemServico } from "@/types/os";
import type { OrcamentoV3 } from "@/lib/operacoes-v3/orcamento-model";
import { lerComercialV4 } from "@/lib/operacoes-v4/orcamento-pre-os";
import { diaNaLojaV3 } from "@/lib/operacoes-v3/datas-operacionais-model";

// Banco e transações reais. Apenas identidade/cache/credenciais/transporte externo são seams.
const transport = vi.hoisted(() => ({ send: vi.fn(), cacheFails: false, permitido: true }));
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: "qa-prepub003", name: "Operador QA" } }) }));
vi.mock("@/lib/auth/guard-enterprise", () => ({ requireEnterpriseWith: async () => transport.permitido ? { ok: true } : { ok: false, error: "Sem permissão QA" } }));
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
import { resumoEnvioOrcamentoV3 } from "@/lib/operacoes-v3/orcamento-envio-model";
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
const patchOrcamento = (orcamento: unknown) => ({ orcamento } as unknown as Parameters<typeof updateOSPayload>[2]);

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
  transport.permitido = true;
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
afterEach(async () => { transport.cacheFails = false; transport.permitido = true; await removerFalhas(); });
afterAll(async () => {
  await removerFalhas();
  await prisma.ordemServico.deleteMany({ where: { storeId: { in: [sid, outraLoja] } } });
  await prisma.store.deleteMany({ where: { id: { in: [sid, outraLoja] } } });
  await Promise.all([prisma.$disconnect(), conexaoB.$disconnect()]);
});

describe("aceite real PostgreSQL — orçamento RafaCell", () => {
  it("evento legado sem id não permite confirmação forjada por patch genérico", async () => {
    const antes = await ler();
    const payload = { ...antes.payload, timeline: [{ tipo: "observacao", conteudo: "Legado" }] };
    await prisma.ordemServico.update({ where: { id: osId }, data: { payload: payload as unknown as Prisma.InputJsonValue } });
    await expect(updateOSPayload(sid, osId, { timeline: [{ tipo: "orcamento_enviado" }] } as unknown as Parameters<typeof updateOSPayload>[2])).rejects.toThrow(/confirmação auditada/);
    expect((await ler()).payload.timeline).toEqual(payload.timeline);
    expect((await ler()).orc.status).toBe("rascunho");
  });
  it("reserva de API anterior a outro canal continua recuperável depois da releitura real", async () => {
    const p = await preparar();
    await prepararCompartilhamentoOrcamentoV3(sid, osId, "presencial");
    transport.send.mockRejectedValueOnce(new Error("resultado incerto"));
    await confirmar(p.tentativaId, "api");
    const atual = await ler();
    expect(resumoEnvioOrcamentoV3(atual.orc)).toMatchObject({ estado: "api_sem_confirmacao", pendente: { id: p.tentativaId }, ultimo: { id: p.tentativaId } });
    await expect(preparar()).rejects.toThrow(/sem resultado confirmado/);
    const manual = atual.orc.compartilhamentosV3!.find((e) => e.canal === "presencial")!;
    await expect(enviarOrcamentoPorCanalV3(sid, osId, "presencial", { tentativaId: manual.id, confirmado: true })).rejects.toThrow(/outro envio pela API pendente/);
    expect((await ler()).orc.status).toBe("rascunho");
    expect(transport.send).toHaveBeenCalledOnce();
  });
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
    await expect(updateOSPayload(sid, osId, patchOrcamento(null))).rejects.toThrow(/reserva ou evidência de envio protegida/);
    expect((await ler()).row).toEqual(atual.row);
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
    if (bloqueado) {
      const antes = await ler();
      await expect(updateOSPayload(sid, osId, patchOrcamento({}))).rejects.toThrow(/reserva ou evidência de envio protegida/);
      expect((await ler()).row).toEqual(antes.row);
      expect((await confirmar(p.tentativaId, "api")).pendente).toBe(true);
      await expect(preparar()).rejects.toThrow(/sem resultado confirmado/);
    } else {
      // Reposição por caller legado de uma proposta válida após a limpeza indevida.
      await updateOSPayload(sid, osId, { orcamento: original } as unknown as Parameters<typeof updateOSPayload>[2]);
      await confirmar((await preparar()).tentativaId, "api");
    }
    const observado = { bloqueado, reserva, transportes: transport.send.mock.calls.length };
    console.info(`OBSERVADO_PG=${JSON.stringify(observado)}`);
    expect(observado, `OBSERVADO_PG=${JSON.stringify(observado)}`).toEqual({ bloqueado: true, reserva: "api_em_andamento", transportes: 1 });
  });

  const substituicoes: Array<[string, (orc: OrcamentoV3) => unknown]> = [
    ["null", () => null], ["false", () => false], ["número", () => 0], ["string", () => "inválido"],
    ["array vazio", () => []], ["array de propostas", orc => [orc]], ["objeto vazio", () => ({})],
    ["substituição parcial", () => ({ total: 999 })],
    ["metadados removidos", orc => { const { compartilhamentosV3: removido, ...resto } = orc; void removido; return resto; }],
    ["metadados esvaziados", orc => ({ ...orc, compartilhamentosV3: [] })],
    ["reserva liberada", orc => ({ ...orc, compartilhamentosV3: orc.compartilhamentosV3?.map(e => ({ ...e, estado: "preparado" })) })],
    ["confirmação manual fabricada", orc => ({ ...orc, compartilhamentosV3: orc.compartilhamentosV3?.map(e => ({ ...e, estado: "informado_operador", natureza: "declaracao_manual", confirmadoPor: { id: "forjado" }, confirmadoEm: new Date().toISOString() })) })],
    ["aceite API fabricado", orc => ({ ...orc, compartilhamentosV3: orc.compartilhamentosV3?.map(e => ({ ...e, estado: "aceito_api", natureza: "aceite_api_oficial", api: { wamid: "forjado" } })) })],
    ["identidade substituída", orc => ({ ...orc, id: randomUUID() })],
    ["proposta truncada com metadados", orc => ({ id: orc.id, compartilhamentosV3: orc.compartilhamentosV3 })],
  ];
  it.each(substituicoes)("reserva incerta rejeita %s sem gravação parcial ou segundo transporte", async (_nome, substituir) => {
    const p = await preparar();
    transport.send.mockRejectedValueOnce(new Error("resultado de rede incerto"));
    expect((await confirmar(p.tentativaId, "api")).pendente).toBe(true);
    const antes = await ler();
    expect(antes.orc.compartilhamentosV3?.[0].estado).toBe("api_em_andamento");
    const patch = { ...patchOrcamento(substituir(structuredClone(antes.orc))), tags: ["não deve gravar"] };
    await expect(updateOSPayload(sid, osId, patch)).rejects.toThrow(/reserva ou evidência de envio protegida/);
    expect((await ler()).row).toEqual(antes.row);
    await expect(preparar()).rejects.toThrow(/sem resultado confirmado/);
    expect((await confirmar(p.tentativaId, "api")).pendente).toBe(true);
    expect((await confirmar(p.tentativaId, "recuperar_api")).pendente).toBe(true);
    expect(transport.send).toHaveBeenCalledTimes(1);
    expect(eventos((await ler()).payload)).toHaveLength(0);
  });

  it("patch antigo durante o transporte não rebaixa a reserva; edições de OS continuam permitidas", async () => {
    const p = await preparar();
    const antigo = (await ler()).orc;
    const gate = barreiraTransporte();
    const primeiro = confirmar(p.tentativaId, "api");
    await gate.entrada;
    try {
      const antes = await ler();
      await expect(updateOSPayload(sid, osId, patchOrcamento(antigo))).rejects.toThrow(/protegida/);
      expect((await ler()).row).toEqual(antes.row);
      await updateOSPayload(sid, osId, { tags: ["Edição legítima durante transporte"] });
      expect((await ler()).orc).toEqual(antes.orc);
      await expect(preparar()).rejects.toThrow(/sem resultado confirmado/);
    } finally { gate.liberar(); }
    expect((await primeiro).aceitoApi).toBe(true);
    expect(transport.send).toHaveBeenCalledTimes(1);
  });

  it.each(["manual", "api"] as const)("protege evidência %s e permite novo envio autorizado", async (modo) => {
    const p = await preparar();
    expect((await confirmar(p.tentativaId, modo)).ok).toBe(true);
    const antes = await ler();
    await expect(updateOSPayload(sid, osId, patchOrcamento(null))).rejects.toThrow(/protegida/);
    const adulterado = structuredClone(antes.orc);
    delete adulterado.enviadoEm;
    await expect(updateOSPayload(sid, osId, patchOrcamento(adulterado))).rejects.toThrow(/protegida/);
    expect((await ler()).row).toEqual(antes.row);
    await confirmar(p.tentativaId, modo);
    expect(eventos((await ler()).payload)).toHaveLength(1);
    const novo = await preparar();
    expect(novo.tentativaId).not.toBe(p.tentativaId);
    expect((await confirmar(novo.tentativaId, modo)).reenvio).toBe(true);
    const depois = await ler();
    expect(depois.orc.compartilhamentosV3).toHaveLength(2);
    expect(depois.orc.compartilhamentosV3?.[0]).toEqual(antes.orc.compartilhamentosV3?.[0]);
    expect(depois.orc.enviadoEm).toBe(antes.orc.enviadoEm);
    expect(depois.orc.validoAte).toBe(antes.orc.validoAte);
    expect(transport.send).toHaveBeenCalledTimes(modo === "api" ? 2 : 0);
  });

  it.each([null, false, 42, "inválido", []].map(patch => ({ patch })))("patch raiz $patch falha explicitamente sem alterar a OS", async ({ patch }) => {
    await preparar();
    const antes = await ler();
    await expect(updateOSPayload(sid, osId, patch as unknown as Parameters<typeof updateOSPayload>[2])).rejects.toThrow(/Patch da OS deve ser um objeto/);
    expect((await ler()).row).toEqual(antes.row);
  });

  it("preserva edição de orçamento sem reserva e de registro antigo sem evidência", async () => {
    const antes = await ler();
    await updateOSPayload(sid, osId, { orcamento: { ...antes.orc, total: 320 }, tags: ["Edição permitida"] });
    expect((await ler()).orc.total).toBe(320);
    // Fixture legada, sem reserva/recibo: o boundary não cria evidência retroativa.
    const legado = { ...(await ler()).payload, orcamento: { ...(await ler()).orc, status: "enviado" } };
    await prisma.ordemServico.update({ where: { id: osId, storeId: sid }, data: { payload: legado as unknown as Prisma.InputJsonValue } });
    await updateOSPayload(sid, osId, patchOrcamento({ ...legado.orcamento, total: 330 }));
    expect((await ler()).orc.total).toBe(330);
    expect((await ler()).orc.compartilhamentosV3).toBeUndefined();
    await updateOSPayload(sid, osId, patchOrcamento(null));
    expect((await ler()).orc).toBeNull();
    expect(transport.send).not.toHaveBeenCalled();
  });

  it("patch com metadados intactos permite edição legítima e mantém a reserva incerta", async () => {
    const p = await preparar();
    transport.send.mockRejectedValueOnce(new Error("resultado incerto"));
    await confirmar(p.tentativaId, "api");
    const antes = await ler();
    await updateOSPayload(sid, osId, patchOrcamento({ ...antes.orc, total: 350 }));
    const depois = await ler();
    expect(depois.orc.total).toBe(350);
    expect(depois.orc.compartilhamentosV3).toEqual(antes.orc.compartilhamentosV3);
    await expect(preparar()).rejects.toThrow(/sem resultado confirmado/);
    expect((await confirmar(p.tentativaId, "api")).pendente).toBe(true);
    expect(transport.send).toHaveBeenCalledTimes(1);
  });

  it("sem permissão não altera reserva nem envia; outra loja não pode aplicar patch", async () => {
    const p = await preparar();
    const antes = await ler();
    await expect(updateOSPayload(outraLoja, osId, patchOrcamento(null))).rejects.toThrow(/OS não encontrada/);
    transport.permitido = false;
    await expect(updateOSPayload(sid, osId, patchOrcamento(null))).rejects.toThrow(/permissão/);
    await expect(confirmar(p.tentativaId, "api")).rejects.toThrow(/permissão/);
    expect((await ler()).row).toEqual(antes.row);
    expect(transport.send).not.toHaveBeenCalled();
  });

  it("patch sem reserva anterior rejeita evidência fabricada antes de qualquer gravação", async () => {
    const antes = await ler();
    const falso = { ...antes.orc, compartilhamentosV3: [{ id: "forjado", estado: "aceito_api", api: { wamid: "forjado" } }] };
    await expect(updateOSPayload(sid, osId, { ...patchOrcamento(falso), tags: ["não gravar"] })).rejects.toThrow(/ações auditadas/);
    expect((await ler()).row).toEqual(antes.row);
    expect(transport.send).not.toHaveBeenCalled();
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
