import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Crown,
  Briefcase,
  UserCog,
  MoreHorizontal,
  Users,
  KeyRound,
  UserMinus,
  Activity,
  Pencil,
  UserPlus,
  ClipboardList,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  Copy,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Store } from "./StoreList";
import { EmployeeAccessSheet } from "./EmployeeAccessSheet";
import { ActivityLog, type ActivityEntry } from "./ActivityLog";
import {
  generateAdminTempPassword,
  mapAdminUserToPanelMember,
  type PanelTeamMember,
} from "@/lib/master-console-team";

interface TeamPanelProps {
  store: Store;
  activity: ActivityEntry[];
  canManageTeam?: boolean;
  /** PATCH /api/admin/users/[id] com nova senha (Config → Utilizadores). */
  canResetPassword?: boolean;
}

function roleVisual(role: string): { className: string; icon: typeof Crown } {
  const r = role.toUpperCase();
  if (r === "SUPER_ADMIN" || r === "ADMIN") {
    return { className: "bg-purple/10 text-purple border-purple/20", icon: Crown };
  }
  if (r === "GERENTE") {
    return { className: "bg-info/10 text-info border-info/20", icon: Briefcase };
  }
  if (r === "VENDEDOR" || r === "CAIXA") {
    return { className: "bg-success/10 text-success border-success/20", icon: UserCog };
  }
  return { className: "bg-muted text-muted-foreground border-border", icon: UserCog };
}

export function TeamPanel({
  store,
  activity,
  canManageTeam = false,
  canResetPassword = false,
}: TeamPanelProps) {
  const { toast } = useToast();
  const [team, setTeam] = useState<PanelTeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedMember, setSelectedMember] = useState<PanelTeamMember | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<PanelTeamMember | null>(null);
  const [resetting, setResetting] = useState(false);
  const [issuedTempPassword, setIssuedTempPassword] = useState<string | null>(null);

  const loadTeam = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const r = await fetch(`/api/admin/users?storeId=${encodeURIComponent(store.id)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        users?: Array<{ id: string; name: string; email: string; role: string; active: boolean }>;
        error?: string;
      };
      if (!r.ok) {
        throw new Error(j.error || `Falha ao carregar (HTTP ${r.status})`);
      }
      setTeam((j.users ?? []).map(mapAdminUserToPanelMember));
    } catch (e) {
      setTeam([]);
      setLoadError(e instanceof Error ? e.message : "Falha ao carregar colaboradores");
    } finally {
      setLoading(false);
    }
  }, [store.id]);

  useEffect(() => {
    void loadTeam();
  }, [loadTeam]);

  function openProfile(member: PanelTeamMember) {
    setSelectedMember(member);
    setSheetOpen(true);
  }

  const confirmResetPassword = useCallback(async () => {
    if (!resetTarget) return;
    setResetting(true);
    setIssuedTempPassword(null);
    const temp = generateAdminTempPassword();
    try {
      const r = await fetch(`/api/admin/users/${encodeURIComponent(resetTarget.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: temp }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || j.ok !== true) {
        throw new Error(j.error || `Falha ao redefinir senha (HTTP ${r.status})`);
      }
      setIssuedTempPassword(temp);
      toast({
        title: "Senha redefinida",
        description: "Copie a senha temporária abaixo e entregue ao colaborador em canal seguro.",
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Não foi possível redefinir a senha",
        description: e instanceof Error ? e.message : "Erro inesperado",
      });
      setResetTarget(null);
    } finally {
      setResetting(false);
    }
  }, [resetTarget, toast]);

  return (
    <>
      <aside className="flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card animate-fade-in">
        <header className="border-b border-border px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Users className="h-3.5 w-3.5 shrink-0" />
            <span>Gestão da filial</span>
          </div>
          <h2 className="mt-1 text-lg font-bold tracking-tight text-foreground">{store.name}</h2>
          <p className="text-xs text-muted-foreground">{store.cnpj}</p>
          <p className="mt-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            Contas com acesso a esta unidade vêm de{" "}
            <Link
              href="/dashboard/configuracoes?sec=usuarios"
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              Configurações → Utilizadores
            </Link>
            .
          </p>
        </header>
        <Tabs defaultValue="team" className="flex flex-1 flex-col">
          <div className="px-6 pt-4">
            <TabsList className="grid w-full grid-cols-2 rounded-xl bg-panel p-1">
              <TabsTrigger
                value="team"
                className="rounded-lg text-xs font-semibold data-[state=active]:bg-card data-[state=active]:shadow-elegant"
              >
                <Users className="mr-1.5 h-3.5 w-3.5" />
                Colaboradores
              </TabsTrigger>
              <TabsTrigger
                value="logs"
                className="rounded-lg text-xs font-semibold data-[state=active]:bg-card data-[state=active]:shadow-elegant"
              >
                <Activity className="mr-1.5 h-3.5 w-3.5" />
                Logs de Atividade
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="team" className="flex-1 px-6 pb-6 pt-4 data-[state=inactive]:hidden">
            {canManageTeam ? (
              <Button size="sm" variant="outline" asChild className="mb-4 w-full rounded-xl border-dashed font-semibold">
                <Link href="/dashboard/configuracoes?sec=usuarios">
                  <Plus className="mr-1.5 h-4 w-4" />
                  Adicionar utilizador
                  <ExternalLink className="ml-2 h-3.5 w-3.5" />
                </Link>
              </Button>
            ) : null}

            {loading ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Carregando colaboradores…</p>
              </div>
            ) : loadError ? (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-8 text-center">
                <AlertTriangle className="h-6 w-6 text-destructive" />
                <p className="text-sm font-medium text-foreground">Não foi possível carregar a equipa</p>
                <p className="text-xs text-muted-foreground">{loadError}</p>
                <Button size="sm" variant="outline" onClick={() => void loadTeam()}>
                  Tentar novamente
                </Button>
              </div>
            ) : team.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-panel/30 py-10 text-center">
                <UserPlus className="h-8 w-8 text-muted-foreground/50" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">Nenhum colaborador nesta unidade</p>
                  <p className="mx-auto max-w-[220px] text-xs text-muted-foreground">
                    Atribua utilizadores à unidade em Configurações → Utilizadores.
                  </p>
                </div>
                {canManageTeam ? (
                  <Button size="sm" variant="outline" asChild className="rounded-xl text-xs">
                    <Link href="/dashboard/configuracoes?sec=usuarios">
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                      Abrir Utilizadores
                    </Link>
                  </Button>
                ) : null}
              </div>
            ) : (
              <ul className="space-y-2">
                {team.map((member) => {
                  const r = roleVisual(member.role);
                  const Icon = r.icon;
                  const inactive = !member.active;
                  return (
                    <li
                      key={member.id}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-xl border border-border bg-panel/50 p-3 transition-smooth hover:bg-panel hover:shadow-elegant",
                        inactive && "opacity-60",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => openProfile(member)}
                        className="absolute inset-0 rounded-xl cursor-pointer"
                        aria-label={`Ver detalhes de ${member.name}`}
                      />
                      <Avatar className="relative h-10 w-10 shrink-0 ring-2 ring-background">
                        <AvatarFallback className="bg-gradient-to-br from-info/30 to-purple/30 text-xs font-bold text-foreground">
                          {member.initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="relative min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">{member.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          <Badge
                            variant="outline"
                            className={cn("gap-1 px-1.5 py-0 text-[10px] font-semibold", r.className)}
                          >
                            <Icon className="h-2.5 w-2.5" />
                            {member.roleLabel}
                          </Badge>
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 text-[10px] font-medium",
                              inactive ? "text-muted-foreground" : "text-success",
                            )}
                          >
                            <span
                              className={cn(
                                "h-1.5 w-1.5 rounded-full",
                                inactive ? "bg-muted-foreground" : "bg-success",
                              )}
                            />
                            {inactive ? "Inativo" : "Ativo"}
                          </span>
                        </div>
                      </div>
                      {canManageTeam ? (
                        <div className="relative z-10 flex items-center gap-2">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-muted"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52 rounded-xl border-border bg-popover shadow-card">
                              <DropdownMenuItem asChild className="rounded-lg text-sm font-medium cursor-pointer">
                                <Link href="/dashboard/configuracoes?sec=usuarios">
                                  <Pencil className="mr-2 h-4 w-4 text-info" />
                                  Editar em Utilizadores
                                </Link>
                              </DropdownMenuItem>
                              {canResetPassword ? (
                                <DropdownMenuItem
                                  className="rounded-lg text-sm font-medium cursor-pointer"
                                  onClick={() => {
                                    setIssuedTempPassword(null);
                                    setResetTarget(member);
                                  }}
                                >
                                  <KeyRound className="mr-2 h-4 w-4 text-muted-foreground" />
                                  Redefinir senha
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem disabled className="rounded-lg text-sm font-medium opacity-60">
                                  <KeyRound className="mr-2 h-4 w-4 text-muted-foreground" />
                                  Redefinir senha
                                  <span className="ml-auto text-[10px] text-muted-foreground">Sem permissão</span>
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem disabled className="rounded-lg text-sm font-medium text-muted-foreground opacity-60">
                                <UserMinus className="mr-2 h-4 w-4" />
                                Inativar aqui
                                <span className="ml-auto text-[10px]">Use Utilizadores</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </TabsContent>
          <TabsContent value="logs" className="flex-1 px-6 pb-6 pt-4 data-[state=inactive]:hidden">
            {activity.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-panel/30 py-10 text-center">
                <ClipboardList className="h-8 w-8 text-muted-foreground/50" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">Nenhuma atividade registrada</p>
                  <p className="mx-auto max-w-[220px] text-xs text-muted-foreground">
                    Auditoria administrativa centralizada ainda não está disponível neste painel.
                  </p>
                  <Badge variant="secondary" className="mt-2 font-normal">
                    Em breve
                  </Badge>
                </div>
              </div>
            ) : (
              <ActivityLog entries={activity} />
            )}
          </TabsContent>
        </Tabs>
      </aside>
      <EmployeeAccessSheet member={selectedMember} open={sheetOpen} onOpenChange={setSheetOpen} />

      <AlertDialog
        open={resetTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setResetTarget(null);
            setIssuedTempPassword(null);
          }
        }}
      >
        <AlertDialogContent className="border-border bg-card sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {issuedTempPassword ? "Senha temporária gerada" : "Redefinir senha?"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-1 text-sm text-muted-foreground">
                {resetTarget && !issuedTempPassword ? (
                  <>
                    <p>
                      Será gerada uma senha temporária para{" "}
                      <span className="font-medium text-foreground">{resetTarget.name}</span> (
                      {resetTarget.email}). A alteração grava no NextAuth (
                      <code className="rounded bg-muted px-1 text-xs">admin_users</code>).
                    </p>
                    <p className="text-xs">O colaborador deve trocar a senha no próximo acesso.</p>
                  </>
                ) : null}
                {issuedTempPassword ? (
                  <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
                    <p className="text-xs font-medium text-foreground">Senha temporária (copie agora)</p>
                    <p className="mt-1 break-all font-mono text-sm text-foreground">{issuedTempPassword}</p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="mt-2 gap-1.5"
                      onClick={() => {
                        void navigator.clipboard.writeText(issuedTempPassword).then(
                          () => toast({ title: "Copiado" }),
                          () =>
                            toast({
                              variant: "destructive",
                              title: "Não foi possível copiar",
                            }),
                        );
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copiar
                    </Button>
                  </div>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {issuedTempPassword ? (
              <AlertDialogAction
                className="rounded-xl"
                onClick={() => {
                  setResetTarget(null);
                  setIssuedTempPassword(null);
                }}
              >
                Fechar
              </AlertDialogAction>
            ) : (
              <>
                <AlertDialogCancel className="rounded-xl" disabled={resetting}>
                  Cancelar
                </AlertDialogCancel>
                <AlertDialogAction
                  className="rounded-xl"
                  disabled={resetting}
                  onClick={(e) => {
                    e.preventDefault();
                    void confirmResetPassword();
                  }}
                >
                  {resetting ? "Gerando…" : "Confirmar"}
                </AlertDialogAction>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
