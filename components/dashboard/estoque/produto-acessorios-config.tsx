"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Palette, Plus, Search, X } from "lucide-react"
import { ACESSORIO_CORES_PADRAO, type AcessorioColorKey } from "@/lib/acessorios/cores"
import { withModoCaptura, type ProdutoAcessoriosFormValue } from "@/lib/acessorios/form"
import { isAcessorioModoCaptura } from "@/lib/acessorios/metadata"
import type { AcessorioModoCaptura, ProdutoAcessorioTipo } from "@/lib/acessorios/types"
import { carregarCores, carregarOrganizacao, criarCor } from "@/lib/compat/compat-client"
import {
  COR_PADRAO_VISUAL,
  corEquivalenciaKey,
  corPadraoComMesmoNome,
  filtrarCoresPorBusca,
  type CorEfetiva,
} from "@/lib/compat/cores-loja"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { CorSwatch } from "@/components/dashboard/compat/cor-swatch"
import { CoresPanel } from "@/components/dashboard/compat/ajustes-panels"

type Props = {
  /** Loja do produto (header explícito). Sem loja: só paleta padrão, sem preferências da loja. */
  lojaHeader?: string | null
  value: ProdutoAcessoriosFormValue
  onChange: (value: ProdutoAcessoriosFormValue) => void
}

const TIPOS: Array<{ value: ProdutoAcessorioTipo; label: string }> = [
  { value: "capinha", label: "Capinha" },
  { value: "pelicula", label: "Película" },
  { value: "acessorio_generico", label: "Acessório genérico" },
]

const MODOS: Array<{ value: AcessorioModoCaptura; label: string }> = [
  { value: "obrigatorio", label: "Obrigatório — o PDV não adiciona sem informar" },
  { value: "opcional", label: "Opcional — pergunta, mas dá para pular" },
  { value: "desativado", label: "Desativado — não pergunta" },
]

function modoAtual(value: ProdutoAcessoriosFormValue, campo: "modelo" | "cor"): AcessorioModoCaptura {
  const explicito = campo === "modelo" ? value.modoModelo : value.modoCor
  if (explicito) return explicito
  return (campo === "modelo" ? value.exigeModelo : value.exigeCor) ? "obrigatorio" : "desativado"
}

const CORES_PADRAO_FALLBACK: CorEfetiva[] = ACESSORIO_CORES_PADRAO.map((c) => ({
  id: c.key,
  label: c.label,
  origem: "padrao",
  ativo: true,
  baseKey: c.key,
  version: 0,
  rowId: null,
  visual: COR_PADRAO_VISUAL[c.key],
}))

/**
 * Configuração de acessórios do produto. COMPAT-PROFISSIONAL-001: modelo e cor viram
 * obrigatório / opcional / desativado (produtos antigos abrem com o equivalente dos booleanos)
 * e as cores da loja podem ser pesquisadas, selecionadas, desvinculadas deste produto ou
 * gerenciadas na fonte oficial (`/api/catalogo/compat/cores`). O estoque continua único no
 * produto — modelo/cor informados na venda são histórico, não saldo.
 */
// Recebe a loja por prop (não usa o provider de loja ativa): o formulário roda também em
// harness isolado, sem sessão NextAuth.
export function ProdutoAcessoriosConfig({ lojaHeader: lojaProp, value, onChange }: Props) {
  const patch = (next: Partial<ProdutoAcessoriosFormValue>) => onChange({ ...value, ...next })
  const lojaHeader = (lojaProp ?? "").trim() || null
  const [todasCores, setTodasCores] = useState<CorEfetiva[]>(CORES_PADRAO_FALLBACK)
  const [buscaCor, setBuscaCor] = useState("")
  const [gerenciarAberto, setGerenciarAberto] = useState(false)
  const [criandoCor, setCriandoCor] = useState(false)
  const [corErro, setCorErro] = useState("")

  const recarregarCores = useCallback(async () => {
    if (!lojaHeader) return
    const r = await carregarCores(lojaHeader)
    // Resposta sem a lista (servidor antigo/harness) = segue com a paleta padrão, nunca quebra o formulário.
    if (r.ok && Array.isArray(r.cores) && r.cores.length > 0) setTodasCores(r.cores)
  }, [lojaHeader])

  useEffect(() => {
    if (!lojaHeader || !value.enabled) return
    let vivo = true
    void carregarCores(lojaHeader).then((r) => {
      if (vivo && r.ok && Array.isArray(r.cores) && r.cores.length > 0) setTodasCores(r.cores)
    })
    return () => {
      vivo = false
    }
  }, [lojaHeader, value.enabled])

  const coresPadrao = useMemo(() => todasCores.filter((c) => c.origem === "padrao"), [todasCores])
  const coresLoja = useMemo(() => todasCores.filter((c) => c.origem === "loja"), [todasCores])
  const coresLojaAtivas = useMemo(() => coresLoja.filter((c) => c.ativo), [coresLoja])
  const coresLojaSelecionadas = useMemo(
    () => value.coresLoja ?? coresLojaAtivas.map((c) => c.id),
    [value.coresLoja, coresLojaAtivas],
  )

  const toggleCor = (key: AcessorioColorKey, checked: boolean) => {
    const selected = new Set(value.coresPermitidas)
    if (checked) selected.add(key)
    else selected.delete(key)
    patch({ coresPermitidas: ACESSORIO_CORES_PADRAO.filter((cor) => selected.has(cor.key)).map((cor) => cor.key) })
  }

  const toggleCorLoja = (id: string, checked: boolean) => {
    const atual = value.coresLoja ?? coresLojaAtivas.map((c) => c.id)
    const next = checked ? [...new Set([...atual, id])] : atual.filter((x) => x !== id)
    patch({ coresLoja: next })
  }

  // Padrão da loja (Compat › Preferências), carregado antes: ativar a configuração é síncrono.
  const [padraoLoja, setPadraoLoja] = useState<{ modelo: AcessorioModoCaptura; cor: AcessorioModoCaptura } | null>(null)
  useEffect(() => {
    if (!lojaHeader || value.enabled) return
    let vivo = true
    void carregarOrganizacao(lojaHeader).then((r) => {
      if (vivo && r.ok && isAcessorioModoCaptura(r.preferencias?.modoModeloPadrao) && isAcessorioModoCaptura(r.preferencias?.modoCorPadrao)) {
        setPadraoLoja({ modelo: r.preferencias.modoModeloPadrao, cor: r.preferencias.modoCorPadrao })
      }
    })
    return () => {
      vivo = false
    }
  }, [lojaHeader, value.enabled])

  // Ao ativar a configuração pela 1ª vez, sugere o padrão da loja.
  const ativar = (checked: boolean) => {
    if (!checked || value.modoModelo || value.modoCor || !padraoLoja) {
      patch({ enabled: checked })
      return
    }
    onChange(withModoCaptura(withModoCaptura({ ...value, enabled: true }, "modelo", padraoLoja.modelo), "cor", padraoLoja.cor))
  }

  const modoCor = modoAtual(value, "cor")

  const padraoFiltradas = useMemo(
    () =>
      filtrarCoresPorBusca(
        coresPadrao.filter((c) => c.ativo || value.coresPermitidas.includes(c.id as AcessorioColorKey)),
        buscaCor,
      ),
    [coresPadrao, value.coresPermitidas, buscaCor],
  )
  const lojaFiltradas = useMemo(
    () =>
      filtrarCoresPorBusca(
        coresLoja.filter((c) => c.ativo || coresLojaSelecionadas.includes(c.id)),
        buscaCor,
      ),
    [coresLoja, coresLojaSelecionadas, buscaCor],
  )

  const selecionadasChips = useMemo(() => {
    const padraoChips = coresPadrao
      .filter((c) => value.coresPermitidas.includes(c.id as AcessorioColorKey))
      .map((c) => ({ ...c, origemChip: "padrao" as const }))
    const lojaChips = coresLoja
      .filter((c) => coresLojaSelecionadas.includes(c.id))
      .map((c) => ({ ...c, origemChip: "loja" as const }))
    return [...padraoChips, ...lojaChips]
  }, [coresPadrao, coresLoja, value.coresPermitidas, coresLojaSelecionadas])

  const podeCriarBusca = useMemo(() => {
    const q = buscaCor.trim()
    if (!lojaHeader || corEquivalenciaKey(q).length < 2) return false
    if (corPadraoComMesmoNome(q)) return false
    return !coresLoja.some((c) => corEquivalenciaKey(c.label) === corEquivalenciaKey(q))
  }, [lojaHeader, buscaCor, coresLoja])

  const cadastrarCorRapida = async () => {
    if (!lojaHeader || !podeCriarBusca || criandoCor) return
    setCriandoCor(true)
    setCorErro("")
    const r = await criarCor(lojaHeader, buscaCor.trim())
    setCriandoCor(false)
    if (!r.ok) {
      setCorErro(r.error)
      return
    }
    await recarregarCores()
    const atual = value.coresLoja ?? coresLojaAtivas.map((c) => c.id)
    patch({ coresLoja: [...new Set([...atual, r.id])] })
    setBuscaCor("")
  }

  return (
    <section className="min-w-0 rounded-xl border border-border bg-muted/20 p-4" aria-label="Configuração de acessórios">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 accent-primary"
          checked={value.enabled}
          onChange={(event) => ativar(event.target.checked)}
        />
        <span>
          <span className="block text-sm font-semibold text-foreground">Configuração de acessórios</span>
          <span className="block text-xs text-muted-foreground">
            Para capinhas, películas e acessórios que pedem modelo e/ou cor no PDV. O estoque continua único neste produto.
          </span>
        </span>
      </label>

      {value.enabled ? (
        <div className="mt-4 min-w-0 space-y-4 border-t border-border pt-4">
          <label className="block space-y-1 text-sm text-foreground">
            <span className="font-medium">Tipo</span>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={value.tipo}
              onChange={(event) => patch({ tipo: event.target.value as ProdutoAcessorioTipo })}
            >
              {TIPOS.map((tipo) => <option key={tipo.value} value={tipo.value}>{tipo.label}</option>)}
            </select>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            {(["modelo", "cor"] as const).map((campo) => (
              <label key={campo} className="block min-w-0 space-y-1 text-sm text-foreground">
                <span className="font-medium">{campo === "modelo" ? "Modelo do aparelho na venda" : "Cor na venda"}</span>
                <select
                  aria-label={campo === "modelo" ? "Modelo do aparelho na venda" : "Cor na venda"}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={modoAtual(value, campo)}
                  onChange={(event) => onChange(withModoCaptura(value, campo, event.target.value as AcessorioModoCaptura))}
                >
                  {MODOS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </label>
            ))}
          </div>

          {modoCor !== "desativado" && (
            <div className="min-w-0 space-y-3">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <BooleanField
                  label="Usar cores padrão"
                  checked={value.usaCoresPadrao}
                  onChange={(checked) => patch({ usaCoresPadrao: checked })}
                />
                {lojaHeader && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setGerenciarAberto(true)}
                  >
                    <Palette className="mr-1.5 h-3.5 w-3.5" /> Gerenciar cores
                  </Button>
                )}
              </div>

              {value.usaCoresPadrao ? (
                <div className="space-y-2 rounded-lg border border-border bg-background/70 p-3">
                  <p className="text-xs text-muted-foreground">
                    As cores padrão ativas da loja{coresLojaAtivas.length ? ` e as ${coresLojaAtivas.length} cor(es) própria(s)` : ""} estarão disponíveis.
                  </p>
                  <div className="flex flex-wrap gap-1.5" aria-label="Cores ativas da loja">
                    {todasCores.filter((c) => c.ativo).map((c) => (
                      <span
                        key={c.id}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-0.5 text-xs text-foreground"
                      >
                        <CorSwatch visual={c.visual} size="xs" />
                        <span>{c.label}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <fieldset className="min-w-0 space-y-3">
                  <legend className="text-sm font-medium text-foreground">Cores aplicáveis a este produto</legend>

                  {selecionadasChips.length > 0 && (
                    <div className="space-y-1.5 rounded-lg border border-border bg-background/80 p-2.5">
                      <p className="text-[11px] text-muted-foreground">
                        Selecionadas ({selecionadasChips.length}) — remover aqui tira apenas deste produto, sem apagar a cor da loja:
                      </p>
                      <div className="flex flex-wrap gap-1.5" aria-label="Cores selecionadas no produto">
                        {selecionadasChips.map((cor) => (
                          <span
                            key={`${cor.origem}-${cor.id}`}
                            className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 py-0.5 pl-2 pr-1 text-xs text-foreground"
                          >
                            <CorSwatch visual={cor.visual} size="xs" />
                            <span>{cor.label}</span>
                            <button
                              type="button"
                              aria-label={`Remover seleção de ${cor.label}`}
                              onClick={() =>
                                cor.origemChip === "padrao"
                                  ? toggleCor(cor.id as AcessorioColorKey, false)
                                  : toggleCorLoja(cor.id, false)
                              }
                              className="grid h-4 w-4 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="relative min-w-0">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input
                      value={buscaCor}
                      onChange={(e) => {
                        setBuscaCor(e.target.value)
                        setCorErro("")
                      }}
                      aria-label="Pesquisar cores do produto"
                      placeholder="Pesquisar cores (ex.: preto, azul-marinho, transparente, fumê)…"
                      className="h-8 pl-8 text-xs"
                    />
                  </div>
                  {corErro && <p role="alert" className="text-xs text-destructive">{corErro}</p>}

                  {podeCriarBusca && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={criandoCor}
                      onClick={() => void cadastrarCorRapida()}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      {criandoCor ? "Cadastrando…" : `Cadastrar cor “${buscaCor.trim()}” na loja`}
                    </Button>
                  )}

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                    {padraoFiltradas.map((cor) => (
                      <label key={cor.id} className="flex min-w-0 cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-xs">
                        <input
                          type="checkbox"
                          className="h-4 w-4 shrink-0 accent-primary"
                          checked={value.coresPermitidas.includes(cor.id as AcessorioColorKey)}
                          onChange={(event) => toggleCor(cor.id as AcessorioColorKey, event.target.checked)}
                        />
                        <CorSwatch visual={cor.visual} size="xs" />
                        <span className="truncate">{cor.label}</span>
                        {!cor.ativo && <span className="shrink-0 text-[10px] text-muted-foreground">(inativa)</span>}
                      </label>
                    ))}
                  </div>
                  {lojaFiltradas.length > 0 && (
                    <>
                      <p className="pt-1 text-xs font-medium text-muted-foreground">Cores da loja</p>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                        {lojaFiltradas.map((cor) => (
                          <label key={cor.id} className="flex min-w-0 cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-xs">
                            <input
                              type="checkbox"
                              className="h-4 w-4 shrink-0 accent-primary"
                              checked={coresLojaSelecionadas.includes(cor.id)}
                              onChange={(event) => toggleCorLoja(cor.id, event.target.checked)}
                            />
                            <CorSwatch visual={cor.visual} size="xs" />
                            <span className="truncate">{cor.label}</span>
                            {!cor.ativo && <span className="shrink-0 text-[10px] text-muted-foreground">(inativa)</span>}
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                  {padraoFiltradas.length === 0 && lojaFiltradas.length === 0 && (
                    <p className="text-xs text-muted-foreground">Nenhuma cor encontrada para “{buscaCor.trim()}”.</p>
                  )}
                </fieldset>
              )}
            </div>
          )}
        </div>
      ) : null}

      {lojaHeader && (
        <Dialog open={gerenciarAberto} onOpenChange={setGerenciarAberto}>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Gerenciar cores da loja</DialogTitle>
              <DialogDescription>
                Cadastre, renomeie, personalize o visual ou ative/desative cores na fonte oficial da loja.
              </DialogDescription>
            </DialogHeader>
            <CoresPanel lojaHeader={lojaHeader} onChanged={() => void recarregarCores()} />
          </DialogContent>
        </Dialog>
      )}
    </section>
  )
}

function BooleanField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm">
      <input
        type="checkbox"
        className="h-4 w-4 accent-primary"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  )
}
