// Testes PUROS de derivarPendenciasEntradaV4 (GOAL OPS-V4-ORC-COMPLETAR-ENTRADA-027;
// classificação honesta em OPS-V4-FLUXO-CURTO-004 — A01, A06, A07, A08).
// Ambiente node: só reaproveita readers puros da V3 (lerDadosBasicosV3,
// lerProvaEntradaV3, provaEntradaCriadaV3) — sem I/O, sem React.
import { describe, expect, it } from "vitest";
import {
  derivarPendenciasEntradaV4,
  estadoFisicoRegistradoV4,
  progressoPendenciasEntradaV4,
} from "./entrada-pendencias";
import type { OrdemServico } from "@/types/os";

const osVazia = {} as OrdemServico;

function porChave(pendencias: ReturnType<typeof derivarPendenciasEntradaV4>, chave: string) {
  const item = pendencias.find((p) => p.chave === chave);
  if (!item) throw new Error(`pendência "${chave}" não encontrada`);
  return item;
}

function evento(evento: string, extra: Record<string, unknown> = {}) {
  return { id: `ev-${evento}`, tipo: "observacao", autor: "QA", criadoEm: "2026-10-03T12:00:00.000Z", metadata: { evento, ...extra } };
}

/** OS como a abertura do GOAL 003 deixa: cliente, aparelho, defeito e recebidoPor. */
const osDaAbertura = {
  cliente: { nome: "Cliente QA" },
  equipamento: { marca: "Samsung", modelo: "Galaxy QA", defeitoRelatado: "Tela quebrada" },
  aberturaV3: { recepcao: { recebidoPor: "Operador QA", origem: "balcao" } },
  timeline: [],
} as unknown as OrdemServico;

describe("derivarPendenciasEntradaV4", () => {
  it("os nula/undefined → lista vazia (nunca fabrica pendência sem OS real)", () => {
    expect(derivarPendenciasEntradaV4(null)).toEqual([]);
    expect(derivarPendenciasEntradaV4(undefined)).toEqual([]);
  });

  it("OS vazia → obrigatórios faltam; acesso, fotos e assinatura são opcionais (nunca erro)", () => {
    const pendencias = derivarPendenciasEntradaV4(osVazia);
    expect(pendencias.map((p) => p.chave)).toEqual([
      "dados-basicos", "identificacao", "acesso", "acessorios", "estado-fisico", "checklist", "fotos", "assinatura",
    ]);
    expect(pendencias.every((p) => p.temContrato && !p.preenchido)).toBe(true);
    const opcionais = pendencias.filter((p) => p.estado === "opcional").map((p) => p.chave);
    expect(opcionais).toEqual(["acesso", "fotos", "assinatura"]);
    expect(pendencias.filter((p) => p.estado === "falta_complementar").map((p) => p.chave)).toEqual([
      "dados-basicos", "identificacao", "acessorios", "estado-fisico", "checklist",
    ]);
  });

  it("A01 — dados da abertura contam como registrados: Recepção não aparece como faltando", () => {
    const pendencias = derivarPendenciasEntradaV4(osDaAbertura);
    expect(porChave(pendencias, "dados-basicos").estado).toBe("registrado");
    expect(porChave(pendencias, "dados-basicos").detalhe).toBe("Recebido por Operador QA");
    expect(porChave(pendencias, "identificacao").estado).toBe("registrado");
  });

  it("OS parcial (só recebidoPor + checklist salvo) → só esses dois registrados", () => {
    const os = {
      aberturaV3: { recepcao: { recebidoPor: "João" } },
      checklist: [{ id: "tela", label: "Tela", estado: "ok" }],
    } as unknown as OrdemServico;
    const pendencias = derivarPendenciasEntradaV4(os);
    expect(porChave(pendencias, "dados-basicos").preenchido).toBe(true);
    expect(porChave(pendencias, "checklist").preenchido).toBe(true);
    expect(porChave(pendencias, "identificacao").preenchido).toBe(false);
    expect(porChave(pendencias, "estado-fisico").preenchido).toBe(false);
    expect(porChave(pendencias, "acessorios").preenchido).toBe(false);
  });

  it("checklist: lista padrão (nunca salva) NÃO conta como preenchido — só o campo bruto da OS", () => {
    expect(porChave(derivarPendenciasEntradaV4(osVazia), "checklist").preenchido).toBe(false);
  });

  it("A06 — acessórios salvos explicitamente com 0 presentes contam como resposta registrada", () => {
    const os = {
      ...osDaAbertura,
      provaEntradaV3: { versao: 1, criadoEm: "x", acessorios: [{ id: "chip", presente: false }] },
      timeline: [evento("acessorio_registrado", { presentes: 0 })],
    } as unknown as OrdemServico;
    const acessorios = porChave(derivarPendenciasEntradaV4(os), "acessorios");
    expect(acessorios.estado).toBe("registrado");
    expect(acessorios.detalhe).toBe("Nenhum acessório recebido");
  });

  it("acessórios sem evento e sem item presente continuam faltando (não fabrica 'nenhum')", () => {
    const acessorios = porChave(derivarPendenciasEntradaV4(osDaAbertura), "acessorios");
    expect(acessorios.estado).toBe("falta_complementar");
    expect(acessorios.detalhe).toBeUndefined();
  });

  it("acessórios e identificação semeados de campos legados contam como registrados (dado real)", () => {
    const os = {
      equipamento: { numeroSerie: "IMEI-123", modelo: "iPhone 13", acessorios: ["Chip"] },
    } as unknown as OrdemServico;
    const pendencias = derivarPendenciasEntradaV4(os);
    expect(porChave(pendencias, "identificacao").preenchido).toBe(true);
    expect(porChave(pendencias, "acessorios").estado).toBe("registrado");
    expect(porChave(pendencias, "acessorios").detalhe).toBe("1 item recebido");
  });

  it("A07 — fotos e assinatura ausentes são opcionais e não entram no progresso obrigatório", () => {
    const pendencias = derivarPendenciasEntradaV4(osDaAbertura);
    expect(porChave(pendencias, "fotos").estado).toBe("opcional");
    expect(porChave(pendencias, "assinatura").estado).toBe("opcional");
    const progresso = progressoPendenciasEntradaV4(pendencias);
    expect(progresso.total).toBe(5);
  });

  it("fotos e assinatura reais viram registradas", () => {
    const os = {
      provaEntradaV3: {
        versao: 1,
        criadoEm: "2026-01-01T12:00:00.000Z",
        fotos: [{ id: "f1", categoria: "frontal", dataUrl: "data:image/png;base64,x", criadoEm: "2026-01-01T12:00:00.000Z" }],
        assinaturaCliente: { dataUrl: "data:image/png;base64,y", criadoEm: "2026-01-01T12:00:00.000Z" },
      },
    } as unknown as OrdemServico;
    const pendencias = derivarPendenciasEntradaV4(os);
    expect(porChave(pendencias, "fotos").estado).toBe("registrado");
    expect(porChave(pendencias, "fotos").detalhe).toBe("1 foto");
    expect(porChave(pendencias, "assinatura").estado).toBe("registrado");
  });

  it("acesso: só credencial persistida (ou senha da abertura) registra; Face ID explícito também", () => {
    expect(porChave(derivarPendenciasEntradaV4(osDaAbertura), "acesso").estado).toBe("opcional");
    const comSenhaAbertura = { ...osDaAbertura, senhaEquipamento: "1234" } as unknown as OrdemServico;
    expect(porChave(derivarPendenciasEntradaV4(comSenhaAbertura), "acesso").estado).toBe("registrado");
    const comFaceIdNao = {
      ...osDaAbertura,
      provaEntradaV3: { versao: 1, criadoEm: "x", credenciais: { faceId: false } },
    } as unknown as OrdemServico;
    expect(porChave(derivarPendenciasEntradaV4(comFaceIdNao), "acesso").estado).toBe("registrado");
  });
});

describe("A08 — estado físico só é registro com salvamento real do estado", () => {
  const provaPadrao = {
    versao: 1,
    criadoEm: "2026-10-03T12:00:00.000Z",
    estadoFisico: [{ componente: "tela", status: "ok" }],
    avarias: [],
    acessorios: [],
  };

  it("sem provaEntradaV3 real, o padrão 'ok' não é registro", () => {
    expect(estadoFisicoRegistradoV4(osDaAbertura)).toBe(false);
    expect(porChave(derivarPendenciasEntradaV4(osDaAbertura), "estado-fisico").estado).toBe("falta_complementar");
  });

  it("prova materializada por outra fatia (acessórios) com estado padrão continua NÃO registrada", () => {
    const os = {
      ...osDaAbertura,
      provaEntradaV3: provaPadrao,
      timeline: [evento("acessorio_registrado", { presentes: 0 })],
    } as unknown as OrdemServico;
    expect(estadoFisicoRegistradoV4(os)).toBe(false);
  });

  it("evento da prova só com credenciais NÃO registra estado físico", () => {
    const os = {
      ...osDaAbertura,
      provaEntradaV3: provaPadrao,
      timeline: [evento("prova_entrada_criada", { avariados: 0, avarias: 0, fatias: ["credenciais"] })],
    } as unknown as OrdemServico;
    expect(estadoFisicoRegistradoV4(os)).toBe(false);
  });

  it("evento da prova com fatias de estado físico registra (inclusive tudo íntegro)", () => {
    const os = {
      ...osDaAbertura,
      provaEntradaV3: provaPadrao,
      timeline: [evento("prova_entrada_atualizada", { avariados: 0, avarias: 0, fatias: ["estadoFisico", "avarias"] })],
    } as unknown as OrdemServico;
    expect(estadoFisicoRegistradoV4(os)).toBe(true);
    expect(porChave(derivarPendenciasEntradaV4(os), "estado-fisico").estado).toBe("registrado");
  });

  it("evento legado sem fatias mantém o significado anterior (sem reclassificar OS antiga)", () => {
    const os = {
      ...osDaAbertura,
      provaEntradaV3: provaPadrao,
      timeline: [evento("prova_entrada_criada", { avariados: 0, avarias: 0 })],
    } as unknown as OrdemServico;
    expect(estadoFisicoRegistradoV4(os)).toBe(true);
  });

  it("valor não padrão persistido (avaria ou componente avariado) é registro real", () => {
    const comAvaria = {
      provaEntradaV3: { ...provaPadrao, avarias: [{ id: "a1", tipo: "trinca", local: "canto" }] },
    } as unknown as OrdemServico;
    const comAvariado = {
      provaEntradaV3: { ...provaPadrao, estadoFisico: [{ componente: "tela", status: "avariado" }] },
    } as unknown as OrdemServico;
    expect(estadoFisicoRegistradoV4(comAvaria)).toBe(true);
    expect(estadoFisicoRegistradoV4(comAvariado)).toBe(true);
  });
});

describe("progressoPendenciasEntradaV4", () => {
  it("conta só os cinco complementos não opcionais", () => {
    const progresso = progressoPendenciasEntradaV4(derivarPendenciasEntradaV4(osVazia));
    expect(progresso).toEqual({ preenchidos: 0, total: 5 });
  });

  it("reflete exatamente quantos complementos obrigatórios estão registrados", () => {
    const os = {
      aberturaV3: { recepcao: { recebidoPor: "João" } },
      checklist: [{ id: "tela", label: "Tela", estado: "ok" }],
    } as unknown as OrdemServico;
    expect(progressoPendenciasEntradaV4(derivarPendenciasEntradaV4(os))).toEqual({ preenchidos: 2, total: 5 });
  });
});
