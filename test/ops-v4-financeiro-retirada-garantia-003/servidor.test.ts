import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ payload: {} as Record<string, unknown>, permissao: true, update: vi.fn(), store: vi.fn(), loja: "qa-loja" }));
vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "operador-servidor", name: "Operador Servidor" } })) }));
vi.mock("@/lib/auth/guard-enterprise", () => ({ requireEnterpriseWith: vi.fn(async (_sid, check) => check({ operacoes: { editarOs: true, garantia: h.permissao } }) ? { ok: true } : { ok: false, error: "Sem permissão de garantia" }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/operacoes-v3/event-publisher", () => ({ emitirEventoOperacaoV3: vi.fn() }));
vi.mock("@/lib/prisma", () => {
  const tx = { store: { findUnique: h.store }, storeSettings: { findUnique: vi.fn(async () => null) }, ordemServico: { findFirst: vi.fn(async ({ where }) => where.storeId === h.loja ? { id: "qa-os", payload: h.payload } : null), update: h.update }, $queryRaw: vi.fn(async () => [{ id: "qa-os" }]) };
  return { prisma: { ...tx, $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } };
});
import { salvarGarantiaOSV3, reemitirTermoGarantiaLegadoV3, registrarImpressaoDocumentoV3 } from "@/lib/operacoes-v3/garantia-actions";
import { assinaturaGarantiasServicosV3, comPadroesGarantiaServicosV3, lerCoberturasGarantiaV3 } from "@/lib/operacoes-v3/garantia-servicos-model";
import { adicionarVersaoTermoGarantiaV3, lerVersoesTermoGarantiaV3 } from "@/lib/operacoes-v3/garantia-termos-model";
import { osGarantiasSinteticaV3 } from "./fixtures";

beforeEach(() => {
  h.payload = comPadroesGarantiaServicosV3(osGarantiasSinteticaV3()) as unknown as Record<string, unknown>; h.permissao = true;
  h.update.mockReset().mockImplementation(async ({ data }) => { h.payload = data.payload; return {}; });
  h.store.mockReset().mockResolvedValue({ name: "Empresa do servidor" });
});
describe("permissões, concorrência e auditoria do servidor", () => {
  it("confirmar padrão precisa só editarOs; alterar exige permissão de garantia e motivo", async () => {
    h.permissao = false;
    await salvarGarantiaOSV3(h.loja,"qa-os",{ linhaId: "tela-1", modeloId: "tela", prazoDias: 90 });
    h.update.mockClear();
    await expect(salvarGarantiaOSV3(h.loja,"qa-os",{ linhaId: "tela-1", modeloId: "tela", prazoDias: 180, motivo: "Extensão" })).rejects.toThrow("Sem permissão");
    expect(h.update).not.toHaveBeenCalled(); h.permissao = true;
    await expect(salvarGarantiaOSV3(h.loja,"qa-os",{ linhaId: "tela-1", modeloId: "tela", prazoDias: 180 })).rejects.toThrow("motivo obrigatório");
    expect(h.update).not.toHaveBeenCalled();
  });
  it("grava antes/depois, ator, origem e instante e preserva outras coberturas", async () => {
    const antes = lerCoberturasGarantiaV3(h.payload);
    const salva = await salvarGarantiaOSV3(h.loja,"qa-os",{ linhaId: "tela-1", modeloId: "tela", prazoDias: 180, motivo: "Extensão sintética", origem: "v4", esperado: assinaturaGarantiasServicosV3(h.payload) });
    expect(lerCoberturasGarantiaV3(salva).slice(1)).toEqual(antes.slice(1));
    expect(salva.timeline.at(-1)?.metadata).toMatchObject({ antes: { prazoDias: 90 }, depois: { prazoDias: 180 }, operadorId: "operador-servidor", origem: "v4", motivo: "Extensão sintética", instante: expect.any(String) });
  });
  it("nega outra loja, linha não aprovada e edição coletiva implícita", async () => {
    await expect(salvarGarantiaOSV3("outra","qa-os",{ modeloId: "tela" })).rejects.toThrow("OS não encontrada");
    await expect(salvarGarantiaOSV3(h.loja,"qa-os",{ linhaId: "opcao-nao-escolhida", modeloId: "tela" })).rejects.toThrow("Serviço não aprovado");
    await expect(salvarGarantiaOSV3(h.loja,"qa-os",{ modeloId: "tela" })).rejects.toThrow("Selecione o serviço");
    expect(h.update).not.toHaveBeenCalled();
  });
  it("recusa resposta concorrente e gera aditivo, preservando v1", async () => {
    h.payload = adicionarVersaoTermoGarantiaV3({ ...h.payload, entregueEm: "2026-10-10T12:00:00Z" }, { tipo: "original", agora: "2026-10-10T12:00:00Z", operadorId: "qa", operador: "QA", motivo: "Entrega", origem: "teste" });
    const v1 = structuredClone(lerVersoesTermoGarantiaV3(h.payload)[0]), esperado = assinaturaGarantiasServicosV3(h.payload);
    await salvarGarantiaOSV3(h.loja,"qa-os",{ linhaId: "tela-1", modeloId: "tela", prazoDias: 180, motivo: "Extensão", esperado });
    expect(lerVersoesTermoGarantiaV3(h.payload)[0]).toEqual(v1);
    expect(lerVersoesTermoGarantiaV3(h.payload)[1]).toMatchObject({ tipo: "aditivo", operadorId: "operador-servidor" });
    h.update.mockClear();
    await expect(salvarGarantiaOSV3(h.loja,"qa-os",{ linhaId: "software-1", modeloId: "software", prazoDias: 60, motivo: "Concorrente", esperado })).rejects.toThrow("mudou");
    expect(h.update).not.toHaveBeenCalled();
  });
  it("legado requer reemissão explícita, lê empresa no servidor e impressão não reentrega", async () => {
    h.payload.entregueEm = "2026-10-10T12:00:00Z";
    await expect(salvarGarantiaOSV3(h.loja,"qa-os",{ linhaId: "tela-1", modeloId: "tela", prazoDias: 180, motivo: "Teste" })).rejects.toThrow("legado sem snapshot");
    h.permissao = false;
    await expect(reemitirTermoGarantiaLegadoV3(h.loja,"qa-os",{ motivo: "Teste", esperado: assinaturaGarantiasServicosV3(h.payload) })).rejects.toThrow("Sem permissão");
    h.permissao = true;
    await reemitirTermoGarantiaLegadoV3(h.loja,"qa-os",{ motivo: "Reemissão sintética", esperado: assinaturaGarantiasServicosV3(h.payload) });
    expect(lerVersoesTermoGarantiaV3(h.payload)[0]).toMatchObject({ tipo: "reemissao_legado", documento: { empresa: { nome: "Empresa do servidor" } } });
    const antes = structuredClone(h.payload);
    await registrarImpressaoDocumentoV3(h.loja,"qa-os","termo_garantia",1);
    expect(h.payload.entregueEm).toBe(antes.entregueEm);
    expect(h.payload.termosGarantiaV3).toEqual(antes.termosGarantiaV3);
    expect(h.payload.timeline).toHaveLength((antes.timeline as unknown[]).length + 1);
  });
});
