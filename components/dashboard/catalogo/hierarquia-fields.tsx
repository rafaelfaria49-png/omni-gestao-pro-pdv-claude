"use client"

/**
 * COMPAT-PROFISSIONAL-001 — campos padronizados do modelo de aparelho:
 * Fabricante › Marca comercial › Linha › Modelo, com sugestões do catálogo (sem digitação
 * inconsistente), prévia do nome padronizado e aviso de modelos PARECIDOS já existentes
 * (aviso, não bloqueio: "A56" e "A56 5G" são aparelhos diferentes; duplicata exata o servidor recusa).
 */

import { useEffect, useId, useMemo, useState } from "react"
import { ChevronRight } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import { fabricanteDaMarca, nomePadronizado } from "@/lib/catalogo-aparelhos/hierarquia"
import { LOJA_MODELO_LIMITS } from "@/lib/catalogo-aparelhos/loja-catalogo"
import type { DeviceSearchResult } from "@/lib/catalogo-aparelhos/types"
import { carregarHierarquia } from "@/lib/compat/compat-client"

export type HierarquiaValue = { manufacturer: string; brand: string; line: string; name: string }

type Arvore = { fabricante: string; marcas: { marca: string; linhas: string[] }[] }[]

// Sugestões são estáticas (CSV global): uma carga por sessão de página basta.
let arvoreCache: { fabricantes: string[]; arvore: Arvore } | null = null

export function HierarquiaFields({
  value,
  onChange,
  lojaHeader,
  errors,
  autoFocus = false,
  excludeModelKey,
}: {
  value: HierarquiaValue
  onChange: (v: HierarquiaValue) => void
  lojaHeader: string | null | undefined
  errors?: Record<string, string>
  autoFocus?: boolean
  /** Na edição: não avisar o próprio modelo como "parecido". */
  excludeModelKey?: string
}) {
  const uid = useId()
  const [sugestoes, setSugestoes] = useState(arvoreCache)
  const [parecidos, setParecidos] = useState<DeviceSearchResult[]>([])

  useEffect(() => {
    if (arvoreCache) return
    let vivo = true
    void carregarHierarquia(lojaHeader).then((r) => {
      if (!vivo || !r.ok) return
      arvoreCache = { fabricantes: r.fabricantes, arvore: r.arvore }
      setSugestoes(arvoreCache)
    })
    return () => {
      vivo = false
    }
  }, [lojaHeader])

  const fabricanteEfetivo = value.manufacturer.trim() || fabricanteDaMarca(value.brand)
  const marcas = useMemo(() => {
    const fab = sugestoes?.arvore.find((f) => f.fabricante.toLowerCase() === fabricanteEfetivo.toLowerCase())
    return fab?.marcas ?? sugestoes?.arvore.flatMap((f) => f.marcas) ?? []
  }, [sugestoes, fabricanteEfetivo])
  const linhas = useMemo(
    () => marcas.find((m) => m.marca.toLowerCase() === value.brand.trim().toLowerCase())?.linhas ?? [],
    [marcas, value.brand],
  )
  const nomeFinal = nomePadronizado(value.brand, value.name)

  // Aviso de parecidos: busca o nome padronizado no catálogo (global + loja).
  useEffect(() => {
    const q = nomeFinal.trim()
    if (q.length < 3 || value.name.trim().length < 2) {
      setParecidos([])
      return
    }
    const controller = new AbortController()
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/catalogo/aparelhos/search?q=${encodeURIComponent(q)}&limit=4`, {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
          ...(lojaHeader ? { headers: { [ASSISTEC_LOJA_HEADER]: lojaHeader } } : {}),
        })
        const data = (await res.json().catch(() => null)) as { results?: DeviceSearchResult[] } | null
        if (!controller.signal.aborted) {
          setParecidos((data?.results ?? []).filter((r) => r.modelKey !== excludeModelKey).slice(0, 3))
        }
      } catch {
        /* aviso opcional: falha silenciosa não bloqueia o cadastro */
      }
    }, 400)
    return () => {
      window.clearTimeout(t)
      controller.abort()
    }
  }, [nomeFinal, value.name, lojaHeader, excludeModelKey])

  const set = (patch: Partial<HierarquiaValue>) => onChange({ ...value, ...patch })

  return (
    <div className="space-y-3 min-w-0">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 min-w-0">
          <Label htmlFor={`${uid}-fab`}>Fabricante</Label>
          <Input
            id={`${uid}-fab`}
            value={value.manufacturer}
            list={`${uid}-fabs`}
            maxLength={LOJA_MODELO_LIMITS.manufacturer}
            onChange={(e) => set({ manufacturer: e.target.value })}
            placeholder={value.brand.trim() ? fabricanteDaMarca(value.brand) : "Ex.: Xiaomi"}
            autoComplete="off"
            autoFocus={autoFocus}
          />
          <datalist id={`${uid}-fabs`}>
            {(sugestoes?.fabricantes ?? []).map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1.5 min-w-0">
          <Label htmlFor={`${uid}-marca`}>Marca comercial</Label>
          <Input
            id={`${uid}-marca`}
            value={value.brand}
            list={`${uid}-marcas`}
            maxLength={LOJA_MODELO_LIMITS.brand}
            onChange={(e) => set({ brand: e.target.value })}
            placeholder="Ex.: Redmi, POCO, Galaxy, Moto"
            autoComplete="off"
            aria-invalid={!!errors?.brand}
          />
          <datalist id={`${uid}-marcas`}>
            {marcas.map((m) => (
              <option key={m.marca} value={m.marca} />
            ))}
          </datalist>
          {errors?.brand && <p className="text-xs text-destructive">{errors.brand}</p>}
        </div>
        <div className="space-y-1.5 min-w-0">
          <Label htmlFor={`${uid}-linha`}>Linha (opcional)</Label>
          <Input
            id={`${uid}-linha`}
            value={value.line}
            list={`${uid}-linhas`}
            maxLength={LOJA_MODELO_LIMITS.line}
            onChange={(e) => set({ line: e.target.value })}
            placeholder="Ex.: A, Note, G, C"
            autoComplete="off"
          />
          <datalist id={`${uid}-linhas`}>
            {linhas.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1.5 min-w-0">
          <Label htmlFor={`${uid}-nome`}>Nome comercial do modelo</Label>
          <Input
            id={`${uid}-nome`}
            value={value.name}
            maxLength={LOJA_MODELO_LIMITS.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="Ex.: A7 Pro, A56 5G"
            autoComplete="off"
            aria-invalid={!!errors?.name}
          />
          {errors?.name && <p className="text-xs text-destructive">{errors.name}</p>}
        </div>
      </div>

      {value.brand.trim() && value.name.trim() && (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 min-w-0" aria-live="polite">
          <p className="text-xs text-muted-foreground">Nome padronizado</p>
          <p className="truncate text-sm font-semibold text-foreground">{nomeFinal}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            {[fabricanteEfetivo, value.brand.trim(), value.line.trim()].filter(Boolean).map((p, i, arr) => (
              <span key={`${p}-${i}`} className="inline-flex items-center gap-1">
                {p}
                {i < arr.length - 1 && <ChevronRight className="h-3 w-3" aria-hidden />}
              </span>
            ))}
          </p>
        </div>
      )}

      {parecidos.length > 0 && (
        <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning min-w-0">
          <p className="font-medium">Já existem modelos parecidos — confira se não é o mesmo aparelho:</p>
          <ul className="mt-1 list-disc pl-4">
            {parecidos.map((p) => (
              <li key={p.modelKey} className="truncate">
                {p.canonicalName}
                {p.source === "loja" ? " (cadastro da loja)" : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
