import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "qa-pg", name: "Operador sintético", role: "ADMIN", storeAccess: "all" } })) }));
vi.mock("@/lib/auth/guard-enterprise", () => ({ requireEnterpriseWith: vi.fn(async () => ({ ok: true })) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/operacoes-v3/event-publisher", () => ({ emitirEventoOperacaoV3: vi.fn() }));
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma";
import { registrarEntregaV3 } from "@/lib/operacoes-v3/entrega-actions";
import { salvarGarantiaOSV3, registrarImpressaoDocumentoV3, reemitirTermoGarantiaLegadoV3 } from "@/lib/operacoes-v3/garantia-actions";
import { corrigirDatasOSV3 } from "@/lib/operacoes-v3/datas-correcao-actions";
import { comPadroesGarantiaServicosV3, lerCoberturasGarantiaV3, assinaturaGarantiasServicosV3 } from "@/lib/operacoes-v3/garantia-servicos-model";
import { adicionarVersaoTermoGarantiaV3, lerVersoesTermoGarantiaV3 } from "@/lib/operacoes-v3/garantia-termos-model";
import { montarTermoGarantiaDocV3 } from "@/lib/operacoes-v3/print-model";
import { camposCorrigiveisV3 } from "@/lib/operacoes-v3/datas-correcao-model";
import { osGarantiasSinteticaV3 } from "./fixtures";

const urls = [process.env.DATABASE_URL, process.env.DIRECT_URL, process.env.OPS_V4_FRG_TEST_DATABASE_URL].map((u) => new URL(u || "http://ausente"));
if (urls.some((u) => u.hostname !== "127.0.0.1" || u.pathname !== "/ops_v4_frg_qa_garantias" || u.port !== "55439")) throw new Error("BLOQUEIO_PG: somente o banco descartável exclusivo de garantias em loopback:55439.");
afterAll(() => prisma.$disconnect());
const semCobranca = { categoria: "cortesia" as const, motivo: "Cenário sintético de teste" };
let seq = 0;
async function criar() {
  const storeId = `qa-pg-frg003-${Date.now()}-${++seq}`;
  await prisma.store.create({ data: { id: storeId, name: "Empresa sintética v1" } });
  const payload = comPadroesGarantiaServicosV3(osGarantiasSinteticaV3({ storeId }));
  const row = await prisma.ordemServico.create({ data: { storeId, numero: `PG-${seq}`, status: "Pronto", payload: payload as unknown as Prisma.InputJsonValue } });
  const p = { ...payload, id: row.id };
  await prisma.ordemServico.update({ where: { id: row.id }, data: { payload: p as unknown as Prisma.InputJsonValue } });
  const ler = async () => (await prisma.ordemServico.findUniqueOrThrow({ where: { id: row.id } })).payload as unknown as typeof payload;
  const limpar = async () => {
    await prisma.ordemServico.delete({ where: { id: row.id } });
    await prisma.produto.deleteMany({ where: { storeId } });
    await prisma.store.delete({ where: { id: storeId } });
  };
  return { storeId, id: row.id, ler, limpar };
}
describe("PostgreSQL real — entrega, versões e concorrência", () => {
  it("entrega concorrente grava v1 uma vez; reimpressão não repete entrega, estoque ou financeiro", async () => {
    const qa = await criar();
    try {
      await Promise.all([registrarEntregaV3(qa.storeId,qa.id,{ semCobranca }), registrarEntregaV3(qa.storeId,qa.id,{ semCobranca })]);
      const entregue = await qa.ler();
      expect(entregue.timeline.filter((e) => e.tipo === "entrega_cliente")).toHaveLength(1);
      expect(lerVersoesTermoGarantiaV3(entregue)).toHaveLength(1);
      expect(lerVersoesTermoGarantiaV3(entregue)[0].documento.empresa.nome).toBe("Empresa sintética v1");
      const original = montarTermoGarantiaDocV3(entregue), marco = entregue.entregueEm;
      await prisma.store.update({ where: { id: qa.storeId }, data: { name: "Empresa sintética atualizada" } });
      await registrarImpressaoDocumentoV3(qa.storeId,qa.id,"termo_garantia",1);
      await registrarImpressaoDocumentoV3(qa.storeId,qa.id,"termo_garantia",1);
      await registrarEntregaV3(qa.storeId,qa.id);
      const depois = await qa.ler();
      expect(montarTermoGarantiaDocV3(depois)).toEqual(original);
      expect(depois.entregueEm).toBe(marco);
      expect(depois.timeline.filter((e) => e.tipo === "entrega_cliente")).toHaveLength(1);
      expect(await prisma.contaReceberTitulo.count({ where: { storeId: qa.storeId } })).toBe(0);
      expect(await prisma.movimentacaoEstoque.count({ where: { storeId: qa.storeId } })).toBe(0);
      expect(await prisma.movimentacaoFinanceira.count({ where: { storeId: qa.storeId } })).toBe(0);
    } finally { await qa.limpar(); }
  });
  it("falha na geração do snapshot aborta entrega; falha posterior de impressão recupera só o documento", async () => {
    const qa = await criar();
    try {
      const os = await qa.ler(); const alterada = structuredClone(os) as unknown as Record<string, unknown>;
      (alterada.aberturaV3 as { garantiasServicosV3: Array<{ prazoDias: number }> }).garantiasServicosV3[0].prazoDias = 1e12;
      await prisma.ordemServico.update({ where: { id: qa.id }, data: { payload: alterada as Prisma.InputJsonValue } });
      await expect(registrarEntregaV3(qa.storeId,qa.id,{ semCobranca })).rejects.toThrow("Prazo incompatível");
      expect((await qa.ler()).entregueEm).toBeUndefined();
      await prisma.ordemServico.update({ where: { id: qa.id }, data: { payload: os as unknown as Prisma.InputJsonValue } });
      await registrarEntregaV3(qa.storeId,qa.id,{ semCobranca });
      await expect(registrarImpressaoDocumentoV3(qa.storeId,qa.id,"termo_garantia",999)).rejects.toThrow("sem versão");
      expect(montarTermoGarantiaDocV3(await qa.ler()).versao).toBe(1);
      expect((await qa.ler()).timeline.filter((e) => e.tipo === "entrega_cliente")).toHaveLength(1);
    } finally { await qa.limpar(); }
  });
  it("concorrência entrega × edição serializa sem perder coberturas nem alterar v1", async () => {
    const qa = await criar();
    try {
      const esperado = assinaturaGarantiasServicosV3(await qa.ler());
      const resultado = await Promise.allSettled([registrarEntregaV3(qa.storeId,qa.id,{ semCobranca }), salvarGarantiaOSV3(qa.storeId,qa.id,{ linhaId: "tela-1", modeloId: "tela", prazoDias: 180, motivo: "Extensão sintética", esperado })]);
      expect(resultado[0].status).toBe("fulfilled");
      const final = await qa.ler(), versoes = lerVersoesTermoGarantiaV3(final);
      expect(versoes).toHaveLength(1);
      expect(lerCoberturasGarantiaV3(final).find((c) => c.linhaId === "software-1")?.prazoDias).toBe(30);
      expect(versoes[0].documento.coberturas?.find((c) => c.linhaId === "tela-1")?.prazoDias).toBe(lerCoberturasGarantiaV3(final).find((c) => c.linhaId === "tela-1")?.prazoDias);
      if (resultado[1].status === "rejected") expect(String(resultado[1].reason)).toContain("mudou");
    } finally { await qa.limpar(); }
  });
  it("aditivo e correção de data preservam versões e registros financeiros na mesma escrita", async () => {
    const qa = await criar();
    try {
      await registrarEntregaV3(qa.storeId,qa.id,{ semCobranca });
      const v1 = structuredClone(lerVersoesTermoGarantiaV3(await qa.ler())[0]);
      await salvarGarantiaOSV3(qa.storeId,qa.id,{ linhaId: "tela-1", modeloId: "tela", prazoDias: 180, motivo: "Extensão sintética", esperado: assinaturaGarantiasServicosV3(await qa.ler()) });
      const os = await qa.ler(), data = new Date(Date.parse(os.entregueEm!) - 86400000), iso = data.toISOString();
      const esperado = camposCorrigiveisV3(os).campos.find((c) => c.campo === "dataEntrega")!.esperado;
      const input = { alteracoes: { dataEntrega: { iso, meta: { precisao: "data_hora" as const, dia: iso.slice(0,10) } } }, esperados: { dataEntrega: esperado }, motivo: "Correção sintética" };
      const previa = await corrigirDatasOSV3(qa.storeId,qa.id,input);
      expect(previa).toMatchObject({ ok: false, tipo: "confirmacao" });
      if (previa.ok) throw new Error("Confirmação deveria ser exigida");
      const corrigida = await corrigirDatasOSV3(qa.storeId,qa.id,{ ...input, confirmarImpactoGarantia: true, assinaturaImpactoGarantia: previa.garantia!.assinatura });
      expect(corrigida.ok).toBe(true);
      const final = await qa.ler(), versoes = lerVersoesTermoGarantiaV3(final);
      expect(versoes.map((v) => v.tipo)).toEqual(["original","aditivo","correcao_data"]);
      expect(versoes[0]).toEqual(v1); expect(versoes[2].documento.coberturas?.[0].inicio).toBe(iso);
      expect(final.timeline.filter((e) => e.tipo === "entrega_cliente")).toHaveLength(1);
      expect(await prisma.contaReceberTitulo.count({ where: { storeId: qa.storeId } })).toBe(0);
    } finally { await qa.limpar(); }
  });
  it("R-ANTHROPIC-P2-1: primeira definição pós-v1 vazia persiste aditivo atômico sem reentrega ou financeiro", async () => {
    const qa = await criar();
    try {
      const base = { ...await qa.ler(), orcamento: undefined, aberturaV3: {}, entregueEm: "2026-10-10T12:00:00Z", operacaoStatusV3: "entregue" };
      const emitida = adicionarVersaoTermoGarantiaV3(base,{ tipo: "original", agora: "2026-10-10T12:00:00Z", operadorId: "qa", operador: "QA", motivo: "Entrega histórica sintética", origem: "fixture" });
      await prisma.ordemServico.update({ where: { id: qa.id }, data: { payload: JSON.parse(JSON.stringify(emitida)) as Prisma.InputJsonValue } });
      const antes = await qa.ler(), v1 = structuredClone(lerVersoesTermoGarantiaV3(antes)[0]);
      expect(v1.documento.coberturas).toEqual([]);
      const esperado = assinaturaGarantiasServicosV3(antes);
      await expect(salvarGarantiaOSV3(qa.storeId,qa.id,{ modeloId: "tela", prazoDias: 90, esperado })).rejects.toThrow("motivo obrigatório");
      await expect(salvarGarantiaOSV3(qa.storeId,qa.id,{ modeloId: "tela", prazoDias: 90, motivo: "Definição autorizada" })).rejects.toThrow("Reabra o editor");
      expect(await qa.ler()).toEqual(antes);
      await salvarGarantiaOSV3(qa.storeId,qa.id,{ modeloId: "tela", prazoDias: 90, motivo: "Definição autorizada", esperado, origem: "v4" });
      const final = await qa.ler(), versoes = lerVersoesTermoGarantiaV3(final);
      expect(versoes.map((v) => v.tipo)).toEqual(["original","aditivo"]); expect(versoes[0]).toEqual(v1);
      expect(versoes[1]).toMatchObject({ marcoOriginal: v1.marcoOriginal, documento: { coberturas: [{ modeloId: "tela", prazoDias: 90 }] } });
      expect(final.timeline.at(-1)?.metadata).toMatchObject({ alterada: true, antes: null, motivo: "Definição autorizada", versao: 2 });
      expect(final.entregueEm).toBe(antes.entregueEm);
      expect(final.timeline.filter((e) => e.tipo === "entrega_cliente")).toHaveLength(0);
      expect(await prisma.contaReceberTitulo.count({ where: { storeId: qa.storeId } })).toBe(0);
      expect(await prisma.caixaOperacao.count({ where: { storeId: qa.storeId } })).toBe(0);
      expect(await prisma.movimentacaoFinanceira.count({ where: { storeId: qa.storeId } })).toBe(0);
      expect(await prisma.movimentacaoEstoque.count({ where: { storeId: qa.storeId } })).toBe(0);
    } finally { await qa.limpar(); }
  });
  it("legado entregue é preservado, reemissão explicitamente marcada, sem cobrança nova", async () => {
    const qa = await criar();
    try {
      const os = { ...await qa.ler(), entregueEm: "2026-10-10T12:00:00Z", operacaoStatusV3: "entregue" };
      await prisma.ordemServico.update({ where: { id: qa.id }, data: { payload: os as unknown as Prisma.InputJsonValue } });
      await reemitirTermoGarantiaLegadoV3(qa.storeId,qa.id,{ motivo: "Solicitação sintética", esperado: assinaturaGarantiasServicosV3(os) });
      const final = await qa.ler();
      expect(final.entregueEm).toBe(os.entregueEm); expect(lerVersoesTermoGarantiaV3(final)[0].tipo).toBe("reemissao_legado");
      expect(final.timeline.filter((e) => e.tipo === "entrega_cliente")).toHaveLength(0);
    } finally { await qa.limpar(); }
  });
  it("reemissão lê garantia operacional legada no servidor sem renovar nem alterar a linha anterior", async () => {
    const qa = await criar();
    try {
      const os = { ...await qa.ler(), orcamento: undefined, aberturaV3: {}, entregueEm: "2026-10-10T12:00:00Z", operacaoStatusV3: "entregue" };
      await prisma.ordemServico.update({ where: { id: qa.id }, data: { payload: JSON.parse(JSON.stringify(os)) as Prisma.InputJsonValue } });
      const antiga = await prisma.garantiaOrdemServico.create({ data: { storeId: qa.storeId, ordemServicoId: qa.id, prazoDias: 90, cobertura: "Condição legada sintética", dataInicio: new Date("2026-06-01T12:00:00Z"), dataFim: new Date("2026-08-30T12:00:00Z"), status: "ativa" } });
      await reemitirTermoGarantiaLegadoV3(qa.storeId,qa.id,{ motivo: "Reemissão sintética", esperado: assinaturaGarantiasServicosV3(os) });
      expect(lerVersoesTermoGarantiaV3(await qa.ler())[0].documento.coberturas?.[0]).toMatchObject({ inicio: "2026-06-01T12:00:00.000Z", vencimento: "2026-08-30T12:00:00.000Z" });
      expect(await prisma.garantiaOrdemServico.findUnique({ where: { id: antiga.id } })).toEqual(antiga);
    } finally { await qa.limpar(); }
  });
});
