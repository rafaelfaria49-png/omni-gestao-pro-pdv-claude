"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useLojaAtiva } from "@/lib/loja-ativa"
import {
  IA_MESTRE_CONVERSATIONS_REFRESH_EVENT,
  iaMestreStoreHeaders,
  notifyIaMestreConversationsRefresh,
} from "@/lib/ia-mestre/client-fetch"

export type IaConversationListItem = {
  id: string
  title: string
  model: string
  brandVoiceEnabled: boolean
  updatedAt: string
  createdAt: string
  preview: string
}

type IaMestreChatContextValue = {
  lojaAtivaId: string | null
  storesLoaded: boolean
  storeRequiredError: string | null
  conversations: IaConversationListItem[]
  listLoading: boolean
  listError: string | null
  activeConversationId: string | null
  setActiveConversationId: (id: string | null) => void
  refreshConversations: () => Promise<void>
  notifyConversationsRefresh: () => void
}

const IaMestreChatContext = createContext<IaMestreChatContextValue | null>(null)

export function IaMestreChatProvider({ children }: { children: ReactNode }) {
  const { lojaAtivaId, storesLoaded } = useLojaAtiva()
  const [conversations, setConversations] = useState<IaConversationListItem[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)

  const storeRequiredError = useMemo(() => {
    if (!storesLoaded) return null
    if (!lojaAtivaId?.trim()) {
      return "Selecione uma unidade ativa no painel para salvar e listar conversas."
    }
    return null
  }, [lojaAtivaId, storesLoaded])

  const refreshConversations = useCallback(async () => {
    const headers = iaMestreStoreHeaders(lojaAtivaId)
    if (!headers) {
      setConversations([])
      setListError("Selecione uma unidade ativa no painel.")
      return
    }
    setListLoading(true)
    setListError(null)
    try {
      const res = await fetch("/api/ia-mestre/conversations?limit=40", {
        method: "GET",
        headers,
        credentials: "include",
        cache: "no-store",
      })
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        conversations?: IaConversationListItem[]
        error?: string
      }
      if (!res.ok) {
        throw new Error(String(data.error || `HTTP ${res.status}`))
      }
      setConversations(Array.isArray(data.conversations) ? data.conversations : [])
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Erro ao carregar conversas")
      setConversations([])
    } finally {
      setListLoading(false)
    }
  }, [lojaAtivaId])

  useEffect(() => {
    if (!storesLoaded) return
    void refreshConversations()
  }, [storesLoaded, lojaAtivaId, refreshConversations])

  useEffect(() => {
    const onRefresh = () => {
      void refreshConversations()
    }
    window.addEventListener(IA_MESTRE_CONVERSATIONS_REFRESH_EVENT, onRefresh)
    return () => window.removeEventListener(IA_MESTRE_CONVERSATIONS_REFRESH_EVENT, onRefresh)
  }, [refreshConversations])

  const value = useMemo<IaMestreChatContextValue>(
    () => ({
      lojaAtivaId,
      storesLoaded,
      storeRequiredError,
      conversations,
      listLoading,
      listError,
      activeConversationId,
      setActiveConversationId,
      refreshConversations,
      notifyConversationsRefresh: notifyIaMestreConversationsRefresh,
    }),
    [
      lojaAtivaId,
      storesLoaded,
      storeRequiredError,
      conversations,
      listLoading,
      listError,
      activeConversationId,
      refreshConversations,
    ],
  )

  return <IaMestreChatContext.Provider value={value}>{children}</IaMestreChatContext.Provider>
}

export function useIaMestreChat() {
  const ctx = useContext(IaMestreChatContext)
  if (!ctx) {
    throw new Error("useIaMestreChat deve ser usado dentro de IaMestreChatProvider")
  }
  return ctx
}
