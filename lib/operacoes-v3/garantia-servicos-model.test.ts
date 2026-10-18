import { describe, expect, it } from "vitest";
import { osGarantiasSinteticaV3 } from "@/test/ops-v4-financeiro-retirada-garantia-003/fixtures";
import { assinaturaGarantiasServicosV3, comPadroesGarantiaServicosV3, condicaoUnicaGarantiaV3, gravarCoberturasGarantiaV3, lerCoberturasGarantiaV3, validarPrazoGarantiaServicoV3 } from "./garantia-servicos-model";
import { adicionarVersaoTermoGarantiaV3, documentoGarantiaEmitidoV3, empresaSnapshotGarantiaV3, lerVersoesTermoGarantiaV3 } from "./garantia-termos-model";
import { montarTermoGarantiaDocV3 } from "./print-model";
import { lerGarantiaV3 } from "./pos-venda-model";
import { camposCorrigiveisV3, planejarCorrecaoDatasV3 } from "./datas-correcao-model";
import { GARANTIA_CATALOGO_V3 } from "./garantia-textos";

const agora = "2026-10-13T12:00:00.000Z";
const empresa = empresaSnapshotGarantiaV3({ name: "Empresa Sintética Original", cnpj: "CNPJ SINTETICO" });
const emissao = { tipo: "original" as const, agora, operadorId: "qa", operador: "Operador QA", motivo: "Entrega confirmada", origem: "teste", empresa };
const entregue = () => comPadroesGarantiaServicosV3(osGarantiasSinteticaV3({ entregueEm: agora, entregaV3: { entregueEm: agora }, operacaoStatusV3: "entregue" }));

describe("garantias por linha aprovada", () => {
  it("mantém IDs diferentes do mesmo catálogo, 90/30/0 e exclui opção não selecionada", () => {
    const os = comPadroesGarantiaServicosV3(osGarantiasSinteticaV3());
    const coberturas = lerCoberturasGarantiaV3(os);
    expect(coberturas.map((c) => [c.linhaId, c.prazoDias])).toEqual([["tela-1",90],["software-1",30],["tela-2",90],["dados-1",0]]);
    expect(condicaoUnicaGarantiaV3(coberturas)).toBeNull();
    expect((os as unknown as { aberturaV3: { garantiaPrevista?: unknown } }).aberturaV3.garantiaPrevista).toBeUndefined();
    os.orcamento!.servicos.reverse();
    expect(lerCoberturasGarantiaV3(os).map((c) => c.linhaId).sort()).toEqual(coberturas.map((c) => c.linhaId).sort());
  });
  it("reordenar preserva a edição na linha real; mesmo prazo sem mesmas condições não é único", () => {
    let os = osGarantiasSinteticaV3(); const cs = lerCoberturasGarantiaV3(os);
    cs[0].prazoDias = 180; os = gravarCoberturasGarantiaV3(os, cs); os.orcamento!.servicos.reverse();
    expect(lerCoberturasGarantiaV3(os).find((c) => c.linhaId === "tela-1")?.prazoDias).toBe(180);
    expect(condicaoUnicaGarantiaV3([cs[0], { ...cs[0], linhaId: "outra", termoCustom: "Condição sintética" }])).toBeNull();
  });
  it("não inventa personalizado 90 para marcador desconhecido ou descrição livre", () => {
    const os = osGarantiasSinteticaV3({ orcamento: { status: "aprovado", pecas: [], servicos: [{ id: "livre", descricao: "Troca de tela livre" }] } });
    expect(lerCoberturasGarantiaV3(os)[0]).toMatchObject({ modeloId: "nao_definida", prazoDias: 0 });
    expect(lerGarantiaV3(os).temGarantia).toBe(false);
    expect(lerGarantiaV3(osGarantiasSinteticaV3({ orcamento: undefined, aberturaV3: { garantiaPrevista: { modelo: "marcador-inexistente" } } })).prazoDias).toBe(0);
  });
  it("aceita extensão sem teto comercial e recusa decimais, não finitos e modelo desconhecido", () => {
    expect(validarPrazoGarantiaServicoV3("tela", 720)).toBe(720);
    expect(validarPrazoGarantiaServicoV3("software")).toBe(30);
    expect(validarPrazoGarantiaServicoV3("transferencia_dados", 90)).toBe(0);
    for (const n of [0,-1,1.5,Number.NaN,Infinity]) expect(() => validarPrazoGarantiaServicoV3("tela", n)).toThrow();
    expect(() => validarPrazoGarantiaServicoV3("por_servico",90)).toThrow();
  });
  it("assinatura independe da ordem e detecta entrega e nova versão", () => {
    const os = entregue(), a = assinaturaGarantiasServicosV3(os); os.orcamento!.servicos.reverse();
    expect(assinaturaGarantiasServicosV3(os)).toBe(a);
    expect(assinaturaGarantiasServicosV3(adicionarVersaoTermoGarantiaV3(os, emissao))).not.toBe(a);
  });
});

describe("termo versionado imutável", () => {
  it("v1 reimprime fiel após mudanças de empresa/catálogo/cliente e não contém senha, custos ou aceite", () => {
    const os = adicionarVersaoTermoGarantiaV3(entregue(), emissao), original = montarTermoGarantiaDocV3(os);
    const cat = GARANTIA_CATALOGO_V3.find((c) => c.id === "tela")!, cobertura = [...cat.cobertura];
    try {
      cat.cobertura = ["Texto novo do catálogo"]; os.cliente.nome = "Cliente alterado";
      expect(montarTermoGarantiaDocV3(os, { nomeFantasia: "Empresa alterada" }, { now: new Date("2027-01-01") })).toEqual(original);
      expect(JSON.stringify(original)).not.toMatch(/SEGREDO|INTERNO|987654|assinatura|aceite/i);
      expect(original.coberturas).toHaveLength(4);
      expect(original.empresa.nome).toBe("Empresa Sintética Original");
    } finally { cat.cobertura = cobertura; }
  });
  it("aditivo preserva original, marco e condições de outras linhas; emissão repetida é no-op", () => {
    let os = adicionarVersaoTermoGarantiaV3(entregue(), emissao); const v1 = documentoGarantiaEmitidoV3(os,1);
    const cs = lerCoberturasGarantiaV3(os); cs[0].prazoDias = 180;
    os = adicionarVersaoTermoGarantiaV3(gravarCoberturasGarantiaV3(os,cs), { ...emissao, tipo: "aditivo", motivo: "Extensão autorizada", agora: "2026-10-14T12:00:00Z" });
    expect(documentoGarantiaEmitidoV3(os,1)).toEqual(v1);
    expect(documentoGarantiaEmitidoV3(os,2)?.coberturas?.[0].prazoDias).toBe(180);
    expect(lerVersoesTermoGarantiaV3(os)[1].marcoOriginal).toBe(agora);
    expect(lerVersoesTermoGarantiaV3(adicionarVersaoTermoGarantiaV3(os,emissao))).toHaveLength(2);
  });
  it("legado é identificado e reemissão jamais se apresenta como original", () => {
    const os = entregue(); expect(montarTermoGarantiaDocV3(os).limitacao).toMatch(/legado sem snapshot/);
    const reemitida = adicionarVersaoTermoGarantiaV3(os,{ ...emissao,tipo: "reemissao_legado" });
    expect(documentoGarantiaEmitidoV3(reemitida)?.tipoVersao).toBe("reemissao_legado");
  });
  it("reemissão de garantia V2 preserva início e vencimento comprovados e materializa edição auditável", () => {
    const legado = osGarantiasSinteticaV3({ orcamento: undefined, aberturaV3: {}, entregueEm: "2026-10-10T12:00:00Z", garantia: { ativa: true, prazoDias: 90, inicioEm: "2026-06-01T12:00:00Z", fimEm: "2026-08-30T12:00:00Z", termo: "Condição legada preservada" } });
    const emitida = adicionarVersaoTermoGarantiaV3(legado,{ ...emissao,tipo: "reemissao_legado" });
    expect(documentoGarantiaEmitidoV3(emitida)?.coberturas?.[0]).toMatchObject({ inicio: "2026-06-01T12:00:00Z", vencimento: "2026-08-30T12:00:00Z" });
    expect(lerCoberturasGarantiaV3(emitida)).toHaveLength(1);
    expect(emitida.garantia).toEqual(legado.garantia);
    expect(lerGarantiaV3(emitida,new Date(agora)).situacao).toBe("vencida");
  });
  it("correção exige confirmação por cobertura e impede reativar a menor vencida", () => {
    const os = entregue(), esperado = camposCorrigiveisV3(os).campos.find((c) => c.campo === "dataEntrega")!.esperado;
    const input = { alteracoes: { dataEntrega: { iso: "2026-10-12T12:00:00.000Z", meta: { precisao: "data_hora" as const, dia: "2026-10-12" } } }, esperados: { dataEntrega: esperado }, motivo: "Corrigir registro sintético" };
    const ctx = { agora: new Date("2026-10-20T12:00:00Z"), operador: "QA", operadorId: "qa", eventoId: "teste" };
    const p = planejarCorrecaoDatasV3(os,input,ctx);
    expect(p.ok).toBe(false); if (p.ok) return;
    expect(p.tipo).toBe("confirmacao"); expect(p.garantia?.coberturasServicos).toHaveLength(4);
    const confirmado = planejarCorrecaoDatasV3(os,{ ...input, confirmarImpactoGarantia: true, assinaturaImpactoGarantia: p.garantia?.assinatura }, { ...ctx, exigirAssinaturaGarantia: true });
    expect(confirmado.ok).toBe(true);
    const reativar = planejarCorrecaoDatasV3(os,{ ...input, alteracoes: { dataEntrega: { iso: "2026-11-20T12:00:00.000Z", meta: { precisao: "data_hora" as const, dia: "2026-11-20" } } } }, { ...ctx, agora: new Date("2026-11-25T12:00:00Z") });
    expect(reativar).toMatchObject({ ok: false, tipo: "impedimento" });
  });
});
