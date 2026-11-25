"use client"

/**
 * Painel do detalhe da venda (Histórico → ícone de olho): identificação por item e
 * situação de devolução, lidas do SERVIDOR (`/api/ops/trocas/venda`).
 *
 * Códigos: o que foi gravado NA VENDA aparece como tal; o que vem do cadastro ATUAL é
 * rotulado "cadastro atual" — nunca apresentado como o código da data da venda. Nada é
 * inventado para vendas antigas. O status histórico da venda não muda aqui: a situação
 * de devolução aparece à parte.
 */
import { useEffect, useState } from "react"
import { History, Loader2 } from "lucide-react"
import { carregarVendaTroca, type VendaTrocaView } from "@/lib/pdv/trocas/troca-client"

const FORMA: Record<string, string> = { dinheiro: "Dinheiro", pix: "Pix", debito: "Débito", credito: "Crédito", estorno_cartao: "Estorno no cartão" }
const TIPO: Record<string, string> = { troca: "Troca", vale_credito: "Vale-troca", devolucao: "Reembolso", somente_estoque: "Apenas estoque" }
const ORIGEM: Record<string, string> = {
  cadastrado: "Produto cadastrado",
  inativo: "Produto inativo",
  removido: "Produto removido do cadastro",
  avulso: "Lançamento avulso",
  servico: "Serviço",
  aparelho_imei: "Aparelho (IMEI)",
}

function brl(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n)
}

export function VendaItensTrocasPanel({ storeId, pedidoId }: { storeId: string; pedidoId: string }) {
  const [view, setView] = useState<VendaTrocaView | null>(null)
  const [estado, setEstado] = useState<"carregando" | "ok" | "erro" | "ausente">("carregando")

  useEffect(() => {
    if (!storeId || !pedidoId) return
    const ctrl = new AbortController()
    setEstado("carregando")
    carregarVendaTroca(storeId, pedidoId, ctrl.signal)
      .then((v) => {
        setView(v)
        setEstado(v ? "ok" : "ausente")
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setEstado("erro")
      })
    return () => ctrl.abort()
  }, [storeId, pedidoId])

  if (estado === "carregando") {
    return (
      <p className="flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando códigos e devoluções…
      </p>
    )
  }
  if (estado !== "ok" || !view) {
    return estado === "erro" ? <p className="px-4 py-2 text-xs text-muted-foreground">Não foi possível carregar códigos e devoluções.</p> : null
  }

  const totalDevolvido = view.linhas.reduce((s, l) => s + l.devolvido, 0)
  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-background/40">
      <header className="border-b border-border bg-muted/30 px-4 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Identificação e devoluções por item</p>
      </header>
      <div className="divide-y divide-border/60 px-4">
        {view.linhas.map((l) => {
          const snapshot = [l.snapshotSku && `SKU ${l.snapshotSku}`, l.snapshotBarcode && `EAN ${l.snapshotBarcode}`, l.codigoNaVenda && `código ${l.codigoNaVenda}`]
            .filter(Boolean)
            .join(" · ")
          const atual = l.cadastroAtual
            ? [l.cadastroAtual.sku && `SKU ${l.cadastroAtual.sku}`, l.cadastroAtual.barcode && `EAN ${l.cadastroAtual.barcode}`, `ID ${l.cadastroAtual.produtoId}`]
                .filter(Boolean)
                .join(" · ")
            : ""
          return (
            <div key={l.lineIndex} className="min-w-0 space-y-0.5 py-2 text-xs">
              <p className="truncate text-sm text-foreground">{l.name}</p>
              <p className="text-muted-foreground">
                {l.quantity}× {brl(l.unitPrice)} = {brl(l.lineTotal)} · {ORIGEM[l.situacaoCadastro]}
                {l.accessoryLabel ? ` · ${l.accessoryLabel}` : ""}
              </p>
              {snapshot && <p className="break-words text-muted-foreground">Gravado na venda: {snapshot}</p>}
              {atual && <p className="break-words text-muted-foreground">Cadastro atual (pode diferir da data da venda): {atual}</p>}
              {!snapshot && !atual && <p className="text-muted-foreground">Sem código disponível.</p>}
              {(l.devolvido > 0 || totalDevolvido > 0) && (
                <p className="text-muted-foreground">
                  Devolvido {l.devolvido} · disponível para devolução <span className="font-semibold text-foreground">{l.disponivel}</span>
                </p>
              )}
            </div>
          )
        })}
      </div>
      {view.trocaOrigem && (
        <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
          Venda gerada por troca da venda <span className="font-mono text-foreground">{view.trocaOrigem.vendaOrigem}</span>.
        </p>
      )}
      {view.devolucoes.length > 0 && (
        <div className="border-t border-border">
          <p className="flex items-center gap-1.5 px-4 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <History className="h-3.5 w-3.5" /> Trocas e devoluções ({view.devolucoes.length})
          </p>
          <ul className="divide-y divide-border/60 px-4 pb-1">
            {view.devolucoes.map((d) => (
              <li key={d.id} className="space-y-0.5 py-2 text-xs">
                <p className="font-semibold text-foreground">
                  {TIPO[d.tipo] ?? d.tipo} · {new Date(d.at).toLocaleString("pt-BR")}
                  {d.status === "legado" ? " · registro antigo" : ""}
                </p>
                <p className="text-muted-foreground">{d.itens.map((i) => `${i.quantidade}× ${i.nome}`).join(", ")} · {brl(d.valorTotal)}</p>
                {d.novaVenda && (
                  <p className="text-muted-foreground">
                    Venda substituta <span className="font-mono text-foreground">{d.novaVenda.pedidoId}</span>
                    {d.diferenca && d.diferenca.valor > 0 ? ` · diferença ${brl(d.diferenca.valor)} (${FORMA[d.diferenca.forma ?? ""] ?? d.diferenca.forma})` : ""}
                  </p>
                )}
                {d.reembolso && <p className="text-muted-foreground">Reembolso {brl(d.reembolso.valor)} · {FORMA[d.reembolso.forma] ?? d.reembolso.forma}</p>}
                {(d.valeEmitido ?? 0) > 0 && <p className="text-muted-foreground">Vale emitido {brl(d.valeEmitido ?? 0)}</p>}
                {(d.operador || d.motivo) && (
                  <p className="text-muted-foreground">
                    {[d.operador && `Operador: ${d.operador}`, d.motivo && `Motivo: ${d.motivo}`].filter(Boolean).join(" · ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
