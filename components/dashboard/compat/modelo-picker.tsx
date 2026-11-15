"use client"

/**
 * COMPAT-PROFISSIONAL-001 — busca de modelo (catálogo global + modelos da loja) com aliases,
 * grafias diferentes e busca parcial. Teclado: ↑/↓ navega, Enter seleciona, Esc limpa.
 */

import { useEffect, useId, useRef, useState } from "react"
import { Loader2, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import type { DeviceSearchResult } from "@/lib/catalogo-aparelhos/types"

export type ModeloEscolhido = { modelKey: string; canonicalName: string; brand: string; source?: "global" | "loja" }

export function ModeloPicker({
  lojaHeader,
  onSelect,
  placeholder = "Buscar modelo: A06, Redmi 13C, iPhone 13…",
  label,
  excluir = [],
  autoFocus = false,
  onNoResults,
}: {
  lojaHeader: string | null
  onSelect: (m: ModeloEscolhido) => void
  placeholder?: string
  label: string
  /** Modelos que não devem aparecer (ex.: o próprio principal e os já vinculados). */
  excluir?: readonly string[]
  autoFocus?: boolean
  /** Oferece cadastrar o modelo digitado quando nada é encontrado. */
  onNoResults?: (texto: string) => void
}) {
  const uid = useId()
  const [q, setQ] = useState("")
  const [results, setResults] = useState<DeviceSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [ativo, setAtivo] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const excluirKey = excluir.join("|")

  useEffect(() => {
    const termo = q.trim()
    if (termo.length < 2) {
      setResults([])
      setLoading(false)
      setError("")
      return
    }
    setLoading(true)
    const controller = new AbortController()
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/catalogo/aparelhos/search?q=${encodeURIComponent(termo)}`, {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
          ...(lojaHeader ? { headers: { [ASSISTEC_LOJA_HEADER]: lojaHeader } } : {}),
        })
        if (!res.ok) throw new Error(String(res.status))
        const data = (await res.json()) as { results?: DeviceSearchResult[] }
        const fora = new Set(excluirKey ? excluirKey.split("|") : [])
        if (!controller.signal.aborted) {
          setResults((data.results ?? []).filter((r) => !fora.has(r.modelKey)))
          setAtivo(0)
          setError("")
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return
        setResults([])
        setError("Falha ao buscar modelos.")
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 250)
    return () => {
      window.clearTimeout(t)
      controller.abort()
    }
  }, [q, lojaHeader, excluirKey])

  const escolher = (r: DeviceSearchResult) => {
    onSelect({ modelKey: r.modelKey, canonicalName: r.canonicalName || r.modelKey, brand: r.brand, source: r.source })
    setQ("")
    setResults([])
    queueMicrotask(() => inputRef.current?.focus())
  }

  const aberto = q.trim().length >= 2

  return (
    <div className="relative min-w-0">
      <label htmlFor={`${uid}-q`} className="sr-only">
        {label}
      </label>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        id={`${uid}-q`}
        ref={inputRef}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault()
            setAtivo((i) => Math.min(i + 1, Math.max(results.length - 1, 0)))
          } else if (e.key === "ArrowUp") {
            e.preventDefault()
            setAtivo((i) => Math.max(i - 1, 0))
          } else if (e.key === "Enter" && results[ativo]) {
            e.preventDefault()
            escolher(results[ativo])
          } else if (e.key === "Escape") {
            setQ("")
          }
        }}
        placeholder={placeholder}
        className="pl-9"
        autoComplete="off"
        autoFocus={autoFocus}
        aria-label={label}
        role="combobox"
        aria-expanded={aberto}
        aria-controls={`${uid}-lista`}
      />
      {loading && (
        <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      )}
      {aberto && (
        <div
          id={`${uid}-lista`}
          role="listbox"
          className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-md"
        >
          {!loading && error && <p className="px-2 py-1.5 text-sm text-destructive">{error}</p>}
          {!loading && !error && results.length === 0 && (
            <div className="space-y-1 px-2 py-1.5">
              <p className="text-sm text-muted-foreground">Nenhum modelo encontrado.</p>
              {onNoResults && (
                <button
                  type="button"
                  className="text-sm font-medium text-primary hover:underline"
                  onClick={() => onNoResults(q.trim())}
                >
                  Cadastrar “{q.trim()}”
                </button>
              )}
            </div>
          )}
          {results.map((r, i) => (
            <button
              key={r.modelKey}
              type="button"
              role="option"
              aria-selected={i === ativo}
              onMouseEnter={() => setAtivo(i)}
              onClick={() => escolher(r)}
              className={cn(
                "flex w-full min-w-0 flex-col gap-0.5 rounded-sm px-2 py-1.5 text-left",
                i === ativo ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-medium">{r.canonicalName || r.modelKey}</span>
                {r.source === "loja" && (
                  <Badge variant="outline" className="shrink-0 text-[10px] text-muted-foreground">
                    cadastro da loja
                  </Badge>
                )}
                {r.ambiguous && (
                  <Badge variant="outline" className="shrink-0 border-warning/40 text-[10px] text-warning">
                    confira a marca
                  </Badge>
                )}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {[r.brand, r.commercialLine, r.matchType !== "exact" && r.matchedText ? `“${r.matchedText}”` : ""]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
