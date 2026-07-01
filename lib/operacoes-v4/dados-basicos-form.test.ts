// Testes PUROS do editor de Dados básicos V4 (OPS-V4-DADOS-BASICOS-OS-REAL-003B).
// Ambiente node: helper + lerDadosBasicosV3 são puros (sem next-auth/Prisma).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isoToLocalInput,
  localInputToIso,
  seedDadosBasicos,
  setDadosBasicos,
  toDadosBasicosInput,
  type DadosBasicosEditorV4,
} from "./dados-basicos-form";
import { lerDadosBasicosV3 } from "@/lib/operacoes-v3/dados-basicos-model";
import type { OrdemServico } from "@/types/os";

const osVazia = {} as OrdemServico;

describe("lerDadosBasicosV3 (reader honesto)", () => {
  it("OS vazia → tudo vazio (sem inventar valor)", () => {
    const d = lerDadosBasicosV3(osVazia);
    expect(d).toEqual({
      defeitoRelatado: "",
      prioridade: "",
      recebidoPor: "",
      localFisico: "",
      previsaoEntrega: "",
      origem: "",
      observacoes: "",
    });
  });

  it("lê defeito/prioridade/sla do top-level + recepção do aberturaV3", () => {
    const os = {
      equipamento: { defeitoRelatado: "Não liga" },
      prioridade: "alta",
      origem: "manual", // origem exclusiva do V2 → não vira origem rica
      sla: { prazo: "2026-07-01T12:00:00.000Z", status: "ok" },
      aberturaV3: {
        recepcao: { recebidoPor: "Ana", localFisico: "bancada", origem: "garantia" },
        observacoesInternas: "Cliente VIP",
      },
    } as unknown as OrdemServico;
    const d = lerDadosBasicosV3(os);
    expect(d.defeitoRelatado).toBe("Não liga");
    expect(d.prioridade).toBe("alta");
    expect(d.recebidoPor).toBe("Ana");
    expect(d.localFisico).toBe("bancada");
    expect(d.previsaoEntrega).toBe("2026-07-01T12:00:00.000Z");
    expect(d.origem).toBe("garantia"); // rica prevalece
    expect(d.observacoes).toBe("Cliente VIP");
  });

  it("origem cai para o top-level só quando ele é uma origem V3 válida", () => {
    const balcao = lerDadosBasicosV3({ origem: "balcao" } as unknown as OrdemServico);
    expect(balcao.origem).toBe("balcao");
    const site = lerDadosBasicosV3({ origem: "site" } as unknown as OrdemServico);
    expect(site.origem).toBe(""); // "site" não é NovaOSOrigemV3
  });

  it("valores inválidos de enum são descartados (honesto)", () => {
    const d = lerDadosBasicosV3({ prioridade: "xpto", aberturaV3: { recepcao: { localFisico: "zzz" } } } as unknown as OrdemServico);
    expect(d.prioridade).toBe("");
    expect(d.localFisico).toBe("");
  });
});

describe("seedDadosBasicos (defaults do form)", () => {
  it("OS vazia → defaults seguros para os selects", () => {
    const e = seedDadosBasicos(osVazia);
    expect(e).toEqual({
      defeitoRelatado: "",
      prioridade: "media",
      origem: "balcao",
      recebidoPor: "",
      localFisico: "balcao",
      previsaoLocal: "",
      observacoes: "",
    });
  });

  it("preenche a previsão local a partir do sla.prazo", () => {
    const iso = localInputToIso("2026-07-01T14:30");
    const os = { sla: { prazo: iso } } as unknown as OrdemServico;
    const e = seedDadosBasicos(os);
    expect(e.previsaoLocal).toBe("2026-07-01T14:30");
  });
});

describe("datetime-local ↔ ISO", () => {
  it("round-trip local → iso → local é estável", () => {
    const iso = localInputToIso("2026-07-01T14:30");
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(isoToLocalInput(iso)).toBe("2026-07-01T14:30");
  });

  it("vazio/invalid → \"\"", () => {
    expect(localInputToIso("")).toBe("");
    expect(localInputToIso("não-data")).toBe("");
    expect(isoToLocalInput("")).toBe("");
    expect(isoToLocalInput("nope")).toBe("");
  });
});

describe("toDadosBasicosInput (mapeador → action)", () => {
  it("trima strings e converte a previsão para ISO", () => {
    const editor: DadosBasicosEditorV4 = {
      defeitoRelatado: "  tela quebrada  ",
      prioridade: "critica",
      origem: "retorno",
      recebidoPor: "  João  ",
      localFisico: "aguardando_diagnostico",
      previsaoLocal: "2026-07-05T09:00",
      observacoes: "  urgente  ",
    };
    const out = toDadosBasicosInput(editor);
    expect(out.defeitoRelatado).toBe("tela quebrada");
    expect(out.recebidoPor).toBe("João");
    expect(out.observacoes).toBe("urgente");
    expect(out.prioridade).toBe("critica");
    expect(out.origem).toBe("retorno");
    expect(out.localFisico).toBe("aguardando_diagnostico");
    expect(out.previsaoEntrega).toBe(localInputToIso("2026-07-05T09:00"));
  });

  it("previsão vazia → \"\" (a action mantém a previsão atual)", () => {
    const editor = seedDadosBasicos(osVazia);
    expect(toDadosBasicosInput(editor).previsaoEntrega).toBe("");
  });
});

describe("setDadosBasicos (patch imutável)", () => {
  it("não muta o editor original", () => {
    const e = seedDadosBasicos(osVazia);
    const e2 = setDadosBasicos(e, "prioridade", "alta");
    expect(e2.prioridade).toBe("alta");
    expect(e.prioridade).toBe("media");
    expect(e2).not.toBe(e);
  });
});

// ---------------------------------------------------------------------------
// Guarda estática de segurança da nova action V3 (payload-only, sem efeitos).
// ---------------------------------------------------------------------------
describe("salvarDadosBasicosOSV3 — action segura (guarda estática)", () => {
  const V3_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "operacoes-v3");
  const action = readFileSync(join(V3_DIR, "dados-basicos-actions.ts"), "utf8");
  const model = readFileSync(join(V3_DIR, "dados-basicos-model.ts"), "utf8");
  const both = action + "\n" + model;

  it("NÃO chama updateOSPayload do V2 (evita sync de Financeiro)", () => {
    // Checa a chamada (`updateOSPayload(`) — a menção em comentário ("SEM
    // `updateOSPayload` do V2") é permitida e documenta a escolha.
    expect(action).not.toContain("updateOSPayload(");
    expect(action).not.toContain('import { updateOSPayload');
  });

  it("NÃO importa caixa/financeiro/estoque/whatsapp/fiscal/PDV", () => {
    for (const proibido of [
      'from "@/lib/caixa',
      'from "@/lib/financeiro',
      'from "@/lib/estoque',
      'from "@/lib/whatsapp',
      'from "@/lib/fiscal',
      'from "@/components/pdv',
    ]) {
      expect(both, `import proibido: ${proibido}`).not.toContain(proibido);
    }
  });

  it("grava o payload direto via prisma.ordemServico.update (payload-only + coluna defeito)", () => {
    expect(action).toContain("prisma.ordemServico.update");
    // Não altera status/valor: as colunas financeiras/estado não são atribuídas no
    // `data` (checa a forma de atribuição `campo:` — menção em comentário é permitida).
    expect(action).not.toContain("valorTotal:");
    expect(action).not.toContain("valorBase:");
    expect(action).not.toContain("status:");
  });

  it("NÃO usa fallback de loja (loja-1 como literal)", () => {
    for (const lit of ['"loja-1"', "'loja-1'", "`loja-1`"]) {
      expect(both, `fallback literal: ${lit}`).not.toContain(lit);
    }
  });
});
