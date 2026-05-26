import type { StudioThemeMode } from "@/components/theme/ThemeProvider"

export type StoreAppearanceConfig = {
  studioTheme?: StudioThemeMode
}

const VALID_THEMES: StudioThemeMode[] = [
  "light",
  "soft-ice",
  "midnight",
  "black",
  "classic",
  "quantum-violet",
  "coffee-gold",
  "ruby-black",
  "neon-ice",
  "violet-ice",
  "coffee-cream",
]

function isStudioThemeMode(v: unknown): v is StudioThemeMode {
  return typeof v === "string" && (VALID_THEMES as string[]).includes(v)
}

export function parseAppearanceFromPrinterConfig(printerConfig: unknown): StoreAppearanceConfig {
  const root = printerConfig && typeof printerConfig === "object" ? (printerConfig as Record<string, unknown>) : {}
  const appearance =
    root.appearance && typeof root.appearance === "object"
      ? (root.appearance as Record<string, unknown>)
      : {}
  const studioTheme = isStudioThemeMode(appearance.studioTheme) ? appearance.studioTheme : undefined
  return studioTheme ? { studioTheme } : {}
}

export function mergeAppearanceIntoPrinterConfig(
  printerConfig: Record<string, unknown>,
  patch: StoreAppearanceConfig,
): Record<string, unknown> {
  const prev =
    printerConfig.appearance && typeof printerConfig.appearance === "object"
      ? { ...(printerConfig.appearance as Record<string, unknown>) }
      : {}
  const nextAppearance = { ...prev }
  if (patch.studioTheme) nextAppearance.studioTheme = patch.studioTheme
  return { ...printerConfig, appearance: nextAppearance }
}
