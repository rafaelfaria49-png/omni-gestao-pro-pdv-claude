import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma";
import type { OrdemServico } from "@/components/operacoes/lovable/types/os";

const sessao = vi.hoisted(() => ({ token: "", permitido: true, financeiro: true, garantia: true }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: sessao.token }) }) }));
vi.mock("@/lib/auth/session-entitlement", () => ({ getSessionEntitlement: async () => ({ ok: true }) }));
vi.mock("@/lib/auth/guard-enterprise", () => ({ requireEnterpriseWith: async () => sessao.permitido ? { ok: true, session: { user: { id: "qa-edicao-operador", name: "Operador QA" } }, permissions: { financeiro: { edit: sessao.financeiro }, operacoes: { editarOs: true, garantia: sessao.garantia } } } : { ok: false, error: "Sem permissão" } }));

import { prisma } from "@/lib/prisma";
import { carregarEdicaoCompletaOSV3, revisarEdicaoCompletaOSV3, salvarEdicaoCompletaOSV3 } from "./edicao-completa-actions";
import { createPinAuthorizationToken, resolvePinAuthorizationSecret } from "@/lib/auth/pin-authorization";
import { localKeyContaReceberOSV3 } from "./payment-model";
import { adicionarVersaoTermoGarantiaV3 } from "./garantia-termos-model";

const ativo = process.env.RUN_EDICAO_QA_TESTS === "1";
const loja = `qa-integracao-edicao-os-${randomUUID()}`;
let supervisorId: string;
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

describe.skipIf(!ativo)("edição completa — PostgreSQL QA isolado", () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (url.pathname !== "/omni_ops_edicao_qa" || !url.hostname.includes("ep-lucky-tree-b68myr8i") || process.env.VERCEL_ENV === "production") throw new Error("Integração exige o banco QA exclusivo desta tarefa.");
    await prisma.store.upsert({ where: { id: loja }, create: { id: loja, name: "QA · testes técnicos de edição" }, update: {} });
    const s = await prisma.user.create({ data: { name: "Supervisor sintético integração", role: "ADMIN", pin: `opaque:${randomUUID()}` } });
    supervisorId = s.id;
  }, 60000);
  afterAll(async () => { vi.restoreAllMocks(); await prisma.$disconnect(); });

  async function fixture(status = "aprovado", recebido = 0, parcelas = false, custo = 50) {
    sessao.permitido = sessao.financeiro = sessao.garantia = true;
    const id = `qa-it-${randomUUID()}`;
    const c = await prisma.cliente.create({ data: { storeId: loja, name: "Cliente inteiramente sintético" } });
    const agora = new Date().toISOString();
    let payload = {
      id, codigo: `QA-${id.slice(-8)}`, storeId: loja, clienteId: c.id, cliente: { id: c.id, nome: c.name },
      equipamento: { id: "eq-qa", tipo: "Smartphone", marca: "QA", modelo: "Sintético", defeitoRelatado: "Problema sintético" },
      status, operacaoStatusV3: status, prioridade: "normal", origem: "balcao", sla: { prazo: "2027-01-10T12:00:00Z", status: "ok" },
      orcamento: { id: `orc-${id}`, status: status === "aberta" ? "rascunho" : "aprovado", servicos: [{ id: "s1", descricao: "Serviço sintético", valor: 330, custoV3: custo, garantiaModeloId: "tela", prazoGarantiaDias: 90 }], pecas: [], desconto: 0, total: 330, criadoEm: agora, atualizadoEm: agora },
      pecas: [], timeline: [], anexos: [], observacoes: [], garantia: { ativa: false }, criadoEm: agora, atualizadoEm: agora,
      ...(status === "entregue" ? { entregueEm: agora, entregaV3: { entregueEm: agora } } : {}),
    } as unknown as OrdemServico;
    if (status === "entregue") payload = adicionarVersaoTermoGarantiaV3(payload, { tipo: "original", agora, operadorId: "qa-edicao-operador", operador: "QA", motivo: "Emissão sintética", origem: "qa" });
    await prisma.ordemServico.create({ data: { id, storeId: loja, clienteId: c.id, numero: payload.codigo, status: status === "entregue" ? "Entregue" : "Aberto", valorTotal: 330, payload: json(payload) } });
    const titulo = await prisma.contaReceberTitulo.create({ data: { storeId: loja, localKey: localKeyContaReceberOSV3(loja, id), valor: 330, status: recebido === 330 ? "liquidado" : "pendente", cliente: c.name, vencimento: "2027-01-10", payload: { origem: "os", ordemServicoId: id, clienteId: c.id, historico: recebido ? [{ tipo: "pagamento", valor: recebido, at: agora }] : [], ...(parcelas ? { parcelas: [{ id: `p1-${id}`, valor: 110, vencimento: "2027-01-10" }, { id: `p2-${id}`, valor: 110, vencimento: "2027-02-10" }, { id: `p3-${id}`, valor: 110, vencimento: "2027-03-10" }] } : {}) } } });
    return { id, titulo, cliente: c, payload };
  }
  async function preparar(f: Awaited<ReturnType<typeof fixture>>, valor = 400) {
    const c = await carregarEdicaoCompletaOSV3(loja, f.id);
    c.dados.servicos[0].valor = valor;
    const r = { versao: c.versao, operacaoId: randomUUID(), motivo: "Correção inteiramente sintética de QA" };
    const p = await revisarEdicaoCompletaOSV3(loja, f.id, c.dados, r);
    sessao.token = await createPinAuthorizationToken({ userId: "qa-edicao-operador", storeId: loja, supervisorId, ...p.scope }, resolvePinAuthorizationSecret()!);
    return { d: c.dados, r, p };
  }

  it.each(["aberta", "aprovado", "entregue"])("corrige OS %s e mantém um único título, estado e identidade", async (status) => {
    const f = await fixture(status, 0, true), { d, r } = await preparar(f);
    const salva = await salvarEdicaoCompletaOSV3(loja, f.id, d, r);
    expect(salva.id).toBe(f.id); expect(salva.status).toBe(status);
    const titulos = await prisma.contaReceberTitulo.findMany({ where: { storeId: loja, localKey: f.titulo.localKey } });
    expect(titulos).toHaveLength(1); expect(titulos[0].id).toBe(f.titulo.id); expect(titulos[0].valor).toBe(400);
    const parcelas = (titulos[0].payload as { parcelas: Array<{ id: string; valor: number }> }).parcelas;
    expect(parcelas.reduce((s, p) => s + Math.round(p.valor * 100), 0)).toBe(40000);
    expect(parcelas[0].id).toBe(`p1-${f.id}`);
    expect(await prisma.movimentacaoFinanceira.count({ where: { referenciaId: f.titulo.id } })).toBe(0);
    if (status === "entregue") {
      const termos = (salva as unknown as { termosGarantiaV3: unknown[] }).termosGarantiaV3;
      expect(termos).toHaveLength(2);
      expect(termos[0]).toEqual((f.payload as unknown as { termosGarantiaV3: unknown[] }).termosGarantiaV3[0]);
    }
  }, 60000);

  it("duplo clique/reenvio é idempotente e audita uma só correção", async () => {
    const f = await fixture(), { d, r } = await preparar(f);
    await salvarEdicaoCompletaOSV3(loja, f.id, d, r); await salvarEdicaoCompletaOSV3(loja, f.id, d, r);
    expect(await prisma.auditoriaFinanceira.count({ where: { entidadeId: f.titulo.id, acao: "editar" } })).toBe(1);
    expect(await prisma.logsAuditoria.count({ where: { action: "OS_EDICAO_COMPLETA", detail: { contains: f.id } } })).toBe(1);
  }, 60000);
  it.each([100, 330])("recebido R$ %s exige ajuste; custo interno ainda pode ser corrigido", async (recebido) => {
    const f = await fixture("entregue", recebido);
    await expect(preparar(f)).rejects.toThrow(/ajuste\/compensação/);
    const c = await carregarEdicaoCompletaOSV3(loja, f.id); c.dados.servicos[0].custoV3 = 120;
    const r = { versao: c.versao, operacaoId: randomUUID(), motivo: "Corrigir somente custo interno sintético" };
    const p = await revisarEdicaoCompletaOSV3(loja, f.id, c.dados, r);
    sessao.token = await createPinAuthorizationToken({ userId: "qa-edicao-operador", storeId: loja, supervisorId, ...p.scope }, resolvePinAuthorizationSecret()!);
    const salva = await salvarEdicaoCompletaOSV3(loja, f.id, c.dados, r);
    expect(salva.orcamento?.total).toBe(330);
    expect((salva as unknown as { termosGarantiaV3: unknown[] }).termosGarantiaV3).toHaveLength(1);
    const t = await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { id: f.titulo.id } });
    expect(t).toEqual(f.titulo);
  }, 60000);
  it("recusa token genérico, de outra OS, alteração após o PIN e permissão insuficiente", async () => {
    const f = await fixture(), { d, r } = await preparar(f);
    const correto = sessao.token;
    sessao.token = await createPinAuthorizationToken({ userId: "qa-edicao-operador", storeId: loja, supervisorId }, resolvePinAuthorizationSecret()!);
    await expect(salvarEdicaoCompletaOSV3(loja, f.id, d, r)).rejects.toThrow(/supervisor/);
    sessao.token = correto;
    await expect(salvarEdicaoCompletaOSV3(loja, "outra-os", d, r)).rejects.toThrow(/supervisor/);
    d.servicos[0].valor = 450;
    await expect(salvarEdicaoCompletaOSV3(loja, f.id, d, r)).rejects.toThrow(/supervisor/);
    d.servicos[0].valor = 400; sessao.permitido = false;
    await expect(salvarEdicaoCompletaOSV3(loja, f.id, d, r)).rejects.toThrow(/permissão/);
    sessao.permitido = true;
    expect((await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { id: f.titulo.id } })).valor).toBe(330);
  }, 60000);
  it.each(["os", "titulo", "cliente"])("detecta concorrência em %s antes de qualquer escrita", async (alvo) => {
    const f = await fixture(), { d, r } = await preparar(f);
    if (alvo === "os") await prisma.ordemServico.update({ where: { id: f.id }, data: { defeito: "Alteração concorrente" } });
    if (alvo === "titulo") await prisma.contaReceberTitulo.update({ where: { id: f.titulo.id }, data: { vencimento: "2027-04-10" } });
    if (alvo === "cliente") await prisma.cliente.update({ where: { id: f.cliente.id }, data: { phone: "11999990000" } });
    await expect(salvarEdicaoCompletaOSV3(loja, f.id, d, r)).rejects.toThrow(/mudou/);
    expect((await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { id: f.titulo.id } })).valor).toBe(330);
  }, 60000);
  it("corrige CPF no cadastro e na OS atomicamente", async () => {
    const f = await fixture();
    const c = await carregarEdicaoCompletaOSV3(loja, f.id); c.dados.cliente.documento = "52998224725";
    const r = { versao: c.versao, operacaoId: randomUUID(), motivo: "Corrigir documento sintético informado incorretamente" };
    const p = await revisarEdicaoCompletaOSV3(loja, f.id, c.dados, r);
    sessao.token = await createPinAuthorizationToken({ userId: "qa-edicao-operador", storeId: loja, supervisorId, ...p.scope }, resolvePinAuthorizationSecret()!);
    const salva = await salvarEdicaoCompletaOSV3(loja, f.id, c.dados, r);
    expect(salva.cliente.documento).toBe("52998224725");
    expect((await prisma.cliente.findUniqueOrThrow({ where: { id: f.cliente.id } })).documentKey).toBe("52998224725");
  }, 60000);
  it.each([0, 100])("troca de cliente com recebido %s preserva cadastros e protege recebimentos", async (recebido) => {
    const f = await fixture("aprovado", recebido);
    const outro = await prisma.cliente.create({ data: { storeId: loja, name: "Outro cliente sintético" } });
    const c = await carregarEdicaoCompletaOSV3(loja, f.id);
    c.dados.cliente = { id: outro.id, nome: outro.name, documento: "", telefone: "", email: "" };
    const r = { versao: c.versao, operacaoId: randomUUID(), motivo: "Corrigir vínculo sintético de cliente da OS" };
    if (recebido) {
      await expect(revisarEdicaoCompletaOSV3(loja, f.id, c.dados, r)).rejects.toThrow(/ajuste\/compensação/);
      expect((await prisma.ordemServico.findUniqueOrThrow({ where: { id: f.id } })).clienteId).toBe(f.cliente.id);
    } else {
      const p = await revisarEdicaoCompletaOSV3(loja, f.id, c.dados, r);
      sessao.token = await createPinAuthorizationToken({ userId: "qa-edicao-operador", storeId: loja, supervisorId, ...p.scope }, resolvePinAuthorizationSecret()!);
      await salvarEdicaoCompletaOSV3(loja, f.id, c.dados, r);
      expect((await prisma.ordemServico.findUniqueOrThrow({ where: { id: f.id } })).clienteId).toBe(outro.id);
      expect((await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { id: f.titulo.id } })).payload).toMatchObject({ clienteId: outro.id });
    }
    expect((await prisma.cliente.findUniqueOrThrow({ where: { id: f.cliente.id } })).name).toBe(f.cliente.name);
  }, 60000);
  it("falha de auditoria reverte título, cliente e OS na mesma transação", async () => {
    const f = await fixture(), { d, r } = await preparar(f);
    // Falha depois da gravação financeira, dentro da transação real PostgreSQL.
    const original = prisma.$transaction.bind(prisma);
    const spy = vi.spyOn(prisma, "$transaction").mockImplementationOnce(((fn: (tx: Prisma.TransactionClient) => Promise<unknown>, opts: unknown) => original(async (tx) => fn(new Proxy(tx, { get(target, key) { return key === "logsAuditoria" ? { create: async () => { throw new Error("falha de auditoria sintética"); } } : Reflect.get(target, key); } })), opts as never)) as typeof prisma.$transaction);
    await expect(salvarEdicaoCompletaOSV3(loja, f.id, d, r)).rejects.toThrow(/falha de auditoria/); spy.mockRestore();
    expect((await prisma.contaReceberTitulo.findUniqueOrThrow({ where: { id: f.titulo.id } })).valor).toBe(330);
    expect((await prisma.ordemServico.findUniqueOrThrow({ where: { id: f.id } })).valorTotal).toBe(330);
    expect(await prisma.auditoriaFinanceira.count({ where: { entidadeId: f.titulo.id } })).toBe(0);
  }, 60000);
});
