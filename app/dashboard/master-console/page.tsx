"use client";
import { useState, useEffect, useCallback } from "react";
import { Store, Users, Wallet, RefreshCw, AlertTriangle, Plus } from "lucide-react";
import { KpiCard } from "@/components/master-console/KpiCard";
import { StoreList, type Store as StoreType } from "@/components/master-console/StoreList";
import { TeamPanel } from "@/components/master-console/TeamPanel";
import { SupervisorPinCard } from "@/components/master-console/SupervisorPinCard";
import { Button } from "@/components/ui/button";

const MasterConsolePage = () => {
  const [stores, setStores] = useState<StoreType[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("");

  const loadStores = useCallback(async () => {
    setLoading(true);
    setApiError(false);
    try {
      const res = await fetch("/api/stores", { credentials: "include", cache: "no-store" });
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
    } catch {
      setApiError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStores();
  }, [loadStores]);

  const handleDelete = useCallback(
    async (id: string) => {
      await fetch(`/api/stores/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      await loadStores();
    },
    [loadStores],
  );

  const selected = stores.find((s) => s.id === selectedId);

  if (loading) {
    return (
      <main className="mx-auto max-w-[1600px] px-6 py-8 bg-background text-foreground">
        <div className="flex flex-col items-center gap-3 py-24 justify-center">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Carregando console…</p>
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
          <Button variant="outline" size="sm" onClick={loadStores}>
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
        <KpiCard label="Colaboradores" value="—" icon={Users} tone="purple" />
        <KpiCard label="Faturamento Global" value="—" icon={Wallet} tone="success" highlight />
      </div>

      {stores.length === 0 ? (
        /* ── Zero-stores onboarding ── */
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
          <Button size="sm" variant="outline" className="gap-2" onClick={() => {
            window.location.href = "/dashboard/unidades";
          }}>
            <Plus className="h-4 w-4" />
            Criar primeira unidade
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_400px]">
          <StoreList
            stores={stores}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onDelete={handleDelete}
          />
          {selected && (
            <TeamPanel key={selected.id} store={selected} employees={[]} activity={[]} />
          )}
        </div>
      )}

      <div className="mt-8">
        <SupervisorPinCard />
      </div>
    </main>
  );
};

export default MasterConsolePage;
