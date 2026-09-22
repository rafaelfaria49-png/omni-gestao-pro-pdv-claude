"use server";

// ============================================================================
// Operações V3 — SPRINT_3E.1 · write-paths da PROVA DE ENTRADA (side-effect-free)
// ----------------------------------------------------------------------------
// Grava SOMENTE `payload.provaEntradaV3` + timeline. NÃO toca estoque/Financeiro/
// WhatsApp/Portal/V2/schema. Reusa o reader puro (`lerProvaEntradaV3`) para
// normalizar/semear. Eventos (item 7): prova_entrada_criada/atualizada (carrier
// `observacao`), foto_adicionada/removida (carrier `anexo_adicionado/removido`),
// acessorio_registrado (carrier `observacao`).
// ============================================================================

import { revalidatePath } from "next/cache";
import type { Session } from "next-auth";
import type { Prisma } from "@/generated/prisma";
import type { EventoTimeline, EventoTipo, OrdemServico } from "@/types/os";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireEnterpriseWith } from "@/lib/auth/guard-enterprise";
import { assertActiveStoreId } from "@/lib/operacoes/assert-active-store";
import {
  ACESSORIOS_ENTRADA_V3,
  COMPONENTES_FISICOS_V3,
  ESTADO_FISICO_STATUS_META_V3,
  TIPOS_AVARIA_V3,
  bytesDeDataUrlV3,
  lerProvaEntradaV3,
  provaEntradaCriadaV3,
  validarAssinaturaV3,
  validarFotoEntradaV3,
  type AcessorioEntradaV3,
  type AvariaV3,
  type CategoriaFotoV3,
  type CredenciaisEntradaV3,
  type EstadoFisicoItemV3,
  type EstadoFisicoStatusV3,
  type FotoEntradaV3,
  type IdentificacaoV3,
  type ProvaEntradaV3,
} from "./prova-entrada-model";
import {
  aplicarPatchIntencionalProvaEntrada,
  erroConflitoConcorrenciaV3,
  espelhoPatchIdentificacao,
  espelhoPatchSenhaCredenciais,
  mesclarEspelhoEquipamento,
  type EsperadosProvaEntradaV3,
  type PatchProvaEntradaV3,
} from "@/lib/operacoes-v4/entrada-form";
import { identidadeAtualV4 } from "@/lib/operacoes-v4/identidade-aparelho";

type OSPayloadFull = OrdemServico & Record<string, unknown>;

function nowIso(): string {
  return new Date().toISOString();
}
function uid(prefix: string): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? `${prefix}_${crypto.randomUUID()}` : `${prefix}_${Date.now()}_${Math.round(Math.random() * 1e6)}`;
}
function operadorLabel(session: Session | null): string {
  const u = session?.user;
  return (u?.name || u?.email || "Você").trim() || "Você";
}
function makeEvento(tipo: EventoTipo, autor: string, conteudo: string, metadata?: Record<string, unknown>): EventoTimeline {
  return { id: uid("ev"), tipo, autor, autorTipo: "usuario", conteudo, metadata, criadoEm: nowIso() };
}
function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

async function autorizar(storeId: string, osId: string): Promise<{ id: string; session: Session | null }> {
  const sid = (storeId ?? "").trim();
  const id = (osId ?? "").trim();
  assertActiveStoreId(sid, "Operações V3");
  if (!id) throw new Error("OS não informada.");
  const session = await auth();
  if (!session?.user?.id) throw new Error("Faça login para registrar a prova de entrada.");
  const guard = await requireEnterpriseWith(sid, (p) => p.operacoes.editarOs, "Sem permissão para editar esta OS.");
  if (!guard.ok) throw new Error(guard.error);
  return { id, session };
}

// ----------------------------------------------------------------------------
// R01/R02 — escrita condicionada (sem motor global). O mecanismo puro
// (patch intencional, espelho, erro de conflito) vive em
// lib/operacoes-v4/entrada-form.ts — este arquivo "use server" só pode
// exportar funções assíncronas, e os testes importam o bloco puro de lá.
// ----------------------------------------------------------------------------

type TxV3 = Prisma.TransactionClient;

/**
 * Releitura + mesclagem + escrita condicionada, tudo na mesma transação.
 * `patchPayload` sincroniza campos legados (ex.: senhaEquipamento) sobre o
 * LATEST. Timeline do servidor é preservada (só anexa o evento).
 */
async function persistirPatchProva(
  id: string,
  storeId: string,
  operador: string,
  intent: PatchProvaEntradaV3,
  fazerEvento: (jaCriada: boolean, operador: string, base: ProvaEntradaV3) => EventoTimeline,
  patchPayload?: Record<string, unknown>,
  fotosOp?: { aplicarFotos?: (atuais: FotoEntradaV3[]) => FotoEntradaV3[] },
): Promise<OrdemServico> {
  const saida = await prisma.$transaction(async (tx: TxV3) => {
    const latest = await tx.ordemServico.findFirst({
      where: { id },
      select: { id: true, storeId: true, payload: true, updatedAt: true },
    });
    if (!latest || latest.storeId !== storeId) throw new Error("OS não encontrada.");
    const payload = latest.payload as unknown as OSPayloadFull | null;
    if (!payload || typeof payload !== "object") throw new Error("OS sem payload compatível.");
    const jaCriada = provaEntradaCriadaV3(payload as unknown as OrdemServico);
    const base = lerProvaEntradaV3(payload as unknown as OrdemServico);
    // Operações de lista (fotos) calculadas sobre o LATEST: validação de
    // limite/existência e resultado derivam do estado mais recente.
    const intentFinal =
      fotosOp?.aplicarFotos !== undefined
        ? { ...intent, fotos: fotosOp.aplicarFotos(base.fotos) }
        : intent;
    const evento = fazerEvento(jaCriada, operador, base);
    // Baseline efetiva da identificação: a UI semeia da identidade efetiva
    // (equipamento tem prioridade — `identidadeAtualV4`), mas a prova crua pode
    // não ter o campo (ex.: cor só no equipamento). Conferir o esperado contra
    // o efetivo evita falso conflito; a escrita continua mirando a prova.
    const idEfetiva = identidadeAtualV4(payload as unknown as OrdemServico);
    const identidadeEfetiva = {
      imei: idEfetiva.imei || undefined,
      serial: idEfetiva.serial || undefined,
      operadora: idEfetiva.operadora || undefined,
      modelo: idEfetiva.modelo || undefined,
      cor: idEfetiva.cor || undefined,
    };
    const aplicada = aplicarPatchIntencionalProvaEntrada(base, intentFinal, { identidadeEfetiva });
    // Compatibilidade de exibição (era `str(por) || nome do cliente`): quando o
    // chamador não informa `por`, deriva do cliente do LATEST (nunca do stale).
    if (aplicada.assinaturaCliente && !str(aplicada.assinaturaCliente.por)) {
      const nomeCliente = str((payload as unknown as OrdemServico).cliente?.nome);
      if (nomeCliente) aplicada.assinaturaCliente = { ...aplicada.assinaturaCliente, por: nomeCliente };
    }
    const agora = nowIso();
    const espelho =
      patchPayload && patchPayload.equipamento && typeof patchPayload.equipamento === "object"
        ? {
            equipamento: mesclarEspelhoEquipamento(
              (payload as Record<string, unknown>).equipamento,
              patchPayload.equipamento as Record<string, unknown>,
            ),
          }
        : null;
    const next: OSPayloadFull = {
      ...payload,
      ...(patchPayload ?? {}),
      ...(espelho ?? {}),
      provaEntradaV3: {
        ...aplicada,
        versao: base.versao > 0 ? base.versao : 1,
        criadoEm: str(base.criadoEm) || agora,
        criadoPor: base.criadoPor || operador,
        atualizadoEm: agora,
      },
      timeline: [...(Array.isArray(payload.timeline) ? (payload.timeline as EventoTimeline[]) : []), evento],
      atualizadoEm: agora,
    } as OSPayloadFull;
    // Espelho de senha (legado senhaEquipamento/senhaEquipamentoTipo): deriva
    // do resultado APLICADO sobre o LATEST — tipo efetivo preservado (nunca
    // força "texto" com efetivo numerica/padrao); limpeza de senha limpa o
    // espelho. `undefined` remove a chave; demais campos nunca tocados aqui.
    const espelhoSenha = espelhoPatchSenhaCredenciais(aplicada.credenciais ?? {}, intentFinal.credenciais);
    if (espelhoSenha) {
      const topo = next as unknown as Record<string, unknown>;
      for (const k of Object.keys(espelhoSenha)) {
        if (espelhoSenha[k] === undefined) delete topo[k];
        else topo[k] = espelhoSenha[k];
      }
    }
    const r = await tx.ordemServico.updateMany({
      where: { id, updatedAt: latest.updatedAt },
      data: { payload: next as unknown as Prisma.InputJsonValue },
    });
    if (r.count === 0) throw erroConflitoConcorrenciaV3("a prova de entrada");
    const row = await tx.ordemServico.findFirst({ where: { id }, select: { payload: true } });
    if (!row) throw new Error("OS não encontrada.");
    return row.payload as unknown as OrdemServico;
  });
  revalidatePath("/dashboard/operacoes-v3");
  return saida;
}

// ----------------------------------------------------------------------------
// 1/2/4 — Estado físico + avarias + credenciais (uma única tela do prontuário)
// ----------------------------------------------------------------------------

export interface SalvarProvaEntradaInputV3 {
  estadoFisico: EstadoFisicoItemV3[];
  avarias: AvariaV3[];
  credenciais: CredenciaisEntradaV3;
}

/** Fatias da prova que entram no intent (R02: só tocadas viajam). */
export type FatiaProvaEntradaV3 = "estadoFisico" | "avarias" | "credenciais";

const COMPONENTE_IDS = new Set(COMPONENTES_FISICOS_V3.map((c) => c.id));
const STATUS_IDS = new Set(Object.keys(ESTADO_FISICO_STATUS_META_V3) as EstadoFisicoStatusV3[]);
const AVARIA_IDS = new Set(TIPOS_AVARIA_V3.map((a) => a.id));

function sanitEstadoFisico(input: EstadoFisicoItemV3[]): EstadoFisicoItemV3[] {
  const porId = new Map<string, EstadoFisicoItemV3>();
  for (const it of Array.isArray(input) ? input : []) {
    if (!COMPONENTE_IDS.has(it?.componente)) continue;
    porId.set(it.componente, {
      componente: it.componente,
      status: STATUS_IDS.has(it?.status) ? it.status : "ok",
      obs: str(it?.obs) || undefined,
    });
  }
  return COMPONENTES_FISICOS_V3.map((c) => porId.get(c.id) ?? { componente: c.id, status: "ok" });
}

function sanitAvarias(input: AvariaV3[]): AvariaV3[] {
  return (Array.isArray(input) ? input : [])
    .filter((a) => AVARIA_IDS.has(a?.tipo))
    .map((a) => ({ id: str(a.id) || uid("av"), tipo: a.tipo, local: str(a.local), descricao: str(a.descricao) || undefined }));
}

function sanitCredenciais(input: CredenciaisEntradaV3): CredenciaisEntradaV3 {
  const tipo = input?.senhaTipo;
  return {
    pin: str(input?.pin) || undefined,
    senha: str(input?.senha) || undefined,
    senhaTipo: tipo === "numerica" || tipo === "texto" || tipo === "padrao" ? tipo : undefined,
    contaGoogle: str(input?.contaGoogle) || undefined,
    contaApple: str(input?.contaApple) || undefined,
    faceId: typeof input?.faceId === "boolean" ? input.faceId : undefined,
    biometria: typeof input?.biometria === "boolean" ? input.biometria : undefined,
  };
}

export async function salvarProvaEntradaV3(
  storeId: string,
  osId: string,
  input: SalvarProvaEntradaInputV3,
  limparCredenciais?: (keyof CredenciaisEntradaV3)[],
  esperados?: EsperadosProvaEntradaV3,
  incluir?: FatiaProvaEntradaV3[],
): Promise<OrdemServico> {
  const { id, session } = await autorizar(storeId, osId);
  const operador = operadorLabel(session);

  // R02: só fatias em `incluir` entram no intent (o wrapper filtra pelo diff
  // contra a semente; sem `incluir`, entram todas — chamadores legados, ex.:
  // hub V3, mandam tudo como antes). `esperados` confere a baseline.
  const quais: FatiaProvaEntradaV3[] = incluir ?? ["estadoFisico", "avarias", "credenciais"];
  const temEstado = quais.includes("estadoFisico");
  const temAvarias = quais.includes("avarias");
  const temCred = quais.includes("credenciais");
  const ini = input ?? ({} as SalvarProvaEntradaInputV3);
  const estadoFisico = temEstado ? sanitEstadoFisico(ini.estadoFisico ?? []) : [];
  const avarias = temAvarias ? sanitAvarias(ini.avarias ?? []) : [];
  const credSanitizadas = temCred ? sanitCredenciais((ini.credenciais ?? {}) as CredenciaisEntradaV3) : {};
  // Contrato novo (wrapper V4): aplicam-se SOMENTE as credenciais tocadas
  // (chaves com baseline em `esperados.credenciais`); não tocadas preservam o
  // LATEST mesmo quando presentes no input (stale nunca clobbera em silêncio).
  // Sem `esperados.credenciais`, aplicam-se todas as definidas (chamadores
  // legados sem baseline — hub V3 via `use-prova-entrada-v3`, sem `incluir`).
  const credenciais =
    temCred && esperados?.credenciais !== undefined
      ? Object.fromEntries(
          Object.entries(credSanitizadas).filter(([k]) => k in (esperados.credenciais as Record<string, unknown>)),
        ) as CredenciaisEntradaV3
      : credSanitizadas;
  const resumo = estadoFisico.filter((i) => i.status !== "ok").length;
  // Consolidação (item 4): a senha agora é editada aqui — o espelho legado
  // `senhaEquipamento`/`senhaEquipamentoTipo` (lido pela impressão da OS / pad
  // 3×3) deriva do resultado aplicado sobre o LATEST dentro de
  // `persistirPatchProva` (tipo efetivo preservado; limpeza limpa o espelho).
  return persistirPatchProva(
    id,
    (storeId ?? "").trim(),
    operador,
    {
      ...(temEstado ? { estadoFisico } : {}),
      ...(temAvarias ? { avarias } : {}),
      ...(temCred ? { credenciais: { valores: credenciais, limpar: limparCredenciais } } : {}),
      ...(esperados ? { esperados } : {}),
    },
    (jaCriada, op) =>
      makeEvento(
        "observacao",
        op,
        jaCriada ? "Prova de entrada atualizada." : "Prova de entrada registrada (estado físico, avarias e credenciais).",
        { evento: jaCriada ? "prova_entrada_atualizada" : "prova_entrada_criada", avariados: resumo, avarias: avarias.length },
      ),
    undefined,
  );
}

// ----------------------------------------------------------------------------
// SPRINT_3E.2 — Identificação completa (item 1)
// ----------------------------------------------------------------------------

export async function salvarIdentificacaoV3(
  storeId: string,
  osId: string,
  input: IdentificacaoV3,
  limpar?: (keyof IdentificacaoV3)[],
  esperados?: Partial<IdentificacaoV3>,
): Promise<OrdemServico> {
  const { id, session } = await autorizar(storeId, osId);
  const operador = operadorLabel(session);
  // R01/R02: somente chaves DEFINIDAS entram no intent (ausente = preserva).
  // Limpeza exige lista explícita `limpar` — vazio nunca exclui sozinho.
  // `esperados` (baseline por campo, enviada pelo contrato novo) é conferida
  // no LATEST: divergência vira CONFLITO em vez de clobber sequencial.
  const valores: Partial<IdentificacaoV3> = {};
  const ini = input ?? ({} as IdentificacaoV3);
  if (str(ini.imei)) valores.imei = str(ini.imei);
  if (str(ini.serial)) valores.serial = str(ini.serial);
  if (str(ini.operadora)) valores.operadora = str(ini.operadora);
  if (str(ini.modelo)) valores.modelo = str(ini.modelo);
  if (str(ini.cor)) valores.cor = str(ini.cor);
  // R01: espelho legado (leitura efetiva prioriza equipamento.* — ver
  // identidade-aparelho.test.ts). A prova continua o alvo canônico da escrita;
  // o espelho só sincroniza o que foi informado, sem apagar chaves alheias.
  // Limpeza explícita de campo espelhado (cor/modelo/IMEI) limpa também o
  // espelho correspondente — sem isso o valor antigo ressuscitaria no reload.
  const equipamentoPatch = espelhoPatchIdentificacao(valores, limpar);
  return persistirPatchProva(
    id,
    (storeId ?? "").trim(),
    operador,
    { identificacao: { valores, limpar }, esperados: esperados ? { identificacao: esperados } : undefined },
    (_jaCriada, op) =>
      makeEvento("observacao", op, "Identificação do aparelho atualizada (IMEI/serial/operadora).", { evento: "identificacao_atualizada" }),
    // Sincroniza o espelho legado `equipamento` sobre o LATEST (mescla, sem
    // apagar chaves alheias do equipamento).
    Object.keys(equipamentoPatch).length > 0 ? { equipamento: equipamentoPatch } : undefined,
  );
}

// ----------------------------------------------------------------------------
// SPRINT_3E.2 — Assinatura digital do cliente na ENTRADA (item 2)
// ----------------------------------------------------------------------------

export async function salvarAssinaturaClienteV3(storeId: string, osId: string, dataUrl: string, por?: string): Promise<OrdemServico> {
  const { id, session } = await autorizar(storeId, osId);
  const veredito = validarAssinaturaV3(dataUrl ?? "");
  if (!veredito.ok) throw new Error(veredito.motivo ?? "Assinatura inválida.");
  const operador = operadorLabel(session);
  const porLimpo = str(por);
  return persistirPatchProva(
    id,
    (storeId ?? "").trim(),
    operador,
    {
      assinaturaCliente: {
        dataUrl: dataUrl.trim(),
        criadoEm: nowIso(),
        por: porLimpo || undefined,
      },
    },
    (_jaCriada, op) =>
      makeEvento("observacao", op, "Assinatura do cliente capturada (entrada).", { evento: "assinatura_cliente_capturada" }),
  );
}

// ----------------------------------------------------------------------------
// 5 — Acessórios recebidos (checklist) → evento acessorio_registrado
// ----------------------------------------------------------------------------

const ACESSORIO_IDS = new Set(ACESSORIOS_ENTRADA_V3.map((a) => a.id));

export async function salvarAcessoriosEntradaV3(
  storeId: string,
  osId: string,
  acessorios: AcessorioEntradaV3[],
  esperados?: AcessorioEntradaV3[],
): Promise<OrdemServico> {
  const { id, session } = await autorizar(storeId, osId);
  const operador = operadorLabel(session);

  const porId = new Map<string, boolean>();
  for (const a of Array.isArray(acessorios) ? acessorios : []) {
    if (ACESSORIO_IDS.has(a?.id)) porId.set(a.id, a.presente === true);
  }
  const lista = ACESSORIOS_ENTRADA_V3.map((a) => ({ id: a.id, presente: porId.get(a.id) ?? false }));

  const presentes = lista.filter((a) => a.presente).length;
  return persistirPatchProva(
    id,
    (storeId ?? "").trim(),
    operador,
    { acessorios: lista, ...(esperados !== undefined ? { esperados: { acessorios: esperados } } : {}) },
    (_jaCriada, op) =>
      makeEvento("observacao", op, `Acessórios recebidos registrados (${presentes} item(ns)).`, {
        evento: "acessorio_registrado",
        presentes,
      }),
  );
}

// ----------------------------------------------------------------------------
// 3 — Fotos da entrada (upload real → data URL no payload, com limites)
// ----------------------------------------------------------------------------

export interface AdicionarFotoEntradaInputV3 {
  categoria: CategoriaFotoV3;
  nome?: string;
  /** Data URL JPEG já reduzida no cliente. */
  dataUrl: string;
}

export async function adicionarFotoEntradaV3(storeId: string, osId: string, input: AdicionarFotoEntradaInputV3): Promise<OrdemServico> {
  const { id, session } = await autorizar(storeId, osId);
  const operador = operadorLabel(session);

  const categoria: CategoriaFotoV3 =
    input?.categoria === "frontal" || input?.categoria === "traseira" || input?.categoria === "lateral" || input?.categoria === "defeito"
      ? input.categoria
      : "defeito";

  const foto: FotoEntradaV3 = {
    id: uid("foto"),
    categoria,
    nome: str(input?.nome) || undefined,
    dataUrl: (input?.dataUrl ?? "").trim(),
    tamanho: bytesDeDataUrlV3(input?.dataUrl ?? ""),
    criadoEm: nowIso(),
  };
  // R02: o limite de fotos avalia o LATEST dentro da transação (operação de
  // lista sobre o estado mais recente, com escrita condicionada).
  return persistirPatchProva(
    id,
    (storeId ?? "").trim(),
    operador,
    {},
    (_jaCriada, op) =>
      makeEvento("anexo_adicionado", op, `Foto de entrada adicionada (${categoria}).`, { evento: "foto_adicionada", categoria, fotoId: foto.id }),
    undefined,
    {
      aplicarFotos: (atuais) => {
        const veredito = validarFotoEntradaV3(input?.dataUrl ?? "", atuais.length);
        if (!veredito.ok) throw new Error(veredito.motivo ?? "Foto inválida.");
        return [...atuais, foto];
      },
    },
  );
}

export async function removerFotoEntradaV3(storeId: string, osId: string, fotoId: string): Promise<OrdemServico> {
  const { id, session } = await autorizar(storeId, osId);
  const operador = operadorLabel(session);
  const fid = str(fotoId);
  if (!fid) throw new Error("Foto não encontrada nesta OS.");

  return persistirPatchProva(
    id,
    (storeId ?? "").trim(),
    operador,
    {},
    (_jaCriada, op, base) => {
      const alvo = base.fotos.find((f) => f.id === fid);
      return makeEvento(
        "anexo_removido",
        op,
        `Foto de entrada removida (${alvo?.categoria ?? "defeito"}).`,
        { evento: "foto_removida", categoria: alvo?.categoria ?? "defeito", fotoId: fid },
      );
    },
    undefined,
    {
      aplicarFotos: (atuais) => {
        const alvo = atuais.find((f) => f.id === fid);
        if (!alvo) throw new Error("Foto não encontrada nesta OS.");
        return atuais.filter((f) => f.id !== fid);
      },
    },
  );
}
