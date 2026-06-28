"use client"

/**
 * INVENTARIO-CADASTRO-RAPIDO-COM-PENDENCIAS-001 — modal de "Cadastrar rápido" para um código
 * bipado SEM produto no catálogo. Formulário OPERACIONAL enxuto: EAN (prefixado/editável), nome,
 * categoria, quantidade contada, preço de venda (obrigatório), custo/SKU/observação opcionais.
 *
 * Fiscal NÃO é pedido aqui (NCM/CEST/CFOP/origem ficam para Cadastros). O modal é "burro": valida
 * o mínimo e devolve os dados ao pai via `onConfirmar` — quem cria o produto + fecha a pendência é
 * o componente do Inventário (reuso do `POST /api/produtos` e das actions de vínculo/contagem).
 */

import { useEffect, useMemo, useRef, useState } from "react"
import { Minus, Plus, Package, Loader2, Barcode } from "lucide-react"
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
import { Textarea } from "@/components/ui/textarea"
import { ASSISTEC_LOJA_HEADER } from "@/lib/assistec-headers"
import {
  validarCadastroRapido,
  type CadastroRapidoForm,
} from "@/lib/estoque/inventario-cadastro-rapido"

export type InventarioCadastroRapidoModalProps = {
  open: boolean
  storeId: string
  /** EAN/código bipado da pendência (prefil do campo "Código de barras"). */
  codigoBipado: string
  /** Quantidade observada na pendência (prefil de "Quantidade contada"). */
  quantidadeInicial: number
  /** Nome rápido informado na pendência (prefil opcional do nome). */
  nomeInicial?: string | null
  salvando: boolean
  onConfirmar: (form: CadastroRapidoForm) => void
  onCancelar: () => void
  /** Atalho opcional para o cadastro completo (Cadastros) — preserva a via fiscal. */
  onAbrirCadastroCompleto?: () => void
}

export function InventarioCadastroRapidoModal({
  open,
  storeId,
  codigoBipado,
  quantidadeInicial,
  nomeInicial,
  salvando,
  onConfirmar,
  onCancelar,
  onAbrirCadastroCompleto,
}: InventarioCadastroRapidoModalProps) {
  const [barcode, setBarcode] = useState("")
  const [nome, setNome] = useState("")
  const [categoria, setCategoria] = useState("")
  const [quantidade, setQuantidade] = useState(1)
  const [precoVenda, setPrecoVenda] = useState<string>("")
  const [precoCusto, setPrecoCusto] = useState<string>("")
  const [sku, setSku] = useState("")
  const [observacao, setObservacao] = useState("")
  const [categoriasSugeridas, setCategoriasSugeridas] = useState<string[]>([])
  const nomeRef = useRef<HTMLInputElement>(null)

  // Reseta o formulário a cada abertura com o contexto da pendência.
  useEffect(() => {
    if (!open) return
    setBarcode(codigoBipado)
    setNome((nomeInicial ?? "").trim())
    setCategoria("")
    setQuantidade(Math.max(1, Math.trunc(quantidadeInicial) || 1))
    setPrecoVenda("")
    setPrecoCusto("")
    setSku("")
    setObservacao("")
    requestAnimationFrame(() => nomeRef.current?.focus())
  }, [open, codigoBipado, quantidadeInicial, nomeInicial])

  // Datalist de categorias (somente leitura) — mesma fonte do Cadastro de Produtos.
  useEffect(() => {
    if (!open || !storeId) return
    let cancelado = false
    void (async () => {
      try {
        const q = `?lojaId=${encodeURIComponent(storeId)}`
        const res = await fetch(`/api/ops/categorias-produto${q}`, {
          credentials: "include",
          headers: { [ASSISTEC_LOJA_HEADER]: storeId },
          cache: "no-store",
        })
        if (!res.ok || cancelado) return
        const data = (await res.json().catch(() => null)) as { items?: Array<{ nome?: string; slug?: string }> } | null
        if (cancelado) return
        const nomes = (data?.items ?? [])
          .map((i) => (i.nome || i.slug || "").trim())
          .filter(Boolean)
        setCategoriasSugeridas(Array.from(new Set(nomes)).slice(0, 50))
      } catch {
        /* datalist é só conveniência — silencioso */
      }
    })()
    return () => {
      cancelado = true
    }
  }, [open, storeId])

  const ajustar = (delta: number) => setQuantidade((q) => Math.max(1, q + delta))

  const form = useMemo<CadastroRapidoForm>(
    () => ({
      barcode: barcode.trim(),
      nome: nome.trim(),
      categoria: categoria.trim() || null,
      quantidade: Math.max(1, Math.trunc(quantidade) || 1),
      precoVenda: parseFloat(precoVenda.replace(",", ".")) || 0,
      precoCusto: precoCusto.trim() ? parseFloat(precoCusto.replace(",", ".")) || 0 : null,
      sku: sku.trim() || null,
      observacao: observacao.trim() || null,
    }),
    [barcode, nome, categoria, quantidade, precoVenda, precoCusto, sku, observacao],
  )

  const validacao = validarCadastroRapido(form)

  const handleConfirmar = () => {
    if (salvando || !validacao.ok) return
    onConfirmar(form)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !salvando && onCancelar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            Cadastrar rápido
          </DialogTitle>
          <DialogDescription>
            Produto não encontrado no catálogo. O cadastro rápido salva apenas os dados
            operacionais — fiscal (NCM/CEST/CFOP) pode ser completado depois em Cadastros.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 py-1 sm:grid-cols-2">
          {/* Código de barras (EAN) */}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cr-barcode">Código de barras (EAN/GTIN)</Label>
            <div className="relative">
              <Barcode className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="cr-barcode"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="Bipe ou digite o EAN/GTIN"
                inputMode="numeric"
                disabled={salvando}
                className="pl-9 font-mono"
                autoComplete="off"
              />
            </div>
          </div>

          {/* Nome */}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cr-nome">Nome do produto</Label>
            <Input
              id="cr-nome"
              ref={nomeRef}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Capinha iPhone 13 transparente"
              disabled={salvando}
              autoComplete="off"
            />
          </div>

          {/* Categoria */}
          <div className="space-y-1.5">
            <Label htmlFor="cr-categoria">
              Categoria <span className="font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="cr-categoria"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              placeholder="Ex.: Acessórios"
              list="cr-categorias"
              disabled={salvando}
              autoComplete="off"
            />
            <datalist id="cr-categorias">
              {categoriasSugeridas.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          {/* Quantidade contada */}
          <div className="space-y-1.5">
            <Label htmlFor="cr-qtd">Quantidade contada</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => ajustar(-1)}
                disabled={salvando || quantidade <= 1}
                aria-label="Diminuir quantidade"
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Input
                id="cr-qtd"
                type="number"
                inputMode="numeric"
                min={1}
                value={quantidade}
                onChange={(e) => setQuantidade(Math.max(1, Math.trunc(Number(e.target.value)) || 1))}
                disabled={salvando}
                className="text-center tabular-nums"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => ajustar(1)}
                disabled={salvando}
                aria-label="Aumentar quantidade"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Preço de venda */}
          <div className="space-y-1.5">
            <Label htmlFor="cr-venda">Preço de venda (R$)</Label>
            <Input
              id="cr-venda"
              type="number"
              step="0.01"
              min={0}
              value={precoVenda}
              onChange={(e) => setPrecoVenda(e.target.value)}
              placeholder="0,00"
              disabled={salvando}
              className="tabular-nums"
            />
          </div>

          {/* Preço de custo */}
          <div className="space-y-1.5">
            <Label htmlFor="cr-custo">
              Preço de custo (R$) <span className="font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="cr-custo"
              type="number"
              step="0.01"
              min={0}
              value={precoCusto}
              onChange={(e) => setPrecoCusto(e.target.value)}
              placeholder="0,00"
              disabled={salvando}
              className="tabular-nums"
            />
          </div>

          {/* SKU */}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cr-sku">
              SKU / Código interno <span className="font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="cr-sku"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="Ex.: ALI-001, REF-FORNECEDOR"
              disabled={salvando}
              autoComplete="off"
            />
          </div>

          {/* Observação */}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cr-obs">
              Observação <span className="font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <Textarea
              id="cr-obs"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Anotação livre para identificar/conferir depois"
              rows={2}
              disabled={salvando}
              className="resize-y"
            />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          O produto entra com estoque igual à quantidade contada e fica marcado como cadastro
          incompleto (fiscal pendente) para revisar depois em Cadastros.
        </p>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {onAbrirCadastroCompleto ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="sm:mr-auto"
              onClick={onAbrirCadastroCompleto}
              disabled={salvando}
            >
              Abrir cadastro completo
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onCancelar} disabled={salvando}>
              Cancelar
            </Button>
            <Button type="button" className="gap-2" onClick={handleConfirmar} disabled={salvando || !validacao.ok}>
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
              Cadastrar e vincular
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
