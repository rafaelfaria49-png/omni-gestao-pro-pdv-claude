import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ findMany: vi.fn(), permitida: true, guard: vi.fn() }));
vi.mock("@/lib/prisma",() => ({ prisma: { servico: { findMany: h.findMany } } }));
vi.mock("@/lib/auth/guard-enterprise",() => ({ requireEnterpriseWith: h.guard }));
import { prepararGarantiasAberturaV3 } from "@/lib/operacoes-v3/garantia-abertura-server";
import { novaOSDraftVazioV3, type NovaOSItemV3 } from "@/lib/operacoes-v3/nova-os-model";
const ator = { id: "ator-servidor", nome: "Operador QA" };
const item = (over: Partial<NovaOSItemV3> = {}): NovaOSItemV3 => ({ id: "linha-real", categoria: "servico", descricao: "Troca de Tela", quantidade: 1, custoUnitario: 0, valorUnitario: 100, kind: "cobrado", baixaEstoque: false, catalogoServicoId: "catalogo", garantiaModeloId: "tela", garantiaDias: 90, ...over });
beforeEach(() => {
  h.findMany.mockReset().mockResolvedValue([{id:"catalogo",name:"Troca de Tela",warrantyDays:90,terms:"Condições já cadastradas"}]);
  h.guard.mockReset().mockImplementation(async () => h.permitida ? {ok:true} : {ok:false,error:"Sem permissão"}); h.permitida = true;
});
describe("padrões e autorização também na abertura",() => {
  it("lê só a loja autorizada e confirma padrão sem permissão adicional",async () => {
    const r = await prepararGarantiasAberturaV3("loja-qa",{...novaOSDraftVazioV3(),itens:[item()]},ator);
    expect(h.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{storeId:"loja-qa",id:{in:["catalogo"]}}}));
    expect(h.guard).not.toHaveBeenCalled(); expect(r.draft.itens[0].garantiaTermo).toBe("Condições já cadastradas");
  });
  it("extensão na abertura exige motivo e garantia; auditoria usa ator do servidor",async () => {
    const draft = {...novaOSDraftVazioV3(),itens:[item({garantiaDias:180})]};
    await expect(prepararGarantiasAberturaV3("loja-qa",draft,ator)).rejects.toThrow("motivo obrigatório");
    draft.itens[0].garantiaMotivo = "Extensão autorizada"; h.permitida = false;
    await expect(prepararGarantiasAberturaV3("loja-qa",draft,ator)).rejects.toThrow("Sem permissão");
    h.permitida = true; const r = await prepararGarantiasAberturaV3("loja-qa",draft,ator);
    expect(r.auditoria[0]).toMatchObject({linhaAberturaId:"linha-real",antes:{prazoDias:90},depois:{prazoDias:180},operadorId:"ator-servidor",motivo:"Extensão autorizada"});
  });
  it("preserva software 30 e catálogo sem cobertura 0; modelo divergente é alteração",async () => {
    h.findMany.mockResolvedValue([{id:"soft",name:"Software",warrantyDays:30,terms:""},{id:"dados",name:"Transferência de Dados",warrantyDays:0,terms:""}]);
    const r = await prepararGarantiasAberturaV3("loja-qa",{...novaOSDraftVazioV3(),itens:[item({catalogoServicoId:"soft",garantiaModeloId:"software",garantiaDias:30}),item({id:"dados",catalogoServicoId:"dados",garantiaModeloId:"sem_garantia",garantiaDias:0})]},ator);
    expect(r.draft.itens.map((c) => c.garantiaDias)).toEqual([30,0]); expect(h.guard).not.toHaveBeenCalled();
    await expect(prepararGarantiasAberturaV3("loja-qa",{...novaOSDraftVazioV3(),itens:[item({catalogoServicoId:"soft",garantiaModeloId:"tela"})]},ator)).rejects.toThrow("motivo obrigatório");
  });
  it("recusa catálogo de outra loja antes de criar cliente/OS",async () => {
    h.findMany.mockResolvedValue([]);
    await expect(prepararGarantiasAberturaV3("outra",{...novaOSDraftVazioV3(),itens:[item()]},ator)).rejects.toThrow("não encontrado nesta loja");
  });
});
