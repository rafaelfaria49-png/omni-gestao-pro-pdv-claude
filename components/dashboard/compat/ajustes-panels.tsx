"use client"

/**
 * COMPAT-PROFISSIONAL-001 — Cores, Preferências e Relatórios do Compat (por loja).
 */

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, BarChart3, Check, Loader2, Palette, Pencil, Plus, Power, Settings2, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import type { AcessorioModoCaptura } from "@/lib/acessorios/types"
import type { CorEfetiva } from "@/lib/compat/cores-loja"
import type { CompatPreferencias } from "@/lib/compat/organizacao"
import {
  ativarCorPadrao,
  atualizarCor,
  carregarCores,
  carregarOrganizacao,
  carregarRelatorio,
  criarCor,
  salvarPreferencias,
  type RelatorioDTO,
} from "@/lib/compat/compat-client"

function Vazio({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">{children}</p>
}

// ---------------------------------------------------------------------------
// Cores
// ---------------------------------------------------------------------------

export function CoresPanel({ lojaHeader }: { lojaHeader: string | null }) {
  const [cores, setCores] = useState<CorEfetiva[]>([])
  const [erro, setErro] = useState("")
  const [nova, setNova] = useState("")
  const [busy, setBusy] = useState(false)
  const [editando, setEditando] = useState<{ id: string; label: string; version: number } | null>(null)

  const load = useCallback(async () => {
    if (!lojaHeader) return
    const r = await carregarCores(lojaHeader)
    if (r.ok) {
      setCores(r.cores)
      setErro("")
    } else setErro(r.error)
  }, [lojaHeader])

  useEffect(() => {
    void load()
  }, [load])

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true)
    const r = await fn()
    setBusy(false)
    setErro(r.ok ? "" : (r.error ?? "Falha ao gravar."))
    await load()
    return r.ok
  }

  if (!lojaHeader) return <Vazio>Selecione uma loja.</Vazio>
  const padrao = cores.filter((c) => c.origem === "padrao")
  const proprias = cores.filter((c) => c.origem === "loja")

  return (
    <section aria-label="Cores" className="min-w-0 space-y-4">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground"><Palette className="h-4 w-4 text-primary" /> Cores</h2>
        <p className="text-xs text-muted-foreground">
          Cores oferecidas no PDV. Desativar ou renomear não altera vendas já registradas (o nome fica gravado na venda).
        </p>
      </div>
      {erro && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>}

      <form
        className="flex min-w-0 flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (!nova.trim()) return
          void run(() => criarCor(lojaHeader, nova)).then((ok) => ok && setNova(""))
        }}
      >
        <div className="min-w-0 flex-1 basis-48">
          <Label htmlFor="compat-nova-cor">Nova cor da loja</Label>
          <Input id="compat-nova-cor" value={nova} maxLength={40} onChange={(e) => setNova(e.target.value)} placeholder="Ex.: Azul bebê, Rosa pink" />
        </div>
        <Button type="submit" disabled={busy || !nova.trim()}>
          <Plus className="mr-1 h-4 w-4" /> Cadastrar cor
        </Button>
      </form>

      <div className="min-w-0 space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cores da loja</h3>
        {proprias.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma cor própria cadastrada.</p>}
        <ul className="min-w-0 divide-y divide-border rounded-lg border border-border bg-card">
          {proprias.map((c) => (
            <li key={c.id} className="flex min-w-0 items-center gap-2 px-3 py-2">
              {editando?.id === c.id ? (
                <form
                  className="flex min-w-0 flex-1 items-center gap-1"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void run(() => atualizarCor(lojaHeader, c.id, { version: editando.version, label: editando.label })).then(
                      (ok) => ok && setEditando(null),
                    )
                  }}
                >
                  <Input aria-label="Nome da cor" value={editando.label} maxLength={40} className="h-8" onChange={(e) => setEditando({ ...editando, label: e.target.value })} />
                  <Button type="submit" size="icon" variant="ghost" className="h-8 w-8" aria-label="Salvar" disabled={busy}><Check className="h-4 w-4" /></Button>
                  <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label="Cancelar" onClick={() => setEditando(null)}><X className="h-4 w-4" /></Button>
                </form>
              ) : (
                <>
                  <span className={cn("min-w-0 flex-1 truncate text-sm", c.ativo ? "text-foreground" : "text-muted-foreground line-through")}>{c.label}</span>
                  <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label={`Renomear ${c.label}`} disabled={busy}
                    onClick={() => setEditando({ id: c.id, label: c.label, version: c.version })}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" size="sm" variant="outline" disabled={busy}
                    onClick={() => void run(() => atualizarCor(lojaHeader, c.id, { version: c.version, ativo: !c.ativo }))}>
                    <Power className="mr-1 h-3.5 w-3.5" /> {c.ativo ? "Desativar" : "Reativar"}
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="min-w-0 space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cores padrão</h3>
        <div className="flex flex-wrap gap-1.5">
          {padrao.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={busy || c.id === "outra"}
              aria-pressed={c.ativo}
              title={c.id === "outra" ? "Sempre disponível (texto livre)" : c.ativo ? "Clique para desativar nesta loja" : "Clique para reativar"}
              onClick={() => void run(() => ativarCorPadrao(lojaHeader, c.id, !c.ativo))}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
                c.ativo ? "border-primary/40 bg-primary/10 text-foreground" : "border-border bg-background text-muted-foreground line-through",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Preferências
// ---------------------------------------------------------------------------

const MODOS: { value: AcessorioModoCaptura; label: string; desc: string }[] = [
  { value: "obrigatorio", label: "Obrigatório", desc: "O PDV não adiciona sem informar." },
  { value: "opcional", label: "Opcional", desc: "Pergunta, mas dá para pular (venda rápida)." },
  { value: "desativado", label: "Desativado", desc: "Não pergunta." },
]

export function PreferenciasPanel({ lojaHeader }: { lojaHeader: string | null }) {
  const [prefs, setPrefs] = useState<CompatPreferencias | null>(null)
  const [erro, setErro] = useState("")
  const [ok, setOk] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!lojaHeader) return
    void carregarOrganizacao(lojaHeader).then((r) => (r.ok ? setPrefs(r.preferencias) : setErro(r.error)))
  }, [lojaHeader])

  const salvar = async (patch: Partial<CompatPreferencias>) => {
    if (!prefs || !lojaHeader) return
    setBusy(true)
    const r = await salvarPreferencias(lojaHeader, { version: prefs.version, ...patch })
    setBusy(false)
    if (r.ok) {
      setPrefs(r.preferencias)
      setErro("")
      setOk(true)
      window.setTimeout(() => setOk(false), 1500)
    } else setErro(r.error)
  }

  if (!lojaHeader) return <Vazio>Selecione uma loja.</Vazio>
  if (!prefs) return erro ? <p role="alert" className="text-sm text-destructive">{erro}</p> : <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />

  return (
    <section aria-label="Preferências do Compat" className="min-w-0 space-y-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Settings2 className="h-4 w-4 text-primary" /> Preferências
        {ok && <Badge variant="outline" className="border-success/40 text-[10px] text-success">salvo</Badge>}
      </h2>
      {erro && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>}

      <div className="flex min-w-0 items-start justify-between gap-4 rounded-xl border border-border bg-card p-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Controlar posições individuais</p>
          <p className="text-xs text-muted-foreground">
            Além de painel e fileira, registrar a posição exata (ex.: “Pos. 3”). Desligado, a loja usa só painel/fileira.
          </p>
        </div>
        <Switch
          aria-label="Controlar posições individuais"
          checked={prefs.posicoesHabilitadas}
          disabled={busy}
          onCheckedChange={(v) => void salvar({ posicoesHabilitadas: v })}
        />
      </div>

      {(["modoModeloPadrao", "modoCorPadrao"] as const).map((campo) => (
        <div key={campo} className="min-w-0 space-y-2 rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-medium text-foreground">
            {campo === "modoModeloPadrao" ? "Modelo do aparelho na venda" : "Cor na venda"} — padrão para capinhas novas
          </p>
          <p className="text-xs text-muted-foreground">Cada produto pode ter a sua regra na ficha do produto (Configuração de acessórios).</p>
          <div role="radiogroup" className="grid gap-2 sm:grid-cols-3">
            {MODOS.map((m) => (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={prefs[campo] === m.value}
                disabled={busy}
                onClick={() => void salvar({ [campo]: m.value })}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  prefs[campo] === m.value ? "border-primary bg-primary/10" : "border-border bg-background hover:bg-accent",
                )}
              >
                <span className="block text-sm font-medium text-foreground">{m.label}</span>
                <span className="block text-xs text-muted-foreground">{m.desc}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Relatórios
// ---------------------------------------------------------------------------

function Barras({ titulo, itens, total }: { titulo: string; itens: { chave: string; rotulo: string; quantidade: number }[]; total: number }) {
  const max = Math.max(1, ...itens.map((i) => i.quantidade))
  return (
    <div className="min-w-0 space-y-2 rounded-xl border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground">{titulo}</h3>
      {itens.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem registros no período.</p>
      ) : (
        <ul className="space-y-1.5">
          {itens.slice(0, 10).map((i) => (
            <li key={i.chave} className="min-w-0">
              <div className="flex min-w-0 items-baseline justify-between gap-2 text-sm">
                <span className="truncate text-foreground">{i.rotulo}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {i.quantidade}
                  {total > 0 ? ` · ${Math.round((i.quantidade / total) * 100)}%` : ""}
                </span>
              </div>
              <div className="mt-0.5 h-1.5 rounded-full bg-muted">
                <div className="h-1.5 rounded-full bg-primary" style={{ width: `${(i.quantidade / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function RelatorioPanel({ lojaHeader }: { lojaHeader: string | null }) {
  const [dias, setDias] = useState(30)
  const [dados, setDados] = useState<RelatorioDTO | null>(null)
  const [erro, setErro] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!lojaHeader) return
    setLoading(true)
    void carregarRelatorio(lojaHeader, dias).then((r) => {
      setLoading(false)
      if (r.ok) {
        setDados(r)
        setErro("")
      } else setErro(r.error)
    })
  }, [lojaHeader, dias])

  if (!lojaHeader) return <Vazio>Selecione uma loja.</Vazio>
  const r = dados?.relatorio

  return (
    <section aria-label="Relatórios de capinhas" className="min-w-0 space-y-4">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <BarChart3 className="h-4 w-4 text-primary" /> Capinhas vendidas {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        </h2>
        <div role="group" aria-label="Período" className="flex gap-1">
          {[7, 30, 90].map((d) => (
            <Button key={d} type="button" size="sm" variant={dias === d ? "default" : "outline"} onClick={() => setDias(d)}>
              {d} dias
            </Button>
          ))}
        </div>
      </div>
      {erro && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>}
      {dados?.truncado && (
        <p className="flex items-center gap-2 text-xs text-warning"><AlertTriangle className="h-3.5 w-3.5" /> Período com muitas vendas: mostrando as 5.000 mais recentes.</p>
      )}

      {r && (
        <>
          <div className="grid min-w-0 grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { k: "Vendidas", v: r.totalVendido },
              { k: "Controle geral", v: r.porControle.geral },
              { k: "Controle por modelo", v: r.porControle.detalhado },
              { k: "Sem modelo informado", v: r.semModelo },
            ].map((t) => (
              <div key={t.k} className="min-w-0 rounded-xl border border-border bg-card p-3">
                <p className="truncate text-xs text-muted-foreground">{t.k}</p>
                <p className="font-display text-2xl font-semibold tabular-nums text-foreground">{t.v}</p>
              </div>
            ))}
          </div>
          <div className="grid min-w-0 gap-3 lg:grid-cols-3">
            <Barras titulo="Por tipo / produto" itens={r.porProduto} total={r.totalVendido} />
            <Barras titulo="Modelos informados na venda" itens={r.porModelo} total={r.totalVendido} />
            <Barras titulo="Cores informadas" itens={r.porCor} total={r.totalVendido} />
          </div>
          <p className="text-xs text-muted-foreground">
            Modelos e cores são o que o operador informou na venda. Para capinhas de controle geral, isso é histórico — não é saldo por modelo.
          </p>
        </>
      )}

      {dados && (
        <div className="grid min-w-0 gap-3 lg:grid-cols-2">
          <div className="min-w-0 space-y-2 rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground">Estoque</h3>
            {dados.estoque.geral.length + dados.estoque.detalhado.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum produto de capinha cadastrado.</p>
            )}
            {dados.estoque.geral.length > 0 && (
              <>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Geral (todos os modelos)</p>
                <ul className="divide-y divide-border">
                  {dados.estoque.geral.map((p) => (
                    <li key={p.id} className="flex justify-between gap-2 py-1 text-sm"><span className="truncate">{p.name}</span><span className="tabular-nums">{p.stock}</span></li>
                  ))}
                </ul>
              </>
            )}
            {dados.estoque.detalhado.length > 0 && (
              <>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Por modelo (controle detalhado)</p>
                <ul className="divide-y divide-border">
                  {dados.estoque.detalhado.map((p) => (
                    <li key={p.id} className="flex justify-between gap-2 py-1 text-sm"><span className="truncate">{p.name}</span><span className="tabular-nums">{p.stock}</span></li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <div className="min-w-0 space-y-2 rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground">Últimas movimentações</h3>
            {dados.movimentacoes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem movimentações registradas.</p>
            ) : (
              <ul className="divide-y divide-border">
                {dados.movimentacoes.map((m) => (
                  <li key={m.id} className="flex min-w-0 items-center gap-2 py-1 text-sm">
                    <span className="min-w-0 flex-1 truncate">{m.produtoNome}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{[m.tipo, m.origem].join(" · ")}</span>
                    <span className="shrink-0 tabular-nums text-foreground">
                      {m.estoqueAntes}→{m.estoqueDepois}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{new Date(m.createdAt).toLocaleDateString("pt-BR")}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
