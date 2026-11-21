"use client"

import type { ReactNode } from "react"
import { ConfigEmpresaProvider } from "@/lib/config-empresa"
import { LojaAtivaProvider } from "@/lib/loja-ativa"
import { StoreSettingsProvider } from "@/lib/store-settings-provider"
import { PerfilLojaProvider } from "@/lib/perfil-loja-provider"
import { StoreAppearanceSync } from "@/components/dashboard/store-appearance-sync"

/** Reports need store/session/theme, never inventory/OS hydration or financial auto-sync. */
export function ReportProviders({children}:{children:ReactNode}) {
  return <ConfigEmpresaProvider><LojaAtivaProvider><StoreSettingsProvider><PerfilLojaProvider><StoreAppearanceSync/>{children}</PerfilLojaProvider></StoreSettingsProvider></LojaAtivaProvider></ConfigEmpresaProvider>
}
