import { describe, expect, it } from "vitest";
import type { OrdemServico } from "@/types/os";
import {
  blocoInternoV3,
  checklistImprimivelV3,
  dadosEmpresaPrintV3,
  itensImprimiveisV3,
  montarDocumentoOSV3,
  montarEtiquetaV3,
  montarTermoGarantiaDocV3,
  observacoesClienteV3,
  resumoFinanceiroImprimivelV3,
  senhaImprimivelV3,
  sugerirGarantiaDaOSV3,
  termoGarantiaDaOSV3,
} from "./print-model";
import {
  GARANTIA_CATALOGO_V3,
  gerarTermoGarantiaV3,
  prazoPadraoGarantiaV3,
  sugerirGarantiaPorDescricaoV3,
  termoGarantiaTextoV3,
} from "./garantia-textos";
import { documentosDisponiveisV3, DOCUMENTO_META_V3 } from "./documentos";

function os(over: Record<string, unknown>): OrdemServico {
  return { id: "os1", codigo: "OS-2026-0001", criadoEm: "2026-06-01T10:00:00Z", timeline: [], ...over } as unknown as OrdemServico;
}

const orcamento = (servicos: unknown[], pecas: unknown[], desconto = 0) => ({
  id: "orc", status: "aprovado", criadoEm: "x", desconto, total: 0, servicos, pecas,
});

describe("print — itens imprimíveis (oculta interno, nunca custo)", () => {
  it("exclui item interno e mantém cobrado/brinde", () => {
    const o = os({
      orcamento: orcamento(
        [
          { id: "s1", descricao: "Troca de tela", valor: 300, custoV3: 120, kindV3: "cobrado" },
          { id: "s2", descricao: "Mão de obra interna", valor: 50, custoV3: 50, kindV3: "interno" },
        ],
        [
          { id: "p1", nome: "Tela", quantidade: 1, valorUnitario: 250, custoUnitario: 150, kindV3: "cobrado" },
          { id: "p2", nome: "Película", quantidade: 1, valorUnitario: 40, custoUnitario: 10, kindV3: "brinde" },
        ],
      ),
    });
    const itens = itensImprimiveisV3(o);
    // interno fora → 3 itens
    expect(itens).toHaveLength(3);
    expect(itens.find((i) => i.descricao === "Mão de obra interna")).toBeUndefined();
    // brinde: subtotal 0 + flag
    const peli = itens.find((i) => i.descricao === "Película")!;
    expect(peli.brinde).toBe(true);
    expect(peli.subtotal).toBe(0);
    // nenhum campo de custo é exposto
    for (const i of itens) {
      expect(Object.keys(i)).not.toContain("custo");
      expect(Object.keys(i)).not.toContain("custoUnitario");
      expect(Object.keys(i)).not.toContain("custoV3");
    }
  });
});

describe("print — resumo financeiro (só previsão salva)", () => {
  it("usa totais do orçamento + sinal/forma da abertura", () => {
    const o = os({
      orcamento: orcamento([{ id: "s1", descricao: "Serviço", valor: 500, kindV3: "cobrado" }], [], 0),
      aberturaV3: { pagamentoPrevisto: { forma: "pix", sinal: 50, vencimentoPrevisto: "2026-06-10T00:00:00Z", observacao: "50% na aprovação" } },
    });
    const r = resumoFinanceiroImprimivelV3(o);
    expect(r.subtotal).toBe(500);
    expect(r.total).toBe(500);
    expect(r.recebido).toBe(50);
    expect(r.saldo).toBe(450);
    expect(r.formaPagamento).toBe("PIX");
    expect(r.observacao).toBe("50% na aprovação");
  });

  it("sem pagamento previsto → recebido/saldo indefinidos", () => {
    const r = resumoFinanceiroImprimivelV3(os({ orcamento: orcamento([{ id: "s1", descricao: "S", valor: 100, kindV3: "cobrado" }], []) }));
    expect(r.recebido).toBeUndefined();
    expect(r.saldo).toBeUndefined();
    expect(r.formaPagamento).toBeUndefined();
  });
});

describe("print — senha + checklist", () => {
  it("senha padrão vira sequência e não expõe valor", () => {
    const sa = senhaImprimivelV3(os({ senhaEquipamento: "1-5-9", senhaEquipamentoTipo: "padrao", equipamento: {} }));
    expect(sa.isPadrao).toBe(true);
    expect(sa.sequencia).toEqual([1, 5, 9]);
    expect(sa.valor).toBe("");
    expect(sa.temSenha).toBe(true);
  });

  it("senha numérica mantém valor", () => {
    const sa = senhaImprimivelV3(os({ senhaEquipamento: "1234", senhaEquipamentoTipo: "numerica", equipamento: {} }));
    expect(sa).toMatchObject({ tipo: "numerica", isPadrao: false, valor: "1234", temSenha: true });
  });

  it("checklist imprimível traz label + estadoLabel", () => {
    const lista = checklistImprimivelV3(os({ checklist: [{ id: "tela", label: "Tela", estado: "ok" }, { id: "touch", label: "Touch", estado: "ruim" }] }));
    expect(lista[0]).toEqual({ label: "Tela", estado: "ok", estadoLabel: "OK" });
    expect(lista[1].estadoLabel).toBe("Ruim");
  });
});

describe("print — observações do cliente (oculta internas)", () => {
  it("filtra observações internas", () => {
    const obs = observacoesClienteV3(
      os({ observacoes: [{ id: "1", autor: "T", conteudo: "Pública", interna: false, criadoEm: "x" }, { id: "2", autor: "T", conteudo: "Privada", interna: true, criadoEm: "x" }] }),
    );
    expect(obs).toEqual(["Pública"]);
  });
});

describe("print — empresa (fallback honesto)", () => {
  it("usa nomeFantasia e monta endereço/cidade", () => {
    const e = dadosEmpresaPrintV3({
      nomeFantasia: "RafaCell",
      cnpj: "12.345.678/0001-90",
      endereco: { rua: "Rua A", numero: "100", bairro: "Centro", cidade: "São Paulo", estado: "SP", cep: "01000-000" },
      contato: { telefone: "(11) 9999-0000", email: "x@y.com" },
    });
    expect(e.nome).toBe("RafaCell");
    expect(e.endereco).toBe("Rua A, 100 - Centro");
    expect(e.cidadeUf).toBe("São Paulo/SP · CEP 01000-000");
    expect(e.temDados).toBe(true);
  });

  it("fallback neutro quando vazio", () => {
    const e = dadosEmpresaPrintV3(undefined);
    expect(e.nome).toBe("Assistência Técnica");
    expect(e.temDados).toBe(false);
    expect(e.cnpj).toBe("");
  });
});

describe("print — garantia", () => {
  it("modelo tela: cobre + exclui, com prazo", () => {
    const t = gerarTermoGarantiaV3({ modeloId: "tela", prazoDias: 90 });
    expect(t.semCobertura).toBe(false);
    expect(t.prazoDias).toBe(90);
    expect(t.cobertura.length).toBeGreaterThan(0);
    expect(t.exclusoes.length).toBeGreaterThan(0);
    expect(t.titulo.toLowerCase()).toContain("tela");
  });

  it("oxidação e sem_garantia: sem cobertura", () => {
    expect(gerarTermoGarantiaV3({ modeloId: "oxidacao" }).semCobertura).toBe(true);
    expect(gerarTermoGarantiaV3({ modeloId: "sem_garantia" }).semCobertura).toBe(true);
    expect(gerarTermoGarantiaV3({ modeloId: "oxidacao" }).cobertura).toHaveLength(0);
  });

  it("personalizado usa texto custom; id desconhecido cai em genérico", () => {
    const p = gerarTermoGarantiaV3({ modeloId: "personalizado", termoCustom: "Cobertura especial X", prazoDias: 60 });
    expect(p.cobertura).toContain("Cobertura especial X");
    const d = gerarTermoGarantiaV3({ modeloId: "zzz" });
    expect(d.modeloId).toBe("desconhecido");
    expect(d.semCobertura).toBe(false);
  });

  it("texto corrido inclui prazo e seções", () => {
    const txt = termoGarantiaTextoV3(gerarTermoGarantiaV3({ modeloId: "bateria", prazoDias: 90 }));
    expect(txt).toContain("90 dias");
    expect(txt).toContain("Cobre:");
    expect(txt).toContain("Não cobre:");
  });

  it("termoGarantiaDaOSV3 lê a garantia prevista da abertura", () => {
    const t = termoGarantiaDaOSV3(os({ aberturaV3: { garantiaPrevista: { modelo: "bateria", prazoDias: 90 } } }));
    expect(t.modeloId).toBe("bateria");
    expect(t.prazoDias).toBe(90);
  });
});

describe("1E — biblioteca de garantias", () => {
  it("catálogo inclui placa e os modelos profissionais", () => {
    const ids = GARANTIA_CATALOGO_V3.map((m) => m.id);
    expect(ids).toContain("placa");
    expect(ids).toContain("tela");
    expect(ids).toContain("oxidacao");
    const placa = GARANTIA_CATALOGO_V3.find((m) => m.id === "placa")!;
    expect(placa.semCobertura).toBe(false);
    expect(placa.cobertura.length).toBeGreaterThan(0);
    expect(prazoPadraoGarantiaV3("software")).toBe(30);
    expect(prazoPadraoGarantiaV3("oxidacao")).toBe(0);
  });

  it("sugestão por descrição mapeia serviço → modelo", () => {
    expect(sugerirGarantiaPorDescricaoV3("Troca de tela frontal")).toBe("tela");
    expect(sugerirGarantiaPorDescricaoV3("Substituição de bateria")).toBe("bateria");
    expect(sugerirGarantiaPorDescricaoV3("Reparo de placa / reballing")).toBe("placa");
    expect(sugerirGarantiaPorDescricaoV3("Desbloqueio de software")).toBe("software");
    expect(sugerirGarantiaPorDescricaoV3("Algo aleatório")).toBeNull();
  });

  it("sugere garantia a partir dos serviços cobrados da OS (ignora interno)", () => {
    const o = os({
      orcamento: orcamento(
        [
          { id: "s0", descricao: "Mão de obra interna", valor: 0, kindV3: "interno" },
          { id: "s1", descricao: "Troca de bateria", valor: 200, kindV3: "cobrado" },
        ],
        [],
      ),
    });
    expect(sugerirGarantiaDaOSV3(o)).toBe("bateria");
  });
});

describe("1E — documentos", () => {
  it("catálogo de documentos: interno nunca é do cliente", () => {
    expect(DOCUMENTO_META_V3.comprovante_interno.cliente).toBe(false);
    expect(DOCUMENTO_META_V3.os_cliente.cliente).toBe(true);
    expect(documentosDisponiveisV3().every((d) => d.disponivel)).toBe(true);
  });

  it("via interna expõe custo/lucro/itens internos/obs internas; cliente não", () => {
    const o = os({
      orcamento: orcamento(
        [
          { id: "s1", descricao: "Troca de tela", valor: 300, custoV3: 120, kindV3: "cobrado" },
          { id: "s2", descricao: "Ajuste interno", valor: 0, custoV3: 40, kindV3: "interno" },
        ],
        [],
      ),
      observacoes: [{ id: "1", autor: "T", conteudo: "Nota interna", interna: true, criadoEm: "x" }],
    });
    const interno = blocoInternoV3(o);
    expect(interno.custo).toBe(160); // 120 + 40
    expect(interno.itensInternos).toHaveLength(1);
    expect(interno.observacoesInternas).toEqual(["Nota interna"]);

    const cliente = montarDocumentoOSV3(o, undefined, { variante: "cliente" });
    expect(cliente.interno).toBeUndefined();
    const viaInterna = montarDocumentoOSV3(o, undefined, { variante: "interna" });
    expect(viaInterna.interno?.custo).toBe(160);
  });

  it("termo de garantia e etiqueta montam com dados reais", () => {
    const o = os({
      codigo: "OS-9",
      cliente: { id: "c", nome: "Ana", telefone: "(11) 9", documento: "1", email: "" },
      equipamento: { tipo: "Smartphone", marca: "Apple", modelo: "iPhone 13", numeroSerie: "IMEI9", defeitoRelatado: "x" },
      tecnico: { id: "t", nome: "João", especialidades: [], online: true },
      orcamento: orcamento([{ id: "s1", descricao: "Troca de tela", valor: 300, kindV3: "cobrado" }], []),
      aberturaV3: { garantiaPrevista: { modelo: "tela", prazoDias: 90 } },
    });
    const termo = montarTermoGarantiaDocV3(o, { nomeFantasia: "RafaCell" });
    expect(termo.numero).toBe("OS-9");
    expect(termo.termo.modeloId).toBe("tela");
    expect(termo.servicoRealizado).toContain("Troca de tela");

    const etq = montarEtiquetaV3(o);
    expect(etq.numero).toBe("OS-9");
    expect(etq.cliente).toBe("Ana");
    expect(etq.equipamento).toBe("Apple iPhone 13");
    expect(etq.tecnico).toBe("João");
  });
});

describe("print — documento completo", () => {
  it("monta o documento via cliente sem itens internos nem observações internas", () => {
    const doc = montarDocumentoOSV3(
      os({
        cliente: { id: "c", nome: "Maria", telefone: "(11) 90000-0000", documento: "123", email: "" },
        equipamento: { tipo: "Smartphone", marca: "Apple", modelo: "iPhone 13", numeroSerie: "IMEI1", defeitoRelatado: "Tela quebrada", acessorios: ["Capinha"] },
        orcamento: orcamento([{ id: "s1", descricao: "Troca de tela", valor: 300, kindV3: "cobrado" }, { id: "s2", descricao: "Interno", valor: 10, kindV3: "interno" }], []),
        observacoes: [{ id: "1", autor: "T", conteudo: "Aviso público", interna: false, criadoEm: "x" }, { id: "2", autor: "T", conteudo: "Nota interna", interna: true, criadoEm: "x" }],
        aberturaV3: { garantiaPrevista: { modelo: "tela", prazoDias: 90 }, condicaoAparelho: "Riscos na lateral" },
      }),
      { nomeFantasia: "RafaCell" },
      { now: new Date("2026-06-05T12:00:00Z") },
    );
    expect(doc.numero).toBe("OS-2026-0001");
    expect(doc.empresa.nome).toBe("RafaCell");
    expect(doc.itens).toHaveLength(1); // interno excluído
    expect(doc.observacoesCliente).toEqual(["Aviso público"]);
    expect(doc.equipamento.condicao).toBe("Riscos na lateral");
    expect(doc.garantia.modeloId).toBe("tela");
    expect(doc.impressoEm).toBe("2026-06-05T12:00:00.000Z");
  });
});
