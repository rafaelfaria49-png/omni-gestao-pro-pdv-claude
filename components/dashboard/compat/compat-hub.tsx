"use client"

/**
 * COMPAT-PROFISSIONAL-001 — HUB do Compat.
 *
 * Duas áreas claramente separadas — Películas e Capinhas (compatibilidades INDEPENDENTES) —
 * e uma terceira para o que é compartilhado: catálogo de modelos, cores, preferências e
 * relatórios. Uma única barra de navegação por nível (sem duplicar caminhos).
 * Área/aba ficam na URL (?area=&aba=) para links diretos e "voltar" do navegador.
 */

import { useCallback, useState } from "react"
import { BarChart3, Layers, LayoutGrid, Link2, Palette, Search, Settings2, Shield, Smartphone, Wrench } from "lucide-react"
import { cn } from "@/lib/utils"
import { useLojaAtiva } from "@/lib/loja-ativa"
import { BuscadorPeliculas } from "@/components/dashboard/catalogo/buscador-peliculas"
import { ModelosDaLojaPanel } from "@/components/dashboard/catalogo/catalogo-loja-gestao"
import { ConsultaCapinhas } from "./consulta-capinhas"
import { VinculosPanel } from "./vinculos-panel"
import { OrganizacaoPanel } from "./organizacao-panel"
import { CoresPanel, PreferenciasPanel, RelatorioPanel } from "./ajustes-panels"
import type { ModeloEscolhido } from "./modelo-picker"

export type CompatArea = "peliculas" | "capinhas" | "ajustes"

const AREAS: { id: CompatArea; titulo: string; desc: string; icon: typeof Shield }[] = [
  { id: "peliculas", titulo: "Compatibilidade de Películas", desc: "Qual película serve em qual aparelho", icon: Shield },
  { id: "capinhas", titulo: "Compatibilidade de Capinhas", desc: "Capinhas compatíveis, onde estão e estoque", icon: Smartphone },
  { id: "ajustes", titulo: "Catálogo e ajustes", desc: "Modelos, cores, preferências e relatórios", icon: Wrench },
]

const ABAS: Record<CompatArea, { id: string; label: string; icon: typeof Search }[]> = {
  peliculas: [
    { id: "consultar", label: "Consultar", icon: Search },
    { id: "vinculos", label: "Vínculos", icon: Link2 },
  ],
  capinhas: [
    { id: "consultar", label: "Consultar", icon: Search },
    { id: "vinculos", label: "Vínculos", icon: Link2 },
    { id: "localizacao", label: "Painéis e fileiras", icon: LayoutGrid },
  ],
  ajustes: [
    { id: "modelos", label: "Modelos", icon: Layers },
    { id: "cores", label: "Cores", icon: Palette },
    { id: "preferencias", label: "Preferências", icon: Settings2 },
    { id: "relatorios", label: "Relatórios", icon: BarChart3 },
  ],
}

export function normalizarNavegacao(area?: string | null, aba?: string | null): { area: CompatArea; aba: string } {
  const a: CompatArea = area === "capinhas" || area === "ajustes" ? area : "peliculas"
  const valida = ABAS[a].some((x) => x.id === aba)
  return { area: a, aba: valida ? (aba as string) : ABAS[a][0].id }
}

export function CompatHub({ areaInicial, abaInicial }: { areaInicial?: string; abaInicial?: string }) {
  const inicial = normalizarNavegacao(areaInicial, abaInicial)
  const [area, setArea] = useState<CompatArea>(inicial.area)
  const [aba, setAba] = useState(inicial.aba)
  const [modeloVinculo, setModeloVinculo] = useState<ModeloEscolhido | null>(null)
  const [nonce, setNonce] = useState(0)
  const { lojaAtivaId } = useLojaAtiva()
  const lojaHeader = (lojaAtivaId ?? "").trim() || null

  const navegar = useCallback((nextArea: CompatArea, nextAba?: string) => {
    const n = normalizarNavegacao(nextArea, nextAba)
    setArea(n.area)
    setAba(n.aba)
    try {
      const url = new URL(window.location.href)
      url.searchParams.set("area", n.area)
      url.searchParams.set("aba", n.aba)
      window.history.replaceState(null, "", url.toString())
    } catch {
      /* navegação sem URL continua funcionando */
    }
  }, [])

  return (
    <div className="mx-auto w-full max-w-6xl min-w-0 space-y-5">
      <header className="min-w-0">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Compat</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Compatibilidade de películas e capinhas da loja. Película e capinha são independentes: uma não garante a outra.
        </p>
      </header>

      <nav aria-label="Áreas do Compat" className="grid min-w-0 gap-2 sm:grid-cols-3">
        {AREAS.map((a) => {
          const Icon = a.icon
          const ativo = area === a.id
          return (
            <button
              key={a.id}
              type="button"
              aria-current={ativo ? "page" : undefined}
              onClick={() => navegar(a.id)}
              className={cn(
                "flex min-w-0 items-start gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                ativo ? "border-primary bg-primary/10 shadow-sm" : "border-border bg-card hover:bg-accent",
                a.id === "ajustes" && !ativo && "bg-muted/30",
              )}
            >
              <span
                className={cn(
                  "grid h-9 w-9 shrink-0 place-items-center rounded-lg ring-1",
                  ativo ? "bg-primary text-primary-foreground ring-primary" : "bg-muted text-muted-foreground ring-border",
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-foreground">{a.titulo}</span>
                <span className="block truncate text-xs text-muted-foreground">{a.desc}</span>
              </span>
            </button>
          )
        })}
      </nav>

      <div role="tablist" aria-label="Seções" className="flex min-w-0 gap-1 overflow-x-auto border-b border-border">
        {ABAS[area].map((t) => {
          const Icon = t.icon
          const ativo = aba === t.id
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={ativo}
              onClick={() => navegar(area, t.id)}
              className={cn(
                "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                ativo ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          )
        })}
      </div>

      <div role="tabpanel" className="min-w-0">
        {area === "peliculas" && aba === "consultar" && <BuscadorPeliculas embedded key={`pel-${nonce}`} />}
        {area === "peliculas" && aba === "vinculos" && (
          <VinculosPanel categoria="pelicula_tela" lojaHeader={lojaHeader} modeloInicial={modeloVinculo} />
        )}
        {area === "capinhas" && aba === "consultar" && (
          <ConsultaCapinhas
            lojaHeader={lojaHeader}
            onGerenciarVinculos={(m) => {
              setModeloVinculo(m)
              navegar("capinhas", "vinculos")
            }}
          />
        )}
        {area === "capinhas" && aba === "vinculos" && (
          <VinculosPanel categoria="capinha" lojaHeader={lojaHeader} modeloInicial={modeloVinculo} />
        )}
        {area === "capinhas" && aba === "localizacao" && <OrganizacaoPanel lojaHeader={lojaHeader} />}
        {area === "ajustes" && aba === "modelos" && (
          <ModelosDaLojaPanel lojaHeader={lojaHeader} onChanged={() => setNonce((n) => n + 1)} />
        )}
        {area === "ajustes" && aba === "cores" && <CoresPanel lojaHeader={lojaHeader} />}
        {area === "ajustes" && aba === "preferencias" && <PreferenciasPanel lojaHeader={lojaHeader} />}
        {area === "ajustes" && aba === "relatorios" && <RelatorioPanel lojaHeader={lojaHeader} />}
      </div>
    </div>
  )
}
