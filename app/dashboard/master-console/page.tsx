"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Store, Users, Wallet, RefreshCw, AlertTriangle, Plus, ShieldAlert } from "lucide-react";
import { MasterConsoleSkeleton } from "@/components/master-console/MasterConsoleSkeleton";
import { KpiCard } from "@/components/master-console/KpiCard";
import { StoreList, type Store as StoreType } from "@/components/master-console/StoreList";
import { TeamPanel } from "@/components/master-console/TeamPanel";
import { SupervisorPinCard } from "@/components/master-console/SupervisorPinCard";
import { Button } from "@/components/ui/button";
import { getPermissionsFromSession } from "@/lib/auth/enterprise-permissions";
import { isElevatedRole } from "@/lib/auth/admin-users-policy";
import { useToast } from "@/hooks/use-toast";
import { LEGACY_PRIMARY_STORE_ID } from "@/lib/store-defaults";

const MasterConsolePage = () => {
  const { data: session, status } = useSession();
  const { toast } = useToast();
  const [stores, setStores] = useState<StoreType[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("");
  const [userCount, setUserCount] = useState<number | null>(null);

  const perms = useMemo(() => getPermissionsFromSession(session ?? null), [session]);
  const canAccess = perms.admin.masterConsole;
  const canManageStores = isElevatedRole(session?.user?.role ?? "");

  const loadStores = useCallback(async () => {
    setLoading(true);
    setApiError(false);
    try {
      const res = await fetch("/api/stores", { credentials: "include", cache: "no-store" });
      if (res.status === 401 || res.status === 403) {
        setApiError(true);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        stores?: Array<{ id: string; name: string; cnpj?: string; address?: Record<string, string> }>;
      };
      const mapped: StoreType[] = (data.stores ?? []).map((s) => {
        const addr = s.address as Record<string, string> | null | undefined;
        const city =
          addr?.cidade && addr?.estado
            ? `${addr.cidade}, ${addr.estado}`
            : (addr?.cidade ?? "—");
        return {
          id: s.id,
          name: s.name || s.id,
          cnpj: s.cnpj || "—",
          manager: "—",
          status: "Ativa",
          city,
        };
      });
      setStores(mapped);
      setSelectedId((prev) => (mapped.find((s) => s.id === prev) ? prev : (mapped[0]?.id ?? "")));

      if (canManageStores) {
        try {
          const ur = await fetch("/api/admin/users", { credentials: "include", cache: "no-store" });
          if (ur.ok) {
            const uj = (await ur.json()) as { users?: unknown[] };
            setUserCount(Array.isArray(uj.users) ? uj.users.length : 0);
          } else {
            setUserCount(null);
          }
        } catch {
          setUserCount(null);
        }
      } else {
        setUserCount(null);
      }
    } catch {
      setApiError(true);
    } finally {
      setLoading(false);
    }
  }, [canManageStores]);

  useEffect(() => {
    if (status === "loading") return;
    if (!canAccess) {
      setLoading(false);
      return;
    }
    void loadStores();
  }, [status, canAccess, loadStores]);

  const handleDelete = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/stores/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true, storeId: id }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(payload.error || `Falha ao excluir (HTTP ${res.status})`);
      }
      await loadStores();
    },
    [loadStores],
  );

  const onDeleteError = useCallback(
    (message: string) => {
      toast({
        variant: "destructive",
        title: "Não foi possível excluir",
        description: message,
      });
    },
    [toast],
  );

  const selected = stores.find((s) => s.id === selectedId);

  if (status === "loading" || (canAccess && loading)) {
    return (
      <main className="mx-auto min-w-0 max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8 bg-background text-foreground">
        <MasterConsoleSkeleton />
      </main>
    );
  }

  if (!canAccess) {
    return (
      <main className="mx-auto max-w-[1600px] px-6 py-8 bg-background text-foreground">
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card px-8 py-16 text-center shadow-card">
          <ShieldAlert className="h-8 w-8 text-destructive" />
          <p className="font-semibold text-foreground">Acesso negado</p>
          <p className="max-w-md text-sm text-muted-foreground">
            O Master Console é restrito a administradores autorizados. Se precisar de acesso, contacte um
            super administrador.
          </p>
          <Button variant="outline" size="sm" asChild>
            <a href="/dashboard">Voltar ao painel</a>
          </Button>
        </div>
      </main>
    );
  }

  if (apiError) {
    return (
      <main className="mx-auto max-w-[1600px] px-6 py-8 bg-background text-foreground">
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-destructive/20 bg-destructive/5 px-8 py-16 text-center">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <p className="font-semibold text-foreground">Não foi possível carregar as lojas</p>
          <p className="text-sm text-muted-foreground">Seus dados estão seguros. Tente novamente.</p>
          <Button variant="outline" size="sm" onClick={() => void loadStores()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Tentar novamente
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1600px] px-6 py-8 animate-fade-in bg-background text-foreground">
      <div className="mb-8">
        <p className="text-sm font-medium text-muted-foreground">Visão geral</p>
        <h2 className="mt-1 text-3xl font-bold tracking-tight md:text-4xl text-foreground">
          Master Console
        </h2>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        <KpiCard
          label="Lojas Ativas"
          value={String(stores.length || 0)}
          trend={stores.length === 1 ? "Loja principal" : stores.length > 1 ? `${stores.length} unidades` : "Sem lojas"}
          icon={Store}
          tone="info"
        />
        <KpiCard
          label="Colaboradores"
          value={userCount === null ? "—" : String(userCount)}
          icon={Users}
          tone="purple"
          pending={userCount === null}
          trend={userCount === null ? undefined : `${userCount} conta${userCount === 1 ? "" : "s"} no painel`}
        />
        <KpiCard label="Faturamento Global" value="—" icon={Wallet} tone="success" highlight pending />
      </div>

      {stores.length === 0 ? (
        <div className="flex flex-col items-center gap-5 rounded-2xl border border-dashed border-border bg-card px-8 py-16 text-center shadow-card">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <Store className="h-7 w-7 text-primary/70" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-base font-semibold text-foreground">Configure sua primeira unidade</h3>
            <p className="max-w-sm text-sm text-muted-foreground">
              Cadastre sua loja principal para começar a usar vendas, financeiro, estoque e operações.
            </p>
          </div>
          {canManageStores ? (
            <Button size="sm" variant="outline" className="gap-2" asChild>
              <Link href="/dashboard/unidades">
                <Plus className="h-4 w-4" />
                Criar primeira unidade
              </Link>
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_400px]">
          <StoreList
            stores={stores}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onDelete={canManageStores ? handleDelete : undefined}
            onDeleteError={onDeleteError}
            canManage={canManageStores}
            primaryStoreId={LEGACY_PRIMARY_STORE_ID}
          />
          {selected && (
            <TeamPanel key={selected.id} store={selected} activity={[]} canManageTeam={canManageStores} />
          )}
        </div>
      )}

      {canManageStores ? (
        <div className="mt-8">
          <SupervisorPinCard />
        </div>
      ) : null}
    </main>
  );
};

export default MasterConsolePage;
