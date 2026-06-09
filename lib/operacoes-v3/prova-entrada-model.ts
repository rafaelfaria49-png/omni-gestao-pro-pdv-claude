// ============================================================================
// Operações V3 — SPRINT_3E.1 · PROVA DE ENTRADA (modelo puro)
// ----------------------------------------------------------------------------
// Documentação estruturada e auditável do aparelho NA ENTRADA — o maior gap vs
// Gestão Click / Smart System (AUDITORIA_GAP). Módulo PURO (sem I/O, sem React).
// Tudo vive em `payload.provaEntradaV3` (JSONB) — SEM schema/migration. Os campos
// são opcionais e sobrevivem ao spread do payload → compatível com OS existentes.
//
// Conteúdo:
//   1. estado físico estruturado (componente → ok/avariado/ausente)
//   2. mapa de avarias (risco/trinca/amassado/falta + local em texto, sem canvas)
//   3. fotos da entrada (frontal/traseira/lateral/defeito) — data URL downscaled
//   4. credenciais (PIN/senha/Conta Google/Apple/Face ID/biometria)
//   5. acessórios recebidos (checklist)
// ============================================================================

import type { OrdemServico } from "@/types/os";

// ----------------------------------------------------------------------------
// 1. Estado físico estruturado
// ----------------------------------------------------------------------------

export type ComponenteFisicoV3 =
  | "tela"
  | "tampa"
  | "carcaca"
  | "camera"
  | "botoes"
  | "conector"
  | "alto_falante"
  | "microfone";

export type EstadoFisicoStatusV3 = "ok" | "avariado" | "ausente";

export interface EstadoFisicoItemV3 {
  componente: ComponenteFisicoV3;
  status: EstadoFisicoStatusV3;
  obs?: string;
}

export const COMPONENTES_FISICOS_V3: { id: ComponenteFisicoV3; label: string }[] = [
  { id: "tela", label: "Tela" },
  { id: "tampa", label: "Tampa" },
  { id: "carcaca", label: "Carcaça" },
  { id: "camera", label: "Câmera" },
  { id: "botoes", label: "Botões" },
  { id: "conector", label: "Conector" },
  { id: "alto_falante", label: "Alto-falante" },
  { id: "microfone", label: "Microfone" },
];

export const ESTADO_FISICO_STATUS_META_V3: Record<EstadoFisicoStatusV3, { label: string; tone: "success" | "danger" | "warning" }> = {
  ok: { label: "OK", tone: "success" },
  avariado: { label: "Avariado", tone: "danger" },
  ausente: { label: "Ausente", tone: "warning" },
};

const COMPONENTE_LABEL = new Map(COMPONENTES_FISICOS_V3.map((c) => [c.id, c.label]));
export function componenteFisicoLabelV3(id: ComponenteFisicoV3): string {
  return COMPONENTE_LABEL.get(id) ?? id;
}

// ----------------------------------------------------------------------------
// 2. Avarias (mapa textual — sem canvas)
// ----------------------------------------------------------------------------

export type TipoAvariaV3 = "risco" | "trinca" | "amassado" | "falta";

export interface AvariaV3 {
  id: string;
  tipo: TipoAvariaV3;
  /** Onde no aparelho (texto livre: "canto inferior direito", "tela", ...). */
  local: string;
  descricao?: string;
}

export const TIPOS_AVARIA_V3: { id: TipoAvariaV3; label: string }[] = [
  { id: "risco", label: "Risco" },
  { id: "trinca", label: "Trinca" },
  { id: "amassado", label: "Amassado" },
  { id: "falta", label: "Falta / ausência" },
];

const AVARIA_LABEL = new Map(TIPOS_AVARIA_V3.map((a) => [a.id, a.label]));
export function tipoAvariaLabelV3(id: TipoAvariaV3): string {
  return AVARIA_LABEL.get(id) ?? id;
}

// ----------------------------------------------------------------------------
// 3. Fotos da entrada
// ----------------------------------------------------------------------------

export type CategoriaFotoV3 = "frontal" | "traseira" | "lateral" | "defeito";

export interface FotoEntradaV3 {
  id: string;
  categoria: CategoriaFotoV3;
  nome?: string;
  /** Imagem já reduzida (data URL JPEG). O cliente faz o downscale antes de salvar. */
  dataUrl: string;
  tamanho: number;
  criadoEm: string;
}

export const CATEGORIAS_FOTO_V3: { id: CategoriaFotoV3; label: string }[] = [
  { id: "frontal", label: "Frontal" },
  { id: "traseira", label: "Traseira" },
  { id: "lateral", label: "Lateral" },
  { id: "defeito", label: "Defeito" },
];

/** Limites para conter o tamanho do JSONB (data URL embarcada). */
export const FOTO_MAX_V3 = 8;
export const FOTO_MAX_BYTES_V3 = 400 * 1024; // ~400 KB por foto (já downscaled)

/** Estima os bytes de uma data URL base64. */
export function bytesDeDataUrlV3(dataUrl: string): number {
  const i = dataUrl.indexOf(",");
  const b64 = i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
  return Math.floor((b64.length * 3) / 4);
}

export interface VeredictoFotoV3 {
  ok: boolean;
  motivo?: string;
}

export function validarFotoEntradaV3(dataUrl: string, atuais: number): VeredictoFotoV3 {
  const v = (dataUrl ?? "").trim();
  if (!v.startsWith("data:image/")) return { ok: false, motivo: "Arquivo inválido — selecione uma imagem." };
  if (atuais >= FOTO_MAX_V3) return { ok: false, motivo: `Limite de ${FOTO_MAX_V3} fotos por OS atingido.` };
  if (bytesDeDataUrlV3(v) > FOTO_MAX_BYTES_V3) return { ok: false, motivo: "Imagem muito grande mesmo após compressão. Tente outra foto." };
  return { ok: true };
}

// ----------------------------------------------------------------------------
// 4. Credenciais
// ----------------------------------------------------------------------------

export type SenhaTipoV3 = "numerica" | "texto" | "padrao";

export interface CredenciaisEntradaV3 {
  pin?: string;
  senha?: string;
  senhaTipo?: SenhaTipoV3;
  /** Conta Google (login/e-mail) — relevante para FRP. */
  contaGoogle?: string;
  /** Conta Apple / iCloud (login/e-mail). */
  contaApple?: string;
  faceId?: boolean;
  biometria?: boolean;
}

// ----------------------------------------------------------------------------
// 5. Acessórios recebidos
// ----------------------------------------------------------------------------

export type AcessorioEntradaIdV3 = "chip" | "cartao_memoria" | "capinha" | "carregador" | "cabo" | "pelicula";

export interface AcessorioEntradaV3 {
  id: AcessorioEntradaIdV3;
  presente: boolean;
}

export const ACESSORIOS_ENTRADA_V3: { id: AcessorioEntradaIdV3; label: string; termos: string[] }[] = [
  { id: "chip", label: "Chip", termos: ["chip", "sim"] },
  { id: "cartao_memoria", label: "Cartão de memória", termos: ["cartão", "cartao", "memória", "memoria", "sd"] },
  { id: "capinha", label: "Capinha", termos: ["capinha", "capa", "case"] },
  { id: "carregador", label: "Carregador", termos: ["carregador", "fonte"] },
  { id: "cabo", label: "Cabo", termos: ["cabo"] },
  { id: "pelicula", label: "Película", termos: ["película", "pelicula"] },
];

const ACESSORIO_LABEL = new Map(ACESSORIOS_ENTRADA_V3.map((a) => [a.id, a.label]));
export function acessorioEntradaLabelV3(id: AcessorioEntradaIdV3): string {
  return ACESSORIO_LABEL.get(id) ?? id;
}

// ----------------------------------------------------------------------------
// Agregado
// ----------------------------------------------------------------------------

export interface ProvaEntradaV3 {
  versao: number;
  criadoEm: string;
  criadoPor?: string;
  atualizadoEm?: string;
  estadoFisico: EstadoFisicoItemV3[];
  avarias: AvariaV3[];
  fotos: FotoEntradaV3[];
  credenciais: CredenciaisEntradaV3;
  acessorios: AcessorioEntradaV3[];
}

function s(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function isStatus(v: unknown): v is EstadoFisicoStatusV3 {
  return v === "ok" || v === "avariado" || v === "ausente";
}
function isComponente(v: unknown): v is ComponenteFisicoV3 {
  return COMPONENTE_LABEL.has(v as ComponenteFisicoV3);
}
function isTipoAvaria(v: unknown): v is TipoAvariaV3 {
  return AVARIA_LABEL.has(v as TipoAvariaV3);
}
function isCategoriaFoto(v: unknown): v is CategoriaFotoV3 {
  return v === "frontal" || v === "traseira" || v === "lateral" || v === "defeito";
}

export function estadoFisicoPadraoV3(): EstadoFisicoItemV3[] {
  return COMPONENTES_FISICOS_V3.map((c) => ({ componente: c.id, status: "ok" as EstadoFisicoStatusV3 }));
}

/** Semeia acessórios a partir dos acessórios já informados na abertura (compat). */
function sementeAcessoriosV3(os: OrdemServico | null | undefined): AcessorioEntradaV3[] {
  const lista = Array.isArray(os?.equipamento?.acessorios)
    ? os!.equipamento.acessorios.map((a) => s(a).toLowerCase()).filter(Boolean)
    : [];
  return ACESSORIOS_ENTRADA_V3.map((a) => ({
    id: a.id,
    presente: lista.some((item) => a.termos.some((t) => item.includes(t))),
  }));
}

/** Semeia credenciais a partir da senha já capturada na abertura (compat). */
function sementeCredenciaisV3(os: OrdemServico | null | undefined): CredenciaisEntradaV3 {
  const senha = s(os?.senhaEquipamento);
  const tipo = os?.senhaEquipamentoTipo;
  const senhaTipo: SenhaTipoV3 | undefined = tipo === "numerica" || tipo === "texto" || tipo === "padrao" ? tipo : undefined;
  return senha ? { senha, senhaTipo } : {};
}

function normalizarEstadoFisico(raw: unknown): EstadoFisicoItemV3[] {
  const arr = Array.isArray(raw) ? raw : [];
  const porId = new Map<ComponenteFisicoV3, EstadoFisicoItemV3>();
  for (const it of arr) {
    const o = (it ?? {}) as Record<string, unknown>;
    if (!isComponente(o.componente)) continue;
    porId.set(o.componente, {
      componente: o.componente,
      status: isStatus(o.status) ? o.status : "ok",
      obs: s(o.obs) || undefined,
    });
  }
  // Sempre devolve os 8 componentes na ordem oficial (preenche faltantes com OK).
  return COMPONENTES_FISICOS_V3.map((c) => porId.get(c.id) ?? { componente: c.id, status: "ok" });
}

function normalizarAvarias(raw: unknown): AvariaV3[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((it): AvariaV3 | null => {
      const o = (it ?? {}) as Record<string, unknown>;
      const id = s(o.id);
      if (!id || !isTipoAvaria(o.tipo)) return null;
      return { id, tipo: o.tipo, local: s(o.local), descricao: s(o.descricao) || undefined };
    })
    .filter((a): a is AvariaV3 => a !== null);
}

function normalizarFotos(raw: unknown): FotoEntradaV3[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((it): FotoEntradaV3 | null => {
      const o = (it ?? {}) as Record<string, unknown>;
      const id = s(o.id);
      const dataUrl = s(o.dataUrl);
      if (!id || !isCategoriaFoto(o.categoria) || !dataUrl.startsWith("data:image/")) return null;
      return {
        id,
        categoria: o.categoria,
        nome: s(o.nome) || undefined,
        dataUrl,
        tamanho: typeof o.tamanho === "number" ? o.tamanho : bytesDeDataUrlV3(dataUrl),
        criadoEm: s(o.criadoEm),
      };
    })
    .filter((f): f is FotoEntradaV3 => f !== null);
}

function normalizarCredenciais(raw: unknown): CredenciaisEntradaV3 {
  const o = (raw ?? {}) as Record<string, unknown>;
  const tipo = o.senhaTipo;
  return {
    pin: s(o.pin) || undefined,
    senha: s(o.senha) || undefined,
    senhaTipo: tipo === "numerica" || tipo === "texto" || tipo === "padrao" ? tipo : undefined,
    contaGoogle: s(o.contaGoogle) || undefined,
    contaApple: s(o.contaApple) || undefined,
    faceId: o.faceId === true ? true : o.faceId === false ? false : undefined,
    biometria: o.biometria === true ? true : o.biometria === false ? false : undefined,
  };
}

function normalizarAcessorios(raw: unknown, os: OrdemServico | null | undefined): AcessorioEntradaV3[] {
  if (!Array.isArray(raw)) return sementeAcessoriosV3(os);
  const porId = new Map<AcessorioEntradaIdV3, boolean>();
  for (const it of raw) {
    const o = (it ?? {}) as Record<string, unknown>;
    if (ACESSORIO_LABEL.has(o.id as AcessorioEntradaIdV3)) porId.set(o.id as AcessorioEntradaIdV3, o.presente === true);
  }
  return ACESSORIOS_ENTRADA_V3.map((a) => ({ id: a.id, presente: porId.get(a.id) ?? false }));
}

/**
 * Lê a Prova de Entrada da OS. Quando ausente, devolve um esqueleto NÃO-criado
 * (`versao: 0`, `criadoEm: ""`) semeado com o que já existe (senha/acessórios da
 * abertura) — sem inventar avarias/estado. Garante os 8 componentes sempre.
 */
export function lerProvaEntradaV3(os: OrdemServico | null | undefined): ProvaEntradaV3 {
  const raw = (os as { provaEntradaV3?: unknown } | null | undefined)?.provaEntradaV3 as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== "object") {
    return {
      versao: 0,
      criadoEm: "",
      estadoFisico: estadoFisicoPadraoV3(),
      avarias: [],
      fotos: [],
      credenciais: sementeCredenciaisV3(os),
      acessorios: sementeAcessoriosV3(os),
    };
  }
  return {
    versao: typeof raw.versao === "number" ? raw.versao : 1,
    criadoEm: s(raw.criadoEm),
    criadoPor: s(raw.criadoPor) || undefined,
    atualizadoEm: s(raw.atualizadoEm) || undefined,
    estadoFisico: normalizarEstadoFisico(raw.estadoFisico),
    avarias: normalizarAvarias(raw.avarias),
    fotos: normalizarFotos(raw.fotos),
    credenciais: normalizarCredenciais(raw.credenciais),
    acessorios: normalizarAcessorios(raw.acessorios, os),
  };
}

/** true quando a OS já tem uma prova de entrada criada (algum write real). */
export function provaEntradaCriadaV3(os: OrdemServico | null | undefined): boolean {
  const raw = (os as { provaEntradaV3?: unknown } | null | undefined)?.provaEntradaV3 as Record<string, unknown> | undefined;
  return !!raw && typeof raw === "object" && (typeof raw.versao === "number" ? raw.versao > 0 : !!s(raw.criadoEm));
}

// ----------------------------------------------------------------------------
// Resumos + máscara (impressão)
// ----------------------------------------------------------------------------

export interface ResumoEstadoFisicoV3 {
  ok: number;
  avariado: number;
  ausente: number;
  total: number;
}

export function resumoEstadoFisicoV3(itens: EstadoFisicoItemV3[]): ResumoEstadoFisicoV3 {
  return {
    ok: itens.filter((i) => i.status === "ok").length,
    avariado: itens.filter((i) => i.status === "avariado").length,
    ausente: itens.filter((i) => i.status === "ausente").length,
    total: itens.length,
  };
}

/** Mascarar PIN/senha curtos → bolinhas (sem revelar o tamanho exato). */
export function mascararSegredoV3(v?: string): string {
  const t = s(v);
  if (!t) return "";
  return "•".repeat(Math.min(8, Math.max(4, t.length)));
}

/** Mascarar conta/e-mail → mantém 2 primeiras letras + domínio. */
export function mascararContaV3(v?: string): string {
  const t = s(v);
  if (!t) return "";
  const at = t.indexOf("@");
  if (at > 0) {
    const user = t.slice(0, at);
    const dom = t.slice(at);
    const head = user.slice(0, Math.min(2, user.length));
    return `${head}${"•".repeat(Math.max(2, user.length - 2))}${dom}`;
  }
  const head = t.slice(0, Math.min(2, t.length));
  return `${head}${"•".repeat(Math.max(2, t.length - 2))}`;
}

export interface CredencialMascaradaV3 {
  rotulo: string;
  valor: string;
}

/** Lista de credenciais já MASCARADAS para impressão (item 6). */
export function credenciaisMascaradasV3(c: CredenciaisEntradaV3): CredencialMascaradaV3[] {
  const out: CredencialMascaradaV3[] = [];
  if (s(c.pin)) out.push({ rotulo: "PIN", valor: mascararSegredoV3(c.pin) });
  if (s(c.senha)) out.push({ rotulo: c.senhaTipo === "padrao" ? "Senha (padrão)" : "Senha", valor: mascararSegredoV3(c.senha) });
  if (s(c.contaGoogle)) out.push({ rotulo: "Conta Google", valor: mascararContaV3(c.contaGoogle) });
  if (s(c.contaApple)) out.push({ rotulo: "Conta Apple", valor: mascararContaV3(c.contaApple) });
  if (c.faceId !== undefined) out.push({ rotulo: "Face ID", valor: c.faceId ? "Sim" : "Não" });
  if (c.biometria !== undefined) out.push({ rotulo: "Biometria", valor: c.biometria ? "Sim" : "Não" });
  return out;
}
