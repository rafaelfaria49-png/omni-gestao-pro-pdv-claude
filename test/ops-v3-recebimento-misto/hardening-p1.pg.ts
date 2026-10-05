/**
 * OPS-RECEBIMENTO-MISTO-P1-HARDENING-001 — PostgreSQL REAL (local, descartável).
 *
 * P1-B: um writer operacional (prioridade/técnico/localização) e a recusa TERMINAL de uma chave
 * do recebimento misto disputam o MESMO `OrdemServico.payload`. Intercalação DETERMINÍSTICA: o
 * cliente Prisma é envolvido só para PAUSAR a gravação escolhida da OS numa barreira (nada é
 * simulado: as actions e as travas são as reais). A espera da outra transação é observada no
 * próprio banco (`pg_stat_activity`), nunca por sleep.
 *
 * P1-A (servidor): replay equivalente (PIX 100 = PIX 50 + PIX 50) e compatibilidade estrita com
 * fingerprints gravados ANTES do fix.
 *
 * Só dados sintéticos (lojas `qa-hard-*`); só `@/auth` e `next/cache` são simulados.
 */
import { createHash } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";

const sessao = vi.hoisted(() => ({ id: "qa-hard-admin", name: "Operador QA", role: "ADMIN" }));
vi.mock("@/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: sessao.id, name: sessao.name, role: sessao.role, storeAccess: "all" } })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/** Pausa UMA gravação de `ordemServico.update/updateMany` (cliente global ou `tx`) numa barreira. */
const intercept = vi.hoisted(() => ({
  pausa: null as null | { quando: (args: unknown) => boolean; chegou: () => void; barreira: Promise<void> },
}));
vi.mock("@/lib/prisma", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/prisma")>();
  const envolverDelegate = (delegate: object) =>
    new Proxy(delegate, {
      get(t, p) {
        const fn = Reflect.get(t, p);
        if ((p === "update" || p === "updateMany") && typeof fn === "function") {
          return async (args: unknown) => {
            const pausa = intercept.pausa;
            if (pausa && pausa.quando(args)) {
              intercept.pausa = null;
              pausa.chegou();
              await pausa.barreira;
            }
            return (fn as (a: unknown) => unknown).call(t, args);
          };
        }
        return typeof fn === "function" ? (fn as (...a: unknown[]) => unknown).bind(t) : fn;
      },
    });
  const envolverCliente = (client: object): object =>
    new Proxy(client, {
      get(t, p) {
        const v = Reflect.get(t, p);
        if (p === "ordemServico" && v && typeof v === "object") return envolverDelegate(v);
        if (p === "$transaction" && typeof v === "function") {
          return (arg: unknown, opts?: unknown) =>
            typeof arg === "function"
              ? (v as (...a: unknown[]) => unknown).call(t, (tx: object) => (arg as (tx: object) => unknown)(envolverCliente(tx)), opts)
              : (v as (...a: unknown[]) => unknown).call(t, arg, opts);
        }
        return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(t) : v;
      },
    });
  return { ...real, prisma: envolverCliente(real.prisma) as typeof real.prisma };
});

import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import {
  estornarRecebimentoOSV3,
  lancarOSAPrazoV3,
  receberOSV3,
  registrarRecebimentoMistoOSV3,
  type RegistrarRecebimentoMistoInputV3,
} from "@/lib/operacoes-v3/pdv-servico-actions";
import { atribuirTecnicoV3, definirLocalFisicoV3, definirPrioridadeV3 } from "@/lib/operacoes-v3/producao-actions";
import { hojeLojaV3 } from "@/lib/operacoes-v3/recebimento-misto-model";
import { localKeyContaReceberOSV3 } from "@/lib/operacoes-v3/payment-model";
import { buildContaReceberAuditTrail } from "@/lib/financeiro/services/contas-receber-service";
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
  const id = `qa-hard-${SUFIXO}-${++seq}`;
  await prisma.store.create({ data: { id, name: `Loja QA hardening ${seq}` } });
  return id;
}

async function novaOS(storeId: string): Promise<string> {
  const n = ++seq;
  const row = await prisma.ordemServico.create({
    data: {
      storeId,
      numero: `OS-QA-H-${SUFIXO}-${n}`,
      equipamento: "Samsung A54",
      defeito: "Tela quebrada",
      valorTotal: 400,
      payload: {
        codigo: `OS-QA-H-${n}`,
        storeId,
        cliente: { nome: `Cliente QA ${n}` },
        equipamento: { tipo: "Smartphone", marca: "Samsung", modelo: "A54" },
        status: "pronta",
        operacaoStatusV3: "pronta",
        orcamento: { id: `orc-${n}`, status: "aprovado", pecas: [], servicos: [{ id: `s-${n}`, descricao: "Troca de tela", valor: 400 }], desconto: 0, total: 400, criadoEm: "2026-10-01T12:00:00.000Z" },
        valorTotal: 400,
        aberturaV3: { defeitoRelatado: "Tela quebrada", recepcao: { recebidoPor: "Balcão QA" } },
        campoDesconhecidoQA: { preservar: true },
        timeline: [{ id: `ev-abertura-${n}`, tipo: "os_criada", autor: "QA", autorTipo: "usuario", conteudo: "OS aberta", criadoEm: "2026-10-01T12:00:00.000Z" }],
      } as Prisma.InputJsonValue,
    },
  });
  return row.id;
}

async function abrirCaixa(storeId: string): Promise<string> {
  return (await prisma.sessaoCaixa.create({ data: { storeId, operador: "QA", status: "ABERTA" } })).id;
}

async function fecharPeriodo(storeId: string): Promise<string> {
  const [ano, mes] = new Date().toISOString().slice(0, 7).split("-").map(Number);
  const f = await prisma.fechamentoFinanceiro.create({
    data: { storeId, tipo: "mensal", dataReferencia: `${ano}-${String(mes).padStart(2, "0")}-01`, mes: mes!, ano: ano!, status: "fechado" },
  });
  return f.id;
}

let opSeq = 0;
const opId = () => `qa-hard-op-${SUFIXO}-${++opSeq}`;

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
    payload,
    historico,
    saldo,
    pagamentos: historico.filter((e) => e.tipo === "pagamento" || e.tipo === "liquidacao"),
    marcadores: historico.filter((e) => e.tipo === "a_prazo_autorizado"),
    recusas: (Array.isArray(payload.recebimentoMistoRecusasV3) ? payload.recebimentoMistoRecusasV3 : []) as Payload[],
    timeline: (payload.timeline ?? []) as Payload[],
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

/** Arma a pausa da próxima gravação da OS que satisfizer `quando`. */
function armarPausa(quando: (payload: Payload) => boolean) {
  let liberar!: () => void;
  const barreira = new Promise<void>((r) => (liberar = r));
  let chegou!: () => void;
  const naBarreira = new Promise<void>((r) => (chegou = r));
  intercept.pausa = {
    quando: (args) => {
      const payload = (args as { data?: { payload?: unknown } } | null)?.data?.payload;
      return !!payload && typeof payload === "object" && quando(payload as Payload);
    },
    chegou,
    barreira,
  };
  return { naBarreira, liberar };
}

/** Resolve quando a promessa termina OU quando outra transação está esperando trava no banco. */
async function concluiuOuEsperaTrava(p: Promise<unknown>): Promise<"concluiu" | "esperando_trava"> {
  return Promise.race([p.then(() => "concluiu" as const, () => "concluiu" as const), esperarBloqueioNoBanco().then(() => "esperando_trava" as const)]);
}

const temRecusa = (operacaoId: string) => (p: Payload) =>
  Array.isArray(p.recebimentoMistoRecusasV3) && p.recebimentoMistoRecusasV3.some((r: Payload) => r?.operacaoId === operacaoId);

afterAll(async () => {
  intercept.pausa = null;
  await prisma.$disconnect();
});

// ─── P1-B: writer operacional × recusa terminal ──────────────────────────────

const WRITERS = [
  {
    nome: "prioridade",
    executar: (s: string, o: string) => definirPrioridadeV3(s, o, "urgente"),
    marca: (p: Payload) => p.prioridadeV3 === "urgente",
    conferir: (p: Payload) => {
      expect(p.prioridadeV3).toBe("urgente");
      expect(p.timeline.some((e: Payload) => e.metadata?.evento === "prioridade_alterada")).toBe(true);
    },
  },
  {
    nome: "técnico",
    executar: (s: string, o: string) => atribuirTecnicoV3(s, o, { nome: "Tecnico QA Hard" }),
    marca: (p: Payload) => p.tecnico?.nome === "Tecnico QA Hard",
    conferir: (p: Payload) => {
      expect(p.tecnico).toMatchObject({ nome: "Tecnico QA Hard" });
      expect(p.timeline.some((e: Payload) => e.tipo === "atribuicao_tecnico")).toBe(true);
    },
  },
  {
    nome: "localização",
    executar: (s: string, o: string) => definirLocalFisicoV3(s, o, "bancada"),
    marca: (p: Payload) => p.aberturaV3?.recepcao?.localFisico === "bancada",
    conferir: (p: Payload) => {
      expect(p.aberturaV3).toMatchObject({ defeitoRelatado: "Tela quebrada", recepcao: { recebidoPor: "Balcão QA", localFisico: "bancada" } });
      expect(p.timeline.some((e: Payload) => e.metadata?.evento === "local_fisico_alterado")).toBe(true);
    },
  },
] as const;

type Ordem = "writer_le_antes_da_recusa" | "recusa_trava_antes_do_writer";

async function corrida(ordem: Ordem, writer: (typeof WRITERS)[number]) {
  const storeId = await novaLoja();
  const osId = await novaOS(storeId);
  const sessaoId = await abrirCaixa(storeId);
  const fechamentoId = await fecharPeriodo(storeId);
  const K = opId();
  const input: RegistrarRecebimentoMistoInputV3 = {
    operacaoId: K,
    sessaoId,
    pagamentosAgora: [{ forma: "debito", valor: 350 }],
    saldoAPrazo: { valor: 50, vencimento: VENC },
    saldoEsperado: 400,
  };

  let pWriter: Promise<unknown>;
  let pRecusa: Promise<Awaited<ReturnType<typeof registrarRecebimentoMistoOSV3>>>;
  let observado: string;
  if (ordem === "writer_le_antes_da_recusa") {
    // C lê o payload e para no momento de gravar; B decide a recusa terminal de K.
    const pausa = armarPausa(writer.marca);
    pWriter = writer.executar(storeId, osId);
    await pausa.naBarreira;
    pRecusa = registrarRecebimentoMistoOSV3(storeId, osId, input);
    observado = await concluiuOuEsperaTrava(pRecusa);
    pausa.liberar();
  } else {
    // B já travou a OS e está gravando a recusa; C começa no meio.
    const pausa = armarPausa(temRecusa(K));
    pRecusa = registrarRecebimentoMistoOSV3(storeId, osId, input);
    await pausa.naBarreira;
    pWriter = writer.executar(storeId, osId);
    observado = await concluiuOuEsperaTrava(pWriter);
    pausa.liberar();
  }
  const [rW, rR] = await Promise.allSettled([pWriter, pRecusa]);
  expect(rW.status).toBe("fulfilled");
  expect(rR.status).toBe("fulfilled");
  const recusa = (rR as PromiseFulfilledResult<Awaited<typeof pRecusa>>).value;
  expect(recusa).toMatchObject({ ok: false, code: "periodo_fechado", naoRegistrada: true });

  const s = await estado(storeId, osId);
  // A recusa terminal de K E a alteração operacional sobrevivem.
  expect.soft(s.recusas).toEqual([expect.objectContaining({ operacaoId: K, code: "periodo_fechado" })]);
  writer.conferir(s.payload);
  expect(s.timeline[0]).toMatchObject({ tipo: "os_criada" });
  expect(s.payload.campoDesconhecidoQA).toEqual({ preservar: true });
  expect(s.payload.orcamento).toMatchObject({ total: 400, status: "aprovado" });
  expect(s.titulos).toHaveLength(0);
  expect(s.caixa).toHaveLength(0);
  expect(s.movs).toHaveLength(0);

  // Depois da corrida: período reaberto, a MESMA chave continua recusada e NÃO registra dinheiro.
  await prisma.fechamentoFinanceiro.update({ where: { id: fechamentoId }, data: { status: "reaberto" } });
  const replay = await registrarRecebimentoMistoOSV3(storeId, osId, input);
  const depois = await estado(storeId, osId);
  return { observado, replay, depois, writerAntes: s.payload };
}

describe("P1-B · writer operacional não apaga recusa terminal (e vice-versa)", () => {
  for (const ordem of ["writer_le_antes_da_recusa", "recusa_trava_antes_do_writer"] as const) {
    for (const writer of WRITERS) {
      it(`T12/T13/T14 · ${ordem} · ${writer.nome}: recusa K + alteração preservadas; K segue recusada; 0 título/histórico/mov/caixa`, async () => {
        const { observado, replay, depois } = await corrida(ordem, writer);
        console.info(`[P1-B] ${ordem} · ${writer.nome} · concorrente=${observado}`);
        expect.soft(replay).toMatchObject({ ok: false, code: "periodo_fechado", naoRegistrada: true });
        expect.soft(depois.recusas).toHaveLength(1);
        writer.conferir(depois.payload);
        // T15/T16/T17: nenhum título, pagamento, marcador, movimentação ou caixa por causa de K.
        expect.soft(depois.titulos).toHaveLength(0);
        expect.soft(depois.pagamentos).toHaveLength(0);
        expect.soft(depois.marcadores).toHaveLength(0);
        expect.soft(depois.movs).toHaveLength(0);
        expect.soft(depois.caixa).toHaveLength(0);
        expect(depois.timeline.filter((e: Payload) => e.metadata?.operacaoId)).toHaveLength(0);
      });
    }
  }
});

// ─── P1-A no servidor: replay equivalente + compatibilidade legada ─────────────

/** Fingerprint do recebimento canônico EXATAMENTE como era gravado antes do fix (v1, sem agregar). */
function fingerprintCanonicoPreFix(storeId: string, osId: string, sessaoId: string, linhas: Array<{ forma: string; valor: number }>): string {
  const ordenadas = linhas
    .map((l) => [String(l.forma ?? ""), Math.round(Number(l.valor) * 100)] as [string, number])
    .filter(([, c]) => Number.isFinite(c) && c > 0)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]));
  const conteudo = JSON.stringify({ v: 1, sessaoId: sessaoId.trim(), linhas: ordenadas });
  return createHash("sha256").update(JSON.stringify([storeId, osId, conteudo])).digest("hex");
}

/** Reescreve o fingerprint das operações de caixa de `operacaoId` para o formato pré-fix (simula operação antiga). */
async function gravarComoPreFix(storeId: string, osId: string, sessaoId: string, operacaoId: string, linhas: Array<{ forma: string; valor: number }>) {
  const ops = await prisma.caixaOperacao.findMany({ where: { storeId, payload: { path: ["operacaoId"], equals: operacaoId } } });
  expect(ops.length).toBeGreaterThan(0);
  for (const op of ops) {
    await prisma.caixaOperacao.update({
      where: { id: op.id },
      data: { payload: { ...(op.payload as Payload), requestFingerprint: fingerprintCanonicoPreFix(storeId, osId, sessaoId, linhas) } as Prisma.InputJsonValue },
    });
  }
}

describe("P1-A · servidor: identidade econômica agregada", () => {
  it("T09: PIX 100 gravado, reenvio como PIX 50 + PIX 50 (saldo visto 300) → replay; 1 pagamento, 1 caixa, 1 movimentação", async () => {
    const storeId = await novaLoja();
    const osId = await novaOS(storeId);
    const sessaoId = await abrirCaixa(storeId);
    const operacaoId = opId();
    const a = await receberOSV3(storeId, osId, { valor: 100, forma: "pix", sessaoId, operacaoId, saldoEsperado: 400 });
    expect(a.jaRegistrado).toBe(false);
    const b = await receberOSV3(storeId, osId, { linhas: [{ forma: "pix", valor: 50 }, { forma: "pix", valor: 50 }], sessaoId, operacaoId, saldoEsperado: 300 });
    expect(b).toMatchObject({ jaRegistrado: true, operacaoId, valorRecebido: 100 });
    const c = await receberOSV3(storeId, osId, { linhas: [{ forma: "pix", valor: 20 }, { forma: "pix", valor: 30 }, { forma: "pix", valor: 50 }], sessaoId, operacaoId });
    expect(c.jaRegistrado).toBe(true);
    const s = await estado(storeId, osId);
    expect(s.pagamentos.map((e) => e.valor)).toEqual([100]);
    expect(s.caixa.map((x) => x.valor)).toEqual([100]);
    expect(s.movs.map((m) => m.valor)).toEqual([100]);
    expect(s.saldo).toBe(300);
    expect(s.timeline.filter((e) => e.tipo === "operacao_cobranca_gerada")).toHaveLength(1);
    // Recebimento NOVO legítimo sobre o novo saldo (outra chave) continua permitido.
    const d = await receberOSV3(storeId, osId, { valor: 20, forma: "pix", sessaoId, operacaoId: opId(), saldoEsperado: 300 });
    expect(d.jaRegistrado).toBe(false);
    expect((await estado(storeId, osId)).pagamentos.map((e) => e.valor)).toEqual([100, 20]);
  });

  it("T10/T11: fingerprint PRÉ-FIX — replay simples e split repetido reconhecidos; conteúdo, sessão ou valor diferentes → conflito", async () => {
    const storeId = await novaLoja();
    const osId = await novaOS(storeId);
    const sessaoId = await abrirCaixa(storeId);
    const outraSessao = await abrirCaixa(storeId);

    // A. operação antiga simples (PIX 100) → replay depois do deploy.
    const simples = opId();
    await receberOSV3(storeId, osId, { valor: 100, forma: "pix", sessaoId, operacaoId: simples, saldoEsperado: 400 });
    await gravarComoPreFix(storeId, osId, sessaoId, simples, [{ forma: "pix", valor: 100 }]);
    expect(await receberOSV3(storeId, osId, { valor: 100, forma: "pix", sessaoId, operacaoId: simples })).toMatchObject({ jaRegistrado: true, valorRecebido: 100 });

    // B. operação antiga com split repetido (PIX 50 + PIX 50) → replay da MESMA representação.
    const split = opId();
    await receberOSV3(storeId, osId, { linhas: [{ forma: "pix", valor: 50 }, { forma: "pix", valor: 50 }], sessaoId, operacaoId: split, saldoEsperado: 300 });
    await gravarComoPreFix(storeId, osId, sessaoId, split, [{ forma: "pix", valor: 50 }, { forma: "pix", valor: 50 }]);
    expect(await receberOSV3(storeId, osId, { linhas: [{ forma: "pix", valor: 50 }, { forma: "pix", valor: 50 }], sessaoId, operacaoId: split })).toMatchObject({
      jaRegistrado: true,
      valorRecebido: 100,
    });

    // C. chave antiga com conteúdo realmente diferente → conflito.
    await expect(receberOSV3(storeId, osId, { valor: 100, forma: "debito", sessaoId, operacaoId: simples })).rejects.toThrow(/outros valores/);
    // D. sessão diferente → conflito (nunca uma segunda baixa com a mesma chave).
    await expect(receberOSV3(storeId, osId, { valor: 100, forma: "pix", sessaoId: outraSessao, operacaoId: simples, saldoEsperado: 200 })).rejects.toThrow(
      /outros valores/,
    );
    // E. valor diferente (1 centavo) → conflito.
    await expect(receberOSV3(storeId, osId, { valor: 99.99, forma: "pix", sessaoId, operacaoId: simples })).rejects.toThrow(/outros valores/);

    const s = await estado(storeId, osId);
    expect(s.pagamentos.map((e) => e.valor)).toEqual([100, 100]);
    expect(s.caixa.map((x) => x.valor)).toEqual([100, 50, 50]);
    expect(s.movs).toHaveLength(2);
    expect(s.saldo).toBe(200);
  });

  it("misto: fingerprint PRÉ-FIX do marcador é reconhecido; PIX 50 + PIX 50 = PIX 100 na mesma chave; outro conteúdo → conflito", async () => {
    const storeId = await novaLoja();
    const osId = await novaOS(storeId);
    const sessaoId = await abrirCaixa(storeId);
    const input: RegistrarRecebimentoMistoInputV3 = {
      operacaoId: opId(),
      sessaoId,
      pagamentosAgora: [{ forma: "pix", valor: 50 }, { forma: "pix", valor: 50 }],
      saldoAPrazo: { valor: 300, vencimento: VENC },
      saldoEsperado: 400,
    };
    expect(await registrarRecebimentoMistoOSV3(storeId, osId, input)).toMatchObject({ ok: true, jaRegistrado: false });
    // Representação agregada equivalente: replay.
    expect(await registrarRecebimentoMistoOSV3(storeId, osId, { ...input, pagamentosAgora: [{ forma: "pix", valor: 100 }] })).toMatchObject({ ok: true, jaRegistrado: true });

    // Simula marcador gravado ANTES do fix (assinatura v1, linhas sem agregar).
    const v1 = createHash("sha256")
      .update(
        JSON.stringify({
          v: 1,
          storeId,
          osId,
          sessaoId,
          pagamentosAgora: [{ forma: "pix", centavos: 5000 }, { forma: "pix", centavos: 5000 }],
          aPrazo: { centavos: 30000, vencimento: VENC, observacao: null },
          saldoEsperadoCentavos: 40000,
          intencao: null,
          observacao: null,
        }),
      )
      .digest("hex");
    const titulo = (await estado(storeId, osId)).titulo!;
    const tp = titulo.payload as Payload;
    await prisma.contaReceberTitulo.update({
      where: { id: titulo.id },
      data: { payload: { ...tp, historico: tp.historico.map((e: Payload) => (e.operacaoId === input.operacaoId ? { ...e, requestFingerprint: v1 } : e)) } as Prisma.InputJsonValue },
    });
    expect(await registrarRecebimentoMistoOSV3(storeId, osId, input)).toMatchObject({ ok: true, jaRegistrado: true });
    expect(await registrarRecebimentoMistoOSV3(storeId, osId, { ...input, pagamentosAgora: [{ forma: "debito", valor: 100 }] })).toMatchObject({
      ok: false,
      code: "idempotencia_conflito",
    });
    const s = await estado(storeId, osId);
    expect(s.pagamentos.map((e) => e.valor)).toEqual([100]);
    expect(s.marcadores).toHaveLength(1);
    expect(s.caixa.map((x) => x.valor)).toEqual([50, 50]);
    expect(s.movs).toHaveLength(1);
  });
});

// ─── sem ciclo de travas entre os writers ──────────────────────────────────────

function ehDeadlockOuTimeout(e: unknown): boolean {
  const msg = e instanceof Error ? `${e.message} ${(e as { code?: string }).code ?? ""}` : String(e);
  return /deadlock|40P01|P2034|P2028|Transaction already closed|timed out|expired/i.test(msg);
}

describe("travas: normal × misto × estorno × a prazo × operacional", () => {
  it("todos disputando a MESMA OS (e o mesmo caixa) com uma trava segurada: nenhum deadlock/timeout, efeitos coerentes", async () => {
    for (let rodada = 0; rodada < 3; rodada++) {
      const storeId = await novaLoja();
      const osId = await novaOS(storeId);
      const sessaoId = await abrirCaixa(storeId);
      // Estado com algo para estornar.
      await receberOSV3(storeId, osId, { valor: 50, forma: "dinheiro", sessaoId, operacaoId: opId(), saldoEsperado: 400 });

      // Uma transação segura a linha da OS: todos enfileiram no banco ao mesmo tempo.
      let soltar!: () => void;
      const segurando = new Promise<void>((r) => (soltar = r));
      let pegou!: () => void;
      const travada = new Promise<void>((r) => (pegou = r));
      const trava = prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "ordens_servico" WHERE "id" = ${osId} FOR UPDATE`;
          pegou();
          await segurando;
        },
        { maxWait: 10_000, timeout: 60_000 },
      );
      await travada;
      const ops: Array<[string, Promise<unknown>]> = [
        ["normal", receberOSV3(storeId, osId, { valor: 10, forma: "pix", sessaoId, operacaoId: opId() })],
        ["misto", registrarRecebimentoMistoOSV3(storeId, osId, { operacaoId: opId(), sessaoId, pagamentosAgora: [{ forma: "debito", valor: 10 }], saldoAPrazo: { valor: 340, vencimento: VENC }, saldoEsperado: 350 })],
        ["estorno", estornarRecebimentoOSV3(storeId, osId, { sessaoId, motivo: "QA corrida" })],
        ["a_prazo", lancarOSAPrazoV3(storeId, osId, { vencimento: VENC })],
        ["prioridade", definirPrioridadeV3(storeId, osId, rodada % 2 ? "alta" : "urgente")],
        ["tecnico", atribuirTecnicoV3(storeId, osId, { nome: `Tecnico QA ${rodada}` })],
        ["local", definirLocalFisicoV3(storeId, osId, "bancada")],
      ];
      await esperarBloqueioNoBanco(15_000, 3);
      soltar();
      await trava;
      const resultados = await Promise.allSettled(ops.map(([, p]) => p));
      const falhas = resultados.flatMap((r, i) => (r.status === "rejected" ? [[ops[i]![0], r.reason] as const] : []));
      for (const [nome, motivo] of falhas) {
        expect(ehDeadlockOuTimeout(motivo), `${nome}: ${motivo instanceof Error ? motivo.message : String(motivo)}`).toBe(false);
      }
      // Writers operacionais nunca falham por concorrência.
      for (const nome of ["prioridade", "tecnico", "local"]) {
        expect(falhas.find(([n]) => n === nome)).toBeUndefined();
      }
      const s = await estado(storeId, osId);
      expect(s.payload.tecnico).toMatchObject({ nome: `Tecnico QA ${rodada}` });
      expect(s.payload.aberturaV3?.recepcao?.localFisico).toBe("bancada");
      expect(s.payload.campoDesconhecidoQA).toEqual({ preservar: true });
      expect(s.titulos).toHaveLength(1);
      // Coerência do ledger: saldo = 400 − Σ pagamentos líquidos.
      const liquido = s.historico.reduce((acc, e) => {
        if (e.tipo === "pagamento" || e.tipo === "liquidacao") return acc + Number(e.valor);
        if (e.tipo === "estorno_pagamento") return acc - Number(e.valor);
        return acc;
      }, 0);
      expect(s.saldo).toBeCloseTo(400 - liquido, 2);
      // Cada pagamento novo do histórico corresponde a UMA movimentação (nenhuma em dobro).
      expect(s.movs.length).toBe(s.pagamentos.length);
    }
  });
});
