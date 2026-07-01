// Testes PUROS do editor de Entrada V4 (OPS-V4-ENTRADA-RECEPCAO-REAL-003).
// Ambiente node: helper + lerProvaEntradaV3 + lerChecklistEntradaV3 são puros.
import { describe, expect, it } from "vitest";
import {
  addAvaria,
  cycleChecklistEstado,
  removeAvaria,
  seedEntradaEditor,
  setAvaria,
  setChecklistEstado,
  setEstadoFisicoStatus,
  toAcessoriosInput,
  toChecklistInput,
  toIdentificacaoInput,
  togglePadraoPonto,
  toProvaEntradaInput,
  toggleAcessorio,
} from "./entrada-form";
import type { OrdemServico } from "@/types/os";

const osVazia = {} as OrdemServico;

describe("seedEntradaEditor", () => {
  it("OS vazia → 8 componentes OK, 6 acessórios ausentes, checklist padrão N/T", () => {
    const e = seedEntradaEditor(osVazia);
    expect(e.estadoFisico).toHaveLength(8);
    expect(e.estadoFisico.every((c) => c.status === "ok")).toBe(true);
    expect(e.acessorios).toHaveLength(6);
    expect(e.acessorios.every((a) => !a.presente)).toBe(true);
    expect(e.avarias).toEqual([]);
    expect(e.checklist.length).toBeGreaterThan(0);
    expect(e.checklist.every((c) => c.estado === "nao_testado")).toBe(true);
    expect(e.identificacao.imei).toBe("");
    expect(e.credenciais.senhaTipo).toBe("numerica");
    expect(e.credenciais.faceId).toBe(false);
  });

  it("semeia dos campos legados (IMEI, senha, acessórios)", () => {
    const os = {
      equipamento: { numeroSerie: "IMEI-123", modelo: "iPhone 13", acessorios: ["Chip", "Carregador"] },
      senhaEquipamento: "1234",
      senhaEquipamentoTipo: "numerica",
    } as unknown as OrdemServico;
    const e = seedEntradaEditor(os);
    expect(e.identificacao.imei).toBe("IMEI-123");
    expect(e.identificacao.modelo).toBe("iPhone 13");
    expect(e.credenciais.senha).toBe("1234");
    expect(e.acessorios.find((a) => a.id === "chip")!.presente).toBe(true);
    expect(e.acessorios.find((a) => a.id === "carregador")!.presente).toBe(true);
    expect(e.acessorios.find((a) => a.id === "cabo")!.presente).toBe(false);
  });

  it("reflete provaEntradaV3 persistida (serial/operadora/cor + avaria)", () => {
    const os = {
      provaEntradaV3: {
        versao: 1,
        criadoEm: "x",
        identificacao: { imei: "I", serial: "S-9", operadora: "Vivo", cor: "Preto" },
        estadoFisico: [{ componente: "tela", status: "avariado" }],
        avarias: [{ id: "a1", tipo: "trinca", local: "canto" }],
        credenciais: { contaGoogle: "user@gmail.com" },
        acessorios: [{ id: "chip", presente: true }],
      },
    } as unknown as OrdemServico;
    const e = seedEntradaEditor(os);
    expect(e.identificacao.serial).toBe("S-9");
    expect(e.identificacao.operadora).toBe("Vivo");
    expect(e.identificacao.cor).toBe("Preto");
    expect(e.estadoFisico.find((c) => c.componente === "tela")!.status).toBe("avariado");
    expect(e.avarias).toHaveLength(1);
    expect(e.credenciais.contaGoogle).toBe("user@gmail.com");
    expect(e.acessorios.find((a) => a.id === "chip")!.presente).toBe(true);
  });
});

describe("mapeadores → inputs das actions V3", () => {
  it("toIdentificacaoInput trima e vira undefined quando vazio", () => {
    const e = seedEntradaEditor(osVazia);
    e.identificacao.imei = "  X1  ";
    e.identificacao.serial = "   ";
    const out = toIdentificacaoInput(e);
    expect(out.imei).toBe("X1");
    expect(out.serial).toBeUndefined();
  });

  it("toProvaEntradaInput leva estado físico/avarias e limpa credenciais", () => {
    let e = seedEntradaEditor(osVazia);
    e = setEstadoFisicoStatus(e, "tela", "avariado");
    e.credenciais.senha = "  abcd  ";
    e.credenciais.contaGoogle = "  ";
    const out = toProvaEntradaInput(e);
    expect(out.estadoFisico.find((c) => c.componente === "tela")!.status).toBe("avariado");
    expect(out.credenciais.senha).toBe("abcd");
    expect(out.credenciais.contaGoogle).toBeUndefined();
  });

  it("toAcessoriosInput e toChecklistInput devolvem cópias do estado", () => {
    const e = seedEntradaEditor(osVazia);
    expect(toAcessoriosInput(e)).toHaveLength(6);
    expect(toChecklistInput(e).length).toBe(e.checklist.length);
  });
});

describe("toggles puros", () => {
  it("setEstadoFisicoStatus altera só o componente alvo (imutável)", () => {
    const e = seedEntradaEditor(osVazia);
    const e2 = setEstadoFisicoStatus(e, "camera", "ausente");
    expect(e2).not.toBe(e);
    expect(e2.estadoFisico.find((c) => c.componente === "camera")!.status).toBe("ausente");
    expect(e.estadoFisico.find((c) => c.componente === "camera")!.status).toBe("ok"); // original intacto
  });

  it("toggleAcessorio inverte presença", () => {
    const e = seedEntradaEditor(osVazia);
    const e2 = toggleAcessorio(e, "chip");
    expect(e2.acessorios.find((a) => a.id === "chip")!.presente).toBe(true);
    const e3 = toggleAcessorio(e2, "chip");
    expect(e3.acessorios.find((a) => a.id === "chip")!.presente).toBe(false);
  });

  it("setChecklistEstado e cycleChecklistEstado (ok→ruim→nao_testado→ok)", () => {
    const e = seedEntradaEditor(osVazia);
    const id = e.checklist[0]!.id;
    const ok = setChecklistEstado(e, id, "ok");
    expect(ok.checklist[0]!.estado).toBe("ok");
    const ruim = cycleChecklistEstado(ok, id);
    expect(ruim.checklist[0]!.estado).toBe("ruim");
    const nt = cycleChecklistEstado(ruim, id);
    expect(nt.checklist[0]!.estado).toBe("nao_testado");
    const volta = cycleChecklistEstado(nt, id);
    expect(volta.checklist[0]!.estado).toBe("ok");
  });

  it("addAvaria / setAvaria / removeAvaria", () => {
    let e = seedEntradaEditor(osVazia);
    e = addAvaria(e, "risco");
    expect(e.avarias).toHaveLength(1);
    const id = e.avarias[0]!.id;
    e = setAvaria(e, id, { local: "traseira" });
    expect(e.avarias[0]!.local).toBe("traseira");
    e = removeAvaria(e, id);
    expect(e.avarias).toHaveLength(0);
  });
});

describe("togglePadraoPonto (Padrão 3×3 — slice OPS-V4-SEGURANCA-ACESSO-PARITY-004A)", () => {
  it("adiciona pontos em sequência (1-indexado)", () => {
    let v = togglePadraoPonto("", 0);
    expect(v).toBe("1");
    v = togglePadraoPonto(v, 4);
    expect(v).toBe("1-5");
    v = togglePadraoPonto(v, 8);
    expect(v).toBe("1-5-9");
  });

  it("ponto já presente é no-op (mesmo comportamento do PatternPadV3)", () => {
    const v = togglePadraoPonto("1-5", 0);
    expect(v).toBe("1-5");
  });

  it("não muta a string original (imutável)", () => {
    const original = "2-3";
    const v = togglePadraoPonto(original, 6);
    expect(v).toBe("2-3-7");
    expect(original).toBe("2-3");
  });
});
