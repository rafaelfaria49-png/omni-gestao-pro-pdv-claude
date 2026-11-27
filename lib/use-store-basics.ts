"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import { useLojaAtiva } from "@/lib/loja-ativa"
import {
  applyBasicsIntent,
  basicsIntent,
  readStoreBasics,
  saveStoreBasics,
  type AddressField,
  type BasicField,
  type StoreBasics,
} from "@/lib/store-basics"

/** Consumers key their editor by this scope so no draft or dismissal crosses identities/stores. */
export function useStoreBasicsScope() {
  const { data: session } = useSession()
  const { lojaAtivaId } = useLojaAtiva()
  return {
    storeId: lojaAtivaId ?? "",
    scope: JSON.stringify([session?.user?.id, session?.user?.sessionVersion, lojaAtivaId]),
  }
}

export type StoreBasicsMessageTone = "idle" | "success" | "error"

export function useStoreBasics(storeId: string) {
  const [baseline, setBaseline] = useState<StoreBasics | null>(null)
  const [draft, setDraft] = useState<StoreBasics | null>(null)
  const [loading, setLoading] = useState(Boolean(storeId.trim()))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [messageTone, setMessageTone] = useState<StoreBasicsMessageTone>("idle")
  const [reload, setReload] = useState(0)
  const controller = useRef<AbortController | null>(null)
  const activeAttempt = useRef(false)

  useEffect(() => {
    if (!storeId.trim()) {
      controller.current?.abort()
      controller.current = null
      setBaseline(null)
      setDraft(null)
      setLoading(false)
      setMessage("")
      setMessageTone("idle")
      return
    }
    const pending = new AbortController()
    controller.current = pending
    setLoading(true)
    setMessage("")
    setMessageTone("idle")
    void readStoreBasics(storeId, pending.signal)
      .then((data) => {
        if (pending.signal.aborted) return
        setBaseline(data)
        setDraft(data)
        setLoading(false)
      })
      .catch(() => {
        if (pending.signal.aborted) return
        setLoading(false)
        setMessage("Não foi possível carregar os dados da unidade. Tente carregar novamente.")
        setMessageTone("error")
      })
    return () => {
      pending.abort()
      controller.current = null
    }
  }, [storeId, reload])

  const dirty = useMemo(() => {
    if (!baseline || !draft) return false
    const intent = basicsIntent(baseline, draft)
    return (
      Object.keys(intent).some((key) => key !== "address") ||
      Boolean(intent.address && Object.keys(intent.address).length > 0)
    )
  }, [baseline, draft])

  const save = useCallback(
    async (requireCnpj = false) => {
      if (activeAttempt.current || !draft || !baseline || !controller.current) return false
      if (!draft.name.trim() || (requireCnpj && !draft.cnpj.trim())) {
        setMessage(
          requireCnpj
            ? "Informe o nome da loja e o CNPJ para concluir os dados básicos."
            : "Informe o nome da empresa.",
        )
        setMessageTone("error")
        return false
      }
      activeAttempt.current = true
      setSaving(true)
      setMessage("")
      setMessageTone("idle")
      const pending = controller.current
      const intent = basicsIntent(baseline, draft)
      try {
        const result = await saveStoreBasics(storeId, intent, pending.signal)
        if (pending.signal.aborted) return false
        // Required fields can change in another tab even when they were not edited here.
        const complete =
          result.ok && !!result.current?.name.trim() && (!requireCnpj || !!result.current.cnpj.trim())
        if (result.current) {
          setBaseline(result.current)
          setDraft(complete ? result.current : applyBasicsIntent(result.current, intent))
        }
        setMessage(
          result.ok && !complete
            ? "A releitura encontrou dados básicos incompletos. Revise os campos obrigatórios antes de concluir."
            : result.message,
        )
        setMessageTone(complete ? "success" : "error")
        return complete
      } catch {
        return false
      } finally {
        if (!pending.signal.aborted) {
          activeAttempt.current = false
          setSaving(false)
        }
      }
    },
    [storeId, draft, baseline],
  )

  return {
    baseline,
    draft,
    dirty,
    loading,
    saving,
    message,
    messageTone,
    save,
    setField: (key: BasicField, value: string) => {
      setMessage("")
      setMessageTone("idle")
      setDraft((old) => (old ? { ...old, [key]: value } : old))
    },
    setAddressField: (key: AddressField, value: string) => {
      setMessage("")
      setMessageTone("idle")
      setDraft((old) => (old ? { ...old, address: { ...old.address, [key]: value } } : old))
    },
    cancel: () => {
      if (!activeAttempt.current) {
        setDraft(baseline)
        setMessage("")
        setMessageTone("idle")
      }
    },
    retryLoad: () => setReload((value) => value + 1),
  }
}
