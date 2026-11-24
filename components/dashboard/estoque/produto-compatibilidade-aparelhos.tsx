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
import { cn } from "@/lib/utils"
import {
  COMPATIBILITY_STATUSES,
  COMPATIBILITY_TYPES,
  TECHNICAL_COMPATIBILITY_TYPES,
  type CompatibilityStatus,
  type CompatibilityType,
} from "@/lib/catalogo-aparelhos/produto-metadata"
import type { DeviceSearchResult } from "@/lib/catalogo-aparelhos/types"
import { MostrarMaisModelos } from "@/components/dashboard/catalogo/mostrar-mais-modelos"
import { useBuscaModelos } from "@/components/dashboard/catalogo/use-busca-modelos"
import { resolverModelos, type ModeloResolvido } from "@/lib/catalogo-aparelhos/loja-catalogo-client"
import { catalogKey, type LojaCompatCategoria } from "@/lib/catalogo-aparelhos/loja-catalogo"
import { carregarVinculos } from "@/lib/compat/compat-client"
import { CompatStatusBadge } from "@/components/dashboard/compat/compat-status"
import {
  CadastrarModeloAparelhoDialog,
  type ModeloAparelhoEscolhido,
} from "@/components/dashboard/catalogo/cadastrar-modelo-aparelho-dialog"

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
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement | null>(null)
  // CADASTROS-ACESSORIOS-COMPATIBILIDADE-MANUAL-001 — cadastro inline, filtro e nomes legíveis.
  const [cadastroOpen, setCadastroOpen] = useState(false)
  const [cadastroNome, setCadastroNome] = useState("")
  const [filtroVinculados, setFiltroVinculados] = useState("")
  const [resolvidos, setResolvidos] = useState<Record<string, ModeloResolvido>>({})
  // Sugestões explícitas de modelos compatíveis já registrados no Compat (nunca adiciona automaticamente).
  const [sugestoesCompat, setSugestoesCompat] = useState<{
    categoria: LojaCompatCategoria
    principalKey: string
    itens: { modelKey: string; canonicalName: string; brand: string; status: string }[]
  } | null>(null)
  const [carregandoSugestoes, setCarregandoSugestoes] = useState(false)
  const [erroSugestoes, setErroSugestoes] = useState("")

  // Reidratação traz só a `modelKey`: resolve nome/marca (global ou manual da loja) para exibir.
  // Estado local de exibição — não altera o valor do formulário (não "suja" o produto).
  const pendentesKey = value.models
    .filter((m) => !m.brand && !resolvidos[m.modelKey])
    .map((m) => m.modelKey)
    .join(",")
  useEffect(() => {
    if (!pendentesKey) return
    let cancelled = false
    void resolverModelos(lojaHeader, pendentesKey.split(",")).then((res) => {
      if (cancelled || !res.ok) return
      setResolvidos((prev) => {
        const next = { ...prev }
        for (const m of res.models) next[m.modelKey] = m
        return next
      })
    })
    return () => {
      cancelled = true
    }
  }, [pendentesKey, lojaHeader])

  // Busca com debounce contra a API read-only do catálogo — paginada (COMPAT-BUSCA-MODELOS-NATURAL-001).
  const busca = useBuscaModelos({ query, lojaHeader })
  const { results, limpar: limparBusca } = busca
  const searching = busca.loading

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
    limparBusca()
    setOpen(false)
    if (value.models.some((m) => m.modelKey === r.modelKey)) return
    const nextAliases = Array.from(new Set([...value.aliases, r.canonicalName, ...r.aliases].filter(Boolean)))
    onChange({
      ...value,
      models: [...value.models, { modelKey: r.modelKey, canonicalName: r.canonicalName || r.modelKey, brand: r.brand }],
      aliases: nextAliases,
    })
  }

  const addEscolhido = (m: ModeloAparelhoEscolhido) => {
    setQuery("")
    limparBusca()
    setOpen(false)
    if (value.models.some((x) => x.modelKey === m.modelKey)) return
    onChange({
      ...value,
      models: [...value.models, { modelKey: m.modelKey, canonicalName: m.canonicalName, brand: m.brand }],
      aliases: Array.from(new Set([...value.aliases, m.canonicalName].filter(Boolean))),
    })
  }

  const displayOf = (m: CompatibilidadeAparelhoModel) => {
    const r = resolvidos[m.modelKey]
    return {
      name: m.brand ? m.canonicalName : (r?.canonicalName ?? m.canonicalName),
      manual: m.modelKey.startsWith("manual_") || r?.source === "loja",
      inactive: r?.active === false,
    }
  }

  const filtroKey = catalogKey(filtroVinculados)
  const modelosVisiveis = filtroKey
    ? value.models.filter((m) => catalogKey(`${m.brand} ${displayOf(m).name}`).includes(filtroKey))
    : value.models

  const removeModel = (modelKey: string) => {
    onChange({ ...value, models: value.models.filter((m) => m.modelKey !== modelKey) })
  }

  const definirComoPrincipal = (modelKey: string) => {
    const alvo = value.models.find((m) => m.modelKey === modelKey)
    if (!alvo) return
    onChange({ ...value, models: [alvo, ...value.models.filter((m) => m.modelKey !== modelKey)] })
  }

  const categoriaCompat: LojaCompatCategoria | null =
    value.types.includes("capinha") && !value.types.includes("pelicula_tela")
      ? "capinha"
      : value.types.includes("pelicula_tela") && !value.types.includes("capinha")
        ? "pelicula_tela"
        : null

  const principalModel = value.models[0] ?? null

  const consultarCompativeis = async (categoria: LojaCompatCategoria) => {
    if (!principalModel || !lojaHeader) return
    setCarregandoSugestoes(true)
    setErroSugestoes("")
    const res = await carregarVinculos(lojaHeader, categoria, principalModel.modelKey)
    setCarregandoSugestoes(false)
    if (!res.ok) {
      setErroSugestoes(res.error)
      return
    }
    const suprimidos = new Set(res.vinculos.filter((v) => v.acao === "suprimir").map((v) => v.modelKey))
    const itensMap = new Map<string, { modelKey: string; canonicalName: string; brand: string; status: string }>()
    for (const v of res.vinculos) {
      if (v.acao !== "adicionar") continue
      itensMap.set(v.modelKey, { modelKey: v.modelKey, canonicalName: v.canonicalName, brand: v.brand, status: v.status })
    }
    if (categoria === "pelicula_tela") {
      for (const g of res.globais) {
        if (suprimidos.has(g.modelKey) || itensMap.has(g.modelKey)) continue
        itensMap.set(g.modelKey, { modelKey: g.modelKey, canonicalName: g.canonicalName, brand: g.brand, status: g.status })
      }
    }
    setSugestoesCompat({ categoria, principalKey: principalModel.modelKey, itens: [...itensMap.values()] })
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
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
            }}
            onFocus={() => results.length > 0 && setOpen(true)}
            placeholder="Ex.: A05, Samsung A05, iPhone 13 Pro Max"
            autoComplete="off"
          />
          {open && (query.trim().length >= 2) && (
            <div className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-md">
              {searching && <div className="px-2 py-1.5 text-sm text-muted-foreground">Buscando…</div>}
              {!searching && results.length === 0 && (
                <div className="space-y-1.5 px-2 py-1.5">
                  <p className="text-sm text-muted-foreground">Nenhum modelo encontrado.</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setCadastroNome(query.trim())
                      setCadastroOpen(true)
                      setOpen(false)
                    }}
                  >
                    Cadastrar novo modelo “{query.trim()}”
                  </Button>
                </div>
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
                    {r.source === "loja" && (
                      <Badge variant="outline" className="shrink-0 text-[10px] text-muted-foreground">
                        cadastro da loja
                      </Badge>
                    )}
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
              {!searching && busca.hasMore && (
                <MostrarMaisModelos
                  mostrados={results.length}
                  total={busca.total}
                  loading={busca.loadingMore}
                  onMostrarMais={() => void busca.carregarMais()}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modelos selecionados */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
          <Label>Modelos vinculados{value.models.length > 0 ? ` (${value.models.length})` : ""}</Label>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => {
              setCadastroNome(query.trim())
              setCadastroOpen(true)
            }}
          >
            + Cadastrar novo modelo
          </Button>
        </div>
        {value.models.length > 3 && (
          <Input
            value={filtroVinculados}
            onChange={(e) => setFiltroVinculados(e.target.value)}
            placeholder="Filtrar modelos vinculados"
            aria-label="Filtrar modelos vinculados"
            className="h-8"
            autoComplete="off"
          />
        )}
        {value.models.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum modelo vinculado. Opcional.</p>
        ) : modelosVisiveis.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum modelo vinculado corresponde ao filtro.</p>
        ) : (
          <div className="flex flex-wrap gap-2" aria-label="Modelos vinculados">
            {modelosVisiveis.map((m) => {
              const d = displayOf(m)
              const isPrincipal = value.models[0]?.modelKey === m.modelKey
              return (
              <Badge key={m.modelKey} variant={isPrincipal ? "default" : "secondary"} className="gap-1 py-1 pl-2.5 pr-1">
                <span className="truncate max-w-[16rem]">{d.name}</span>
                {isPrincipal && <span className="rounded bg-primary-foreground/20 px-1 text-[10px]">principal</span>}
                {d.manual && <span className="text-[10px] opacity-80">· loja</span>}
                {d.inactive && <span className="text-[10px] text-warning">· desativado</span>}
                {!isPrincipal && (
                  <button
                    type="button"
                    aria-label={`Definir ${d.name} como principal`}
                    title="Definir como modelo principal"
                    onClick={() => definirComoPrincipal(m.modelKey)}
                    className="ml-0.5 rounded-sm px-1 text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    ★
                  </button>
                )}
                <button
                  type="button"
                  aria-label={`Remover ${d.name}`}
                  onClick={() => removeModel(m.modelKey)}
                  className={cn(
                    "ml-0.5 rounded-sm px-1",
                    isPrincipal ? "text-primary-foreground/80 hover:text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  ×
                </button>
              </Badge>
              )
            })}
          </div>
        )}
        {principalModel && lojaHeader && (
          <div className="space-y-2 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              {(categoriaCompat ? [categoriaCompat] : (["capinha", "pelicula_tela"] as LojaCompatCategoria[])).map((cat) => (
                <Button
                  key={cat}
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2.5 text-xs"
                  disabled={carregandoSugestoes}
                  onClick={() => void consultarCompativeis(cat)}
                >
                  {carregandoSugestoes
                    ? "Consultando…"
                    : `Ver compatíveis de ${cat === "capinha" ? "capinha" : "película"} do principal`}
                </Button>
              ))}
            </div>
            {erroSugestoes && <p role="alert" className="text-xs text-destructive">{erroSugestoes}</p>}
            {sugestoesCompat && sugestoesCompat.principalKey === principalModel.modelKey && (
              <div className="space-y-2 rounded-md border border-border bg-background p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-foreground">
                    Compatíveis de {sugestoesCompat.categoria === "capinha" ? "capinha" : "película"} cadastrados para {displayOf(principalModel).name}
                  </p>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setSugestoesCompat(null)}
                  >
                    Fechar
                  </button>
                </div>
                {sugestoesCompat.itens.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Nenhum modelo compatível registrado para {sugestoesCompat.categoria === "capinha" ? "capinha" : "película"}. Nada é inferido automaticamente.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {sugestoesCompat.itens.map((item) => {
                      const jaVinculado = value.models.some((x) => x.modelKey === item.modelKey)
                      return (
                        <div key={item.modelKey} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1 text-xs">
                          <span className="truncate max-w-[12rem]">{item.canonicalName}</span>
                          <CompatStatusBadge status={item.status} curto />
                          <Button
                            type="button"
                            size="sm"
                            variant={jaVinculado ? "ghost" : "outline"}
                            className="h-6 px-2 text-[11px]"
                            disabled={jaVinculado}
                            onClick={() => addEscolhido({ modelKey: item.modelKey, canonicalName: item.canonicalName, brand: item.brand })}
                          >
                            {jaVinculado ? "Vinculado" : "+ Vincular"}
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <CadastrarModeloAparelhoDialog
        open={cadastroOpen}
        onOpenChange={setCadastroOpen}
        lojaHeader={lojaHeader}
        initialName={cadastroNome}
        onCreated={(m) => addEscolhido(m)}
      />

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
