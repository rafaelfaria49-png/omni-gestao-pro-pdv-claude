"use client"

import { useCallback, useMemo, useState } from "react"
import {
  ShoppingCart,
  ArrowDownCircle,
  ArrowUpCircle,
  ArrowLeftRight,
  Undo2,
  Search,
  MoreVertical,
  Eye,
  EyeOff,
  Copy,
  Printer,
  History,
  Ban,
  Lock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { dataHoraConferencia, formaPagamentoLabel, numeroVendaCurto } from "@/lib/caixa/conferencia-format"
import {
  canalRecebimentoLabel,
  classificarRecebimentoCaixa,
  type ClassificacaoRecebimento,
} from "@/lib/caixa/recebimentos-sessao"
import type { SaleRecord } from "@/lib/operations-sale-types"
import type { VendaSessaoDetalheItem } from "@/app/api/ops/caixa/sessao-detalhe/route"
import type { CaixaOperacaoDetalhe } from "./use-caixa-resumo"
import { avaliarAcoesVenda, type AcaoVendaEstado } from "@/lib/caixa/conferencia-acoes"
import { mapVendaDetalheToCupom } from "@/lib/vendas/venda-cupom-mapper"
import type { VendaDetalhe } from "@/lib/vendas/venda-detalhe-contract"
import { ConferenciaVendaDetalhe } from "./conferencia-venda-detalhe"
import { ConferenciaEstornoDialog, type EstornoAlvo } from "./conferencia-estorno-dialog"
import { CupomNaoFiscal, type CupomData } from "@/components/dashboard/vendas/cupom-nao-fiscal"

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v)

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
  /** `Venda.fiscalStatus` — só em linha de venda vinda do servidor. */
  fiscalStatus?: string | null
  /** A venda existe no servidor (tem ficha, comprovante e estorno). */
  servidorConfirmada?: boolean
  /** Conta a receber da venda já quitada — bloqueia o estorno (007A). */
  recebivelQuitado?: boolean
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

/** Cor do ícone por categoria — tokens semânticos. Sangria é operação normal: sem vermelho. */
const CATEGORIA_TOM: Record<Categoria, string> = {
  venda: "text-muted-foreground",
  recebimento: "text-info",
  sangria: "text-muted-foreground",
  suprimento: "text-success",
  estorno: "text-destructive",
}

const STATUS_VENDA_LABEL: Record<string, string> = {
  cancelada: "Cancelada",
  parcialmente_devolvida: "Devolução parcial",
  devolvida: "Devolvida",
}

/** Origem dominante de UMA venda (singular; o bloco "Vendas da sessão" usa o plural). */
const ORIGEM_LABEL: Record<string, string> = {
  pdv: "PDV / Balcão",
  avulso: "Item avulso",
  os: "O.S. faturada no PDV",
}

/** Grade da lista: hora · cliente/forma · número · valor · ações (número some no mobile). */
const GRADE =
  "grid-cols-[3rem_minmax(0,1fr)_auto_2rem] sm:grid-cols-[4.25rem_minmax(0,1fr)_7rem_6.5rem_2rem]"

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
    fiscalStatus: v.fiscalStatus,
    servidorConfirmada: true,
    recebivelQuitado: v.recebivelQuitado,
    searchBlob: [v.numero, v.clienteNome, v.clienteCpf, v.formaPagamento, formaPagamentoLabel(v.formaPagamento), v.origem]
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
    // Fallback legado: a linha veio do store local, não do `sessao-detalhe`. Sem
    // confirmação do servidor não há ficha, comprovante nem estorno para oferecer.
    servidorConfirmada: false,
    searchBlob: [s.id, s.customerName, s.customerCpf].filter(Boolean).join(" ").toLowerCase(),
  }
}

/**
 * Rótulo de recebimento/estorno pela classificação do helper — só o que os dados gravados
 * sustentam: "Conta recebida · PDV (F5)", "O.S. recebida", "Estorno de recebimento · O.S.".
 * Sem canal determinável fica o genérico (nada de "Financeiro" presumido).
 */
function rotuloRecebimento(c: ClassificacaoRecebimento): string {
  const canal = canalRecebimentoLabel(c.canal)
  if (c.natureza === "estorno") return canal ? `Estorno de recebimento · ${canal}` : "Estorno de recebimento"
  if (c.origem === "os") return "O.S. recebida"
  return canal ? `Conta recebida · ${canal}` : "Conta recebida"
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
  const recebimento = classificarRecebimentoCaixa(op)
  const origemLabel = recebimento ? rotuloRecebimento(recebimento) : origem === "pdv" ? "PDV" : "Caixa"
  return {
    id: `op-${op.id}`,
    categoria,
    origemLabel,
    at: op.at,
    descricao: op.motivo?.trim() || CATEGORIA_LABEL[categoria],
    cliente: null,
    formaPagamento: forma,
    valor: op.valor,
    status: null,
    referencia: op.id.slice(0, 8),
    searchBlob: [op.motivo, op.operador, forma, formaPagamentoLabel(forma), origem, op.id]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
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

/**
 * Conferência do fechamento — GOAL CAIXA-CONFERENCIA-VENDAS-ACOES-REAIS-007.
 *
 * O menu ⋮ de cada venda deixou de mostrar "Em breve". Cada item ou está ligado a
 * backend REAL, ou aparece desabilitado com a razão REAL (`lib/caixa/conferencia-acoes.ts`):
 *
 *   consulta  · Ver detalhes / Histórico  → `GET /api/vendas/[id]?full=1` (read-only)
 *   documento · Reimprimir / Copiar       → `CupomNaoFiscal` (mesmo comprovante do Histórico)
 *   crítico   · Estornar venda            → `POST /api/vendas/[id]/cancelar`, com step-up
 *                                            de supervisor e motivo obrigatório
 *
 * Troca e Devolução parcial continuam DESABILITADAS aqui, e não por falta de backend:
 * o reembolso mexeria na gaveta que está sendo contada sem que o fechamento saiba
 * recalcular o esperado (a forma de pagamento do reembolso não é persistida). A razão
 * exibida diz isso e aponta o caminho real — Troca/Devolução no PDV.
 */
export function ConferenciaCaixa({
  vendasSessao,
  sessionSales,
  operacoesSessao,
  storeId,
  operador,
  loja,
  sessaoAberta = true,
  contagemIniciada = false,
  onDadosAlterados,
}: {
  vendasSessao: VendaSessaoDetalheItem[]
  sessionSales: SaleRecord[]
  operacoesSessao: CaixaOperacaoDetalhe[]
  /** Unidade ativa — obrigatória em toda leitura/escrita (multi-loja). */
  storeId: string
  /** Rótulo legível do operador da sessão — vai para a trilha do estorno. */
  operador: string
  /** Cabeçalho do comprovante reimpresso. */
  loja: { nome: string; cnpj?: string; endereco?: string }
  /** A sessão desta conferência ainda está aberta (§21). */
  sessaoAberta?: boolean
  /** O operador já digitou algum valor na contagem da gaveta (§23). */
  contagemIniciada?: boolean
  /** Disparado após uma operação REAL — o pai recarrega vendas, operações e resumo (§22). */
  onDadosAlterados?: () => void
}) {
  const { toast } = useToast()
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]["key"]>("todos")
  const [busca, setBusca] = useState("")
  const [detalheId, setDetalheId] = useState<string | null>(null)
  /** Ficha lateral da venda: número + aba inicial. `null` = fechada. */
  const [ficha, setFicha] = useState<{ numero: string; aba: "detalhes" | "historico" } | null>(null)
  const [estornoAlvo, setEstornoAlvo] = useState<EstornoAlvo | null>(null)
  const [cupom, setCupom] = useState<CupomData | null>(null)

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

  // Rodapé da conferência — soma do que está em vista (sangria/estorno negativos;
  // vendas canceladas ficam fora da soma, igual aos totais do fechamento).
  const { somaFiltradas, canceladasVista } = useMemo(() => {
    let soma = 0
    let canceladas = 0
    for (const l of filtradas) {
      if (l.categoria === "venda" && l.status === "cancelada") {
        canceladas += 1
        continue
      }
      const negativo = l.categoria === "sangria" || l.categoria === "estorno"
      soma += negativo ? -l.valor : l.valor
    }
    return { somaFiltradas: Math.round(soma * 100) / 100, canceladasVista: canceladas }
  }, [filtradas])

  // Contagem por filtro (sobre todas as linhas) — exibida nos chips para o operador
  // saber o que existe em cada categoria antes mesmo de filtrar.
  const contagens = useMemo(() => {
    const c: Record<(typeof FILTROS)[number]["key"], number> = {
      todos: linhas.length,
      venda: 0,
      recebimento: 0,
      sangria: 0,
      suprimento: 0,
      estorno: 0,
    }
    for (const l of linhas) {
      if (l.categoria === "sangria" || l.categoria === "suprimento") c.sangria += 1
      else c[l.categoria] += 1
    }
    return c
  }, [linhas])

  const copiarNumero = useCallback(
    async (numero: string) => {
      try {
        await navigator.clipboard.writeText(numero)
        toast({ title: "Número copiado", description: numero })
      } catch {
        toast({ title: "Erro", description: "Não foi possível copiar.", variant: "destructive" })
      }
    },
    [toast],
  )

  /**
   * Reimpressão: projeta o comprovante da venda ORIGINAL pelo mapeador ÚNICO
   * compartilhado com o Histórico de Vendas. Não recalcula nada e não toca na venda.
   */
  const abrirCupom = useCallback(
    (venda: VendaDetalhe) => {
      setCupom(mapVendaDetalheToCupom(venda, loja))
    },
    [loja],
  )

  /** Busca a venda e abre o comprovante — usado pelo item de menu (sem abrir a ficha). */
  const reimprimirPorNumero = useCallback(
    async (numero: string) => {
      try {
        const r = await fetch(`/api/vendas/${encodeURIComponent(numero)}`, {
          credentials: "include",
          headers: { "x-assistec-loja-id": storeId },
          cache: "no-store",
        })
        const j = (await r.json().catch(() => null)) as { ok?: boolean; venda?: VendaDetalhe } | null
        if (!r.ok || !j?.ok || !j.venda) {
          toast({
            title: "Comprovante indisponível",
            description: "Não foi possível carregar os dados desta venda.",
            variant: "destructive",
          })
          return
        }
        abrirCupom(j.venda)
      } catch {
        toast({
          title: "Erro",
          description: "Falha de conexão ao carregar o comprovante.",
          variant: "destructive",
        })
      }
    },
    [abrirCupom, storeId, toast],
  )

  const vazio = linhas.length === 0

  return (
    <div className="flex min-h-full min-w-0 flex-col xl:min-h-0 xl:flex-1">
      <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2 px-3 py-2.5 sm:px-4">
        <div
          role="group"
          aria-label="Filtrar lançamentos"
          className="inline-flex min-w-0 max-w-full flex-wrap gap-0.5 rounded-lg bg-secondary p-0.5"
        >
          {FILTROS.map((f) => {
            const n = contagens[f.key] ?? 0
            const ativo = filtro === f.key
            return (
              <button
                key={f.key}
                type="button"
                aria-pressed={ativo}
                onClick={() => setFiltro(f.key)}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  ativo ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {f.label}
                {n > 0 && <span className="text-[10px] tabular-nums opacity-70">{n}</span>}
              </button>
            )
          })}
        </div>
        <div className="relative min-w-0 flex-1 basis-48">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar cliente, número ou forma de pagamento"
            aria-label="Buscar lançamentos"
            className="h-8 bg-background pl-8"
          />
        </div>
      </div>

      {vazio ? (
        <p className="mx-3 mb-3 rounded-lg border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground sm:mx-4">
          Sem operações de caixa nesta sessão.
        </p>
      ) : filtradas.length === 0 ? (
        <p className="mx-3 mb-3 rounded-lg border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground sm:mx-4">
          {filtro === "venda"
            ? "Sem vendas nesta sessão."
            : filtro === "recebimento"
              ? "Sem recebimentos nesta sessão."
              : "Nenhum resultado para esse filtro/busca."}
        </p>
      ) : (
        <>
          {/* No xl só a lista rola (cabeçalho de colunas junto, alinhado às linhas). O rodapé de soma
              fica fora da área rolável: nenhuma linha passa por baixo dele. */}
          <div className="flex min-w-0 flex-1 flex-col xl:min-h-0 xl:overflow-y-auto">
            <div
              aria-hidden
              className={cn(
                "sticky top-0 z-[1] hidden items-center gap-3 border-y border-border bg-card px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:grid",
                GRADE,
              )}
            >
              <span>Hora</span>
              <span>Cliente · forma</span>
              <span>Venda</span>
              <span className="text-right">Valor</span>
              <span />
            </div>
            <ul className="flex-1 border-t border-border sm:border-t-0">
              {filtradas.map((l) => {
                const venda = l.categoria === "venda"
                const negativo = l.categoria === "sangria" || l.categoria === "estorno"
                const cancelada = venda && l.status === "cancelada"
                const dh = dataHoraConferencia(l.at)
                const forma = formaPagamentoLabel(l.formaPagamento)
                const numeroCurto = venda ? numeroVendaCurto(l.referencia) : `#${l.referencia}`
                const statusLabel =
                  venda && l.status && l.status !== "concluida" ? (STATUS_VENDA_LABEL[l.status] ?? l.status) : null
                // Recebimento/estorno: o título diz o que foi recebido e por onde (quando os dados
                // determinam); o motivo gravado segue como subtítulo.
                const recebimentoOuEstorno = l.categoria === "recebimento" || l.categoria === "estorno"
                const titulo = venda
                  ? (l.cliente ?? "Cliente não identificado")
                  : recebimentoOuEstorno
                    ? l.origemLabel
                    : CATEGORIA_LABEL[l.categoria]
                const sub = venda
                  ? l.origemLabel
                  : l.descricao !== CATEGORIA_LABEL[l.categoria]
                    ? l.descricao
                    : recebimentoOuEstorno
                      ? ""
                      : l.origemLabel
                const detalheAberto = detalheId === l.id
                const Icon = CATEGORIA_ICON[l.categoria]
                // Estado do menu ⋮ derivado dos dados da linha — nunca de `useState`.
                const acoes = venda
                  ? avaliarAcoesVenda({
                      status: l.status,
                      fiscalStatus: l.fiscalStatus,
                      servidorConfirmada: l.servidorConfirmada === true,
                      recebivelQuitado: l.recebivelQuitado === true,
                      sessaoAberta,
                    })
                  : null
                return (
                  <li key={l.id} className="border-b border-border/60 last:border-b-0">
                    <div
                      className={cn(
                        "grid min-h-12 items-center gap-2.5 px-3 py-1.5 transition-colors hover:bg-secondary/50 sm:gap-3 sm:px-4",
                        GRADE,
                        detalheAberto && "bg-secondary/60",
                      )}
                    >
                      <div className="min-w-0 leading-tight tabular-nums">
                        <p className={cn("text-sm font-semibold", cancelada ? "text-muted-foreground" : "text-foreground")}>
                          {dh?.hora ?? "--:--"}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {dh ? (
                            <>
                              <span className="sm:hidden">{dh.data.slice(0, 5)}</span>
                              <span className="hidden sm:inline">{dh.data}</span>
                            </>
                          ) : (
                            "—"
                          )}
                        </p>
                      </div>
                      <div className="min-w-0 leading-tight">
                        <p
                          className={cn(
                            "flex min-w-0 items-center gap-1.5 text-sm",
                            venda && !l.cliente
                              ? "font-medium text-muted-foreground"
                              : cancelada
                                ? "font-semibold text-muted-foreground"
                                : "font-semibold text-foreground",
                          )}
                        >
                          {!venda && <Icon aria-hidden className={cn("h-3.5 w-3.5 shrink-0", CATEGORIA_TOM[l.categoria])} />}
                          <span className="truncate">{titulo}</span>
                        </p>
                        <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                          {forma && (
                            <span className="shrink-0 rounded bg-secondary px-1.5 py-px font-semibold text-foreground">
                              {forma}
                            </span>
                          )}
                          <span className="truncate">{sub}</span>
                          {statusLabel && (
                            <span className="shrink-0 rounded border border-warning/50 bg-warning/15 px-1 text-[10px] font-semibold uppercase tracking-wide text-foreground">
                              {statusLabel}
                            </span>
                          )}
                          <span className="shrink-0 tabular-nums sm:hidden">· {numeroCurto}</span>
                        </p>
                      </div>
                      <p
                        className={cn(
                          "hidden truncate text-xs tabular-nums text-muted-foreground sm:block",
                          venda ? "font-semibold" : "font-normal",
                        )}
                        title={l.referencia}
                      >
                        {venda ? `Venda ${numeroCurto}` : `Operação ${numeroCurto}`}
                      </p>
                      <p
                        className={cn(
                          "whitespace-nowrap text-right font-display text-sm font-bold tabular-nums",
                          cancelada
                            ? "font-medium text-muted-foreground line-through"
                            : l.categoria === "estorno"
                              ? "text-destructive"
                              : "text-foreground",
                        )}
                      >
                        {negativo ? "− " : ""}
                        {fmt(l.valor)}
                      </p>
                      <div className="flex justify-end">
                        {venda && acoes && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Ações da venda ${numeroCurto}`}
                                className="text-muted-foreground hover:text-foreground data-[state=open]:bg-secondary data-[state=open]:text-foreground"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-72">
                              <DropdownMenuLabel className="flex min-w-0 flex-col gap-0.5">
                                <span className="text-sm font-semibold text-foreground">Venda {numeroCurto}</span>
                                <span className="truncate font-mono text-[11px] font-normal text-muted-foreground">
                                  {l.referencia}
                                </span>
                              </DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuGroup>
                                <DropdownMenuLabel className="py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  Ver
                                </DropdownMenuLabel>
                                <AcaoItem
                                  estado={acoes.detalhes}
                                  icone={<Eye />}
                                  rotulo="Ver detalhes"
                                  onSelect={() => setFicha({ numero: l.referencia, aba: "detalhes" })}
                                />
                                <AcaoItem
                                  estado={acoes.historico}
                                  icone={<History />}
                                  rotulo="Histórico da venda"
                                  onSelect={() => setFicha({ numero: l.referencia, aba: "historico" })}
                                />
                              </DropdownMenuGroup>
                              <DropdownMenuSeparator />
                              <DropdownMenuGroup>
                                <DropdownMenuLabel className="py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  Documento
                                </DropdownMenuLabel>
                                <AcaoItem
                                  estado={acoes.reimprimir}
                                  icone={<Printer />}
                                  rotulo="Reimprimir comprovante"
                                  onSelect={() => void reimprimirPorNumero(l.referencia)}
                                />
                                <AcaoItem
                                  estado={acoes.copiar}
                                  icone={<Copy />}
                                  rotulo="Copiar número da venda"
                                  onSelect={() => void copiarNumero(l.referencia)}
                                />
                              </DropdownMenuGroup>
                              <DropdownMenuSeparator />
                              <DropdownMenuGroup>
                                <DropdownMenuLabel className="py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  Pós-venda
                                </DropdownMenuLabel>
                                <AcaoItem
                                  estado={acoes.troca}
                                  icone={<ArrowLeftRight />}
                                  rotulo="Trocar produtos"
                                />
                                <AcaoItem
                                  estado={acoes.devolucao}
                                  icone={<Undo2 />}
                                  rotulo="Devolução parcial"
                                />
                              </DropdownMenuGroup>
                              <DropdownMenuSeparator />
                              <DropdownMenuLabel className="py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Crítico
                              </DropdownMenuLabel>
                              <AcaoItem
                                estado={acoes.estorno}
                                icone={<Ban />}
                                rotulo="Estornar venda"
                                destrutiva
                                atalho="PIN"
                                onSelect={() =>
                                  setEstornoAlvo({
                                    numero: l.referencia,
                                    valor: l.valor,
                                    cliente: l.cliente,
                                    formaPagamento: forma,
                                  })
                                }
                              />
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>
                    {detalheAberto && (
                      <dl className="mx-3 mb-2 grid grid-cols-2 gap-x-4 gap-y-2 rounded-md bg-secondary px-3 py-2 sm:mx-4 sm:ml-[5.5rem] sm:grid-cols-4">
                        <DetalheItem rotulo="Número" valor={l.referencia} mono />
                        <DetalheItem rotulo="Data e hora" valor={dh ? `${dh.data} às ${dh.hora}` : "—"} />
                        <DetalheItem rotulo="Pagamento" valor={forma ?? "—"} />
                        <DetalheItem rotulo="Origem · status" valor={`${l.origemLabel} · ${statusLabel ?? "Concluída"}`} />
                      </dl>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border bg-card px-3 py-2 sm:px-4">
            <span className="text-xs text-muted-foreground">
              {filtradas.length} lançamento(s)
              {canceladasVista > 0 ? ` · ${canceladasVista} cancelada(s) fora da soma` : ""}
            </span>
            {filtro === "todos" ? (
              // "Todos" mistura venda (competência) com caixa: somar os dois inventaria um total.
              <span className="text-[11px] text-muted-foreground">Filtre uma categoria para ver a soma</span>
            ) : (
              <span className="text-sm text-muted-foreground">
                {filtro === "venda"
                  ? "Soma das vendas"
                  : filtro === "recebimento"
                    ? "Soma dos recebimentos"
                    : filtro === "estorno"
                      ? "Soma dos estornos"
                      : "Suprimentos − sangrias"}{" "}
                <span className="font-display font-bold tabular-nums text-foreground">{fmt(somaFiltradas)}</span>
              </span>
            )}
          </div>
        </>
      )}

      {/* ── Ficha da venda (detalhes + histórico) — somente leitura ───────────── */}
      <ConferenciaVendaDetalhe
        numeroVenda={ficha?.numero ?? null}
        aba={ficha?.aba ?? "detalhes"}
        storeId={storeId}
        onOpenChange={(open) => {
          if (!open) setFicha(null)
        }}
        onCopiarNumero={(n) => void copiarNumero(n)}
        onReimprimir={abrirCupom}
      />

      {/* ── Reimpressão do comprovante — mesmo componente do Histórico de Vendas ── */}
      {cupom && (
        <CupomNaoFiscal isOpen={!!cupom} onClose={() => setCupom(null)} data={cupom} />
      )}

      {/* ── Estorno: step-up de supervisor + motivo obrigatório ──────────────── */}
      <ConferenciaEstornoDialog
        alvo={estornoAlvo}
        storeId={storeId}
        operador={operador}
        contagemIniciada={contagemIniciada}
        onOpenChange={(open) => {
          if (!open) setEstornoAlvo(null)
        }}
        onEstornada={({ numero, autorizadoPor }) => {
          setEstornoAlvo(null)
          toast({
            title: "Venda estornada",
            description: `${numero} · autorizado por ${autorizadoPor}. Os valores esperados do caixa foram recalculados.`,
          })
          // §22 — recarrega vendas, operações e resumo sem fechar o Fechamento.
          onDadosAlterados?.()
        }}
      />
    </div>
  )
}

/**
 * Item do menu ⋮ governado por `avaliarAcoesVenda`.
 *
 * Desabilitado NUNCA some: fica visível com a razão real embaixo do rótulo (§26). O
 * `title` repete a razão para quem navega por teclado/leitor de tela, já que
 * `DropdownMenuItem` desabilitado não recebe foco.
 */
function AcaoItem({
  estado,
  icone,
  rotulo,
  onSelect,
  destrutiva = false,
  atalho,
}: {
  estado: AcaoVendaEstado
  icone: React.ReactNode
  rotulo: string
  onSelect?: () => void
  destrutiva?: boolean
  atalho?: string
}) {
  if (!estado.habilitada) {
    return (
      <DropdownMenuItem disabled className="items-start" title={estado.motivo}>
        <Lock />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span>{rotulo}</span>
          <span className="whitespace-normal text-[10px] leading-snug text-muted-foreground">
            {estado.motivo}
          </span>
        </span>
      </DropdownMenuItem>
    )
  }
  return (
    <DropdownMenuItem onSelect={onSelect} {...(destrutiva ? { variant: "destructive" as const } : {})}>
      {icone}
      {rotulo}
      {atalho ? (
        <DropdownMenuShortcut className="tracking-normal">{atalho}</DropdownMenuShortcut>
      ) : null}
    </DropdownMenuItem>
  )
}

function DetalheItem({ rotulo, valor, mono = false }: { rotulo: string; valor: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{rotulo}</dt>
      <dd
        className={cn("truncate text-xs font-medium text-foreground", mono && "font-mono text-[11px]")}
        title={valor}
      >
        {valor}
      </dd>
    </div>
  )
}
