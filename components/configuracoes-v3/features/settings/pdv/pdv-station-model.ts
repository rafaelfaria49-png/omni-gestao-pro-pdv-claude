/**
 * Modelo da aba Configurações → PDV e impressão (“Estação de caixa”).
 *
 * As regras de leitura e gravação são as mesmas da implementação anterior (`PdvSection`,
 * `ImpressaoPdvSettingsCard`, `PdvScaleVisorSettingsCard`): mesmas chaves de `printerConfig`,
 * mesma precedência servidor → espelho local e mesmo PUT parcial (só o que mudou).
 */
import type { LucideIcon } from "lucide-react"
import { Cpu, LayoutGrid, Store, Wrench } from "lucide-react"
import type { PdvImpressaoConfig } from "@/lib/pdv-impressao-config"
import {
  DEFAULT_PDV_SCAN_UNREGISTERED_ACTION,
  normalizePdvScanUnregisteredAction,
  type PdvScanUnregisteredAction,
} from "@/lib/pdv-scan-unregistered-action"
import { readPdvMainLayout } from "@/lib/pdv-layout-storage"
import { readOmnigestaoPdvModoPreferencia } from "@/lib/omnigestao-pdv-modo"

export type PdvFlowId = "classico" | "assistencia" | "supermercado" | "next"
export type ClassicModoInicial = "normal" | "rapido"

/**
 * Espelho em `printerConfig` só para compatibilidade com a UI V3 / relatórios.
 * Valores oficiais gravados: `classico` | `assistencia` | `supermercado`.
 * Legado lido: `rapido` (tratado como Classic + modo rápido), `ia` → assistência.
 * O runtime do PDV em `/dashboard/vendas` usa `@omnigestao:pdv-layout`, `omni-pdv-classic-layout` e `omnigestao-pdv-modo`, não este campo isoladamente.
 */
export const V3_PDV_SECTION_CARD_KEY = "v3PdvSectionCard"
/** Espelho V3 do modo inicial no PDV Clássico/Omni (`normal` | `rapido`). */
export const V3_PDV_CLASSIC_MODO_KEY = "v3PdvClassicModoInicial"
/** Chave canônica (GOAL 007): ação do PDV ao bipar produto não cadastrado (server-first por unidade). */
export const PDV_SCAN_UNREGISTERED_KEY = "pdvScanUnregisteredAction"

export type PdvFlowOption = {
  id: PdvFlowId
  name: string
  description: string
  whenToUse: string
  icon: LucideIcon
  route: string
  /** Há capturas reais do PDV por tema em `public/images/pdv-<id>/<tema>.png`. */
  realShots: boolean
  testId: string
}

export const PDV_FLOWS: PdvFlowOption[] = [
  {
    id: "classico",
    name: "PDV Clássico",
    description: "Grade de produtos, leitor de código de barras, atalhos e totalizadores à vista.",
    whenToUse: "Ideal para atendimento de balcão rápido com alta variedade de itens.",
    icon: LayoutGrid,
    route: "/dashboard/vendas",
    realShots: false,
    testId: "pdv-classic",
  },
  {
    id: "assistencia",
    name: "PDV Assistência",
    description: "Fluxo focado em ordens de serviço, controle de peças e orçamentos integrados.",
    whenToUse: "Indicado para prestadores de serviços, oficinas e assistência técnica.",
    icon: Wrench,
    route: "/dashboard/vendas",
    realShots: true,
    testId: "pdv-assistencia",
  },
  {
    id: "supermercado",
    name: "PDV Rápido / Grade",
    description: "Caixa de alto giro no modelo de grade de produtos rápida com tabela de itens.",
    whenToUse: "Ideal para lojas de assistência, acessórios, variedades e faturamentos rápidos.",
    icon: Store,
    route: "/dashboard/vendas",
    realShots: false,
    testId: "pdv-supermercado",
  },
  {
    id: "next",
    name: "PDV Next",
    description: "Layout premium moderno com multi-temas (Light, Midnight, Black e Ice).",
    whenToUse: "Experiência premium de alta produtividade e performance visual.",
    icon: Cpu,
    route: "/dashboard/pdv-next",
    realShots: true,
    testId: "pdv-black-edition",
  },
]

export const flowById = (id: PdvFlowId): PdvFlowOption => PDV_FLOWS.find((f) => f.id === id) ?? PDV_FLOWS[0]

export const SCAN_OPTIONS: { id: PdvScanUnregisteredAction; title: string; description: string; short: string }[] = [
  {
    id: "warn_continue",
    title: "Avisar e continuar",
    description: "Mostra o aviso sobre o campo e deixa o caixa livre para o próximo bipe.",
    short: "Avisar e continuar",
  },
  {
    id: "warn_offer_avulso",
    title: "Avisar e oferecer Item Avulso",
    description: "Além do aviso, indica a tecla Insert, que abre o Item Avulso já com o código lido.",
    short: "Avisar e oferecer avulso",
  },
  {
    id: "open_avulso",
    title: "Abrir Item Avulso automaticamente",
    description: "Confirmado que o código não existe, abre o Item Avulso com o código preenchido. Não cadastra produto.",
    short: "Abrir avulso sozinho",
  },
]

export const DEFAULT_SCAN = DEFAULT_PDV_SCAN_UNREGISTERED_ACTION

/* ── Leitura do printerConfig: mesma precedência da implementação anterior ── */

function readLocalPdvMain(storeId: string | null | undefined): "classic" | "supermercado" | "next" {
  const fromScoped = readPdvMainLayout(storeId)
  if (fromScoped) return fromScoped
  return "classic"
}

function isOfficialFlowCard(v: unknown): v is PdvFlowId {
  return v === "classico" || v === "assistencia" || v === "supermercado" || v === "next"
}

export function resolveFlowFromPrinterConfig(
  printerConfig: Record<string, unknown> | null,
  storeId: string | null | undefined,
): PdvFlowId {
  const rawCard = printerConfig?.[V3_PDV_SECTION_CARD_KEY]
  if (rawCard === "ia") return "assistencia"
  if (rawCard === "rapido") return "classico"
  if (isOfficialFlowCard(rawCard)) return rawCard

  if (readLocalPdvMain(storeId) === "supermercado") return "supermercado"
  if (readLocalPdvMain(storeId) === "next") return "next"

  const pdvParamsRaw = printerConfig?.pdvParams
  const pdvParams =
    pdvParamsRaw && typeof pdvParamsRaw === "object" ? (pdvParamsRaw as Record<string, unknown>) : null
  if (pdvParams?.pdvClassicLayout === "services") return "assistencia"

  return "classico"
}

export function resolveClassicModoInicial(
  printerConfig: Record<string, unknown> | null,
  flow: PdvFlowId,
  storeId: string | null | undefined,
): ClassicModoInicial {
  if (flow !== "classico") return "normal"

  const rawCard = printerConfig?.[V3_PDV_SECTION_CARD_KEY]
  if (rawCard === "rapido") return "rapido"

  const mirror = printerConfig?.[V3_PDV_CLASSIC_MODO_KEY]
  if (mirror === "rapido" || mirror === "normal") return mirror

  return readOmnigestaoPdvModoPreferencia(storeId) === "rapido" ? "rapido" : "normal"
}

export function safePrinterRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? { ...(raw as Record<string, unknown>) } : {}
}

/* ── Bloco “caixa”: fluxo, modo inicial do Clássico e ação do leitor ─────── */

export type CaixaDraft = { flow: PdvFlowId; modo: ClassicModoInicial; scan: PdvScanUnregisteredAction }

export function readCaixa(printerConfig: Record<string, unknown>, storeId: string | null | undefined): CaixaDraft {
  const flow = resolveFlowFromPrinterConfig(printerConfig, storeId)
  return {
    flow,
    modo: resolveClassicModoInicial(printerConfig, flow, storeId),
    scan: normalizePdvScanUnregisteredAction(printerConfig[PDV_SCAN_UNREGISTERED_KEY]),
  }
}

/** Modo efetivamente gravado: fora do Clássico é sempre `normal`. */
export const effectiveModo = (d: CaixaDraft): ClassicModoInicial => (d.flow === "classico" ? d.modo : "normal")

/**
 * PUT parcial do bloco “caixa”: somente as chaves desta tela que mudaram. O servidor preserva o
 * restante de `printerConfig` e funde `pdvParams`; reenviar o snapshot da montagem desfaria
 * gravações posteriores de outras seções (impressão, vendas, aparência).
 */
export function caixaPatch(saved: CaixaDraft, draft: CaixaDraft): Record<string, unknown> | null {
  const modo = effectiveModo(draft)
  const flowChanged = draft.flow !== saved.flow || modo !== saved.modo
  const patch: Record<string, unknown> = {
    ...(flowChanged
      ? {
          pdvParams: { pdvClassicLayout: draft.flow === "assistencia" ? "services" : "lovable" },
          [V3_PDV_SECTION_CARD_KEY]: draft.flow,
          [V3_PDV_CLASSIC_MODO_KEY]: modo,
        }
      : {}),
    ...(draft.scan !== saved.scan ? { [PDV_SCAN_UNREGISTERED_KEY]: draft.scan } : {}),
  }
  return Object.keys(patch).length ? patch : null
}

/* ── Bloco “impressão” ────────────────────────────────────────────────────── */

export function normalizeImpressao(form: PdvImpressaoConfig): PdvImpressaoConfig {
  return {
    ...form,
    impressoraHost: form.impressoraHost.trim(),
    impressoraPorta: Math.min(65535, Math.max(1, Math.round(form.impressoraPorta) || 9100)),
    rodapeCupom: form.rodapeCupom.trim(),
    viasCupom: Math.min(5, Math.max(1, Math.round(form.viasCupom) || 1)),
  }
}

/* ── Blocos independentes da barra de alterações ─────────────────────────── */

export type PdvBlockId = "caixa" | "balanca" | "impressao"

export const PDV_BLOCK_LABEL: Record<PdvBlockId, string> = {
  caixa: "Tela do caixa e leitor",
  balanca: "Balança",
  impressao: "Impressão",
}

export type PdvFailure = { block: PdvBlockId; message: string }

/** Visor de peso: salvo e rascunho num só estado, sempre de UMA unidade. */
export type VisorState = { storeId: string; savedValue: boolean; draft: boolean }

export const VISOR_SAVED_MSG = "Preferência do visor salva nesta unidade."
export const VISOR_FAILED_MSG =
  "Não foi possível salvar o visor de peso. Suas alterações continuam pendentes; tente novamente."

/** A ponte TCP (/api/print/raw) é interna: plataforma imprime por ela; o cliente, pelo navegador. */
export type PrintMode = "platform" | "browser" | null

/* ── Resumo da estação: “em vigor → novo” ─────────────────────────────────── */

export type AnchorId = "tela" | "leitor" | "balanca" | "impressao" | "atalhos"
export type StationSpec = { anchor: AnchorId; label: string; from: string; to: string }

const flowShort = (c: CaixaDraft) => {
  const name = flowById(c.flow).name.replace("PDV ", "")
  return c.flow === "classico" ? `${name} · ${c.modo === "rapido" ? "Simplificado" : "Completo"}` : name
}
const scanShort = (s: PdvScanUnregisteredAction) => SCAN_OPTIONS.find((o) => o.id === s)?.short ?? ""
const visorLabel = (v: boolean) => (v ? "Visor visível" : "Visor oculto")

export function buildStationSpecs(i: {
  caixaSaved: CaixaDraft
  caixa: CaixaDraft
  visor: Pick<VisorState, "savedValue" | "draft"> | null
  showScale: boolean
  printMode: PrintMode
  impSaved: PdvImpressaoConfig
  imp: PdvImpressaoConfig
  /** App Windows com impressão direta disponível neste computador. */
  desktop: boolean
  /** Impressora salva neste computador (só com `desktop`). */
  desktopPrinter: string | null
}): StationSpec[] {
  const { printMode, desktop } = i
  const cupom = (c: PdvImpressaoConfig) =>
    `${c.bobinaTamanho === "58mm" ? "58" : "80"} mm · ${c.comprovanteModo}${printMode === "platform" ? ` · ${c.viasCupom} via${c.viasCupom > 1 ? "s" : ""}` : ""}`
  const printerLabel = (c: PdvImpressaoConfig) =>
    desktop
      ? i.desktopPrinter || "Navegador (sem impressora)"
      : printMode === "platform"
        ? c.impressoraHost.trim()
          ? `${c.impressoraHost.trim()}:${c.impressoraPorta}`
          : "Servidor (THERMAL_PRINT_HOST)"
        : "Navegador"
  const automation = (c: PdvImpressaoConfig) =>
    printMode === "platform"
      ? `${c.imprimirAutomatico ? "Automático" : "Manual"} · gaveta ${c.abrirGaveta ? "sim" : "não"}`
      : desktop
        ? c.imprimirAutomatico
          ? "Automático"
          : "Manual"
        : "Manual (navegador)"
  return [
    { anchor: "tela", label: "PDV", from: flowShort(i.caixaSaved), to: flowShort(i.caixa) },
    { anchor: "leitor", label: "Leitor", from: scanShort(i.caixaSaved.scan), to: scanShort(i.caixa.scan) },
    ...(i.showScale && i.visor
      ? [{ anchor: "balanca" as const, label: "Balança", from: visorLabel(i.visor.savedValue), to: visorLabel(i.visor.draft) }]
      : []),
    ...(printMode
      ? [
          { anchor: "impressao" as const, label: "Cupom", from: cupom(i.impSaved), to: cupom(i.imp) },
          { anchor: "impressao" as const, label: "Impressora", from: printerLabel(i.impSaved), to: printerLabel(i.imp) },
          { anchor: "impressao" as const, label: "Automação", from: automation(i.impSaved), to: automation(i.imp) },
        ]
      : []),
  ]
}

/* ── Venda de exemplo da prévia (sintética, sem valor fiscal) ─────────────── */

export const SAMPLE_SALE = {
  numeroVenda: "EXEMPLO-0001",
  operador: "Operador",
  itens: [
    { name: "Produto de exemplo 1", quantity: 1, lineTotal: 39.9 },
    { name: "Produto de exemplo 2", quantity: 1, lineTotal: 59.9 },
    { name: "Produto de exemplo 3", quantity: 2, lineTotal: 29.9 },
  ],
  subtotal: 129.7,
  total: 129.7,
  pagamentos: [{ label: "PIX", valor: 129.7 }],
}

export const brl = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n)

/** Colunas do ESC/POS por bobina (= `BOBINA_CHARS`). */
export const COLS = { "58mm": 32, "80mm": 48 } as const
