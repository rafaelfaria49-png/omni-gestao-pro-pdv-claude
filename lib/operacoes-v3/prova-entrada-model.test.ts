import { describe, it, expect } from "vitest";
import type { OrdemServico } from "@/types/os";
import {
  ASSINATURA_MAX_BYTES_V3,
  COMPONENTES_FISICOS_V3,
  FOTO_MAX_V3,
  credenciaisMascaradasV3,
  estadoFisicoPadraoV3,
  lerProvaEntradaV3,
  mascararContaV3,
  mascararSegredoV3,
  provaEntradaCriadaV3,
  resumoEstadoFisicoV3,
  validarAssinaturaV3,
  validarFotoEntradaV3,
} from "./prova-entrada-model";

type OSLike = OrdemServico & Record<string, unknown>;
function os(over: Record<string, unknown>): OSLike {
  return { id: "os1", codigo: "OS-1", cliente: { nome: "Maria" }, equipamento: {}, timeline: [], ...over } as unknown as OSLike;
}
const imgUrl = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

describe("prova-entrada-model · leitura + compat", () => {
  it("OS sem prova → esqueleto não-criado, 8 componentes OK, sem inventar avarias", () => {
    const p = lerProvaEntradaV3(os({}));
    expect(p.versao).toBe(0);
    expect(provaEntradaCriadaV3(os({}))).toBe(false);
    expect(p.estadoFisico).toHaveLength(COMPONENTES_FISICOS_V3.length);
    expect(p.estadoFisico.every((i) => i.status === "ok")).toBe(true);
    expect(p.avarias).toEqual([]);
    expect(p.fotos).toEqual([]);
  });

  it("semeia acessórios a partir de equipamento.acessorios (compat)", () => {
    const p = lerProvaEntradaV3(os({ equipamento: { acessorios: ["Carregador", "Capinha"] } }));
    const presentes = p.acessorios.filter((a) => a.presente).map((a) => a.id).sort();
    expect(presentes).toEqual(["capinha", "carregador"]);
  });

  it("semeia credenciais a partir da senha do equipamento (compat)", () => {
    const p = lerProvaEntradaV3(os({ senhaEquipamento: "1234", senhaEquipamentoTipo: "numerica" }));
    expect(p.credenciais.senha).toBe("1234");
    expect(p.credenciais.senhaTipo).toBe("numerica");
  });

  it("lê uma prova existente e completa os componentes faltantes com OK", () => {
    const p = lerProvaEntradaV3(
      os({
        provaEntradaV3: {
          versao: 1,
          criadoEm: "2026-06-09T10:00:00.000Z",
          estadoFisico: [{ componente: "tela", status: "avariado" }],
          avarias: [{ id: "a1", tipo: "trinca", local: "canto superior" }],
          fotos: [{ id: "f1", categoria: "frontal", dataUrl: imgUrl, tamanho: 10, criadoEm: "x" }],
          credenciais: { pin: "0000", contaGoogle: "joao@gmail.com" },
          acessorios: [{ id: "chip", presente: true }],
        },
      }),
    );
    expect(provaEntradaCriadaV3(p as unknown as OSLike) || p.versao > 0).toBe(true);
    expect(p.estadoFisico).toHaveLength(COMPONENTES_FISICOS_V3.length);
    expect(p.estadoFisico.find((i) => i.componente === "tela")?.status).toBe("avariado");
    expect(p.avarias).toHaveLength(1);
    expect(p.fotos).toHaveLength(1);
    expect(p.acessorios.find((a) => a.id === "chip")?.presente).toBe(true);
  });

  it("descarta avaria/foto malformada (sem id/categoria/dataUrl)", () => {
    const p = lerProvaEntradaV3(
      os({
        provaEntradaV3: {
          versao: 1,
          criadoEm: "x",
          avarias: [{ tipo: "trinca" }, { id: "ok", tipo: "lixo" }],
          fotos: [{ id: "f1", categoria: "frontal", dataUrl: "notimage" }],
        },
      }),
    );
    expect(p.avarias).toEqual([]);
    expect(p.fotos).toEqual([]);
  });
});

describe("prova-entrada-model · validação de foto", () => {
  it("aceita imagem dentro do limite", () => {
    expect(validarFotoEntradaV3(imgUrl, 0).ok).toBe(true);
  });
  it("rejeita não-imagem", () => {
    expect(validarFotoEntradaV3("data:text/plain;base64,xx", 0).ok).toBe(false);
  });
  it("rejeita ao atingir o limite de fotos", () => {
    expect(validarFotoEntradaV3(imgUrl, FOTO_MAX_V3).ok).toBe(false);
  });
  it("rejeita imagem grande demais", () => {
    const grande = "data:image/jpeg;base64," + "A".repeat(700 * 1024);
    expect(validarFotoEntradaV3(grande, 0).ok).toBe(false);
  });
});

describe("prova-entrada-model · identificação + assinatura (SPRINT_3E.2)", () => {
  it("OS sem prova → identificação semeada do equipamento (compat)", () => {
    const p = lerProvaEntradaV3(os({ equipamento: { numeroSerie: "359..IMEI", modelo: "iPhone 13" } }));
    expect(p.identificacao.imei).toBe("359..IMEI");
    expect(p.identificacao.modelo).toBe("iPhone 13");
    expect(p.identificacao.serial).toBeUndefined();
    expect(p.assinaturaCliente).toBeUndefined();
  });

  it("lê identificação salva (serial/operadora/cor) e assinatura do cliente", () => {
    const p = lerProvaEntradaV3(
      os({
        provaEntradaV3: {
          versao: 1,
          criadoEm: "x",
          identificacao: { imei: "1", serial: "S-9", operadora: "Vivo", cor: "Preto" },
          assinaturaCliente: { dataUrl: imgUrl, criadoEm: "x", por: "Maria" },
        },
      }),
    );
    expect(p.identificacao).toMatchObject({ imei: "1", serial: "S-9", operadora: "Vivo", cor: "Preto" });
    expect(p.assinaturaCliente?.dataUrl).toBe(imgUrl);
    expect(p.assinaturaCliente?.por).toBe("Maria");
  });

  it("descarta assinatura inválida (não-imagem)", () => {
    const p = lerProvaEntradaV3(os({ provaEntradaV3: { versao: 1, criadoEm: "x", assinaturaCliente: { dataUrl: "nope" } } }));
    expect(p.assinaturaCliente).toBeUndefined();
  });

  it("validarAssinaturaV3 aceita imagem e rejeita grande/inválida", () => {
    expect(validarAssinaturaV3(imgUrl).ok).toBe(true);
    expect(validarAssinaturaV3("data:text/plain;base64,xx").ok).toBe(false);
    // base64 → bytes ≈ len * 3/4, então o comprimento precisa exceder MAX * 4/3.
    const grande = "data:image/png;base64," + "A".repeat(Math.ceil((ASSINATURA_MAX_BYTES_V3 * 4) / 3) + 100);
    expect(validarAssinaturaV3(grande).ok).toBe(false);
  });
});

describe("prova-entrada-model · resumo + máscara (impressão)", () => {
  it("resumo conta ok/avariado/ausente", () => {
    const itens = estadoFisicoPadraoV3();
    itens[0].status = "avariado";
    itens[1].status = "ausente";
    const r = resumoEstadoFisicoV3(itens);
    expect(r.avariado).toBe(1);
    expect(r.ausente).toBe(1);
    expect(r.ok).toBe(itens.length - 2);
  });

  it("mascara segredo e conta", () => {
    expect(mascararSegredoV3("1234")).toBe("••••");
    expect(mascararSegredoV3("")).toBe("");
    expect(mascararContaV3("joao.silva@gmail.com")).toMatch(/^jo.+@gmail\.com$/);
    expect(mascararContaV3("joao.silva@gmail.com")).not.toContain("ao.silva");
  });

  it("credenciaisMascaradasV3 só inclui o que existe e nunca o valor real", () => {
    const lista = credenciaisMascaradasV3({ pin: "0000", contaGoogle: "joao@gmail.com", faceId: true });
    const rotulos = lista.map((l) => l.rotulo);
    expect(rotulos).toEqual(["PIN", "Conta Google", "Face ID"]);
    expect(lista.find((l) => l.rotulo === "PIN")?.valor).not.toBe("0000");
    expect(lista.find((l) => l.rotulo === "Face ID")?.valor).toBe("Sim");
  });
});
