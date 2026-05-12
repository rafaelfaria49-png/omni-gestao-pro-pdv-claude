"use client"

import { createContext, useCallback, useContext, type ReactNode } from "react"
import { useOperationsStore } from "@/lib/operations-store"

interface CaixaState {
  isOpen: boolean
  saldoInicial: number
  dataAbertura: Date | null
  totalEntradas: number
  totalSaidas: number
}

interface CaixaContextType {
  caixa: CaixaState
  abrirCaixa: (saldoInicial: number) => void
  fecharCaixa: () => void
  adicionarEntrada: (valor: number) => void
  adicionarSaida: (valor: number) => void
  getSaldoAtual: () => number
  /** ID da sessão no servidor (persistido em localStorage via OperationsProvider). */
  sessaoId: string | null
  setSessaoId: (id: string | null) => void
}

const CaixaContext = createContext<CaixaContextType | undefined>(undefined)

export function CaixaProvider({ children }: { children: ReactNode }) {
  const {
    caixa,
    caixaSessaoId,
    setCaixaSessaoId,
    abrirCaixa: _abrirCaixa,
    fecharCaixa: _fecharCaixa,
    adicionarEntrada,
    adicionarSaida,
    getSaldoAtual,
  } = useOperationsStore()

  const abrirCaixa = useCallback(
    (saldoInicial: number) => {
      _abrirCaixa(saldoInicial)
    },
    [_abrirCaixa]
  )

  const fecharCaixa = useCallback(() => {
    _fecharCaixa()
  }, [_fecharCaixa])

  return (
    <CaixaContext.Provider
      value={{
        caixa,
        abrirCaixa,
        fecharCaixa,
        adicionarEntrada,
        adicionarSaida,
        getSaldoAtual,
        sessaoId: caixaSessaoId,
        setSessaoId: setCaixaSessaoId,
      }}
    >
      {children}
    </CaixaContext.Provider>
  )
}

const defaultCaixaState: CaixaState = {
  isOpen: false,
  saldoInicial: 0,
  dataAbertura: null,
  totalEntradas: 0,
  totalSaidas: 0,
}

const defaultContext: CaixaContextType = {
  caixa: defaultCaixaState,
  abrirCaixa: () => {},
  fecharCaixa: () => {},
  adicionarEntrada: () => {},
  adicionarSaida: () => {},
  getSaldoAtual: () => 0,
  sessaoId: null,
  setSessaoId: () => {},
}

export function useCaixa() {
  const context = useContext(CaixaContext)
  if (!context) {
    return defaultContext
  }
  return context
}
