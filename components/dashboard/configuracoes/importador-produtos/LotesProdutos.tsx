"use client"

import { Loader2, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type {
  LoteResult,
  ModoConflito,
  PreviewProdutosResult,
} from "@/lib/importador-produtos/types"

function formatNumero(n: number): string {
  return Number.isFinite(n) ? n.toLocaleString("pt-BR") : "0"
}

export type LotesProdutosProps = {
  preview: PreviewProdutosResult
  modoConflito: ModoConflito
  setModoConflito: (m: ModoConflito) => void
  loteAtual: number
  totais: { criados: number; atualizados: number; pulados: number; erros: number }
  resultados: LoteResult[]
  enviando: boolean
  onImportarProximo: () => void
}

export function LotesProdutos({
  preview,
  modoConflito,
  setModoConflito,
  loteAtual,
  totais,
  resultados,
  enviando,
  onImportarProximo,
}: LotesProdutosProps) {
  const totalLotes = preview.totalLotes
  const concluido = loteAtual >= totalLotes
  const pct = totalLotes > 0 ? Math.round((loteAtual / totalLotes) * 100) : 0
  const proximoLoteTam = preview.lotes[loteAtual]?.length ?? 0

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            Importação em lotes — {formatNumero(preview.totalLinhasValidas)} produtos válidos
          </p>
          <p className="text-xs text-muted-foreground">
            {totalLotes} lote{totalLotes === 1 ? "" : "s"} de até {preview.tamanhoLote} itens.
            Clique em <strong className="font-medium">Importar próximo lote</strong> para enviar um lote
            por vez — nada vai para o banco sem você apertar.
          </p>
        </div>
        <ModoConflitoSelector
          valor={modoConflito}
          onChange={setModoConflito}
          desabilitado={loteAtual > 0}
        />
      </div>

      {/* Barra de progresso real */}
      <div>
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            Lote {Math.min(loteAtual, totalLotes)} de {totalLotes}
          </span>
          <span className="tabular-nums text-muted-foreground">{pct}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      </div>

      {/* Totais acumulados */}
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <Mini label="Criados" valor={totais.criados} tom="ok" />
        <Mini label="Atualizados" valor={totais.atualizados} tom="info" />
        <Mini label="Pulados" valor={totais.pulados} tom="neutro" />
        <Mini label="Erros" valor={totais.erros} tom={totais.erros > 0 ? "alerta" : "neutro"} />
      </div>

      {/* Ação */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p className="text-xs text-muted-foreground">
          {concluido
            ? "Todos os lotes foram processados."
            : `Próximo lote: ${formatNumero(proximoLoteTam)} produtos.`}
        </p>
        <Button
          type="button"
          size="sm"
          disabled={concluido || enviando}
          onClick={onImportarProximo}
          className="gap-2"
        >
          {enviando ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Enviando lote {loteAtual + 1}…
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              Importar próximo lote ({Math.min(loteAtual + 1, totalLotes)}/{totalLotes})
            </>
          )}
        </Button>
      </div>

      {/* Histórico de lotes processados */}
      {resultados.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Lotes processados</p>
          <ul className="divide-y divide-border rounded-md border border-border">
            {resultados.map((r) => (
              <li
                key={r.loteIndex}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs"
              >
                <span className="text-foreground">
                  Lote {r.loteIndex + 1}/{r.totalLotes}
                </span>
                <span className="text-muted-foreground">
                  <span className="text-primary">{formatNumero(r.criados)}</span> criados ·{" "}
                  <span className="text-foreground">{formatNumero(r.atualizados)}</span> atualizados ·{" "}
                  {formatNumero(r.pulados)} pulados ·{" "}
                  <span className={r.erros > 0 ? "text-destructive" : "text-muted-foreground"}>
                    {formatNumero(r.erros)} erros
                  </span>{" "}
                  · {(r.duracaoMs / 1000).toFixed(1)}s
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function ModoConflitoSelector({
  valor,
  onChange,
  desabilitado,
}: {
  valor: ModoConflito
  onChange: (m: ModoConflito) => void
  desabilitado?: boolean
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-1 text-xs">
      <button
        type="button"
        disabled={desabilitado}
        onClick={() => onChange("atualizar")}
        className={cn(
          "rounded-md px-2.5 py-1 transition",
          valor === "atualizar"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground",
          desabilitado && "cursor-not-allowed opacity-60",
        )}
        title="Se SKU/barcode já existir, atualiza dados cadastrais (mantém estoque)"
      >
        Atualizar existente
      </button>
      <button
        type="button"
        disabled={desabilitado}
        onClick={() => onChange("pular")}
        className={cn(
          "rounded-md px-2.5 py-1 transition",
          valor === "pular"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground",
          desabilitado && "cursor-not-allowed opacity-60",
        )}
        title="Se SKU/barcode já existir, pula a linha"
      >
        Pular existente
      </button>
    </div>
  )
}

function Mini({
  label,
  valor,
  tom,
}: {
  label: string
  valor: number
  tom: "ok" | "info" | "neutro" | "alerta"
}) {
  return (
    <div className="rounded-md border border-border bg-background px-2.5 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "tabular-nums text-sm font-semibold",
          tom === "ok"
            ? "text-primary"
            : tom === "info"
              ? "text-foreground"
              : tom === "alerta"
                ? "text-destructive"
                : "text-muted-foreground",
        )}
      >
        {formatNumero(valor)}
      </p>
    </div>
  )
}
