"use client"

import { useEffect, useState } from "react"
import { PdvClassic, type VendasPDVProps } from "./pdv-classic"
import { PdvSupermercado } from "./pdv-supermercado"
import { LoadingState } from "@/components/ui/states"
import { usePerfilLoja } from "@/lib/perfil-loja-provider"
import { useLojaAtiva } from "@/lib/loja-ativa"
import { useStoreSettings } from "@/lib/store-settings-provider"
import type { PdvClassicLayoutKind } from "@/lib/store-settings-types"
import {
  PDV_CLASSIC_LAYOUT_CHANGED_EVENT,
  PDV_MAIN_LAYOUT_CHANGED_EVENT,
  pdvClassicLayoutStorageEventKey,
  readPdvClassicLayout,
  writePdvClassicLayout,
} from "@/lib/pdv-classic-layout"
import {
  pdvMainLayoutStorageEventKey,
  readPdvMainLayout,
  type PdvMainLayout,
} from "@/lib/pdv-layout-storage"

const RAMO_ATUACAO_STORAGE_PREFIX = "@omnigestao:ramo-atuacao:"

/**
 * Runtime do PDV: layout por unidade (`@omnigestao:pdv-layout::{storeId}`),
 * classic layout scoped, hidratação de `pdvParams.pdvClassicLayout`.
 */

export function VendasPDV(props: VendasPDVProps) {
  const [layout, setLayout] = useState<PdvMainLayout>("classic")
  const [classicLayout, setClassicLayout] = useState<PdvClassicLayoutKind>("lovable")
  const { perfilLoja } = usePerfilLoja()
  const { lojaAtivaId } = useLojaAtiva()
  const { pdvParams, hydrated, storeId } = useStoreSettings()

  useEffect(() => {
    if (!storeId) {
      setClassicLayout("lovable")
      return
    }
    setClassicLayout(readPdvClassicLayout(storeId))
  }, [storeId])

  useEffect(() => {
    const readLayout = () => {
      if (!storeId) {
        setLayout("classic")
        return
      }
      try {
        const fromScoped = readPdvMainLayout(storeId)
        if (fromScoped) {
          setLayout(fromScoped)
          return
        }

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

    const scopedLayoutKey = pdvMainLayoutStorageEventKey(storeId)
    const onStorage = (e: StorageEvent) => {
      if (scopedLayoutKey && e.key === scopedLayoutKey) readLayout()
    }
    const onMainLayoutNotify = () => readLayout()
    window.addEventListener("storage", onStorage)
    window.addEventListener(PDV_MAIN_LAYOUT_CHANGED_EVENT, onMainLayoutNotify)
    return () => {
      window.removeEventListener("storage", onStorage)
      window.removeEventListener(PDV_MAIN_LAYOUT_CHANGED_EVENT, onMainLayoutNotify)
    }
  }, [storeId, perfilLoja])

  useEffect(() => {
    if (!storeId) return
    const sync = () => setClassicLayout(readPdvClassicLayout(storeId))
    sync()
    window.addEventListener(PDV_CLASSIC_LAYOUT_CHANGED_EVENT, sync)
    const scopedClassicKey = pdvClassicLayoutStorageEventKey(storeId)
    const onStorage = (e: StorageEvent) => {
      if (scopedClassicKey && e.key === scopedClassicKey) sync()
    }
    window.addEventListener("storage", onStorage)
    return () => {
      window.removeEventListener(PDV_CLASSIC_LAYOUT_CHANGED_EVENT, sync)
      window.removeEventListener("storage", onStorage)
    }
  }, [storeId])

  useEffect(() => {
    if (!hydrated || !storeId) return
    const fromDb = pdvParams.pdvClassicLayout
    if (fromDb === "services" || fromDb === "lovable") {
      setClassicLayout(fromDb)
      writePdvClassicLayout(fromDb, storeId)
    }
  }, [hydrated, pdvParams.pdvClassicLayout, storeId])

  if (!storeId) return <LoadingState message="Selecione uma unidade para abrir o PDV…" />
  if (layout === "next") return <LoadingState message="Redirecionando para o PDV Next…" />
  if (layout === "supermercado") return <PdvSupermercado {...props} />

  return <PdvClassic {...props} uiShell="omni-smart" classicLayoutKind={classicLayout} />
}
