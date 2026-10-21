"use client"

import { createContext, useContext, type ReactNode } from "react"
import { PERFIL_LOJA_DEFAULT, type PerfilLojaId } from "@/lib/perfil-loja-types"
import { useLojaAtiva } from "@/lib/loja-ativa"
import { useStoreSettings } from "@/lib/store-settings-provider"
import { legacyBusinessBranch, resolveBusinessResource } from "@/lib/store-business-capabilities"

type PerfilLojaContextType = {
  perfilLoja: PerfilLojaId
  setPerfilLoja: (p: PerfilLojaId) => Promise<void>
  mostraTecnicoLaudoOs: boolean
  perfilHydrated: boolean
}
const PerfilLojaContext = createContext<PerfilLojaContextType | null>(null)

async function setPerfilLoja(_perfil: PerfilLojaId) {
  console.warn("Edite ramo e recursos em Configurações gerais.")
}

/** Adapter legado: mesma configuração, sem fetch ou persistência próprios. */
export function PerfilLojaProvider({ children }: { children: ReactNode }) {
  const { lojaAtivaRaw } = useLojaAtiva()
  const { capabilities, hydrated } = useStoreSettings()
  const profile = lojaAtivaRaw?.storeProfile
  const branch = capabilities?.business?.primaryBranch ?? legacyBusinessBranch(profile)
  const perfilLoja: PerfilLojaId = branch === "assistencia" ? "assistencia" : branch === "supermercado" ? "supermercado" : "variedades"
  return <PerfilLojaContext.Provider value={{
    perfilLoja, setPerfilLoja,
    mostraTecnicoLaudoOs: hydrated && resolveBusinessResource(capabilities, "service.technical", profile).operational,
    perfilHydrated: hydrated,
  }}>{children}</PerfilLojaContext.Provider>
}

export function usePerfilLoja(): PerfilLojaContextType {
  return useContext(PerfilLojaContext) ?? {
    perfilLoja: PERFIL_LOJA_DEFAULT, setPerfilLoja,
    mostraTecnicoLaudoOs: false, perfilHydrated: false,
  }
}
