"use client"

/**
 * COMPAT-PROFISSIONAL-001 — painéis e fileiras da loja (onde ficam as capinhas).
 * Criar, renomear, descrever ("iPhone / Samsung"), reordenar, ativar/desativar e excluir
 * (só quando nada está vinculado — senão o servidor pede para desativar).
 */

import { useCallback, useEffect, useState } from "react"
import { ArrowDown, ArrowUp, Check, LayoutGrid, Loader2, Pencil, Plus, Power, Trash2, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  atualizarLocal,
  carregarOrganizacao,
  criarFileira,
  criarPainel,
  excluirLocal,
  moverLocal,
  type FileiraDTO,
  type PainelDTO,
} from "@/lib/compat/compat-client"
import type { CompatPreferencias } from "@/lib/compat/organizacao"

type Local = { tipo: "painel" | "fileira"; item: PainelDTO | FileiraDTO }

export function OrganizacaoPanel({ lojaHeader }: { lojaHeader: string | null }) {
  const [paineis, setPaineis] = useState<PainelDTO[]>([])
  const [prefs, setPrefs] = useState<CompatPreferencias | null>(null)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState("")
  const [novoPainel, setNovoPainel] = useState({ nome: "", descricao: "" })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!lojaHeader) return
    setLoading(true)
    const r = await carregarOrganizacao(lojaHeader)
    setLoading(false)
    if (!r.ok) {
      setErro(r.error)
      return
    }
    setErro("")
    setPaineis(r.paineis)
    setPrefs(r.preferencias)
  }, [lojaHeader])

  useEffect(() => {
    void load()
  }, [load])

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true)
    const r = await fn()
    setBusy(false)
    if (!r.ok) setErro(r.error ?? "Falha ao gravar.")
    else setErro("")
    await load()
    return r.ok
  }

  if (!lojaHeader) {
    return <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">Selecione uma loja.</p>
  }

  return (
    <section aria-label="Painéis e fileiras" className="min-w-0 space-y-4">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Painéis e fileiras</h2>
          <p className="text-xs text-muted-foreground">
            Organize como as capinhas ficam expostas. Renomear não quebra os vínculos; locais com capinhas vinculadas só podem ser desativados.
          </p>
        </div>
        {prefs && (
          <Badge variant="outline" className="shrink-0 text-[10px] text-muted-foreground">
            Posições individuais: {prefs.posicoesHabilitadas ? "ligadas" : "desligadas"}
          </Badge>
        )}
      </div>

      <form
        className="flex min-w-0 flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (!novoPainel.nome.trim()) return
          void run(() => criarPainel(lojaHeader, novoPainel)).then((ok) => ok && setNovoPainel({ nome: "", descricao: "" }))
        }}
      >
        <div className="min-w-0 flex-1 basis-40">
          <label className="text-xs font-medium text-foreground" htmlFor="compat-novo-painel">Novo painel</label>
          <Input
            id="compat-novo-painel"
            value={novoPainel.nome}
            maxLength={40}
            onChange={(e) => setNovoPainel((v) => ({ ...v, nome: e.target.value }))}
            placeholder="Ex.: Painel 1, Painel A"
          />
        </div>
        <div className="min-w-0 flex-1 basis-48">
          <label className="text-xs font-medium text-foreground" htmlFor="compat-novo-painel-desc">Descrição (opcional)</label>
          <Input
            id="compat-novo-painel-desc"
            value={novoPainel.descricao}
            maxLength={80}
            onChange={(e) => setNovoPainel((v) => ({ ...v, descricao: e.target.value }))}
            placeholder="Ex.: parede do balcão"
          />
        </div>
        <Button type="submit" disabled={busy || !novoPainel.nome.trim()}>
          <Plus className="mr-1 h-4 w-4" /> Criar painel
        </Button>
      </form>

      {erro && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>}
      {loading && paineis.length === 0 && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>
      )}
      {!loading && paineis.length === 0 && !erro && (
        <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          <LayoutGrid className="mx-auto mb-2 h-6 w-6" />
          Nenhum painel ainda. Crie o primeiro para começar a localizar capinhas.
        </div>
      )}

      <div className="grid min-w-0 gap-3 md:grid-cols-2">
        {paineis.map((p, i) => (
          <PainelCard
            key={p.id}
            painel={p}
            primeiro={i === 0}
            ultimo={i === paineis.length - 1}
            busy={busy}
            lojaHeader={lojaHeader}
            run={run}
          />
        ))}
      </div>
    </section>
  )
}

function PainelCard({
  painel,
  primeiro,
  ultimo,
  busy,
  lojaHeader,
  run,
}: {
  painel: PainelDTO
  primeiro: boolean
  ultimo: boolean
  busy: boolean
  lojaHeader: string
  run: (fn: () => Promise<{ ok: boolean; error?: string }>) => Promise<boolean>
}) {
  const [novaFileira, setNovaFileira] = useState({ nome: "", descricao: "" })
  return (
    <div className={cn("min-w-0 space-y-3 rounded-xl border border-border bg-card p-4", !painel.ativo && "opacity-70")}>
      <LocalLinha
        local={{ tipo: "painel", item: painel }}
        titulo
        primeiro={primeiro}
        ultimo={ultimo}
        busy={busy}
        lojaHeader={lojaHeader}
        run={run}
      />
      <ul className="min-w-0 space-y-1 border-l-2 border-border pl-3">
        {painel.fileiras.map((f, i) => (
          <li key={f.id}>
            <LocalLinha
              local={{ tipo: "fileira", item: f }}
              primeiro={i === 0}
              ultimo={i === painel.fileiras.length - 1}
              busy={busy}
              lojaHeader={lojaHeader}
              run={run}
            />
          </li>
        ))}
        {painel.fileiras.length === 0 && <li className="text-xs text-muted-foreground">Sem fileiras.</li>}
      </ul>
      <form
        className="flex min-w-0 flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!novaFileira.nome.trim()) return
          void run(() => criarFileira(lojaHeader, { painelId: painel.id, ...novaFileira })).then(
            (ok) => ok && setNovaFileira({ nome: "", descricao: "" }),
          )
        }}
      >
        <Input
          aria-label={`Nova fileira em ${painel.nome}`}
          value={novaFileira.nome}
          maxLength={40}
          onChange={(e) => setNovaFileira((v) => ({ ...v, nome: e.target.value }))}
          placeholder="Nova fileira (ex.: Fileira 1)"
          className="h-8 min-w-0 flex-1 basis-32"
        />
        <Input
          aria-label={`Descrição da nova fileira em ${painel.nome}`}
          value={novaFileira.descricao}
          maxLength={80}
          onChange={(e) => setNovaFileira((v) => ({ ...v, descricao: e.target.value }))}
          placeholder="Ex.: iPhone / Samsung"
          className="h-8 min-w-0 flex-1 basis-32"
        />
        <Button type="submit" size="sm" variant="outline" disabled={busy || !novaFileira.nome.trim() || !painel.ativo}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Fileira
        </Button>
      </form>
    </div>
  )
}

function LocalLinha({
  local,
  titulo = false,
  primeiro,
  ultimo,
  busy,
  lojaHeader,
  run,
}: {
  local: Local
  titulo?: boolean
  primeiro: boolean
  ultimo: boolean
  busy: boolean
  lojaHeader: string
  run: (fn: () => Promise<{ ok: boolean; error?: string }>) => Promise<boolean>
}) {
  const { tipo, item } = local
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(item.nome)
  const [descricao, setDescricao] = useState(item.descricao)
  const rotulo = tipo === "painel" ? "painel" : "fileira"

  if (editando) {
    return (
      <form
        className="flex min-w-0 flex-wrap items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault()
          void run(() => atualizarLocal(lojaHeader, tipo, item.id, { version: item.version, nome, descricao })).then(
            (ok) => ok && setEditando(false),
          )
        }}
      >
        <Input aria-label={`Nome do ${rotulo}`} value={nome} maxLength={40} onChange={(e) => setNome(e.target.value)} className="h-8 min-w-0 flex-1 basis-28" />
        <Input aria-label={`Descrição do ${rotulo}`} value={descricao} maxLength={80} onChange={(e) => setDescricao(e.target.value)} className="h-8 min-w-0 flex-1 basis-28" placeholder="Descrição" />
        <Button type="submit" size="sm" variant="ghost" aria-label="Salvar" disabled={busy || !nome.trim()}>
          <Check className="h-4 w-4" />
        </Button>
        <Button type="button" size="sm" variant="ghost" aria-label="Cancelar" onClick={() => setEditando(false)}>
          <X className="h-4 w-4" />
        </Button>
      </form>
    )
  }

  return (
    <div className="flex min-w-0 items-center gap-1">
      <div className="min-w-0 flex-1">
        <p className={cn("flex min-w-0 items-center gap-2", titulo ? "text-sm font-semibold" : "text-sm")}>
          <span className="truncate text-foreground">{item.nome}</span>
          {!item.ativo && <Badge variant="outline" className="shrink-0 border-warning/40 text-[10px] text-warning">desativado</Badge>}
          {item.localizacoes > 0 && (
            <Badge variant="secondary" className="shrink-0 text-[10px]">{item.localizacoes} vínculo(s)</Badge>
          )}
        </p>
        {item.descricao && <p className="truncate text-xs text-muted-foreground">{item.descricao}</p>}
      </div>
      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label={`Subir ${item.nome}`} disabled={busy || primeiro}
        onClick={() => void run(() => moverLocal(lojaHeader, tipo, item.id, "cima"))}>
        <ArrowUp className="h-3.5 w-3.5" />
      </Button>
      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label={`Descer ${item.nome}`} disabled={busy || ultimo}
        onClick={() => void run(() => moverLocal(lojaHeader, tipo, item.id, "baixo"))}>
        <ArrowDown className="h-3.5 w-3.5" />
      </Button>
      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label={`Renomear ${item.nome}`} disabled={busy}
        onClick={() => {
          setNome(item.nome)
          setDescricao(item.descricao)
          setEditando(true)
        }}>
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label={`${item.ativo ? "Desativar" : "Reativar"} ${item.nome}`} disabled={busy}
        onClick={() => void run(() => atualizarLocal(lojaHeader, tipo, item.id, { version: item.version, ativo: !item.ativo }))}>
        <Power className="h-3.5 w-3.5" />
      </Button>
      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label={`Excluir ${item.nome}`}
        disabled={busy || item.localizacoes > 0}
        title={item.localizacoes > 0 ? "Tem capinhas vinculadas: desative em vez de excluir" : undefined}
        onClick={() => void run(() => excluirLocal(lojaHeader, tipo, item.id))}>
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
