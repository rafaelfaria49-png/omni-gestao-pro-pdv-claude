"use client"

/**
 * Nome do operador informado na ABERTURA do caixa — persistido por loja para que
 * o PDV/caixa/comprovantes exibam a fonte oficial (e nunca o `cashierId` técnico).
 *
 * Apenas APRESENTAÇÃO: este valor não participa de cálculo financeiro, fechamento,
 * estoque ou auditoria. A fonte canônica server-side é `SessaoCaixa.operador`
 * (gravada por `/api/ops/caixa/abrir`); este módulo é o espelho client-side reativo
 * para os componentes que rodam fora do fluxo de request.
 */
import { useEffect, useState } from "react"

const STORAGE_PREFIX = "assistec-pdv-operador-nome-v1:"
const CHANGE_EVENT = "assistec-pdv-operador-nome-changed"

function keyFor(storeId: string | null | undefined): string | null {
  const id = (storeId ?? "").trim()
  return id ? `${STORAGE_PREFIX}${id}` : null
}

/** Lê o nome do operador da abertura para a loja (string vazia quando ausente). */
export function readPdvOperadorNome(storeId: string | null | undefined): string {
  const key = keyFor(storeId)
  if (!key) return ""
  try {
    return (localStorage.getItem(key) ?? "").trim()
  } catch {
    return ""
  }
}

/**
 * Persiste (ou limpa, quando vazio) o nome do operador da abertura para a loja.
 * Dispara um evento para os hooks ativos atualizarem na mesma aba.
 */
export function setPdvOperadorNome(storeId: string | null | undefined, nome: string): void {
  const key = keyFor(storeId)
  if (!key) return
  try {
    const value = (nome ?? "").trim()
    if (value) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { storeId } }))
  } catch {
    /* ignore (SSR / storage indisponível) */
  }
}

/** Hook reativo: nome do operador da abertura, atualizado ao reabrir o caixa. */
export function usePdvOperadorNome(storeId: string | null | undefined): string {
  const [nome, setNome] = useState("")
  useEffect(() => {
    setNome(readPdvOperadorNome(storeId))
    const onChange = () => setNome(readPdvOperadorNome(storeId))
    window.addEventListener(CHANGE_EVENT, onChange)
    window.addEventListener("storage", onChange)
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange)
      window.removeEventListener("storage", onChange)
    }
  }, [storeId])
  return nome
}
