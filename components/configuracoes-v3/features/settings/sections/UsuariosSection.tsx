"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { SectionHeader } from "../components/SectionHeader";
import { SettingsCard } from "../components/SettingsCard";
import {
  Users,
  Plus,
  Shield,
  Pencil,
  UserX,
  Loader2,
  Copy,
  AlertCircle,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/configuracoes-v3/components/ui/button";
import { Badge } from "@/components/configuracoes-v3/components/ui/badge";
import { Input } from "@/components/configuracoes-v3/components/ui/input";
import { Label } from "@/components/configuracoes-v3/components/ui/label";
import { Skeleton } from "@/components/configuracoes-v3/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/configuracoes-v3/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/configuracoes-v3/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/configuracoes-v3/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/configuracoes-v3/components/ui/table";
import { useToast } from "@/components/configuracoes-v3/hooks/use-toast";
import { getEnterprisePermissions } from "@/lib/auth/enterprise-permissions";

type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  lojaId: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  storeIds: string[];
};

type StoreRow = { id: string; name?: string };

const ROLE_OPTIONS = [
  "SUPER_ADMIN",
  "ADMIN",
  "GERENTE",
  "OPERADOR",
  "CAIXA",
  "TECNICO",
  "VENDEDOR",
] as const;

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super administrador",
  ADMIN: "Administrador",
  GERENTE: "Gerente",
  OPERADOR: "Operador",
  CAIXA: "Caixa",
  TECNICO: "Técnico",
  VENDEDOR: "Vendedor",
};

const PAPEL_RESUMO = [
  {
    titulo: "Administrador",
    texto: "Acesso completo ao painel, unidades, configurações e gestão de utilizadores.",
  },
  {
    titulo: "Gerente",
    texto: "Gestão operacional e financeira, relatórios e equipa, sem promoção a administradores.",
  },
  {
    titulo: "Caixa",
    texto: "PDV, abertura e fecho de caixa, vendas e histórico de caixa nas unidades atribuídas.",
  },
  {
    titulo: "Técnico",
    texto: "Operações, ordens de serviço, checklist, garantia e retirada.",
  },
  {
    titulo: "Vendedor",
    texto: "Vendas, clientes e canais comerciais nas unidades permitidas.",
  },
];

function badgeVariantForRole(role: string): "default" | "secondary" | "outline" {
  if (role === "SUPER_ADMIN" || role === "ADMIN") return "default";
  if (role === "GERENTE") return "secondary";
  return "outline";
}

export function UsuariosSection() {
  const { data: session, status } = useSession();
  const { toast } = useToast();
  const canManage = useMemo(() => {
    if (status !== "authenticated" || !session?.user) return false;
    return getEnterprisePermissions(session.user.role).admin.configuracoes === true;
  }, [session, status]);

  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUserRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formRole, setFormRole] = useState<string>("VENDEDOR");
  const [formPassword, setFormPassword] = useState("");
  const [formStoreIds, setFormStoreIds] = useState<Set<string>>(new Set());
  const [hintPassword, setHintPassword] = useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<AdminUserRow | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  const load = useCallback(async () => {
    if (!canManage) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const [uRes, sRes] = await Promise.all([
        fetch("/api/admin/users", { credentials: "include", cache: "no-store" }),
        fetch("/api/stores", { credentials: "include", cache: "no-store" }),
      ]);
      const uJson = (await uRes.json().catch(() => ({}))) as { ok?: boolean; users?: AdminUserRow[]; error?: string };
      const sJson = (await sRes.json().catch(() => ({}))) as { stores?: StoreRow[] };
      if (!uRes.ok) {
        setLoadError(uJson.error || "Não foi possível carregar a lista de utilizadores.");
        setRows([]);
      } else {
        setRows(Array.isArray(uJson.users) ? uJson.users : []);
      }
      setStores(Array.isArray(sJson.stores) ? sJson.stores : []);
    } catch {
      setLoadError("Falha de rede ao carregar dados.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  useEffect(() => {
    void load();
  }, [load]);

  const storeLabel = useCallback(
    (id: string) => {
      const s = stores.find((x) => x.id === id);
      return (s?.name || "").trim() || id;
    },
    [stores],
  );

  const openCreate = () => {
    setEditing(null);
    setFormName("");
    setFormEmail("");
    setFormRole("VENDEDOR");
    setFormPassword("");
    setFormStoreIds(new Set());
    setHintPassword(null);
    setModalOpen(true);
  };

  const openEdit = (r: AdminUserRow) => {
    setEditing(r);
    setFormName(r.name);
    setFormEmail(r.email);
    setFormRole(r.role);
    setFormPassword("");
    setFormStoreIds(new Set(r.storeIds));
    setHintPassword(null);
    setModalOpen(true);
  };

  const toggleStore = (id: string) => {
    setFormStoreIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const isAdminLikeRole = formRole === "SUPER_ADMIN" || formRole === "ADMIN";

  const submit = async () => {
    if (!formName.trim()) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    if (!editing && !formEmail.trim()) {
      toast({ title: "E-mail obrigatório", variant: "destructive" });
      return;
    }
    if (!isAdminLikeRole && formStoreIds.size === 0) {
      toast({ title: "Unidades", description: "Selecione pelo menos uma unidade com acesso.", variant: "destructive" });
      return;
    }
    if (!editing && formPassword.trim() && formPassword.trim().length < 6) {
      toast({ title: "Senha", description: "Mínimo de 6 caracteres.", variant: "destructive" });
      return;
    }
    setSaving(true);
    setHintPassword(null);
    try {
      if (editing) {
        const body: Record<string, unknown> = {
          name: formName.trim(),
          role: formRole,
          allowedStoreIds: isAdminLikeRole ? [] : [...formStoreIds],
        };
        if (formPassword.trim()) body.password = formPassword.trim();
        const res = await fetch(`/api/admin/users/${encodeURIComponent(editing.id)}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok) throw new Error(j.error || "Falha ao guardar");
        toast({ title: "Utilizador atualizado" });
      } else {
        const res = await fetch("/api/admin/users", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formName.trim(),
            email: formEmail.trim().toLowerCase(),
            role: formRole,
            allowedStoreIds: isAdminLikeRole ? [] : [...formStoreIds],
            password: formPassword.trim() || undefined,
          }),
        });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          temporaryPassword?: string;
        };
        if (!res.ok) throw new Error(j.error || "Falha ao criar");
        if (j.temporaryPassword) setHintPassword(j.temporaryPassword);
        toast({ title: "Utilizador criado", description: j.temporaryPassword ? "Copie a senha temporária abaixo." : undefined });
      }
      setModalOpen(false);
      await load();
    } catch (e) {
      toast({
        title: "Erro",
        description: e instanceof Error ? e.message : "Operação falhou",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const activate = async (r: AdminUserRow) => {
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(r.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: true }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(j.error || "Falha ao reativar");
      toast({ title: "Conta reativada" });
      await load();
    } catch (e) {
      toast({
        title: "Erro",
        description: e instanceof Error ? e.message : "Falha ao reativar",
        variant: "destructive",
      });
    }
  };

  const confirmDeactivate = async () => {
    const r = deactivateTarget;
    if (!r) return;
    setDeactivating(true);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(r.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: false }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(j.error || "Falha ao desativar");
      toast({ title: "Conta desativada" });
      setDeactivateTarget(null);
      await load();
    } catch (e) {
      toast({
        title: "Erro",
        description: e instanceof Error ? e.message : "Falha ao desativar",
        variant: "destructive",
      });
    } finally {
      setDeactivating(false);
    }
  };

  const requestDeactivate = (r: AdminUserRow) => {
    if (r.id === session?.user?.id) {
      toast({ title: "Operação inválida", description: "Não pode desativar a sua própria sessão.", variant: "destructive" });
      return;
    }
    setDeactivateTarget(r);
  };

  const copyHint = async () => {
    if (!hintPassword) return;
    try {
      await navigator.clipboard.writeText(hintPassword);
      toast({ title: "Copiado" });
    } catch {
      toast({ title: "Não foi possível copiar", variant: "destructive" });
    }
  };

  if (status === "loading") {
    return (
      <div className="space-y-6">
        <SectionHeader icon={<Users className="h-5 w-5" />} title="Utilizadores e permissões" description="A carregar…" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="space-y-6">
        <SectionHeader
          icon={<Users className="h-5 w-5" />}
          title="Utilizadores e permissões"
          description="A gestão de contas do painel está disponível para administradores e gestores com acesso às configurações."
        />
        <SettingsCard title="Acesso restrito" description="Inicie sessão com uma conta autorizada para gerir utilizadores.">
          <div className="flex gap-3 rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            <AlertCircle className="h-5 w-5 shrink-0 text-amber-500" />
            <p>
              A sua sessão atual não inclui permissão para criar ou editar utilizadores do painel. Contacte um administrador
              se precisar de acesso.
            </p>
          </div>
        </SettingsCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={<Users className="h-5 w-5" />}
        title="Utilizadores e permissões"
        description="Gerir contas de acesso ao painel, papéis e unidades por utilizador."
        actions={
          <Button type="button" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Adicionar utilizador
          </Button>
        }
      />

      {hintPassword && (
        <SettingsCard title="Senha temporária" description="Guarde este valor — não será mostrado novamente.">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <code className="rounded-md bg-muted px-3 py-2 text-sm">{hintPassword}</code>
            <Button type="button" variant="outline" size="sm" onClick={() => void copyHint()}>
              <Copy className="mr-2 h-4 w-4" />
              Copiar
            </Button>
          </div>
        </SettingsCard>
      )}

      <SettingsCard
        title="Resumo dos papéis"
        description="Cada papel define o que o utilizador pode ver no menu e nas operações sensíveis."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PAPEL_RESUMO.map((p) => (
            <div key={p.titulo} className="flex items-start gap-3 rounded-lg border border-border bg-card-muted p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <Shield className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{p.titulo}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{p.texto}</p>
              </div>
            </div>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard title="Equipa do painel" description="Contas com login por e-mail e senha (NextAuth).">
        {loading ? (
          <div className="space-y-3 py-6">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : loadError ? (
          <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p>{loadError}</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
              <Users className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="text-base font-semibold text-foreground">Nenhum utilizador encontrado</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Ainda não existem contas além das predefinidas, ou a lista está vazia. Adicione o primeiro membro da equipa.
            </p>
            <Button type="button" onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Adicionar utilizador
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Papel</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Unidades</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{r.email}</TableCell>
                    <TableCell>
                      <Badge variant={badgeVariantForRole(r.role)}>{ROLE_LABEL[r.role] || r.role}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.active ? "outline" : "secondary"}>{r.active ? "Ativo" : "Inativo"}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[220px]">
                      {r.role === "SUPER_ADMIN" || r.role === "ADMIN" ? (
                        <span className="text-xs text-muted-foreground">Todas as unidades</span>
                      ) : r.storeIds.length === 0 ? (
                        <span className="text-xs text-muted-foreground">{r.lojaId ? storeLabel(r.lojaId) : "—"}</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {r.storeIds.map((id) => (
                            <Badge key={id} variant="outline" className="text-[10px] font-normal">
                              {storeLabel(id)}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button type="button" variant="ghost" size="icon" title="Editar" onClick={() => openEdit(r)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {r.active && r.id !== session?.user?.id && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            title="Desativar"
                            onClick={() => requestDeactivate(r)}
                          >
                            <UserX className="h-4 w-4" />
                          </Button>
                        )}
                        {!r.active && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            title="Reativar"
                            onClick={() => void activate(r)}
                          >
                            <UserCheck className="h-4 w-4 text-success" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SettingsCard>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto border-border bg-background sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar utilizador" : "Novo utilizador"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Atualize o nome, o papel, as unidades ou a senha. Deixe a senha em branco para não alterar."
                : "Preencha os dados e uma senha temporária. O utilizador poderá iniciar sessão no painel com o e-mail indicado."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Nome completo" />
            </div>
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                disabled={!!editing}
                placeholder="email@empresa.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Papel</Label>
              <Select value={formRole} onValueChange={setFormRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((role) => (
                    <SelectItem key={role} value={role}>
                      {ROLE_LABEL[role] || role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{editing ? "Nova senha (opcional)" : "Senha temporária (opcional)"}</Label>
              <Input
                type="password"
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                placeholder={editing ? "Deixe vazio para manter" : "Vazio = gerar automaticamente"}
                autoComplete="new-password"
              />
            </div>
            {!isAdminLikeRole && (
              <div className="space-y-2">
                <Label>Unidades com acesso</Label>
                <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-border p-3">
                  {stores.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nenhuma unidade listada.</p>
                  ) : (
                    stores.map((s) => (
                      <label key={s.id} className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-border"
                          checked={formStoreIds.has(s.id)}
                          onChange={() => toggleStore(s.id)}
                        />
                        <span>{(s.name || "").trim() || s.id}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            )}
            {isAdminLikeRole && (
              <p className="text-xs text-muted-foreground">
                Administradores têm acesso a todas as unidades. Não é necessário escolher lojas.
              </p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void submit()} disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "Guardar" : "Criar utilizador"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deactivateTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deactivating) setDeactivateTarget(null);
        }}
      >
        <AlertDialogContent className="border-border bg-background sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar utilizador?</AlertDialogTitle>
            <AlertDialogDescription>
              {deactivateTarget
                ? `A conta de ${deactivateTarget.name || deactivateTarget.email} deixará de iniciar sessão no painel. Pode reativar depois na mesma lista.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deactivating}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deactivating}
              onClick={(e) => {
                e.preventDefault();
                void confirmDeactivate();
              }}
            >
              {deactivating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  A desativar…
                </>
              ) : (
                "Desativar"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
