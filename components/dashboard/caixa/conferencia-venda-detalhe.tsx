"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Loader2,
  Copy,
  Printer,
  FileText,
  History,
  AlertTriangle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { sanitizeOperatorLabel } from "@/lib/pdv-operator-label"
import {
  vendaDetalheUrl,
  type VendaDetalhe,
} from "@/lib/vendas/venda-detalhe-contract"
import { SEM_REGISTRO, buildVendaTimeline, type VendaEvento } from "@/lib/vendas/venda-timeline"

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v)

function fmtDataHora(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const STATUS_LABEL: Record<string, string> = {
  concluida: "Concluída",
  cancelada: "Estornada",
  parcialmente_devolvida: "Devolução parcial",
  devolvida: "Devolvida",
}

/** Tom semântico de domínio por evento da timeline (documentado em CORE_RULES §7). */
const EVENTO_TOM: Record<VendaEvento["tipo"], string> = {
  venda_criada: "bg-primary",
  pagamento: "bg-success",
  titulo_gerado: "bg-info",
  recebimento: "bg-success",
  devolucao: "bg-warning",
  troca: "bg-warning",
  vale_gerado: "bg-info",
  correcao: "bg-warning",
  estorno_financeiro: "bg-destructive",
  cancelamento: "bg-destructive",
}

/**
 * Ficha da venda dentro do Fechamento — GOAL CAIXA-CONFERENCIA-VENDAS-ACOES-REAIS-007
 * (§3 detalhes · §6 histórico).
 *
 * SOMENTE LEITURA. Consome `GET /api/vendas/[id]?full=1`, a mesma rota que o Histórico
 * de Vendas já usa: nenhum endpoint novo, nenhuma mutação, nenhum dado reconstruído no
 * cliente. Campo que a venda não registrou aparece como "—" ou com o aviso honesto de
 * ausência — nunca preenchido por estimativa.
 *
 * Abre em `Sheet` lateral de propósito: o operador continua no Fechamento, com a
 * contagem da gaveta preservada atrás do painel (§22 — não exige sair do PDV).
 */
export function ConferenciaVendaDetalhe({
  numeroVenda,
  storeId,
  aba,
  onOpenChange,
  onCopiarNumero,
  onReimprimir,
}: {
  /** `pedidoId` da venda. `null` mantém o painel fechado. */
  numeroVenda: string | null
  storeId: string
  /** Aba inicial — o menu ⋮ abre direto em "detalhes" ou em "historico". */
  aba: "detalhes" | "historico"
  onOpenChange: (open: boolean) => void
  onCopiarNumero: (numero: string) => void
  /** Recebe a venda já carregada — evita um segundo GET só para imprimir. */
  onReimprimir: (venda: VendaDetalhe) => void
}) {
  const [venda, setVenda] = useState<VendaDetalhe | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [abaAtiva, setAbaAtiva] = useState(aba)

  useEffect(() => setAbaAtiva(aba), [aba, numeroVenda])

  useEffect(() => {
    if (!numeroVenda || !storeId) {
      setVenda(null)
      setErro(null)
      return
    }
    let cancelado = false
    setCarregando(true)
    setErro(null)
    setVenda(null)
    void fetch(vendaDetalheUrl(numeroVenda, true), {
      credentials: "include",
      headers: { "x-assistec-loja-id": storeId },
      cache: "no-store",
    })
      .then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => null) }))
      .then(({ ok, body }) => {
        if (cancelado) return
        const data = body as { ok?: boolean; venda?: VendaDetalhe; error?: string } | null
        if (!ok || !data?.ok || !data.venda) {
          setErro(data?.error?.trim() || "Não foi possível carregar a venda.")
          return
        }
        // Guarda central de exibição: id técnico de operador nunca vira nome.
        setVenda({ ...data.venda, operador: sanitizeOperatorLabel(data.venda.operador) || null })
      })
      .catch(() => {
        if (!cancelado) setErro("Falha de conexão ao carregar a venda.")
      })
      .finally(() => {
        if (!cancelado) setCarregando(false)
      })
    return () => {
      cancelado = true
    }
  }, [numeroVenda, storeId])

  const eventos = useMemo(() => (venda ? buildVendaTimeline(venda) : []), [venda])

  const subtotalLinhas = useMemo(
    () => (venda ? venda.itens.reduce((s, i) => s + i.lineTotal, 0) : 0),
    [venda],
  )

  return (
    <Sheet open={!!numeroVenda} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full min-w-0 flex-col gap-0 p-0 sm:max-w-xl"
      >
        <SheetHeader className="shrink-0 border-b border-border px-4 py-3">
          <SheetTitle className="flex min-w-0 items-center gap-2 text-base">
            <FileText aria-hidden className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate">Venda {numeroVenda ?? ""}</span>
          </SheetTitle>
          <SheetDescription className="text-xs">
            Consulta da venda registrada. Nada nesta ficha altera a venda ou o caixa.
          </SheetDescription>
        </SheetHeader>

        {carregando ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 aria-hidden className="h-6 w-6 animate-spin" />
            <span className="text-sm">Carregando venda…</span>
          </div>
        ) : erro ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
            <AlertTriangle aria-hidden className="h-6 w-6 text-warning" />
            <p className="text-sm font-medium text-foreground">{erro}</p>
            <p className="text-xs text-muted-foreground">
              Vendas ainda não sincronizadas com o servidor não têm ficha completa.
            </p>
          </div>
        ) : venda ? (
          <Tabs
            value={abaAtiva}
            onValueChange={(v) => setAbaAtiva(v as "detalhes" | "historico")}
            className="flex min-h-0 min-w-0 flex-1 flex-col"
          >
            <div className="shrink-0 px-4 pt-3">
              <TabsList className="w-full">
                <TabsTrigger value="detalhes" className="flex-1 gap-1.5">
                  <FileText aria-hidden className="h-3.5 w-3.5" />
                  Detalhes
                </TabsTrigger>
                <TabsTrigger value="historico" className="flex-1 gap-1.5">
                  <History aria-hidden className="h-3.5 w-3.5" />
                  Histórico
                  <span className="text-[10px] tabular-nums opacity-70">{eventos.length}</span>
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent
              value="detalhes"
              className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto px-4 py-3"
            >
              <Bloco titulo="Identificação">
                <Campo rotulo="Número da venda" valor={venda.id} mono destaque />
                <Campo rotulo="ID técnico" valor={venda.dbId} mono />
                <Campo rotulo="Data e hora" valor={fmtDataHora(venda.at)} />
                <Campo rotulo="Operador" valor={venda.operador} />
                <Campo rotulo="Status" valor={STATUS_LABEL[venda.status] ?? venda.status} />
                <Campo
                  rotulo="Terminal"
                  valor={venda.terminal ? `${venda.terminal.code} · ${venda.terminal.name}` : null}
                />
              </Bloco>

              <Bloco titulo="Cliente">
                <Campo rotulo="Nome" valor={venda.clienteNome} />
                <Campo rotulo="CPF/CNPJ" valor={venda.clienteCpf} mono />
              </Bloco>

              <Bloco titulo="Sessão de caixa">
                <Campo rotulo="Sessão" valor={venda.sessaoId} mono />
                <Campo
                  rotulo="Situação"
                  valor={venda.sessao ? (venda.sessao.status === "ABERTA" ? "Aberta" : "Fechada") : null}
                />
                <Campo rotulo="Aberta em" valor={venda.sessao ? fmtDataHora(venda.sessao.abertaEm) : null} />
                <Campo
                  rotulo="Fechada em"
                  valor={venda.sessao?.fechadaEm ? fmtDataHora(venda.sessao.fechadaEm) : null}
                />
              </Bloco>

              <section className="min-w-0 space-y-1.5">
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Itens ({venda.itens.length})
                </h4>
                {venda.itens.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                    Esta venda não tem itens registrados.
                  </p>
                ) : (
                  <ul className="min-w-0 divide-y divide-border/60 rounded-md border border-border">
                    {venda.itens.map((it) => (
                      <li key={it.id} className="flex min-w-0 items-start gap-3 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-foreground">{it.nome}</p>
                          <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                            {it.quantidade} × {fmt(it.precoUnitario)}
                          </p>
                          {it.acessorio && (it.acessorio.modelLabel || it.acessorio.colorLabel) ? (
                            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                              {[it.acessorio.modelLabel, it.acessorio.colorLabel]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          ) : null}
                        </div>
                        <span className="shrink-0 whitespace-nowrap text-xs font-semibold tabular-nums text-foreground">
                          {fmt(it.lineTotal)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <Bloco titulo="Valores">
                <Campo rotulo="Soma dos itens" valor={fmt(subtotalLinhas)} />
                <Campo rotulo="Desconto" valor={venda.desconto > 0 ? `− ${fmt(venda.desconto)}` : fmt(0)} />
                <Campo rotulo="Total" valor={fmt(venda.total)} destaque />
                <Campo
                  rotulo="Dinheiro recebido"
                  valor={venda.cashTendered != null ? fmt(venda.cashTendered) : null}
                />
              </Bloco>

              <section className="min-w-0 space-y-1.5">
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Formas de pagamento
                </h4>
                {venda.pagamentos.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{SEM_REGISTRO}</p>
                ) : (
                  <ul className="min-w-0 space-y-1">
                    {venda.pagamentos.map((p) => (
                      <li
                        key={p.label}
                        className="flex min-w-0 items-center justify-between gap-3 rounded-md bg-secondary px-3 py-1.5"
                      >
                        <span className="truncate text-xs font-medium text-foreground">{p.label}</span>
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground">
                          {fmt(p.valor)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {venda.pagamentos.length > 1 && (
                  <p className="text-[11px] text-muted-foreground">
                    Pagamento múltiplo — {venda.pagamentos.length} formas discriminadas acima.
                  </p>
                )}
              </section>

              {(venda.titulos?.length ?? 0) > 0 && (
                <section className="min-w-0 space-y-1.5">
                  <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Contas a receber
                  </h4>
                  <ul className="min-w-0 space-y-1">
                    {venda.titulos!.map((t) => (
                      <li key={t.id} className="min-w-0 rounded-md border border-border px-3 py-2">
                        <div className="flex min-w-0 items-center justify-between gap-3">
                          <span className="truncate text-xs font-semibold text-foreground">
                            {t.descricao}
                          </span>
                          <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground">
                            {fmt(t.valor)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {t.status} · recebido {fmt(t.pago)}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {venda.devolucoes.length > 0 && (
                <section className="min-w-0 space-y-1.5">
                  <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Devoluções e trocas vinculadas
                  </h4>
                  <ul className="min-w-0 space-y-1">
                    {venda.devolucoes.map((d) => (
                      <li key={d.id} className="min-w-0 rounded-md border border-border px-3 py-2">
                        <div className="flex min-w-0 items-center justify-between gap-3">
                          <span className="truncate font-mono text-[11px] text-foreground">
                            {d.localId}
                          </span>
                          <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground">
                            {fmt(d.valorTotal)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {fmtDataHora(d.at)} · {d.tipo}
                          {d.creditoEmitido > 0 ? ` · vale ${fmt(d.creditoEmitido)}` : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {venda.status === "cancelada" && (
                <div className="min-w-0 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
                  <p className="text-xs font-semibold text-foreground">Venda estornada</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {fmtDataHora(venda.canceladaEm)}
                    {venda.canceladaPor ? ` · ${venda.canceladaPor}` : ""}
                  </p>
                  <p className="mt-1 text-[11px] text-foreground">
                    {venda.motivoCancelamento?.trim() || SEM_REGISTRO}
                  </p>
                </div>
              )}

              <Separator />
              <div className="flex min-w-0 flex-wrap gap-2 pb-2">
                <Button variant="outline" size="sm" onClick={() => onCopiarNumero(venda.id)}>
                  <Copy aria-hidden className="h-3.5 w-3.5" />
                  Copiar número
                </Button>
                <Button variant="outline" size="sm" onClick={() => onReimprimir(venda)}>
                  <Printer aria-hidden className="h-3.5 w-3.5" />
                  Reimprimir comprovante
                </Button>
              </div>
            </TabsContent>

            <TabsContent
              value="historico"
              className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-3"
            >
              <p className="mb-3 text-[11px] text-muted-foreground">
                Somente eventos registrados nesta venda. Campo em branco significa que a venda
                original não guardou o dado.
              </p>
              <ol className="min-w-0 space-y-0">
                {eventos.map((e, i) => (
                  <li key={`${e.tipo}-${e.at}-${i}`} className="flex min-w-0 gap-3">
                    <div className="flex shrink-0 flex-col items-center">
                      <span
                        aria-hidden
                        className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", EVENTO_TOM[e.tipo])}
                      />
                      {i < eventos.length - 1 && <span aria-hidden className="w-px flex-1 bg-border" />}
                    </div>
                    <div className="min-w-0 flex-1 pb-4">
                      <div className="flex min-w-0 items-baseline justify-between gap-3">
                        <p className="truncate text-xs font-semibold text-foreground">{e.titulo}</p>
                        {e.valor != null && (
                          <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground">
                            {fmt(e.valor)}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                        {fmtDataHora(e.at)}
                        {e.operador ? ` · ${e.operador}` : ""}
                      </p>
                      {e.descricao && (
                        <p className="mt-0.5 break-words text-[11px] text-muted-foreground">
                          {e.descricao}
                        </p>
                      )}
                      {e.motivo && (
                        <p className="mt-0.5 break-words text-[11px] text-foreground">
                          Motivo: {e.motivo}
                        </p>
                      )}
                      {e.autorizador && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          Autorizado por {e.autorizador}
                        </p>
                      )}
                      {e.referencia && (
                        <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                          {e.referencia}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </TabsContent>
          </Tabs>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 space-y-1.5">
      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {titulo}
      </h4>
      <dl className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-2">{children}</dl>
    </section>
  )
}

/** `valor` nulo/vazio vira "—": a ficha não preenche lacuna da venda original. */
function Campo({
  rotulo,
  valor,
  mono = false,
  destaque = false,
}: {
  rotulo: string
  valor: string | null | undefined
  mono?: boolean
  destaque?: boolean
}) {
  const texto = typeof valor === "string" && valor.trim() ? valor.trim() : "—"
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {rotulo}
      </dt>
      <dd
        className={cn(
          "truncate text-xs text-foreground",
          destaque ? "font-bold" : "font-medium",
          mono && "font-mono text-[11px]",
        )}
        title={texto}
      >
        {texto}
      </dd>
    </div>
  )
}
