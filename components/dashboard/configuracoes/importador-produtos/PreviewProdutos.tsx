"use client"

import { useState } from "react"
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import type {
  CampoCanonico,
  PreviewProdutosResult,
} from "@/lib/importador-produtos/types"

function formatNumero(n: number): string {
  return Number.isFinite(n) ? n.toLocaleString("pt-BR") : "0"
}

function formatMoeda(n: number): string {
  if (!Number.isFinite(n)) return "—"
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

const ROTULO_CAMPO: Record<CampoCanonico, string> = {
  sku: "SKU/Código",
  barcode: "Cód. de barras",
  nome: "Nome",
  custo: "Custo",
  preco: "Preço",
  estoque: "Estoque",
  categoria: "Categoria",
  ncm: "NCM (fiscal)",
  cest: "CEST (fiscal)",
}

export type PreviewProdutosProps = {
  preview: PreviewProdutosResult
}

export function PreviewProdutos({ preview }: PreviewProdutosProps) {
  const semNome = !Object.values(preview.cabecalho.mapeamento).includes("nome")
  return (
    <div className="space-y-4">
      {/* Cards de números */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <ResumoCard label="Linhas lidas" valor={formatNumero(preview.totalLinhasLidas)} />
        <ResumoCard
          label="Válidos"
          valor={formatNumero(preview.totalLinhasValidas)}
          tom={preview.totalLinhasValidas > 0 ? "ok" : "alerta"}
        />
        <ResumoCard
          label="Inválidos"
          valor={formatNumero(preview.totalLinhasInvalidas)}
          tom={preview.totalLinhasInvalidas > 0 ? "alerta" : "neutro"}
        />
        <ResumoCard label="Lotes (500/lote)" valor={formatNumero(preview.totalLotes)} />
        <ResumoCard
          label="Duplicados internos"
          valor={formatNumero(preview.duplicadosInternos)}
          tom={preview.duplicadosInternos > 0 ? "alerta" : "neutro"}
        />
        <ResumoCard
          label="Match FORTE no banco"
          valor={formatNumero(preview.analiseDuplicadosBanco.forte)}
          tom={preview.analiseDuplicadosBanco.forte > 0 ? "alerta" : "neutro"}
          hint="barcode EAN/GTIN ou SKU alfanumérico/≥7 dígitos batendo no banco — autoriza atualização"
        />
        <ResumoCard
          label="Match FRACO (não atualiza)"
          valor={formatNumero(preview.analiseDuplicadosBanco.fraco)}
          tom={preview.analiseDuplicadosBanco.fraco > 0 ? "neutro" : "neutro"}
          hint="SKU curto numérico (ex.: 10, 148) bateu no banco — será CRIADO como novo, não atualizado"
        />
        <ResumoCard
          label="Sem chave (criados sem SKU)"
          valor={formatNumero(preview.analiseDuplicadosBanco.semChave)}
          tom="neutro"
          hint="Linhas sem SKU nem barcode — serão criadas sem chave de identidade (SKU null)"
        />
      </div>

      {/* Aviso de cabeçalho sem 'nome' */}
      {semNome && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-destructive">
              Coluna "Nome / Produto / Descrição" não foi identificada
            </p>
            <p className="mt-1 text-xs text-destructive/80">
              Sem o nome, todas as linhas seriam puladas. Confira se a planilha tem uma coluna com o nome
              do produto e gere o preview novamente.
            </p>
          </div>
        </div>
      )}

      {/* Mapa do cabeçalho */}
      <Bloco titulo={`Cabeçalho detectado (linha ${preview.cabecalho.linha + 1})`}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {preview.cabecalho.colunas.map((col) => {
            const campo = preview.cabecalho.mapeamento[col]
            return (
              <div
                key={col}
                className={cn(
                  "flex items-center justify-between rounded-md border px-3 py-1.5 text-xs",
                  campo
                    ? "border-border bg-background"
                    : "border-dashed border-border/60 bg-muted/30",
                )}
              >
                <span
                  className={cn(
                    "min-w-0 truncate font-mono",
                    campo ? "text-foreground" : "text-muted-foreground",
                  )}
                  title={col}
                >
                  {col}
                </span>
                <span
                  className={cn(
                    "ml-2 shrink-0 text-[11px] uppercase tracking-wide",
                    campo ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {campo ? `→ ${ROTULO_CAMPO[campo]}` : "ignorado"}
                </span>
              </div>
            )
          })}
        </div>
      </Bloco>

      {/* Amostra das primeiras 20 linhas normalizadas */}
      {preview.amostra.length > 0 && (
        <Bloco titulo={`Primeiras ${preview.amostra.length} linhas normalizadas`}>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">#</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">SKU</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Barcode</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Nome</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Custo</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Preço</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">Estoque</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Categoria</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {preview.amostra.map((p) => (
                  <tr key={`${p.linha}-${p.sku}-${p.nome}`} className="hover:bg-muted/40">
                    <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{p.linha}</td>
                    <td className="px-3 py-1.5 font-mono text-foreground">{p.sku || "—"}</td>
                    <td className="px-3 py-1.5 font-mono text-foreground">{p.barcode || "—"}</td>
                    <td className="max-w-[280px] truncate px-3 py-1.5 text-foreground" title={p.nome}>
                      {p.nome}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-foreground">
                      {p.custo > 0 ? formatMoeda(p.custo) : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-foreground">
                      {p.preco > 0 ? formatMoeda(p.preco) : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-foreground">
                      {formatNumero(p.estoque)}
                    </td>
                    <td className="px-3 py-1.5 text-foreground">{p.categoria || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Bloco>
      )}

      {/* Linhas inválidas, se houver */}
      {preview.linhasInvalidas.length > 0 && (
        <BlocoColapsavel
          titulo={`Linhas ignoradas (${formatNumero(preview.totalLinhasInvalidas)})`}
        >
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">#</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Motivo</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Conteúdo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {preview.linhasInvalidas.map((inv) => (
                  <tr key={inv.linha} className="hover:bg-muted/40">
                    <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{inv.linha}</td>
                    <td className="px-3 py-1.5 text-destructive">{inv.motivos.join("; ")}</td>
                    <td className="max-w-[420px] truncate px-3 py-1.5 text-foreground">
                      {Object.entries(inv.campos)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(" · ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.totalLinhasInvalidas > preview.linhasInvalidas.length && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Mostrando {preview.linhasInvalidas.length} de{" "}
              {formatNumero(preview.totalLinhasInvalidas)} linhas ignoradas.
            </p>
          )}
        </BlocoColapsavel>
      )}
    </div>
  )
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-4">
      <p className="text-sm font-medium text-foreground">{titulo}</p>
      {children}
    </div>
  )
}

function BlocoColapsavel({
  titulo,
  children,
}: {
  titulo: string
  children: React.ReactNode
}) {
  const [aberto, setAberto] = useState(false)
  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-foreground"
        aria-expanded={aberto}
      >
        <span>{titulo}</span>
        {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {aberto && <div className="border-t border-border px-4 py-3">{children}</div>}
    </div>
  )
}

function ResumoCard({
  label,
  valor,
  tom = "neutro",
  hint,
}: {
  label: string
  valor: string
  tom?: "neutro" | "alerta" | "ok"
  hint?: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2" title={hint}>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-lg font-semibold tabular-nums",
          tom === "alerta"
            ? "text-amber-500"
            : tom === "ok"
              ? "text-primary"
              : "text-foreground",
        )}
      >
        {valor}
      </p>
      {hint && <p className="mt-0.5 truncate text-[10px] text-muted-foreground" title={hint}>{hint}</p>}
    </div>
  )
}
