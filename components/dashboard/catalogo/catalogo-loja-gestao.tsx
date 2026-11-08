"use client"

/**
 * CADASTROS-ACESSORIOS-COMPATIBILIDADE-MANUAL-001 — gestão do catálogo DA LOJA ATIVA.
 *
 *  - `ModelosDaLojaPanel`: lista/pesquisa, cadastra, edita e desativa/reativa modelos manuais.
 *  - `AdicionarEquivalenteDialog`: adiciona relação manual de película entre dois modelos.
 *
 * Tudo é gravado no servidor (escopo da loja). Desativar não apaga: vínculos de produtos e
 * vendas registradas continuam intactos. Nada aqui altera estoque, preço ou fiscal.
 */

import { useCallback, useEffect, useId, useState } from "react"
import { Pencil, Plus, Power } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import {
  LOJA_COMPAT_STATUSES,
  LOJA_MODELO_LIMITS,
  lojaModeloCanonicalName,
  type LojaCompatStatus,
  type LojaModelo,
} from "@/lib/catalogo-aparelhos/loja-catalogo"
import {
  atualizarModeloLoja,
  decidirCompatPelicula,
  listarModelosLoja,
} from "@/lib/catalogo-aparelhos/loja-catalogo-client"
import type { DeviceSearchResult } from "@/lib/catalogo-aparelhos/types"
import { CadastrarModeloAparelhoDialog } from "./cadastrar-modelo-aparelho-dialog"

export const LOJA_COMPAT_STATUS_LABELS: Record<LojaCompatStatus, string> = {
  provavel_mercado: "Provável (informado pela loja)",
  precisa_testar: "Precisa testar",
  nao_recomendado: "Não recomendado",
}

// ---------------------------------------------------------------------------
// Modelos da loja
// ---------------------------------------------------------------------------

export function ModelosDaLojaPanel({
  lojaHeader,
  onChanged,
}: {
  lojaHeader: string | null
  /** Chamado após qualquer gravação (o buscador refaz a consulta). */
  onChanged: () => void
}) {
  const [modelos, setModelos] = useState<LojaModelo[]>([])
  const [filtro, setFiltro] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [cadastroOpen, setCadastroOpen] = useState(false)
  const [editando, setEditando] = useState<LojaModelo | null>(null)
  const [rowBusy, setRowBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!lojaHeader) return
    setLoading(true)
    const res = await listarModelosLoja(lojaHeader, { inativos: true })
    setLoading(false)
    if (res.ok) {
      setModelos(res.modelos)
      setError("")
    } else setError(res.error)
  }, [lojaHeader])

  useEffect(() => {
    void load()
  }, [load])

  const changed = () => {
    void load()
    onChanged()
  }

  const toggleAtivo = async (m: LojaModelo) => {
    setRowBusy(m.id)
    const res = await atualizarModeloLoja(lojaHeader, m.id, { version: m.version, active: !m.active })
    setRowBusy(null)
    if (!res.ok) {
      setError(res.error)
      return
    }
    changed()
  }

  const f = filtro.trim().toLowerCase()
  const visiveis = f
    ? modelos.filter((m) => [m.brand, m.name, ...m.aliases].some((t) => t.toLowerCase().includes(f)))
    : modelos

  if (!lojaHeader) {
    return (
      <p className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
        Selecione uma loja para gerenciar os modelos cadastrados manualmente.
      </p>
    )
  }

  return (
    <section aria-label="Modelos cadastrados pela loja" className="min-w-0 space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Modelos cadastrados pela loja</h2>
          <p className="text-xs text-muted-foreground">
            Lançamentos que ainda não estão no catálogo. Valem só para esta loja.
          </p>
        </div>
        <Button type="button" size="sm" onClick={() => setCadastroOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Cadastrar novo modelo
        </Button>
      </div>

      {modelos.length > 0 && (
        <Input
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Pesquisar modelo da loja"
          aria-label="Pesquisar modelo da loja"
          className="h-8"
        />
      )}

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {loading && modelos.length === 0 && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {!loading && modelos.length === 0 && !error && (
        <p className="text-sm text-muted-foreground">Nenhum modelo cadastrado manualmente.</p>
      )}

      <ul className="min-w-0 divide-y divide-border">
        {visiveis.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-2 py-2 min-w-0">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {lojaModeloCanonicalName(m)}
                {!m.active && (
                  <Badge variant="outline" className="ml-2 border-warning/40 text-[10px] text-warning">
                    desativado
                  </Badge>
                )}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {[m.brand, m.aliases.length ? `apelidos: ${m.aliases.join(", ")}` : "", m.notes].filter(Boolean).join(" · ")}
              </p>
            </div>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditando(m)} aria-label={`Editar ${m.name}`}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={rowBusy === m.id}
              onClick={() => void toggleAtivo(m)}
            >
              <Power className="mr-1 h-3.5 w-3.5" />
              {m.active ? "Desativar" : "Reativar"}
            </Button>
          </li>
        ))}
      </ul>

      <CadastrarModeloAparelhoDialog
        open={cadastroOpen}
        onOpenChange={setCadastroOpen}
        lojaHeader={lojaHeader}
        onCreated={() => changed()}
      />
      <EditarModeloDialog
        modelo={editando}
        lojaHeader={lojaHeader}
        onClose={() => setEditando(null)}
        onSaved={() => {
          setEditando(null)
          changed()
        }}
      />
    </section>
  )
}

function EditarModeloDialog({
  modelo,
  lojaHeader,
  onClose,
  onSaved,
}: {
  modelo: LojaModelo | null
  lojaHeader: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const uid = useId()
  const [brand, setBrand] = useState("")
  const [name, setName] = useState("")
  const [aliases, setAliases] = useState("")
  const [notes, setNotes] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!modelo) return
    setBrand(modelo.brand)
    setName(modelo.name)
    setAliases(modelo.aliases.join(", "))
    setNotes(modelo.notes)
    setError("")
    setBusy(false)
  }, [modelo])

  const save = async () => {
    if (!modelo) return
    setBusy(true)
    const res = await atualizarModeloLoja(lojaHeader, modelo.id, {
      version: modelo.version,
      brand,
      name,
      aliases: aliases.split(/[,;\n]/).map((a) => a.trim()).filter(Boolean),
      notes,
    })
    setBusy(false)
    if (res.ok) onSaved()
    else setError(res.error)
  }

  return (
    <Dialog open={modelo !== null} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar modelo da loja</DialogTitle>
          <DialogDescription>
            A identidade do modelo não muda: produtos vinculados e vendas registradas continuam válidos.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 min-w-0">
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-marca`}>Marca do aparelho</Label>
            <Input id={`${uid}-marca`} value={brand} maxLength={LOJA_MODELO_LIMITS.brand} onChange={(e) => setBrand(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-nome`}>Nome comercial do modelo</Label>
            <Input id={`${uid}-nome`} value={name} maxLength={LOJA_MODELO_LIMITS.name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-alias`}>Apelidos (opcional)</Label>
            <Input id={`${uid}-alias`} value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="Separe por vírgula" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-obs`}>Observação (opcional)</Label>
            <Textarea id={`${uid}-obs`} value={notes} maxLength={LOJA_MODELO_LIMITS.notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[56px]" />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void save()} disabled={busy || !brand.trim() || name.trim().length < 2}>
            {busy ? "Salvando…" : "Salvar alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Relação manual de película
// ---------------------------------------------------------------------------

export function AdicionarEquivalenteDialog({
  baseModel,
  lojaHeader,
  onClose,
  onSaved,
}: {
  baseModel: { modelKey: string; canonicalName: string } | null
  lojaHeader: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const uid = useId()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<DeviceSearchResult[]>([])
  const [escolhido, setEscolhido] = useState<DeviceSearchResult | null>(null)
  const [status, setStatus] = useState<LojaCompatStatus>("precisa_testar")
  const [notes, setNotes] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!baseModel) return
    setQuery("")
    setResults([])
    setEscolhido(null)
    setStatus("precisa_testar")
    setNotes("")
    setError("")
  }, [baseModel])

  useEffect(() => {
    const q = query.trim()
    if (!baseModel || q.length < 2) {
      setResults([])
      return
    }
    const controller = new AbortController()
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/catalogo/aparelhos/search?q=${encodeURIComponent(q)}&limit=10`, {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
          ...(lojaHeader ? { headers: { [ASSISTEC_LOJA_HEADER]: lojaHeader } } : {}),
        })
        const data = (await res.json().catch(() => null)) as { results?: DeviceSearchResult[] } | null
        if (!controller.signal.aborted) {
          setResults((data?.results ?? []).filter((r) => r.modelKey !== baseModel.modelKey))
        }
      } catch {
        /* abortada ou rede: mantém a lista anterior */
      }
    }, 250)
    return () => {
      window.clearTimeout(t)
      controller.abort()
    }
  }, [query, baseModel, lojaHeader])

  const save = async () => {
    if (!baseModel || !escolhido) return
    setBusy(true)
    const res = await decidirCompatPelicula(lojaHeader, {
      modelKey: baseModel.modelKey,
      otherModelKey: escolhido.modelKey,
      decisao: "adicionar",
      status,
      notes,
    })
    setBusy(false)
    if (res.ok) onSaved()
    else setError(res.error)
  }

  return (
    <Dialog open={baseModel !== null} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar película equivalente</DialogTitle>
          <DialogDescription>
            Para {baseModel?.canonicalName}. Vale só nesta loja e aparece como informado pela loja — não é confirmação
            do fabricante.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 min-w-0">
          {escolhido ? (
            <div className="flex items-center gap-2 min-w-0">
              <Badge variant="secondary" className="min-w-0 py-1">
                <span className="truncate">{escolhido.canonicalName}</span>
              </Badge>
              <Button type="button" size="sm" variant="ghost" onClick={() => setEscolhido(null)}>
                Trocar
              </Button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-busca`}>Modelo que usa a mesma película</Label>
              <Input
                id={`${uid}-busca`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Pesquise o modelo"
                autoComplete="off"
                autoFocus
              />
              <div className="max-h-48 overflow-auto rounded-md border border-border">
                {results.map((r) => (
                  <button
                    key={r.modelKey}
                    type="button"
                    onClick={() => setEscolhido(r)}
                    className="flex w-full flex-col px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground min-w-0"
                  >
                    <span className="truncate font-medium">{r.canonicalName}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {[r.brand, r.source === "loja" ? "cadastro da loja" : ""].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                ))}
                {query.trim().length >= 2 && results.length === 0 && (
                  <p className="px-2 py-1.5 text-sm text-muted-foreground">Nenhum modelo encontrado.</p>
                )}
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-status`}>Status</Label>
            <select
              id={`${uid}-status`}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value as LojaCompatStatus)}
            >
              {LOJA_COMPAT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {LOJA_COMPAT_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-obs`}>Observação (opcional)</Label>
            <Textarea id={`${uid}-obs`} value={notes} maxLength={300} onChange={(e) => setNotes(e.target.value)} className="min-h-[56px]" />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void save()} disabled={busy || !escolhido}>
            {busy ? "Salvando…" : "Adicionar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Remove (suprime) uma relação global ou desfaz uma relação manual — sempre só nesta loja. */
export async function removerEquivalente(
  lojaHeader: string | null,
  modelKey: string,
  otherModelKey: string,
  manual: boolean,
) {
  return decidirCompatPelicula(lojaHeader, {
    modelKey,
    otherModelKey,
    decisao: manual ? "restaurar" : "suprimir",
  })
}

export async function restaurarEquivalente(lojaHeader: string | null, modelKey: string, otherModelKey: string) {
  return decidirCompatPelicula(lojaHeader, { modelKey, otherModelKey, decisao: "restaurar" })
}

