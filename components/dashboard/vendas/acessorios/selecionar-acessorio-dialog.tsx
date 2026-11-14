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
import { modoCorEfetivo, modoModeloEfetivo, sanitizeProdutoAcessoriosMetadata } from "@/lib/acessorios/metadata"
import { opcoesDeCorParaProduto, type CorLoja } from "@/lib/compat/cores-loja"
import { carregarCores, consultarCapinha } from "@/lib/compat/compat-client"
import { rotuloLocalizacao } from "@/lib/compat/organizacao"
import type { AcessorioColorKey } from "@/lib/acessorios/cores"
import type { ProdutoAcessoriosMetadataV1 } from "@/lib/acessorios/types"
import type { DeviceSearchResult } from "@/lib/catalogo-aparelhos/types"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import { useLojaAtiva } from "@/lib/loja-ativa"
import { CadastrarModeloAparelhoDialog } from "@/components/dashboard/catalogo/cadastrar-modelo-aparelho-dialog"

// COMPAT-PROFISSIONAL-001 — cores da loja e "onde está" com cache curto em memória: o PDV
// não pode esperar rede a cada item. Falha de rede = segue só com a paleta padrão (nunca bloqueia).
const CACHE_MS = 60_000
const coresCache = new Map<string, { at: number; linhas: CorLoja[] }>()
const localCache = new Map<string, { at: number; texto: string | null }>()

async function coresDaLoja(loja: string | null): Promise<CorLoja[]> {
  if (!loja) return []
  const hit = coresCache.get(loja)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.linhas
  const r = await carregarCores(loja)
  const linhas = r.ok ? r.linhas : []
  coresCache.set(loja, { at: Date.now(), linhas })
  return linhas
}

async function ondeEstaCapinha(loja: string | null, modelKey: string): Promise<string | null> {
  if (!loja) return null
  const k = `${loja}|${modelKey}`
  const hit = localCache.get(k)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.texto
  const r = await consultarCapinha(loja, modelKey)
  const texto = r.ok
    ? (r.localizacoes.slice(0, 2).map((l) => (l.alvo === "compativel" ? `${rotuloLocalizacao(l)} (via ${l.viaModelo})` : rotuloLocalizacao(l))).join(" · ") || null)
    : null
  localCache.set(k, { at: Date.now(), texto })
  return texto
}

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
  // COMPAT-PROFISSIONAL-001: modo obrigatório / opcional / desativado (antigos: pelos booleanos).
  const modoModelo = modoModeloEfetivo(config)
  const modoCor = modoCorEfetivo(config)
  const exigeModelo = modoModelo === "obrigatorio"
  const exigeCor = modoCor === "obrigatorio"
  const mostraModelo = modoModelo !== "desativado"
  const mostraCor = modoCor !== "desativado"
  const [coresLinhas, setCoresLinhas] = useState<CorLoja[]>([])
  const colorOptions = useMemo(
    () => opcoesDeCorParaProduto(resolveAccessoryColorOptions(config), coresLinhas, config?.coresLoja),
    [config, coresLinhas],
  )
  const [corLojaId, setCorLojaId] = useState<string | null>(null)
  const [ondeEsta, setOndeEsta] = useState<string | null>(null)

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
  // CADASTROS-ACESSORIOS-COMPATIBILIDADE-MANUAL-001 — busca na loja ativa (global + manuais)
  // e cadastro de modelo novo sem sair da venda. Não mexe em carrinho, preço ou estoque.
  const { lojaAtivaId } = useLojaAtiva()
  const lojaHeader = (lojaAtivaId ?? "").trim() || null
  const [cadastroOpen, setCadastroOpen] = useState(false)
  const [cadastroNome, setCadastroNome] = useState("")

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
    setCadastroOpen(false)
    setCorLojaId(null)
    setOndeEsta(null)
  }, [])

  const closeAndReset = useCallback(() => {
    closeAccessoryDialog(resetTemporaryState, onCancel)
  }, [onCancel, resetTemporaryState])

  // Estado temporário zera tanto ao fechar quanto a cada abertura/produto.
  useEffect(() => {
    resetTemporaryState()
  }, [open, product?.id, resetTemporaryState])

  useEffect(() => {
    if (!open || !mostraCor) return
    let vivo = true
    void coresDaLoja(lojaHeader).then((linhas) => vivo && setCoresLinhas(linhas))
    return () => {
      vivo = false
    }
  }, [open, mostraCor, lojaHeader])

  // Capinha: ao escolher o modelo, mostra onde ela fica (painel/fileira), se cadastrado.
  useEffect(() => {
    setOndeEsta(null)
    if (!open || !modelo || config?.tipo !== "capinha") return
    let vivo = true
    void ondeEstaCapinha(lojaHeader, modelo.modelKey).then((t) => vivo && setOndeEsta(t))
    return () => {
      vivo = false
    }
  }, [open, modelo, config?.tipo, lojaHeader])

  // Busca na base única com debounce + cancelamento da requisição anterior:
  // resposta antiga abortada nunca sobrescreve o resultado da busca mais nova.
  useEffect(() => {
    if (!open || !mostraModelo) return
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
          ...(lojaHeader ? { headers: { [ASSISTEC_LOJA_HEADER]: lojaHeader } } : {}),
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
  }, [query, open, mostraModelo, lojaHeader])

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
      // Cor própria da loja viaja como "outra" + rótulo (contrato já aceito e congelado na venda).
      ...(colorKey === "outra" && corLojaId
        ? { customColorLabel: colorOptions.find((c) => c.id === corLojaId)?.label ?? customColor.trim() }
        : colorKey === "outra" && customColor.trim()
          ? { customColorLabel: customColor.trim() }
          : {}),
    }),
    [modelo, colorKey, customColor, corLojaId, colorOptions],
  )

  const missingModelo = exigeModelo && !modelo
  const missingCor = exigeCor && !colorKey
  const missingCustom = colorKey === "outra" && !corLojaId && !customColor.trim()
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
        // Cor própria da loja = "outra" + rótulo; a restrição de paleta do produto não se aplica a ela.
        config: corLojaId && config ? { ...config, coresPermitidas: null } : config,
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
          {mostraModelo && (
            <div className="space-y-2 min-w-0">
              <Label htmlFor="acessorio-modelo-busca">
                Modelo do aparelho
                {!exigeModelo && <span className="ml-1 font-normal text-muted-foreground">(opcional)</span>}
              </Label>
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
                    onKeyDown={(e) => {
                      // Venda rápida: com tudo opcional, Enter no campo vazio adiciona direto.
                      if (e.key === "Enter" && !query.trim() && canConfirm) {
                        e.preventDefault()
                        handleConfirm()
                      }
                    }}
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
                        <div className="space-y-1.5 px-2 py-1.5">
                          <p className="text-sm text-muted-foreground">Nenhum modelo encontrado.</p>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setCadastroNome(query.trim())
                              setCadastroOpen(true)
                            }}
                          >
                            Cadastrar novo modelo “{query.trim()}”
                          </Button>
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
                              {r.source === "loja" && (
                                <Badge variant="outline" className="shrink-0 text-[10px] text-muted-foreground">
                                  cadastro da loja
                                </Badge>
                              )}
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
              {ondeEsta && (
                <p className="rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-xs text-foreground">
                  Onde está: <span className="font-medium">{ondeEsta}</span>
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Seleciona o aparelho desta venda — não confirma compatibilidade da peça.
              </p>
            </div>
          )}

          {mostraCor && (
            <div className="space-y-2 min-w-0">
              <Label>
                Cor{!exigeCor && <span className="ml-1 font-normal text-muted-foreground">(opcional)</span>}
              </Label>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Cor do acessório">
                {colorOptions.map((cor) => {
                  const selected = cor.origem === "loja" ? corLojaId === cor.id : colorKey === cor.key && !corLojaId
                  return (
                    <button
                      key={cor.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        // Clicar de novo na cor escolhida desmarca (útil quando a cor é opcional).
                        if (selected && !exigeCor) {
                          setColorKey(null)
                          setCorLojaId(null)
                        } else {
                          setColorKey(cor.key)
                          setCorLojaId(cor.origem === "loja" ? cor.id : null)
                        }
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
              {colorKey === "outra" && !corLojaId && (
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
              {!exigeModelo && !exigeCor ? " Modelo e cor são opcionais: dá para adicionar direto." : ""}
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

        {/* Cadastro de modelo novo: só registra o APARELHO (catálogo da loja). Não altera a linha,
            o preço nem o estoque; o operador ainda confirma a inclusão no carrinho. */}
        <CadastrarModeloAparelhoDialog
          open={cadastroOpen}
          onOpenChange={setCadastroOpen}
          lojaHeader={lojaHeader}
          initialName={cadastroNome}
          onCreated={(m) => {
            setModelo({ modelKey: m.modelKey, brand: m.brand, name: m.canonicalName })
            setQuery("")
            setResults([])
            setConfirmErrors([])
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
