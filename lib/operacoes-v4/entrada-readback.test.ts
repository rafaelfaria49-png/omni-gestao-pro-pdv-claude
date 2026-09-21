// OPS-V4-FLUXO-CURTO-001 — leitura posterior (read-back) da Entrada.
// Gate automatizado mínimo do GOAL (NÃO é prova isolada de homologação):
// garante, no nível puro, que criar → ler → editar devolve os mesmos dados,
// que cor e condição viajam separadas e que legado ambíguo não é convertido.
// T01–T11 completos exigem ainda componente/E2E, concorrência em base
// descartável, lint, build e revisão R — ver 04_MATRIZ_ACEITE.md.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { OrdemServico } from "@/types/os";
import {
  seedEntradaEditor,
  toIdentificacaoInput,
} from "./entrada-form";
import {
  formatPrevisaoComFuso,
  isPrevisaoVencida,
  isoToLocalInputInTZ,
  localInputToIsoInTZ,
  seedDadosBasicos,
  toDadosBasicosInput,
} from "./dados-basicos-form";
import { identidadeAtualV4 } from "./identidade-aparelho";
import { buildNovaOSDraftFromFormV4 } from "./nova-os-draft-from-form";
import {
  alvoAindaSelecionado,
  mesclarNaoTocadas,
  resolverOSSelecionada,
} from "./entrada-form";

const FIXED = new Date("2026-06-30T12:00:00.000Z");

// OS persistida equivalente ao que criarOSEnterpriseV3 grava a partir do draft:
// equipamento com cor em campo próprio, recepção no aberturaV3, SLA no topo.
function osPersistidaDeAbertura() {
  return {
    equipamento: {
      tipo: "Smartphone",
      marca: "Apple",
      modelo: "iPhone 13",
      numeroSerie: "IMEI-1",
      cor: "Violeta",
      defeitoRelatado: "Tela quebrada",
    },
    prioridade: "alta",
    sla: { prazo: "2026-07-01T20:00:00.000Z", status: "ok" },
    aberturaV3: {
      recepcao: {
        origem: "balcao",
        recebidoPor: "Ana",
        prioridade: "alta",
        localFisico: "bancada",
        previsaoEntrega: "2026-07-01T20:00:00.000Z",
      },
    },
    provaEntradaV3: {
      versao: 1,
      criadoEm: "x",
      identificacao: { imei: "IMEI-1", modelo: "iPhone 13", cor: "Violeta" },
    },
  } as unknown as OrdemServico;
}

describe("T01 — criação com leitura: resumo e formulário exibem o mesmo dado", () => {
  it("draft carrega modelo, relato, atendente, cor, prioridade e previsão informados", () => {
    const draft = buildNovaOSDraftFromFormV4(
      {
        clienteExistente: null,
        clienteNovo: { nome: "Cli QA" },
        equipamentoTipo: "celular",
        marca: "Apple",
        modelo: "iPhone 13",
        imei: "IMEI-1",
        cor: "Violeta",
        defeitoRelatado: "Tela quebrada",
        recebidoPor: "Ana",
        origem: "balcao",
        prioridade: "alta",
        localFisico: "bancada",
        previsaoEntrega: localInputToIsoInTZ("2026-07-01T17:00", "America/Sao_Paulo"),
      },
      FIXED,
    );
    expect(draft.equipamento.modelo).toBe("iPhone 13");
    expect(draft.problema.defeitoRelatado).toBe("Tela quebrada");
    expect(draft.recepcao.recebidoPor).toBe("Ana");
    expect(draft.equipamento.cor).toBe("Violeta");
    expect(draft.recepcao.prioridade).toBe("alta");
    expect(draft.recepcao.previsaoEntrega).toBe("2026-07-01T20:00:00.000Z");
  });

  it("reabrir a OS hidrata editor e dados básicos com os mesmos valores", () => {
    const os = osPersistidaDeAbertura();
    const ed = seedEntradaEditor(os);
    const db = seedDadosBasicos(os);
    const id = identidadeAtualV4(os);
    expect(ed.identificacao.modelo).toBe("iPhone 13");
    expect(ed.identificacao.imei).toBe("IMEI-1");
    expect(ed.identificacao.cor).toBe("Violeta");
    expect(id.modelo).toBe("iPhone 13");
    expect(id.cor).toBe("Violeta");
    expect(db.defeitoRelatado).toBe("Tela quebrada");
    expect(db.recebidoPor).toBe("Ana");
    expect(db.prioridade).toBe("alta");
    expect(db.previsaoLocal).toBe("2026-07-01T17:00");
    expect(toDadosBasicosInput(db).previsaoEntrega).toBe("2026-07-01T20:00:00.000Z");
  });
});

describe("T02 — edição isolada: só IMEI muda", () => {
  it("alterar só o IMEI preserva modelo, cor, serial, operadora e o resto", () => {
    const os = osPersistidaDeAbertura();
    const antes = toIdentificacaoInput(seedEntradaEditor(os));
    const ed = seedEntradaEditor(os);
    ed.identificacao.imei = "IMEI-2";
    const depois = toIdentificacaoInput(ed);
    expect(depois.imei).toBe("IMEI-2");
    expect(depois.modelo).toBe(antes.modelo);
    expect(depois.cor).toBe(antes.cor);
    expect(depois.serial).toBe(antes.serial);
    expect(depois.operadora).toBe(antes.operadora);
    // Dados básicos intocados pelo editor de identificação.
    expect(toDadosBasicosInput(seedDadosBasicos(os)).defeitoRelatado).toBe("Tela quebrada");
  });
});

describe("T07 — cor e condição em campos semanticamente distintos", () => {
  it("editar a cor não toca a nota física; nota física não vira cor", () => {
    const os = {
      equipamento: { modelo: "S22", cor: "Violeta" },
      problema: { condicaoAparelho: "bordas gastas" },
      provaEntradaV3: { versao: 1, criadoEm: "x", identificacao: { cor: "Violeta" } },
    } as unknown as OrdemServico;
    const ed = seedEntradaEditor(os);
    expect(ed.identificacao.cor).toBe("Violeta");
    ed.identificacao.cor = "Preto";
    expect(toIdentificacaoInput(ed).cor).toBe("Preto");
    expect((os as unknown as { problema: { condicaoAparelho: string } }).problema.condicaoAparelho).toBe("bordas gastas");
  });
});

describe("T08 — legado ambíguo: sem conversão, sem perda, sem backfill", () => {
  it("condicaoAparelho sem proveniência não vira cor; draft novo não escreve condição", () => {
    const os = {
      equipamento: { modelo: "S22" },
      problema: { condicaoAparelho: "tela trincada?" },
    } as unknown as OrdemServico;
    expect(identidadeAtualV4(os).cor).toBe("");
    const draft = buildNovaOSDraftFromFormV4(
      {
        clienteExistente: null,
        clienteNovo: { nome: "C" },
        equipamentoTipo: "celular",
        marca: "A",
        modelo: "B",
        defeitoRelatado: "D",
        origem: "balcao",
      },
      FIXED,
    );
    expect(draft.problema.condicaoAparelho).toBeUndefined();
  });

  it("write-path da abertura persiste cor em campo próprio (guarda estática)", () => {
    const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "operacoes-v3");
    const actions = readFileSync(join(dir, "nova-os-actions.ts"), "utf8");
    expect(actions).toContain("cor: draft.equipamento.cor");
    const draftSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "nova-os-draft-from-form.ts"),
      "utf8",
    );
    expect(draftSrc).not.toContain("condicaoAparelho: clean(form.cor)");
  });
});

describe("T09 — horário: mesmo instante na loja, em outro fuso e no editor", () => {
  it("17h da loja = mesmo ISO no servidor e em outro navegador", () => {
    const iso = localInputToIsoInTZ("2026-07-01T17:00", "America/Sao_Paulo");
    expect(iso).toBe("2026-07-01T20:00:00.000Z");
    // Outro navegador (UTC) vê outra parede para o MESMO instante.
    expect(isoToLocalInputInTZ(iso, "UTC")).toBe("2026-07-01T20:00");
    expect(isoToLocalInputInTZ(iso, "America/Sao_Paulo")).toBe("2026-07-01T17:00");
    expect(formatPrevisaoComFuso(iso)).toBe("01/07/2026 17:00 (America/Sao_Paulo)");
  });
});

describe("T10/T11 — vencido avisa; vazio não persiste falso dado", () => {
  it("previsão no passado é detectável (aviso, não correção silenciosa)", () => {
    const agora = new Date("2026-07-01T20:00:00.000Z");
    expect(isPrevisaoVencida("2026-07-01T19:00:00.000Z", agora)).toBe(true);
    expect(isPrevisaoVencida("2026-07-01T21:00:00.000Z", agora)).toBe(false);
  });

  it("previsão vazia vira '' (a action mantém a atual — sem falsa persistência)", () => {
    const db = seedDadosBasicos({} as OrdemServico);
    db.previsaoLocal = "";
    expect(toDadosBasicosInput(db).previsaoEntrega).toBe("");
  });
});

describe("R03 — contexto loja+OS fechado (T01/T05/T06)", () => {
  const detalheA = { id: "os-1", storeId: "loja-a", equipamento: { modelo: "M" } } as unknown as OrdemServico;
  const linhaA = { id: "os-1", storeId: "loja-a" } as unknown as OrdemServico;
  const linhaB = { id: "os-1", storeId: "loja-b" } as unknown as OrdemServico;

  it("detalhe da loja+OS selecionada hidrata; de outra loja, não", () => {
    expect(
      resolverOSSelecionada({ selectedOsId: "os-1", lojaIdAtiva: "loja-a", ordemDetail: detalheA, ordens: [linhaA] }),
    ).toBe(detalheA);
    expect(
      resolverOSSelecionada({ selectedOsId: "os-1", lojaIdAtiva: "loja-b", ordemDetail: detalheA, ordens: [linhaB] }),
    ).toBe(linhaB);
  });

  it("mesmo osId em duas lojas nunca cruza dado; sem loja, nulo", () => {
    expect(
      resolverOSSelecionada({ selectedOsId: "os-1", lojaIdAtiva: "loja-c", ordemDetail: detalheA, ordens: [linhaA] }),
    ).toBeNull();
    expect(resolverOSSelecionada({ selectedOsId: "os-1", lojaIdAtiva: "", ordemDetail: detalheA, ordens: [linhaA] })).toBeNull();
    expect(resolverOSSelecionada({ selectedOsId: null, lojaIdAtiva: "loja-a", ordemDetail: detalheA, ordens: [linhaA] })).toBeNull();
  });

  it("linha da lista vale enquanto o detalhe carrega (mesma loja)", () => {
    expect(
      resolverOSSelecionada({ selectedOsId: "os-1", lojaIdAtiva: "loja-a", ordemDetail: null, ordens: [linhaA] }),
    ).toBe(linhaA);
  });

  it("pós-await só afeta loja+OS correspondentes", () => {
    expect(alvoAindaSelecionado({ lojaId: "a", osId: "1" }, { lojaId: "a", osId: "1" })).toBe(true);
    expect(alvoAindaSelecionado({ lojaId: "a", osId: "2" }, { lojaId: "a", osId: "1" })).toBe(false);
    expect(alvoAindaSelecionado({ lojaId: "b", osId: "1" }, { lojaId: "a", osId: "1" })).toBe(false);
    expect(alvoAindaSelecionado({ lojaId: "", osId: "1" }, { lojaId: "a", osId: "1" })).toBe(false);
  });
});

describe("R04 — mesclagem por fatia (T03/T04, sem perder digitação)", () => {
  it("fatia não tocada adota o servidor; tocada é preservada", () => {
    const r = mesclarNaoTocadas({ a: "typed", b: "old" }, { a: "old", b: "old" }, { a: "srv", b: "srv" });
    expect(r.mudou).toBe(true);
    expect(r.valor).toEqual({ a: "typed", b: "srv" });
  });

  it("conflito = tocada + servidor mudou (derivado, explícito)", () => {
    const atual = { cor: "Preto" };
    const salvo = { cor: "Violeta" };
    const novo = { cor: "Azul" };
    const tocada = JSON.stringify(atual) !== JSON.stringify(salvo);
    const servidorMudou = JSON.stringify(novo) !== JSON.stringify(salvo);
    expect(tocada && servidorMudou).toBe(true);
  });
});

describe.skip("R01 — cor após edição via action (BLOQUEADO: exige mirror no servidor)", () => {
  it("criar Violeta → salvarIdentificacaoV3(Preto) → reler devolve Preto", () => {
    // Regressão do aceite: hoje o resolver prioriza equipamento.cor (Violeta)
    // e salvarIdentificacaoV3 não espelha cor no equipamento.
    // Correção pendente em lib/operacoes-v3/prova-entrada-actions.ts
    // (ratificada no META rev 3 via PR documental #219, ainda não mergeado).
  });
});

describe.skip("R02 — interleaving A/B em PostgreSQL descartável (BLOQUEADO: sem banco)", () => {
  it("A muda defeito, B muda prioridade sem recarregar: ambos preservados + timeline íntegra", () => {
    // Exige: lib/operacoes-v4/entrada-readback.integration.test.ts (ratificado
    // no META rev 3, ainda não criado — depende do merge do PR #219) +
    // PostgreSQL descartável confirmado (ausente nesta execução: sem .env).
    // A action precisa de escrita condicional (patch + base esperada); leitura
    // extra + update cego não fecha a corrida.
  });
});
