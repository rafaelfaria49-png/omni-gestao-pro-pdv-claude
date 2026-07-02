"use client"

import { useCallback, useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Hash, Pencil, Plus } from "lucide-react"
import { toast } from "sonner"
import { PremiumEmptyState } from "./agentic-ui"
import { PreviewDrawer } from "./whatsapp-preview-ui"

type WaQuickReply = {
  id: string
  shortcut: string
  title: string
  body: string
  category: string
  ativo: boolean
}

type FormState = { shortcut: string; title: string; body: string; category: string; ativo: boolean }

const EMPTY_FORM: FormState = { shortcut: "", title: "", body: "", category: "", ativo: true }

export function WhatsAppRespostasRapidasPanel({
  apiHeaders,
}: {
  apiHeaders: Record<string, string> | null
}) {
  const [replies, setReplies] = useState<WaQuickReply[]>([])
  const [loading, setLoading] = useState(true)
  const [drawer, setDrawer] = useState<{ mode: "new" | "edit"; reply?: WaQuickReply } | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!apiHeaders) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/whatsapp/quick-replies", { headers: apiHeaders })
      const data = (await res.json()) as { ok?: boolean; quickReplies?: WaQuickReply[] }
      if (data.ok && Array.isArray(data.quickReplies)) setReplies(data.quickReplies)
    } catch {
      /* keep previous */
    } finally {
      setLoading(false)
    }
  }, [apiHeaders])

  useEffect(() => {
    void load()
  }, [load])

  async function remove(id: string) {
    if (!apiHeaders) return
    const res = await fetch(`/api/whatsapp/quick-replies/${id}`, { method: "DELETE", headers: apiHeaders })
    if (res.ok) {
      setReplies((prev) => prev.filter((r) => r.id !== id))
      toast.success("Resposta rápida removida")
    } else {
      toast.error("Falha ao excluir resposta")
    }
  }

  if (!apiHeaders) {
    return <p className="p-6 text-sm text-muted-foreground">Selecione uma loja ativa.</p>
  }

  if (loading) {
    return (
      <div className="space-y-3 p-4 md:p-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="glass-card h-14 animate-pulse rounded-xl" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Respostas Rápidas</h2>
          <p className="text-sm text-muted-foreground">
            Mensagens prontas com atalho, usadas manualmente pelo atendente na Caixa de Entrada.
          </p>
        </div>
        <Button size="sm" onClick={() => setDrawer({ mode: "new" })}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Nova resposta rápida
        </Button>
      </div>

      {replies.length === 0 ? (
        <PremiumEmptyState
          icon={Hash}
          title="Nenhuma resposta rápida ainda"
          description="Crie atalhos para agilizar o atendimento manual (ex.: /garantia, /horario)."
        />
      ) : (
        <div className="glass-card overflow-hidden rounded-xl">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border/60 bg-muted/20 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Título / atalho</th>
                <th className="px-4 py-2.5 font-medium">Prévia</th>
                <th className="px-4 py-2.5 font-medium">Categoria</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {replies.map((r) => (
                <tr key={r.id} className="border-b border-border/40 last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{r.title}</p>
                    <code className="text-[11px] text-muted-foreground">/{r.shortcut.replace(/^\//, "")}</code>
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-xs text-muted-foreground">{r.body}</td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary" className="text-[10px]">{r.category || "Geral"}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={r.ativo ? "default" : "outline"} className="text-[10px]">
                      {r.ativo ? "Ativo" : "Inativo"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDrawer({ mode: "edit", reply: r })}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/20 p-3 text-[11px] leading-relaxed text-muted-foreground">
        💬 Respostas rápidas são usadas manualmente pelo atendente. Não disparam automações sozinhas. Ação
        real — criar, editar, ativar/inativar e excluir persistem de verdade.
      </p>

      {drawer && (
        <QuickReplyDrawer
          mode={drawer.mode}
          reply={drawer.reply}
          apiHeaders={apiHeaders}
          onClose={() => setDrawer(null)}
          onSaved={load}
          onRequestDelete={(id) => setDeleteId(id)}
        />
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover resposta rápida?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={async () => {
                if (deleteId) {
                  await remove(deleteId)
                  setDeleteId(null)
                  setDrawer(null)
                }
              }}
            >
              Remover
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function QuickReplyDrawer({
  mode,
  reply,
  apiHeaders,
  onClose,
  onSaved,
  onRequestDelete,
}: {
  mode: "new" | "edit"
  reply?: WaQuickReply
  apiHeaders: Record<string, string>
  onClose: () => void
  onSaved: () => void
  onRequestDelete: (id: string) => void
}) {
  const [form, setForm] = useState<FormState>(
    reply
      ? { shortcut: reply.shortcut, title: reply.title, body: reply.body, category: reply.category, ativo: reply.ativo }
      : EMPTY_FORM
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function save() {
    const shortcut = form.shortcut.replace(/^\//, "").trim()
    if (!shortcut) return setError("Atalho obrigatório.")
    if (!form.title.trim()) return setError("Título obrigatório.")
    if (!form.body.trim()) return setError("Mensagem obrigatória.")

    setSaving(true)
    setError("")
    try {
      const url = mode === "edit" && reply ? `/api/whatsapp/quick-replies/${reply.id}` : "/api/whatsapp/quick-replies"
      const method = mode === "edit" ? "PATCH" : "POST"
      const res = await fetch(url, {
        method,
        headers: apiHeaders,
        body: JSON.stringify({
          shortcut,
          title: form.title.trim(),
          body: form.body,
          category: form.category.trim(),
          ativo: form.ativo,
        }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        setError(data.error ?? "Erro ao salvar.")
        return
      }
      toast.success(mode === "edit" ? "Resposta atualizada" : "Resposta criada")
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <PreviewDrawer
      title={mode === "new" ? "Nova resposta rápida" : "Editar resposta rápida"}
      badge="Ação real"
      subtitle="Atalho reutilizável pelo atendente"
      onClose={onClose}
      footer={
        <>
          {mode === "edit" && reply && (
            <Button variant="outline" className="mr-auto text-destructive" onClick={() => onRequestDelete(reply.id)}>
              Excluir
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Salvando…" : mode === "new" ? "Criar resposta" : "Salvar alterações"}
          </Button>
        </>
      }
    >
      <p className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/20 p-3 text-[11px] leading-relaxed text-muted-foreground">
        💬 Usada manualmente pelo atendente. Não dispara automação — ação real, persiste ao salvar.
      </p>
      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-600">{error}</p>}
      <div className="space-y-1.5">
        <Label className="text-xs">Título</Label>
        <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Garantia" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Atalho</Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground">/</span>
          <Input
            className="pl-6 font-mono"
            value={form.shortcut.replace(/^\//, "")}
            onChange={(e) => setForm((f) => ({ ...f, shortcut: e.target.value.replace(/\s/g, "") }))}
            placeholder="garantia"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Categoria</Label>
        <Input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder="Geral, Assistência, Vendas, Pós-venda…" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Mensagem</Label>
        <Textarea rows={5} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
      </div>
      <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
        <div>
          <p className="text-sm font-medium">Ativa</p>
          <p className="text-[11px] text-muted-foreground">Disponível na lista de respostas rápidas.</p>
        </div>
        <Switch checked={form.ativo} onCheckedChange={(v) => setForm((f) => ({ ...f, ativo: v }))} />
      </div>
    </PreviewDrawer>
  )
}
