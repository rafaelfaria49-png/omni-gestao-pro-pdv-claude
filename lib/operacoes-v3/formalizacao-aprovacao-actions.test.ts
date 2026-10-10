// GOAL OPS-V4-FINANCEIRO-RETIRADA-GARANTIA-002 (item D) — actions de "Formalizar aprovação
// pendente" com Prisma EM MEMÓRIA: permissão conferida no servidor antes de qualquer leitura,
// replay/conflito por `operacaoId`, recusa sem escrita, ordem das travas e gravação só do
// payload. A concorrência real (barreira + pg_stat_activity) é provada em PostgreSQL.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  const ordens = new Map<string, Row>();
  const titulos = new Map<string, Row>();
  const sql: string[] = [];
  const updates: Array<{ where: unknown; data: Record<string, unknown> }> = [];
  const sessao = { user: { id: "u-admin", name: "Admin QA", role: "ADMIN" } as Record<string, unknown> | null };
  const permissoes = { editarOs: true };
  let falharTransacao: unknown = null;
  const lerOS = vi.fn();

  const prisma: Record<string, unknown> = {
    $transaction: async (fn: (tx: unknown) => unknown) => {
      if (falharTransacao) {
        const e = falharTransacao;
        falharTransacao = null;
        throw e;
      }
      return fn(prisma);
    },
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const texto = strings.join("?");
      if (texto.includes("pg_advisory_xact_lock")) {
        sql.push(`advisory:${String(values[0])}`);
        return [{ lock: "" }];
      }
      if (texto.includes("ordens_servico")) {
        sql.push("os:for_update");
        const r = ordens.get(String(values[0]));
        return r && r.storeId === values[1] ? [{ id: r.id }] : [];
      }
      if (texto.includes("contas_receber_titulos")) {
        sql.push("titulo:for_update");
        return [];
      }
      return [];
    },
    ordemServico: {
      findFirst: async ({ where }: { where: { id: string; storeId: string } }) => {
        lerOS(where);
        const r = ordens.get(where.id);
        return r && r.storeId === where.storeId ? { id: r.id, payload: r.payload, valorTotal: r.valorTotal } : null;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        updates.push({ where, data });
        const r = ordens.get(where.id);
        if (r && data.payload !== undefined) r.payload = data.payload;
        return r;
      },
    },
    contaReceberTitulo: {
      findUnique: async ({ where }: { where: { storeId_localKey: { storeId: string; localKey: string } } }) => {
        const { storeId, localKey } = where.storeId_localKey;
        return titulos.get(`${storeId}::${localKey}`) ?? null;
      },
    },
  };
  return {
    prisma,
    ordens,
    titulos,
    sql,
    updates,
    sessao,
    permissoes,
    lerOS,
    falhar: (e: unknown) => {
      falharTransacao = e;
    },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: h.prisma }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn(async () => (h.sessao.user ? { user: h.sessao.user } : null)) }));
vi.mock("@/lib/auth/guard-enterprise", () => ({
  requireEnterpriseWith: vi.fn(async (_sid: string, check: (p: { operacoes: { editarOs: boolean } }) => boolean, msg: string) =>
    check({ operacoes: { editarOs: h.permissoes.editarOs } }) ? { ok: true } : { ok: false, error: msg, status: 403 },
  ),
}));

import { conferirFormalizacaoAprovacaoV3, formalizarAprovacaoPendenteV3 } from "./formalizacao-aprovacao-actions";
import { localKeyContaReceberOSV3 } from "./payment-model";
import { chaveLockRecebimentoMistoV3 } from "./recebimento-misto-service";
import type { EscopoFormalizacaoV3 } from "./formalizacao-aprovacao-model";

const SID = "loja-qa";
const OS = "os-1";

function seed(orcamentoStatus = "rascunho") {
  h.ordens.set(OS, {
    id: OS,
    storeId: SID,
    valorTotal: 420,
    payload: {
      id: OS,
      codigo: "OS-1",
      status: "pronta",
      operacaoStatusV3: "pronta",
      valorTotal: 420,
      orcamento: { id: "orc-1", status: orcamentoStatus, sintetizado: false, criadoEm: "2026-10-01T12:00:00.000Z", desconto: 0, total: 420, pecas: [], servicos: [{ id: "s1", descricao: "Troca de tela", valor: 420 }] },
      timeline: [],
    },
  });
  const localKey = localKeyContaReceberOSV3(SID, OS);
  h.titulos.set(`${SID}::${localKey}`, {
    id: "cr-1",
    storeId: SID,
    localKey,
    valor: 420,
    status: "pago",
    payload: { ordemServicoId: OS, historico: [{ tipo: "liquidacao", valor: 420, loteId: "op-1" }] },
  });
}

async function conferir(): Promise<EscopoFormalizacaoV3> {
  const r = await conferirFormalizacaoAprovacaoV3(SID, OS);
  if (!r.ok) throw new Error(r.mensagem);
  return r.escopo;
}

const entrada = (escopo: EscopoFormalizacaoV3, extra: Record<string, unknown> = {}) => ({
  operacaoId: "op-formaliza-1",
  motivo: "Cliente aprovou presencialmente em 02/10.",
  declaracaoAceita: true,
  escopo,
  ...extra,
});

beforeEach(() => {
  h.ordens.clear();
  h.titulos.clear();
  h.sql.length = 0;
  h.updates.length = 0;
  h.lerOS.mockClear();
  h.sessao.user = { id: "u-admin", name: "Admin QA", role: "ADMIN" };
  h.permissoes.editarOs = true;
  seed();
});

describe("acesso: administrador + operacoes.editarOs, conferidos ANTES de ler a OS", () => {
  const negados: Array<[string, () => void, string]> = [
    ["sem sessão", () => { h.sessao.user = null; }, "nao_autenticado"],
    ["gerente com editarOs", () => { h.sessao.user = { id: "u-g", name: "Gerente", role: "GERENTE" }; }, "sem_permissao"],
    ["operador com editarOs", () => { h.sessao.user = { id: "u-o", name: "Operador", role: "OPERADOR" }; }, "sem_permissao"],
    ["admin sem editarOs", () => { h.permissoes.editarOs = false; }, "sem_permissao"],
  ];
  for (const [nome, preparar, code] of negados) {
    it(`${nome}: conferência e formalização negadas, nada lido nem gravado`, async () => {
      const escopo = await conferir();
      h.lerOS.mockClear();
      h.sql.length = 0;
      preparar();
      expect(await conferirFormalizacaoAprovacaoV3(SID, OS)).toMatchObject({ ok: false, code });
      expect(await formalizarAprovacaoPendenteV3(SID, OS, entrada(escopo))).toMatchObject({ ok: false, code });
      expect(h.lerOS).not.toHaveBeenCalled();
      expect(h.sql).toEqual([]);
      expect(h.updates).toEqual([]);
    });
  }

  it("SUPER_ADMIN também é administrador (mapeamento existente)", async () => {
    h.sessao.user = { id: "u-s", name: "Super", role: "SUPER_ADMIN" };
    expect(await conferirFormalizacaoAprovacaoV3(SID, OS)).toMatchObject({ ok: true });
  });
});

describe("conferência: só leitura", () => {
  it("devolve escopo, vencimento e o texto da declaração sem travar nem gravar", async () => {
    const r = await conferirFormalizacaoAprovacaoV3(SID, OS);
    expect(r).toMatchObject({ ok: true, vencido: false, escopo: { osId: OS, orcamento: { totalCentavos: 42000 }, recebidoLiquidoCentavos: 42000 } });
    expect(h.sql).toEqual([]);
    expect(h.updates).toEqual([]);
  });

  it("OS de outra loja: não encontrada", async () => {
    expect(await conferirFormalizacaoAprovacaoV3("outra-loja", OS)).toMatchObject({ ok: false, code: "os_nao_encontrada" });
  });
});

describe("formalização: travas, gravação e idempotência", () => {
  it("trava como os writers de pagamento (advisory da OS → OS → título) e grava SÓ o payload", async () => {
    const escopo = await conferir();
    const r = await formalizarAprovacaoPendenteV3(SID, OS, entrada(escopo));
    expect(r).toMatchObject({ ok: true, jaRegistrado: false, operacaoId: "op-formaliza-1", formalizadoPor: "Admin QA" });
    expect(h.sql).toEqual([`advisory:${chaveLockRecebimentoMistoV3(SID, OS)}`, "os:for_update", "titulo:for_update"]);
    expect(h.updates).toHaveLength(1);
    expect(Object.keys(h.updates[0]!.data)).toEqual(["payload"]);
    const payload = h.ordens.get(OS)!.payload as Record<string, unknown>;
    expect(payload.orcamento).toMatchObject({ status: "aprovado" });
    expect(payload.formalizacaoAprovacaoV3).toMatchObject({ operacaoId: "op-formaliza-1", natureza: "formalizacao_aprovacao_pendente", formalizadoPorId: "u-admin" });
    expect(h.ordens.get(OS)!.valorTotal).toBe(420);
  });

  it("mesma operação + mesmo conteúdo: resultado original, nada gravado de novo", async () => {
    const escopo = await conferir();
    const primeira = await formalizarAprovacaoPendenteV3(SID, OS, entrada(escopo));
    const segunda = await formalizarAprovacaoPendenteV3(SID, OS, entrada(escopo));
    expect(segunda).toEqual({ ...primeira, jaRegistrado: true });
    expect(h.updates).toHaveLength(1);
  });

  it("mesma operação + outro conteúdo: conflito explícito, nada gravado", async () => {
    const escopo = await conferir();
    await formalizarAprovacaoPendenteV3(SID, OS, entrada(escopo));
    const r = await formalizarAprovacaoPendenteV3(SID, OS, entrada(escopo, { motivo: "Outro motivo, outro conteúdo." }));
    expect(r).toMatchObject({ ok: false, code: "idempotencia_conflito", naoRegistrada: true });
    expect(h.updates).toHaveLength(1);
  });

  it("outra operação depois da formalização: orçamento já aprovado, nada a formalizar", async () => {
    const escopo = await conferir();
    await formalizarAprovacaoPendenteV3(SID, OS, entrada(escopo));
    expect(await formalizarAprovacaoPendenteV3(SID, OS, entrada(escopo, { operacaoId: "op-formaliza-2" }))).toMatchObject({ ok: false, code: "nao_pendente" });
    expect(h.updates).toHaveLength(1);
  });

  it("escopo mudou entre a conferência e a gravação: recusa sem escrita", async () => {
    const escopo = await conferir();
    const os = h.ordens.get(OS)!;
    os.payload = { ...(os.payload as Record<string, unknown>), orcamentoVersoesV3: [{ versao: 1 }] };
    expect(await formalizarAprovacaoPendenteV3(SID, OS, entrada(escopo))).toMatchObject({ ok: false, code: "escopo_divergente", naoRegistrada: true });
    expect(h.updates).toEqual([]);
  });

  it("entrada inválida é recusada antes de qualquer trava", async () => {
    const escopo = await conferir();
    h.sql.length = 0;
    expect(await formalizarAprovacaoPendenteV3(SID, OS, entrada(escopo, { declaracaoAceita: false }))).toMatchObject({ ok: false, code: "entrada_invalida", naoRegistrada: true });
    expect(h.sql).toEqual([]);
  });

  it("conflito transitório do banco (P2034): nada gravado, a chave segue reutilizável", async () => {
    const escopo = await conferir();
    h.falhar(Object.assign(new Error("serialization"), { code: "P2034" }));
    const r = await formalizarAprovacaoPendenteV3(SID, OS, entrada(escopo));
    expect(r).toMatchObject({ ok: false, code: "conflito_concorrente" });
    expect("naoRegistrada" in r).toBe(false);
    expect(await formalizarAprovacaoPendenteV3(SID, OS, entrada(escopo))).toMatchObject({ ok: true, jaRegistrado: false });
  });
});
