// @vitest-environment node
//
// OPS-V4-FLUXO-CURTO-007 — PostgreSQL REAL, local e descartável (T53–T57 no servidor).
// Actions REAIS: abrirRetornoV3 / finalizarRetornoV3 / buscarOrigensRetornoV3 /
// lerOrigemRetornoV3 → criarOSEnterpriseV3 → createOS (numeração, auditoria, payload)
// e o guard REAL de loja/permissão (requireEnterpriseWith + canAccessStore). Identidade
// só no seam de sessão (stub de @/auth). Intercalação DETERMINÍSTICA: o cliente Prisma é
// envolvido só para PAUSAR (ou falhar uma vez) uma gravação escolhida; a espera da outra
// operação é observada no banco (pg_stat_activity), nunca por sleep. Um SEGUNDO
// PrismaClient (outro pool, outra sessão PostgreSQL) faz o papel de outro processo.
// Ausência de ambiente = BLOQUEIO_EXPLICITO_PG (nunca skip). Massa sintética.
import { afterAll, describe, expect, it, vi } from "vitest";

const sessao = vi.hoisted(() => ({
  user: { id: "qa-007", name: "Operador QA 007", role: "ADMIN", storeAccess: "all" as string, allowedStoreIds: [] as string[] },
}));
vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { ...sessao.user } })) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

type Ponto = { quando: (op: "create" | "update", args: any) => boolean; acao: "pausar" | "falhar"; chegou: () => void; barreira: Promise<void> };
const intercept = vi.hoisted(() => ({ pontos: [] as Ponto[] }));
vi.mock("@/lib/prisma", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/prisma")>();
  const envolverDelegate = (delegate: object) =>
    new Proxy(delegate, {
      get(t, p) {
        const fn = Reflect.get(t, p);
        if ((p === "update" || p === "create") && typeof fn === "function") {
          return async (args: unknown) => {
            const i = intercept.pontos.findIndex((pt) => pt.quando(p as "create" | "update", args));
            if (i >= 0) {
              const [pt] = intercept.pontos.splice(i, 1);
              pt!.chegou();
              if (pt!.acao === "falhar") throw new Error("QA: falha injetada depois da criação");
              await pt!.barreira;
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

import { PrismaClient, type Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { abrirRetornoV3, buscarOrigensRetornoV3, finalizarRetornoV3, lerOrigemRetornoV3 } from "@/lib/operacoes-v3/retorno-actions";
import { lerGarantiaV3, lerRetornosV3, lerVinculoRetornoV3 } from "@/lib/operacoes-v3/pos-venda-model";
import { resolverRetornoParaAutoCloseV3 } from "@/lib/operacoes-v3/retorno-auto-close";
import type { OrdemServico } from "@/types/os";

function exigirBancoLocal(): string {
  const urls = [process.env.OPS_V4_FLUXO_CURTO_TEST_DATABASE_URL, process.env.DATABASE_URL, process.env.DIRECT_URL].map((v) => (v ?? "").trim());
  if (urls.some((v) => !v)) {
    throw new Error("BLOQUEIO_EXPLICITO_PG: configure OPS_V4_FLUXO_CURTO_TEST_DATABASE_URL + DATABASE_URL + DIRECT_URL para o PostgreSQL local descartável.");
  }
  const alvos = urls.map((v) => new URL(v));
  if (alvos.some((u) => !["127.0.0.1", "localhost", "::1", "[::1]"].includes(u.hostname.toLowerCase()))) {
    throw new Error("BLOQUEIO_EXPLICITO_PG: integração só pode usar loopback.");
  }
  const chave = (u: URL) => `${u.hostname}:${u.port}${u.pathname}`;
  if (alvos.some((u) => chave(u) !== chave(alvos[0]!)) || !alvos[0]!.pathname.slice(1).startsWith("ops_v4_fluxo_007_qa")) {
    throw new Error("BLOQUEIO_EXPLICITO_PG: as três URLs devem apontar ao MESMO banco descartável ops_v4_fluxo_007_qa*.");
  }
  return urls[0]!;
}
const URL_BANCO = exigirBancoLocal();
// "Outro processo": pool e sessões PostgreSQL próprios.
const outroProcesso = new PrismaClient({ datasources: { db: { url: URL_BANCO } } });

// ─── massa sintética ─────────────────────────────────────────────────────────
const SUFIXO = Date.now().toString(36);
const ENTRADA = "2026-08-01T12:00:00.000Z";
let seq = 0;
type Payload = Record<string, any>;

afterAll(async () => {
  intercept.pontos = [];
  await outroProcesso.$disconnect();
  await prisma.$disconnect();
});

function comoAdmin() {
  sessao.user = { id: "qa-007", name: "Operador QA 007", role: "ADMIN", storeAccess: "all", allowedStoreIds: [] };
}
function comoOperadorRestrito(lojas: string[], role = "TECNICO") {
  sessao.user = { id: "qa-007-r", name: "Operador Loja A", role, storeAccess: "restricted", allowedStoreIds: lojas };
}

async function novaLoja(): Promise<string> {
  const id = `qa-007-${SUFIXO}-${++seq}`;
  await prisma.store.create({ data: { id, name: `Loja QA 007 ${seq}` } });
  return id;
}

async function novoCliente(storeId: string, nome: string, phone = "(11) 98888-7766"): Promise<string> {
  return (await prisma.cliente.create({ data: { storeId, name: nome, phone } })).id;
}

interface OpcoesOS {
  entregueEm?: string | null;
  status?: string;
  garantia?: Record<string, unknown> | null;
  clienteId?: string | null;
  extra?: Record<string, unknown>;
}

async function novaOS(storeId: string, o: OpcoesOS = {}): Promise<string> {
  const n = ++seq;
  const id = `os-qa-007-${SUFIXO}-${n}`;
  const codigo = `OS-QA-007-${SUFIXO}-${n}`;
  const clienteId = o.clienteId === undefined ? await novoCliente(storeId, `Cliente QA 007 ${n}`) : o.clienteId;
  const entregueEm = o.entregueEm === undefined ? "2026-09-20T12:00:00.000Z" : o.entregueEm;
  const status = o.status ?? (entregueEm ? "entregue" : "em_execucao");
  await prisma.ordemServico.create({
    data: {
      id,
      storeId,
      numero: codigo,
      clienteId: clienteId || null,
      equipamento: "Samsung Galaxy QA7",
      defeito: "Tela quebrada",
      status: status === "entregue" ? "Entregue" : "EmAnalise",
      valorTotal: 300,
      payload: {
        id, codigo, storeId, clienteId: clienteId ?? "", criadoEm: ENTRADA, atualizadoEm: ENTRADA, prioridade: "media", origem: "balcao",
        cliente: { id: clienteId ?? "", nome: `Cliente QA 007 ${n}`, telefone: "(11) 98888-7766" },
        equipamento: { tipo: "Smartphone", marca: "Samsung", modelo: `Galaxy QA7-${n}`, numeroSerie: `35000000000${n}`, acessorios: ["Capa", "Chip"], defeitoRelatado: "Tela quebrada" },
        senhaEquipamento: "1478", senhaEquipamentoTipo: "numerica",
        status: status === "em_execucao" ? "em_execucao" : status, operacaoStatus: status, operacaoStatusV3: status,
        valorTotal: 300,
        servicosCatalogo: [{ servicoId: `s-${n}`, descricao: "Troca de tela", custoInterno: 92, valorVenda: 300, prazoGarantiaDias: 90, termoGarantia: "" }],
        orcamento: { id: `orc-${n}`, status: "aprovado", sintetizado: false, respondidoEm: ENTRADA, criadoEm: ENTRADA, servicos: [{ id: `srv-${n}`, descricao: "Troca de tela", valor: 300 }], pecas: [], desconto: 0, total: 300 },
        pagamentoV3: { status: "quitado", total: 300, recebido: 300 },
        ...(o.garantia === null ? {} : { aberturaV3: { versao: 1, recepcao: { recebidoPor: "Balcão QA", dataEntrada: ENTRADA }, garantiaPrevista: o.garantia ?? { modelo: "tela", label: "Troca de tela", prazoDias: 90 } } }),
        ...(entregueEm ? { entregaV3: { entregueEm, entreguePor: "QA", recebidoPor: "Cliente" } } : {}),
        timeline: [{ id: `ev-${n}`, tipo: "criacao", autor: "QA", autorTipo: "usuario", conteudo: "OS criada.", criadoEm: ENTRADA }],
        ...(o.extra ?? {}),
      } as unknown as Prisma.InputJsonValue,
    },
  });
  return id;
}

async function lerOS(id: string): Promise<Payload> {
  return (await prisma.ordemServico.findUniqueOrThrow({ where: { id } })).payload as Payload;
}
async function filhasDe(storeId: string, origemId: string) {
  const rows = await prisma.ordemServico.findMany({ where: { storeId }, select: { id: true, numero: true, valorTotal: true, status: true, clienteId: true, payload: true } });
  return rows.filter((r) => (r.payload as Payload)?.vinculoRetornoV3?.osOrigemId === origemId);
}
const ativas = (rows: Array<{ payload: unknown }>) => rows.filter((r) => !(r.payload as Payload).vinculoRetornoV3?.descartadoEm);
async function efeitos(storeId: string) {
  const [titulos, caixa, movimentos, vendas, estoque, clientes, garantias] = await Promise.all([
    prisma.contaReceberTitulo.count({ where: { storeId } }),
    prisma.caixaOperacao.count({ where: { storeId } }),
    prisma.movimentacaoFinanceira.count({ where: { storeId } }),
    prisma.venda.count({ where: { storeId } }),
    prisma.movimentacaoEstoque.count({ where: { storeId } }),
    prisma.cliente.count({ where: { storeId } }),
    prisma.garantiaOrdemServico.count({ where: { storeId } }),
  ]);
  return { titulos, caixa, movimentos, vendas, estoque, clientes, garantias };
}

function pausar(quando: Ponto["quando"]) {
  let soltar!: () => void;
  let avisar!: () => void;
  const barreira = new Promise<void>((r) => { soltar = r; });
  const chegou = new Promise<void>((r) => { avisar = r; });
  intercept.pontos.push({ quando, acao: "pausar", chegou: () => avisar(), barreira });
  return { chegou, soltar };
}
function falharUmaVez(quando: Ponto["quando"]) {
  intercept.pontos.push({ quando, acao: "falhar", chegou: () => {}, barreira: Promise.resolve() });
}
/** createOS: a linha nasce com payload `{}` dentro da transação de criação. */
const criacaoDaFilha = (op: "create" | "update", args: any) => op === "create" && args?.data?.payload && Object.keys(args.data.payload).length === 0 && !!args?.data?.storeId;
/** Gravação da original que contém a reserva/vínculo do retorno. */
const gravacaoDaOriginal = (osId: string, pred: (retornos: Payload[]) => boolean) => (op: "create" | "update", args: any) =>
  op === "update" && args?.where?.id === osId && Array.isArray(args?.data?.payload?.retornosV3) && pred(args.data.payload.retornosV3);

async function esperarBloqueioNoBanco(timeoutMs = 15_000): Promise<void> {
  const fim = Date.now() + timeoutMs;
  while (Date.now() < fim) {
    const rows = await outroProcesso.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()
    `;
    if ((rows[0]?.n ?? 0) >= 1) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("a operação concorrente não chegou a esperar a trava");
}

/** Tudo da original exceto o que o retorno acrescenta (retornosV3, eventos novos, atualizadoEm). */
function nucleo(p: Payload) {
  const { retornosV3: _r, timeline: _t, atualizadoEm: _a, ...resto } = p;
  void _r; void _t; void _a;
  return resto;
}
async function linhaOriginal(id: string) {
  const r = await prisma.ordemServico.findUniqueOrThrow({ where: { id }, select: { valorTotal: true, valorBase: true, status: true, numero: true, clienteId: true, defeito: true, equipamento: true, payload: true } });
  return { ...r, payload: r.payload as Payload };
}

describe("OPS-V4-FLUXO-CURTO-007 — PostgreSQL real", () => {
  it("T53 abre UM atendimento real vinculado nos dois lados, sem recadastro, herança só do que é da OS", async () => {
    comoAdmin();
    const loja = await novaLoja();
    const original = await novaOS(loja);
    const antes = await efeitos(loja);
    const r = await abrirRetornoV3(loja, original, {
      motivo: "Touch voltou a falhar",
      observacao: "Cliente deixou o aparelho",
      operacaoId: `op-t53-${SUFIXO}`,
      recepcao: { acessorios: ["Carregador"], senha: "2580", senhaTipo: "numerica" },
    });
    expect(r.situacao).toBe("criado");
    const filhaId = r.atendimento!.id;

    // Read-back: original ↔ filha.
    const o = await lerOS(original);
    const [ret] = lerRetornosV3(o as OrdemServico);
    expect(ret).toMatchObject({ status: "aberto", osRetornoId: filhaId, operacaoId: `op-t53-${SUFIXO}`, garantiaAtivaNaAbertura: true, garantiaSituacaoNaAbertura: "ativa" });
    expect(ret!.reserva).toBeUndefined();
    const filha = await prisma.ordemServico.findUniqueOrThrow({ where: { id: filhaId } });
    const fp = filha.payload as Payload;
    expect(filha.storeId).toBe(loja);
    expect(filha.clienteId).toBe(o.clienteId);
    expect(filha.valorTotal).toBe(0);
    expect(lerVinculoRetornoV3(fp as OrdemServico)).toMatchObject({ osOrigemId: original, retornoId: ret!.id, operacaoId: `op-t53-${SUFIXO}` });
    expect(fp.equipamento).toMatchObject({ marca: "Samsung", modelo: o.equipamento.modelo, numeroSerie: o.equipamento.numeroSerie, acessorios: ["Carregador"] });
    expect(fp.senhaEquipamento).toBe("2580");
    expect(lerGarantiaV3(fp as OrdemServico).situacao).toBe("sem_garantia");
    expect(fp.aberturaV3.recepcao.origem).toBe("garantia");
    expect((fp.timeline as Payload[]).filter((e) => e.metadata?.evento === "retorno_atendimento_aberto")).toHaveLength(1);
    expect((o.timeline as Payload[]).filter((e) => e.metadata?.evento === "retorno_aberto")).toHaveLength(1);
    // Auto-close da entrega da filha reconhece o vínculo inequívoco (contrato existente intacto).
    expect(resolverRetornoParaAutoCloseV3(fp as OrdemServico, o as OrdemServico)).toMatchObject({ ok: true });
    // Sem cliente novo, sem título, caixa, venda, estoque ou garantia operacional.
    expect(await efeitos(loja)).toEqual(antes);
    // A busca da loja encontra a original e a ficha relê o vínculo.
    const busca = await buscarOrigensRetornoV3(loja, o.codigo);
    expect(busca.map((b) => b.osId)).toContain(original);
    expect((await lerOrigemRetornoV3(loja, original))?.enquadramento.id).toBe("retorno_em_andamento");
  });

  it("T54 cross-store: operador da loja A não abre, não lê e não lista OS da loja B (nem com o id direto)", async () => {
    comoAdmin();
    const lojaA = await novaLoja();
    const lojaB = await novaLoja();
    const osB = await novaOS(lojaB);
    const codigoB = (await lerOS(osB)).codigo as string;
    const antesB = await linhaOriginal(osB);
    const efeitosB = await efeitos(lojaB);
    comoOperadorRestrito([lojaA]);
    await expect(abrirRetornoV3(lojaA, osB, { motivo: "Invasão", operacaoId: `op-t54a-${SUFIXO}` })).rejects.toThrow("OS não encontrada.");
    await expect(abrirRetornoV3(lojaB, osB, { motivo: "Invasão", operacaoId: `op-t54b-${SUFIXO}` })).rejects.toThrow("Sem permissão para esta unidade");
    await expect(buscarOrigensRetornoV3(lojaB, codigoB)).rejects.toThrow("Sem permissão para esta unidade");
    await expect(lerOrigemRetornoV3(lojaB, osB)).rejects.toThrow("Sem permissão para esta unidade");
    expect(await buscarOrigensRetornoV3(lojaA, codigoB)).toEqual([]);
    expect(await lerOrigemRetornoV3(lojaA, osB)).toBeNull();
    comoAdmin();
    expect(await linhaOriginal(osB)).toEqual(antesB);
    expect(await efeitos(lojaB)).toEqual(efeitosB);
    expect(await filhasDe(lojaA, osB)).toHaveLength(0);
    expect(await filhasDe(lojaB, osB)).toHaveLength(0);
  });

  it("permissões separadas: sem acesso ao hub não busca; sem editar/criar OS não abre — nada gravado", async () => {
    comoAdmin();
    const loja = await novaLoja();
    const original = await novaOS(loja);
    const antes = await linhaOriginal(original);
    comoOperadorRestrito([loja], "VENDEDOR");
    await expect(buscarOrigensRetornoV3(loja, "Galaxy")).rejects.toThrow("Sem permissão para consultar ordens desta unidade.");
    await expect(abrirRetornoV3(loja, original, { motivo: "Falha", operacaoId: `op-perm-${SUFIXO}` })).rejects.toThrow("Sem permissão para gerenciar retornos desta OS.");
    comoAdmin();
    expect(await linhaOriginal(original)).toEqual(antes);
    expect(await filhasDe(loja, original)).toHaveLength(0);
  });

  it("T55 ocorrência antes da entrega: servidor recusa retorno; OS e garantia intactas", async () => {
    comoAdmin();
    const loja = await novaLoja();
    const emReparo = await novaOS(loja, { entregueEm: null });
    const antes = await linhaOriginal(emReparo);
    await expect(abrirRetornoV3(loja, emReparo, { motivo: "Chiado no áudio", operacaoId: `op-t55-${SUFIXO}` })).rejects.toThrow("observação interna");
    expect(await linhaOriginal(emReparo)).toEqual(antes);
    expect(lerGarantiaV3((await lerOS(emReparo)) as OrdemServico).situacao).toBe("prevista");
    expect(await filhasDe(loja, emReparo)).toHaveLength(0);
    expect((await lerOrigemRetornoV3(loja, emReparo))?.enquadramento).toMatchObject({ id: "nao_entregue", acao: "registrar_ocorrencia" });
    const cancelada = await novaOS(loja, { status: "cancelada" });
    await expect(abrirRetornoV3(loja, cancelada, { motivo: "x", operacaoId: `op-t55c-${SUFIXO}` })).rejects.toThrow("OS cancelada não admite retorno.");
  });

  it("T56a duas chamadas simultâneas da MESMA operação: a segunda aguarda (em processamento); resposta perdida → replay; UMA filha", async () => {
    comoAdmin();
    const loja = await novaLoja();
    const original = await novaOS(loja);
    const op = `op-t56a-${SUFIXO}`;
    const p = pausar(criacaoDaFilha);
    const primeira = abrirRetornoV3(loja, original, { motivo: "Touch", operacaoId: op });
    await p.chegou; // reserva commitada; a criação da filha está no meio
    await expect(abrirRetornoV3(loja, original, { motivo: "Touch", operacaoId: op })).rejects.toThrow("ainda está em processamento");
    p.soltar();
    const r1 = await primeira;
    expect(r1.situacao).toBe("criado");
    // Resposta perdida: o cliente repete o MESMO comando.
    const eventosAntes = ((await lerOS(original)).timeline as Payload[]).length;
    const r2 = await abrirRetornoV3(loja, original, { motivo: "Touch", operacaoId: op });
    expect(r2).toMatchObject({ situacao: "recuperado" });
    expect(r2.atendimento!.id).toBe(r1.atendimento!.id);
    expect(((await lerOS(original)).timeline as Payload[]).length).toBe(eventosAntes);
    expect(ativas(await filhasDe(loja, original))).toHaveLength(1);
    // Comando divergente com a mesma operação: recusado, motivo original preservado.
    await expect(abrirRetornoV3(loja, original, { motivo: "Outra coisa", operacaoId: op })).rejects.toThrow("outro relato");
    // Outra operação: retorno já em andamento.
    await expect(abrirRetornoV3(loja, original, { motivo: "Touch", operacaoId: `op-t56a2-${SUFIXO}` })).rejects.toThrow("Já existe um retorno em andamento para esta OS.");
    expect(lerRetornosV3((await lerOS(original)) as OrdemServico)).toHaveLength(1);
    expect(lerRetornosV3((await lerOS(original)) as OrdemServico)[0]!.motivo).toBe("Touch");
  });

  it("T56b operações DIFERENTES simultâneas: a segunda ESPERA a trava da original no banco e não cria nada", async () => {
    comoAdmin();
    const loja = await novaLoja();
    const original = await novaOS(loja);
    const p = pausar(gravacaoDaOriginal(original, (rs) => rs.some((r) => r.reserva && !r.osRetornoId)));
    const a = abrirRetornoV3(loja, original, { motivo: "Operador A", operacaoId: `op-t56b-a-${SUFIXO}` });
    await p.chegou; // A segura FOR UPDATE da original, antes de gravar a reserva
    const b = abrirRetornoV3(loja, original, { motivo: "Operador B", operacaoId: `op-t56b-b-${SUFIXO}` });
    await esperarBloqueioNoBanco();
    p.soltar();
    await expect(b).rejects.toThrow("Outra abertura de retorno está em processamento");
    await expect(a).resolves.toMatchObject({ situacao: "criado" });
    expect(ativas(await filhasDe(loja, original))).toHaveLength(1);
    const [ret] = lerRetornosV3((await lerOS(original)) as OrdemServico);
    expect(ret!.motivo).toBe("Operador A");
  });

  it("T56c outro PROCESSO (outra sessão PostgreSQL) segurando a original: a action espera e respeita a reserva dele", async () => {
    comoAdmin();
    const loja = await novaLoja();
    const original = await novaOS(loja);
    let liberar!: () => void;
    const liberado = new Promise<void>((r) => { liberar = r; });
    const externo = outroProcesso.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "ordens_servico" WHERE "id" = ${original} FOR UPDATE`;
      await liberado;
      const atual = (await tx.ordemServico.findUniqueOrThrow({ where: { id: original } })).payload as Payload;
      const expira = new Date(Date.now() + 10 * 60_000).toISOString();
      await tx.ordemServico.update({
        where: { id: original },
        data: { payload: { ...atual, retornosV3: [{ id: "ret-externo", osOriginalId: original, motivo: "Do outro processo", criadoEm: new Date().toISOString(), status: "aberto", operacaoId: "op-externo-0001", reserva: { token: "tk-ext", expiraEm: expira } }] } },
      });
    }, { timeout: 20_000 });
    await new Promise((r) => setTimeout(r, 0));
    const nossa = abrirRetornoV3(loja, original, { motivo: "Nosso", operacaoId: `op-t56c-${SUFIXO}` });
    await esperarBloqueioNoBanco();
    liberar();
    await externo;
    await expect(nossa).rejects.toThrow("Outra abertura de retorno está em processamento");
    expect(await filhasDe(loja, original)).toHaveLength(0);
  });

  it("T56d falha ENTRE a criação e o vínculo: o retry adota a filha existente (sem segunda criação, sem órfã)", async () => {
    comoAdmin();
    const loja = await novaLoja();
    const original = await novaOS(loja);
    const op = `op-t56d-${SUFIXO}`;
    falharUmaVez(gravacaoDaOriginal(original, (rs) => rs.some((r) => !!r.osRetornoId)));
    await expect(abrirRetornoV3(loja, original, { motivo: "Touch", operacaoId: op })).rejects.toThrow("falha injetada");
    const orfa = await filhasDe(loja, original);
    expect(orfa).toHaveLength(1);
    expect(lerRetornosV3((await lerOS(original)) as OrdemServico)[0]).toMatchObject({ operacaoId: op });
    expect(lerRetornosV3((await lerOS(original)) as OrdemServico)[0]!.osRetornoId).toBeUndefined();
    const r = await abrirRetornoV3(loja, original, { motivo: "Touch", operacaoId: op });
    expect(r.situacao).toBe("recuperado");
    expect(r.atendimento!.id).toBe(orfa[0]!.id);
    expect(ativas(await filhasDe(loja, original))).toHaveLength(1);
    expect(lerRetornosV3((await lerOS(original)) as OrdemServico)[0]).toMatchObject({ osRetornoId: orfa[0]!.id });
    expect(((await lerOS(original)).timeline as Payload[]).filter((e) => e.metadata?.evento === "retorno_aberto")).toHaveLength(1);
  });

  it("T56e reserva EXPIRADA sem atendimento: outra operação descarta com auditoria e abre; a antiga, se ressurgir, é descartada explicitamente", async () => {
    comoAdmin();
    const loja = await novaLoja();
    const original = await novaOS(loja);
    const opVelha = `op-t56e-velha-${SUFIXO}`;
    const p = pausar(criacaoDaFilha);
    const velha = abrirRetornoV3(loja, original, { motivo: "Velha", operacaoId: opVelha });
    await p.chegou;
    // Simula o TTL vencido (o dono da reserva "morreu" do ponto de vista do protocolo).
    const atual = await lerOS(original);
    atual.retornosV3 = (atual.retornosV3 as Payload[]).map((r) => ({ ...r, reserva: { ...r.reserva, expiraEm: "2020-01-01T00:00:00.000Z" } }));
    await outroProcesso.ordemServico.update({ where: { id: original }, data: { payload: atual as Prisma.InputJsonValue } });
    const nova = await abrirRetornoV3(loja, original, { motivo: "Nova", operacaoId: `op-t56e-nova-${SUFIXO}` });
    expect(nova.situacao).toBe("criado");
    p.soltar();
    await expect(velha).rejects.toThrow("foi marcado como descartado");
    const todas = await filhasDe(loja, original);
    expect(todas).toHaveLength(2);
    expect(ativas(todas).map((f) => f.id)).toEqual([nova.atendimento!.id]);
    const descartada = todas.find((f) => f.id !== nova.atendimento!.id)!;
    expect((descartada.payload as Payload).vinculoRetornoV3).toMatchObject({ descartadoMotivo: "reserva_descartada" });
    expect(((descartada.payload as Payload).timeline as Payload[]).some((e) => e.metadata?.evento === "retorno_atendimento_descartado")).toBe(true);
    const o = await lerOS(original);
    expect(lerRetornosV3(o as OrdemServico)).toEqual([expect.objectContaining({ motivo: "Nova", osRetornoId: nova.atendimento!.id })]);
    expect((o.timeline as Payload[]).map((e) => e.metadata?.evento).filter(Boolean)).toEqual(["retorno_reserva_descartada", "retorno_aberto"]);
  });

  it("T57 original preservada: retorno coberto e fora de cobertura, abrir e finalizar — zero efeito financeiro/estoque/garantia", async () => {
    comoAdmin();
    const loja = await novaLoja();
    const coberta = await novaOS(loja);
    const vencida = await novaOS(loja, { entregueEm: "2025-01-10T12:00:00.000Z" });
    const semGarantia = await novaOS(loja, { garantia: null });
    const antes = await Promise.all([coberta, vencida, semGarantia].map(linhaOriginal));
    const efeitosAntes = await efeitos(loja);
    const garantiasAntes = await Promise.all([coberta, vencida, semGarantia].map(async (id) => lerGarantiaV3((await lerOS(id)) as OrdemServico)));

    const abertos = [];
    for (const [i, id] of [coberta, vencida, semGarantia].entries()) {
      abertos.push(await abrirRetornoV3(loja, id, { motivo: `Retorno ${i}`, operacaoId: `op-t57-${i}-${SUFIXO}` }));
    }
    expect(abertos.map((r) => r.situacao)).toEqual(["criado", "criado", "criado"]);
    expect(lerRetornosV3((await lerOS(vencida)) as OrdemServico)[0]).toMatchObject({ garantiaAtivaNaAbertura: false, garantiaSituacaoNaAbertura: "vencida" });
    expect(lerRetornosV3((await lerOS(semGarantia)) as OrdemServico)[0]).toMatchObject({ garantiaAtivaNaAbertura: false, garantiaSituacaoNaAbertura: "nenhuma" });
    for (const id of [coberta, vencida, semGarantia]) {
      const [ret] = lerRetornosV3((await lerOS(id)) as OrdemServico);
      await finalizarRetornoV3(loja, id, ret!.id, { observacao: "Resolvido" });
    }

    const depois = await Promise.all([coberta, vencida, semGarantia].map(linhaOriginal));
    depois.forEach((d, i) => {
      const a = antes[i]!;
      expect({ ...d, payload: nucleo(d.payload) }).toEqual({ ...a, payload: nucleo(a.payload) });
      // Timeline: só acréscimo, histórico anterior intacto.
      expect((d.payload.timeline as Payload[]).slice(0, (a.payload.timeline as Payload[]).length)).toEqual(a.payload.timeline);
      expect(lerRetornosV3(d.payload as OrdemServico)[0]).toMatchObject({ status: "finalizado" });
    });
    const garantiasDepois = await Promise.all([coberta, vencida, semGarantia].map(async (id) => lerGarantiaV3((await lerOS(id)) as OrdemServico)));
    expect(garantiasDepois).toEqual(garantiasAntes);
    // Nenhum título, caixa, movimento, venda, estoque, cliente ou garantia operacional novos.
    expect(await efeitos(loja)).toEqual(efeitosAntes);
    for (const r of abertos) {
      const f = await prisma.ordemServico.findUniqueOrThrow({ where: { id: r.atendimento!.id } });
      expect(f.valorTotal).toBe(0);
      expect(lerGarantiaV3(f.payload as unknown as OrdemServico).situacao).toBe("sem_garantia");
    }
  });

  it("busca server-side: número, cliente, telefone formatado, aparelho e IMEI; curingas não viram 'tudo'", async () => {
    comoAdmin();
    const loja = await novaLoja();
    const alvo = await novaOS(loja);
    const p = await lerOS(alvo);
    const ids = async (t: string) => (await buscarOrigensRetornoV3(loja, t)).map((r) => r.osId);
    expect(await ids(p.codigo)).toEqual([alvo]);
    expect(await ids(p.cliente.nome.toUpperCase())).toEqual([alvo]);
    expect(await ids("98888-7766")).toContain(alvo);
    expect(await ids(`samsung ${p.equipamento.modelo}`)).toEqual([alvo]);
    expect(await ids(p.equipamento.numeroSerie)).toEqual([alvo]);
    expect(await ids("%%")).toEqual([]);
    expect(await ids("__")).toEqual([]);
    const [item] = await buscarOrigensRetornoV3(loja, p.codigo);
    expect(JSON.stringify(item)).not.toContain("1478");
  });
});
