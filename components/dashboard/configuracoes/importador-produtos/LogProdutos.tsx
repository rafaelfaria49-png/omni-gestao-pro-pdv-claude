"use client"

import { useState } from "react"
import { CheckCircle2, ChevronDown, ChevronRight, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { LoteResult } from "@/lib/importador-produtos/types"

function formatNumero(n: number): string {
  return Number.isFinite(n) ? n.toLocaleString("pt-BR") : "0"
}

export type LogProdutosProps = {
  arquivo: string
  batchId: string
  resultados: LoteResult[]
  totais: { criados: number; atualizados: number; pulados: number; erros: number }
  onReiniciar: () => void
}

export function LogProdutos({
  arquivo,
  batchId,
  resultados,
  totais,
  onReiniciar,
}: LogProdutosProps) {
  const [aberto, setAberto] = useState(false)
  const duracaoTotal = resultados.reduce((acc, r) => acc + r.duracaoMs, 0)
  const totalLinhasComErro = resultados.flatMap((r) => r.itens.filter((i) => i.acao === "erro"))
  const totalLinhasPuladas = resultados.flatMap((r) => r.itens.filter((i) => i.acao === "pulado"))

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            Importação concluída — {formatNumero(resultados.length)} lote
            {resultados.length === 1 ? "" : "s"} processado
            {resultados.length === 1 ? "" : "s"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Arquivo: <span className="font-mono">{arquivo}</span> · Batch:{" "}
            <span className="font-mono">{batchId}</span> · {(duracaoTotal / 1000).toFixed(1)}s
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onReiniciar} className="gap-2">
          <RotateCcw className="h-4 w-4" />
          Importar outra planilha
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card label="Criados" valor={totais.criados} tom="ok" />
        <Card label="Atualizados" valor={totais.atualizados} tom="info" />
        <Card label="Pulados" valor={totais.pulados} tom="neutro" />
        <Card
          label="Erros"
          valor={totais.erros}
          tom={totais.erros > 0 ? "alerta" : "neutro"}
        />
      </div>

      {(totalLinhasComErro.length > 0 || totalLinhasPuladas.length > 0) && (
        <div className="rounded-xl border border-border bg-card">
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-foreground"
          >
            <span>
              Detalhamento — {formatNumero(totalLinhasComErro.length)} erro
              {totalLinhasComErro.length === 1 ? "" : "s"} ·{" "}
              {formatNumero(totalLinhasPuladas.length)} pulado
              {totalLinhasPuladas.length === 1 ? "" : "s"}
            </span>
            {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>

          {aberto && (
            <div className="space-y-3 border-t border-border px-4 py-3">
              {totalLinhasComErro.length > 0 && (
                <Tabela
                  titulo="Erros"
                  itens={totalLinhasComErro.slice(0, 200)}
                  totalReal={totalLinhasComErro.length}
                />
              )}
              {totalLinhasPuladas.length > 0 && (
                <Tabela
                  titulo="Pulados"
                  itens={totalLinhasPuladas.slice(0, 200)}
                  totalReal={totalLinhasPuladas.length}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Tabela({
  titulo,
  itens,
  totalReal,
}: {
  titulo: string
  itens: Array<{ linha: number; sku: string; nome: string; detalhe?: string }>
  totalReal: number
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">{titulo}</p>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-xs">
          <thead className="bg-muted/40">
            <tr>
              <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">#</th>
              <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">SKU</th>
              <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Nome</th>
              <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Detalhe</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {itens.map((i, idx) => (
              <tr key={`${i.linha}-${idx}`}>
                <td className="px-3 py-1 tabular-nums text-muted-foreground">{i.linha}</td>
                <td className="px-3 py-1 font-mono text-foreground">{i.sku || "—"}</td>
                <td className="max-w-[260px] truncate px-3 py-1 text-foreground" title={i.nome}>
                  {i.nome || "—"}
                </td>
                <td className="px-3 py-1 text-muted-foreground">{i.detalhe ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalReal > itens.length && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Mostrando {itens.length} de {formatNumero(totalReal)}.
        </p>
      )}
    </div>
  )
}

function Card({
  label,
  valor,
  tom,
}: {
  label: string
  valor: number
  tom: "ok" | "info" | "neutro" | "alerta"
}) {
  const cor =
    tom === "ok"
      ? "text-primary"
      : tom === "alerta"
        ? "text-destructive"
        : tom === "neutro"
          ? "text-muted-foreground"
          : "text-foreground"
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold tabular-nums ${cor}`}>{formatNumero(valor)}</p>
    </div>
  )
}
