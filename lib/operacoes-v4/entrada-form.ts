// ============================================================================
// Operações V4 — Entrada/Recepção · editor PURO ↔ contratos da V3.
// ----------------------------------------------------------------------------
// Módulo PURO (sem I/O, sem React, sem Prisma). Semeia o editor de Entrada V4 a
// partir da OS real (reusando `lerProvaEntradaV3` + `lerChecklistEntradaV3`, que
// já normalizam e semeiam dos campos legados) e mapeia o estado do editor para os
// inputs das actions reais da V3:
//   • `salvarIdentificacaoV3`      ← toIdentificacaoInput
//   • `salvarProvaEntradaV3`       ← toProvaEntradaInput (estado físico/avarias/credenciais)
//   • `salvarAcessoriosEntradaV3`  ← toAcessoriosInput
//   • `salvarChecklistEntradaV3`   ← toChecklistInput
// NÃO persiste, NÃO toca estoque/caixa/financeiro. As actions revalidam/sanitizam
// por conta própria. Re-exporta as tabelas de rótulo da V3 para a UI da V4.
// ============================================================================

import type { OrdemServico } from "@/types/os";
import { identidadeAtualV4 } from "./identidade-aparelho";
import {
  lerProvaEntradaV3,
  ACESSORIOS_ENTRADA_V3,
  COMPONENTES_FISICOS_V3,
  ESTADO_FISICO_STATUS_META_V3,
  OPERADORAS_V3,
  TIPOS_AVARIA_V3,
  acessorioEntradaLabelV3,
  componenteFisicoLabelV3,
  tipoAvariaLabelV3,
  type AcessorioEntradaV3,
  type AcessorioEntradaIdV3,
  type AssinaturaV3,
  type AvariaV3,
  type CategoriaFotoV3,
  type ComponenteFisicoV3,
  type CredenciaisEntradaV3,
  type EstadoFisicoItemV3,
  type EstadoFisicoStatusV3,
  type FotoEntradaV3,
  type IdentificacaoV3,
  type ProvaEntradaV3,
  type SenhaTipoV3,
  type TipoAvariaV3,
} from "@/lib/operacoes-v3/prova-entrada-model";
import type { SalvarProvaEntradaInputV3 } from "@/lib/operacoes-v3/prova-entrada-actions";
import {
  lerChecklistEntradaV3,
  CHECKLIST_ESTADO_META_V3,
  type ChecklistEntradaItemV3,
  type ChecklistEstadoV3,
} from "@/lib/operacoes-v3/workspace-model";

// Re-exporta o que a UI da V4 precisa (mantém os imports da Entrada dentro de lib/operacoes-v4).
export {
  ACESSORIOS_ENTRADA_V3,
  COMPONENTES_FISICOS_V3,
  ESTADO_FISICO_STATUS_META_V3,
  OPERADORAS_V3,
  TIPOS_AVARIA_V3,
  acessorioEntradaLabelV3,
  componenteFisicoLabelV3,
  tipoAvariaLabelV3,
  CHECKLIST_ESTADO_META_V3,
};
export type {
  AcessorioEntradaV3,
  AvariaV3,
  ChecklistEntradaItemV3,
  ChecklistEstadoV3,
  EstadoFisicoStatusV3,
  IdentificacaoV3,
  SalvarProvaEntradaInputV3,
  SenhaTipoV3,
  TipoAvariaV3,
};

/** Credenciais no editor (campos controlados — strings/booleans, sem opcionais). */
export interface EntradaCredenciaisEditorV4 {
  pin: string;
  senha: string;
  senhaTipo: SenhaTipoV3;
  contaGoogle: string;
  contaApple: string;
  faceId: boolean;
  biometria: boolean;
}

/** Estado completo do editor de Entrada da V4. */
export interface EntradaEditorV4 {
  identificacao: { imei: string; serial: string; operadora: string; modelo: string; cor: string };
  estadoFisico: EstadoFisicoItemV3[];
  avarias: AvariaV3[];
  credenciais: EntradaCredenciaisEditorV4;
  acessorios: AcessorioEntradaV3[];
  checklist: ChecklistEntradaItemV3[];
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function clean(v: string | undefined | null): string | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length ? s : undefined;
}

function uid(prefix: string): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `${prefix}_${crypto.randomUUID()}`
    : `${prefix}_${Date.now()}_${Math.round(Math.random() * 1e6)}`;
}

/** Semeia o editor a partir da OS real (provaEntradaV3 + checklist), com fallback legado. */
export function seedEntradaEditor(os: OrdemServico | null | undefined): EntradaEditorV4 {
  const prova = lerProvaEntradaV3(os ?? null);
  const checklist = lerChecklistEntradaV3(os ?? null);
  const cred = prova.credenciais ?? {};
  const identidade = identidadeAtualV4(os);
  return {
    identificacao: {
      imei: identidade.imei || str(prova.identificacao.imei),
      serial: identidade.serial || str(prova.identificacao.serial),
      operadora: identidade.operadora || str(prova.identificacao.operadora),
      modelo: identidade.modelo || str(prova.identificacao.modelo),
      cor: identidade.cor || str(prova.identificacao.cor),
    },
    estadoFisico: prova.estadoFisico.map((e) => ({ ...e })),
    avarias: prova.avarias.map((a) => ({ ...a })),
    credenciais: {
      pin: str(cred.pin),
      senha: str(cred.senha),
      senhaTipo: cred.senhaTipo ?? "numerica",
      contaGoogle: str(cred.contaGoogle),
      contaApple: str(cred.contaApple),
      faceId: cred.faceId === true,
      biometria: cred.biometria === true,
    },
    acessorios: prova.acessorios.map((a) => ({ ...a })),
    checklist: checklist.map((c) => ({ ...c })),
  };
}

// ---- Limpeza explícita (R02 — pura, testável) ------------------------------
//
// Compara o editor atual com a linha de base salva: chave com valor na base e
// vazia no atual = o operador ESCOLHEU limpar (entra na lista `limpar`).
// Chave vazia nos dois = intocada (preserva no servidor). Vazio nunca exclui
// sozinho — só a lista explícita autoriza a remoção campo a campo.

export function limpezasExplicitas(
  atual: Record<string, string>,
  salvo: Record<string, string>,
): string[] {
  const lista: string[] = [];
  for (const k of Object.keys(atual)) {
    if (!(k in salvo)) continue;
    if ((atual[k] ?? "").trim() === "" && (salvo[k] ?? "").trim() !== "") lista.push(k);
  }
  return lista;
}

// ---- Patch intencional + conflito de concorrência (R01/R02 — puros) -------
//
// Casa pura e testável do mecanismo que os write-paths V3 executam no
// servidor (releitura no LATEST + updateMany condicionado a `updatedAt`).
// Vive aqui (mapeamento editor → contratos V3, sem I/O) porque arquivos
// `"use server"` só podem exportar funções assíncronas — e estes blocos
// precisam ser importáveis por testes e por mais de um write-path.
//
// `undefined` em `valores` significa AUSENTE (preserva o atual) — vazio NÃO
// exclui. Exclusão exige lista explícita em `limpar`. Fatias ausentes do
// intent preservam o servidor; chaves desconhecidas nunca são tocadas.

export interface PatchProvaEntradaV3 {
  identificacao?: {
    valores: Partial<IdentificacaoV3>;
    limpar?: (keyof IdentificacaoV3)[];
  };
  estadoFisico?: EstadoFisicoItemV3[];
  avarias?: AvariaV3[];
  credenciais?: {
    valores: Partial<CredenciaisEntradaV3>;
    limpar?: (keyof CredenciaisEntradaV3)[];
  };
  acessorios?: AcessorioEntradaV3[];
  fotos?: FotoEntradaV3[];
  /** Valor definido = grava; `null` = limpeza explícita; chave ausente = preserva. */
  assinaturaCliente?: AssinaturaV3 | null;
}

function aplicarValoresPatch<T extends Record<string, unknown>>(
  base: T,
  valores: Partial<T> | undefined,
  limpar: (keyof T)[] | undefined,
): T {
  const next: Record<string, unknown> = { ...base };
  if (valores) {
    for (const k of Object.keys(valores) as (keyof T)[]) {
      const v = valores[k];
      if (v !== undefined) next[k as string] = v;
    }
  }
  if (limpar) {
    for (const k of limpar) delete next[k as string];
  }
  return next as T;
}

/** Puro (sem I/O): aplica o intent sobre a prova ATUAL (latest). */
export function aplicarPatchIntencionalProvaEntrada(
  provaAtual: ProvaEntradaV3,
  intent: PatchProvaEntradaV3,
): ProvaEntradaV3 {
  const next: ProvaEntradaV3 = { ...provaAtual };
  if (intent.identificacao) {
    next.identificacao = aplicarValoresPatch(
      { ...(provaAtual.identificacao ?? {}) } as Record<string, unknown>,
      intent.identificacao.valores as Record<string, unknown>,
      intent.identificacao.limpar as string[],
    ) as unknown as IdentificacaoV3;
  }
  if (intent.estadoFisico !== undefined) next.estadoFisico = [...intent.estadoFisico];
  if (intent.avarias !== undefined) next.avarias = [...intent.avarias];
  if (intent.credenciais) {
    next.credenciais = aplicarValoresPatch(
      { ...(provaAtual.credenciais ?? {}) } as Record<string, unknown>,
      intent.credenciais.valores as Record<string, unknown>,
      intent.credenciais.limpar as string[],
    ) as unknown as CredenciaisEntradaV3;
  }
  if (intent.acessorios !== undefined) next.acessorios = [...intent.acessorios];
  if (intent.fotos !== undefined) next.fotos = [...intent.fotos];
  if ("assinaturaCliente" in intent) {
    next.assinaturaCliente = intent.assinaturaCliente ?? undefined;
  }
  return next;
}

/**
 * Puro: mescla o espelho legado `equipamento` (preserva chaves alheias do
 * LATEST; chaves definidas no patch vencem). Só este espelho tem semântica
 * de mesclagem no `patchPayload` — as demais chaves de topo seguem o intent.
 */
export function mesclarEspelhoEquipamento(
  atual: unknown,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const base = atual && typeof atual === "object" ? { ...(atual as Record<string, unknown>) } : {};
  return { ...base, ...patch };
}

/** Código do erro explícito de concorrência (outra sessão gravou no meio). */
export const CONFLITO_CONCORRENCIA_V3 = "CONFLITO_CONCORRENCIA";

export function erroConflitoConcorrenciaV3(recurso: string): Error {
  const e = new Error(
    `A OS foi alterada por outra sessão enquanto você editava ${recurso}. Recarregue a OS e revise antes de salvar — suas alterações foram preservadas na tela.`,
  );
  (e as Error & { code?: string }).code = CONFLITO_CONCORRENCIA_V3;
  return e;
}

export function ehConflitoConcorrenciaV3(e: unknown): boolean {
  return (
    !!e &&
    typeof e === "object" &&
    (e as { code?: unknown }).code === CONFLITO_CONCORRENCIA_V3
  );
}

// ---- Intenção de limpeza para os wrappers (R02 — pura, testável) -----------
//
// Deriva a lista `limpar` comparando o input ( predominantamente `undefined`
// quando vazio) com a semente do servidor: valor na semente + ausente no
// input = o operador escolheu limpar. Ausente nos dois = intocado.

export function intencaoLimpezaIdentificacao(
  input: Partial<Record<"imei" | "serial" | "operadora" | "modelo" | "cor", string | undefined>>,
  semente: Record<"imei" | "serial" | "operadora" | "modelo" | "cor", string>,
): string[] {
  const atual: Record<string, string> = {};
  const base: Record<string, string> = {};
  for (const k of ["imei", "serial", "operadora", "modelo", "cor"] as const) {
    atual[k] = input[k] ?? "";
    base[k] = semente[k] ?? "";
  }
  return limpezasExplicitas(atual, base);
}

export function intencaoLimpezaCredenciais(
  input: Partial<Record<"pin" | "senha" | "contaGoogle" | "contaApple", string | undefined>>,
  semente: Record<"pin" | "senha" | "contaGoogle" | "contaApple", string>,
): string[] {
  const atual: Record<string, string> = {};
  const base: Record<string, string> = {};
  for (const k of ["pin", "senha", "contaGoogle", "contaApple"] as const) {
    atual[k] = input[k] ?? "";
    base[k] = semente[k] ?? "";
  }
  return limpezasExplicitas(atual, base);
}

// ---- Mapeadores editor → inputs das actions V3 -----------------------------

export function toIdentificacaoInput(editor: EntradaEditorV4): IdentificacaoV3 {
  const id = editor.identificacao;
  return {
    imei: clean(id.imei),
    serial: clean(id.serial),
    operadora: clean(id.operadora),
    modelo: clean(id.modelo),
    cor: clean(id.cor),
  };
}

export function toProvaEntradaInput(editor: EntradaEditorV4): SalvarProvaEntradaInputV3 {
  const c = editor.credenciais;
  return {
    estadoFisico: editor.estadoFisico,
    avarias: editor.avarias,
    credenciais: {
      pin: clean(c.pin),
      senha: clean(c.senha),
      senhaTipo: c.senhaTipo,
      contaGoogle: clean(c.contaGoogle),
      contaApple: clean(c.contaApple),
      faceId: c.faceId,
      biometria: c.biometria,
    },
  };
}

export function toAcessoriosInput(editor: EntradaEditorV4): AcessorioEntradaV3[] {
  return editor.acessorios.map((a) => ({ ...a }));
}

export function toChecklistInput(editor: EntradaEditorV4): ChecklistEntradaItemV3[] {
  return editor.checklist.map((c) => ({ ...c }));
}

// ---- Contexto de seleção loja+OS (R03 — puro, testável) --------------------
//
// O editor de Entrada vincula-se a UMA OS de UMA loja. A chave é loja+OS:
// sem loja, sem seleção ou com loja divergente, a resolução é nula — detalhe
// antigo nunca hidrata outro contexto, mesmo com o mesmo osId em duas lojas.
// Pós-await, mutação só afeta o contexto correspondente ao alvo capturado.

export interface ContextoSelecaoOSV4 {
  selectedOsId: string | null;
  lojaIdAtiva: string;
  ordemDetail: OrdemServico | null;
  ordens: OrdemServico[];
}

/** Resolve a OS da seleção atual de forma fechada (nulo = nada a hidratar). */
export function resolverOSSelecionada(args: ContextoSelecaoOSV4): OrdemServico | null {
  const sel = (args.selectedOsId ?? "").trim();
  const loja = (args.lojaIdAtiva ?? "").trim();
  if (!sel || !loja) return null;
  const detalhe = args.ordemDetail;
  if (detalhe && detalhe.id === sel && detalhe.storeId === loja) return detalhe;
  const daLista = args.ordens.find((o) => o.id === sel) ?? null;
  if (daLista && daLista.storeId !== loja) return null;
  return daLista;
}

/** O alvo capturado no disparo ainda é a seleção atual? */
export function alvoAindaSelecionado(
  selecaoAtual: { lojaId: string; osId: string },
  alvo: { lojaId: string; osId: string },
): boolean {
  const loja = (selecaoAtual.lojaId ?? "").trim();
  const os = (selecaoAtual.osId ?? "").trim();
  if (!loja || !os) return false;
  return loja === (alvo.lojaId ?? "").trim() && os === (alvo.osId ?? "").trim();
}

// ---- Mesclagem servidor ↔ rascunho (T03/T04/R04 — pura, testável) ---------
//
// Adota do servidor (`novo`) as chaves NÃO tocadas (iguais à linha de base
// `salvo`); preserva as tocadas. Cada chave compara de forma independente:
// fatia tocada + servidor mudado = conflito explícito (derivado no chamador).

export function igualValorV4(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Mescla `atual` (rascunho) com `novo` (servidor) usando `salvo` (linha de
 * base) para distinguir tocada de intocada. Nunca inventa chave.
 */
export function mesclarNaoTocadas<T extends Record<string, unknown>>(
  atual: T,
  salvo: T,
  novo: T,
): { valor: T; mudou: boolean } {
  const base: Record<string, unknown> = { ...atual };
  let mudou = false;
  for (const k of Object.keys(novo)) {
    if (!(k in atual) || !(k in salvo)) continue;
    if (igualValorV4(atual[k], salvo[k]) && !igualValorV4(atual[k], novo[k])) {
      base[k] = novo[k];
      mudou = true;
    }
  }
  return { valor: base as T, mudou };
}

// ---- Toggles puros (devolvem um novo editor) -------------------------------

export function setEstadoFisicoStatus(
  editor: EntradaEditorV4,
  componente: ComponenteFisicoV3,
  status: EstadoFisicoStatusV3,
): EntradaEditorV4 {
  return {
    ...editor,
    estadoFisico: editor.estadoFisico.map((e) => (e.componente === componente ? { ...e, status } : e)),
  };
}

export function setEstadoFisicoObs(editor: EntradaEditorV4, componente: ComponenteFisicoV3, obs: string): EntradaEditorV4 {
  return {
    ...editor,
    estadoFisico: editor.estadoFisico.map((e) => (e.componente === componente ? { ...e, obs: obs.trim() ? obs : undefined } : e)),
  };
}

export function toggleAcessorio(editor: EntradaEditorV4, id: AcessorioEntradaIdV3): EntradaEditorV4 {
  return {
    ...editor,
    acessorios: editor.acessorios.map((a) => (a.id === id ? { ...a, presente: !a.presente } : a)),
  };
}

export function setChecklistEstado(editor: EntradaEditorV4, id: string, estado: ChecklistEstadoV3): EntradaEditorV4 {
  return {
    ...editor,
    checklist: editor.checklist.map((c) => (c.id === id ? { ...c, estado } : c)),
  };
}

const CHECKLIST_CICLO: ChecklistEstadoV3[] = ["ok", "ruim", "nao_testado"];
/** Avança o estado do item: ok → ruim → nao_testado → ok. */
export function cycleChecklistEstado(editor: EntradaEditorV4, id: string): EntradaEditorV4 {
  return {
    ...editor,
    checklist: editor.checklist.map((c) => {
      if (c.id !== id) return c;
      const next = CHECKLIST_CICLO[(CHECKLIST_CICLO.indexOf(c.estado) + 1) % CHECKLIST_CICLO.length]!;
      return { ...c, estado: next };
    }),
  };
}

export function addAvaria(editor: EntradaEditorV4, tipo: TipoAvariaV3): EntradaEditorV4 {
  const nova: AvariaV3 = { id: uid("av"), tipo, local: "" };
  return { ...editor, avarias: [...editor.avarias, nova] };
}

export function setAvaria(
  editor: EntradaEditorV4,
  id: string,
  patch: Partial<Pick<AvariaV3, "tipo" | "local" | "descricao">>,
): EntradaEditorV4 {
  return { ...editor, avarias: editor.avarias.map((a) => (a.id === id ? { ...a, ...patch } : a)) };
}

export function removeAvaria(editor: EntradaEditorV4, id: string): EntradaEditorV4 {
  return { ...editor, avarias: editor.avarias.filter((a) => a.id !== id) };
}

// ---- Padrão 3×3 (senha tipo "padrao") ---------------------------------------

/**
 * Alterna um ponto (0–8) na sequência do Padrão 3×3, serializada como "1-3-4"
 * (1-indexado, ordem de toque). Mesmo comportamento do `PatternPadV3` da V3:
 * ponto já presente na sequência é no-op (correção só via limpar tudo).
 */
export function togglePadraoPonto(value: string, ponto: number): string {
  const seq = value ? value.split("-").filter(Boolean) : [];
  const token = String(ponto + 1);
  if (seq.includes(token)) return value;
  return [...seq, token].join("-");
}
