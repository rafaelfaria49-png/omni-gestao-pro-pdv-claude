"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, Search, User, UserPlus, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import { usePdvCliente, type PdvClienteResult } from "@/hooks/use-pdv-cliente"

export type { PdvClienteResult }

export function PdvClientePicker({
  open,
  storeId,
  onSelect,
  onClose,
}: {
  open: boolean
  storeId: string
  onSelect: (cliente: PdvClienteResult) => void
  onClose: () => void
}) {
  const { query, setQuery, results, loading, clear } = usePdvCliente(storeId)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const searchRef = useRef<HTMLInputElement>(null)

  // Cadastro rápido (sem sair do PDV / sem perder o carrinho).
  const [creating, setCreating] = useState(false)
  const [novoNome, setNovoNome] = useState("")
  const [novoTelefone, setNovoTelefone] = useState("")
  const [novoDoc, setNovoDoc] = useState("")
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const nomeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    clear()
    setSelectedIdx(0)
    setCreating(false)
    setErro(null)
    window.setTimeout(() => searchRef.current?.focus(), 50)
  }, [open, clear])

  useEffect(() => {
    setSelectedIdx(0)
  }, [results])

  useEffect(() => {
    if (!creating) return
    window.setTimeout(() => nomeRef.current?.focus(), 50)
  }, [creating])

  const abrirCadastro = () => {
    setNovoNome(query.trim())
    setNovoTelefone("")
    setNovoDoc("")
    setErro(null)
    setCreating(true)
  }

  const salvarNovoCliente = async () => {
    const nome = novoNome.trim()
    if (!nome) {
      setErro("Informe o nome do cliente.")
      return
    }
    setSaving(true)
    setErro(null)
    try {
      const res = await fetch("/api/clientes/quick", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", [ASSISTEC_LOJA_HEADER]: storeId },
        body: JSON.stringify({ name: nome, phone: novoTelefone.trim(), document: novoDoc.trim() }),
      })
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; cliente?: PdvClienteResult; error?: string }
        | null
      if (!res.ok || !data?.cliente) {
        setErro(data?.error || "Não foi possível cadastrar o cliente.")
        return
      }
      onSelect(data.cliente)
    } catch {
      setErro("Falha de conexão ao cadastrar o cliente.")
    } finally {
      setSaving(false)
    }
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIdx((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIdx((i) => Math.max(0, i - 1))
    } else if (e.key === "Enter") {
      e.preventDefault()
      if (results[selectedIdx]) onSelect(results[selectedIdx]!)
      else if (query.trim()) abrirCadastro()
    } else if (e.key === "Escape") {
      onClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[80vh] max-w-md flex-col gap-0 overflow-hidden rounded-2xl border-border bg-card p-0">
        <DialogHeader className="shrink-0 border-b border-border px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-foreground">
            {creating ? <UserPlus className="h-4 w-4 text-primary" /> : <User className="h-4 w-4 text-primary" />}
            {creating ? "Cadastrar Cliente" : "Selecionar Cliente"}
            <kbd className="ml-auto rounded border border-border bg-muted px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">
              F2
            </kbd>
          </DialogTitle>
        </DialogHeader>

        {creating ? (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Nome *</Label>
              <Input
                ref={nomeRef}
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    void salvarNovoCliente()
                  }
                }}
                placeholder="Nome do cliente"
                className="h-10 bg-background"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Telefone (opcional)</Label>
              <Input
                value={novoTelefone}
                onChange={(e) => setNovoTelefone(e.target.value)}
                inputMode="numeric"
                placeholder="DDD + número"
                className="h-10 bg-background"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">CPF / CNPJ (opcional)</Label>
              <Input
                value={novoDoc}
                onChange={(e) => setNovoDoc(e.target.value)}
                inputMode="numeric"
                placeholder="Somente números"
                className="h-10 bg-background"
              />
            </div>
            {erro ? <p className="text-xs text-destructive">{erro}</p> : null}
          </div>
        ) : (
          <>
            <div className="shrink-0 border-b border-border px-4 py-3">
              <div className="relative">
                {loading ? (
                  <Loader2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                ) : (
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                )}
                <Input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Nome, CPF/CNPJ ou telefone…"
                  className="h-9 rounded-xl border-border bg-background pl-9 text-sm"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {!query.trim() ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <Search className="h-8 w-8 text-muted-foreground/25" />
                  <p className="text-sm text-muted-foreground">Digite para buscar um cliente.</p>
                </div>
              ) : loading && results.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Buscando…
                </div>
              ) : results.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <User className="h-8 w-8 text-muted-foreground/25" />
                  <p className="text-sm text-muted-foreground">
                    Nenhum resultado para &ldquo;{query}&rdquo;.
                  </p>
                  <Button size="sm" className="h-9 rounded-lg" onClick={abrirCadastro}>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Cadastrar &ldquo;{query.trim()}&rdquo;
                  </Button>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {results.map((c, idx) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onSelect(c)}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-100",
                        "hover:bg-accent",
                        idx === selectedIdx && "bg-accent"
                      )}
                    >
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {c.name.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">{c.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {[c.document, c.phone].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        <DialogFooter className="shrink-0 border-t border-border px-4 py-3">
          {creating ? (
            <div className="flex w-full items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-9 rounded-lg text-xs"
                onClick={() => setCreating(false)}
                disabled={saving}
              >
                <ArrowLeft className="mr-1 h-3.5 w-3.5" />
                Voltar
              </Button>
              <Button
                size="sm"
                className="ml-auto h-9 rounded-lg"
                onClick={() => void salvarNovoCliente()}
                disabled={saving || !novoNome.trim()}
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                Salvar e usar
              </Button>
            </div>
          ) : (
            <div className="flex w-full items-center gap-2">
              <p className="flex-1 text-[10px] text-muted-foreground">
                <kbd className="rounded border border-border bg-muted px-1 font-bold">↑↓</kbd> navegar{" · "}
                <kbd className="rounded border border-border bg-muted px-1 font-bold">Enter</kbd> selecionar
              </p>
              <Button variant="ghost" size="sm" className="h-7 rounded-lg text-xs" onClick={abrirCadastro}>
                <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                Novo
              </Button>
              <Button variant="ghost" size="sm" className="h-7 rounded-lg text-xs" onClick={onClose}>
                Fechar
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
