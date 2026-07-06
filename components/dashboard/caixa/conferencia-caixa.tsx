"use client"

import { useMemo, useState } from "react"
import { ShoppingCart, ArrowDownCircle, ArrowUpCircle, Undo2, Search } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { SaleRecord } from "@/lib/operations-sale-types"
import type { VendaSessaoDetalheItem } from "@/app/api/ops/caixa/sessao-detalhe/route"
import type { CaixaOperacaoDetalhe } from "./use-caixa-resumo"

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v)

function horaCurta(at: string): string {
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return "--:--"
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
}

type Categoria = "venda" | "recebimento" | "sangria" | "suprimento" | "estorno"

/** Linha unificada da Conferência — venda ou operação de caixa, normalizadas para exibição. */
interface LinhaConferencia {
  id: string
  categoria: Categoria
  origemLabel: string
  at: string
  descricao: string
  cliente: string | null
  formaPagamento: string | null
  valor: number
  status: string | null
  referencia: string
  searchBlob: string
}

const CATEGORIA_LABEL: Record<Categoria, string> = {
  venda: "Venda",
  recebimento: "Recebimento",
  sangria: "Sangria",
  suprimento: "Suprimento",
  estorno: "Estorno",
}

const CATEGORIA_ICON: Record<Categoria, typeof ShoppingCart> = {
  venda: ShoppingCart,
  recebimento: ArrowDownCircle,
  sangria: ArrowUpCircle,
  suprimento: ArrowDownCircle,
  estorno: Undo2,
}

const CATEGORIA_COLOR: Record<Categoria, string> = {
  venda: "text-primary",
  recebimento: "text-violet-500",
  sangria: "text-rose-500",
  suprimento: "text-emerald-500",
  estorno: "text-amber-500",
}

const ORIGEM_LABEL: Record<string, string> = {
  pdv: "PDV / Balcão",
  avulso: "Item Avulso",
  os: "O.S. / Assistência",
}

function readPayloadString(payload: unknown, key: string): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null
  const v = (payload as Record<string, unknown>)[key]
  return typeof v === "string" && v.trim() ? v.trim() : null
}

function linhaDeVenda(v: VendaSessaoDetalheItem): LinhaConferencia {
  return {
    id: `venda-${v.id}`,
    categoria: "venda",
    origemLabel: ORIGEM_LABEL[v.origem] ?? "PDV / Balcão",
    at: v.createdAt,
    descricao: `Venda ${v.numero}`,
    cliente: v.clienteNome,
    formaPagamento: v.formaPagamento,
    valor: v.total,
    status: v.status,
    referencia: v.numero,
    searchBlob: [v.numero, v.clienteNome, v.clienteCpf, v.formaPagamento, v.origem]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
  }
}

/** Fallback para sessões legadas sem match no `sessao-detalhe` (vendas ainda vêm do client store). */
function linhaDeSaleRecord(s: SaleRecord): LinhaConferencia {
  return {
    id: `venda-legado-${s.id}`,
    categoria: "venda",
    origemLabel: "PDV / Balcão",
    at: s.at,
    descricao: `Venda ${s.id}`,
    cliente: s.customerName ?? null,
    formaPagamento: null,
    valor: s.total,
    status: s.status ?? "concluida",
    referencia: s.id,
    searchBlob: [s.id, s.customerName, s.customerCpf].filter(Boolean).join(" ").toLowerCase(),
  }
}

function linhaDeOperacao(op: CaixaOperacaoDetalhe): LinhaConferencia | null {
  const tipo = (op.tipo || "").trim().toLowerCase()
  const categoria: Categoria | null =
    tipo === "sangria"
      ? "sangria"
      : tipo === "suprimento"
        ? "suprimento"
        : tipo === "recebimento_cr"
          ? "recebimento"
          : tipo === "estorno_recebimento_cr"
            ? "estorno"
            : null
  if (!categoria) return null
  const forma = readPayloadString(op.payload, "formaPagamento")
  const origem = readPayloadString(op.payload, "origem")
  return {
    id: `op-${op.id}`,
    categoria,
    origemLabel: origem === "operacoes-v3-os" ? "O.S. / Assistência" : origem === "pdv" ? "PDV" : "Financeiro",
    at: op.at,
    descricao: op.motivo?.trim() || CATEGORIA_LABEL[categoria],
    cliente: null,
    formaPagamento: forma,
    valor: op.valor,
    status: null,
    referencia: op.id.slice(0, 8),
    searchBlob: [op.motivo, op.operador, forma, origem, op.id].filter(Boolean).join(" ").toLowerCase(),
  }
}

const FILTROS: Array<{ key: "todos" | Categoria; label: string }> = [
  { key: "todos", label: "Todos" },
  { key: "venda", label: "Vendas" },
  { key: "recebimento", label: "Recebimentos" },
  { key: "sangria", label: "Sangrias/Suprimentos" },
  { key: "estorno", label: "Estornos" },
]

function pertenceAoFiltro(linha: LinhaConferencia, filtro: (typeof FILTROS)[number]["key"]): boolean {
  if (filtro === "todos") return true
  if (filtro === "sangria") return linha.categoria === "sangria" || linha.categoria === "suprimento"
  return linha.categoria === filtro
}

export function ConferenciaCaixa({
  vendasSessao,
  sessionSales,
  operacoesSessao,
}: {
  vendasSessao: VendaSessaoDetalheItem[]
  sessionSales: SaleRecord[]
  operacoesSessao: CaixaOperacaoDetalhe[]
}) {
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]["key"]>("todos")
  const [busca, setBusca] = useState("")

  const linhas = useMemo<LinhaConferencia[]>(() => {
    const vendas =
      vendasSessao.length > 0
        ? vendasSessao.map(linhaDeVenda)
        : sessionSales.map(linhaDeSaleRecord)
    const operacoes = operacoesSessao
      .map(linhaDeOperacao)
      .filter((l): l is LinhaConferencia => l !== null)
    return [...vendas, ...operacoes].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
  }, [vendasSessao, sessionSales, operacoesSessao])

  const filtradas = useMemo(() => {
    const buscaTrim = busca.trim().toLowerCase()
    return linhas
      .filter((l) => pertenceAoFiltro(l, filtro))
      .filter((l) => !buscaTrim || l.searchBlob.includes(buscaTrim))
  }, [linhas, filtro, busca])

  const vazio = linhas.length === 0

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Dados de conferência carregados do detalhe da sessão. Confira tudo antes de fechar o caixa — esta
        aba é apenas consulta, não altera nenhum valor.
      </p>

      <div className="flex flex-wrap gap-1.5">
        {FILTROS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFiltro(f.key)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              filtro === f.key
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-secondary text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por cliente, número, forma ou descrição..."
          className="h-9 bg-secondary border-border pl-9 text-sm"
        />
      </div>

      {vazio ? (
        <p className="rounded-lg border border-border bg-secondary/50 px-3 py-6 text-center text-sm text-muted-foreground">
          Sem operações de caixa nesta sessão.
        </p>
      ) : filtradas.length === 0 ? (
        <p className="rounded-lg border border-border bg-secondary/50 px-3 py-6 text-center text-sm text-muted-foreground">
          {filtro === "venda"
            ? "Sem vendas nesta sessão."
            : filtro === "recebimento"
              ? "Sem recebimentos nesta sessão."
              : "Nenhum resultado para esse filtro/busca."}
        </p>
      ) : (
        <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
          {filtradas.map((l) => {
            const Icon = CATEGORIA_ICON[l.categoria]
            const negativo = l.categoria === "sangria" || l.categoria === "estorno"
            return (
              <Card key={l.id} className="border-border bg-secondary">
                <CardContent className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
                  <Icon className={cn("h-4 w-4 shrink-0", CATEGORIA_COLOR[l.categoria])} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-xs font-medium text-foreground">
                        {CATEGORIA_LABEL[l.categoria]}
                      </span>
                      <span className="text-[11px] text-muted-foreground">· {l.origemLabel}</span>
                      <span className="text-[11px] text-muted-foreground">· {horaCurta(l.at)}</span>
                      {l.status && l.status !== "concluida" && (
                        <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                          {l.status}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {l.descricao}
                      {l.cliente ? ` · ${l.cliente}` : ""}
                      {l.formaPagamento ? ` · ${l.formaPagamento}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={cn(
                        "text-sm font-semibold",
                        negativo ? "text-rose-500" : "text-foreground",
                      )}
                    >
                      {negativo ? "- " : ""}
                      {fmt(l.valor)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">#{l.referencia}</p>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
