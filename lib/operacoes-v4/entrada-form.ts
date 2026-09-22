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

import type { EventoTimeline, OrdemServico } from "@/types/os";
import { identidadeAtualV4 } from "./identidade-aparelho";
import {
  collapseOrigemV3,
  isLocalFisicoV3,
  isOrigemV3,
  isPrioridadeV3,
  type SalvarDadosBasicosInputV3,
} from "@/lib/operacoes-v3/dados-basicos-model";
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

/**
 * Baseline por campo/fatia (R02): o que o editor VIA quando tocou. No servidor,
 * cada chave enviada com `esperados` é conferida contra o LATEST: igual aplica,
 * divergiu vira CONFLITO_CONCORRENCIA. Chave enviada SEM `esperados` aplica
 * direto (chamadores legados sem baseline, ex.: hub V3) — o contrato novo
 * (UI V4) sempre envia `esperados` para tudo que envia.
 */
export interface EsperadosProvaEntradaV3 {
  identificacao?: Partial<IdentificacaoV3>;
  credenciais?: Partial<CredenciaisEntradaV3>;
  estadoFisico?: EstadoFisicoItemV3[];
  avarias?: AvariaV3[];
  acessorios?: AcessorioEntradaV3[];
  fotos?: FotoEntradaV3[];
}

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
  esperados?: EsperadosProvaEntradaV3;
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

/**
 * Opções do patch intencional (R independente do candidato 9464b00).
 *
 * `identidadeEfetiva`: a identidade EFETIVA vista pelo operador na UI
 * (equipamento tem prioridade — ver `identidadeAtualV4`). Quando informada, a
 * conferência da baseline de identificação compara o esperado contra o valor
 * efetivo (equipamento || prova) em vez do snapshot cru da prova — sem ela,
 * Nova OS com equipamento.cor=Violeta e prova sem cor geraria falso conflito
 * ao editar para Preto com expected=Violeta. Ausente = compara contra a prova
 * crua (compat com chamadores que já normalizam a base).
 */
export interface OpcoesPatchProvaEntradaV3 {
  identidadeEfetiva?: Partial<IdentificacaoV3>;
}

/** Normaliza texto para comparação de baseline: undefined/null ≡ "" (trim). */
function textoCampoV4(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

/**
 * Puro (sem I/O): aplica o intent sobre a prova ATUAL (latest), conferindo a
 * baseline por campo. Lança erroConflitoConcorrenciaV3 listando os campos
 * quando o servidor divergiu da baseline — nunca sobrescreve em silêncio.
 *
 * Normalização de vazio: campo realmente ausente (undefined) ≡ "" — o
 * primeiro preenchimento aplica; o segundo (latest já preenchido × baseline
 * vazia) conflita. Booleanos ausentes ≡ false; senhaTipo ausente ≡ "numerica"
 * (defaults que o editor exibe) — a primeira troca aplica, a divergente
 * conflita.
 */
export function aplicarPatchIntencionalProvaEntrada(
  provaAtual: ProvaEntradaV3,
  intent: PatchProvaEntradaV3,
  opcoes?: OpcoesPatchProvaEntradaV3,
): ProvaEntradaV3 {
  const esperados = intent.esperados ?? {};
  const emConflito: string[] = [];
  const confere = (rotulo: string, atual: unknown, esperado: unknown | undefined): boolean => {
    if (esperado === undefined) return true;
    if (igualValorV4(atual, esperado)) return true;
    emConflito.push(rotulo);
    return false;
  };
  const next: ProvaEntradaV3 = { ...provaAtual };
  if (intent.identificacao) {
    const base = { ...(provaAtual.identificacao ?? {}) } as Record<string, unknown>;
    const esp = esperados.identificacao ?? {};
    const efetiva = (opcoes?.identidadeEfetiva ?? {}) as Record<string, unknown>;
    const chaves = new Set<string>([
      ...Object.keys(intent.identificacao.valores ?? {}),
      ...((intent.identificacao.limpar ?? []) as string[]),
    ]);
    let tocou = false;
    for (const k of chaves) {
      const v = (intent.identificacao.valores as Record<string, unknown> | undefined)?.[k];
      const emLimpeza = ((intent.identificacao.limpar ?? []) as string[]).includes(k);
      if (v === undefined && !emLimpeza) continue;
      tocou = true;
      const esperadoV = (esp as Record<string, unknown>)[k];
      if (esperadoV !== undefined) {
        // Baseline efetiva: equipamento tem prioridade; ausente no snapshot
        // cai para a identidade efetiva vista pelo operador.
        const cru = base[k];
        const atualEfetivo = cru === undefined || cru === null ? efetiva[k] : cru;
        if (textoCampoV4(atualEfetivo) !== textoCampoV4(esperadoV)) {
          emConflito.push(`identificacao.${k}`);
          continue;
        }
      }
      if (emLimpeza) delete base[k];
      else base[k] = v;
    }
    if (tocou) next.identificacao = base as unknown as IdentificacaoV3;
  }
  const confereFatia = <T,>(rotulo: string, atual: T, esperado: T | undefined): boolean =>
    confere(rotulo, atual, esperado);
  if (intent.estadoFisico !== undefined) {
    if (!confereFatia("estadoFisico", provaAtual.estadoFisico, esperados.estadoFisico)) {
      /* registrado em emConflito; fatia preservada abaixo via throw */
    } else {
      next.estadoFisico = [...intent.estadoFisico];
    }
  }
  if (intent.avarias !== undefined) {
    if (confereFatia("avarias", provaAtual.avarias, esperados.avarias)) {
      next.avarias = [...intent.avarias];
    }
  }
  if (intent.credenciais) {
    const base = { ...(provaAtual.credenciais ?? {}) } as Record<string, unknown>;
    const esp = (esperados.credenciais ?? {}) as Record<string, unknown>;
    const chaves = new Set<string>([
      ...Object.keys(intent.credenciais.valores ?? {}),
      ...((intent.credenciais.limpar ?? []) as string[]),
    ]);
    let tocou = false;
    for (const k of chaves) {
      const v = (intent.credenciais.valores as Record<string, unknown> | undefined)?.[k];
      const emLimpeza = ((intent.credenciais.limpar ?? []) as string[]).includes(k);
      if (v === undefined && !emLimpeza) continue;
      tocou = true;
      const esperadoV = esp[k];
      if (esperadoV !== undefined) {
        let igual: boolean;
        if (k === "faceId" || k === "biometria") {
          igual = (base[k] ?? false) === (esperadoV ?? false);
        } else if (k === "senhaTipo") {
          const atualNorm = typeof base[k] === "string" && (base[k] as string) ? base[k] : "numerica";
          const espNorm = typeof esperadoV === "string" && (esperadoV as string) ? esperadoV : "numerica";
          igual = atualNorm === espNorm;
        } else {
          igual = textoCampoV4(base[k]) === textoCampoV4(esperadoV);
        }
        if (!igual) {
          emConflito.push(`credenciais.${k}`);
          continue;
        }
      }
      if (emLimpeza) delete base[k];
      else base[k] = v;
    }
    if (tocou) next.credenciais = base as unknown as CredenciaisEntradaV3;
  }
  if (intent.acessorios !== undefined) {
    if (confereFatia("acessorios", provaAtual.acessorios, esperados.acessorios)) {
      next.acessorios = [...intent.acessorios];
    }
  }
  if (intent.fotos !== undefined) {
    if (confereFatia("fotos", provaAtual.fotos, esperados.fotos)) {
      next.fotos = [...intent.fotos];
    }
  }
  if (emConflito.length > 0) throw erroConflitoConcorrenciaV3("a prova de entrada", emConflito);
  if ("assinaturaCliente" in intent) {
    next.assinaturaCliente = intent.assinaturaCliente ?? undefined;
  }
  return next;
}

/**
 * Puro: mescla o espelho legado `equipamento` (preserva chaves alheias do
 * LATEST; chaves definidas no patch vencem). Valor `undefined` no patch =
 * limpeza explícita do espelho (remove a chave) — usado para espelhar a
 * limpeza de cor/modelo/IMEI da prova, sem ressuscitar o valor antigo no
 * reload (a leitura efetiva prioriza equipamento.*). Só este espelho tem
 * semântica de mesclagem no `patchPayload` — as demais chaves de topo seguem
 * o intent.
 */
export function mesclarEspelhoEquipamento(
  atual: unknown,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const base = atual && typeof atual === "object" ? { ...(atual as Record<string, unknown>) } : {};
  const next: Record<string, unknown> = { ...base };
  for (const k of Object.keys(patch)) {
    if (patch[k] === undefined) delete next[k];
    else next[k] = patch[k];
  }
  return next;
}

/**
 * Puro: monta o patch do espelho `equipamento` a partir do intent de
 * identificação já sanitizado. Valores definidos espelham (modelo→modelo,
 * imei→numeroSerie, cor→cor); limpeza explícita (`limpar`) espelha com
 * `undefined` para remover a chave do equipamento (ver
 * `mesclarEspelhoEquipamento`). Serial/operadora não têm espelho (vivem só na
 * prova). Chaves alheias do equipamento nunca são tocadas aqui.
 */
export function espelhoPatchIdentificacao(
  valores: Partial<IdentificacaoV3>,
  limpar?: (keyof IdentificacaoV3)[],
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (typeof valores.modelo === "string" && valores.modelo.trim()) patch.modelo = valores.modelo;
  if (typeof valores.imei === "string" && valores.imei.trim()) patch.numeroSerie = valores.imei;
  if (typeof valores.cor === "string" && valores.cor.trim()) patch.cor = valores.cor;
  for (const k of limpar ?? []) {
    if (k === "modelo") patch.modelo = undefined;
    else if (k === "imei") patch.numeroSerie = undefined;
    else if (k === "cor") patch.cor = undefined;
  }
  return patch;
}

/** Código do erro explícito de concorrência (outra sessão gravou no meio). */
export const CONFLITO_CONCORRENCIA_V3 = "CONFLITO_CONCORRENCIA";

export function erroConflitoConcorrenciaV3(recurso: string, campos?: string[]): Error {
  const detalhe = campos && campos.length > 0 ? ` (campo(s): ${campos.join(", ")})` : "";
  const e = new Error(
    `A OS foi alterada por outra sessão enquanto você editava ${recurso}${detalhe}. Recarregue a OS e revise antes de salvar — suas alterações foram preservadas na tela.`,
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

export function patchTocadoCredenciais(
  input: Partial<CredenciaisEntradaV3>,
  semente: EntradaCredenciaisEditorV4,
): PatchTocadoCredenciais {
  const texto = patchTocadoTextoCredenciais(
    {
      pin: input.pin,
      senha: input.senha,
      contaGoogle: input.contaGoogle,
      contaApple: input.contaApple,
    },
    { pin: semente.pin, senha: semente.senha, contaGoogle: semente.contaGoogle, contaApple: semente.contaApple },
  );
  const valores: Partial<CredenciaisEntradaV3> = { ...texto.valores };
  const esperados: Partial<CredenciaisEntradaV3> = { ...texto.esperados };
  if (input.senhaTipo !== undefined && input.senhaTipo !== semente.senhaTipo) {
    valores.senhaTipo = input.senhaTipo;
    esperados.senhaTipo = semente.senhaTipo;
  }
  if (input.faceId !== undefined && input.faceId !== semente.faceId) {
    valores.faceId = input.faceId;
    esperados.faceId = semente.faceId;
  }
  if (input.biometria !== undefined && input.biometria !== semente.biometria) {
    valores.biometria = input.biometria;
    esperados.biometria = semente.biometria;
  }
  return { valores, limpar: texto.limpar, esperados };
}

function patchTocadoTextoCredenciais(
  input: Partial<Record<ChaveCredTexto, string | undefined>>,
  semente: Record<ChaveCredTexto, string>,
): PatchTocadoCredenciais {
  const valores: Partial<CredenciaisEntradaV3> = {};
  const limpar: (keyof CredenciaisEntradaV3)[] = [];
  const esperados: Partial<CredenciaisEntradaV3> = {};
  for (const k of CHAVES_CRED_TEXTO) {
    const novo = (input[k] ?? "").trim();
    const base = (semente[k] ?? "").trim();
    if (novo === base) continue;
    esperados[k] = base;
    if (novo === "") limpar.push(k);
    else valores[k] = novo;
  }
  return { valores, limpar, esperados };
}

// ---- Intenção tocada (R02 — pura, testável) ---------------------------------
//
// Filtra o input pelos campos REALMENTE alterados contra a semente do
// servidor: não tocado nunca entra no intent (nunca escreve); tocado carrega
// a baseline (`esperados`) para a conferência no servidor. O wrapper monta o
// intent; a action confere e aplica.

const CHAVES_IDENTIFICACAO = ["imei", "serial", "operadora", "modelo", "cor"] as const;
type ChaveIdentificacao = (typeof CHAVES_IDENTIFICACAO)[number];

const CHAVES_CRED_TEXTO = ["pin", "senha", "contaGoogle", "contaApple"] as const;
type ChaveCredTexto = (typeof CHAVES_CRED_TEXTO)[number];

export interface PatchTocadoIdentificacao {
  valores: Partial<IdentificacaoV3>;
  limpar: (keyof IdentificacaoV3)[];
  esperados: Partial<IdentificacaoV3>;
}

export interface PatchTocadoCredenciais {
  valores: Partial<CredenciaisEntradaV3>;
  limpar: (keyof CredenciaisEntradaV3)[];
  esperados: Partial<CredenciaisEntradaV3>;
}

export function patchTocadoIdentificacao(
  input: Partial<IdentificacaoV3>,
  semente: Record<ChaveIdentificacao, string>,
): PatchTocadoIdentificacao {
  const valores: Partial<IdentificacaoV3> = {};
  const limpar: (keyof IdentificacaoV3)[] = [];
  const esperados: Partial<IdentificacaoV3> = {};
  for (const k of CHAVES_IDENTIFICACAO) {
    const novo = (input[k] ?? "").trim();
    const base = (semente[k] ?? "").trim();
    if (novo === base) continue;
    esperados[k] = base;
    if (novo === "") limpar.push(k);
    else valores[k] = novo;
  }
  return { valores, limpar, esperados };
}

/** Fatia de lista tocada? Compara por valor (semente do servidor). */
export function fatiaTocada(atual: unknown, semente: unknown): boolean {
  return !igualValorV4(atual ?? null, semente ?? null);
}

// ---- Montagem estrita dos dados básicos (R02 — pura, testável) -------------
//
// Casa pura do write-path de dados básicos: mesma sanitização/validação,
// aplicada SOMENTE aos campos com baseline (`esperados`); sem baseline, o
// campo preserva o LATEST (nunca escreve). Com baseline, confere antes de
// aplicar (divergiu = CONFLITO_CONCORRENCIA com o campo nomeado). Vive aqui —
// e não no `"use server"` — porque precisa ser importável por testes e o
// Next só permite exportar funções assíncronas de server-actions.

export type EsperadosDadosBasicosV3 = Partial<
  Record<
    | "defeitoRelatado"
    | "prioridade"
    | "origem"
    | "localFisico"
    | "recebidoPor"
    | "observacoes"
    | "previsaoEntrega",
    string
  >
>;

type PayloadSoltoV4 = Record<string, unknown> & {
  timeline?: EventoTimeline[];
  criadoEm?: string;
};

function eventoDbV4(operador: string): EventoTimeline {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `ev_${Date.now()}`;
  return {
    id,
    tipo: "observacao",
    autor: operador,
    autorTipo: "usuario",
    conteudo: "Dados básicos da OS atualizados (recepção).",
    metadata: { evento: "dados_basicos_atualizados" },
    criadoEm: new Date().toISOString(),
  };
}

export function montarProximosDadosBasicos(
  payload: OrdemServico & Record<string, unknown>,
  input: SalvarDadosBasicosInputV3,
  operador: string,
  esperados?: EsperadosDadosBasicosV3,
): { next: OrdemServico & Record<string, unknown>; defeito: string } {
  const solto = payload as unknown as PayloadSoltoV4;
  const aberturaAtual =
    solto.aberturaV3 && typeof solto.aberturaV3 === "object"
      ? (solto.aberturaV3 as Record<string, unknown>)
      : {};
  const recepcaoAtual =
    aberturaAtual.recepcao && typeof aberturaAtual.recepcao === "object"
      ? (aberturaAtual.recepcao as Record<string, unknown>)
      : {};
  const slaAtual =
    solto.sla && typeof solto.sla === "object" ? (solto.sla as unknown as Record<string, unknown>) : {};
  const equipamentoAtual =
    solto.equipamento && typeof solto.equipamento === "object"
      ? (solto.equipamento as unknown as Record<string, unknown>)
      : {};

  const esp = esperados ?? {};
  const emConflito: string[] = [];
  const usar = (campo: keyof EsperadosDadosBasicosV3, atualLatest: string, novoSanitizado: string): string => {
    if (esp[campo] === undefined) return atualLatest;
    if ((atualLatest ?? "") !== (esp[campo] ?? "")) {
      emConflito.push(`dadosBasicos.${campo}`);
      return atualLatest;
    }
    return novoSanitizado;
  };
  const txt = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

  const defeito = usar("defeitoRelatado", txt(equipamentoAtual.defeitoRelatado), txt(input?.defeitoRelatado));
  const prioridade = usar(
    "prioridade",
    txt(recepcaoAtual.prioridade) || txt((payload as Record<string, unknown>).prioridade),
    isPrioridadeV3(input?.prioridade) ? (input?.prioridade as string) : "media",
  );
  const origem = usar(
    "origem",
    txt(recepcaoAtual.origem) || txt((payload as Record<string, unknown>).origem),
    isOrigemV3(input?.origem) ? (input?.origem as string) : "balcao",
  );
  const localFisico = usar(
    "localFisico",
    txt(recepcaoAtual.localFisico),
    isLocalFisicoV3(input?.localFisico) ? (input?.localFisico as string) : "balcao",
  );
  const recebidoPor = usar("recebidoPor", txt(recepcaoAtual.recebidoPor), txt(input?.recebidoPor));
  const observacoes = usar("observacoes", txt(aberturaAtual.observacoesInternas), txt(input?.observacoes));
  const prazoLatest = txt(recepcaoAtual.previsaoEntrega) || txt(slaAtual.prazo);
  const previsao = txt(input?.previsaoEntrega);
  if (esp.previsaoEntrega !== undefined && prazoLatest !== (esp.previsaoEntrega ?? "")) {
    emConflito.push("dadosBasicos.previsaoEntrega");
  }
  if (emConflito.length > 0) throw erroConflitoConcorrenciaV3("os dados básicos", emConflito);
  const previsaoFinal = previsao || prazoLatest;
  const sla = previsao ? { ...slaAtual, prazo: previsao } : slaAtual;

  const equipamento = { ...equipamentoAtual, defeitoRelatado: defeito };

  const aberturaV3 = {
    ...aberturaAtual,
    recepcao: {
      ...recepcaoAtual,
      dataEntrada: txt(recepcaoAtual.dataEntrada) || txt(solto.criadoEm) || new Date().toISOString(),
      origem,
      recebidoPor: recebidoPor || undefined,
      prioridade,
      localFisico,
      previsaoEntrega: previsaoFinal || undefined,
    },
    observacoesInternas: observacoes || undefined,
  };

  const timeline: EventoTimeline[] = Array.isArray(solto.timeline) ? solto.timeline : [];
  const next = {
    ...(payload as Record<string, unknown>),
    equipamento,
    prioridade,
    origem: collapseOrigemV3(origem as Parameters<typeof collapseOrigemV3>[0]),
    sla,
    aberturaV3,
    timeline: [...timeline, eventoDbV4(operador)],
    atualizadoEm: new Date().toISOString(),
  } as unknown as OrdemServico & Record<string, unknown>;

  return { next, defeito };
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
