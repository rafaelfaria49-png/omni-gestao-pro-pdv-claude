/**
 * OPS-RECEBIMENTO-MISTO-P1-HARDENING-001 — transitivos da revisão R1 (PostgreSQL REAL, local).
 *
 * Mesma classe de lost update/travas, alcançada por caminhos que não gravam o payload da OS:
 *
 *  P1-T1  updateOSPayload → syncFinanceiroAfterOSPayloadUpdate → adapter os-faturamento
 *         (upsert e cancel do título) contra o recebimento misto K = 350 débito + 50 a prazo.
 *  P1-T2  serviço compartilhado `upsertContaReceber`/`cancelContaReceber` pelos callers globais
 *         (POST contas-receber-persist / sync-legacy-financeiro) — título existente E inexistente.
 *  P1-T3  cancelar OS (status-actions) × pagamento direto/lote do Financeiro (sem trava da OS).
 *  P1-T6  (R2) trava do título vazia → título criado/commitado no meio → pagamento travado →
 *         escrita: rotas globais e adapter nunca gravam sobre leitura sem trava.
 *  P2-T4  sync de itens da OS (rascunho) × entrega (consumo) × restauração de estoque —
 *         quantidade real 10→9→10 em ambas as ordens, repetições e peças repetidas legítimas.
 *  P2-T5  intenção de orçamento (hub aprovar/enviar/recusar) e materialização do rascunho
 *         (gerarOrcamentoDaOS) contra edição concorrente.
 *
 * Intercalação DETERMINÍSTICA: o cliente Prisma real é envolvido só para PAUSAR uma chamada
 * escolhida numa barreira (antes de executar, ou depois de devolver o resultado lido do PG).
 * Toda query/efeito continua real; a espera da outra transação é observada no próprio banco
 * (`pg_stat_activity`), nunca por sleep. Só `@/auth` e `next/cache` são simulados.
 */
import { afterAll, describe, expect, it, vi } from "vitest";

const sessao = vi.hoisted(() => ({ id: "qa-trans-admin", name: "Operador QA", role: "ADMIN" }));
vi.mock("@/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: sessao.id, name: sessao.name, role: sessao.role, storeAccess: "all" } })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

type Fase = "antes" | "depois";
type Pausa = {
  modelo: string;
  metodos: readonly string[];
  fase: Fase;
  quando: (args: unknown, resultado?: unknown) => boolean;
  chegou: () => void;
  barreira: Promise<void>;
};
const intercept = vi.hoisted(() => ({ pausa: null as null | Pausa }));

vi.mock("@/lib/prisma", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/prisma")>();
  const envolverDelegate = (modelo: string, delegate: object) =>
    new Proxy(delegate, {
      get(t, p) {
        const fn = Reflect.get(t, p);
        if (typeof fn !== "function") return fn;
        return async (args: unknown) => {
          const pausa = intercept.pausa;
          const alvo = pausa && pausa.modelo === modelo && pausa.metodos.includes(String(p));
          if (alvo && pausa.fase === "antes" && pausa.quando(args)) {
            intercept.pausa = null;
            pausa.chegou();
            await pausa.barreira;
          }
          const r = await (fn as (a: unknown) => Promise<unknown>).call(t, args);
          if (alvo && pausa.fase === "depois" && intercept.pausa === pausa && pausa.quando(args, r)) {
            intercept.pausa = null;
            pausa.chegou();
            await pausa.barreira;
          }
          return r;
        };
      },
    });
  const MODELOS = new Set(["ordemServico", "contaReceberTitulo", "caixaOperacao", "ordemServicoItem"]);
  const envolverCliente = (client: object): object =>
    new Proxy(client, {
      get(t, p) {
        const v = Reflect.get(t, p);
        if (typeof p === "string" && MODELOS.has(p) && v && typeof v === "object") return envolverDelegate(p, v);
        // `$queryRaw` (tagged template) só é envolvido com uma pausa "$queryRaw" armada — o
        // cliente devolvido fora disso é o original (PrismaPromise intacta para batches).
        if (p === "$queryRaw" && typeof v === "function" && intercept.pausa?.modelo === "$queryRaw") {
          return async (strings: TemplateStringsArray, ...values: unknown[]) => {
            const r = await (v as (...a: unknown[]) => Promise<unknown>).call(t, strings, ...values);
            const pausa = intercept.pausa;
            if (pausa && pausa.modelo === "$queryRaw" && pausa.quando({ sql: strings.join("?"), values }, r)) {
              intercept.pausa = null;
              pausa.chegou();
              await pausa.barreira;
            }
            return r;
          };
        }
        if (p === "$transaction" && typeof v === "function") {
          return (arg: unknown, opts?: unknown) =>
            typeof arg === "function"
              ? (v as (...a: unknown[]) => unknown).call(t, (tx: object) => (arg as (tx: object) => unknown)(envolverCliente(tx)), opts)
              : (v as (...a: unknown[]) => unknown).call(t, arg, opts);
        }
        return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(t) : v;
      },
    });
  const prismaEnvolvido = envolverCliente(real.prisma) as typeof real.prisma;
  return {
    ...real,
    prisma: prismaEnvolvido,
    // Leituras via withPrismaSafe (ex.: listOS) passam pelo MESMO cliente envolvido.
    withPrismaSafe: <T,>(op: (db: typeof real.prisma) => Promise<T>, fallback: T) => real.withPrismaSafe(() => op(prismaEnvolvido), fallback),
  };
});
// Rota legada exige cookie de assinatura (infra de auth, como @/auth): só esse gate é simulado.
vi.mock("@/lib/ops-api-gate", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ops-api-gate")>()),
  requireOpsSubscription: vi.fn(async () => ({ ok: true as const, sub: { status: "ativa" } })),
}));

import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import {
  aplicarTransicaoStatusV3,
} from "@/lib/operacoes-v3/status-actions";
import {
  receberOSV3,
  registrarRecebimentoMistoOSV3,
  type RegistrarRecebimentoMistoInputV3,
} from "@/lib/operacoes-v3/pdv-servico-actions";
import { aprovarOrcamentoV3, gerarOrcamentoDaOS, salvarOrcamentoV3 } from "@/lib/operacoes-v3/orcamento-actions";
import { hojeLojaV3 } from "@/lib/operacoes-v3/recebimento-misto-model";
import { localKeyContaReceberOSV3 } from "@/lib/operacoes-v3/payment-model";
import {
  buildContaReceberAuditTrail,
  cancelContaReceber,
  liquidarContaReceber,
  registrarPagamentoParcial,
} from "@/lib/financeiro/services/contas-receber-service";
import { applyOperacaoHubAcao, gerarCobrancaOSAction, syncOperacaoItensComOrcamento, updateOSPayload } from "@/app/actions/operacoes";
import { consumeEstoqueFromOS, restoreEstoqueFromOS } from "@/lib/operacoes/adapters/os-estoque";
import { POST as persistPOST } from "@/app/api/ops/contas-receber-persist/route";
import { POST as legacyPOST } from "@/app/api/ops/sync-legacy-financeiro/route";
import { POST as lotePOST } from "@/app/api/pdv/receber-conta-lote/route";
import { exigirBancoQA } from "./qa-bootstrap.mjs";

exigirBancoQA(process.env);

// ─── massa sintética ──────────────────────────────────────────────────────────

const SUFIXO = Date.now().toString(36);
const VENC = (() => {
  const [a, m, d] = hojeLojaV3().split("-").map(Number);
  return new Date(Date.UTC(a!, m! - 1 + 1, d!)).toISOString().slice(0, 10);
})();
let seq = 0;
type Payload = Record<string, any>;

async function novaLoja(): Promise<string> {
  const id = `qa-trans-${SUFIXO}-${++seq}`;
  await prisma.store.create({ data: { id, name: `Loja QA transitivos ${seq}` } });
  return id;
}

function orcamento(total: number, status: string, extra: Payload = {}): Payload {
  return {
    id: `orc-${total}-${status}`,
    status,
    pecas: [],
    servicos: [{ id: `s-${total}`, descricao: `Serviço ${total}`, valor: total, desconto: 0 }],
    desconto: 0,
    total,
    criadoEm: "2026-10-01T12:00:00.000Z",
    ...extra,
  };
}

async function novaOS(storeId: string, payload: Payload = {}, valorTotal = 400): Promise<string> {
  const n = ++seq;
  const row = await prisma.ordemServico.create({
    data: {
      storeId,
      numero: `OS-QA-T-${SUFIXO}-${n}`,
      equipamento: "Samsung A54",
      defeito: "Tela quebrada",
      valorTotal,
      payload: {
        codigo: `OS-QA-T-${n}`,
        storeId,
        cliente: { nome: `Cliente QA ${n}` },
        equipamento: { tipo: "Smartphone", marca: "Samsung", modelo: "A54" },
        status: "pronta",
        operacaoStatusV3: "pronta",
        orcamento: orcamento(400, "aprovado"),
        valorTotal,
        campoDesconhecidoQA: { preservar: true },
        timeline: [{ id: `ev-abertura-${n}`, tipo: "os_criada", autor: "QA", autorTipo: "usuario", conteudo: "OS aberta", criadoEm: "2026-10-01T12:00:00.000Z" }],
        ...payload,
      } as Prisma.InputJsonValue,
    },
  });
  // `id` no payload (consumo de estoque e hub exigem).
  await prisma.ordemServico.update({ where: { id: row.id }, data: { payload: { ...(row.payload as Payload), id: row.id } as Prisma.InputJsonValue } });
  return row.id;
}

/** OS aprovada e faturável (400) cujo título nasce pelo caminho real updateOSPayload → sync → adapter. */
async function novaOSFaturavelComTitulo(storeId: string): Promise<string> {
  const osId = await novaOS(storeId);
  await updateOSPayload(storeId, osId, {
    faturamentoPendente: true,
    faturamentoStatus: "pendente",
    faturamentoOrigem: "orcamento_os",
    faturamentoTotal: 400,
    faturamentoCriadoEm: "2026-10-01T12:00:00.000Z",
    faturamentoReferencia: `OS-QA · ${osId}`,
  } as never);
  const t = await prisma.contaReceberTitulo.findMany({ where: { storeId } });
  expect(t).toHaveLength(1);
  expect(t[0]!.valor).toBe(400);
  return osId;
}

async function abrirCaixa(storeId: string): Promise<string> {
  return (await prisma.sessaoCaixa.create({ data: { storeId, operador: "QA", status: "ABERTA" } })).id;
}

let opSeq = 0;
const opId = () => `qa-trans-op-${SUFIXO}-${++opSeq}`;

async function estado(storeId: string, osId: string) {
  const localKey = localKeyContaReceberOSV3(storeId, osId);
  const titulos = await prisma.contaReceberTitulo.findMany({ where: { storeId } });
  const titulo = titulos.find((t) => t.localKey === localKey) ?? null;
  const caixa = await prisma.caixaOperacao.findMany({ where: { storeId }, orderBy: { at: "asc" } });
  const movs = await prisma.movimentacaoFinanceira.findMany({ where: { storeId } });
  const os = await prisma.ordemServico.findUniqueOrThrow({ where: { id: osId } });
  const historico: Payload[] = ((titulo?.payload as Payload | null)?.historico as Payload[] | undefined) ?? [];
  const saldo = titulo ? buildContaReceberAuditTrail([titulo])[0]!.saldoAberto : null;
  const payload = os.payload as Payload;
  return {
    titulos,
    titulo,
    caixa,
    movs,
    os,
    payload,
    historico,
    saldo,
    pagamentos: historico.filter((e) => e.tipo === "pagamento" || e.tipo === "liquidacao"),
    marcadores: historico.filter((e) => e.tipo === "a_prazo_autorizado"),
    timeline: (payload.timeline ?? []) as Payload[],
  };
}

type Estado = Awaited<ReturnType<typeof estado>>;

/** Todo dinheiro que entrou (caixa/movimentação) tem a baixa correspondente no título. */
function ledgerCoerente(s: Estado) {
  const somaPag = s.pagamentos.reduce((a, e) => a + Number(e.valor), 0);
  const somaCaixa = s.caixa.reduce((a, c) => a + Number(c.valor), 0);
  const somaMov = s.movs.reduce((a, m) => a + Number(m.valor), 0);
  expect.soft(somaCaixa, "Σ caixa = Σ baixas do título").toBeCloseTo(somaPag, 2);
  expect.soft(somaMov, "Σ movimentação = Σ baixas do título").toBeCloseTo(somaPag, 2);
}

function resumo(s: Estado) {
  return {
    titulos: s.titulos.length,
    status: s.titulo?.status ?? null,
    valor: s.titulo?.valor ?? null,
    saldo: s.saldo,
    pagamentos: s.pagamentos.map((e) => e.valor),
    marcadores: s.marcadores.length,
    caixa: s.caixa.map((c) => c.valor),
    movs: s.movs.map((m) => m.valor),
    timeline: s.timeline.length,
  };
}

async function esperarBloqueioNoBanco(timeoutMs = 15_000, minimo = 1): Promise<void> {
  const fim = Date.now() + timeoutMs;
  while (Date.now() < fim) {
    const rows = await prisma.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()
    `;
    if ((rows[0]?.n ?? 0) >= minimo) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("a operação concorrente não chegou a esperar a trava");
}

/** Resolve quando a promessa termina OU quando outra transação está esperando trava no banco. */
async function concluiuOuEsperaTrava(p: Promise<unknown>, minimo = 1): Promise<"concluiu" | "esperando_trava"> {
  return Promise.race([p.then(() => "concluiu" as const, () => "concluiu" as const), esperarBloqueioNoBanco(15_000, minimo).then(() => "esperando_trava" as const)]);
}

function armarPausa(p: { modelo: string; metodos: readonly string[]; fase?: Fase; quando: (args: Payload, resultado?: unknown) => boolean }) {
  let liberar!: () => void;
  const barreira = new Promise<void>((r) => (liberar = r));
  let chegou!: () => void;
  const naBarreira = new Promise<void>((r) => (chegou = r));
  intercept.pausa = {
    modelo: p.modelo,
    metodos: p.metodos,
    fase: p.fase ?? "antes",
    quando: (args, r) => !!args && typeof args === "object" && p.quando(args as Payload, r),
    chegou,
    barreira,
  };
  let liberada = false;
  return {
    naBarreira,
    liberar: () => {
      if (liberada) return;
      liberada = true;
      liberar();
    },
  };
}

/** Payload(s) de `data` de create/createMany/update/updateMany/upsert. */
function dadosGravados(args: Payload): Payload[] {
  const out: Payload[] = [];
  const d = args.data;
  if (Array.isArray(d)) out.push(...d);
  else if (d && typeof d === "object") out.push(d);
  if (args.create) out.push(args.create);
  if (args.update) out.push(args.update);
  return out;
}

const naoEhDeadlock = (r: PromiseSettledResult<unknown>) => {
  const msg = r.status === "rejected" ? String((r.reason as Error)?.message ?? r.reason) : JSON.stringify(r.value ?? null);
  expect(msg, "sem deadlock/timeout").not.toMatch(/deadlock|40P01|P2034|P2028|timed out|expired/i);
};

afterAll(async () => {
  intercept.pausa = null;
  await prisma.$disconnect();
});

const misto = (sessaoId: string, K: string): RegistrarRecebimentoMistoInputV3 => ({
  operacaoId: K,
  sessaoId,
  pagamentosAgora: [{ forma: "debito", valor: 350 }],
  saldoAPrazo: { valor: 50, vencimento: VENC },
  saldoEsperado: 400,
});

/** B segura OS + título (e o caixa) no meio do recebimento misto. */
const pausaRecebimentoNoCaixa = () =>
  armarPausa({ modelo: "caixaOperacao", metodos: ["create", "createMany"], quando: () => true });

/** K 350+50 completo: 1 baixa 350, 1 marcador, caixa 350, 1 mov; replay K não duplica; novo recebimento legítimo de 50 quita. */
async function conferirK350Mais50(storeId: string, osId: string, sessaoId: string, K: string) {
  const s = await estado(storeId, osId);
  console.info(`[estado K] ${JSON.stringify(resumo(s))}`);
  expect.soft(s.titulos).toHaveLength(1);
  expect.soft(s.pagamentos.map((e) => e.valor)).toEqual([350]);
  expect.soft(s.marcadores).toHaveLength(1);
  expect.soft(s.caixa.map((c) => c.valor)).toEqual([350]);
  expect.soft(s.movs.map((m) => m.valor)).toEqual([350]);
  expect.soft(s.titulo?.valor).toBe(400);
  expect.soft(s.saldo).toBe(50);
  expect.soft(s.titulo?.status).toBe("parcial");
  expect.soft(s.payload.campoDesconhecidoQA).toEqual({ preservar: true });
  expect.soft(s.timeline[0]).toMatchObject({ tipo: "os_criada" });
  ledgerCoerente(s);

  // Retry de K: replay, nenhum efeito novo.
  const replay = await registrarRecebimentoMistoOSV3(storeId, osId, misto(sessaoId, K));
  expect.soft(replay).toMatchObject({ ok: true, jaRegistrado: true });
  const r = await estado(storeId, osId);
  expect.soft(r.pagamentos).toHaveLength(1);
  expect.soft(r.marcadores).toHaveLength(1);
  expect.soft(r.caixa).toHaveLength(1);
  expect.soft(r.movs).toHaveLength(1);

  // Recebimento NOVO legítimo sobre o novo saldo continua permitido.
  const novo = await receberOSV3(storeId, osId, { valor: 50, forma: "pix", sessaoId, operacaoId: opId(), saldoEsperado: 50 });
  expect.soft(novo.jaRegistrado).toBe(false);
  const f = await estado(storeId, osId);
  expect.soft(f.pagamentos.map((e) => e.valor)).toEqual([350, 50]);
  expect.soft(f.caixa).toHaveLength(2);
  expect.soft(f.movs).toHaveLength(2);
  expect.soft(f.saldo).toBe(0);
  expect.soft(f.titulo?.status).toBe("pago");
  ledgerCoerente(f);
}

// ─── P1-T1 · updateOSPayload → sync → adapter (upsert) ─────────────────────────

type Ordem = "A_le_antes" | "B_trava_antes";

describe("P1-T1 · updateOSPayload → adapter os-faturamento × recebimento misto K", () => {
  for (const ordem of ["A_le_antes", "B_trava_antes"] as const satisfies readonly Ordem[]) {
    it(`upsert do título · ${ordem}: baixa/marcador de K sobrevivem; status/saldo coerentes; replay K sem duplicar`, async () => {
      const storeId = await novaLoja();
      const osId = await novaOSFaturavelComTitulo(storeId);
      const sessaoId = await abrirCaixa(storeId);
      const K = opId();
      const patchA = { orcamento: orcamento(400, "aprovado", { observacao: "ajuste A" }) } as never;

      let pA: Promise<unknown>;
      let pB: Promise<unknown>;
      let observado: string;
      if (ordem === "A_le_antes") {
        const pausa = armarPausa({
          modelo: "contaReceberTitulo",
          metodos: ["update", "updateMany", "upsert", "create", "createMany"],
          quando: (a) => dadosGravados(a).some((d) => /Faturamento$/.test(String(d.descricao ?? ""))),
        });
        pA = updateOSPayload(storeId, osId, patchA);
        await pausa.naBarreira;
        pB = registrarRecebimentoMistoOSV3(storeId, osId, misto(sessaoId, K));
        observado = await concluiuOuEsperaTrava(pB);
        pausa.liberar();
      } else {
        const pausa = pausaRecebimentoNoCaixa();
        pB = registrarRecebimentoMistoOSV3(storeId, osId, misto(sessaoId, K));
        await pausa.naBarreira;
        pA = updateOSPayload(storeId, osId, patchA);
        observado = await concluiuOuEsperaTrava(pA);
        pausa.liberar();
      }
      const [rA, rB] = await Promise.allSettled([pA, pB]);
      console.info(`[P1-T1 upsert] ${ordem} · concorrente=${observado}`);
      naoEhDeadlock(rA);
      naoEhDeadlock(rB);
      expect(rA.status).toBe("fulfilled");
      expect(rB).toMatchObject({ status: "fulfilled", value: { ok: true, jaRegistrado: false } });
      const s = await estado(storeId, osId);
      expect.soft((s.payload.orcamento as Payload).observacao).toBe("ajuste A");
      await conferirK350Mais50(storeId, osId, sessaoId, K);
    });

    it(`cancel do título (faturamento cancelado) · ${ordem}: nenhuma baixa/marcador apagado; caixa/mov sempre com baixa`, async () => {
      const storeId = await novaLoja();
      const osId = await novaOSFaturavelComTitulo(storeId);
      const sessaoId = await abrirCaixa(storeId);
      const K = opId();
      const patchA = { faturamentoPendente: false, faturamentoStatus: "cancelado" } as never;

      let pA: Promise<unknown>;
      let pB: Promise<unknown>;
      let observado: string;
      if (ordem === "A_le_antes") {
        const pausa = armarPausa({
          modelo: "contaReceberTitulo",
          metodos: ["update", "updateMany"],
          quando: (a) => dadosGravados(a).some((d) => d.status === "cancelado"),
        });
        pA = updateOSPayload(storeId, osId, patchA);
        await pausa.naBarreira;
        pB = registrarRecebimentoMistoOSV3(storeId, osId, misto(sessaoId, K));
        observado = await concluiuOuEsperaTrava(pB);
        pausa.liberar();
      } else {
        const pausa = pausaRecebimentoNoCaixa();
        pB = registrarRecebimentoMistoOSV3(storeId, osId, misto(sessaoId, K));
        await pausa.naBarreira;
        pA = updateOSPayload(storeId, osId, patchA);
        observado = await concluiuOuEsperaTrava(pA);
        pausa.liberar();
      }
      const [rA, rB] = await Promise.allSettled([pA, pB]);
      console.info(`[P1-T1 cancel] ${ordem} · concorrente=${observado} · B=${JSON.stringify(rB.status === "fulfilled" ? rB.value : String(rB.reason))}`);
      naoEhDeadlock(rA);
      naoEhDeadlock(rB);
      expect(rA.status).toBe("fulfilled");
      const s = await estado(storeId, osId);
      console.info(`[P1-T1 cancel] ${ordem} · ${JSON.stringify(resumo(s))}`);
      expect.soft(s.titulo?.status).toBe("cancelado");
      ledgerCoerente(s);
      const registrou = rB.status === "fulfilled" && (rB.value as Payload).ok === true;
      expect.soft(s.pagamentos).toHaveLength(registrou ? 1 : 0);
      expect.soft(s.marcadores).toHaveLength(registrou ? 1 : 0);
      // Retry de K nunca cria dinheiro novo.
      await registrarRecebimentoMistoOSV3(storeId, osId, misto(sessaoId, K)).catch(() => null);
      const r = await estado(storeId, osId);
      expect.soft(r.caixa.length).toBe(s.caixa.length);
      expect.soft(r.movs.length).toBe(s.movs.length);
      expect.soft(r.pagamentos.length).toBe(s.pagamentos.length);
      ledgerCoerente(r);
    });
  }
});

// ─── P1-T2 · serviço compartilhado pelos callers globais ───────────────────────

const ROTAS = [
  { nome: "contas-receber-persist", post: persistPOST, url: "http://127.0.0.1/api/ops/contas-receber-persist" },
  { nome: "sync-legacy-financeiro", post: legacyPOST, url: "http://127.0.0.1/api/ops/sync-legacy-financeiro" },
] as const;

async function postarSnapshot(rota: (typeof ROTAS)[number], storeId: string, osId: string) {
  const localKey = localKeyContaReceberOSV3(storeId, osId);
  const row = {
    id: localKey,
    descricao: "OS snapshot da tela",
    cliente: "Cliente snapshot",
    valor: 400,
    vencimento: "30/11/2026",
    status: "pendente",
    historico: [],
    snapshotQA: "A",
  };
  const res = await rota.post(
    new Request(rota.url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-assistec-loja-id": storeId },
      body: JSON.stringify({ rows: [row] }),
    }),
  );
  return { status: res.status, body: (await res.json()) as Payload };
}

describe("P1-T2 · upsertContaReceber via rotas globais × recebimento misto K", () => {
  for (const rota of ROTAS) {
    for (const existe of [true, false]) {
      for (const ordem of ["A_le_antes", "B_trava_antes"] as const) {
        it(`${rota.nome} · título ${existe ? "existente" : "INEXISTENTE"} · ${ordem}: snapshot da tela não apaga baixa/marcador de K`, async () => {
          const storeId = await novaLoja();
          const osId = existe ? await novaOSFaturavelComTitulo(storeId) : await novaOS(storeId);
          const sessaoId = await abrirCaixa(storeId);
          const K = opId();
          let pA: Promise<Awaited<ReturnType<typeof postarSnapshot>>>;
          let pB: Promise<unknown>;
          let observado: string;
          if (ordem === "A_le_antes") {
            const pausa = armarPausa({
              modelo: "contaReceberTitulo",
              metodos: ["update", "updateMany", "upsert", "create", "createMany"],
              quando: (a) => dadosGravados(a).some((d) => (d.payload as Payload | undefined)?.snapshotQA === "A"),
            });
            pA = postarSnapshot(rota, storeId, osId);
            await pausa.naBarreira;
            pB = registrarRecebimentoMistoOSV3(storeId, osId, misto(sessaoId, K));
            observado = await concluiuOuEsperaTrava(pB);
            pausa.liberar();
          } else {
            const pausa = pausaRecebimentoNoCaixa();
            pB = registrarRecebimentoMistoOSV3(storeId, osId, misto(sessaoId, K));
            await pausa.naBarreira;
            pA = postarSnapshot(rota, storeId, osId);
            observado = await concluiuOuEsperaTrava(pA);
            pausa.liberar();
          }
          const [rA, rB] = await Promise.allSettled([pA, pB]);
          console.info(`[P1-T2] ${rota.nome} · existe=${existe} · ${ordem} · concorrente=${observado} · A=${JSON.stringify(rA.status === "fulfilled" ? rA.value : String(rA.reason))}`);
          naoEhDeadlock(rA);
          naoEhDeadlock(rB);
          expect(rA).toMatchObject({ status: "fulfilled", value: { status: 200 } });
          expect(rB).toMatchObject({ status: "fulfilled", value: { ok: true, jaRegistrado: false } });
          const s = await estado(storeId, osId);
          // O snapshot da tela é autoridade só de apresentação.
          expect.soft((s.titulo?.payload as Payload | undefined)?.snapshotQA).toBe("A");
          await conferirK350Mais50(storeId, osId, sessaoId, K);
        });
      }
    }
  }

  it("cancelContaReceber (Financeiro PATCH/DELETE) lê → K paga → cancela: histórico de K preservado; caixa/mov sempre com baixa", async () => {
    const storeId = await novaLoja();
    const osId = await novaOSFaturavelComTitulo(storeId);
    const sessaoId = await abrirCaixa(storeId);
    const K = opId();
    const pausa = armarPausa({
      modelo: "contaReceberTitulo",
      metodos: ["update", "updateMany"],
      quando: (a) => dadosGravados(a).some((d) => d.status === "cancelado"),
    });
    const pA = cancelContaReceber({ storeId, localKey: localKeyContaReceberOSV3(storeId, osId), motivo: "QA cancel", userLabel: "QA" });
    await pausa.naBarreira;
    const pB = registrarRecebimentoMistoOSV3(storeId, osId, misto(sessaoId, K));
    const observado = await concluiuOuEsperaTrava(pB);
    pausa.liberar();
    const [rA, rB] = await Promise.allSettled([pA, pB]);
    console.info(`[P1-T2 cancel] concorrente=${observado} · A=${JSON.stringify(rA.status === "fulfilled" ? (rA.value as Payload).ok : String(rA.reason))} · B=${JSON.stringify(rB.status === "fulfilled" ? rB.value : String(rB.reason))}`);
    naoEhDeadlock(rA);
    naoEhDeadlock(rB);
    const s = await estado(storeId, osId);
    console.info(`[P1-T2 cancel] ${JSON.stringify(resumo(s))}`);
    ledgerCoerente(s);
    const registrou = rB.status === "fulfilled" && (rB.value as Payload).ok === true;
    expect.soft(s.pagamentos).toHaveLength(registrou ? 1 : 0);
    expect.soft(s.marcadores).toHaveLength(registrou ? 1 : 0);
    await registrarRecebimentoMistoOSV3(storeId, osId, misto(sessaoId, K)).catch(() => null);
    const r = await estado(storeId, osId);
    expect.soft(r.caixa.length).toBe(s.caixa.length);
    expect.soft(r.movs.length).toBe(s.movs.length);
    ledgerCoerente(r);
  });
});

// ─── P1-T6 · `FOR UPDATE` sem linha → título criado no meio → leitura → pagamento → escrita ──
//
// R2: A trava o título AUSENTE (0 linhas — nada travado) e, antes da leitura ORM, B cria e
// commita o título 400; C trava esse título e paga (pausado antes do commit). A não pode
// derivar UPDATE de uma leitura cuja trava não adquiriu: deve esperar C e reler sob a trava.

/** Pausa A logo DEPOIS do `SELECT … FOR UPDATE` do título desta loja devolver 0 linhas. */
const pausaAposTravaVazia = (storeId: string) =>
  armarPausa({
    modelo: "$queryRaw",
    metodos: [],
    fase: "depois",
    quando: (a, r) =>
      /contas_receber_titulos/.test(String(a.sql)) &&
      /FOR UPDATE/.test(String(a.sql)) &&
      (a.values as unknown[]).includes(storeId) &&
      Array.isArray(r) &&
      r.length === 0,
  });

const FATURAMENTO_400 = {
  faturamentoPendente: true,
  faturamentoStatus: "pendente",
  faturamentoOrigem: "orcamento_os",
  faturamentoTotal: 400,
  faturamentoCriadoEm: "2026-10-01T12:00:00.000Z",
} as const;

/**
 * A pausa após a trava vazia → B cria/commita o título 400 → C (`pagar`) trava o título e
 * pausa no caixa → A retoma e PRECISA esperar a trava de C → C commita → A conclui.
 */
async function corridaTravaVazia<A>(p: { storeId: string; iniciarA: () => Promise<A>; criarTitulo: () => Promise<void>; pagar: () => Promise<unknown> }) {
  const pausaA = pausaAposTravaVazia(p.storeId);
  const pA = p.iniciarA();
  await pausaA.naBarreira;
  await p.criarTitulo();
  expect(await prisma.contaReceberTitulo.count({ where: { storeId: p.storeId } }), "B commitou o título").toBe(1);
  const pausaC = pausaRecebimentoNoCaixa();
  const pC = p.pagar();
  await pausaC.naBarreira;
  pausaA.liberar();
  const observado = await concluiuOuEsperaTrava(pA);
  pausaC.liberar();
  const [rA, rC] = await Promise.allSettled([pA, pC]);
  naoEhDeadlock(rA);
  naoEhDeadlock(rC);
  return { rA, rC, observado };
}

describe("P1-T6 · trava vazia → título criado no meio → A nunca grava sobre leitura sem trava", () => {
  for (const rota of ROTAS) {
    it(`${rota.nome} (upsertContaReceber global) × K 350+50: A espera C e relê; baixa/marcador de K sobrevivem`, async () => {
      const storeId = await novaLoja();
      const osId = await novaOS(storeId);
      const sessaoId = await abrirCaixa(storeId);
      const K = opId();
      const { rA, rC, observado } = await corridaTravaVazia({
        storeId,
        iniciarA: () => postarSnapshot(rota, storeId, osId),
        criarTitulo: () => tituloOS400(storeId, osId),
        pagar: () => registrarRecebimentoMistoOSV3(storeId, osId, misto(sessaoId, K)),
      });
      console.info(`[P1-T6] ${rota.nome} · A após C=${observado} · A=${JSON.stringify(rA.status === "fulfilled" ? rA.value : String(rA.reason))}`);
      expect(observado, "A esperou a trava de C antes de gravar").toBe("esperando_trava");
      expect(rA).toMatchObject({ status: "fulfilled", value: { status: 200 } });
      expect(rC).toMatchObject({ status: "fulfilled", value: { ok: true, jaRegistrado: false } });
      expect.soft(((await estado(storeId, osId)).titulo?.payload as Payload | undefined)?.snapshotQA).toBe("A");
      await conferirK350Mais50(storeId, osId, sessaoId, K);
    });
  }

  it("adapter os-faturamento (transação própria) × K 350+50: A espera C e relê; baixa/marcador de K sobrevivem", async () => {
    const storeId = await novaLoja();
    const osId = await novaOS(storeId);
    const sessaoId = await abrirCaixa(storeId);
    const K = opId();
    const os = { ...((await prisma.ordemServico.findUniqueOrThrow({ where: { id: osId } })).payload as Payload), ...FATURAMENTO_400, faturamentoReferencia: `OS-QA · ${osId}` };
    const { upsertContaReceberFromOS } = await import("@/lib/financeiro/adapters/os-faturamento");
    const { rA, rC, observado } = await corridaTravaVazia({
      storeId,
      iniciarA: () => upsertContaReceberFromOS(os as never),
      criarTitulo: () => tituloOS400(storeId, osId),
      pagar: () => registrarRecebimentoMistoOSV3(storeId, osId, misto(sessaoId, K)),
    });
    console.info(`[P1-T6] adapter · A após C=${observado} · A=${JSON.stringify(rA.status === "fulfilled" ? rA.value : String(rA.reason))}`);
    expect(observado, "A esperou a trava de C antes de gravar").toBe("esperando_trava");
    expect(rA).toMatchObject({ status: "fulfilled", value: { ok: true, action: "updated" } });
    expect(rC).toMatchObject({ status: "fulfilled", value: { ok: true, jaRegistrado: false } });
    await conferirK350Mais50(storeId, osId, sessaoId, K);
  });

  it("updateOSPayload → adapter (trava da OS) × lote PDV 350 (só trava do título): baixa preservada; caixa/mov únicos", async () => {
    const storeId = await novaLoja();
    const osId = await novaOS(storeId);
    const sessaoId = await abrirCaixa(storeId);
    const { rA, rC, observado } = await corridaTravaVazia({
      storeId,
      iniciarA: () => updateOSPayload(storeId, osId, { ...FATURAMENTO_400, faturamentoReferencia: `OS-QA · ${osId}` } as never),
      criarTitulo: () => tituloOS400(storeId, osId),
      pagar: () => postarLote(storeId, sessaoId, osId, 350),
    });
    const s = await estado(storeId, osId);
    console.info(`[P1-T6] updateOSPayload×lote · A após C=${observado} · C=${JSON.stringify(rC.status === "fulfilled" ? rC.value : String(rC.reason))} · ${JSON.stringify(resumo(s))}`);
    expect(observado, "A esperou a trava de C antes de gravar").toBe("esperando_trava");
    expect(rA.status).toBe("fulfilled");
    expect(rC).toMatchObject({ status: "fulfilled", value: { status: 200 } });
    expect.soft(s.payload.faturamentoStatus).toBe("pendente");
    expect.soft(s.titulos).toHaveLength(1);
    expect.soft(s.titulo?.valor).toBe(400);
    expect.soft(s.pagamentos.map((e) => e.valor)).toEqual([350]);
    expect.soft(s.caixa.map((c) => c.valor)).toEqual([350]);
    expect.soft(s.movs.map((m) => m.valor)).toEqual([350]);
    expect.soft(s.saldo).toBe(50);
    expect.soft(s.titulo?.status).toBe("parcial");
    ledgerCoerente(s);
  });
});

// ─── P1-T3 · cancelar OS × pagamento direto/lote do Financeiro ─────────────────

async function tituloOS400(storeId: string, osId: string) {
  await prisma.contaReceberTitulo.create({
    data: {
      storeId,
      localKey: localKeyContaReceberOSV3(storeId, osId),
      descricao: "OS QA",
      cliente: "Cliente QA",
      valor: 400,
      vencimento: "30/11/2026",
      status: "pendente",
      payload: { origem: "operacoes-v3", ordemServicoId: osId } as Prisma.InputJsonValue,
    },
  });
}

async function postarLote(storeId: string, sessaoId: string, osId: string, valor: number) {
  const res = await lotePOST(
    new Request("http://127.0.0.1/api/pdv/receber-conta-lote", {
      method: "POST",
      headers: { "content-type": "application/json", "x-assistec-loja-id": storeId },
      body: JSON.stringify({
        sessaoId,
        formaPagamento: "pix",
        idempotencyKey: opId(),
        itens: [{ localKey: localKeyContaReceberOSV3(storeId, osId), saldoEsperado: 400, valorReceber: valor }],
      }),
    }),
  );
  return { status: res.status, body: (await res.json()) as Payload };
}

const PAGAMENTOS_DIRETOS = [
  { nome: "direto parcial (Financeiro)", ordens: ["A_le_antes"] as const, valor: 100, pagar: (s: string, o: string) => registrarPagamentoParcial({ storeId: s, localKey: localKeyContaReceberOSV3(s, o), valorPago: 100 }) },
  { nome: "direto quitação (Financeiro)", ordens: ["A_le_antes"] as const, valor: 400, pagar: (s: string, o: string) => liquidarContaReceber({ storeId: s, localKey: localKeyContaReceberOSV3(s, o) }) },
  { nome: "lote parcial (PDV)", ordens: ["A_le_antes", "B_trava_antes"] as const, valor: 100, lote: true },
  { nome: "lote quitação (PDV)", ordens: ["A_le_antes", "B_trava_antes"] as const, valor: 400, lote: true },
] as const;

describe("P1-T3 · cancelar OS (status-actions) × pagamento sem trava da OS", () => {
  for (const pg of PAGAMENTOS_DIRETOS) {
    for (const ordem of pg.ordens) {
      it(`${pg.nome} · ${ordem}: OS cancelada ⇒ nenhum recebido; recebido ⇒ cancelamento recusado; nenhuma baixa apagada`, async () => {
        const storeId = await novaLoja();
        const osId = await novaOS(storeId);
        await tituloOS400(storeId, osId);
        const sessaoId = await abrirCaixa(storeId);
        const pagar = (): Promise<unknown> =>
          "lote" in pg ? postarLote(storeId, sessaoId, osId, pg.valor) : (pg as { pagar: (s: string, o: string) => Promise<unknown> }).pagar(storeId, osId);

        let pA: Promise<unknown>;
        let pB: Promise<unknown>;
        let observado: string;
        if (ordem === "A_le_antes") {
          const pausa = armarPausa({
            modelo: "contaReceberTitulo",
            metodos: ["update", "updateMany"],
            quando: (a) => dadosGravados(a).some((d) => d.status === "cancelado"),
          });
          pA = aplicarTransicaoStatusV3(storeId, osId, "cancelada", { motivo: "Cliente desistiu QA" });
          await pausa.naBarreira;
          pB = pagar();
          observado = await concluiuOuEsperaTrava(pB);
          pausa.liberar();
        } else {
          const pausa = pausaRecebimentoNoCaixa();
          pB = pagar();
          await pausa.naBarreira;
          pA = aplicarTransicaoStatusV3(storeId, osId, "cancelada", { motivo: "Cliente desistiu QA" });
          observado = await concluiuOuEsperaTrava(pA);
          pausa.liberar();
        }
        const [rA, rB] = await Promise.allSettled([pA, pB]);
        const s = await estado(storeId, osId);
        console.info(
          `[P1-T3] ${pg.nome} · ${ordem} · concorrente=${observado} · A=${rA.status === "fulfilled" ? "ok" : String((rA.reason as Error)?.message)} · B=${JSON.stringify(rB.status === "fulfilled" ? rB.value : String(rB.reason))} · ${JSON.stringify(resumo(s))}`,
        );
        naoEhDeadlock(rA);
        naoEhDeadlock(rB);
        const osCancelada = s.payload.operacaoStatusV3 === "cancelada";
        const recebido = s.pagamentos.reduce((a, e) => a + Number(e.valor), 0);
        // Contrato do cancelamento seguro: nunca uma OS cancelada com valor recebido.
        expect.soft(osCancelada && recebido > 0, "OS cancelada com recebido").toBe(false);
        if (osCancelada) expect.soft(s.titulo?.status).toBe("cancelado");
        else expect.soft(rA.status).toBe("rejected");
        if (rA.status === "rejected") expect.soft(String((rA.reason as Error).message)).toMatch(/pagamento recebido/);
        // Nenhuma baixa apagada: todo pagamento aceito está no histórico.
        if (rB.status === "fulfilled" && ((rB.value as Payload).ok === true || (rB.value as Payload).status === 200)) {
          expect.soft(recebido).toBeCloseTo(pg.valor, 2);
        }
        if ("lote" in pg) ledgerCoerente(s);
      });
    }
  }
});

// ─── P2-T4 · itens da OS × entrega × restauração ───────────────────────────────

/** `quantidades`: uma peça do orçamento por entrada (o mesmo produto repetido é legítimo). */
async function novaOSComPeca(storeId: string, quantidades: number[] = [1]) {
  const produto = await prisma.produto.create({ data: { storeId, name: `Tela QA ${++seq}`, price: 100, stock: 10 } });
  const total = quantidades.reduce((a, q) => a + q * 100, 0);
  const osId = await novaOS(
    storeId,
    {
      status: "em_execucao",
      operacaoStatusV3: "em_execucao",
      orcamento: {
        ...orcamento(total, "aprovado"),
        servicos: [],
        pecas: quantidades.map((quantidade, i) => ({ id: `peca-qa-${i}`, produtoId: produto.id, nome: "Tela QA", quantidade, valorUnitario: 100, observacao: "rascunho-QA" })),
      },
    },
    total,
  );
  return { osId, produtoId: produto.id };
}

/** `rascunho-QA` é só a marca do orçamento sintético (o rascunho copia a observação da peça). */
async function itens(osId: string) {
  const rows = await prisma.ordemServicoItem.findMany({ where: { ordemServicoId: osId } });
  return {
    rascunho: rows.filter((r) => r.observacao === "rascunho-QA").length,
    ledger: rows.filter((r) => r.observacao !== "rascunho-QA").length,
    qtdPeca: rows.filter((r) => r.produtoId).reduce((a, r) => a + r.quantidade, 0),
  };
}

const estoqueDe = async (produtoId: string) => (await prisma.produto.findUniqueOrThrow({ where: { id: produtoId } })).stock;

/** Efeitos reais no ledger de estoque da OS (não flags): Σ saídas e Σ entradas, nº de lançamentos. */
async function ledgerEstoqueOS(produtoId: string) {
  const rows = await prisma.movimentacaoEstoque.findMany({ where: { produtoId, origem: "os" } });
  const saidas = rows.filter((r) => r.tipo === "saida");
  const entradas = rows.filter((r) => r.tipo === "entrada");
  return {
    saidas: saidas.length,
    qtdSaida: saidas.reduce((a, r) => a + Math.abs(r.quantidade), 0),
    entradas: entradas.length,
    qtdEntrada: entradas.reduce((a, r) => a + Math.abs(r.quantidade), 0),
  };
}

describe("P2-T4 · sync de itens × consumo × restauração (sem ciclo, sem rascunho stale no ledger)", () => {
  it("sync pausada com itens apagados → entrega consome → restauração: sem deadlock; estoque 10→9→10, saída 1 / entrada 1", async () => {
    const storeId = await novaLoja();
    const { osId, produtoId } = await novaOSComPeca(storeId);
    await syncOperacaoItensComOrcamento(storeId, osId);
    expect((await itens(osId)).rascunho).toBe(1);

    const pausa = armarPausa({ modelo: "ordemServicoItem", metodos: ["create"], quando: () => true });
    const pS = syncOperacaoItensComOrcamento(storeId, osId);
    await pausa.naBarreira;
    const pC = consumeEstoqueFromOS({ storeId, osId });
    const oC = await concluiuOuEsperaTrava(pC);
    if (oC === "esperando_trava") pausa.liberar();
    const rC = await pC;
    const aposConsumo = { estoque: await estoqueDe(produtoId), itens: await itens(osId) };
    const pR = restoreEstoqueFromOS({ storeId, osId });
    const oR = await concluiuOuEsperaTrava(pR);
    pausa.liberar();
    const [rS, rR] = await Promise.allSettled([pS, pR]);
    console.info(`[P2-T4 ciclo] consumo=${oC} restauração=${oR} · S=${rS.status === "fulfilled" ? "ok" : String((rS.reason as Error)?.message)} · C=${JSON.stringify(rC)} · R=${JSON.stringify(rR.status === "fulfilled" ? rR.value : String(rR.reason))}`);
    naoEhDeadlock(rS);
    naoEhDeadlock(rR);
    expect.soft(rS.status).toBe("fulfilled");
    expect.soft(rC).toMatchObject({ ok: true, status: "consumed" });
    expect.soft(rR).toMatchObject({ status: "fulfilled", value: { ok: true } });
    const os = (await prisma.ordemServico.findUniqueOrThrow({ where: { id: osId } })).payload as Payload;
    expect.soft(os.estoqueConsumido).toBe(true);
    expect.soft(os.estoqueRestaurado).toBe(true);
    console.info(`[P2-T4 ciclo] após consumo=${JSON.stringify(aposConsumo)} · final=${await estoqueDe(produtoId)} · ledger=${JSON.stringify(await ledgerEstoqueOS(produtoId))}`);
    // Quantidade real: a sync que commitou antes da baixa deixou só rascunho — a baixa o
    // substitui pelo ledger (1 peça), e a restauração devolve exatamente o consumido.
    expect.soft(aposConsumo).toEqual({ estoque: 9, itens: { rascunho: 0, ledger: 1, qtdPeca: 1 } });
    expect.soft(await estoqueDe(produtoId)).toBe(10);
    expect.soft(await ledgerEstoqueOS(produtoId)).toEqual({ saidas: 1, qtdSaida: 1, entradas: 1, qtdEntrada: 1 });
    expect.soft(await itens(osId)).toEqual({ rascunho: 0, ledger: 0, qtdPeca: 0 });
  });

  it("sequencial sync → consumo → restauração (+ repetições): 10→9→10; consumo/restauração repetidos sem nova saída/entrada", async () => {
    const storeId = await novaLoja();
    const { osId, produtoId } = await novaOSComPeca(storeId);
    await syncOperacaoItensComOrcamento(storeId, osId);
    expect(await itens(osId)).toEqual({ rascunho: 1, ledger: 0, qtdPeca: 1 });
    expect(await consumeEstoqueFromOS({ storeId, osId })).toMatchObject({ ok: true, status: "consumed" });
    expect.soft(await estoqueDe(produtoId)).toBe(9);
    expect.soft(await itens(osId)).toEqual({ rascunho: 0, ledger: 1, qtdPeca: 1 });
    // Consumo repetido e sync após a baixa: nada muda.
    expect.soft(await consumeEstoqueFromOS({ storeId, osId })).toMatchObject({ ok: true, status: "already_consumed" });
    await syncOperacaoItensComOrcamento(storeId, osId);
    expect.soft(await estoqueDe(produtoId)).toBe(9);
    expect.soft(await itens(osId)).toEqual({ rascunho: 0, ledger: 1, qtdPeca: 1 });
    expect.soft(await restoreEstoqueFromOS({ storeId, osId })).toMatchObject({ ok: true });
    expect.soft(await estoqueDe(produtoId)).toBe(10);
    // Restauração repetida: nenhuma entrada nova.
    expect.soft(await restoreEstoqueFromOS({ storeId, osId })).toMatchObject({ ok: true });
    expect.soft(await estoqueDe(produtoId)).toBe(10);
    expect.soft(await ledgerEstoqueOS(produtoId)).toEqual({ saidas: 1, qtdSaida: 1, entradas: 1, qtdEntrada: 1 });
  });

  it("mesmo produto em duas peças legítimas (1 + 1): consumo 2 e restauração 2 — quantidades iguais não são deduplicadas", async () => {
    const storeId = await novaLoja();
    const { osId, produtoId } = await novaOSComPeca(storeId, [1, 1]);
    await syncOperacaoItensComOrcamento(storeId, osId);
    expect(await itens(osId)).toEqual({ rascunho: 2, ledger: 0, qtdPeca: 2 });
    expect(await consumeEstoqueFromOS({ storeId, osId })).toMatchObject({ ok: true, status: "consumed" });
    expect.soft(await estoqueDe(produtoId)).toBe(8);
    expect.soft(await itens(osId)).toEqual({ rascunho: 0, ledger: 1, qtdPeca: 2 });
    expect.soft(await restoreEstoqueFromOS({ storeId, osId })).toMatchObject({ ok: true });
    expect.soft(await estoqueDe(produtoId)).toBe(10);
    expect.soft(await ledgerEstoqueOS(produtoId)).toEqual({ saidas: 1, qtdSaida: 2, entradas: 1, qtdEntrada: 2 });
  });

  it("entrega trava a OS → sync lida antes recomeça: ledger consumido intacto, nenhum rascunho stale; restauração devolve exatamente o consumido", async () => {
    const storeId = await novaLoja();
    const { osId, produtoId } = await novaOSComPeca(storeId);
    const pausa = armarPausa({
      modelo: "ordemServico",
      metodos: ["update"],
      quando: (a) => (a.data as Payload | undefined)?.payload?.estoqueConsumido === true,
    });
    const pC = consumeEstoqueFromOS({ storeId, osId });
    await pausa.naBarreira;
    const pS = syncOperacaoItensComOrcamento(storeId, osId);
    const oS = await concluiuOuEsperaTrava(pS);
    pausa.liberar();
    const [rC, rS] = await Promise.allSettled([pC, pS]);
    console.info(`[P2-T4 stale] sync=${oS} · C=${JSON.stringify(rC.status === "fulfilled" ? rC.value : String(rC.reason))} · S=${rS.status}`);
    naoEhDeadlock(rC);
    naoEhDeadlock(rS);
    expect.soft(rC).toMatchObject({ status: "fulfilled", value: { ok: true, status: "consumed" } });
    expect.soft(rS.status).toBe("fulfilled");
    expect.soft(await itens(osId)).toEqual({ rascunho: 0, ledger: 1, qtdPeca: 1 });
    expect.soft((await prisma.produto.findUniqueOrThrow({ where: { id: produtoId } })).stock).toBe(9);
    expect.soft(await restoreEstoqueFromOS({ storeId, osId })).toMatchObject({ ok: true });
    expect.soft((await prisma.produto.findUniqueOrThrow({ where: { id: produtoId } })).stock).toBe(10);
    expect.soft(await ledgerEstoqueOS(produtoId)).toEqual({ saidas: 1, qtdSaida: 1, entradas: 1, qtdEntrada: 1 });
  });
});

// ─── P2-T5 · intenção de orçamento sobre o orçamento MAIS RECENTE ──────────────

const S500 = { servicos: [{ id: "s-500", descricao: "Serviço 500", valor: 500, desconto: 0 }], pecas: [], desconto: 0 } as never;

const pausaLeituraDaOS = (osId: string) =>
  armarPausa({
    modelo: "ordemServico",
    metodos: ["findFirst", "findMany", "findUnique"],
    fase: "depois",
    // Leitura que devolve ESTA OS (com ou sem `id` no select): o payload sintético carrega o id.
    quando: (_a, r) => JSON.stringify(r ?? null).includes(osId),
  });

async function conferirOrcamentoETitulo(storeId: string, osId: string, totalEsperado: number, statusEsperado: string) {
  const s = await estado(storeId, osId);
  const orc = s.payload.orcamento as Payload;
  console.info(`[P2-T5] orçamento=${orc?.status}/${orc?.total} valorTotal=${s.os.valorTotal} faturamento=${s.payload.faturamentoTotal ?? "-"} título=${s.titulo?.valor ?? "-"}/${s.titulo?.status ?? "-"}`);
  expect.soft(orc?.status).toBe(statusEsperado);
  expect.soft(orc?.total).toBe(totalEsperado);
  expect.soft(s.os.valorTotal).toBe(totalEsperado);
  if (statusEsperado === "aprovado" && s.payload.faturamentoPendente === true) {
    expect.soft(s.payload.faturamentoTotal).toBe(totalEsperado);
    expect.soft(s.titulo?.valor).toBe(totalEsperado);
  }
  expect.soft(s.payload.campoDesconhecidoQA).toEqual({ preservar: true });
  return s;
}

const HUB = [
  { kind: "aprovar_orcamento", status: "aguardando_aprovacao", orc: "enviado", final: "aprovado" },
  { kind: "enviar_orcamento", status: "diagnostico", orc: "rascunho", final: "enviado" },
  { kind: "reprovar_orcamento", status: "aguardando_aprovacao", orc: "enviado", final: "recusado" },
] as const;

describe("P2-T5 · hub (aprovar/enviar/recusar) × nova edição do orçamento", () => {
  for (const h of HUB) {
    it(`${h.kind} · leitura do hub antes da edição 500: a intenção vale sobre o 500 (orçamento, valorTotal e título)`, async () => {
      const storeId = await novaLoja();
      const osId = await novaOS(storeId, { status: h.status, operacaoStatusV3: undefined, orcamento: orcamento(400, h.orc) });
      const pausa = pausaLeituraDaOS(osId);
      const pA = applyOperacaoHubAcao(storeId, osId, { kind: h.kind } as never);
      await pausa.naBarreira;
      const pB = salvarOrcamentoV3(storeId, osId, S500);
      const observado = await concluiuOuEsperaTrava(pB);
      pausa.liberar();
      const [rA, rB] = await Promise.allSettled([pA, pB]);
      console.info(`[P2-T5 hub] ${h.kind} A_le_antes · concorrente=${observado} · A=${rA.status} · B=${rB.status === "fulfilled" ? "ok" : String((rB.reason as Error)?.message)}`);
      naoEhDeadlock(rA);
      naoEhDeadlock(rB);
      expect(rA.status).toBe("fulfilled");
      // Edição aceita ⇒ o 500 sobrevive; edição recusada (orçamento já decidido) ⇒ 400.
      await conferirOrcamentoETitulo(storeId, osId, rB.status === "fulfilled" ? 500 : 400, h.final);
    });

    it(`${h.kind} · edição 500 trava antes: hub espera e aplica a intenção sobre o 500`, async () => {
      const storeId = await novaLoja();
      const osId = await novaOS(storeId, { status: h.status, operacaoStatusV3: undefined, orcamento: orcamento(400, h.orc) });
      const pausa = armarPausa({
        modelo: "ordemServico",
        metodos: ["update"],
        quando: (a) => (a.data as Payload | undefined)?.payload?.orcamento?.total === 500,
      });
      const pB = salvarOrcamentoV3(storeId, osId, S500);
      await pausa.naBarreira;
      const pA = applyOperacaoHubAcao(storeId, osId, { kind: h.kind } as never);
      const observado = await concluiuOuEsperaTrava(pA);
      pausa.liberar();
      const [rA, rB] = await Promise.allSettled([pA, pB]);
      console.info(`[P2-T5 hub] ${h.kind} B_trava_antes · concorrente=${observado} · A=${rA.status === "fulfilled" ? "ok" : String((rA.reason as Error)?.message)}`);
      naoEhDeadlock(rA);
      naoEhDeadlock(rB);
      expect(rB.status).toBe("fulfilled");
      expect(rA.status).toBe("fulfilled");
      await conferirOrcamentoETitulo(storeId, osId, 500, h.final);
    });
  }
});

describe("P2-T5 · gerarOrcamentoDaOS (materialização) × orçamento real criado no meio", () => {
  const osSemOrcamento = (storeId: string) =>
    novaOS(storeId, {
      status: "diagnostico",
      operacaoStatusV3: undefined,
      orcamento: undefined,
      servicosCatalogo: [{ descricao: "Troca de tela", valorVenda: 400 }],
      pecas: [],
    });

  it("A lê 'sem orçamento real' → B materializa/edita/aprova 500 → A não substitui o vigente", async () => {
    const storeId = await novaLoja();
    const osId = await osSemOrcamento(storeId);
    const pausa = pausaLeituraDaOS(osId);
    const pA = gerarOrcamentoDaOS(storeId, osId);
    await pausa.naBarreira;
    const pB = (async () => {
      await gerarOrcamentoDaOS(storeId, osId);
      await salvarOrcamentoV3(storeId, osId, S500);
      return aprovarOrcamentoV3(storeId, osId);
    })();
    const observado = await concluiuOuEsperaTrava(pB);
    pausa.liberar();
    const [rA, rB] = await Promise.allSettled([pA, pB]);
    console.info(`[P2-T5 gerar] concorrente=${observado} · A=${rA.status} · B=${rB.status === "fulfilled" ? "ok" : String((rB.reason as Error)?.message)}`);
    naoEhDeadlock(rA);
    naoEhDeadlock(rB);
    expect(rA.status).toBe("fulfilled");
    expect(rB.status).toBe("fulfilled");
    const s = await conferirOrcamentoETitulo(storeId, osId, 500, "aprovado");
    expect.soft(s.payload.faturamentoTotal ?? 500).toBe(500);
    expect.soft(s.timeline.filter((e) => e.tipo === "orcamento_criado")).toHaveLength(1);
  });
});

describe("P2-T5 · gerar cobrança (V2) decide sobre o faturamento MAIS RECENTE", () => {
  it("revisão concorrente trava antes: parcelas e título saem do total vigente (500), nunca do 400 lido antes", async () => {
    const storeId = await novaLoja();
    const osId = await novaOSFaturavelComTitulo(storeId);
    const pausa = armarPausa({
      modelo: "ordemServico",
      metodos: ["update"],
      quando: (a) => (a.data as Payload | undefined)?.payload?.faturamentoTotal === 500,
    });
    const pB = updateOSPayload(storeId, osId, { faturamentoTotal: 500 } as never);
    await pausa.naBarreira;
    const pA = gerarCobrancaOSAction(storeId, osId, { modo: "parcelado", numParcelas: 2 });
    const observado = await concluiuOuEsperaTrava(pA);
    pausa.liberar();
    const [rA, rB] = await Promise.allSettled([pA, pB]);
    console.info(`[P2-T5 cobrança] concorrente=${observado} · A=${rA.status} · B=${rB.status}`);
    naoEhDeadlock(rA);
    naoEhDeadlock(rB);
    expect(rA.status).toBe("fulfilled");
    expect(rB.status).toBe("fulfilled");
    const s = await estado(storeId, osId);
    const parcelas = (s.payload.faturamentoParcelas ?? []) as Payload[];
    expect.soft(parcelas.map((p) => p.valor)).toEqual([250, 250]);
    expect.soft(s.titulo?.valor).toBe(500);
    expect.soft(((s.titulo?.payload as Payload | undefined)?.parcelas as Payload[] | undefined)?.map((p) => p.valor)).toEqual([250, 250]);
    expect.soft(s.titulos).toHaveLength(1);
  });
});
