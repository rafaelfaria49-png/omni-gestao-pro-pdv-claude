"use client"

import { useEffect, useState } from "react"
import { PdvClassic, type VendasPDVProps } from "./pdv-classic"
import { PdvSupermercado } from "./pdv-supermercado"
import { PdvVendaCompletaEnterprise } from "./pdv-venda-completa-enterprise"
import { usePerfilLoja } from "@/lib/perfil-loja-provider"
import { useLojaAtiva } from "@/lib/loja-ativa"
import { LEGACY_PRIMARY_STORE_ID } from "@/lib/store-defaults"
import { useStoreSettings } from "@/lib/store-settings-provider"
import type { PdvClassicLayoutKind } from "@/lib/store-settings-types"
import {
  PDV_CLASSIC_LAYOUT_CHANGED_EVENT,
  PDV_CLASSIC_LAYOUT_STORAGE_KEY,
  PDV_MAIN_LAYOUT_CHANGED_EVENT,
  readPdvClassicLayout,
  writePdvClassicLayout,
} from "@/lib/pdv-classic-layout"

type PdvLayout = "classic" | "supermercado"

const PDV_LAYOUT_STORAGE_KEY = "@omnigestao:pdv-layout"
const RAMO_ATUACAO_STORAGE_PREFIX = "@omnigestao:ramo-atuacao:"

/**
 * Runtime do PDV: `@omnigestao:pdv-layout` (classic vs supermercado), `omni-pdv-classic-layout`
 * (lovable vs services) e hidratação de `pdvParams.pdvClassicLayout`. Modo rápido vem de
 * `omnigestao-pdv-modo` / query `?modo=rapido` em `vendas-page-client`, não de `printerConfig.v3PdvSectionCard`.
 */

export function VendasPDV(props: VendasPDVProps) {
  const [layout, setLayout] = useState<PdvLayout>("classic")
  const [classicLayout, setClassicLayout] = useState<PdvClassicLayoutKind>(() =>
    typeof window !== "undefined" ? readPdvClassicLayout() : "lovable"
  )
  const { perfilLoja } = usePerfilLoja()
  const { lojaAtivaId } = useLojaAtiva()
  const { pdvParams, hydrated } = useStoreSettings()

  useEffect(() => {
    const readLayout = () => {
      try {
        const raw = String(localStorage.getItem(PDV_LAYOUT_STORAGE_KEY) || "").trim()
        if (raw === "supermercado" || raw === "classic") {
          setLayout(raw)
          return
        }

        const storeId = (lojaAtivaId || LEGACY_PRIMARY_STORE_ID).trim() || LEGACY_PRIMARY_STORE_ID
        const ramoKey = `${RAMO_ATUACAO_STORAGE_PREFIX}${storeId}`
        const ramoRaw = String(localStorage.getItem(ramoKey) || "").trim()
        const inferred =
          ramoRaw && ramoRaw !== "assistencia"
            ? "supermercado"
            : perfilLoja === "supermercado" || perfilLoja === "variedades"
              ? "supermercado"
              : "classic"
        setLayout(inferred)
      } catch {
        setLayout(perfilLoja === "supermercado" || perfilLoja === "variedades" ? "supermercado" : "classic")
      }
    }

    readLayout()

    const onStorage = (e: StorageEvent) => {
      if (e.key === PDV_LAYOUT_STORAGE_KEY) readLayout()
    }
    const onMainLayoutNotify = () => readLayout()
    window.addEventListener("storage", onStorage)
    window.addEventListener(PDV_MAIN_LAYOUT_CHANGED_EVENT, onMainLayoutNotify)
    return () => {
      window.removeEventListener("storage", onStorage)
      window.removeEventListener(PDV_MAIN_LAYOUT_CHANGED_EVENT, onMainLayoutNotify)
    }
  }, [lojaAtivaId, perfilLoja])

  useEffect(() => {
    const sync = () => setClassicLayout(readPdvClassicLayout())
    sync()
    window.addEventListener(PDV_CLASSIC_LAYOUT_CHANGED_EVENT, sync)
    const onStorage = (e: StorageEvent) => {
      if (e.key === PDV_CLASSIC_LAYOUT_STORAGE_KEY) sync()
    }
    window.addEventListener("storage", onStorage)
    return () => {
      window.removeEventListener(PDV_CLASSIC_LAYOUT_CHANGED_EVENT, sync)
      window.removeEventListener("storage", onStorage)
    }
  }, [])

  useEffect(() => {
    if (!hydrated) return
    const fromDb = pdvParams.pdvClassicLayout
    if (fromDb === "services" || fromDb === "lovable") {
      setClassicLayout(fromDb)
      try {
        localStorage.setItem(PDV_CLASSIC_LAYOUT_STORAGE_KEY, fromDb)
      } catch {
        /* ignore */
      }
    }
  }, [hydrated, pdvParams.pdvClassicLayout])

  if (layout === "supermercado") return <PdvSupermercado {...props} />

  if (classicLayout === "venda-completa") {
    return (
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
        <PdvVendaCompletaEnterprise
          onBack={() => writePdvClassicLayout("lovable")}
          isModoRapido={props.isModoRapido}
        />
      </div>
    )
  }

  return <PdvClassic {...props} uiShell="omni-smart" classicLayoutKind={classicLayout} />
}
