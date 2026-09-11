// GOAL OPS-V4-MULTI-SERVICOS-UI-003 — UX multi-serviço (lógica pura).
// Interação DOM (dropdown/foco) é verificada em browser; aqui cobre-se toda a
// regra testável sem DOM: busca, snapshot, linhas, totais e compatibilidade.
import { describe, expect, it } from "vitest";
import { filtrarServicosCatalogoV4, type ServicoCatalogoV4 } from "@/components/operacoes-v4-preview/use-servicos-v4";
import {
  atualizarLinhaServicoV4,
  erroLinhaServicoV4,
  linhaServicoDoCatalogoV4,
  linhaValidaServicoV4,
  novaLinhaServicoV4,
  paraServicosAutorizadosV4,
  removerLinhaServicoV4,
  totaisServicosV4,
} from "./servicos-autorizados-form";
import { buildNovaOSDraftFromFormV4 } from "./nova-os-draft-from-form";

const CATALOGO: ServicoCatalogoV4[] = [
  { id: "svc-tela", nome: "Troca de tela", preco: 2000, custo: 766.7, garantia: 90, tempo: "2 horas", termo: "", active: true },
  { id: "svc-tampa", nome: "Troca de tampa traseira", preco: 450, custo: 180, garantia: 30, tempo: "1 hora", termo: "", active: true },
  { id: "svc-limp", nome: "Limpeza", preco: 80, custo: 10, garantia: 0, tempo: "30 min", termo: "", active: true },
  { id: "svc-off", nome: "Tela antiga", preco: 100, custo: 10, garantia: 0, tempo: "1 hora", termo: "", active: false },
];

describe("A. lista não aparece com query vazia", () => {
  it("query vazia/em branco/curta → []", () => {
    expect(filtrarServicosCatalogoV4(CATALOGO, "")).toEqual([]);
    expect(filtrarServicosCatalogoV4(CATALOGO, "   ")).toEqual([]);
    expect(filtrarServicosCatalogoV4(CATALOGO, "t")).toEqual([]);
  });
});

describe("B. query encontra o serviço", () => {
  it('"limp" retorna Limpeza (e não os inativos)', () => {
    const r = filtrarServicosCatalogoV4(CATALOGO, "limp");
    expect(r.map((s) => s.nome)).toEqual(["Limpeza"]);
  });
  it('"tela" retorna tela e tampa (case-insensitive), sem inativos', () => {
    const r = filtrarServicosCatalogoV4(CATALOGO, "TELA");
    expect(r.map((s) => s.nome)).toEqual(["Troca de tela"]);
  });
});

describe("C. selecionar catálogo preserva catalogoServicoId", () => {
  it("snapshot carrega nome/preço/custo/garantia/prazo + id real", () => {
    const l = linhaServicoDoCatalogoV4("linha-1", CATALOGO[0]!);
    expect(l).toMatchObject({
      key: "linha-1",
      nome: "Troca de tela",
      valor: 2000,
      custo: 766.7,
      garantia: 90,
      prazo: "2 horas",
      catalogoServicoId: "svc-tela",
      confirmada: false,
    });
  });
});

describe("D. adicionar Tela + Tampa", () => {
  it("servicosAutorizados.length === 2", () => {
    const linhas = [
      { ...linhaServicoDoCatalogoV4("linha-1", CATALOGO[0]!), confirmada: true },
      { ...linhaServicoDoCatalogoV4("linha-2", CATALOGO[1]!), confirmada: true },
    ];
    expect(paraServicosAutorizadosV4(linhas)).toHaveLength(2);
  });
});

describe("E. editar preço de uma linha", () => {
  it("só aquela linha muda (snapshot editável, sem voltar ao catálogo)", () => {
    const linhas = [
      { ...linhaServicoDoCatalogoV4("linha-1", CATALOGO[0]!), confirmada: true },
      { ...linhaServicoDoCatalogoV4("linha-2", CATALOGO[1]!), confirmada: true },
    ];
    const editadas = atualizarLinhaServicoV4(linhas, "linha-2", { valor: 500 });
    expect(editadas[0]!.valor).toBe(2000);
    expect(editadas[1]!.valor).toBe(500);
    const contrato = paraServicosAutorizadosV4(editadas);
    expect(contrato[1]!.valor).toBe(500);
  });
});

describe("F. remover uma linha recalcula o total", () => {
  it("remove só a linha e o total cai para 2000", () => {
    const linhas = [
      { ...linhaServicoDoCatalogoV4("linha-1", CATALOGO[0]!), confirmada: true },
      { ...linhaServicoDoCatalogoV4("linha-2", CATALOGO[1]!), confirmada: true },
    ];
    const resto = removerLinhaServicoV4(linhas, "linha-2");
    expect(resto).toHaveLength(1);
    expect(totaisServicosV4(resto).venda).toBe(2000);
  });
});

describe("G/H. dois serviços: total, custo e lucro", () => {
  it("total 2450, custo 946,70, lucro 1503,30", () => {
    const linhas = [
      { ...linhaServicoDoCatalogoV4("linha-1", CATALOGO[0]!), confirmada: true },
      { ...linhaServicoDoCatalogoV4("linha-2", CATALOGO[1]!), confirmada: true },
    ];
    const tot = totaisServicosV4(linhas);
    expect(tot.qtd).toBe(2);
    expect(tot.venda).toBe(2450);
    expect(tot.custo).toBeCloseTo(946.7, 2);
    expect(tot.lucro).toBeCloseTo(1503.3, 2);
    expect(tot.margem).toBeCloseTo(61.4, 1);
  });
});

describe("I. item manual sem catalogoServicoId é válido", () => {
  it("linha manual entra no contrato sem a chave de catálogo", () => {
    const manual = {
      ...novaLinhaServicoV4("linha-9"),
      nome: "Reparo de trilha no conector",
      valor: 300,
      custo: 40,
      garantia: 30,
      prazo: "3 horas",
      confirmada: true,
    };
    expect(linhaValidaServicoV4(manual)).toBe(true);
    const contrato = paraServicosAutorizadosV4([manual]);
    expect(contrato).toHaveLength(1);
    expect(contrato[0]!.descricao).toBe("Reparo de trilha no conector");
    expect("catalogoServicoId" in contrato[0]!).toBe(false);
  });
});

describe("J/K. prazo e garantias individuais sobrevivem", () => {
  it("prazoTexto e garantiaDias por linha chegam ao draft", () => {
    const linhas = [
      { ...linhaServicoDoCatalogoV4("linha-1", CATALOGO[0]!), confirmada: true },
      { ...linhaServicoDoCatalogoV4("linha-2", CATALOGO[1]!), confirmada: true },
    ];
    const draft = buildNovaOSDraftFromFormV4(
      {
        clienteExistente: null,
        clienteNovo: { nome: "Vanessa" },
        equipamentoTipo: "celular",
        marca: "Apple",
        modelo: "iPhone 17 Pro Max",
        defeitoRelatado: "Tela e tampa danificadas",
        origem: "balcao",
        tipoEntrada: "servico_autorizado",
        servicosAutorizados: paraServicosAutorizadosV4(linhas),
      },
      new Date("2026-09-09T12:00:00.000Z"),
    );
    expect(draft.itens).toHaveLength(2);
    expect(draft.itens[0]).toMatchObject({ prazoTexto: "2 horas", garantiaDias: 90 });
    expect(draft.itens[1]).toMatchObject({ prazoTexto: "1 hora", garantiaDias: 30 });
  });
});

describe("L/M. diagnóstico e retorno não regridem", () => {
  it("diagnóstico ignora serviços (sem exigir valor)", () => {
    const draft = buildNovaOSDraftFromFormV4(
      {
        clienteExistente: null,
        clienteNovo: { nome: "Ana" },
        equipamentoTipo: "celular",
        marca: "Apple",
        modelo: "13",
        defeitoRelatado: "Não liga",
        origem: "balcao",
        tipoEntrada: "precisa_diagnostico",
        servicosAutorizados: [{ descricao: "X", valor: 10, custo: 0, garantiaDias: 0 }],
      },
      new Date("2026-09-09T12:00:00.000Z"),
    );
    expect(draft.itens).toEqual([]);
  });
  it("retorno/garantia ignora serviços e preserva origem", () => {
    const draft = buildNovaOSDraftFromFormV4(
      {
        clienteExistente: null,
        clienteNovo: { nome: "Beto" },
        equipamentoTipo: "celular",
        marca: "Apple",
        modelo: "13",
        defeitoRelatado: "Voltou",
        origem: "garantia",
        tipoEntrada: "retorno_garantia",
        servicosAutorizados: [{ descricao: "X", valor: 10, custo: 0, garantiaDias: 0 }],
      },
      new Date("2026-09-09T12:00:00.000Z"),
    );
    expect(draft.itens).toEqual([]);
    expect(draft.recepcao.origem).toBe("garantia");
  });
  it("linha vazia é inválida (sem fantasma no contrato)", () => {
    const vazia = novaLinhaServicoV4("linha-1");
    expect(linhaValidaServicoV4(vazia)).toBe(false);
    expect(erroLinhaServicoV4(vazia)).toMatch(/descri/);
    expect(paraServicosAutorizadosV4([vazia])).toEqual([]);
  });
});
