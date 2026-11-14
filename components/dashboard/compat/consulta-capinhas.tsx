"use client"

/**
 * COMPAT-PROFISSIONAL-001 — consulta rápida de capinha por modelo (balcão).
 *
 * Mostra: capinhas compatíveis (informadas pela loja, por status), ONDE ESTÁ (painel/fileira),
 * produtos detalhados com estoque próprio e produtos genéricos com estoque GERAL — este último
 * nunca é apresentado como disponibilidade do modelo.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react"
import { AlertTriangle, Boxes, Link2, Loader2, MapPin, Package, Plus, Star, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { rotuloLocalizacao } from "@/lib/compat/organizacao"
import {
  adicionarLocalizacao,
  carregarOrganizacao,
  consultarCapinha,
  removerLocalizacao,
  tornarPrincipal,
  type ConsultaCapinhaDTO,
  type PainelDTO,
} from "@/lib/compat/compat-client"
import type { CompatPreferencias } from "@/lib/compat/organizacao"
import { CompatStatusBadge } from "./compat-status"
import { ModeloPicker, type ModeloEscolhido } from "./modelo-picker"

export function ConsultaCapinhas({
  lojaHeader,
  onGerenciarVinculos,
}: {
  lojaHeader: string | null
  onGerenciarVinculos: (m: ModeloEscolhido) => void
}) {
  const [modelo, setModelo] = useState<ModeloEscolhido | null>(null)
  const [dados, setDados] = useState<ConsultaCapinhaDTO | null>(null)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState("")
  const [paineis, setPaineis] = useState<PainelDTO[]>([])
  const [prefs, setPrefs] = useState<CompatPreferencias | null>(null)
  const [formAberto, setFormAberto] = useState(false)

  // Só a resposta da consulta mais recente preenche a tela (troca rápida de modelo).
  const reqRef = useRef(0)
  const atualRef = useRef(modelo)
  useEffect(() => {
    atualRef.current = modelo
  }, [modelo])
  const load = useCallback(async () => {
    const meu = ++reqRef.current
    if (!modelo) return
    setLoading(true)
    const r = await consultarCapinha(lojaHeader, modelo.modelKey)
    if (meu !== reqRef.current || atualRef.current?.modelKey !== modelo.modelKey) return
    setLoading(false)
    if (r.ok && r.modelo.modelKey !== modelo.modelKey) return
    if (!r.ok) {
      setErro(r.error)
      setDados(null)
      return
    }
    setErro("")
    setDados(r)
  }, [modelo, lojaHeader])

  // Recargas pós-gravação usam sempre a seleção ATUAL.
  const loadRef = useRef(load)
  useEffect(() => {
    loadRef.current = load
  }, [load])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!lojaHeader) return
    void carregarOrganizacao(lojaHeader).then((r) => {
      if (r.ok) {
        setPaineis(r.paineis)
        setPrefs(r.preferencias)
      }
    })
  }, [lojaHeader])

  return (
    <section aria-label="Consultar capinhas" className="min-w-0 space-y-4">
      <ModeloPicker
        lojaHeader={lojaHeader}
        label="Buscar aparelho para capinha"
        placeholder="Digite o modelo do cliente: A06, Redmi 13C, iPhone 13…"
        onSelect={(m) => {
          setDados(null)
          setModelo(m)
          setFormAberto(false)
        }}
        autoFocus
      />

      {!modelo && (
        <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          Busque um modelo para ver as capinhas compatíveis, onde ficam e o estoque.
        </div>
      )}
      {erro && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>}
      {loading && !dados && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Consultando…
        </p>
      )}

      {modelo && dados && (
        <div className="min-w-0 space-y-4">
          {/* Cabeçalho do modelo */}
          <div className="flex min-w-0 flex-wrap items-start gap-3 rounded-xl border border-border bg-card p-4">
            <div className="min-w-0 flex-1">
              <p className="break-words font-display text-lg font-semibold text-foreground">{dados.modelo.canonicalName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {[dados.modelo.hierarquia.fabricante, dados.modelo.hierarquia.marca, dados.modelo.hierarquia.linha]
                  .filter(Boolean)
                  .join(" › ")}
                {dados.modelo.aliases.length > 0 ? ` · também: ${dados.modelo.aliases.slice(0, 4).join(", ")}` : ""}
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => onGerenciarVinculos(modelo)}>
              <Link2 className="mr-1 h-4 w-4" /> Gerenciar vínculos
            </Button>
          </div>

          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            {/* Onde está */}
            <div className="min-w-0 space-y-2 rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <MapPin className="h-4 w-4 text-primary" /> Onde está
                </h3>
                <Button type="button" size="sm" variant="ghost" onClick={() => setFormAberto((v) => !v)} disabled={!lojaHeader}>
                  <Plus className="mr-1 h-4 w-4" /> Localização
                </Button>
              </div>
              {formAberto && (
                <LocalizacaoForm
                  lojaHeader={lojaHeader}
                  paineis={paineis}
                  posicoes={prefs?.posicoesHabilitadas === true}
                  modelKey={modelo.modelKey}
                  produtos={[
                    ...dados.produtos.detalhados.map((p) => ({ id: p.id, name: p.name })),
                    ...dados.produtos.gerais.map((g) => ({ id: g.id, name: g.name })),
                  ]}
                  onSaved={() => {
                    setFormAberto(false)
                    void loadRef.current()
                  }}
                />
              )}
              {dados.localizacoes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem localização cadastrada para este modelo.</p>
              ) : (
                <ul className="min-w-0 divide-y divide-border">
                  {dados.localizacoes.map((l) => (
                    <li key={l.id} className="flex min-w-0 items-center gap-2 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
                          {l.principal && <Star className="h-3.5 w-3.5 shrink-0 fill-primary text-primary" aria-label="principal" />}
                          <span className="truncate">{rotuloLocalizacao(l)}</span>
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {l.alvo === "produto"
                            ? `Produto: ${l.produtoNome ?? "—"}`
                            : l.alvo === "compativel"
                              ? `Capinha do ${l.viaModelo} (compatível)`
                              : "Capinhas deste modelo"}
                        </p>
                      </div>
                      {l.alvo === "compativel" && l.viaStatus && <CompatStatusBadge status={l.viaStatus} curto />}
                      {l.alvo !== "compativel" && !l.principal && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label="Tornar principal"
                          onClick={() => void tornarPrincipal(lojaHeader, l.id).then(() => loadRef.current())}
                        >
                          <Star className="h-4 w-4" />
                        </Button>
                      )}
                      {l.alvo !== "compativel" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label={`Remover localização ${rotuloLocalizacao(l)}`}
                          onClick={() => void removerLocalizacao(lojaHeader, l.id).then(() => loadRef.current())}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Compatíveis */}
            <div className="min-w-0 space-y-2 rounded-xl border border-border bg-card p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Link2 className="h-4 w-4 text-primary" /> Mesma capinha
              </h3>
              {dados.capinhaGroups.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma compatibilidade de capinha informada. Use “Gerenciar vínculos” depois de testar.
                </p>
              ) : (
                dados.capinhaGroups.map((g) => (
                  <div key={g.groupKey} className="space-y-1">
                    <CompatStatusBadge status={g.status} />
                    <div className="flex flex-wrap gap-1.5">
                      {g.members.map((m) => (
                        <Badge key={m.modelKey} variant="secondary" className="font-normal">
                          {m.canonicalName}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Produtos e estoque */}
          <div className="min-w-0 space-y-3 rounded-xl border border-border bg-card p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Boxes className="h-4 w-4 text-primary" /> Capinhas no estoque
            </h3>
            {dados.produtos.detalhados.length === 0 && dados.produtos.gerais.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum produto de capinha cadastrado.</p>
            )}
            {dados.produtos.detalhados.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Controle por modelo</p>
                <ul className="divide-y divide-border">
                  {dados.produtos.detalhados.map((p) => (
                    <li key={p.id} className="flex min-w-0 items-center gap-2 py-1.5">
                      <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-foreground">{p.name}</p>
                        {p.vinculo === "compativel" && (
                          <p className="truncate text-xs text-muted-foreground">via {p.viaModelo}</p>
                        )}
                      </div>
                      {p.vinculo === "compativel" && p.viaStatus && <CompatStatusBadge status={p.viaStatus} curto />}
                      <Badge variant="outline" className={p.stock > 0 ? "border-success/40 text-success" : "text-muted-foreground"}>
                        {p.stock} un.
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {dados.produtos.gerais.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Estoque geral (todos os modelos)</p>
                <ul className="divide-y divide-border">
                  {dados.produtos.gerais.map((g) => (
                    <li key={g.id} className="flex min-w-0 items-center gap-2 py-1.5">
                      <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <p className="min-w-0 flex-1 truncate text-sm text-foreground">{g.name}</p>
                      <Badge variant="outline" className="text-muted-foreground">
                        geral: {g.stockGeral}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {dados.avisos.map((a) => (
              <p key={a} className="flex items-start gap-2 text-xs text-warning">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {a}
              </p>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

/** Formulário curto: painel → fileira → (posição) → (produto específico). */
export function LocalizacaoForm({
  lojaHeader,
  paineis,
  posicoes,
  modelKey,
  produtos,
  onSaved,
}: {
  lojaHeader: string | null
  paineis: PainelDTO[]
  posicoes: boolean
  modelKey: string
  produtos: { id: string; name: string }[]
  onSaved: () => void
}) {
  const uid = useId()
  const ativos = paineis.filter((p) => p.ativo)
  const [painelId, setPainelId] = useState(ativos[0]?.id ?? "")
  const [fileiraId, setFileiraId] = useState("")
  const [posicao, setPosicao] = useState("")
  const [produtoId, setProdutoId] = useState("")
  const [principal, setPrincipal] = useState(false)
  const [erro, setErro] = useState("")
  const [busy, setBusy] = useState(false)
  const fileiras = (ativos.find((p) => p.id === painelId)?.fileiras ?? []).filter((f) => f.ativo)

  if (ativos.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
        Cadastre um painel em “Localização” antes de vincular capinhas.
      </p>
    )
  }

  const salvar = async () => {
    setBusy(true)
    const r = await adicionarLocalizacao(lojaHeader, {
      // Específica = modelo + produto (ex.: "Capinha carteira" do A06 fica em outro painel).
      modelKey,
      produtoId: produtoId || undefined,
      painelId,
      fileiraId: fileiraId || null,
      posicao: posicoes ? posicao : undefined,
      principal,
    })
    setBusy(false)
    if (!r.ok) setErro(r.error)
    else onSaved()
  }

  return (
    <div className="min-w-0 space-y-2 rounded-md border border-border bg-muted/30 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1 min-w-0">
          <Label htmlFor={`${uid}-painel`}>Painel</Label>
          <select
            id={`${uid}-painel`}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            value={painelId}
            onChange={(e) => {
              setPainelId(e.target.value)
              setFileiraId("")
            }}
          >
            {ativos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
                {p.descricao ? ` — ${p.descricao}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1 min-w-0">
          <Label htmlFor={`${uid}-fileira`}>Fileira</Label>
          <select
            id={`${uid}-fileira`}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            value={fileiraId}
            onChange={(e) => setFileiraId(e.target.value)}
          >
            <option value="">Sem fileira</option>
            {fileiras.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
                {f.descricao ? ` — ${f.descricao}` : ""}
              </option>
            ))}
          </select>
        </div>
        {posicoes && (
          <div className="space-y-1 min-w-0">
            <Label htmlFor={`${uid}-pos`}>Posição</Label>
            <Input id={`${uid}-pos`} value={posicao} maxLength={20} onChange={(e) => setPosicao(e.target.value)} placeholder="Ex.: 3" />
          </div>
        )}
        {produtos.length > 0 && (
          <div className="space-y-1 min-w-0">
            <Label htmlFor={`${uid}-produto`}>Produto específico (opcional)</Label>
            <select
              id={`${uid}-produto`}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={produtoId}
              onChange={(e) => setProdutoId(e.target.value)}
            >
              <option value="">Todas as capinhas do modelo</option>
              {produtos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <label className="flex items-center gap-2 text-xs text-foreground">
        <input type="checkbox" className="h-4 w-4 accent-primary" checked={principal} onChange={(e) => setPrincipal(e.target.checked)} />
        Localização principal
      </label>
      {erro && <p role="alert" className="text-xs text-destructive">{erro}</p>}
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={() => void salvar()} disabled={busy || !painelId}>
          {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Salvar localização
        </Button>
      </div>
    </div>
  )
}
