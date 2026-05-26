"use client"

import { motion, AnimatePresence } from "framer-motion"
import { FolderKanban, Pencil, Plus, Search, Trash2 } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { IaMestreSubPageShell } from "@/components/ia-mestre/IaMestreSubPageShell"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"

const LS_KEY = "ia-mestre-projetos-v1"

export type ProjetoCategoria = "Marketing" | "Financeiro" | "OS" | "Estoque"

export type ProjetoCard = {
  id: string
  title: string
  description: string
  createdAt: string
  category: ProjetoCategoria
  lastMessage: string
}

function seedProjetos(): ProjetoCard[] {
  const now = Date.now()
  const d = (daysAgo: number) => new Date(now - daysAgo * 86400000).toISOString()
  return [
    {
      id: "p1",
      title: "Relatório Mensal",
      description: "Consolidação de vendas e indicadores do mês.",
      createdAt: d(12),
      category: "Financeiro",
      lastMessage: "Quer que eu detalhe a margem por categoria?",
    },
    {
      id: "p2",
      title: "Campanha Dia das Mães",
      description: "Criativos e copy para promoção sazonal.",
      createdAt: d(20),
      category: "Marketing",
      lastMessage: "Posso adaptar para Stories e WhatsApp.",
    },
    {
      id: "p3",
      title: "Dúvida Estoque",
      description: "Análise de giro e sugestões de compra.",
      createdAt: d(5),
      category: "Estoque",
      lastMessage: "Itens abaixo do mínimo: 3 SKUs.",
    },
    {
      id: "p4",
      title: "Promo iPhone 15",
      description: "Campanha focada em trade-in e parcelamento.",
      createdAt: d(8),
      category: "Marketing",
      lastMessage: "Sugestão de bundle com capa + película.",
    },
    {
      id: "p5",
      title: "Script WhatsApp",
      description: "Mensagens padrão para follow-up pós-venda.",
      createdAt: d(3),
      category: "Marketing",
      lastMessage: "Variante formal e descontraída geradas.",
    },
    {
      id: "p6",
      title: "Análise Concorrência",
      description: "Benchmark de preços e posicionamento regional.",
      createdAt: d(15),
      category: "Marketing",
      lastMessage: "Principais diferenciais: garantia e prazo.",
    },
    {
      id: "p7",
      title: "Treino atendimento",
      description: "Roteiros para atendimento em balcão e garantia.",
      createdAt: d(1),
      category: "OS",
      lastMessage: "Checklist de entrada do aparelho atualizado.",
    },
    {
      id: "p8",
      title: "Fluxo de Caixa Semanal",
      description: "Projeção de entradas e saídas para a semana.",
      createdAt: d(6),
      category: "Financeiro",
      lastMessage: "Alerta: concentrar pagamentos na terça.",
    },
    {
      id: "p9",
      title: "Inventário Rápido",
      description: "Contagem cíclica por corredor.",
      createdAt: d(18),
      category: "Estoque",
      lastMessage: "Sugestão de tags RFID para próximo ciclo.",
    },
    {
      id: "p10",
      title: "OS em Garantia",
      description: "Mensagens ao cliente sobre status de reparo.",
      createdAt: d(4),
      category: "OS",
      lastMessage: "Template de prazo e coleta pronto.",
    },
    {
      id: "p11",
      title: "Black Friday Preview",
      description: "Pré-campanha e teasers para lista VIP.",
      createdAt: d(25),
      category: "Marketing",
      lastMessage: "Countdown e cupom limitado no rascunho.",
    },
    {
      id: "p12",
      title: "Metas da Equipe",
      description: "Definição de metas por técnico e loja.",
      createdAt: d(9),
      category: "OS",
      lastMessage: "OKR revisado para o trimestre.",
    },
  ]
}

const FILTERS: Array<{ id: "all" | ProjetoCategoria; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "Marketing", label: "Marketing" },
  { id: "Financeiro", label: "Financeiro" },
  { id: "OS", label: "OS" },
  { id: "Estoque", label: "Estoque" },
]

function catBadgeClass(c: ProjetoCategoria) {
  return cn(
    "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold",
    c === "Marketing" && "border-primary/30 bg-primary/10 text-primary",
    c === "Financeiro" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
    c === "OS" && "border-sky-500/30 bg-sky-500/10 text-sky-600",
    c === "Estoque" && "border-amber-500/30 bg-amber-500/10 text-amber-600",
  )
}

export function MeusProjetosView() {
  const [items, setItems] = useState<ProjetoCard[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [filterCat, setFilterCat] = useState<(typeof FILTERS)[number]["id"]>("all")
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<"recent" | "old" | "az">("recent")
  const [modalOpen, setModalOpen] = useState(false)
  const [newName, setNewName] = useState("")
  const [newCat, setNewCat] = useState<ProjetoCategoria>("Marketing")
  const [newDesc, setNewDesc] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState("")
  const [deleteId, setDeleteId] = useState<string | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as ProjetoCard[]
        if (Array.isArray(parsed) && parsed.length) {
          setItems(parsed)
          setHydrated(true)
          return
        }
      }
    } catch {
      /* ignore */
    }
    setItems(seedProjetos())
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(items))
    } catch {
      /* ignore */
    }
  }, [items, hydrated])

  const filtered = useMemo(() => {
    let r = items.filter((p) => {
      if (filterCat !== "all" && p.category !== filterCat) return false
      const q = search.trim().toLowerCase()
      if (!q) return true
      return (
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.lastMessage.toLowerCase().includes(q)
      )
    })
    if (sort === "recent") {
      r = [...r].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    } else if (sort === "old") {
      r = [...r].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))
    } else {
      r = [...r].sort((a, b) => a.title.localeCompare(b.title, "pt-BR"))
    }
    return r
  }, [items, filterCat, search, sort])

  const createProject = useCallback(() => {
    const title = newName.trim()
    if (!title) return
    const np: ProjetoCard = {
      id: crypto.randomUUID(),
      title,
      description: newDesc.trim() || "Sem descrição.",
      createdAt: new Date().toISOString(),
      category: newCat,
      lastMessage: "Conversa iniciada. Envie uma mensagem no chat.",
    }
    setItems((prev) => [np, ...prev])
    setModalOpen(false)
    setNewName("")
    setNewDesc("")
    setNewCat("Marketing")
  }, [newName, newDesc, newCat])

  const startRename = (p: ProjetoCard) => {
    setEditingId(p.id)
    setEditTitle(p.title)
  }

  const saveRename = (id: string) => {
    const t = editTitle.trim()
    if (!t) return
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, title: t } : x)))
    setEditingId(null)
  }

  const confirmDelete = () => {
    if (!deleteId) return
    setItems((prev) => prev.filter((x) => x.id !== deleteId))
    setDeleteId(null)
  }

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })

  return (
    <>
      <IaMestreSubPageShell
        title="Meus Projetos"
        subtitle="Rascunhos salvos só neste navegador — sem thread nem mensagens no servidor"
        badge={
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            <FolderKanban className="h-3 w-3" /> {items.length} rascunhos locais
          </span>
        }
        actions={
          <Button type="button" className="h-9 gap-1.5 rounded-xl" onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" /> Novo Projeto
          </Button>
        }
      >
        <div className="mx-auto w-full max-w-6xl space-y-4">
          <p className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-[12px] leading-relaxed text-muted-foreground">
            &quot;Abrir&quot; só coloca um rótulo no chat — não carrega mensagens do projeto. Persistência de projetos e
            conversas virá em uma próxima fase.
          </p>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilterCat(f.id)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-[12px] font-medium transition",
                    filterCat === f.id
                      ? "border-primary/40 bg-gradient-primary text-primary-foreground shadow-elegant"
                      : "border-border bg-surface/60 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
              <div className="relative flex-1 sm:min-w-[220px]">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por nome ou descrição..."
                  className="h-9 pl-8 text-[13px]"
                />
              </div>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as typeof sort)}
                className="h-9 rounded-xl border border-border bg-background px-3 text-[13px] text-foreground"
              >
                <option value="recent">Mais recente</option>
                <option value="old">Mais antigo</option>
                <option value="az">A-Z</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence mode="popLayout">
              {filtered.map((p) => (
                <motion.article
                  layout
                  key={p.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.2 }}
                  className="flex flex-col rounded-2xl border border-border bg-card/80 p-4 shadow-elegant backdrop-blur-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    {editingId === p.id ? (
                      <Input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="h-8 text-[13px] font-semibold"
                        onBlur={() => saveRename(p.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveRename(p.id)
                          if (e.key === "Escape") setEditingId(null)
                        }}
                        autoFocus
                      />
                    ) : (
                      <h2 className="text-[14px] font-semibold leading-snug text-foreground">{p.title}</h2>
                    )}
                    <span className={catBadgeClass(p.category)}>{p.category}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">{p.description}</p>
                  <p className="mt-2 text-[11px] text-muted-foreground">Criado em {fmt(p.createdAt)}</p>
                  <p className="mt-2 line-clamp-2 border-t border-border/60 pt-2 text-[11px] italic text-muted-foreground">
                    Texto de exemplo (não é histórico real): {p.lastMessage}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="button" size="sm" className="h-8 rounded-lg text-[12px]" asChild>
                      <Link href={`/dashboard/ia-mestre?projeto=${encodeURIComponent(p.title)}`}>Abrir no chat</Link>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1 rounded-lg text-[12px]"
                      onClick={() => startRename(p)}
                    >
                      <Pencil className="h-3 w-3" /> Renomear
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 rounded-lg text-[12px] text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleteId(p.id)}
                    >
                      <Trash2 className="h-3 w-3" /> Excluir
                    </Button>
                  </div>
                </motion.article>
              ))}
            </AnimatePresence>
          </div>

          {!filtered.length ? (
            <div className="rounded-2xl border border-dashed border-border bg-muted/20 py-12 text-center text-[13px] text-muted-foreground">
              Nenhum projeto encontrado. Ajuste os filtros ou crie um novo.
            </div>
          ) : null}
        </div>
      </IaMestreSubPageShell>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="border-border bg-card text-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-base">Novo projeto</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-[11px]">Nome</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} className="mt-1 h-9 text-[13px]" placeholder="Ex: Campanha verão" />
            </div>
            <div>
              <Label className="text-[11px]">Categoria</Label>
              <select
                value={newCat}
                onChange={(e) => setNewCat(e.target.value as ProjetoCategoria)}
                className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-[13px]"
              >
                <option value="Marketing">Marketing</option>
                <option value="Financeiro">Financeiro</option>
                <option value="OS">OS</option>
                <option value="Estoque">Estoque</option>
              </select>
            </div>
            <div>
              <Label className="text-[11px]">Descrição</Label>
              <Textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="mt-1 min-h-[72px] text-[13px]"
                placeholder="Resumo do objetivo do projeto..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={createProject} disabled={!newName.trim()}>
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent className="border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir projeto?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação remove o cartão do grid. Dados mock — sem impacto no servidor.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmDelete}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
