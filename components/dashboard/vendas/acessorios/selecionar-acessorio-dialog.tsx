"use client"

/**
 * PDV-ACESSORIOS-SELETOR-MODELO-COR-003 — modal COMPARTILHADO "Configurar acessório".
 *
 * Único modal para todos os PDVs: pesquisa o modelo na base única de aparelhos
 * (GET /api/catalogo/aparelhos/search) e seleciona a cor da lista global canônica
 * (`lib/acessorios/cores.ts`). A seleção é um snapshot operacional da LINHA do
 * carrinho — o estoque continua 100% no produto real (nenhuma variação é criada).
 *
 * O modal só fecha quando o caller confirma a inclusão no carrinho (`onConfirm`
 * retorna `true`); cancelar nunca altera carrinho nem estoque.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  buildAccessoryCartLine,
  resolveAccessoryColorOptions,
  type AccessoryCartLineSnapshot,
} from "@/lib/acessorios/cart-line"
import { buildAccessoryLineDescription } from "@/lib/acessorios/line-description"
import { sanitizeProdutoAcessoriosMetadata } from "@/lib/acessorios/metadata"
import type { AcessorioColorKey } from "@/lib/acessorios/cores"
import type { ProdutoAcessoriosMetadataV1 } from "@/lib/acessorios/types"
import type { DeviceSearchResult } from "@/lib/catalogo-aparelhos/types"

const TIPO_LABELS: Record<ProdutoAcessoriosMetadataV1["tipo"], string> = {
  capinha: "Capinha",
  pelicula: "Película",
  acessorio_generico: "Acessório",
}

/** Subconjunto do produto que o modal precisa (qualquer PdvCatalogProduct satisfaz). */
export type SelecionarAcessorioProduto = {
  id: string
  name: string
  accessoryConfig?: ProdutoAcessoriosMetadataV1
}

type ModeloSelecionado = {
  modelKey: string
  brand: string
  name: string
}

export function completeAccessoryDialogConfirmation<T>(
  line: T,
  onConfirm: (confirmedLine: T) => boolean,
  onClose: () => void,
): boolean {
  const confirmed = onConfirm(line)
  if (confirmed) onClose()
  return confirmed
}

export function shouldCloseAccessoryDialog(nextOpen: boolean, busy: boolean): boolean {
  return !nextOpen && !busy
}

export function shouldRenderAccessoryDialog(
  open: boolean,
  product: SelecionarAcessorioProduto | null,
): boolean {
  return open && product !== null
}

export function createEmptyAccessoryDialogState() {
  return {
    query: "",
    results: [] as DeviceSearchResult[],
    searching: false,
    searchError: null as string | null,
    modelo: null as ModeloSelecionado | null,
    colorKey: null as AcessorioColorKey | null,
    customColor: "",
    confirmErrors: [] as string[],
    busy: false,
  }
}

export function closeAccessoryDialog(reset: () => void, onCancel: () => void): void {
  reset()
  onCancel()
}

export function SelecionarAcessorioDialog({
  open,
  product,
  onCancel,
  onConfirm,
}: {
  open: boolean
  product: SelecionarAcessorioProduto | null
  /** Fechar sem adicionar — não altera carrinho nem estoque. */
  onCancel: () => void
  /** Retornar `true` = linha incluída no carrinho (o caller fecha o modal). */
  onConfirm: (line: AccessoryCartLineSnapshot) => boolean
}) {
  const config = useMemo(
    () => sanitizeProdutoAcessoriosMetadata(product?.accessoryConfig),
    [product?.accessoryConfig],
  )
  const exigeModelo = !!config?.exigeModelo
  const exigeCor = !!config?.exigeCor
  const colorOptions = useMemo(() => resolveAccessoryColorOptions(config), [config])

  const [query, setQuery] = useState("")
  const [results, setResults] = useState<DeviceSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [modelo, setModelo] = useState<ModeloSelecionado | null>(null)
  const [colorKey, setColorKey] = useState<AcessorioColorKey | null>(null)
  const [customColor, setCustomColor] = useState("")
  const [confirmErrors, setConfirmErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  const resetTemporaryState = useCallback(() => {
    const empty = createEmptyAccessoryDialogState()
    setQuery(empty.query)
    setResults(empty.results)
    setSearching(empty.searching)
    setSearchError(empty.searchError)
    setModelo(empty.modelo)
    setColorKey(empty.colorKey)
    setCustomColor(empty.customColor)
    setConfirmErrors(empty.confirmErrors)
    setBusy(empty.busy)
  }, [])

  const closeAndReset = useCallback(() => {
    closeAccessoryDialog(resetTemporaryState, onCancel)
  }, [onCancel, resetTemporaryState])

  // Estado temporário zera tanto ao fechar quanto a cada abertura/produto.
  useEffect(() => {
    resetTemporaryState()
  }, [open, product?.id, resetTemporaryState])

  // Busca na base única com debounce + cancelamento da requisição anterior:
  // resposta antiga abortada nunca sobrescreve o resultado da busca mais nova.
  useEffect(() => {
    if (!open || !exigeModelo) return
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setSearching(false)
      setSearchError(null)
      return
    }
    setSearching(true)
    setSearchError(null)
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/catalogo/aparelhos/search?q=${encodeURIComponent(q)}`, {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        })
        if (!res.ok) {
          setResults([])
          setSearchError("Falha ao buscar modelos. Tente novamente.")
          return
        }
        const data = (await res.json().catch(() => null)) as
          | { results?: DeviceSearchResult[] }
          | null
        setResults(Array.isArray(data?.results) ? data.results : [])
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return
        setResults([])
        setSearchError("Falha ao buscar modelos. Tente novamente.")
      } finally {
        if (!controller.signal.aborted) setSearching(false)
      }
    }, 300)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query, open, exigeModelo])

  const selectionCandidate = useMemo(
    () => ({
      version: 1,
      ...(modelo
        ? {
            deviceModelKey: modelo.modelKey,
            deviceBrand: modelo.brand,
            deviceModelName: modelo.name,
          }
        : {}),
      ...(colorKey ? { colorKey } : {}),
      ...(colorKey === "outra" && customColor.trim()
        ? { customColorLabel: customColor.trim() }
        : {}),
    }),
    [modelo, colorKey, customColor],
  )

  const missingModelo = exigeModelo && !modelo
  const missingCor = exigeCor && !colorKey
  const missingCustom = colorKey === "outra" && !customColor.trim()
  const canConfirm = !missingModelo && !missingCor && !missingCustom && !busy

  const previewDescription = product
    ? buildAccessoryLineDescription(product.name, selectionCandidate)
    : ""

  // O Radix mantem o portal durante a animacao de saida. No PDV Rapido/Grade,
  // a atualizacao mais pesada do carrinho deixava esse portal fechado, ja sem
  // produto/estado temporario, perceptivel como um shell vazio. Remover a arvore
  // do Dialog no mesmo render em que o caller fecha evita depender da Presence
  // ou de timers, sem alterar as animacoes dos demais dialogs do sistema.
  const renderDialog = shouldRenderAccessoryDialog(open, product)

  const handleSelectModelo = (r: DeviceSearchResult) => {
    setModelo({ modelKey: r.modelKey, brand: r.brand, name: r.canonicalName || r.modelKey })
    setQuery("")
    setResults([])
    setConfirmErrors([])
  }

  const handleConfirm = () => {
    if (!product || busy) return
    // Busy-lock: evita clique duplo adicionando a mesma linha duas vezes.
    setBusy(true)
    try {
      const built = buildAccessoryCartLine({
        inventoryId: product.id,
        productName: product.name,
        config,
        selection: selectionCandidate,
      })
      if (!built.ok) {
        setConfirmErrors(built.errors.map((e) => e.message))
        return
      }
      setConfirmErrors([])
      // `true` fecha explicitamente depois da inclusão; `false` mantém aberto
      // (ex.: estoque agregado). O fechamento não depende do evento do Radix,
      // que pode ocorrer enquanto o busy-lock da confirmação ainda está ativo.
      completeAccessoryDialogConfirmation(built.line, onConfirm, closeAndReset)
    } finally {
      setBusy(false)
    }
  }

  if (!renderDialog) return null

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (shouldCloseAccessoryDialog(next, busy)) closeAndReset()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Configurar acessório</DialogTitle>
          <DialogDescription className="min-w-0">
            <span className="font-medium text-foreground">{product?.name ?? ""}</span>
            {config ? (
              <Badge variant="secondary" className="ml-2 align-middle">
                {TIPO_LABELS[config.tipo]}
              </Badge>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 min-w-0">
          {exigeModelo && (
            <div className="space-y-2 min-w-0">
              <Label htmlFor="acessorio-modelo-busca">Modelo do aparelho</Label>
              {modelo ? (
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant="secondary" className="gap-1 py-1 pl-2.5 pr-1 min-w-0">
                    <span className="truncate max-w-[18rem]">
                      {[modelo.brand, modelo.name]
                        .filter(Boolean)
                        .filter((v, i, arr) => arr.indexOf(v) === i)
                        .join(" · ")}
                    </span>
                    <button
                      type="button"
                      aria-label="Trocar modelo"
                      onClick={() => {
                        setModelo(null)
                        queueMicrotask(() => searchInputRef.current?.focus())
                      }}
                      className="ml-0.5 rounded-sm px-1 text-muted-foreground hover:text-foreground"
                    >
                      ×
                    </button>
                  </Badge>
                </div>
              ) : (
                <div className="relative min-w-0">
                  <Input
                    id="acessorio-modelo-busca"
                    ref={searchInputRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Ex.: A06, Samsung A06, iPhone 13"
                    autoComplete="off"
                    autoFocus
                  />
                  {query.trim().length >= 2 && (
                    <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-md">
                      {searching && (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">Buscando…</div>
                      )}
                      {!searching && searchError && (
                        <div className="px-2 py-1.5 text-sm text-destructive">{searchError}</div>
                      )}
                      {!searching && !searchError && results.length === 0 && (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">
                          Nenhum modelo encontrado.
                        </div>
                      )}
                      {!searching &&
                        results.map((r) => (
                          <button
                            key={r.modelKey}
                            type="button"
                            onClick={() => handleSelectModelo(r)}
                            className="flex w-full flex-col gap-0.5 rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground min-w-0"
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <span className="truncate text-sm font-medium">
                                {r.canonicalName || r.modelKey}
                              </span>
                              {r.ambiguous && (
                                <Badge
                                  variant="outline"
                                  className="border-warning/40 text-warning shrink-0 text-[10px]"
                                >
                                  {r.requiresBrandContext ? "ambíguo · confirme a marca" : "alias curto"}
                                </Badge>
                              )}
                            </span>
                            <span className="truncate text-xs text-muted-foreground">
                              {[r.brand, r.commercialLine].filter(Boolean).join(" · ")}
                            </span>
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Seleciona o aparelho desta venda — não confirma compatibilidade da peça.
              </p>
            </div>
          )}

          {exigeCor && (
            <div className="space-y-2 min-w-0">
              <Label>Cor</Label>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Cor do acessório">
                {colorOptions.map((cor) => {
                  const selected = colorKey === cor.key
                  return (
                    <button
                      key={cor.key}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        setColorKey(cor.key)
                        setConfirmErrors([])
                      }}
                      className={cn(
                        "rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        selected
                          ? "border-primary bg-primary/10 font-medium text-foreground"
                          : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                      )}
                    >
                      {cor.label}
                    </button>
                  )
                })}
              </div>
              {colorKey === "outra" && (
                <div className="space-y-1.5">
                  <Label htmlFor="acessorio-cor-outra">Qual cor?</Label>
                  <Input
                    id="acessorio-cor-outra"
                    value={customColor}
                    maxLength={80}
                    onChange={(e) => {
                      setCustomColor(e.target.value)
                      setConfirmErrors([])
                    }}
                    placeholder="Ex.: Azul bebê"
                    autoComplete="off"
                  />
                </div>
              )}
            </div>
          )}

          {/* Resumo da seleção */}
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 min-w-0">
            <p className="text-xs text-muted-foreground">Linha no carrinho</p>
            <p className="truncate text-sm font-medium">{previewDescription}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              O estoque continua único no produto principal.
            </p>
          </div>

          {confirmErrors.length > 0 && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {confirmErrors.map((msg) => (
                <p key={msg}>{msg}</p>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={closeAndReset} disabled={busy}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={!canConfirm}>
            Adicionar ao carrinho
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
