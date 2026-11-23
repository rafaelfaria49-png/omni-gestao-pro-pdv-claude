import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// OPS-V4-FLUXO-CURTO-001 / rev 5 — checklist concorrente-safe (T04).
//
// CAMADA unidade (sem I/O, sem banco): guarda estática da disciplina +
// erro explícito + outros handlers inalterados. O EFEITO (LATEST + updateMany
// por updatedAt, timeline/campos desconhecidos, corrida sobreposta) é provado
// em workspace-actions.pg.test.ts (PG real, banco descartável local, falha
// explícita sem ambiente — nunca skip).
//
// Identidade limitada ao seam de sessão (stub de @/auth com usuário QA + gate
// ok) SOMENTE para alcançar a lógica de concorrência sob teste; o login real
// é coberto na camada E2E. O caminho condicional, a mesclagem sobre o LATEST
// e o erro de conflito são o código real de produção, sem bypass.

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "qa-fluxo-curto", name: "QA FluxoCurto" } })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/guard-enterprise", () => ({
  requireEnterpriseWith: vi.fn(async () => ({ ok: true })),
}));

import {
  CONFLITO_CONCORRENCIA_V3,
  ehConflitoConcorrenciaV3,
  erroConflitoConcorrenciaV3,
} from "@/lib/operacoes-v4/entrada-form";

function srcWorkspace(): string {
  const dir = dirname(fileURLToPath(import.meta.url));
  return readFileSync(join(dir, "workspace-actions.ts"), "utf8");
}

describe("T04 — checklist concorrente-safe: guarda estática da disciplina", () => {
  it("salvarChecklistEntradaV3 relê LATEST e condiciona por updatedAt com conflito explícito", () => {
    const src = srcWorkspace();
    // Recorte exclusivo do write de checklist: do export até o próximo export.
    const ini = src.indexOf("export async function salvarChecklistEntradaV3");
    const fim = src.indexOf("export async function salvarSenhaAcessoriosV3");
    expect(ini).toBeGreaterThanOrEqual(0);
    expect(fim).toBeGreaterThan(ini);
    const bloco = src.slice(ini, fim);
    expect(bloco, "transação").toContain("prisma.$transaction");
    expect(bloco, "trava da linha ANTES da releitura").toMatch(/travarLinhaOSV3\(tx, sid, id\)[\s\S]*findFirst/);
    expect(bloco, "releitura LATEST").toContain("findFirst");
    expect(bloco, "storeId correto").toContain("latest.storeId !== sid");
    expect(bloco, "captura updatedAt").toContain("updatedAt: true");
    expect(bloco, "preserva desconhecidos (spread LATEST)").toContain("...payload");
    expect(bloco, "preserva timeline LATEST").toContain("appendTimeline(payload, evento)");
    expect(bloco, "aplica somente checklist").toContain("checklist,");
    expect(bloco, "evento correspondente").toContain("checklist_finalizado");
    expect(bloco, "condicional").toContain("ordemServico.updateMany");
    expect(bloco, "precondição").toContain("updatedAt: latest.updatedAt");
    expect(bloco, "conflito explícito").toContain("erroConflitoConcorrenciaV3");
    // Sem update cego no write de checklist (o helper `gravar` com update()
    // permanece apenas para os demais write-paths, fora deste bloco).
    expect(bloco, "sem update cego no checklist").not.toContain("ordemServico.update({");
    expect(bloco, "sem gravar cego no checklist").not.toContain("return gravar(");
  });

  it("erro de conflito carrega CONFLITO_CONCORRENCIA e orienta recarregar", () => {
    const e = erroConflitoConcorrenciaV3("o checklist de entrada");
    expect(ehConflitoConcorrenciaV3(e)).toBe(true);
    expect((e as Error & { code?: string }).code).toBe(CONFLITO_CONCORRENCIA_V3);
    expect(e.message).toMatch(/outra sessão/);
    expect(e.message).toMatch(/Recarregue/);
  });
});

describe("D — nenhum outro handler de workspace-actions é semanticamente alterado", () => {
  it("salvarSenhaAcessoriosV3 e salvarDiagnosticoV3 preservam shape e gravam sob a trava da OS", () => {
    const src = srcWorkspace();
    for (const nome of ["salvarSenhaAcessoriosV3", "salvarDiagnosticoV3"] as const) {
      expect(src, `${nome} existe`).toContain(`export async function ${nome}`);
    }
    // OPS-RECEBIMENTO-MISTO-P1-HARDENING-001: ambos aplicam a mudança ao payload MAIS
    // RECENTE via `mutar` (`mutarPayloadOSV3`: trava da linha → releitura → update na
    // mesma transação) — nunca regravam um snapshot lido antes. 2 ocorrências.
    const ocorrencias = src.split("return mutar(sid, id,").length - 1;
    expect(ocorrencias).toBe(2);
    expect(src, "sem gravação cega do payload").not.toContain("ordemServico.update({");
    expect(src, "senha preserva chaves").toContain("senhaEquipamento");
    expect(src, "senha preserva acessórios").toContain("equipamento.acessorios");
    expect(src, "diagnóstico preserva campo").toContain("diagnosticoV3");
    expect(src, "diagnóstico preserva evento").toContain("diagnostico_registrado");
  });
});
