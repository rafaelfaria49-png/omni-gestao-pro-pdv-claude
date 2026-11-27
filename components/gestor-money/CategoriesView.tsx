"use client"

import * as React from "react"
import { Plus, Search, Tag } from "lucide-react"
import { cn } from "@/lib/utils"
import type {
  ConsultaFinanceiraSnapshot,
  NaturezaCategoria,
  OperacaoFeedback,
} from "@/lib/gestor-money/contracts"
import type { GestorMoneyGateway } from "@/lib/gestor-money/gateway"
import { formatarCentavosBRL } from "@/lib/gestor-money/money"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CategoryIcon, EmptyStateCard } from "./shared"

const CORES_PALETA = [
  "#10b981",
  "#f59e0b",
  "#6366f1",
  "#0ea5e9",
  "#8b5cf6",
  "#ec4899",
  "#ef4444",
  "#14b8a6",
  "#3b82f6",
  "#f97316",
]

export function CategoriesView({
  snapshot,
  gateway,
  onMutationSuccess,
}: {
  snapshot: ConsultaFinanceiraSnapshot
  gateway: GestorMoneyGateway
  onMutationSuccess: (feedback: OperacaoFeedback) => Promise<void> | void
}) {
  const [naturezaFiltro, setNaturezaFiltro] = React.useState<"TODAS" | NaturezaCategoria>("TODAS")
  const [busca, setBusca] = React.useState("")
  const [modalOpen, setModalOpen] = React.useState(false)

  const [nome, setNome] = React.useState("")
  const [natureza, setNatureza] = React.useState<NaturezaCategoria>("DESPESA")
  const [cor, setCor] = React.useState(CORES_PALETA[2])
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const filtradas = React.useMemo(() => {
    const q = busca.trim().toLowerCase()
    return snapshot.categorias.filter((c) => {
      if (naturezaFiltro !== "TODAS" && c.natureza !== naturezaFiltro) return false
      if (q && !c.nome.toLowerCase().includes(q)) return false
      return true
    })
  }, [snapshot.categorias, naturezaFiltro, busca])

  const seletor =
    snapshot.perfil.tipo === "PESSOAL"
      ? ({ tipo: "PESSOAL", perfilId: snapshot.perfil.perfilId } as const)
      : ({ tipo: "EMPRESA", perfilId: snapshot.perfil.perfilId, storeId: snapshot.perfil.storeId } as const)

  const handleCriar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const fb = await gateway.criarCategoria(seletor, {
        nome,
        natureza,
        cor,
        icone: "Tag",
      })
      await onMutationSuccess(fb)
      setModalOpen(false)
      setNome("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar categoria.")
    } finally {
      setSubmitting(false)
    }
  }

  const handleToggle = async (id: string, ativo: boolean) => {
    try {
      const fb = await gateway.alternarCategoriaAtiva(seletor, id, ativo)
      await onMutationSuccess(fb)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao alterar status.")
    }
  }

  return (
    <div className="space-y-6" data-testid="gestor-money-categorias">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">Categorias financeiras</h2>
          <p className="text-xs text-muted-foreground">
            10 categorias padrão essenciais + categorias personalizadas com deduplicação NFKC (G002)
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          className="rounded-xl text-xs"
          data-testid="btn-nova-categoria"
          onClick={() => {
            setError(null)
            setModalOpen(true)
          }}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Categoria personalizada
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          {(["TODAS", "DESPESA", "RECEITA"] as const).map((n) => (
            <Button
              key={n}
              type="button"
              size="sm"
              variant={naturezaFiltro === n ? "default" : "outline"}
              className="rounded-xl text-xs"
              onClick={() => setNaturezaFiltro(n)}
            >
              {n === "TODAS" ? "Todas" : n === "DESPESA" ? "Despesas" : "Receitas"}
            </Button>
          ))}
        </div>
        <div className="relative sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Filtrar categoria..."
            className="h-9 rounded-xl pl-9 text-xs"
          />
        </div>
      </div>

      {filtradas.length === 0 ? (
        <EmptyStateCard
          icon={<Tag className="h-5 w-5" />}
          title="Nenhuma categoria encontrada"
          description="Crie uma categoria personalizada para classificar lançamentos deste perfil."
          actionLabel="Criar categoria"
          onAction={() => setModalOpen(true)}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtradas.map((cat) => (
            <div
              key={cat.id}
              data-testid={`category-card-${cat.id}`}
              className={cn(
                "flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition-all",
                !cat.ativo && "opacity-55"
              )}
            >
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
                  style={{ backgroundColor: cat.cor }}
                >
                  <CategoryIcon name={cat.icone} className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-semibold text-foreground">{cat.nome}</p>
                    {!cat.padrao && (
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        Personalizada
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {cat.natureza === "DESPESA" ? "Despesa" : "Receita"} · {cat.quantidadeRegistros}{" "}
                    {cat.quantidadeRegistros === 1 ? "lançamento" : "lançamentos"}
                  </p>
                  <p className="mt-0.5 font-display text-xs font-bold tabular-nums text-foreground">
                    {formatarCentavosBRL(cat.totalPeriodoCentavos)}
                  </p>
                </div>
              </div>
              <Switch
                checked={cat.ativo}
                onCheckedChange={(checked) => handleToggle(cat.id, checked)}
                aria-label={`Ativar categoria ${cat.nome}`}
              />
            </div>
          ))}
        </div>
      )}

      {/* Dialog: Nova categoria personalizada */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="rounded-2xl sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="font-display">Nova categoria personalizada</DialogTitle>
            <DialogDescription className="text-xs">
              Isolada no perfil {snapshot.perfil.tipo} · Sem duplicidade por acento/caixa (G002).
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCriar} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cat-nome">Nome da categoria</Label>
              <Input
                id="cat-nome"
                data-testid="cat-input-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Assinaturas SaaS, Pet, Manutenção..."
                required
                className="rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Natureza</Label>
              <Select value={natureza} onValueChange={(v) => setNatureza(v as NaturezaCategoria)}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DESPESA">Despesa</SelectItem>
                  <SelectItem value="RECEITA">Receita</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Cor de identificação</Label>
              <div className="flex flex-wrap gap-2">
                {CORES_PALETA.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCor(c)}
                    className={cn(
                      "h-7 w-7 rounded-full transition-transform",
                      cor === c && "scale-110 ring-2 ring-foreground ring-offset-2 ring-offset-background"
                    )}
                    style={{ backgroundColor: c }}
                    aria-label={`Selecionar cor ${c}`}
                  />
                ))}
              </div>
            </div>
            {error && <p className="text-xs text-rose-500">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="rounded-xl" disabled={submitting} data-testid="cat-submit-button">
                Criar categoria
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
