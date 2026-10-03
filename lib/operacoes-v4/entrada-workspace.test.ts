import { describe, expect, it } from "vitest";
import { seedDadosBasicos } from "./dados-basicos-form";
import { seedEntradaEditor } from "./entrada-form";
import type { ChavePendenciaEntradaV4, EstadoPendenciaEntradaV4, PendenciaEntradaV4 } from "./entrada-pendencias";
import * as workspace from "./entrada-workspace";
import {
  ENTRADA_GROUPS,
  ENTRADA_GROUP_IDS,
  ENTRADA_PENDENCIAS_POR_GRUPO,
  ENTRADA_SECTIONS,
  ENTRADA_SECTION_IDS,
  classificarGruposEntradaV4,
  entradaComplementadaV4,
  getEntradaGroup,
  getEntradaSection,
  isEntradaGroupDirty,
  isEntradaSectionDirty,
  primeiraAreaEntradaV4,
} from "./entrada-workspace";

const OPCIONAIS: ChavePendenciaEntradaV4[] = ["acesso", "fotos", "assinatura"];
const TODAS: ChavePendenciaEntradaV4[] = [
  "dados-basicos", "identificacao", "acesso", "acessorios", "estado-fisico", "checklist", "fotos", "assinatura",
];

/** Lista sintética: chaves em `registradas` têm dado real; as demais faltam ou são opcionais. */
function pendencias(registradas: ChavePendenciaEntradaV4[] = []): PendenciaEntradaV4[] {
  return TODAS.map((chave) => {
    const preenchido = registradas.includes(chave);
    const opcional = OPCIONAIS.includes(chave);
    const estado: EstadoPendenciaEntradaV4 = preenchido ? "registrado" : opcional ? "opcional" : "falta_complementar";
    return { chave, rotulo: chave, preenchido, temContrato: true, opcional, estado };
  });
}

describe("workspace da Entrada — áreas independentes de complementação (GOAL 004)", () => {
  it("1. quatro áreas independentes, sem numeração de passos", () => {
    expect(ENTRADA_GROUP_IDS).toEqual(["recepcao", "seguranca-custodia", "inspecao", "evidencias"]);
    expect(ENTRADA_GROUPS.every((group) => !("step" in group))).toBe(true);
    expect(new Set(ENTRADA_GROUPS.map((group) => group.label)).size).toBe(4);
  });

  it("2. A04/A05 — não há helpers de avanço sequencial (sem anterior/próximo grupo)", () => {
    expect("nextEntradaGroup" in workspace).toBe(false);
    expect("previousEntradaGroup" in workspace).toBe(false);
    expect("entradaGroupProgress" in workspace).toBe(false);
  });

  it("3. preserva os contratos internos das sete seções de persistência", () => {
    expect(ENTRADA_SECTION_IDS).toEqual([
      "dados-basicos",
      "identificacao",
      "seguranca",
      "estado-fisico",
      "checklist",
      "acessorios",
      "fotos",
    ]);
    expect(ENTRADA_SECTIONS.filter((section) => !section.canSave).map((section) => section.id)).toEqual(["fotos"]);
  });

  it("4. Recepção agrupa o que já veio da abertura; Evidências não tem salvar de grupo", () => {
    expect([...getEntradaGroup("recepcao").sections]).toEqual(["dados-basicos", "identificacao"]);
    expect([...getEntradaGroup("seguranca-custodia").sections]).toEqual(["seguranca", "acessorios"]);
    expect([...getEntradaGroup("evidencias").sections]).toEqual(["fotos"]);
    expect(getEntradaGroup("evidencias").canSave).toBe(false);
    expect(ENTRADA_PENDENCIAS_POR_GRUPO.evidencias).toEqual(["fotos", "assinatura"]);
  });

  it("5. sem OS real nada é afirmado (status nulo, Recepção como área neutra)", () => {
    expect(classificarGruposEntradaV4([])).toBeNull();
    expect(primeiraAreaEntradaV4(null)).toBe("recepcao");
    expect(entradaComplementadaV4(null)).toBe(false);
  });

  it("6. A01 — com a abertura registrada, Recepção é 'registrado' (não 'faltando tudo')", () => {
    const status = classificarGruposEntradaV4(pendencias(["dados-basicos", "identificacao"]))!;
    expect(status.recepcao).toBe("registrado");
    expect(status["seguranca-custodia"]).toBe("falta_complementar");
    expect(status.inspecao).toBe("falta_complementar");
    expect(status.evidencias).toBe("opcional");
  });

  it("7. A02 — área inicial = primeira com complemento faltando", () => {
    expect(primeiraAreaEntradaV4(classificarGruposEntradaV4(pendencias(["dados-basicos", "identificacao"])))).toBe(
      "seguranca-custodia",
    );
    expect(primeiraAreaEntradaV4(classificarGruposEntradaV4(pendencias()))).toBe("recepcao");
    expect(
      primeiraAreaEntradaV4(
        classificarGruposEntradaV4(pendencias(["dados-basicos", "identificacao", "acessorios"])),
      ),
    ).toBe("inspecao");
  });

  it("8. A06 — acessórios registrados (inclusive nenhum) fecham Segurança mesmo com acesso opcional vazio", () => {
    const status = classificarGruposEntradaV4(pendencias(["dados-basicos", "identificacao", "acessorios"]))!;
    expect(status["seguranca-custodia"]).toBe("registrado");
  });

  it("9. A07 — Evidências vazia é opcional e não impede 'Entrada já complementada'", () => {
    const status = classificarGruposEntradaV4(
      pendencias(["dados-basicos", "identificacao", "acessorios", "estado-fisico", "checklist"]),
    )!;
    expect(status.evidencias).toBe("opcional");
    expect(entradaComplementadaV4(status)).toBe(true);
    expect(primeiraAreaEntradaV4(status)).toBe("recepcao");
  });

  it("10. Inspeção só fica registrada com estado físico e checklist reais", () => {
    const soEstado = classificarGruposEntradaV4(pendencias(["estado-fisico"]))!;
    expect(soEstado.inspecao).toBe("falta_complementar");
    const ambos = classificarGruposEntradaV4(pendencias(["estado-fisico", "checklist"]))!;
    expect(ambos.inspecao).toBe("registrado");
  });

  it("11. evidência real vira registrado; complementada exige nada faltando", () => {
    const status = classificarGruposEntradaV4(pendencias(["fotos"]))!;
    expect(status.evidencias).toBe("registrado");
    expect(entradaComplementadaV4(status)).toBe(false);
  });

  it("12. rascunho em Dados básicos suja só Recepção", () => {
    const ed = seedEntradaEditor(null);
    const savedDb = seedDadosBasicos(null);
    const currentDb = { ...savedDb, recebidoPor: "Rafael" };
    expect(isEntradaGroupDirty("recepcao", ed, currentDb, ed, savedDb)).toBe(true);
    expect(isEntradaGroupDirty("seguranca-custodia", ed, currentDb, ed, savedDb)).toBe(false);
    expect(isEntradaSectionDirty("dados-basicos", ed, currentDb, ed, savedDb)).toBe(true);
  });

  it("13. alteração de credencial suja só Segurança e custódia", () => {
    const saved = seedEntradaEditor(null);
    const current = { ...saved, credenciais: { ...saved.credenciais, senha: "2580" } };
    const db = seedDadosBasicos(null);
    expect(isEntradaGroupDirty("seguranca-custodia", current, db, saved, db)).toBe(true);
    expect(isEntradaGroupDirty("inspecao", current, db, saved, db)).toBe(false);
    expect(isEntradaSectionDirty("estado-fisico", current, db, saved, db)).toBe(false);
  });

  it("14. clones equivalentes não sujam nenhum grupo", () => {
    const saved = seedEntradaEditor(null);
    const db = seedDadosBasicos(null);
    const clone = structuredClone(saved);
    expect(ENTRADA_GROUP_IDS.every((id) => !isEntradaGroupDirty(id, clone, { ...db }, saved, db))).toBe(true);
    expect(getEntradaSection("fotos").label).toBe("Fotos");
  });
});
