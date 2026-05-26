"use client"

import { useCallback, useEffect, useState } from "react"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"

export type ClienteOsRow = {
  id: string
  numero: string
  equipamento: string
  defeito: string
  status: string
  valorTotal: number
  createdAt: string
  updatedAt: string
  isOpen: boolean
  isLate: boolean
}

export type ClienteVendaRow = {
  id: string
  pedidoId: string
  total: number
  status: string
  at: string
}

export type ClienteContextSnapshot = {
  id: string
  name: string
  phone: string
  email: string | null
  totalSpent: number
  lastPurchaseAt: string | null
  clientSince: string
  ordensServico: ClienteOsRow[]
  vendas: ClienteVendaRow[]
  openOs: ClienteOsRow[]
  lateOs: ClienteOsRow[]
  lastVenda: ClienteVendaRow | null
}

export type PhoneMatchCandidate = {
  id: string
  name: string
  phone: string
}

const OPEN_OS = new Set(["Aberto", "EmAnalise"])
const LATE_MS = 3 * 24 * 60 * 60 * 1000

function formatMoney(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value)
}

export { formatMoney }

function parseOs(raw: Record<string, unknown>): ClienteOsRow {
  const status = String(raw.status ?? "")
  const createdAt = String(raw.createdAt ?? "")
  const updatedAt = String(raw.updatedAt ?? createdAt)
  const updatedMs = new Date(updatedAt).getTime()
  const isOpen = OPEN_OS.has(status)
  const isLate =
    isOpen &&
    Number.isFinite(updatedMs) &&
    Date.now() - updatedMs > LATE_MS

  return {
    id: String(raw.id ?? ""),
    numero: String(raw.numero ?? raw.id ?? "").slice(-8),
    equipamento: String(raw.equipamento ?? ""),
    defeito: String(raw.defeito ?? ""),
    status,
    valorTotal: Number(raw.valorTotal ?? 0),
    createdAt,
    updatedAt,
    isOpen,
    isLate,
  }
}

function parseVenda(raw: Record<string, unknown>): ClienteVendaRow {
  return {
    id: String(raw.id ?? ""),
    pedidoId: String(raw.pedidoId ?? ""),
    total: Number(raw.total ?? 0),
    status: String(raw.status ?? "concluida"),
    at: String(raw.at ?? ""),
  }
}

function mapClientePayload(cliente: Record<string, unknown>): ClienteContextSnapshot {
  const osRaw = Array.isArray(cliente.ordensServico) ? cliente.ordensServico : []
  const vendasRaw = Array.isArray(cliente.vendas) ? cliente.vendas : []
  const ordensServico = osRaw.map((o) =>
    parseOs(o && typeof o === "object" ? (o as Record<string, unknown>) : {})
  )
  const vendas = vendasRaw.map((v) =>
    parseVenda(v && typeof v === "object" ? (v as Record<string, unknown>) : {})
  )
  const openOs = ordensServico.filter((o) => o.isOpen)
  const lateOs = ordensServico.filter((o) => o.isLate)
  const lastVenda = vendas.find((v) => v.status === "concluida") ?? vendas[0] ?? null
  const createdAt = String(cliente.createdAt ?? "")
  const clientSince = createdAt
    ? new Date(createdAt).toLocaleDateString("pt-BR", { month: "short", year: "numeric" })
    : "—"

  return {
    id: String(cliente.id ?? ""),
    name: String(cliente.name ?? ""),
    phone: String(cliente.phone ?? ""),
    email: cliente.email != null ? String(cliente.email) : null,
    totalSpent: Number(cliente.totalSpent ?? 0),
    lastPurchaseAt: cliente.lastPurchaseAt
      ? String(cliente.lastPurchaseAt)
      : null,
    clientSince,
    ordensServico,
    vendas,
    openOs,
    lateOs,
    lastVenda,
  }
}

function phoneSearchToken(digits: string): string {
  const d = digits.replace(/\D/g, "")
  if (d.length >= 11) return d.slice(-11)
  if (d.length >= 9) return d.slice(-9)
  return d
}

export function useWhatsAppClienteContext(
  clienteId: string | null | undefined,
  phoneDigits: string,
  apiHeaders: Record<string, string> | null
) {
  const [snapshot, setSnapshot] = useState<ClienteContextSnapshot | null>(null)
  const [phoneMatches, setPhoneMatches] = useState<PhoneMatchCandidate[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadByClienteId = useCallback(
    async (id: string) => {
      if (!apiHeaders) return
      setLoading(true)
      setError(null)
      setPhoneMatches([])
      try {
        const res = await fetch(`/api/clientes/${encodeURIComponent(id)}`, {
          headers: apiHeaders,
          cache: "no-store",
        })
        const data = (await res.json()) as {
          ok?: boolean
          cliente?: Record<string, unknown>
          error?: string
        }
        if (!res.ok || !data.ok || !data.cliente) {
          setSnapshot(null)
          setError(data.error ?? "Cliente não encontrado")
          return
        }
        setSnapshot(mapClientePayload(data.cliente))
      } catch {
        setSnapshot(null)
        setError("Falha ao carregar cliente")
      } finally {
        setLoading(false)
      }
    },
    [apiHeaders]
  )

  const searchByPhone = useCallback(async () => {
    if (!apiHeaders) return
    const token = phoneSearchToken(phoneDigits)
    if (token.length < 8) {
      setPhoneMatches([])
      return
    }
    setLoading(true)
    setError(null)
    setSnapshot(null)
    try {
      const res = await fetch(
        `/api/clientes?q=${encodeURIComponent(token)}`,
        { headers: apiHeaders, cache: "no-store" }
      )
      const data = (await res.json()) as { clientes?: Array<Record<string, unknown>> }
      const list = (data.clientes ?? []).map((c) => ({
        id: String(c.id ?? ""),
        name: String(c.name ?? ""),
        phone: String(c.phone ?? ""),
      }))
      setPhoneMatches(list.slice(0, 5))
    } catch {
      setPhoneMatches([])
      setError("Falha ao buscar por telefone")
    } finally {
      setLoading(false)
    }
  }, [apiHeaders, phoneDigits])

  useEffect(() => {
    if (!apiHeaders) {
      setSnapshot(null)
      setPhoneMatches([])
      setLoading(false)
      return
    }
    const id = clienteId?.trim()
    if (id) {
      void loadByClienteId(id)
      return
    }
    setSnapshot(null)
    setError(null)
    void searchByPhone()
  }, [clienteId, apiHeaders, loadByClienteId, searchByPhone])

  const refresh = useCallback(() => {
    const id = clienteId?.trim()
    if (id) void loadByClienteId(id)
    else void searchByPhone()
  }, [clienteId, loadByClienteId, searchByPhone])

  return {
    snapshot,
    phoneMatches,
    loading,
    error,
    refresh,
    loadByClienteId,
  }
}
