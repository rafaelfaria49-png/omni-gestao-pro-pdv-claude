"use client"

/**
 * CATALOGO-APARELHOS-METADATA-MVP-001 — seção "Compatibilidade com aparelhos" do
 * cadastro de produto. Busca modelos no catálogo (API read-only), permite vincular
 * modelos, tipo e status de compatibilidade, e exibe guardrails honestos.
 *
 * NÃO obriga preenchimento, NÃO altera SKU/EAN/estoque/preço/categoria, NÃO confirma
 * encaixe físico automaticamente. Só monta o valor; a persistência é do formulário pai.
 *
 * Cores: usa tokens semânticos `warning` (revisão) e `destructive` (peça técnica) —
 * sinal de domínio intencional, sem cor hardcoded (ver CORE_RULES §7).
 */

import { useEffect, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import { cn } from "@/lib/utils"
import {
  COMPATIBILITY_STATUSES,
  COMPATIBILITY_TYPES,
  TECHNICAL_COMPATIBILITY_TYPES,
  type CompatibilityStatus,
  type CompatibilityType,
} from "@/lib/catalogo-aparelhos/produto-metadata"
import type { DeviceSearchResult } from "@/lib/catalogo-aparelhos/types"

export interface CompatibilidadeAparelhoModel {
  modelKey: string
  canonicalName: string
  brand: string
}

export interface CompatibilidadeValue {
  models: CompatibilidadeAparelhoModel[]
  aliases: string[]
  status: CompatibilityStatus
  types: CompatibilityType[]
  notes: string
}

export function emptyCompatibilidade(): CompatibilidadeValue {
  return { models: [], aliases: [], status: "precisa_testar", types: [], notes: "" }
}

const STATUS_LABELS: Record<CompatibilityStatus, string> = {
  confirmado_fornecedor: "Confirmado fornecedor",
  provavel_mercado: "Provável mercado",
  precisa_testar: "Precisa testar",
  nao_recomendado: "Não recomendado",
}

const TYPE_LABELS: Record<CompatibilityType, string> = {
  capinha: "Capinha",
  pelicula_tela: "Película de tela",
  pelicula_camera: "Película de câmera",
  acessorio: "Acessório",
  tela: "Tela",
  bateria: "Bateria",
  conector: "Conector",
  generico: "Genérico",
}

export function ProdutoCompatibilidadeAparelhos({
  value,
  onChange,
  lojaHeader,
}: {
  value: CompatibilidadeValue
  onChange: (v: CompatibilidadeValue) => void
  lojaHeader: string
}) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<DeviceSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement | null>(null)

  // Busca com debounce contra a API read-only do catálogo.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/catalogo/aparelhos/search?q=${encodeURIComponent(q)}`, {
          credentials: "include",
          headers: { [ASSISTEC_LOJA_HEADER]: lojaHeader },
          cache: "no-store",
        })
        if (!res.ok) {
          setResults([])
          return
        }
        const data = (await res.json().catch(() => null)) as { results?: DeviceSearchResult[] } | null
        setResults(Array.isArray(data?.results) ? data.results : [])
        setOpen(true)
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 250)
    return () => window.clearTimeout(t)
  }, [query, lojaHeader])

  // Fecha a lista ao clicar fora.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open])

  const addModel = (r: DeviceSearchResult) => {
    setQuery("")
    setResults([])
    setOpen(false)
    if (value.models.some((m) => m.modelKey === r.modelKey)) return
    const nextAliases = Array.from(new Set([...value.aliases, r.canonicalName, ...r.aliases].filter(Boolean)))
    onChange({
      ...value,
      models: [...value.models, { modelKey: r.modelKey, canonicalName: r.canonicalName || r.modelKey, brand: r.brand }],
      aliases: nextAliases,
    })
  }

  const removeModel = (modelKey: string) => {
    onChange({ ...value, models: value.models.filter((m) => m.modelKey !== modelKey) })
  }

  const toggleType = (t: CompatibilityType) => {
    const has = value.types.includes(t)
    onChange({ ...value, types: has ? value.types.filter((x) => x !== t) : [...value.types, t] })
  }

  const hasTechnical = value.types.some((t) => TECHNICAL_COMPATIBILITY_TYPES.includes(t))

  return (
    <div className="space-y-5 min-w-0">
      <p className="text-xs text-muted-foreground">
        Compatibilidade usada para busca e conferência. Não confirma encaixe físico automaticamente.
      </p>

      {/* Busca de aparelho/modelo */}
      <div className="space-y-2" ref={boxRef}>
        <Label htmlFor="compat-busca">Buscar aparelho / modelo</Label>
        <div className="relative min-w-0">
          <Input
            id="compat-busca"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            placeholder="Ex.: A05, Samsung A05, iPhone 13 Pro Max"
            autoComplete="off"
          />
          {open && (query.trim().length >= 2) && (
            <div className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-md">
              {searching && <div className="px-2 py-1.5 text-sm text-muted-foreground">Buscando…</div>}
              {!searching && results.length === 0 && (
                <div className="px-2 py-1.5 text-sm text-muted-foreground">Nenhum modelo encontrado.</div>
              )}
              {results.map((r) => (
                <button
                  key={r.modelKey}
                  type="button"
                  onClick={() => addModel(r)}
                  className="flex w-full flex-col gap-0.5 rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground min-w-0"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="truncate text-sm font-medium">{r.canonicalName || r.modelKey}</span>
                    {r.ambiguous && (
                      <Badge variant="outline" className="border-warning/40 text-warning shrink-0 text-[10px]">
                        {r.requiresBrandContext ? "ambíguo · confirme a marca" : "alias curto"}
                      </Badge>
                    )}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {[r.brand, r.commercialLine].filter(Boolean).join(" · ")}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modelos selecionados */}
      <div className="space-y-2">
        <Label>Modelos vinculados</Label>
        {value.models.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum modelo vinculado. Opcional.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {value.models.map((m) => (
              <Badge key={m.modelKey} variant="secondary" className="gap-1 py-1 pl-2.5 pr-1">
                <span className="truncate max-w-[16rem]">{m.canonicalName}</span>
                <button
                  type="button"
                  aria-label={`Remover ${m.canonicalName}`}
                  onClick={() => removeModel(m.modelKey)}
                  className="ml-0.5 rounded-sm px-1 text-muted-foreground hover:text-foreground"
                >
                  ×
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Tipo de compatibilidade */}
      <div className="space-y-2">
        <Label>Tipo de compatibilidade</Label>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          {COMPATIBILITY_TYPES.map((t) => (
            <label key={t} className="flex items-center gap-2 text-sm min-w-0 cursor-pointer">
              <Checkbox checked={value.types.includes(t)} onCheckedChange={() => toggleType(t)} />
              <span className="truncate">{TYPE_LABELS[t]}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Status */}
      <div className="space-y-2">
        <Label htmlFor="compat-status">Status</Label>
        <Select value={value.status} onValueChange={(v) => onChange({ ...value, status: v as CompatibilityStatus })}>
          <SelectTrigger id="compat-status" className="w-full sm:w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COMPATIBILITY_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Observação curta */}
      <div className="space-y-2">
        <Label htmlFor="compat-notes">Observação (opcional)</Label>
        <Textarea
          id="compat-notes"
          value={value.notes}
          maxLength={500}
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
          placeholder="Ex.: testado no balcão, encaixa mas a câmera fica justa."
          className="min-h-[64px]"
        />
      </div>

      {/* Guardrails */}
      {value.status === "precisa_testar" && (
        <div
          className={cn(
            "flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning",
          )}
        >
          <span aria-hidden>⚠️</span>
          <span>Revisar/testar antes de vender como compatível.</span>
        </div>
      )}
      {hasTechnical && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <span aria-hidden>🛠️</span>
          <span>Peça técnica (tela/bateria/conector) exige confirmação manual.</span>
        </div>
      )}
    </div>
  )
}
