"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Store, RefreshCw, AlertTriangle } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { useLojaAtiva } from "@/lib/loja-ativa"
import { LEGACY_PRIMARY_STORE_ID } from "@/lib/store-defaults"
import { useStudioTheme } from "@/components/theme/ThemeProvider"
import { cn } from "@/lib/utils"

type StoreProfile = "ASSISTENCIA" | "VARIEDADES" | "SUPERMERCADO"

type StoreRow = {
  id: string
  name: string
  cnpj: string
  phone: string
  logoUrl: string
  address: any
  profile: StoreProfile
  subscriptionPlan?: "BRONZE" | "PRATA" | "OURO"
}

type StoreSettings = {
  receiptFooter: string
  printerConfig?: any
  cardFees?: any
}

function emptyAddress() {
  return { rua: "", numero: "", bairro: "", cidade: "", estado: "", cep: "" }
}

function planLabel(plan: StoreRow["subscriptionPlan"]): string {
  if (!plan) return "—"
  const map: Record<string, string> = { BRONZE: "Bronze", PRATA: "Prata", OURO: "Ouro" }
  return map[plan] || plan
}

export type GestaoUnidadesSaasProps = {
  /** Esconde o cabeçalho duplicado quando embutido em Configurações V3 (Lojas). */
  embed?: boolean
}

export function GestaoUnidadesSaas({ embed = false }: GestaoUnidadesSaasProps) {
  const { mode } = useStudioTheme()
  const isBlack = mode === "black"
  const { toast } = useToast()
  const { lojaAtivaId, setLojaAtivaId } = useLojaAtiva()
  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState(false)
  const [stores, setStores] = useState<StoreRow[]>([])
  const [selectedId, setSelectedId] = useState<string>("")
  const [draft, setDraft] = useState<StoreRow | null>(null)
  const [settings, setSettings] = useState<StoreSettings>({ receiptFooter: "" })
  const selected = useMemo(() => stores.find((s) => s.id === selectedId) ?? null, [stores, selectedId])

  const selectStore = useCallback(
    (id: string) => {
      setSelectedId(id)
      setLojaAtivaId(id)
    },
    [setLojaAtivaId],
  )

  const loadStores = useCallback(async () => {
    setLoading(true)
    setApiError(false)
    try {
      const r = await fetch("/api/stores", { credentials: "include", cache: "no-store" })
      if (!r.ok) {
        setApiError(true)
        return
      }
      const j = (await r.json()) as { stores?: StoreRow[] }
      const list = Array.isArray(j.stores) ? j.stores : []
      setStores(list)
      const first = list[0]?.id || LEGACY_PRIMARY_STORE_ID
      setSelectedId((prev) => (list.some((s) => s.id === prev) ? prev : first))
    } catch {
      setApiError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      setApiError(false)
      try {
        const r = await fetch("/api/stores", { credentials: "include", cache: "no-store" })
        if (!r.ok) {
          if (!cancelled) setApiError(true)
          return
        }
        const j = (await r.json()) as { stores?: StoreRow[] }
        const list = Array.isArray(j.stores) ? j.stores : []
        if (!cancelled) {
          setStores(list)
          const first = list[0]?.id || LEGACY_PRIMARY_STORE_ID
          setSelectedId((prev) => (list.some((s) => s.id === prev) ? prev : first))
        }
      } catch {
        if (!cancelled) setApiError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (stores.length === 0 || !lojaAtivaId) return
    if (stores.some((s) => s.id === lojaAtivaId)) setSelectedId(lojaAtivaId)
  }, [stores, lojaAtivaId])

  useEffect(() => {
    if (!selected) {
      setDraft(null)
      setSettings({ receiptFooter: "" })
      return
    }
    setDraft({
      ...selected,
      address: selected.address && typeof selected.address === "object" ? selected.address : emptyAddress(),
    })
    void (async () => {
      try {
        const r = await fetch(`/api/stores/${encodeURIComponent(selected.id)}/settings`, {
          credentials: "include",
          cache: "no-store",
        })
        const j = (await r.json()) as { settings?: StoreSettings | null }
        setSettings({
          receiptFooter: j.settings?.receiptFooter || "",
          printerConfig: j.settings?.printerConfig,
        })
      } catch {
        setSettings({ receiptFooter: "", printerConfig: undefined })
      }
    })()
  }, [selected?.id])

  const save = async () => {
    if (!draft) return
    try {
      const r1 = await fetch(`/api/stores/${encodeURIComponent(draft.id)}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          cnpj: draft.cnpj,
          phone: draft.phone,
          logoUrl: draft.logoUrl,
          address: draft.address,
          profile: draft.profile,
          subscriptionPlan: draft.subscriptionPlan,
        }),
      })
      if (!r1.ok) throw new Error("Falha ao salvar unidade")

      const r2 = await fetch(`/api/stores/${encodeURIComponent(draft.id)}/settings`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiptFooter: settings.receiptFooter, printerConfig: settings.printerConfig }),
      })
      if (!r2.ok) throw new Error("Falha ao salvar settings")

      const rr = await fetch("/api/stores", { credentials: "include", cache: "no-store" })
      const jj = (await rr.json()) as { stores?: StoreRow[] }
      setStores(Array.isArray(jj.stores) ? jj.stores : [])

      toast({ title: "Unidade salva", description: `Configurações aplicadas em ${draft.id}` })
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: e instanceof Error ? e.message : "Falha",
      })
    }
  }

  const createStore = async () => {
    try {
      const r = await fetch("/api/stores", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Nova unidade", profile: "VARIEDADES" }),
      })
      if (!r.ok) throw new Error("Falha ao criar unidade")
      const j = (await r.json()) as { store?: StoreRow }
      const id = j.store?.id
      const rr = await fetch("/api/stores", { credentials: "include", cache: "no-store" })
      const jj = (await rr.json()) as { stores?: StoreRow[] }
      setStores(Array.isArray(jj.stores) ? jj.stores : [])
      if (id) {
        setSelectedId(id)
        setLojaAtivaId(id)
      }
      toast({ title: "Unidade criada", description: id ? `Criada ${id}` : "Criada" })
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Erro ao criar",
        description: e instanceof Error ? e.message : "Falha",
      })
    }
  }

  const body = (
    <div className="space-y-6">
      {loading ? (
        <p className={cn("text-center text-sm", isBlack ? "text-white/60" : "text-slate-600")}>
          Carregando unidades…
        </p>
      ) : apiError ? (
        <div className={cn(
          "flex flex-col items-center gap-4 rounded-xl border px-6 py-10 text-center",
          isBlack ? "border-red-500/25 bg-red-500/5" : "border-red-200 bg-red-50/60",
        )}>
          <div className={cn(
            "flex h-12 w-12 items-center justify-center rounded-full",
            isBlack ? "bg-red-500/15" : "bg-red-100",
          )}>
            <AlertTriangle className={cn("h-6 w-6", isBlack ? "text-red-400" : "text-red-500")} />
          </div>
          <div className="space-y-1">
            <p className={cn("font-semibold", isBlack ? "text-white" : "text-slate-900")}>
              Não foi possível carregar as unidades
            </p>
            <p className={cn("text-sm", isBlack ? "text-white/55" : "text-slate-500")}>
              Ocorreu um erro ao buscar os dados. Seus dados estão seguros — tente novamente.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={loadStores}
            className={cn(
              "gap-2",
              isBlack ? "border-white/20 bg-transparent text-white hover:bg-white/10" : "",
            )}
          >
            <RefreshCw className="h-4 w-4" />
            Tentar novamente
          </Button>
        </div>
      ) : stores.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 pb-1">
          {stores.map((s) => {
            const isSelected = s.id === selectedId
            const isPrincipal = s.id === lojaAtivaId
            const name = (s.name || "Unidade").trim()
            return (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                onClick={() => selectStore(s.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    selectStore(s.id)
                  }
                }}
                className={cn(
                  "flex flex-col gap-3 rounded-xl border p-4 text-left transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                  isBlack
                    ? isSelected
                      ? "border-primary bg-[#000000] shadow-[0_0_0_1px] shadow-primary/35"
                      : "border-white/10 bg-[#000000]/90 hover:border-white/25"
                    : isSelected
                      ? "border-primary bg-white shadow-md ring-2 ring-primary/20"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                      isSelected
                        ? "bg-primary/15 text-primary"
                        : isBlack
                          ? "bg-white/5 text-white/85"
                          : "bg-slate-100 text-slate-700",
                    )}
                  >
                    <Store className="h-5 w-5" aria-hidden />
                  </div>
                  {isPrincipal ? (
                    <Badge
                      className={cn(
                        "shrink-0 border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200",
                        isBlack && "border-amber-400/35 text-amber-200",
                      )}
                      variant="outline"
                    >
                      Principal
                    </Badge>
                  ) : null}
                </div>
                <div className="min-w-0 space-y-1">
                  <p
                    className={cn(
                      "truncate text-base font-semibold leading-tight",
                      isBlack ? "text-white" : "text-slate-900",
                    )}
                    title={name}
                  >
                    {name}
                  </p>
                  <p
                    className={cn(
                      "truncate font-mono text-[11px]",
                      isBlack ? "text-white/45" : "text-slate-500",
                    )}
                    title={s.id}
                  >
                    {s.id}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="secondary"
                    className={cn(
                      "font-normal",
                      isBlack ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "text-emerald-800",
                    )}
                  >
                    Ativa
                  </Badge>
                  <span
                    className={cn(
                      "text-xs font-medium",
                      isBlack ? "text-white/70" : "text-slate-600",
                    )}
                  >
                    Plano:{" "}
                    <span className={cn("text-foreground", isBlack && "text-white")}>{planLabel(s.subscriptionPlan)}</span>
                  </span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={isSelected ? "default" : "outline"}
                  className={cn(
                    "mt-auto w-full",
                    isBlack &&
                      !isSelected &&
                      "border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white",
                  )}
                  onClick={(e) => {
                    e.stopPropagation()
                    selectStore(s.id)
                  }}
                >
                  Gerenciar
                </Button>
              </div>
            )
          })}
        </div>
      ) : (
        <p className={cn("text-center text-sm", isBlack ? "text-white/60" : "text-slate-600")}>
          Nenhuma unidade cadastrada.
        </p>
      )}

      <div
        className={cn(
          "flex flex-wrap justify-center gap-2 border-t pt-8 mt-2",
          isBlack ? "border-white/10" : "border-slate-200/80",
        )}
      >
        <Button
          type="button"
          variant="outline"
          onClick={createStore}
          disabled={loading}
          className={cn(
            isBlack
              ? "border-white/20 bg-[#000000] text-white hover:bg-white/10 hover:text-white"
              : "border-slate-200 bg-white",
          )}
        >
          Nova unidade
        </Button>
        <Button type="button" onClick={save} disabled={!draft}>
          Salvar unidade
        </Button>
      </div>

      {!draft ? (
        <p className={cn("text-center text-sm", isBlack ? "text-white/55" : "text-slate-600")}>
          {stores.length ? "Selecione uma unidade nos cards ou em Gerenciar para editar." : ""}
        </p>
      ) : (
        <div className="mt-10 space-y-5 pt-2">
          <h3
            className={cn(
              "text-lg font-semibold leading-snug tracking-tight",
              isBlack ? "text-white" : "text-slate-900",
            )}
          >
            Dados da unidade selecionada
          </h3>
          <div
            className={cn(
              "rounded-xl border p-5 shadow-sm sm:p-6",
              isBlack
                ? "border-white/10 bg-[#000000]/50"
                : "border-slate-200/90 bg-white",
            )}
          >
            <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Nome</Label>
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>CNPJ</Label>
                <Input value={draft.cnpj} onChange={(e) => setDraft({ ...draft, cnpj: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Telefone</Label>
                <Input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Logotipo (URL)</Label>
              <Input value={draft.logoUrl} onChange={(e) => setDraft({ ...draft, logoUrl: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Perfil</Label>
              <Select value={draft.profile} onValueChange={(v) => setDraft({ ...draft, profile: v as StoreProfile })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ASSISTENCIA">Assistência</SelectItem>
                  <SelectItem value="VARIEDADES">Variedades</SelectItem>
                  <SelectItem value="SUPERMERCADO">Supermercado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Plano (SaaS)</Label>
              <Select
                value={draft.subscriptionPlan || "BRONZE"}
                onValueChange={(v) => setDraft({ ...draft, subscriptionPlan: v as any })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BRONZE">Bronze</SelectItem>
                  <SelectItem value="PRATA">Prata</SelectItem>
                  <SelectItem value="OURO">Ouro</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Campo oficial da unidade (salvo na tabela `stores`).</p>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold">Endereço</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(["rua", "numero", "bairro", "cidade", "estado", "cep"] as const).map((k) => (
                <div key={k} className="space-y-1">
                  <Label className="capitalize">{k}</Label>
                  <Input
                    value={String(draft.address?.[k] ?? "")}
                    onChange={(e) =>
                      setDraft({ ...draft, address: { ...(draft.address || emptyAddress()), [k]: e.target.value } })
                    }
                  />
                </div>
              ))}
            </div>

            <div className="space-y-1">
              <Label>Rodapé do cupom (por unidade)</Label>
              <Input
                value={settings.receiptFooter}
                onChange={(e) => setSettings({ ...settings, receiptFooter: e.target.value })}
                placeholder="Ex.: Obrigado pela preferência — Trocas em até 7 dias..."
              />
            </div>
          </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  if (embed) {
    return body
  }

  return (
    <Card
      className={cn(
        "border transition-colors duration-300",
        isBlack ? "border-white/10 bg-[#000000] text-white" : "border-slate-200 bg-white text-foreground",
      )}
    >
      <CardHeader>
        <CardTitle className={cn("text-2xl font-bold", isBlack ? "text-white" : "text-slate-900")}>
          Gestão de Unidades (SaaS)
        </CardTitle>
        <CardDescription className={cn(isBlack ? "text-white/65" : "text-slate-600")}>
          Cadastre Loja 2/3, defina perfil (Assistência/Variedades/Supermercado) e personalize rodapé do cupom por
          CNPJ.
        </CardDescription>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  )
}

