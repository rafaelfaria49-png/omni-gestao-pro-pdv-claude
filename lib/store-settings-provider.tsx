"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useLojaAtiva } from "@/lib/loja-ativa"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import type {
  PdvClassicLayoutKind,
  PdvMainLayoutKind,
  StoreCapabilitiesV1,
  StorePdvParams,
  StoreSettingsApi,
  StoreSettingsBlob,
  StoreSettingsPutPayload,
} from "@/lib/store-settings-types"
import {
  defaultPdvImpressaoConfig,
  parseImpressaoFromPrinterConfig,
  type PdvImpressaoConfig,
} from "@/lib/pdv-impressao-config"
import { defaultFormasPagamento, normalizeFormasPagamento } from "@/lib/pdv-formas-pagamento"
import { parseAppearanceFromPrinterConfig, type StoreAppearanceConfig } from "@/lib/store-appearance"
import { configPadrao, type CategoriaGarantia, type TermosGarantia } from "@/lib/config-empresa"
import {
  resolvePdvClassicLayoutServerFirst,
  resolvePdvMainLayoutServerFirst,
} from "@/lib/pdv-settings-server-first"

export type StoreSettingsContextType = {
  /** ID da unidade ativa; vazio quando nenhuma loja está selecionada (sem fallback silencioso). */
  storeId: string
  hydrated: boolean
  settings: StoreSettingsApi | null
  blob: StoreSettingsBlob
  pdvParams: StorePdvParams
  impressaoConfig: PdvImpressaoConfig
  termosGarantia: TermosGarantia
  appearance: StoreAppearanceConfig
  capabilities: StoreCapabilitiesV1 | null
  pdvMainLayout: PdvMainLayoutKind
  pdvClassicLayout: PdvClassicLayoutKind
  getGarantiaById: (id: string) => CategoriaGarantia | undefined
  refresh: () => Promise<void>
  save: (patch: StoreSettingsPutPayload) => Promise<void>
}

const StoreSettingsContext = createContext<StoreSettingsContextType | null>(null)

function safeObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {}
}

function parseBlob(printerConfig: unknown): StoreSettingsBlob {
  const o = safeObj(printerConfig)
  return {
    pdvParams: safeObj(o.pdvParams),
    termosGarantia: safeObj(o.termosGarantia),
    certificadoA1: safeObj(o.certificadoA1),
    aiMestreModel: typeof (o as any).aiMestreModel === "string" ? String((o as any).aiMestreModel).trim() : undefined,
    appearance: parseAppearanceFromPrinterConfig(printerConfig),
    capabilities: safeObj(o.capabilities).version === 1 ? (o.capabilities as StoreCapabilitiesV1) : undefined,
    pdvMainLayout:
      o.pdvMainLayout === "classic" || o.pdvMainLayout === "supermercado" || o.pdvMainLayout === "next"
        ? o.pdvMainLayout
        : undefined,
    v3PdvSectionCard: typeof o.v3PdvSectionCard === "string" ? o.v3PdvSectionCard : undefined,
    v3PdvClassicModoInicial:
      o.v3PdvClassicModoInicial === "rapido" || o.v3PdvClassicModoInicial === "normal"
        ? o.v3PdvClassicModoInicial
        : undefined,
  } as StoreSettingsBlob
}

const GARANTIA_LEGAL_CDC =
  "Garantia Legal de 90 dias para serviços e produtos duráveis, conforme o Código de Defesa do Consumidor (CDC)"

function defaultPdvParams(): StorePdvParams {
  return {
    atalhosRapidos: [],
    ocultarCategoriasNoPdv: !!configPadrao.pdv.ocultarCategoriasNoPdv,
    categoriasOcultasNoPdv: [...(configPadrao.pdv.categoriasOcultasNoPdv ?? [])],
    garantiaPadraoDias: configPadrao.pdv.garantiaPadraoDias,
    validadeOrcamentoDias: configPadrao.pdv.validadeOrcamentoDias,
    incluirImpostoEstimadoNoPdv: !!configPadrao.pdv.incluirImpostoEstimadoNoPdv,
    aliquotaImpostoEstimadoPdv: Number(configPadrao.pdv.aliquotaImpostoEstimadoPdv) || 0,
    moduloControleConsumo: !!configPadrao.pdv.moduloControleConsumo,
    pdvClassicLayout: "lovable",
    formasPagamento: defaultFormasPagamento(),
  }
}

function mergePdvParams(base: StorePdvParams, patch: Partial<StorePdvParams> | undefined): StorePdvParams {
  const p = patch ?? {}
  const layout =
    p.pdvClassicLayout === "services" || p.pdvClassicLayout === "lovable"
      ? p.pdvClassicLayout
      : base.pdvClassicLayout
  return {
    ...base,
    ...p,
    pdvClassicLayout: layout,
    atalhosRapidos: Array.isArray(p.atalhosRapidos) ? p.atalhosRapidos : base.atalhosRapidos,
    categoriasOcultasNoPdv: Array.isArray(p.categoriasOcultasNoPdv) ? p.categoriasOcultasNoPdv : base.categoriasOcultasNoPdv,
    formasPagamento: normalizeFormasPagamento(
      Array.isArray(p.formasPagamento) ? p.formasPagamento : base.formasPagamento,
    ),
  }
}

function mergeTermosGarantia(patch: unknown): TermosGarantia {
  const p = safeObj(patch)
  const categorias = Array.isArray((p as any).categorias) ? ((p as any).categorias as any[]) : configPadrao.termosGarantia.categorias
  const mergedCats: CategoriaGarantia[] = categorias.map((c) => ({
    id: String((c as any).id),
    servico: String((c as any).servico ?? ""),
    detalhes: String((c as any).detalhes ?? ""),
  }))
  const garantiaLegal = String((p as any).garantiaLegal ?? "").trim() || GARANTIA_LEGAL_CDC
  const tituloGeral = String((p as any).tituloGeral ?? "").trim() || configPadrao.termosGarantia.tituloGeral
  return { ...configPadrao.termosGarantia, tituloGeral, garantiaLegal, categorias: mergedCats }
}

export function StoreSettingsProvider({ children }: { children: ReactNode }) {
  const { lojaAtivaId, storesRefreshNonce } = useLojaAtiva()
  const storeId = useMemo(() => lojaAtivaId?.trim() ?? "", [lojaAtivaId])
  const [hydrated, setHydrated] = useState(false)
  const [settings, setSettings] = useState<StoreSettingsApi | null>(null)

  // Registro de backfill já tentado nesta sessão para cada loja (evita loops e repetições)
  const backfillAttemptedStoresRef = useRef<Set<string>>(new Set())

  const refresh = useCallback(async () => {
    setHydrated(false)
    if (!storeId) {
      setSettings(null)
      setHydrated(true)
      return
    }
    try {
      const r = await fetch(`/api/stores/${encodeURIComponent(storeId)}/settings`, {
        credentials: "include",
        cache: "no-store",
        headers: { [ASSISTEC_LOJA_HEADER]: storeId },
      })
      const j = (await r.json().catch(() => null)) as { settings?: StoreSettingsApi | null } | null
      setSettings(j?.settings ?? null)
    } catch {
      setSettings(null)
    } finally {
      setHydrated(true)
    }
  }, [storeId])

  // Ao trocar de loja: zera estado imediatamente (impede qualquer piscar de loja A em loja B)
  useEffect(() => {
    setSettings(null)
    setHydrated(false)
  }, [storeId])

  useEffect(() => {
    void refresh()
  }, [refresh, storesRefreshNonce])

  const blob = useMemo(() => parseBlob(settings?.printerConfig), [settings?.printerConfig])
  const pdvParams = useMemo(() => mergePdvParams(defaultPdvParams(), blob.pdvParams), [blob.pdvParams])
  const impressaoConfig = useMemo(
    () => parseImpressaoFromPrinterConfig(settings?.printerConfig),
    [settings?.printerConfig],
  )
  const appearance = useMemo(
    () => parseAppearanceFromPrinterConfig(settings?.printerConfig),
    [settings?.printerConfig],
  )
  const termosGarantia = useMemo(() => mergeTermosGarantia(blob.termosGarantia), [blob.termosGarantia])
  const getGarantiaById = useCallback(
    (id: string) => termosGarantia.categorias.find((c) => c.id === id),
    [termosGarantia.categorias]
  )

  // Resolução Server-First para layouts de PDV
  const resolvedMainLayout = useMemo(
    () => resolvePdvMainLayoutServerFirst(blob.pdvMainLayout || blob.v3PdvSectionCard, storeId),
    [blob.pdvMainLayout, blob.v3PdvSectionCard, storeId]
  )

  const resolvedClassicLayout = useMemo(
    () => resolvePdvClassicLayoutServerFirst(blob.pdvParams?.pdvClassicLayout, storeId),
    [blob.pdvParams?.pdvClassicLayout, storeId]
  )

  // ── Backfill controlado e idempotente (executa uma única vez se elegível) ──────
  useEffect(() => {
    if (!hydrated || !storeId) return
    if (backfillAttemptedStoresRef.current.has(storeId)) return

    const needsMainLayoutBackfill = resolvedMainLayout.isEligibleForBackfill
    const needsClassicLayoutBackfill = resolvedClassicLayout.isEligibleForBackfill

    if (!needsMainLayoutBackfill && !needsClassicLayoutBackfill) return

    // Marca imediatamente para nunca entrar em loop mesmo com falhas ou 403
    backfillAttemptedStoresRef.current.add(storeId)

    const patchPrinterConfig: Record<string, unknown> = {}
    if (needsMainLayoutBackfill) {
      patchPrinterConfig.pdvMainLayout = resolvedMainLayout.value
      patchPrinterConfig.v3PdvSectionCard = resolvedMainLayout.value
    }
    if (needsClassicLayoutBackfill) {
      patchPrinterConfig.pdvParams = {
        ...blob.pdvParams,
        pdvClassicLayout: resolvedClassicLayout.value,
      }
    }

    void fetch(`/api/stores/${encodeURIComponent(storeId)}/settings`, {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        [ASSISTEC_LOJA_HEADER]: storeId,
      },
      body: JSON.stringify({
        printerConfig: patchPrinterConfig,
        backfill: true,
      }),
    })
      .then(async (res) => {
        if (res.ok) {
          const j = (await res.json().catch(() => null)) as { settings?: StoreSettingsApi } | null
          if (j?.settings) {
            setSettings(j.settings)
          }
        }
      })
      .catch(() => {
        // Falha de rede ou falta de permissão não quebra o provider nem entra em retry infinito
      })
  }, [
    hydrated,
    storeId,
    resolvedMainLayout.isEligibleForBackfill,
    resolvedMainLayout.value,
    resolvedClassicLayout.isEligibleForBackfill,
    resolvedClassicLayout.value,
    blob.pdvParams,
  ])

  const save = useCallback(
    async (patch: StoreSettingsPutPayload) => {
      if (!storeId) {
        throw new Error("Nenhuma unidade ativa selecionada.")
      }
      const res = await fetch(`/api/stores/${encodeURIComponent(storeId)}/settings`, {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          [ASSISTEC_LOJA_HEADER]: storeId,
        },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error || `Falha ao salvar configurações (HTTP ${res.status})`)
      }
      await refresh()
    },
    [refresh, storeId]
  )

  const value = useMemo<StoreSettingsContextType>(
    () => ({
      storeId,
      hydrated,
      settings,
      blob,
      pdvParams,
      impressaoConfig,
      appearance,
      termosGarantia,
      capabilities: blob.capabilities ?? null,
      pdvMainLayout: resolvedMainLayout.value,
      pdvClassicLayout: resolvedClassicLayout.value,
      getGarantiaById,
      refresh,
      save,
    }),
    [
      storeId,
      hydrated,
      settings,
      blob,
      pdvParams,
      impressaoConfig,
      appearance,
      termosGarantia,
      resolvedMainLayout.value,
      resolvedClassicLayout.value,
      getGarantiaById,
      refresh,
      save,
    ]
  )

  return <StoreSettingsContext.Provider value={value}>{children}</StoreSettingsContext.Provider>
}

export function useStoreSettings(): StoreSettingsContextType {
  const c = useContext(StoreSettingsContext)
  if (!c) {
    const base = defaultPdvParams()
    return {
      storeId: "",
      hydrated: false,
      settings: null,
      blob: {},
      pdvParams: base,
      impressaoConfig: defaultPdvImpressaoConfig(),
      appearance: {},
      termosGarantia: { ...configPadrao.termosGarantia, garantiaLegal: GARANTIA_LEGAL_CDC },
      capabilities: null,
      pdvMainLayout: "classic",
      pdvClassicLayout: "lovable",
      getGarantiaById: () => undefined,
      refresh: async () => {},
      save: async () => {
        throw new Error("StoreSettingsProvider ausente — não é possível salvar configurações.")
      },
    }
  }
  return c
}
