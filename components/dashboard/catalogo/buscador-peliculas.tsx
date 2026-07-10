"use client"

/**
 * CATALOGO-PELICULAS-BUSCADOR-MVP-002 — buscador de películas para o balcão.
 *
 * 100% CONSULTA: busca modelos por nome/alias/marca na API read-only e exibe os
 * grupos de película com status/confiança/avisos honestos. NÃO cria produto,
 * NÃO baixa estoque, NÃO vende e NÃO grava nada.
 *
 * Cores: tokens semânticos `success`/`warning`/`destructive` como sinal de domínio
 * (status de compatibilidade) — sem cor hardcoded.
 */

import { useEffect, useRef, useState } from "react"
import { AlertTriangle, Info, Loader2, ScanSearch, Search, ShieldCheck } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

// --- Tipos do contrato da API (espelham lib/catalogo-aparelhos/peliculas.ts) ---

interface ApiMember {
  modelKey: string
  canonicalName: string
  brand: string
}

interface ApiPeliculaGroup {
  groupKey: string
  groupName: string
  status: string
  confidence: string
  requiresDryTest: boolean
  isCrossBrandGroup: boolean
  memberCount: number
  members: ApiMember[]
  evidence: string
  warnings: string[]
}

interface ApiResult {
  model: {
    modelKey: string
    canonicalName: string
    brand: string
    commercialLine: string
    confidence: string
    status: string
  }
  aliases: string[]
  ambiguous: boolean
  requiresBrandContext: boolean
  flags: string[]
  peliculaGroups: ApiPeliculaGroup[]
}

interface ApiResponse {
  ok: boolean
  query: string
  results: ApiResult[]
  message?: string
  warnings?: string[]
  error?: string
}

// --- Apresentação de status/confiança ---

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  confirmado_fornecedor: {
    label: "Confirmado fornecedor",
    className: "border-success/40 bg-success/10 text-success",
  },
  provavel_mercado: {
    label: "Provável mercado",
    className: "border-warning/40 bg-warning/10 text-warning",
  },
  precisa_testar: {
    label: "Precisa testar",
    className: "border-warning/40 bg-warning/10 text-warning",
  },
  nao_recomendado: {
    label: "Não recomendado",
    className: "border-destructive/40 bg-destructive/10 text-destructive",
  },
}

const CONFIDENCE_LABEL: Record<string, string> = {
  alta: "Confiança alta",
  media: "Confiança média",
  baixa: "Confiança baixa",
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_BADGE[status] ?? STATUS_BADGE.precisa_testar
  return (
    <Badge variant="outline" className={cn("shrink-0 text-[10px]", cfg.className)}>
      {cfg.label}
    </Badge>
  )
}

// --- Componente principal ---

export function BuscadorPeliculas() {
  const [query, setQuery] = useState("")
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const abortRef = useRef<AbortController | null>(null)

  // Busca com debounce contra a API read-only.
  useEffect(() => {
    const q = query.trim()
    abortRef.current?.abort()
    if (q.length < 2) {
      setData(null)
      setLoading(false)
      setError("")
      return
    }
    setLoading(true)
    setError("")
    const controller = new AbortController()
    abortRef.current = controller
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/catalogo/peliculas/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = (await res.json()) as ApiResponse
        if (!controller.signal.aborted) {
          setData(json)
          setLoading(false)
        }
      } catch {
        if (controller.signal.aborted) return
        setError("Falha ao buscar no catálogo. Tente novamente.")
        setData(null)
        setLoading(false)
      }
    }, 300)
    return () => {
      window.clearTimeout(t)
      controller.abort()
    }
  }, [query])

  const results = data?.results ?? []
  const showEmpty = !loading && !error && query.trim().length >= 2 && data !== null && results.length === 0

  return (
    <div className="mx-auto w-full max-w-4xl min-w-0 space-y-4">
      {/* Cabeçalho */}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
            <ScanSearch className="h-4 w-4" />
          </span>
          <h1 className="truncate font-display text-xl font-semibold tracking-tight text-foreground">
            Catálogo de Aparelhos
          </h1>
          <Badge variant="outline" className="shrink-0 text-[10px] text-muted-foreground">
            Consulta · MVP
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Busque compatibilidade de películas por modelo, alias ou marca.
        </p>
      </div>

      {/* Avisos fixos de domínio */}
      <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 space-y-0.5">
          <p>Compatibilidade de película não garante compatibilidade de capinha.</p>
          <p>Confirme fisicamente antes de vender quando status for provável ou precisa testar.</p>
        </div>
      </div>

      {/* Busca */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Digite A06, G35, C75, iPhone 13..."
          className="pl-9"
          autoFocus
          aria-label="Buscar aparelho por modelo, alias ou marca"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Estados honestos */}
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="min-w-0">{error}</p>
        </div>
      )}
      {!error && query.trim().length < 2 && (
        <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Digite pelo menos 2 caracteres para buscar um aparelho.
        </div>
      )}
      {showEmpty && (
        <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          {data?.message ?? "Nenhum aparelho encontrado. Confira a grafia ou confirme o modelo fisicamente."}
        </div>
      )}

      {/* Resultados */}
      <div className="min-w-0 space-y-3">
        {results.map((r) => (
          <ResultadoCard key={r.model.modelKey} result={r} />
        ))}
      </div>
    </div>
  )
}

function ResultadoCard({ result }: { result: ApiResult }) {
  const { model, aliases, ambiguous, requiresBrandContext, peliculaGroups } = result
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-soft">
      {/* Aparelho */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="truncate text-sm font-semibold text-foreground">{model.canonicalName}</span>
        <Badge variant="outline" className="shrink-0 text-[10px] text-muted-foreground">
          {model.brand}
        </Badge>
        {ambiguous && (
          <Badge variant="outline" className="shrink-0 border-warning/40 text-[10px] text-warning">
            Alias ambíguo — confirme a marca
          </Badge>
        )}
      </div>
      {aliases.length > 0 && (
        <p className="mt-1 truncate text-xs text-muted-foreground">
          Também conhecido como: {aliases.join(" · ")}
        </p>
      )}
      {requiresBrandContext && !ambiguous && (
        <p className="mt-1 text-xs text-warning">Alias curto — confirme a marca com o cliente.</p>
      )}

      {/* Grupos de película */}
      {peliculaGroups.length === 0 ? (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="min-w-0">
            Nenhum grupo de película conhecido para este modelo. Teste fisicamente antes de vender.
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {peliculaGroups.map((g) => (
            <GrupoPelicula key={g.groupKey} grupo={g} />
          ))}
        </div>
      )}
    </div>
  )
}

function GrupoPelicula({ grupo }: { grupo: ApiPeliculaGroup }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <ShieldCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {grupo.groupName || "Grupo de película"}
        </span>
        <StatusBadge status={grupo.status} />
        <Badge variant="outline" className="shrink-0 text-[10px] text-muted-foreground">
          {CONFIDENCE_LABEL[grupo.confidence] ?? "Confiança baixa"}
        </Badge>
        {grupo.requiresDryTest && (
          <Badge variant="outline" className="shrink-0 border-warning/40 text-[10px] text-warning">
            Testar seco
          </Badge>
        )}
        {grupo.isCrossBrandGroup && (
          <Badge variant="outline" className="shrink-0 border-warning/40 text-[10px] text-warning">
            Multimarcas
          </Badge>
        )}
      </div>

      {grupo.members.length > 0 && (
        <div className="mt-2 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Modelos equivalentes ({grupo.members.length})
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {grupo.members.map((m) => (
              <Badge key={m.modelKey} variant="secondary" className="max-w-full text-[11px] font-normal">
                <span className="truncate">
                  {m.brand ? `${m.brand} · ` : ""}
                  {m.canonicalName}
                </span>
              </Badge>
            ))}
          </div>
        </div>
      )}

      {grupo.warnings.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {grupo.warnings.map((w) => (
            <li key={w} className="flex items-start gap-1.5 text-xs text-warning">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span className="min-w-0">{w}</span>
            </li>
          ))}
        </ul>
      )}

      {grupo.evidence && (
        <p className="mt-2 truncate text-[11px] text-muted-foreground" title={grupo.evidence}>
          Fonte: {grupo.evidence}
        </p>
      )}
    </div>
  )
}
