"use client"

/**
 * Cadastro Inteligente de Produto — F1 UI · Painel "Assistente IA".
 *
 * Primeira interface que consome a fundação lib/catalog (F1/F2). Para o produto selecionado,
 * gera sugestões DETERMINÍSTICAS (categoria, marca, modelo, sinônimos, palavras-chave,
 * compatibilidade, descrições, tags), todas EDITÁVEIS pelo operador, e persiste SOMENTE em
 * `Produto.metadata` via Server Action dedicada. Não toca colunas core nem módulos protegidos.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { Sparkles, RefreshCw, Save, Search, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { useToast } from "@/hooks/use-toast"
import { useLojaAtiva } from "@/lib/loja-ativa"
import { listProdutos, type ProdutoDTO } from "@/app/actions/cadastros"
import { salvarProdutoIAMetadata } from "@/app/actions/produto-ia"
import {
  fromProdutoDTO,
  readProdutoMetadata,
  gerarSugestoesProdutoIA,
  mesclarSugestoesComMetadata,
  sugestoesParaMetadata,
  type ProdutoSugestoesIA,
} from "@/lib/catalog"

// ── helpers de edição lista ⇄ texto ───────────────────────────────────────────
const toCSV = (xs: string[]) => xs.join(", ")
const fromCSV = (v: string) =>
  v
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)

function suggestFor(p: ProdutoDTO): ProdutoSugestoesIA {
  const base = gerarSugestoesProdutoIA(fromProdutoDTO(p))
  return mesclarSugestoesComMetadata(base, readProdutoMetadata(p.metadata))
}

export function ProdutoIAAssistente() {
  const { lojaAtivaId } = useLojaAtiva()
  const { toast } = useToast()

  const [produtos, setProdutos] = useState<ProdutoDTO[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [query, setQuery] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sug, setSug] = useState<ProdutoSugestoesIA | null>(null)
  const [saving, setSaving] = useState(false)
  const [jaSalvo, setJaSalvo] = useState(false)

  const storeId = (lojaAtivaId ?? "").trim()

  // Carrega catálogo da loja ativa.
  useEffect(() => {
    if (!storeId) return
    let cancelled = false
    setLoadingList(true)
    listProdutos(storeId)
      .then((rows) => {
        if (!cancelled) setProdutos(rows)
      })
      .catch(() => {
        if (!cancelled) toast({ variant: "destructive", title: "Falha ao carregar produtos" })
      })
      .finally(() => {
        if (!cancelled) setLoadingList(false)
      })
    return () => {
      cancelled = true
    }
  }, [storeId, toast])

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = q
      ? produtos.filter((p) =>
          [p.nome, p.sku, p.categoria, p.marca].some((f) => String(f ?? "").toLowerCase().includes(q)),
        )
      : produtos
    return base.slice(0, 100)
  }, [produtos, query])

  const selected = useMemo(
    () => produtos.find((p) => p.id === selectedId) ?? null,
    [produtos, selectedId],
  )

  const selecionar = useCallback((p: ProdutoDTO) => {
    setSelectedId(p.id)
    setSug(suggestFor(p))
    const meta = readProdutoMetadata(p.metadata)
    setJaSalvo(Boolean(meta.iaRevisadoPor))
  }, [])

  const regenerar = useCallback(() => {
    if (!selected) return
    // Ignora o que estava salvo — volta às sugestões "frescas" da lib/catalog.
    setSug(gerarSugestoesProdutoIA(fromProdutoDTO(selected)))
    toast({ title: "Sugestões regeneradas", description: "Revise e salve para confirmar." })
  }, [selected, toast])

  const patch = useCallback(
    <K extends keyof ProdutoSugestoesIA>(key: K, value: ProdutoSugestoesIA[K]) => {
      setSug((cur) => (cur ? { ...cur, [key]: value } : cur))
    },
    [],
  )

  const salvar = useCallback(async () => {
    if (!selected || !sug || !storeId) return
    setSaving(true)
    try {
      const meta = sugestoesParaMetadata(sug)
      await salvarProdutoIAMetadata(storeId, selected.id, meta)
      // Atualiza espelho local para refletir o salvo (sem refetch).
      setProdutos((cur) =>
        cur.map((p) =>
          p.id === selected.id
            ? { ...p, metadata: { ...readProdutoMetadata(p.metadata), ...meta, iaRevisadoPor: "operador" } }
            : p,
        ),
      )
      setJaSalvo(true)
      toast({ title: "Salvo no produto", description: "Metadata IA atualizado (sem tocar nas colunas)." })
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Não foi possível salvar",
        description: e instanceof Error ? e.message : "Erro inesperado.",
      })
    } finally {
      setSaving(false)
    }
  }, [selected, sug, storeId, toast])

  if (!storeId) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
        Selecione uma loja ativa para usar o Assistente IA do catálogo.
      </div>
    )
  }

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[320px_1fr]">
      {/* Coluna 1 — seleção de produto */}
      <Card className="min-w-0">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4 text-muted-foreground" /> Produtos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Buscar por nome, SKU, categoria…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="max-h-[60vh] min-w-0 space-y-1 overflow-auto">
            {loadingList ? (
              <div className="flex items-center gap-2 px-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
              </div>
            ) : filtrados.length === 0 ? (
              <p className="px-2 py-6 text-sm text-muted-foreground">Nenhum produto encontrado.</p>
            ) : (
              filtrados.map((p) => {
                const ativo = p.id === selectedId
                const revisado = Boolean(readProdutoMetadata(p.metadata).iaRevisadoPor)
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => selecionar(p)}
                    className={[
                      "flex w-full min-w-0 flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                      ativo ? "bg-primary/10 text-foreground" : "hover:bg-muted text-foreground",
                    ].join(" ")}
                  >
                    <span className="flex w-full min-w-0 items-center gap-2">
                      <span className="truncate font-medium">{p.nome}</span>
                      {revisado && (
                        <Badge variant="secondary" className="ml-auto shrink-0 text-[10px]">
                          IA
                        </Badge>
                      )}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {p.categoria !== "—" ? p.categoria : "sem categoria"}
                      {p.sku !== "—" ? ` · ${p.sku}` : ""}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </CardContent>
      </Card>

      {/* Coluna 2 — sugestões editáveis */}
      <Card className="min-w-0">
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" /> Assistente IA
            {selected && (
              <span className="truncate text-sm font-normal text-muted-foreground">— {selected.nome}</span>
            )}
            {jaSalvo && (
              <Badge variant="secondary" className="ml-auto shrink-0">
                Revisado
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!selected || !sug ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Selecione um produto à esquerda para ver as sugestões.
            </p>
          ) : (
            <div className="min-w-0 space-y-4">
              <p className="text-xs text-muted-foreground">
                Sugestões geradas a partir do nome e da categoria. Tudo é editável e salvo apenas em{" "}
                <code className="rounded bg-muted px-1">metadata</code> — colunas do produto não mudam.
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Categoria sugerida">
                  <Input value={sug.categoria} onChange={(e) => patch("categoria", e.target.value)} />
                </Field>
                <Field label="Marca sugerida">
                  <Input value={sug.marca} onChange={(e) => patch("marca", e.target.value)} />
                </Field>
                <Field label="Modelo">
                  <Input value={sug.modelo} onChange={(e) => patch("modelo", e.target.value)} />
                </Field>
                <Field label="Compatibilidade (separe por vírgula)">
                  <Input
                    value={toCSV(sug.compatibilidade)}
                    onChange={(e) => patch("compatibilidade", fromCSV(e.target.value))}
                  />
                </Field>
                <Field label="Sinônimos (vírgula)">
                  <Input value={toCSV(sug.sinonimos)} onChange={(e) => patch("sinonimos", fromCSV(e.target.value))} />
                </Field>
                <Field label="Palavras-chave (vírgula)">
                  <Input
                    value={toCSV(sug.palavrasChave)}
                    onChange={(e) => patch("palavrasChave", fromCSV(e.target.value))}
                  />
                </Field>
              </div>

              <Field label="Tags (vírgula)">
                <Input value={toCSV(sug.tags)} onChange={(e) => patch("tags", fromCSV(e.target.value))} />
                {sug.tags.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {sug.tags.map((t) => (
                      <Badge key={t} variant="outline" className="text-[11px]">
                        {t}
                      </Badge>
                    ))}
                  </div>
                )}
              </Field>

              <Separator />

              <Field label="Descrição curta">
                <Textarea
                  rows={2}
                  value={sug.descricaoCurta}
                  onChange={(e) => patch("descricaoCurta", e.target.value)}
                />
              </Field>
              <Field label="Descrição longa">
                <Textarea
                  rows={4}
                  value={sug.descricaoLonga}
                  onChange={(e) => patch("descricaoLonga", e.target.value)}
                />
              </Field>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button onClick={() => void salvar()} disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Salvar no produto
                </Button>
                <Button variant="outline" onClick={regenerar} disabled={saving}>
                  <RefreshCw className="mr-2 h-4 w-4" /> Regenerar sugestões
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}
