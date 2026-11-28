"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Info, Loader2, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  CATEGORIAS_POR_ORIGEM, CUSTO_ORIGENS, CUSTO_ORIGEM_LABEL, EFEITO_FINANCEIRO,
  type CustoCategoria, type CustoOrigem, type CustoStatus,
} from "@/lib/comercial/custos/contracts"
import { formatCentavos, parseCentavos } from "@/lib/comercial/custos/money"
import { dataBr, FieldLabel, inputCls } from "../parts"
import type { AparelhoPermissions } from "../api"
import { ApiError, apiComercial, buscarProdutos, novoOperationId, type ProdutoBusca, type TituloOrigem } from "./api"
import { categoriaCustoLabel } from "./labels"

/** Origens que o perfil pode lançar (o servidor revalida: estoque = técnico+, demais = quem define custo). */
export function origensPermitidas(perms: Pick<AparelhoPermissions, "editar" | "definirCusto" | "verCusto">): CustoOrigem[] {
  return CUSTO_ORIGENS.filter((o) => {
    if (o === "estoque") return perms.editar || perms.definirCusto
    if (o === "vinculo_financeiro") return perms.definirCusto && perms.verCusto
    return perms.definirCusto
  })
}

const hojeKey = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function useDebounced<T>(v: T, ms = 300): T {
  const [d, setD] = useState(v)
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t) }, [v, ms])
  return d
}

function restante(t: TituloOrigem) {
  return { valor: Math.max(0, t.valorCentavos - t.usadoCentavos), qtd: t.quantidadeTotal == null ? null : Math.max(0, t.quantidadeTotal - t.usadoQuantidade) }
}

/** Mesma regra do servidor (`valorProporcionalDaOrigem`) — só para PRÉVIA; o valor gravado é o do servidor. */
function previaVinculo(t: TituloOrigem, quantidade: number, quantidadeTotal: number | null): number | null {
  const total = t.quantidadeTotal ?? quantidadeTotal
  if (!total || quantidade < 1) return null
  const r = restante(t)
  const restQtd = total - t.usadoQuantidade
  if (quantidade >= restQtd) return r.valor
  return Math.round((t.valorCentavos * quantidade) / total)
}

type Props = {
  storeId: string
  aparelhoId: string
  perms: Pick<AparelhoPermissions, "editar" | "definirCusto" | "verCusto">
  /** Motivo pelo qual a unidade não aceita custo agora (vendida, baixada, aquisição pendente). */
  bloqueio: string | null
  onDone: () => void
}

export function AdicionarCustoForm({ storeId, aparelhoId, perms, bloqueio, onDone }: Props) {
  const origens = origensPermitidas(perms)
  const [origem, setOrigem] = useState<CustoOrigem>(origens[0] ?? "estoque")
  const [categoria, setCategoria] = useState<CustoCategoria>(CATEGORIAS_POR_ORIGEM[origens[0] ?? "estoque"][0]!)
  const [descricao, setDescricao] = useState("")
  const [quantidade, setQuantidade] = useState("1")
  const [custoStatus, setCustoStatus] = useState<CustoStatus>("conhecido")
  const [valor, setValor] = useState("")
  const [justificativa, setJustificativa] = useState("")
  const [produto, setProduto] = useState<ProdutoBusca | null>(null)
  const [termoProduto, setTermoProduto] = useState("")
  const [produtos, setProdutos] = useState<{ itens: ProdutoBusca[]; buscando: boolean; erro: string | null }>({ itens: [], buscando: false, erro: null })
  const [titulo, setTitulo] = useState<TituloOrigem | null>(null)
  const [termoTitulo, setTermoTitulo] = useState("")
  const [titulos, setTitulos] = useState<{ itens: TituloOrigem[]; buscando: boolean; erro: string | null }>({ itens: [], buscando: false, erro: null })
  const [quantidadeTotal, setQuantidadeTotal] = useState("")
  const [condicao, setCondicao] = useState<"a_vista" | "a_prazo">("a_vista")
  const [vencimento, setVencimento] = useState("")
  const [fornecedorNome, setFornecedorNome] = useState("")
  const [numeroDocumento, setNumeroDocumento] = useState("")
  const [pending, setPending] = useState(false)
  /** Uma chave por submissão; mantida em nova tentativa (falha de rede / clique duplo) para o servidor deduplicar. */
  const operationRef = useRef<string | null>(null)
  const emVoo = useRef(false)

  const termoProdutoDeb = useDebounced(termoProduto)
  const termoTituloDeb = useDebounced(termoTitulo)

  useEffect(() => {
    if (origem !== "estoque") return
    const q = termoProdutoDeb.trim()
    if (!q) { setProdutos({ itens: [], buscando: false, erro: null }); return }
    const ac = new AbortController()
    setProdutos((p) => ({ ...p, buscando: true, erro: null }))
    buscarProdutos(storeId, q, ac.signal)
      .then((itens) => setProdutos({ itens, buscando: false, erro: null }))
      .catch((e: unknown) => { if (!ac.signal.aborted) setProdutos({ itens: [], buscando: false, erro: (e as Error).message }) })
    return () => ac.abort()
  }, [origem, termoProdutoDeb, storeId])

  useEffect(() => {
    if (origem !== "vinculo_financeiro") return
    const ac = new AbortController()
    setTitulos((p) => ({ ...p, buscando: true, erro: null }))
    apiComercial<{ titulos: TituloOrigem[] }>(storeId, `/origens/contas-pagar?q=${encodeURIComponent(termoTituloDeb.trim())}`, { signal: ac.signal })
      .then((r) => setTitulos({ itens: r.titulos, buscando: false, erro: null }))
      .catch((e: unknown) => { if (!ac.signal.aborted) setTitulos({ itens: [], buscando: false, erro: (e as Error).message }) })
    return () => ac.abort()
  }, [origem, termoTituloDeb, storeId])

  if (origens.length === 0) return null

  function trocarOrigem(o: CustoOrigem) {
    setOrigem(o)
    setCategoria(CATEGORIAS_POR_ORIGEM[o][0]!)
    setCustoStatus("conhecido")
    setValor("")
  }

  function limpar() {
    setDescricao(""); setQuantidade("1"); setCustoStatus("conhecido"); setValor(""); setJustificativa("")
    setProduto(null); setTermoProduto(""); setTitulo(null); setTermoTitulo(""); setQuantidadeTotal("")
    setCondicao("a_vista"); setVencimento(""); setFornecedorNome(""); setNumeroDocumento("")
  }

  const categorias = CATEGORIAS_POR_ORIGEM[origem]
  const qtd = Number(quantidade)
  const usaStatus = origem === "preexistente" || origem === "gerencial"
  const statusOpcoes: CustoStatus[] = origem === "preexistente" ? ["conhecido", "estimado", "desconhecido"] : ["conhecido", "estimado"]
  const usaValor = (origem === "preexistente" && custoStatus !== "desconhecido") || origem === "gerencial" || origem === "nova_compra"

  function montarCorpo(operationId: string): Record<string, unknown> | string {
    if (!Number.isInteger(qtd) || qtd < 1) return "Quantidade deve ser um número inteiro a partir de 1."
    const body: Record<string, unknown> = { operationId, origem, categoria, descricao: descricao.trim(), quantidade: qtd }
    if (usaValor) {
      const c = parseCentavos(valor)
      if (c === null) return "Valor inválido. Use o formato 1.234,56."
      body.valorCentavos = c
    }
    if (usaStatus) body.custoStatus = custoStatus
    switch (origem) {
      case "estoque":
        if (!produto) return "Selecione o produto do estoque."
        body.produtoId = produto.id
        break
      case "preexistente":
        body.justificativa = justificativa.trim()
        break
      case "vinculo_financeiro": {
        if (!titulo) return "Selecione a compra já registrada em Contas a Pagar."
        const of: Record<string, unknown> = { tipo: "conta_pagar", referenciaId: titulo.id }
        if (titulo.quantidadeTotal == null) {
          const qt = Number(quantidadeTotal)
          if (!Number.isInteger(qt) || qt < 1) return "Informe a quantidade total comprada neste título."
          of.quantidadeTotal = qt
        }
        body.origemFinanceira = of
        break
      }
      case "nova_compra":
        body.novaCompra = {
          condicao,
          ...(condicao === "a_prazo" ? { vencimento } : {}),
          fornecedorNome: fornecedorNome.trim(),
          numeroDocumento: numeroDocumento.trim(),
        }
        break
    }
    return body
  }

  async function enviar() {
    if (emVoo.current || bloqueio) return
    operationRef.current ??= novoOperationId()
    const body = montarCorpo(operationRef.current)
    if (typeof body === "string") { toast.error(body); return }
    emVoo.current = true
    setPending(true)
    try {
      const r = await apiComercial<{ replay?: boolean }>(storeId, `/aparelhos/${aparelhoId}/custos`, { method: "POST", body })
      operationRef.current = null
      toast.success(r.replay ? "Este custo já estava registrado." : origem === "nova_compra" ? "Custo aplicado e obrigação criada em Contas a Pagar." : "Custo aplicado.")
      limpar()
      onDone()
    } catch (e) {
      // Mesma chave já usada com conteúdo diferente: a 1ª tentativa foi gravada. Recarrega e começa outra.
      if (e instanceof ApiError && e.code === "OPERACAO_REUTILIZADA") { operationRef.current = null; onDone() }
      toast.error((e as Error).message)
    } finally {
      emVoo.current = false
      setPending(false)
    }
  }

  const previa = origem === "vinculo_financeiro" && titulo ? previaVinculo(titulo, qtd, Number(quantidadeTotal) || null) : null

  return (
    <form
      aria-label="Adicionar custo"
      className="min-w-0 space-y-3 rounded-xl border border-border p-4"
      onSubmit={(e) => { e.preventDefault(); void enviar() }}
    >
      <h4 className="text-sm font-semibold text-foreground">Adicionar custo</h4>
      {bloqueio && <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">{bloqueio}</p>}
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="min-w-0 space-y-1.5">
          <FieldLabel htmlFor="pc-origem" required>Origem</FieldLabel>
          <select id="pc-origem" className={inputCls} value={origem} onChange={(e) => trocarOrigem(e.target.value as CustoOrigem)}>
            {origens.map((o) => <option key={o} value={o}>{CUSTO_ORIGEM_LABEL[o]}</option>)}
          </select>
        </div>
        <div className="min-w-0 space-y-1.5">
          <FieldLabel htmlFor="pc-categoria" required>Categoria</FieldLabel>
          <select id="pc-categoria" className={inputCls} value={categoria} disabled={categorias.length === 1} onChange={(e) => setCategoria(e.target.value as CustoCategoria)}>
            {categorias.map((c) => <option key={c} value={c}>{categoriaCustoLabel(c)}</option>)}
          </select>
        </div>
      </div>
      <p data-testid="efeito-financeiro" className="flex min-w-0 items-start gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
        <Info aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0"><b className="font-medium text-foreground">Efeito financeiro: </b>{EFEITO_FINANCEIRO[origem]}</span>
      </p>

      {origem === "estoque" && (
        <div className="min-w-0 space-y-1.5">
          <FieldLabel htmlFor="pc-produto" required>Produto do estoque</FieldLabel>
          {produto ? (
            <div className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
              <span className="min-w-0 truncate">{produto.name} <span className="text-xs text-muted-foreground">· {produto.stock} un.</span></span>
              <Button type="button" size="sm" variant="ghost" onClick={() => setProduto(null)}><X className="mr-1 h-3.5 w-3.5" />Trocar</Button>
            </div>
          ) : (
            <>
              <div className="relative min-w-0">
                <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input id="pc-produto" className={cn(inputCls, "pl-8")} value={termoProduto} onChange={(e) => setTermoProduto(e.target.value)} placeholder="Nome, SKU ou código de barras" autoComplete="off" />
              </div>
              {produtos.buscando && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Buscando…</p>}
              {produtos.erro && <p role="alert" className="text-xs text-destructive">{produtos.erro}</p>}
              {!produtos.buscando && !produtos.erro && termoProdutoDeb.trim() && produtos.itens.length === 0 && <p className="text-xs text-muted-foreground">Nenhum produto encontrado.</p>}
              {produtos.itens.length > 0 && (
                <ul className="max-h-48 min-w-0 space-y-1 overflow-y-auto">
                  {produtos.itens.map((p) => (
                    <li key={p.id} className="min-w-0">
                      <button type="button" onClick={() => setProduto(p)} className="flex w-full min-w-0 items-center justify-between gap-2 rounded-md border border-transparent px-3 py-1.5 text-left text-sm hover:border-border hover:bg-accent">
                        <span className="min-w-0 truncate">{p.name} <span className="text-xs text-muted-foreground">{p.sku || p.barcode || ""}</span></span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{p.stock} un.</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          <p className="text-xs text-muted-foreground">O valor vem do custo médio histórico do produto (não é digitado). Produto sem custo médio entra como custo desconhecido.</p>
        </div>
      )}

      {origem === "vinculo_financeiro" && (
        <div className="min-w-0 space-y-1.5">
          <FieldLabel htmlFor="pc-titulo" required>Compra ou gasto já registrado (Contas a Pagar)</FieldLabel>
          {titulo ? (
            <div className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
              <span className="min-w-0 truncate">{titulo.descricao}{titulo.numeroDocumento ? ` · ${titulo.numeroDocumento}` : ""}</span>
              <Button type="button" size="sm" variant="ghost" onClick={() => setTitulo(null)}><X className="mr-1 h-3.5 w-3.5" />Trocar</Button>
            </div>
          ) : (
            <>
              <input id="pc-titulo" className={inputCls} value={termoTitulo} onChange={(e) => setTermoTitulo(e.target.value)} placeholder="Descrição ou nº do documento" autoComplete="off" />
              {titulos.buscando && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Carregando títulos…</p>}
              {titulos.erro && <p role="alert" className="text-xs text-destructive">{titulos.erro}</p>}
              {!titulos.buscando && !titulos.erro && titulos.itens.length === 0 && <p className="text-xs text-muted-foreground">Nenhum título elegível encontrado.</p>}
              {titulos.itens.length > 0 && (
                <ul className="max-h-56 min-w-0 space-y-1 overflow-y-auto">
                  {titulos.itens.map((t) => {
                    const r = restante(t)
                    const esgotado = r.valor <= 0 || r.qtd === 0
                    return (
                      <li key={t.id} className="min-w-0">
                        <button type="button" disabled={esgotado} onClick={() => setTitulo(t)} className="w-full min-w-0 rounded-md border border-border px-3 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50">
                          <span className="block min-w-0 truncate font-medium">{t.descricao}</span>
                          <span className="block min-w-0 truncate text-xs text-muted-foreground">
                            {[t.numeroDocumento, t.vencimento ? `venc. ${dataBr(t.vencimento)}` : null, t.status].filter(Boolean).join(" · ")}
                          </span>
                          <span className="block min-w-0 text-xs text-muted-foreground">
                            Total {formatCentavos(t.valorCentavos)} · disponível {formatCentavos(r.valor)}
                            {r.qtd != null ? ` · ${r.qtd} de ${t.quantidadeTotal} un. restantes` : " · quantidade total a informar"}
                            {esgotado ? " · esgotado" : ""}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          )}
          {titulo && titulo.quantidadeTotal == null && (
            <div className="min-w-0 space-y-1.5">
              <FieldLabel htmlFor="pc-qtd-total" required>Quantidade total comprada neste título</FieldLabel>
              <input id="pc-qtd-total" inputMode="numeric" className={inputCls} value={quantidadeTotal} onChange={(e) => setQuantidadeTotal(e.target.value.replace(/\D/g, ""))} placeholder="Ex.: 5 telas" />
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            O valor é proporcional à quantidade, até o limite do título.{previa != null ? ` Prévia: ${formatCentavos(previa)} (o servidor confirma).` : ""}
          </p>
        </div>
      )}

      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,8rem)]">
        <div className="min-w-0 space-y-1.5">
          <FieldLabel htmlFor="pc-descricao" required={origem !== "estoque" && origem !== "vinculo_financeiro"}>Descrição</FieldLabel>
          <input id="pc-descricao" className={inputCls} value={descricao} maxLength={160} onChange={(e) => setDescricao(e.target.value)}
            placeholder={origem === "gerencial" ? "Ex.: troca de tela (1 h)" : origem === "estoque" ? "Opcional — usa o nome do produto" : "Ex.: tela OLED"} />
        </div>
        <div className="min-w-0 space-y-1.5">
          <FieldLabel htmlFor="pc-quantidade" required>Quantidade</FieldLabel>
          <input id="pc-quantidade" inputMode="numeric" className={inputCls} value={quantidade} onChange={(e) => setQuantidade(e.target.value.replace(/\D/g, ""))} />
        </div>
      </div>

      {(usaStatus || usaValor) && (
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          {usaStatus && (
            <div className="min-w-0 space-y-1.5">
              <FieldLabel htmlFor="pc-status" required>Situação do custo</FieldLabel>
              <select id="pc-status" className={inputCls} value={custoStatus} onChange={(e) => setCustoStatus(e.target.value as CustoStatus)}>
                {statusOpcoes.map((s) => <option key={s} value={s}>{s === "conhecido" ? "Conhecido" : s === "estimado" ? "Estimado" : "Desconhecido (não vira zero)"}</option>)}
              </select>
            </div>
          )}
          {usaValor && (
            <div className="min-w-0 space-y-1.5">
              <FieldLabel htmlFor="pc-valor" required>Valor total (R$)</FieldLabel>
              <input id="pc-valor" inputMode="decimal" className={inputCls} value={valor} onChange={(e) => setValor(e.target.value)} placeholder="1.234,56" />
            </div>
          )}
        </div>
      )}

      {origem === "preexistente" && (
        <div className="min-w-0 space-y-1.5">
          <FieldLabel htmlFor="pc-justificativa" required>Justificativa (origem do material)</FieldLabel>
          <textarea id="pc-justificativa" rows={2} className={cn(inputCls, "h-auto py-2")} value={justificativa} maxLength={500} onChange={(e) => setJustificativa(e.target.value)}
            placeholder="Ex.: tela comprada em 2025, antes do sistema, paga em dinheiro" />
          <p className="text-xs text-muted-foreground">Mínimo de 10 caracteres.</p>
        </div>
      )}

      {origem === "nova_compra" && (
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="min-w-0 space-y-1.5">
            <FieldLabel htmlFor="pc-condicao" required>Condição</FieldLabel>
            <select id="pc-condicao" className={inputCls} value={condicao} onChange={(e) => setCondicao(e.target.value as "a_vista" | "a_prazo")}>
              <option value="a_vista">À vista (vence hoje)</option>
              <option value="a_prazo">A prazo</option>
            </select>
          </div>
          {condicao === "a_prazo" && (
            <div className="min-w-0 space-y-1.5">
              <FieldLabel htmlFor="pc-vencimento" required>Vencimento</FieldLabel>
              <input id="pc-vencimento" type="date" min={hojeKey()} className={inputCls} value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
            </div>
          )}
          <div className="min-w-0 space-y-1.5">
            <FieldLabel htmlFor="pc-fornecedor">Fornecedor</FieldLabel>
            <input id="pc-fornecedor" className={inputCls} value={fornecedorNome} maxLength={120} onChange={(e) => setFornecedorNome(e.target.value)} />
          </div>
          <div className="min-w-0 space-y-1.5">
            <FieldLabel htmlFor="pc-documento">Nº do documento</FieldLabel>
            <input id="pc-documento" className={inputCls} value={numeroDocumento} maxLength={60} onChange={(e) => setNumeroDocumento(e.target.value)} />
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !!bloqueio}>
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Aplicar custo
        </Button>
      </div>
    </form>
  )
}
