"use client"

import { useEffect, useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LayoutDashboard, List, Settings, Wallet, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FinanceDashboard } from "@/components/finance/FinanceDashboard"
import { TransactionsTable } from "@/components/finance/TransactionsTable"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"

type Account = { id: string; name: string; type: string; balance: number; active: boolean }
type Category = { id: string; name: string; type: string; color: string; icon: string }

function AccountsPanel({ onUpdated }: { onUpdated: () => void }) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ name: "", type: "cash" })
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch("/api/finance/accounts")
      const json = await res.json()
      if (json.ok) setAccounts(json.accounts as Account[])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  async function createAccount() {
    if (!form.name) { toast.error("Informe o nome"); return }
    setSaving(true)
    try {
      const res = await fetch("/api/finance/accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      toast.success("Conta criada!")
      setShowNew(false)
      setForm({ name: "", type: "cash" })
      void load()
      onUpdated()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro")
    } finally {
      setSaving(false)
    }
  }

  async function deactivate(id: string) {
    await fetch("/api/finance/accounts?id=" + id, { method: "DELETE" })
    void load()
    onUpdated()
  }

  const typeLabels: Record<string, string> = { cash: "Caixa", bank: "Banco", pix: "PIX", credit_card: "Cartão" }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Contas e carteiras</h3>
        <Button size="sm" className="h-8 gap-1 text-xs" onClick={() => setShowNew(true)}>
          <Plus className="h-3.5 w-3.5" /> Nova conta
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground uppercase tracking-wide">Nome</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground uppercase tracking-wide">Tipo</th>
              <th className="px-4 py-2.5 text-right font-medium text-muted-foreground uppercase tracking-wide">Saldo</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground uppercase tracking-wide">Status</th>
              <th className="w-10 px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">Carregando...</td></tr>
            ) : accounts.length === 0 ? (
              <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">Nenhuma conta cadastrada.</td></tr>
            ) : (
              accounts.map((a) => (
                <tr key={a.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="px-4 py-2.5 font-medium">{a.name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{typeLabels[a.type] ?? a.type}</td>
                  <td className={`px-4 py-2.5 text-right font-semibold ${a.balance < 0 ? "text-destructive" : "text-foreground"}`}>
                    {a.balance.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant="outline" className="text-[10px]">{a.active ? "Ativa" : "Inativa"}</Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    {a.active && (
                      <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground" onClick={() => void deactivate(a.id)}>
                        Desativar
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={showNew} onOpenChange={(v) => !v && setShowNew(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nova conta</DialogTitle>
            <DialogDescription>Cadastre caixa, banco, PIX ou cartão</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Nome *</Label>
              <Input className="h-8 text-xs" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Ex: Caixa loja, Banco Inter..." />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tipo *</Label>
              <Select value={form.type} onValueChange={(v) => setForm((p) => ({ ...p, type: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Caixa (dinheiro)</SelectItem>
                  <SelectItem value="bank">Conta bancária</SelectItem>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="credit_card">Cartão de crédito</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowNew(false)} disabled={saving}>Cancelar</Button>
            <Button size="sm" onClick={createAccount} disabled={saving}>{saving ? "Salvando..." : "Criar conta"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CategoriesPanel() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ name: "", type: "expense", color: "#6366f1", icon: "tag" })
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch("/api/finance/categories")
      const json = await res.json()
      if (json.ok) setCategories(json.categories as Category[])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  async function createCategory() {
    if (!form.name) { toast.error("Informe o nome"); return }
    setSaving(true)
    try {
      const res = await fetch("/api/finance/categories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      toast.success("Categoria criada!")
      setShowNew(false)
      setForm({ name: "", type: "expense", color: "#6366f1", icon: "tag" })
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro")
    } finally {
      setSaving(false)
    }
  }

  async function deleteCategory(id: string) {
    await fetch(`/api/finance/categories?id=${id}`, { method: "DELETE" })
    void load()
  }

  const incomeCategories = categories.filter((c) => c.type === "income")
  const expenseCategories = categories.filter((c) => c.type === "expense")

  function GroupList({ items, label }: { items: Category[]; label: string }) {
    return (
      <div>
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <div className="space-y-1.5">
          {items.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma categoria</p>
          ) : (
            items.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                  <span className="text-sm">{c.name}</span>
                </div>
                <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground hover:text-destructive" onClick={() => void deleteCategory(c.id)}>
                  Remover
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Categorias financeiras</h3>
        <Button size="sm" className="h-8 gap-1 text-xs" onClick={() => setShowNew(true)}>
          <Plus className="h-3.5 w-3.5" /> Nova categoria
        </Button>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Carregando...</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <GroupList items={incomeCategories} label="Receitas" />
          <GroupList items={expenseCategories} label="Despesas" />
        </div>
      )}

      <Dialog open={showNew} onOpenChange={(v) => !v && setShowNew(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nova categoria</DialogTitle>
            <DialogDescription>Organize seus lançamentos por categoria</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Nome *</Label>
              <Input className="h-8 text-xs" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Ex: Aluguel, Vendas..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Tipo *</Label>
                <Select value={form.type} onValueChange={(v) => setForm((p) => ({ ...p, type: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="income">Receita</SelectItem>
                    <SelectItem value="expense">Despesa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Cor</Label>
                <div className="flex items-center gap-2">
                  <input type="color" className="h-8 w-10 rounded border border-border cursor-pointer" value={form.color} onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))} />
                  <span className="text-xs text-muted-foreground">{form.color}</span>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowNew(false)} disabled={saving}>Cancelar</Button>
            <Button size="sm" onClick={createCategory} disabled={saving}>{saving ? "Salvando..." : "Criar categoria"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function FinancePage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    void fetch("/api/finance/accounts")
      .then((r) => r.json())
      .then((j) => { if (j.ok) setAccounts(j.accounts as Account[]) })
  }, [refreshKey])

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Financeiro</h1>
          <p className="text-sm text-muted-foreground">Controle financeiro completo da sua operação</p>
        </div>
      </div>

      <Tabs defaultValue="dashboard" className="space-y-5">
        <TabsList>
          <TabsTrigger value="dashboard" className="gap-1.5 text-xs">
            <LayoutDashboard className="h-3.5 w-3.5" /> Dashboard
          </TabsTrigger>
          <TabsTrigger value="transactions" className="gap-1.5 text-xs">
            <List className="h-3.5 w-3.5" /> Lançamentos
          </TabsTrigger>
          <TabsTrigger value="accounts" className="gap-1.5 text-xs">
            <Wallet className="h-3.5 w-3.5" /> Contas
          </TabsTrigger>
          <TabsTrigger value="categories" className="gap-1.5 text-xs">
            <Settings className="h-3.5 w-3.5" /> Categorias
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-0">
          <FinanceDashboard />
        </TabsContent>

        <TabsContent value="transactions" className="mt-0">
          {accounts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-10 text-center">
              <Wallet className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm font-medium">Nenhuma conta cadastrada</p>
              <p className="text-xs text-muted-foreground">Vá para a aba "Contas" e cadastre sua primeira carteira para lançar transações.</p>
            </div>
          ) : (
            <TransactionsTable accounts={accounts} />
          )}
        </TabsContent>

        <TabsContent value="accounts" className="mt-0">
          <AccountsPanel onUpdated={() => setRefreshKey((k) => k + 1)} />
        </TabsContent>

        <TabsContent value="categories" className="mt-0">
          <CategoriesPanel />
        </TabsContent>
      </Tabs>
    </div>
  )
}
