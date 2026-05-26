"use client"

import { useEffect } from "react"
import { useStudioTheme } from "@/components/theme/ThemeProvider"
import { parseAppearanceFromPrinterConfig } from "@/lib/store-appearance"
import { useStoreSettings } from "@/lib/store-settings-provider"

/** Aplica o tema salvo na unidade ativa (`printerConfig.appearance.studioTheme`). */
export function StoreAppearanceSync() {
  const { hydrated, storeId, settings } = useStoreSettings()
  const { setMode } = useStudioTheme()

  useEffect(() => {
    if (!hydrated || !storeId) return
    const { studioTheme } = parseAppearanceFromPrinterConfig(settings?.printerConfig)
    if (studioTheme) setMode(studioTheme)
  }, [hydrated, setMode, settings?.printerConfig, storeId])

  return null
}
